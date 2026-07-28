/**
 * arcade-crash.routes.ts — MORBIUS Arcade: Crash.
 *
 * Two play modes share one table and one provably-fair commitment scheme:
 *
 * Instant (Telegram Mini App — unchanged):
 *   POST /api/arcade/crash/play        — charge bet, roll, settle in one txn
 *
 * Live (web /crash — the ported prototype with a real mid-flight cashout):
 *   POST /api/arcade/crash/start       — debit bet, commit crash point, round goes 'active'
 *   POST /api/arcade/crash/cashout     — settle a flying round at the server-clock multiplier
 *   GET  /api/arcade/crash/round/:id   — poll: settles the round server-side once the curve
 *                                        passes the crash point, then reveals the outcome
 *
 * Shared:
 *   GET  /api/arcade/crash/info        — public bounds + house edge
 *   GET  /api/arcade/crash/history     — caller's settled rounds
 *   GET  /api/arcade/crash/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/crash/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/crash/verify/:id  — public provably-fair verification (settled only!)
 *
 * Live-round integrity rules:
 *   • The crash point is committed (server seed hashed) at /start and derived
 *     from the same HMAC pipeline as every arcade game. It is NEVER sent to
 *     the client while the round is active — /round/:id returns it only after
 *     settlement, and /verify 404s on active rounds (revealing the seed
 *     mid-flight would hand the player a perfect cashout).
 *   • All settlement compares the SERVER clock against `started_at` (also the
 *     app-server clock — one clock source). The client animation runs the
 *     identical curve, so displayed and paid multipliers agree to within
 *     network latency.
 *   • Every settle path locks the row (`FOR UPDATE`) and re-checks
 *     status='active' — cashout, poll, sweep, and a concurrent /start can
 *     never double-settle or double-pay.
 *   • Auth on /start, /cashout, /round, /history is Telegram initData or the
 *     SIWE morb_session cookie — same trust anchors as Limbo.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveCrash,
  resolveLiveCrash,
  crashPointFromFloat,
  crashMultiplierX100AtMs,
  CRASH_HOUSE_EDGE_BP,
  CRASH_MIN_CASHOUT_X100,
  CRASH_MAX_CASHOUT_X100,
} from '../services/arcade-crash';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeCrashRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

/** How often the background sweep settles overdue active rounds. */
const SWEEP_INTERVAL_MS = 30_000;

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

interface ActiveRoundRow {
  id: string;
  wallet_address: string;
  bet: string | number;
  auto_cashout_x100: number | null;
  crash_x100: number;
  started_at: Date;
}

