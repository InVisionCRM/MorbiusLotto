/**
 * arcade-crash.routes.ts — MORBIUS Arcade: Crash (stateful).
 *
 * Endpoints:
 *   GET  /api/arcade/crash/info        — public: bet/cashout bounds + growth constant
 *   POST /api/arcade/crash/start       — charge bet, commit crash point, return startedAt
 *   POST /api/arcade/crash/cashout     — server computes elapsed → determine win/lose
 *   POST /api/arcade/crash/state       — recover active round on page reload
 *   GET  /api/arcade/crash/verify/:id  — public: seeds + recipe (crash_x100 hidden while active)
 *
 * Flow:
 *   /start   → INSERT status='active', debit bet, return {roundId, serverSeedHash, startedAt}
 *   /cashout → SELECT FOR UPDATE; compute elapsed = NOW - started_at;
 *              currentX100 = multiplierX100AtMs(elapsed);
 *              if currentX100 >= crash_x100 → status='crashed', no payout
 *              else                         → status='cashed_out', credit payout at currentX100
 *
 * The crash point is never sent to the client while status='active'. On
 * finalize (cashout or crash), server_seed is revealed so anyone can verify.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  CRASH_HOUSE_EDGE_BP,
  CRASH_GROWTH_K,
  CRASH_MIN_BET,
  CRASH_MAX_BET,
  CRASH_MIN_CASHOUT_X100,
  CRASH_MAX_CASHOUT_X100,
  crashPointFromFloat,
  multiplierX100AtMs,
  crashPayout,
} from '../services/arcade-crash';
import type { DatabaseService } from '../services/database.service';

interface RegisterArcadeCrashRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const pf = new ProvablyFairService();

async function walletFromInitData(
  dbService: DatabaseService,
  initData: unknown,
): Promise<string | null> {
  if (typeof initData !== 'string') return null;
  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser) return null;
  const r = await dbService
    .getPool()
    .query('SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1', [tgUser.id]);
  return r.rows.length > 0 ? String(r.rows[0].wallet_address) : null;
}

async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, bet, crash_x100, auto_cashout_x100, cashout_x100,
            status, payout, server_seed, server_seed_hash, client_seed,
            nonce, house_edge_bp, started_at, finalized_at
       FROM arcade_crash_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

/**
 * Settle a round that has been abandoned (tab closed) — called lazily when
 * the wallet tries to start a new round or checks state. If the crash already
 * happened according to server time, mark it crashed now so the unique active
 * index clears and the player can start fresh.
 */
async function settleAbandonedRound(
  client: PoolClient,
  row: Record<string, unknown>,
): Promise<void> {
  const elapsedMs = Date.now() - new Date(row.started_at as string).getTime();
  const currentX100 = multiplierX100AtMs(elapsedMs);
  const crashX100 = Number(row.crash_x100);
  if (currentX100 >= crashX100) {
    await client.query(
      `UPDATE arcade_crash_rounds
         SET status = 'crashed', finalized_at = NOW()
       WHERE id = $1`,
      [row.id],
    );
  }
}

