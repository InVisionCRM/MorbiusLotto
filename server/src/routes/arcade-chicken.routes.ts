/**
 * arcade-chicken.routes.ts — MORBIUS Arcade: Chicken.
 *
 * Endpoints (web /chicken + Telegram Mini App):
 *   GET  /api/arcade/chicken/info        — public: bounds + difficulties + ladders
 *   POST /api/arcade/chicken/start       — charge bet, seal every lane, return id
 *   POST /api/arcade/chicken/step        — cross the next lane
 *                                          (safe → advance; bumper → reveal + settle)
 *   POST /api/arcade/chicken/cashout     — bank the current multiplier as a payout
 *   GET  /api/arcade/chicken/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/chicken/history     — caller's settled rounds
 *   GET  /api/arcade/chicken/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/chicken/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/chicken/verify/:id  — public: seeds + bumper lanes (settled ONLY)
 *
 * Stateful flow mirrors Towers/Mines: /start INSERTs status='active' and debits
 * the bet; /step UPDATEs lane + multiplier or settles (bumper → won=false; final
 * lane → auto-settle won=true and credit); /cashout pays out and settles
 * won=true. The server seed AND the bumper lanes are only revealed when the
 * round is settled — an active round never leaks either.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round (debit → steps → settle) is wrapped in row-level locking so a
 * double-tap can't double-spend or double-pay. The
 * `uniq_arcade_chicken_active_per_wallet` partial unique index also guarantees
 * one active round per wallet at a time at the DB level.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  CHICKEN_DIFFICULTIES,
  CHICKEN_HOUSE_EDGE_BP,
  CHICKEN_MAX_BET,
  CHICKEN_MIN_BET,
  chickenMultiplierLadder,
  chickenPayout,
  deriveChickenBumpers,
  isChickenDifficulty,
  type ChickenDifficulty,
} from '../services/arcade-chicken';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeChickenRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

/** Resolve the wallet linked to a Telegram `initData` payload, or null. */
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