export function registerArcadeCrashRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeCrashRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /** Caller's wallet: Telegram initData (Mini App) or the SIWE morb_session cookie (web /crash). */
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  /**
   * Settle one active round if its curve time is up. Runs in its own
   * transaction; locks the row and re-checks status so concurrent settle
   * paths are safe. Returns true when the round is settled afterwards.
   */
  async function settleRoundIfDue(roundId: string): Promise<boolean> {
    let settled = false;
    await dbService.withTransaction(async (client) => {
      const r = await client.query(
        `SELECT id, wallet_address, bet, auto_cashout_x100, crash_x100, started_at
           FROM arcade_crash_rounds
          WHERE id = $1 AND status = 'active'
          FOR UPDATE`,
        [roundId],
      );
      if (r.rows.length === 0) {
        settled = true; // already settled by another path
        return;
      }
      const row = r.rows[0] as ActiveRoundRow;
      const elapsedMs = Date.now() - new Date(row.started_at).getTime();
      const outcome = resolveLiveCrash(
        row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        Number(row.bet),
        Number(row.crash_x100),
        elapsedMs,
      );
      if (!outcome.settle) return;

      if (outcome.payout > 0) {
        await applyPokerChipDelta(
          client,
          row.wallet_address,
          BigInt(outcome.payout),
          'arcade_crash_payout',
          { type: 'arcade_crash', id: row.id },
        );
      }
      await client.query(
        `UPDATE arcade_crash_rounds
            SET status = 'settled', won = $2, cashout_x100 = $3, payout = $4, settled_at = $5
          WHERE id = $1`,
        [row.id, outcome.won, outcome.cashoutX100, outcome.payout, new Date()],
      );
      settled = true;
    });
    return settled;
  }

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/info
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('crash').min,
      maxBet: betLimits('crash').max,
      minCashoutX100: CRASH_MIN_CASHOUT_X100,
      maxCashoutX100: CRASH_MAX_CASHOUT_X100,
      houseEdgeBp: CRASH_HOUSE_EDGE_BP,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/play — instant settle (Telegram). Unchanged flow.
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('crash').min || bet > betLimits('crash').max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${betLimits('crash').min} and ${betLimits('crash').max} chips.`,
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
            error: `Auto-cashout must be between ${(CRASH_MIN_CASHOUT_X100 / 100).toFixed(2)}x and ${(CRASH_MAX_CASHOUT_X100 / 100).toFixed(2)}x.`,
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
      const result = resolveCrash(autoCashoutX100, bet, r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_crash_bet',
          { type: 'arcade_crash', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_crash_payout',
            { type: 'arcade_crash', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_crash_rounds
             (id, wallet_address, bet, auto_cashout_x100, crash_x100,
              cashout_x100, won, payout,
              server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
              status, settled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'settled', $14)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            autoCashoutX100,
            result.crashX100,
            result.cashoutX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            CRASH_HOUSE_EDGE_BP,
            new Date(),
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        autoCashoutX100,
        crashX100: result.crashX100,
        cashoutX100: result.cashoutX100,
        won: result.won,
        payout: result.payout,
        serverSeedHash,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-crash] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/start — begin a LIVE round.
  // Body: { bet, autoCashoutX100?, clientSeed?, initData? }
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('crash').min || bet > betLimits('crash').max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${betLimits('crash').min} and ${betLimits('crash').max} chips.`,
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
            error: `Auto-cashout must be between ${(CRASH_MIN_CASHOUT_X100 / 100).toFixed(2)}x and ${(CRASH_MAX_CASHOUT_X100 / 100).toFixed(2)}x.`,
          });
        }
      }

      // One active round per wallet: settle anything overdue first, then
      // reject if a round is genuinely still in flight.
      const actives = await pool.query(
        `SELECT id FROM arcade_crash_rounds WHERE wallet_address = $1 AND status = 'active'`,
        [wallet.toLowerCase()],
      );
      for (const a of actives.rows) {
        const done = await settleRoundIfDue(String(a.id));
        if (!done) {
          return res.status(409).json({ ok: false, error: 'You already have a round in flight.' });
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
      const startedAt = new Date();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_crash_bet',
          { type: 'arcade_crash', id: roundId },
        );
        await client.query(
          `INSERT INTO arcade_crash_rounds
             (id, wallet_address, bet, auto_cashout_x100, crash_x100,
              cashout_x100, won, payout,
              server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
              status, started_at)
           VALUES ($1, $2, $3, $4, $5, NULL, FALSE, 0, $6, $7, $8, $9, $10, 'active', $11)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            autoCashoutX100,
            crashX100,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            CRASH_HOUSE_EDGE_BP,
            startedAt,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        autoCashoutX100,
        serverSeedHash,
        startedAt: startedAt.getTime(),
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
  // POST /api/arcade/crash/cashout — settle a flying round at the server-clock
  // multiplier. Body: { roundId, initData? }
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/cashout', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'roundId is required.' });
      }

      let response:
        | { status: number; body: Record<string, unknown> }
        | null = null;

      await dbService.withTransaction(async (client: PoolClient) => {
        const r = await client.query(
          `SELECT id, wallet_address, bet, auto_cashout_x100, crash_x100, started_at
             FROM arcade_crash_rounds
            WHERE id = $1 AND wallet_address = $2 AND status = 'active'
            FOR UPDATE`,
          [roundId, wallet.toLowerCase()],
        );
        if (r.rows.length === 0) {
          response = { status: 404, body: { ok: false, error: 'No active round with that ID.' } };
          return;
        }
        const row = r.rows[0] as ActiveRoundRow;
        const bet = Number(row.bet);
        const autoX100 = row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null;
        const crashX100 = Number(row.crash_x100);
        const elapsedMs = Date.now() - new Date(row.started_at).getTime();

        // If the curve already passed the crash point (or the cap), the round
        // is over — apply the standard settle rule (an auto target ≤ crash
        // still wins; a manual press after the crash moment is a bust).
        const due = resolveLiveCrash(autoX100, bet, crashX100, elapsedMs);
        let won: boolean;
        let cashoutX100: number | null;
        let payout: number;
        if (due.settle) {
          ({ won, cashoutX100, payout } = due);
        } else {
          // Cashout mid-flight: lock the server-clock multiplier. If the
          // player set an auto target and the curve already crossed it, pay
          // exactly the promised target (the client fires this request the
          // moment its curve crosses the target — network latency must not
          // inflate the locked-in rate).
          won = true;
          cashoutX100 = Math.min(
            crashMultiplierX100AtMs(elapsedMs),
            autoX100 ?? CRASH_MAX_CASHOUT_X100,
            CRASH_MAX_CASHOUT_X100,
          );
          payout = Math.floor((bet * cashoutX100) / 100);
        }

        let chipBalance: bigint | null = null;
        if (payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            row.wallet_address,
            BigInt(payout),
            'arcade_crash_payout',
            { type: 'arcade_crash', id: row.id },
          );
        }
        await client.query(
          `UPDATE arcade_crash_rounds
              SET status = 'settled', won = $2, cashout_x100 = $3, payout = $4, settled_at = $5
            WHERE id = $1`,
          [row.id, won, cashoutX100, payout, new Date()],
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId: row.id,
            won,
            cashoutX100,
            crashX100,
            payout,
            chipBalance: chipBalance != null ? chipBalance.toString() : undefined,
          },
        };
      });

      if (!response) throw new Error('cashout produced no response');
      const { status, body } = response;
      return res.status(status).json(body);
    } catch (err) {
      logger.error('[arcade-crash] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/round/:id — round state for the owner. Settles the
  // round when it's due, and only reveals the crash point once settled.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/round/:id', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.params.id);

      // Settle first when due — the poll IS the settle trigger for connected clients.
      await settleRoundIfDue(roundId);

      const r = await pool.query(
        `SELECT id, bet, auto_cashout_x100, crash_x100, cashout_x100, won, payout,
                status, started_at, server_seed_hash
           FROM arcade_crash_rounds
          WHERE id = $1 AND wallet_address = $2`,
        [roundId, wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.json({
          ok: true,
          roundId: row.id,
          status: 'active',
          startedAt: new Date(row.started_at).getTime(),
          serverSeedHash: row.server_seed_hash,
        });
      }
      return res.json({
        ok: true,
        roundId: row.id,
        status: 'settled',
        bet: Number(row.bet),
        autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        crashX100: Number(row.crash_x100),
        cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
      });
    } catch (err) {
      logger.error('[arcade-crash] round state failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/history — caller's settled rounds.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, auto_cashout_x100, crash_x100, cashout_x100, won, payout, created_at
           FROM arcade_crash_rounds
          WHERE wallet_address = $1 AND status = 'settled'
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          bet: Number(row.bet),
          autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
          crashX100: Number(row.crash_x100),
          cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-crash] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/recent — public. Latest settled rounds, all players.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, crash_x100, cashout_x100, won, payout, created_at
           FROM arcade_crash_rounds
          WHERE status = 'settled'
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          wallet: row.wallet_address,
          bet: Number(row.bet),
          crashX100: Number(row.crash_x100),
          cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-crash] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/leaderboard — public. All-time top players by net.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_crash_rounds
          WHERE status = 'settled'
          GROUP BY wallet_address
          ORDER BY SUM(payout) - SUM(bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          rounds: Number(row.rounds),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-crash] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/verify/:id — public, SETTLED rounds only. Revealing
  // the seed for an active round would reveal the crash point mid-flight.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, auto_cashout_x100, crash_x100, cashout_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                status, created_at
           FROM arcade_crash_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        crashX100: Number(row.crash_x100),
        cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
        won: row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          'crashX100 = max(100, floor(((1 - houseEdgeBp/10000) / r) * 100)). ' +
          'Live rounds: cashout multiplier is the curve value at the server-received ' +
          'cashout time and wins when the round had not yet reached crashX100.',
      });
    } catch (err) {
      logger.error('[arcade-crash] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Sweep: settle overdue active rounds even if the client vanished — auto
  // cashout wins are credited, busts are closed out. No-op for rounds whose
  // curve hasn't reached the crash point yet.
  // ---------------------------------------------------------------------------
  const sweep = setInterval(async () => {
    try {
      const r = await pool.query(
        `SELECT id FROM arcade_crash_rounds WHERE status = 'active' LIMIT 200`,
      );
      for (const row of r.rows) {
        await settleRoundIfDue(String(row.id));
      }
    } catch (err) {
      logger.error('[arcade-crash] sweep failed', { error: (err as Error)?.message });
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  logger.info('[arcade-crash] routes registered (instant + live)');
}
