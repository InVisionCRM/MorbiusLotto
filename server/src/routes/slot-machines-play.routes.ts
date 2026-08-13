/**
 * slot-machines-play.routes.ts — server-authoritative play for community slot
 * machines (Phase 1: integer play credits; Phase 3 re-denominates to PRC-20).
 *
 *   GET  /api/slot-machines/:slug/session        — auth: balance, bet steps, seed commitment
 *   POST /api/slot-machines/:slug/spin           — auth: debit, roll, settle in one txn
 *   POST /api/slot-machines/:slug/session/reset  — auth: refill play credits when broke
 *   GET  /api/slot-machines/spins/:id/verify     — public: provably-fair recipe
 *
 * The roll uses the wallet's shared arcade seed pair (arcade_seed_pairs) — the
 * same commitment that covers Dice/Limbo/etc. — consumed at a sequential nonce
 * inside the same transaction as the debit, exactly like arcade-limbo.routes.ts.
 * The spin itself runs in lib/community-slot-spin.ts through the vendored
 * cabinet-math, so what the server pays is what the builder's math says.
 *
 * Play is allowed on published machines for everyone, and on the owner's own
 * drafts (so a creator can test-drive before publishing).
 */

import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import type { DatabaseService, CommunitySlotMachine } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import { executeSpin, betStepsFor, startingBalanceFor } from '../lib/community-slot-spin';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterSlotMachinePlayRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

interface SessionRow {
  id: string;
  balance: number;
  feature_state: Record<string, unknown>;
}

