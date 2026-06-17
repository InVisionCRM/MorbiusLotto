/**
 * arcade-firewalk.routes.ts — MORBIUS Arcade: Firewalk.
 *
 * Endpoints (web /firewalk + Telegram Mini App):
 *   GET  /api/arcade/firewalk/info        — public: bounds + heats + ladders
 *   POST /api/arcade/firewalk/start       — charge bet, seal every stone, return id
 *   POST /api/arcade/firewalk/step        — take a step at the chosen pace
 *                                           (all safe → advance; any crumble → bust)
 *   POST /api/arcade/firewalk/cashout     — bank the current multiplier as a payout
 *   GET  /api/arcade/firewalk/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/firewalk/history     — caller's settled rounds
 *   GET  /api/arcade/firewalk/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/firewalk/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/firewalk/verify/:id  — public: seeds + crumble stones (settled ONLY)
 *
 * Stateful flow mirrors Chicken/Towers: /start INSERTs status='active' and debits
 * the bet; /step advances by the chosen pace (hop 1 / leap 2 / bound 3) — every
 * stone in the leap is checked, so a crumble anywhere busts (won=false), the
 * final stone auto-settles (won=true, credit); /cashout pays out and settles
 * won=true. The server seed AND the crumble stones are only revealed once the
 * round settles — an active round never leaks either.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round (debit → steps → settle) is wrapped in row-level locking so a
 * double-tap can't double-spend or double-pay. The
 * `uniq_arcade_firewalk_active_per_wallet` partial unique index also guarantees
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
  FIREWALK_HEATS,
  FIREWALK_HOUSE_EDGE_BP,
  FIREWALK_MAX_BET,
  FIREWALK_MIN_BET,
  FIREWALK_STONES,
  firewalkMultiplierLadder,
  firewalkPayout,
  deriveCrumbleStones,
  isFirewalkHeat,
  isFirewalkPace,
  type FirewalkHeat,
} from '../services/arcade-firewalk';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeFirewalkRoutesOptions {
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
    `SELECT id, wallet_address, bet, heat, position, crumble_stones,
            multiplier_x100, status, won, payout, server_seed, server_seed_hash,
            client_seed, nonce, house_edge_bp
       FROM arcade_firewalk_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeFirewalkRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeFirewalkRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /firewalk). Telegram wins when both are present.
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
  // GET /api/arcade/firewalk/info — public bounds + the full ladder for every
  // heat. heats[h].ladder[N] is the ×100 multiplier after N crossed stones
  // (index 0 = 100).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/info', (_req: Request, res: Response) => {
    const heats: Record<
      string,
      { stones: number; outcomes: number; safe: number; ladder: number[] }
    > = {};
    for (const h of Object.keys(FIREWALK_HEATS) as FirewalkHeat[]) {
      heats[h] = {
        stones: FIREWALK_STONES,
        outcomes: FIREWALK_HEATS[h].outcomes,
        safe: FIREWALK_HEATS[h].safe,
        ladder: firewalkMultiplierLadder(h),
      };
    }
    res.json({
      ok: true,
      minBet: FIREWALK_MIN_BET,
      maxBet: FIREWALK_MAX_BET,
      stones: FIREWALK_STONES,
      paces: [1, 2, 3],
      houseEdgeBp: FIREWALK_HOUSE_EDGE_BP,
      heats,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/firewalk/active — the wallet's active round (if any). Used
  // by the client on mount so a partly-crossed crossing survives a page
  // refresh. Never includes the crumble stones or any seed material beyond the
  // public commitment hash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, heat, position, multiplier_x100, server_seed_hash
           FROM arcade_firewalk_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const heat = row.heat as FirewalkHeat;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          heat,
          position: Number(row.position),
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          stones: FIREWALK_STONES,
          ladder: firewalkMultiplierLadder(heat),
        },
      });
    } catch (err) {
      logger.error('[arcade-firewalk] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/firewalk/start — debit the bet, seal the stones, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/firewalk/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < FIREWALK_MIN_BET || bet > FIREWALK_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${FIREWALK_MIN_BET} and ${FIREWALK_MAX_BET} chips.`,
        });
      }

      const heat = req.body?.heat;
      if (!isFirewalkHeat(heat)) {
        return res.status(400).json({ ok: false, error: 'Heat must be low, med or high.' });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Every stone is rolled here, before the first step, behind the committed
      // hash — they never move and never leave the server while the round is
      // active.
      const crumbleStones = deriveCrumbleStones(
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
        heat,
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_firewalk_bet',
            { type: 'arcade_firewalk', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_firewalk_rounds
               (id, wallet_address, bet, heat, position, crumble_stones,
                multiplier_x100, status, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb,
                     100, 'active', FALSE, 0,
                     $6, $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              heat,
              JSON.stringify(crumbleStones),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              FIREWALK_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_firewalk_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Firewalk round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        heat,
        stones: FIREWALK_STONES,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: FIREWALK_HOUSE_EDGE_BP,
        ladder: firewalkMultiplierLadder(heat),
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-firewalk] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/firewalk/step — take a step at the chosen pace.
  // Every stone in [position+1 .. position+pace] must be safe → advance to
  // position+pace (the final stone auto-settles as a win and credits the
  // payout). A crumble anywhere in the leap → reveal the full crossing + server
  // seed, settle as a loss at the crumbling stone.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/firewalk/step', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }
      const pace = Math.floor(Number(req.body?.pace));
      if (!isFirewalkPace(pace)) {
        return res.status(400).json({ ok: false, error: 'Pace must be 1, 2 or 3.' });
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

        const heat = row.heat as FirewalkHeat;
        const positionNow = Number(row.position);
        const target = Math.min(positionNow + pace, FIREWALK_STONES);
        if (target <= positionNow) {
          response = { status: 400, body: { ok: false, error: 'Already across — cash out.' } };
          return;
        }

        const crumbleStones: number[] = Array.isArray(row.crumble_stones) ? row.crumble_stones : [];
        const crumbleSet = new Set(crumbleStones);

        // Walk the committed stones one at a time; the first crumbling stone in
        // the leap ends the round at that stone.
        for (let stone = positionNow + 1; stone <= target; stone++) {
          if (crumbleSet.has(stone)) {
            await client.query(
              `UPDATE arcade_firewalk_rounds
                 SET position = $1, status = 'settled', won = FALSE, settled_at = NOW()
               WHERE id = $2`,
              [stone, roundId],
            );
            response = {
              status: 200,
              body: {
                ok: true,
                safe: false,
                settled: true,
                won: false,
                pace,
                position: stone,
                crumbleStones,
                status: 'settled',
                serverSeed: row.server_seed,
              },
            };
            return;
          }
        }

        const ladder = firewalkMultiplierLadder(heat);
        const newMultiplierX100 = ladder[target];

        if (target >= FIREWALK_STONES) {
          // Full crossing — auto-settle as a win and credit the top of the ladder.
          const payout = firewalkPayout(Number(row.bet), newMultiplierX100);
          await client.query(
            `UPDATE arcade_firewalk_rounds
               SET position = $1,
                   multiplier_x100 = $2,
                   status = 'settled',
                   won = TRUE,
                   payout = $3,
                   settled_at = NOW()
             WHERE id = $4`,
            [target, newMultiplierX100, payout, roundId],
          );
          const newBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_firewalk_payout',
            { type: 'arcade_firewalk', id: roundId },
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: true,
              settled: true,
              won: true,
              pace,
              position: target,
              multiplierX100: newMultiplierX100,
              payout,
              crumbleStones,
              status: 'settled',
              serverSeed: row.server_seed,
              chipBalance: newBalance.toString(),
            },
          };
          return;
        }

        await client.query(
          `UPDATE arcade_firewalk_rounds
             SET position = $1, multiplier_x100 = $2
           WHERE id = $3`,
          [target, newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            settled: false,
            pace,
            position: target,
            multiplierX100: newMultiplierX100,
            // Hint: payout if the player cashes out right now.
            cashoutPayout: Math.floor((Number(row.bet) * newMultiplierX100) / 100),
            stonesRemaining: FIREWALK_STONES - target,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not take the step.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-firewalk] step failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not take the step.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/firewalk/cashout — bank the current multiplier as a payout.
  // Must be called while status='active' AND at least one stone crossed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/firewalk/cashout', async (req: Request, res: Response) => {
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

        const positionNow = Number(row.position);
        if (positionNow < 1) {
          response = {
            status: 400,
            body: { ok: false, error: 'Cross at least one stone before cashing out.' },
          };
          return;
        }

        const payout = firewalkPayout(Number(row.bet), Number(row.multiplier_x100));
        await client.query(
          `UPDATE arcade_firewalk_rounds
             SET status = 'settled', won = TRUE, payout = $1, settled_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_firewalk_payout',
          { type: 'arcade_firewalk', id: roundId },
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            position: positionNow,
            multiplierX100: Number(row.multiplier_x100),
            payout,
            crumbleStones: row.crumble_stones,
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
      logger.error('[arcade-firewalk] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/firewalk/history — caller's settled rounds for the web panel.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, heat, position, multiplier_x100, won, payout, created_at
           FROM arcade_firewalk_rounds
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
          heat: row.heat,
          position: Number(row.position),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-firewalk] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/firewalk/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, heat, position, multiplier_x100, won, payout,
                created_at
           FROM arcade_firewalk_rounds
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
          heat: row.heat,
          position: Number(row.position),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-firewalk] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/firewalk/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_firewalk_rounds
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
      logger.error('[arcade-firewalk] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/firewalk/verify/:id — public, settled rounds ONLY. Returns
  // the seeds + the crumble stones + the recipe so anyone can independently
  // recompute every stone and confirm the coals were fixed at /start (matching
  // `serverSeedHash`) and never moved. An ACTIVE round 404s.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/firewalk/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, heat, position, crumble_stones, multiplier_x100,
                status, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, house_edge_bp, created_at, settled_at
           FROM arcade_firewalk_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const heat = row.heat as FirewalkHeat;
      const { outcomes, safe } = FIREWALK_HEATS[heat];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        heat,
        stones: FIREWALK_STONES,
        outcomes,
        safe,
        position: Number(row.position),
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        crumbleStones: row.crumble_stones,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          `For stone S in [1..${FIREWALK_STONES}]: ` +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, (S-1)*4); ' +
          'r = bytesToFloat(bytes); stone S crumbles iff ' +
          `floor(r * ${outcomes}) >= ${safe} (P safe = ${safe}/${outcomes} on ${heat}). ` +
          `Ladder: m[0] = 100; m[N] = floor((10000 - houseEdgeBp) * ${outcomes}^N / ` +
          `(100 * ${safe}^N)). Payout on win = floor(bet * m[position] / 100).`,
      });
    } catch (err) {
      logger.error('[arcade-firewalk] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-firewalk] routes registered');
}