/** SELECT … FOR UPDATE the round row inside an open transaction. */
async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, bet, difficulty, lane, bumper_lanes,
            multiplier_x100, status, won, payout, server_seed, server_seed_hash,
            client_seed, nonce, house_edge_bp
       FROM arcade_chicken_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeChickenRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeChickenRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /chicken). Telegram wins when both are present.
   */
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/info — public bounds + the full ladder for every
  // difficulty. difficulties[d].ladder[L] is the ×100 multiplier after L
  // crossed lanes (index 0 = 100).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/info', (_req: Request, res: Response) => {
    const difficulties: Record<
      string,
      { lanes: number; outcomes: number; bumpers: number; ladder: number[] }
    > = {};
    for (const d of Object.keys(CHICKEN_DIFFICULTIES) as ChickenDifficulty[]) {
      difficulties[d] = { ...CHICKEN_DIFFICULTIES[d], ladder: chickenMultiplierLadder(d) };
    }
    res.json({
      ok: true,
      minBet: CHICKEN_MIN_BET,
      maxBet: CHICKEN_MAX_BET,
      houseEdgeBp: CHICKEN_HOUSE_EDGE_BP,
      difficulties,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/active — the wallet's active round (if any). Used
  // by the client on mount so a partly-crossed road survives a page refresh.
  // Never includes the bumper lanes or any seed material beyond the public
  // commitment hash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, difficulty, lane, multiplier_x100, server_seed_hash
           FROM arcade_chicken_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const difficulty = row.difficulty as ChickenDifficulty;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          difficulty,
          lane: Number(row.lane),
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          lanes: CHICKEN_DIFFICULTIES[difficulty].lanes,
          ladder: chickenMultiplierLadder(difficulty),
        },
      });
    } catch (err) {
      logger.error('[arcade-chicken] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/chicken/start — debit the bet, seal the lanes, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/chicken/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < CHICKEN_MIN_BET || bet > CHICKEN_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${CHICKEN_MIN_BET} and ${CHICKEN_MAX_BET} chips.`,
        });
      }

      const difficulty = req.body?.difficulty;
      if (!isChickenDifficulty(difficulty)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Difficulty must be easy, medium or hard.' });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Every lane is rolled here, before the first step, behind the committed
      // hash — they never move and never leave the server while the round is
      // active.
      const bumperLanes = deriveChickenBumpers(
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
        difficulty,
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_chicken_bet',
            { type: 'arcade_chicken', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_chicken_rounds
               (id, wallet_address, bet, difficulty, lane, bumper_lanes,
                multiplier_x100, status, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb,
                     100, 'active', FALSE, 0,
                     $6, $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              difficulty,
              JSON.stringify(bumperLanes),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              CHICKEN_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_chicken_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Chicken round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        difficulty,
        lanes: CHICKEN_DIFFICULTIES[difficulty].lanes,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: CHICKEN_HOUSE_EDGE_BP,
        ladder: chickenMultiplierLadder(difficulty),
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-chicken] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/chicken/step — cross the next lane.
  // Safe → advance (the final lane auto-settles as a win and credits the
  // payout); bumper → reveal the full road + server seed, settle as a loss.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/chicken/step', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = {
            status: 409,
            body: { ok: false, error: 'Round already settled.', status: row.status },
          };
          return;
        }

        const difficulty = row.difficulty as ChickenDifficulty;
        const { lanes } = CHICKEN_DIFFICULTIES[difficulty];
        const laneNow = Number(row.lane);
        const bumperLanes: number[] = Array.isArray(row.bumper_lanes) ? row.bumper_lanes : [];
        const isBumper = bumperLanes.includes(laneNow);

        if (isBumper) {
          // Settle as a bust. No payout; the bumper lanes and the server seed
          // are now public so the round is verifiable.
          await client.query(
            `UPDATE arcade_chicken_rounds
               SET status = 'settled', won = FALSE, settled_at = NOW()
             WHERE id = $1`,
            [roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: false,
              settled: true,
              won: false,
              lane: laneNow,
              bumperLanes,
              status: 'settled',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        const newLane = laneNow + 1;
        const ladder = chickenMultiplierLadder(difficulty);
        const newMultiplierX100 = ladder[newLane];

        if (newLane >= lanes) {
          // Full crossing — auto-settle as a win and credit the top of the ladder.
          const payout = chickenPayout(Number(row.bet), newMultiplierX100);
          await client.query(
            `UPDATE arcade_chicken_rounds
               SET lane = $1,
                   multiplier_x100 = $2,
                   status = 'settled',
                   won = TRUE,
                   payout = $3,
                   settled_at = NOW()
             WHERE id = $4`,
            [newLane, newMultiplierX100, payout, roundId],
          );
          const newBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_chicken_payout',
            { type: 'arcade_chicken', id: roundId },
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: true,
              settled: true,
              won: true,
              lane: newLane,
              multiplierX100: newMultiplierX100,
              payout,
              bumperLanes,
              status: 'settled',
              serverSeed: row.server_seed,
              chipBalance: newBalance.toString(),
            },
          };
          return;
        }

        await client.query(
          `UPDATE arcade_chicken_rounds
             SET lane = $1, multiplier_x100 = $2
           WHERE id = $3`,
          [newLane, newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            settled: false,
            lane: newLane,
            multiplierX100: newMultiplierX100,
            // Hint: payout if the player cashes out right now.
            cashoutPayout: Math.floor((Number(row.bet) * newMultiplierX100) / 100),
            lanesRemaining: lanes - newLane,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not take the step.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-chicken] step failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not take the step.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/chicken/cashout — bank the current multiplier as a payout.
  // Must be called while status='active' AND at least one lane crossed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/chicken/cashout', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = {
            status: 409,
            body: { ok: false, error: 'Round already settled.', status: row.status },
          };
          return;
        }

        const laneNow = Number(row.lane);
        if (laneNow < 1) {
          response = {
            status: 400,
            body: { ok: false, error: 'Cross at least one lane before cashing out.' },
          };
          return;
        }

        const payout = chickenPayout(Number(row.bet), Number(row.multiplier_x100));
        await client.query(
          `UPDATE arcade_chicken_rounds
             SET status = 'settled', won = TRUE, payout = $1, settled_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_chicken_payout',
          { type: 'arcade_chicken', id: roundId },
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            lane: laneNow,
            multiplierX100: Number(row.multiplier_x100),
            payout,
            bumperLanes: row.bumper_lanes,
            status: 'settled',
            won: true,
            serverSeed: row.server_seed,
            chipBalance: newBalance.toString(),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-chicken] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/history — caller's settled rounds for the web panel.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, difficulty, lane, multiplier_x100, won, payout, created_at
           FROM arcade_chicken_rounds
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
          difficulty: row.difficulty,
          lane: Number(row.lane),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-chicken] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, difficulty, lane, multiplier_x100, won, payout,
                created_at
           FROM arcade_chicken_rounds
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
          difficulty: row.difficulty,
          lane: Number(row.lane),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-chicken] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_chicken_rounds
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
      logger.error('[arcade-chicken] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/chicken/verify/:id — public, settled rounds ONLY. Returns
  // the seeds + the bumper lanes + the recipe so anyone can independently
  // recompute every lane and confirm the road was fixed at /start (matching
  // `serverSeedHash`) and never moved. An ACTIVE round 404s.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/chicken/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, difficulty, lane, bumper_lanes, multiplier_x100,
                status, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, house_edge_bp, created_at, settled_at
           FROM arcade_chicken_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const difficulty = row.difficulty as ChickenDifficulty;
      const { lanes, outcomes, bumpers } = CHICKEN_DIFFICULTIES[difficulty];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        difficulty,
        lanes,
        outcomes,
        bumpers,
        lane: Number(row.lane),
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        bumperLanes: row.bumper_lanes,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          `For lane L in [0..${lanes - 1}]: ` +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, L*4); ' +
          'r = bytesToFloat(bytes); lane L is a bumper iff ' +
          `floor(r * ${outcomes}) < ${bumpers} (P = ${bumpers}/${outcomes} on ${difficulty}). ` +
          `Ladder: m[0] = 100; m[L] = floor(m[L-1] * ${outcomes} * (10000 - houseEdgeBp) / ` +
          `(10000 * (${outcomes} - ${bumpers}))). Payout on win = floor(bet * m[lane] / 100).`,
      });
    } catch (err) {
      logger.error('[arcade-chicken] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-chicken] routes registered');
}