export function registerSlotMachinePlayRoutes({ app, dbService, authService }: RegisterSlotMachinePlayRoutesOptions): void {
  const pool = dbService.getPool();

  const spinLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 90,
    message: 'Too many spins from this IP, slow down.',
    validate: { xForwardedForHeader: false },
  });
  const sessionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: 'Too many requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  /** Published for everyone; drafts playable by their owner only. */
  async function playableMachine(slug: string, wallet: string): Promise<CommunitySlotMachine | null> {
    const m = await dbService.getSlotMachineBySlug(slug);
    if (!m) return null;
    if (m.status === 'published') return m;
    if (m.status === 'draft' && m.owner_address.toLowerCase() === wallet.toLowerCase()) return m;
    return null;
  }

  /** Lock (or lazily create) the caller's session row inside an open transaction. */
  async function lockSession(client: PoolClient, machine: CommunitySlotMachine, wallet: string): Promise<SessionRow> {
    const w = wallet.toLowerCase();
    await client.query(
      `INSERT INTO community_slot_sessions (machine_id, player_address, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (machine_id, player_address) DO NOTHING`,
      [machine.id, w, startingBalanceFor(machine.machine_def)],
    );
    const r = await client.query(
      `SELECT id, balance, feature_state FROM community_slot_sessions
       WHERE machine_id = $1 AND player_address = $2
       FOR UPDATE`,
      [machine.id, w],
    );
    const row = r.rows[0];
    return {
      id: String(row.id),
      balance: Number(row.balance),
      feature_state: (row.feature_state ?? {}) as Record<string, unknown>,
    };
  }

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/:slug/session — bootstrap for server play.
  // ---------------------------------------------------------------------
  app.get(
    '/api/slot-machines/:slug/session',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });

        const session = await dbService.withTransaction((client) => lockSession(client, machine, wallet));
        const { minBet, steps } = betStepsFor(machine.machine_def);
        return sendJson(res, {
          ok: true,
          balance: session.balance,
          minBet,
          betSteps: steps,
          winCapX: machine.win_cap_x,
          currency: 'CREDITS',
          machine: { name: machine.name, status: machine.status, defVersion: machine.def_version },
        });
      } catch (error) {
        logger.error('[SlotPlay] session failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/spin — the round: debit, roll, settle.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/spin',
    spinLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });

        const { minBet, steps } = betStepsFor(machine.machine_def);
        const maxBet = steps[steps.length - 1];
        const bet = Math.floor(Number(req.body?.bet));
        if (!Number.isFinite(bet) || bet < minBet || bet > maxBet) {
          return res.status(400).json({ ok: false, error: `Bet must be between ${minBet} and ${maxBet} credits.` });
        }

        const spinId = crypto.randomUUID();
        const outcome = await dbService.withTransaction(async (client) => {
          const session = await lockSession(client, machine, wallet);
          if (session.balance < bet) {
            const err = new Error('INSUFFICIENT_BALANCE');
            (err as any).code = 'INSUFFICIENT_BALANCE';
            throw err;
          }

          // Seed consumption shares the transaction with the debit, so the
          // nonce advances iff the bet is actually recorded.
          const seed = await consumeSeedForBet(client, wallet);

          // Snapshot the pre-spin feature state for the verify recipe —
          // executeSpin mutates both the def clone and the feature state.
          const featureStateBefore = JSON.stringify(session.feature_state);
          const def = JSON.parse(JSON.stringify(machine.machine_def));
          const exec = executeSpin(def, bet, machine.win_cap_x, seed, session.feature_state);

          const newBalance = session.balance - bet + exec.payout;
          await client.query(
            `UPDATE community_slot_sessions
             SET balance = $2, feature_state = $3::jsonb, updated_at = NOW()
             WHERE id = $1`,
            [session.id, newBalance, JSON.stringify(session.feature_state)],
          );

          await client.query(
            `INSERT INTO community_slot_spins
               (id, machine_id, session_id, player_address, bet, payout, base_payout,
                bonus_kind, bonus_payout, scatter, chain, slam,
                seed_pair_id, server_seed_hash, client_seed, nonce, draws, def_version,
                feature_state_before)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
            [spinId, machine.id, session.id, wallet.toLowerCase(), bet, exec.payout, exec.basePayout,
              exec.bonus ? exec.bonus.kind : null, exec.bonusPayout,
              exec.res.scatter, exec.res.chain, exec.res.slam,
              seed.seedPairId, seed.serverSeedHash, seed.clientSeed, seed.nonce, exec.draws,
              machine.def_version, featureStateBefore],
          );

          return { exec, seed, newBalance };
        });

        return sendJson(res, {
          ok: true,
          spinId,
          res: outcome.exec.res,
          basePayout: outcome.exec.basePayout,
          bonus: outcome.exec.bonus,
          payout: outcome.exec.payout,
          capped: outcome.exec.capped,
          balance: outcome.newBalance,
          seed: {
            serverSeedHash: outcome.seed.serverSeedHash,
            clientSeed: outcome.seed.clientSeed,
            nonce: outcome.seed.nonce,
          },
        });
      } catch (err) {
        if ((err as any)?.code === 'INSUFFICIENT_BALANCE') {
          return res.status(400).json({ ok: false, error: 'Not enough credits for that bet.' });
        }
        logger.error('[SlotPlay] spin failed', { error: (err as Error)?.message });
        return res.status(500).json({ ok: false, error: 'Could not play the spin.' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/session/reset — refill when broke.
  // Play credits only; Phase 3 replaces this with real deposits.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/session/reset',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
        const { minBet } = betStepsFor(machine.machine_def);
        const refill = startingBalanceFor(machine.machine_def);

        const balance = await dbService.withTransaction(async (client) => {
          const session = await lockSession(client, machine, wallet);
          if (session.balance >= minBet) return session.balance; // not broke — no refill
          await client.query(
            `UPDATE community_slot_sessions SET balance = $2, updated_at = NOW() WHERE id = $1`,
            [session.id, refill],
          );
          return refill;
        });
        return sendJson(res, { ok: true, balance });
      } catch (error) {
        logger.error('[SlotPlay] reset failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/spins/:id/verify — public provably-fair recipe.
  // ---------------------------------------------------------------------
  app.get('/api/slot-machines/spins/:id/verify', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT s.*, d.machine_def
           FROM community_slot_spins s
           JOIN community_slot_machine_defs d
             ON d.machine_id = s.machine_id AND d.version = s.def_version
          WHERE s.id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Spin not found.' });
      const row = r.rows[0];
      const reveal = await revealedSeedForRound(pool, row.seed_pair_id ?? null, null);

      // The def drives the math; symbol art is presentation and can be huge
      // (inline data: URIs), so it is stripped from the verify payload.
      const def = row.machine_def as any;
      if (Array.isArray(def?.symbols)) {
        def.symbols = def.symbols.map((s: any) => { const { art: _art, ...rest } = s; return rest; });
      }

      return sendJson(res, {
        ok: true,
        spinId: row.id,
        bet: Number(row.bet),
        payout: Number(row.payout),
        basePayout: Number(row.base_payout),
        bonusKind: row.bonus_kind,
        bonusPayout: Number(row.bonus_payout),
        scatter: Number(row.scatter),
        chain: Number(row.chain),
        slam: Number(row.slam),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        draws: Number(row.draws),
        defVersion: Number(row.def_version),
        def,
        featureStateBefore: row.feature_state_before ?? {},
        createdAt: row.created_at,
        recipe:
          'float(i) = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, i*4)) for i = 0..draws-1. ' +
          'Run cabinet-math (public/slots/cabinet-math.js) against the def with that stream: ' +
          'stops = drawStops(rng, buildStrips(def)); grid = windowAt(stops, strips, def.rows); ' +
          'res = resolveSpin(def, strips, grid, rng, featureStateBefore); payout = round(payoutOf(def, bet, res)); ' +
          'a triggered bonus continues drawing from the same stream (free spins re-run the same recipe with fresh state; ' +
          'wheel takes one float over weights [22,20,16,14,10,9,6,3]; pick Fisher-Yates shuffles [1,1,2,2,3,3,4,5,6,8,10,15]). ' +
          'The serverSeedHash was committed before the bet; rotate your arcade seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[SlotPlay] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the spin.' });
    }
  });

  logger.info('[SlotPlay] routes registered');
}
