/**
 * wheel.routes.ts — Daily Wish Wheel.
 *
 * Endpoints:
 *   GET  /api/wheel/segments              — public: segment config (labels, weights, prizes)
 *   GET  /api/wheel/balance               — auth: current spins_available
 *   GET  /api/wheel/ledger                — auth: paginated ledger entries
 *   POST /api/wheel/commit                — auth: create/return pending commitment
 *   POST /api/wheel/spin                  — auth: consume commitment, derive outcome, payout
 *   GET  /api/wheel/verify/:id            — public: returns commit + revealed seed
 *
 * Seed-handling pattern follows poker_hand_pending_seeds — the plaintext
 * serverSeed lives in wheel_pending_seeds while the spin is pending and is
 * copied to wheel_spins.server_seed (and deleted from pending) at settle.
 * That keeps the unsettled outcome unreadable by anyone with DB read access.
 */

import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { logger } from '../utils/logger';
import {
  applyWheelSpinDelta,
  getWheelBalance,
} from '../services/wheel-spin-wallet';
import {
  loadSegments,
  newCommitment,
  generateClientSeed,
  deriveSegment,
  verifyCommitment,
} from '../services/wheel-spin-engine';

interface RegisterWheelRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

export function registerWheelRoutes({ app, dbService, authService }: RegisterWheelRoutesOptions): void {
  const pool = dbService.getPool();

  // ---------------------------------------------------------------------------
  // GET /api/wheel/segments — public. Visual layout + payouts so the client can
  // render labels and the post-spin prize modal from a single source of truth.
  // ---------------------------------------------------------------------------
  app.get('/api/wheel/segments', async (_req: Request, res: Response) => {
    try {
      const segments = await loadSegments(pool);
      res.json({
        ok: true,
        segments: segments.map((s) => ({
          index: s.index,
          value: s.value,
          label: s.label,
          weight: s.weight,
          prize_wei: s.prize_wei,
          free_spins: s.free_spins,
        })),
      });
    } catch (e) {
      logger.error('wheel.segments failed', { error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/wheel/balance — auth. Just the current spin count.
  // ---------------------------------------------------------------------------
  app.get('/api/wheel/balance', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    try {
      const balance = await getWheelBalance(pool, addr);
      res.json({ ok: true, address: addr, spinsAvailable: balance });
    } catch (e) {
      logger.error('wheel.balance failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/wheel/ledger — auth. Recent grants/spends for the history UI.
  // ---------------------------------------------------------------------------
  app.get('/api/wheel/ledger', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, delta, reason, balance_after, ref_type, ref_id, metadata, created_at
           FROM wheel_spin_ledger
          WHERE wallet_address = $1
          ORDER BY id DESC
          LIMIT $2`,
        [addr, limit],
      );
      res.json({ ok: true, entries: r.rows });
    } catch (e) {
      logger.error('wheel.ledger failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/wheel/commit — auth. Returns the existing pending commitment if
  // there is one, otherwise creates a fresh seed + hash and stores it.
  // The plaintext seed never goes back to the client until /spin settles it.
  // ---------------------------------------------------------------------------
  app.post('/api/wheel/commit', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT id, server_seed_commit, client_seed, nonce
           FROM wheel_spins
          WHERE wallet_address = $1 AND status = 'pending'
          ORDER BY id DESC LIMIT 1`,
        [addr],
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        const row = existing.rows[0];
        return res.json({
          ok: true,
          spinId: String(row.id),
          serverSeedHash: row.server_seed_commit,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        });
      }
      const { serverSeed, serverSeedHash } = newCommitment();
      const clientSeed = generateClientSeed();
      const ins = await client.query<{ id: string }>(
        `INSERT INTO wheel_spins
           (wallet_address, segment_index, prize_value, server_seed_commit, client_seed, nonce, status)
         VALUES ($1, -1, 'PENDING', $2, $3, 0, 'pending')
         RETURNING id`,
        [addr, serverSeedHash, clientSeed],
      );
      const spinId = ins.rows[0].id;
      await client.query(
        `INSERT INTO wheel_pending_seeds (spin_id, server_seed) VALUES ($1, $2)`,
        [spinId, serverSeed],
      );
      await client.query('COMMIT');
      res.json({
        ok: true,
        spinId: String(spinId),
        serverSeedHash,
        clientSeed,
        nonce: 0,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('wheel.commit failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/wheel/spin — auth. Consumes the pending commitment:
  //   1. Debit 1 spin from wheel_spin_wallets (idempotent on spin_id).
  //   2. Derive segment via PF.
  //   3. Credit prize MORBIUS to players.balance, FREE_SPIN to wheel balance.
  //   4. Reveal serverSeed into wheel_spins, drop wheel_pending_seeds row.
  // All inside a single transaction; on failure the spin debit rolls back.
  // ---------------------------------------------------------------------------
  app.post('/api/wheel/spin', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    const spinId = String(req.body?.spinId ?? '').trim();
    if (!spinId || !/^[0-9]+$/.test(spinId)) {
      return res.status(400).json({ error: 'spinId required (numeric)' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pendingRes = await client.query<{
        id: string;
        server_seed_commit: string;
        client_seed: string;
        nonce: string;
        status: string;
      }>(
        `SELECT id, server_seed_commit, client_seed, nonce, status
           FROM wheel_spins
          WHERE id = $1 AND wallet_address = $2
          FOR UPDATE`,
        [spinId, addr],
      );
      if (pendingRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'spin not found' });
      }
      const pending = pendingRes.rows[0];
      if (pending.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'spin already settled', code: 'ALREADY_SETTLED' });
      }

      const seedRes = await client.query<{ server_seed: string }>(
        `SELECT server_seed FROM wheel_pending_seeds WHERE spin_id = $1`,
        [spinId],
      );
      if (seedRes.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.error('wheel.spin missing pending seed row', { addr, spinId });
        return res.status(500).json({ error: 'commitment seed missing' });
      }
      const serverSeed = seedRes.rows[0].server_seed;
      if (!verifyCommitment(serverSeed, pending.server_seed_commit)) {
        await client.query('ROLLBACK');
        logger.error('wheel.spin commit hash mismatch', { addr, spinId });
        return res.status(500).json({ error: 'commit hash mismatch' });
      }

      // Debit one spin. Throws inside the txn if balance insufficient; we catch
      // and return 402 without poisoning the connection.
      try {
        await applyWheelSpinDelta(
          client,
          addr,
          -1,
          'wheel_spin',
          { type: 'wheel_spin', id: spinId },
          { spin_id: spinId },
        );
      } catch (debitErr) {
        await client.query('ROLLBACK');
        const msg = (debitErr as Error).message || 'debit failed';
        if (msg.includes('Insufficient')) {
          return res.status(402).json({ error: 'insufficient spins', code: 'NO_SPINS' });
        }
        logger.error('wheel.spin debit failed', { addr, spinId, error: msg });
        return res.status(500).json({ error: 'internal error' });
      }

      const segments = await loadSegments(client);
      const outcome = deriveSegment(
        serverSeed,
        pending.client_seed,
        Number(pending.nonce),
        segments,
      );

      if (outcome.prizeWei > 0n) {
        await client.query(
          `INSERT INTO players (wallet_address) VALUES ($1)
             ON CONFLICT (wallet_address) DO NOTHING`,
          [addr],
        );
        await client.query(
          `UPDATE players
              SET balance = balance + $2::NUMERIC, updated_at = NOW()
            WHERE LOWER(wallet_address) = LOWER($1)`,
          [addr, outcome.prizeWei.toString()],
        );
      }

      if (outcome.freeSpins > 0) {
        await applyWheelSpinDelta(
          client,
          addr,
          outcome.freeSpins,
          'free_spin_reward',
          { type: 'wheel_spin', id: `${spinId}:free` },
          { spin_id: spinId },
        );
      }

      await client.query(
        `UPDATE wheel_spins
            SET segment_index = $2,
                prize_value   = $3,
                prize_morbius = $4::NUMERIC,
                server_seed   = $5,
                status        = 'settled',
                settled_at    = NOW()
          WHERE id = $1`,
        [spinId, outcome.segmentIndex, outcome.segment.value, outcome.prizeWei.toString(), serverSeed],
      );
      await client.query(`DELETE FROM wheel_pending_seeds WHERE spin_id = $1`, [spinId]);

      await client.query('COMMIT');

      const balance = await getWheelBalance(pool, addr);
      res.json({
        ok: true,
        spinId,
        segmentIndex: outcome.segmentIndex,
        segment: { value: outcome.segment.value, label: outcome.segment.label },
        prizeWei: outcome.prizeWei.toString(),
        freeSpins: outcome.freeSpins,
        serverSeed,
        serverSeedHash: pending.server_seed_commit,
        clientSeed: pending.client_seed,
        nonce: Number(pending.nonce),
        spinsAvailable: balance,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('wheel.spin failed', { addr, spinId, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/wheel/verify/:id — public. Anyone can audit a settled spin.
  // ---------------------------------------------------------------------------
  app.get('/api/wheel/verify/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (!/^[0-9]+$/.test(id)) return res.status(400).json({ error: 'numeric id required' });
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, segment_index, prize_value, prize_morbius::text AS prize_morbius,
                server_seed_commit, server_seed, client_seed, nonce, status, created_at, settled_at
           FROM wheel_spins
          WHERE id = $1`,
        [id],
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
      const row = r.rows[0];
      if (row.status !== 'settled') return res.status(409).json({ error: 'not yet settled' });
      res.json({
        ok: true,
        spinId: String(row.id),
        wallet: row.wallet_address,
        segmentIndex: row.segment_index,
        prizeValue: row.prize_value,
        prizeWei: row.prize_morbius,
        serverSeed: row.server_seed,
        serverSeedHash: row.server_seed_commit,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        hashMatches: verifyCommitment(row.server_seed, row.server_seed_commit),
        createdAt: row.created_at,
        settledAt: row.settled_at,
      });
    } catch (e) {
      logger.error('wheel.verify failed', { id, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });
}