export function registerArcadeCrashRoutes({
  app,
  dbService,
}: RegisterArcadeCrashRoutesOptions): void {
  const pool = dbService.getPool();

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/info
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: CRASH_MIN_BET,
      maxBet: CRASH_MAX_BET,
      minCashoutX100: CRASH_MIN_CASHOUT_X100,
      maxCashoutX100: CRASH_MAX_CASHOUT_X100,
      houseEdgeBp: CRASH_HOUSE_EDGE_BP,
      growthK: CRASH_GROWTH_K,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/start
  // Debits the bet, commits the crash point (only hash sent to client),
  // records started_at, returns the round id + startedAt for client sync.
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/start', async (req: Request, res: Response) => {
    try {
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < CRASH_MIN_BET || bet > CRASH_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${CRASH_MIN_BET} and ${CRASH_MAX_BET} chips.`,
        });
      }

      let autoCashoutX100: number | null = null;
      if (req.body?.autoCashoutX100 != null) {
        autoCashoutX100 = Math.floor(Number(req.body.autoCashoutX100));
        if (
          !Number.isFinite(autoCashoutX100) ||
          autoCashoutX100 < CRASH_MIN_CASHOUT_X100 ||
          autoCashoutX100 > CRASH_MAX_CASHOUT_X100
        ) {
          return res.status(400).json({
            ok: false,
            error: `Auto-cashout must be between ${(CRASH_MIN_CASHOUT_X100 / 100).toFixed(2)}× and ${(CRASH_MAX_CASHOUT_X100 / 100).toFixed(0)}×.`,
          });
        }
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const crashX100 = crashPointFromFloat(r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let startedAt: string = '';

      try {
        await dbService.withTransaction(async (client) => {
          // Lazily settle any abandoned active round first so the unique index
          // doesn't block this new start.
          const existing = await client.query(
            `SELECT id, crash_x100, started_at
               FROM arcade_crash_rounds
              WHERE wallet_address = $1 AND status = 'active'
              FOR UPDATE`,
            [wallet.toLowerCase()],
          );
          if (existing.rows.length > 0) {
            await settleAbandonedRound(client, existing.rows[0] as Record<string, unknown>);
            // Re-check — if crash hasn't happened yet the round is still active.
            const recheckRow = await client.query(
              `SELECT status FROM arcade_crash_rounds WHERE id = $1`,
              [existing.rows[0].id],
            );
            if (recheckRow.rows[0]?.status === 'active') {
              throw new Error('active_round_exists');
            }
          }

          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_crash_bet',
            { type: 'arcade_crash', id: roundId },
          );

          const insertResult = await client.query(
            `INSERT INTO arcade_crash_rounds
               (id, wallet_address, bet, crash_x100, auto_cashout_x100,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING started_at`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              crashX100,
              autoCashoutX100,
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              CRASH_HOUSE_EDGE_BP,
            ],
          );
          startedAt = (insertResult.rows[0] as { started_at: string }).started_at;
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (msg === 'active_round_exists') {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Crash round in progress.',
          });
        }
        if (/uniq_arcade_crash_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Crash round in progress.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        autoCashoutX100,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: CRASH_HOUSE_EDGE_BP,
        growthK: CRASH_GROWTH_K,
        startedAt,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-crash] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/cashout
  // Player requests cashout. Server computes elapsed = NOW − started_at,
  // then derives the authoritative multiplier from that elapsed time.
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/cashout', async (req: Request, res: Response) => {
    try {
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Missing roundId.' });
      }

      let response: { status: number; body: Record<string, unknown> } | null = null;

      await dbService.withTransaction(async (client: import('pg').PoolClient) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if ((row.wallet_address as string).toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = {
            status: 409,
            body: { ok: false, error: 'Round already finalized.', status: row.status },
          };
          return;
        }

        // Server-authoritative elapsed time and multiplier.
        const elapsedMs = Date.now() - new Date(row.started_at as string).getTime();
        const currentX100 = multiplierX100AtMs(elapsedMs);
        const crashX100 = Number(row.crash_x100);
        const bet = Number(row.bet);

        if (currentX100 >= crashX100) {
          // Cashout arrived after the crash — the player loses.
          await client.query(
            `UPDATE arcade_crash_rounds
               SET status = 'crashed', finalized_at = NOW()
             WHERE id = $1`,
            [roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              won: false,
              crashX100,
              elapsedMs,
              serverSeed: row.server_seed,
              chipBalance: null,
            },
          };
          return;
        }

        // Cashout is valid — credit the payout.
        const payout = crashPayout(bet, currentX100);
        await client.query(
          `UPDATE arcade_crash_rounds
             SET status = 'cashed_out', cashout_x100 = $1, payout = $2, finalized_at = NOW()
           WHERE id = $3`,
          [currentX100, payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_crash_payout',
          { type: 'arcade_crash', id: roundId },
        );
        response = {
          status: 200,
          body: {
            ok: true,
            won: true,
            cashoutX100: currentX100,
            crashX100,
            payout,
            elapsedMs,
            serverSeed: row.server_seed,
            chipBalance: newBalance.toString(),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not process cashout.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-crash] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not process cashout.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/state
  // Called on page reload to recover an active round. Also lazily settles
  // abandoned rounds (crash already happened but player never called /cashout).
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/state', async (req: Request, res: Response) => {
    try {
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const r = await pool.query(
        `SELECT id, bet, crash_x100, auto_cashout_x100, cashout_x100, status,
                payout, server_seed, server_seed_hash, client_seed, nonce,
                house_edge_bp, started_at, finalized_at
           FROM arcade_crash_rounds
          WHERE wallet_address = $1 AND status = 'active'
          LIMIT 1`,
        [wallet.toLowerCase()],
      );

      if (r.rows.length === 0) {
        return res.json({ ok: true, hasActiveRound: false });
      }

      const row = r.rows[0] as Record<string, unknown>;
      const elapsedMs = Date.now() - new Date(row.started_at as string).getTime();
      const currentX100 = multiplierX100AtMs(elapsedMs);
      const crashX100 = Number(row.crash_x100);

      // Lazily settle if crash has already happened.
      if (currentX100 >= crashX100) {
        await pool.query(
          `UPDATE arcade_crash_rounds SET status = 'crashed', finalized_at = NOW() WHERE id = $1`,
          [row.id],
        );
        return res.json({
          ok: true,
          hasActiveRound: false,
          settled: { won: false, crashX100, serverSeed: row.server_seed },
        });
      }

      return res.json({
        ok: true,
        hasActiveRound: true,
        roundId: row.id,
        bet: Number(row.bet),
        autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        serverSeedHash: row.server_seed_hash,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        growthK: CRASH_GROWTH_K,
        startedAt: row.started_at,
        elapsedMs,
        currentX100,
      });
    } catch (err) {
      logger.error('[arcade-crash] state failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not fetch round state.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/verify/:id
  // crash_x100 and server_seed are only returned after the round is finalized.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, crash_x100, auto_cashout_x100, cashout_x100, status, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                started_at, finalized_at, created_at
           FROM arcade_crash_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0] as Record<string, unknown>;
      const finalized = row.status !== 'active';
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        crashX100: finalized ? Number(row.crash_x100) : null,
        cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
        status: row.status,
        won: row.status === 'cashed_out',
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: finalized ? row.server_seed : null,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        growthK: CRASH_GROWTH_K,
        startedAt: row.started_at,
        finalizedAt: row.finalized_at,
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          'crashX100 = max(100, floor(((1 - houseEdgeBp/10000) / r) * 100)). ' +
          'multiplierX100(ms) = max(100, floor(100 * exp(growthK * ms / 1000))) ' +
          'where growthK = ln(2)/3 ≈ 0.2310 (doubles every 3 seconds).',
      });
    } catch (err) {
      logger.error('[arcade-crash] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-crash] routes registered');
}
