/**
 * arcade-greed-dice.routes.ts — MORBIUS Arcade: Greed Dice (Farkle).
 *
 * Endpoints (web /greed-dice + Telegram Mini App):
 *   GET  /api/arcade/greed-dice/info        — public: bounds + volatility configs
 *   POST /api/arcade/greed-dice/start       — charge bet, seal seed, roll the
 *                                             starting dice (farkle → settle loss)
 *   POST /api/arcade/greed-dice/roll        — bank the auto-scoring dice + reroll
 *                                             the rest (farkle → settle loss;
 *                                             hot dice → reroll the full set)
 *   POST /api/arcade/greed-dice/bank        — cash out the current multiplier (win)
 *   GET  /api/arcade/greed-dice/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/greed-dice/history     — caller's settled rounds
 *   GET  /api/arcade/greed-dice/recent      — public: latest settled rounds
 *   GET  /api/arcade/greed-dice/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/greed-dice/verify/:id  — public: seeds + roll log (settled ONLY)
 *
 * Stateful flow mirrors Chicken/Towers: /start INSERTs status='active', debits
 * the bet and performs the first roll; /roll banks scoring dice + rerolls (or
 * settles on a farkle); /bank settles won=true and credits the payout. Every die
 * face is drawn from the committed server seed's HMAC byte stream at a
 * deterministic cursor = (dice rolled so far) × 4, so the entire turn re-derives
 * in /verify. The server seed is only revealed when the round is settled.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round is wrapped in row-level locking so a double-tap can't double-spend
 * or double-pay. `uniq_arcade_greed_dice_active_per_wallet` enforces one active
 * round per wallet at the DB level.
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
  GREED_DICE_MIN_BET,
  GREED_DICE_MAX_BET,
  GREED_DICE_VOLATILITIES,
  GREED_DICE_VOLATILITY_ORDER,
  isGreedDiceVolatility,
  scoreGreedDiceRoll,
  greedDiceMultiplierX100,
  greedDicePayout,
  drawGreedDiceFaces,
  totalDiceRolled,
  type GreedDiceVolatility,
  type GreedDiceRollLogEntry,
} from '../services/arcade-greed-dice';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeGreedDiceRoutesOptions {
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
    `SELECT id, wallet_address, bet, volatility, dice_count, points,
            multiplier_x100, roll_log, status, won, payout, server_seed,
            server_seed_hash, client_seed, nonce
       FROM arcade_greed_dice_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

/** Build the deterministic die-face drawer for a sealed round. */
function makeFaceDrawer(serverSeed: string, clientSeed: string, nonce: number) {
  return (startCursor: number, count: number) =>
    drawGreedDiceFaces(
      (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
      (b) => pf.bytesToFloat(b),
      startCursor,
      count,
    );
}

export function registerArcadeGreedDiceRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeGreedDiceRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/info — public bounds + volatility configs so the
  // UI always renders the same numbers (dice count + scale) the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/info', (_req: Request, res: Response) => {
    const volatilities: Record<string, { n: number; scale: number }> = {};
    for (const v of GREED_DICE_VOLATILITY_ORDER) {
      volatilities[v] = { ...GREED_DICE_VOLATILITIES[v] };
    }
    res.json({
      ok: true,
      minBet: GREED_DICE_MIN_BET,
      maxBet: GREED_DICE_MAX_BET,
      volatilities,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/active — the wallet's active round (if any), so a
  // partly-played turn survives a page refresh. Never includes the server seed
  // beyond the commitment hash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, volatility, dice_count, points, multiplier_x100, roll_log,
                server_seed_hash, client_seed, nonce
           FROM arcade_greed_dice_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const rollLog: GreedDiceRollLogEntry[] = Array.isArray(row.roll_log) ? row.roll_log : [];
      const lastRoll = rollLog[rollLog.length - 1] ?? null;
      const volatility = row.volatility as GreedDiceVolatility;
      // Remaining dice for the next reroll: full set after hot dice, else the
      // leftover (non-scoring) dice of the last roll.
      const remaining = lastRoll
        ? lastRoll.hot
          ? row.dice_count
          : lastRoll.dice.length - lastRoll.kept.length
        : row.dice_count;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          volatility,
          diceCount: Number(row.dice_count),
          points: Number(row.points),
          multiplierX100: Number(row.multiplier_x100),
          remaining,
          lastRoll,
          rollCount: rollLog.length,
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        },
      });
    } catch (err) {
      logger.error('[arcade-greed-dice] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/greed-dice/start — debit the bet, seal the seed, roll the
  // starting dice. A starting roll that scores nothing FARKLEs immediately
  // (settled, won=false, payout=0); otherwise the round stays active with the
  // first points banked.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/greed-dice/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < GREED_DICE_MIN_BET || bet > GREED_DICE_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${GREED_DICE_MIN_BET} and ${GREED_DICE_MAX_BET} chips.`,
        });
      }

      const volatility = req.body?.volatility;
      if (!isGreedDiceVolatility(volatility)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Volatility must be five, six or seven.' });
      }
      const { n: diceCount } = GREED_DICE_VOLATILITIES[volatility];

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Roll the starting dice from the sealed stream (cursor 0).
      const draw = makeFaceDrawer(serverSeed, clientSeed, nonce);
      const dice = draw(0, diceCount);
      const sc = scoreGreedDiceRoll(dice);
      const farkle = sc.points === 0;
      const points = farkle ? 0 : sc.points;
      const rollLog: GreedDiceRollLogEntry[] = [
        { dice, kept: sc.kept, points: sc.points, hot: sc.hot },
      ];
      const multiplierX100 = farkle ? 0 : greedDiceMultiplierX100(points, volatility);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_greed_dice_bet',
            { type: 'arcade_greed_dice', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_greed_dice_rounds
               (id, wallet_address, bet, volatility, dice_count, points,
                multiplier_x100, roll_log, status, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, settled_at)
             VALUES ($1, $2, $3, $4, $5, $6,
                     $7, $8::jsonb, $9, FALSE, 0,
                     $10, $11, $12, $13, $14)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              volatility,
              diceCount,
              points,
              multiplierX100,
              JSON.stringify(rollLog),
              farkle ? 'settled' : 'active',
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              farkle ? new Date() : null,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_greed_dice_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Greed Dice turn — bank or finish it first.',
          });
        }
        throw err;
      }

      // Remaining dice for the next reroll: full set after hot dice, else leftovers.
      const remaining = sc.hot ? diceCount : dice.length - sc.kept.length;
      return res.json({
        ok: true,
        roundId,
        bet,
        volatility,
        diceCount,
        dice,
        kept: sc.kept,
        rollPoints: sc.points,
        hot: sc.hot,
        farkle,
        points,
        multiplierX100,
        remaining,
        status: farkle ? 'settled' : 'active',
        ...(farkle ? { serverSeed } : {}),
        serverSeedHash,
        clientSeed,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-greed-dice] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/greed-dice/roll — bank the auto-scoring dice and reroll the
  // rest. The faces come from the sealed stream at the deterministic cursor.
  // No scoring dice → FARKLE (settle loss). All dice score → HOT DICE (the next
  // reroll uses the full set, points intact).
  // -------------------------------------------------------------------------
  app.post('/api/arcade/greed-dice/roll', async (req: Request, res: Response) => {
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

        const volatility = row.volatility as GreedDiceVolatility;
        const diceCount = Number(row.dice_count);
        const rollLog: GreedDiceRollLogEntry[] = Array.isArray(row.roll_log) ? row.roll_log : [];
        const lastRoll = rollLog[rollLog.length - 1];
        // Remaining dice to reroll: full set after a hot-dice roll, else leftovers.
        const remaining = lastRoll.hot ? diceCount : lastRoll.dice.length - lastRoll.kept.length;

        // Draw the reroll from the stream at cursor = (dice rolled so far) × 4.
        const startCursor = totalDiceRolled(rollLog) * 4;
        const draw = makeFaceDrawer(row.server_seed, row.client_seed, Number(row.nonce));
        const dice = draw(startCursor, remaining);
        const sc = scoreGreedDiceRoll(dice);
        const newRollLog = [
          ...rollLog,
          { dice, kept: sc.kept, points: sc.points, hot: sc.hot },
        ];

        if (sc.points === 0) {
          // FARKLE — forfeit the whole turn. Reveal the seed; no payout.
          await client.query(
            `UPDATE arcade_greed_dice_rounds
               SET roll_log = $1::jsonb, status = 'settled', won = FALSE,
                   payout = 0, settled_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(newRollLog), roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              dice,
              kept: [],
              rollPoints: 0,
              hot: false,
              farkle: true,
              settled: true,
              won: false,
              points: 0,
              multiplierX100: 0,
              payout: 0,
              status: 'settled',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        // Scored — bank the points and continue.
        const points = Number(row.points) + sc.points;
        const multiplierX100 = greedDiceMultiplierX100(points, volatility);
        const newRemaining = sc.hot ? diceCount : dice.length - sc.kept.length;
        await client.query(
          `UPDATE arcade_greed_dice_rounds
             SET roll_log = $1::jsonb, points = $2, multiplier_x100 = $3
           WHERE id = $4`,
          [JSON.stringify(newRollLog), points, multiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            dice,
            kept: sc.kept,
            rollPoints: sc.points,
            hot: sc.hot,
            farkle: false,
            settled: false,
            points,
            multiplierX100,
            remaining: newRemaining,
            cashoutPayout: greedDicePayout(Number(row.bet), points, volatility),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not roll.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-greed-dice] roll failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not roll.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/greed-dice/bank — cash out the current multiplier. Must be
  // called while status='active' AND with at least 1 point banked.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/greed-dice/bank', async (req: Request, res: Response) => {
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

        const points = Number(row.points);
        if (points <= 0) {
          response = {
            status: 400,
            body: { ok: false, error: 'Score at least one die before banking.' },
          };
          return;
        }

        const volatility = row.volatility as GreedDiceVolatility;
        const multiplierX100 = greedDiceMultiplierX100(points, volatility);
        const payout = greedDicePayout(Number(row.bet), points, volatility);
        await client.query(
          `UPDATE arcade_greed_dice_rounds
             SET status = 'settled', won = TRUE, multiplier_x100 = $1,
                 payout = $2, settled_at = NOW()
           WHERE id = $3`,
          [multiplierX100, payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_greed_dice_payout',
          { type: 'arcade_greed_dice', id: roundId },
        );
        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            points,
            multiplierX100,
            payout,
            status: 'settled',
            won: true,
            serverSeed: row.server_seed,
            chipBalance: newBalance.toString(),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not bank the round.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-greed-dice] bank failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not bank the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/history — caller's settled rounds.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, volatility, dice_count, points, multiplier_x100,
                roll_log, won, payout, created_at
           FROM arcade_greed_dice_rounds
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
          volatility: row.volatility,
          diceCount: Number(row.dice_count),
          points: Number(row.points),
          multiplierX100: Number(row.multiplier_x100),
          rolls: Array.isArray(row.roll_log) ? row.roll_log.length : 0,
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-greed-dice] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/recent — public. Latest settled rounds.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, volatility, dice_count, points,
                multiplier_x100, roll_log, won, payout, created_at
           FROM arcade_greed_dice_rounds
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
          volatility: row.volatility,
          diceCount: Number(row.dice_count),
          points: Number(row.points),
          multiplierX100: Number(row.multiplier_x100),
          rolls: Array.isArray(row.roll_log) ? row.roll_log.length : 0,
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-greed-dice] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_greed_dice_rounds
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
      logger.error('[arcade-greed-dice] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/greed-dice/verify/:id — public, settled rounds ONLY. Returns
  // the seeds + the full roll log + the recipe so anyone can re-derive every die
  // face from the seed stream and confirm the points, outcome, and payout.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/greed-dice/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, volatility, dice_count, points, multiplier_x100, roll_log,
                status, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, created_at, settled_at
           FROM arcade_greed_dice_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const volatility = row.volatility as GreedDiceVolatility;
      const { n, scale } = GREED_DICE_VOLATILITIES[volatility];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        volatility,
        diceCount: Number(row.dice_count),
        scale,
        points: Number(row.points),
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        rollLog: Array.isArray(row.roll_log) ? row.roll_log : [],
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          'Faces are drawn in roll order from the HMAC stream. For the k-th die ' +
          'overall (0-based across all rolls): bytes = hmacByteStream(serverSeed, ' +
          'clientSeed, nonce, k*4); face = 1 + floor(bytesToFloat(bytes) * 6). ' +
          `Each roll auto-keeps scoring dice (1=100, 5=50, three-of-a-kind=face*100 ` +
          `or 1000 for ones, x2/x4/x8 for 4/5/6-of-a-kind); no scoring die = farkle. ` +
          `multiplierX100 = round(points / ${scale} * 100); payout on bank = ` +
          `floor(bet * multiplierX100 / 100). Starting dice = ${n}.`,
      });
    } catch (err) {
      logger.error('[arcade-greed-dice] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-greed-dice] routes registered');
}
