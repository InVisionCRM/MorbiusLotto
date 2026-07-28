/**
 * arcade-towers.routes.ts — MORBIUS Arcade: Towers.
 *
 * Endpoints (web /towers + Telegram Mini App):
 *   GET  /api/arcade/towers/info        — public: bounds + difficulties + ladders
 *   POST /api/arcade/towers/start       — charge bet, seal all 8 bombs, return id
 *   POST /api/arcade/towers/pick        — pick one tile on the current floor
 *                                         (safe → climb; bomb → reveal + settle)
 *   POST /api/arcade/towers/cashout     — bank the current multiplier as a payout
 *   GET  /api/arcade/towers/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/towers/history     — caller's settled rounds
 *   GET  /api/arcade/towers/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/towers/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/towers/verify/:id  — public: seeds + bombs (settled rounds ONLY)
 *
 * Stateful flow mirrors Mines: /start INSERTs status='active' and debits the
 * bet; /pick UPDATEs picks + floor + multiplier or settles (bomb → won=false;
 * floor 8 → auto-settle won=true and credit); /cashout pays out and settles
 * won=true. The server seed AND the bomb positions are only revealed when the
 * round is settled — an active round never leaks either.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round (debit → picks → settle) is wrapped in row-level locking so a
 * double-tap can't double-spend or double-pay. The
 * `uniq_arcade_towers_active_per_wallet` partial unique index also guarantees
 * one active round per wallet at a time at the DB level — defence-in-depth
 * against a flurry of /start clicks.
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
  TOWERS_DIFFICULTIES,
  TOWERS_FLOORS,
  TOWERS_HOUSE_EDGE_BP,
  deriveTowersBombs,
  isTowersDifficulty,
  towersMultiplierLadder,
  towersPayout,
  type TowersDifficulty,
} from '../services/arcade-towers';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeTowersRoutesOptions {
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
    `SELECT id, wallet_address, bet, difficulty, floor, bomb_positions, picks,
            multiplier_x100, status, won, payout, server_seed, server_seed_hash,
            client_seed, nonce, house_edge_bp
       FROM arcade_towers_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeTowersRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeTowersRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /towers). Telegram wins when both are present so the Mini App
   * keeps working unchanged inside a browser that also has a web session.
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
  // GET /api/arcade/towers/info — public bounds + the full ladder for every
  // difficulty. The UI uses the ladders to render the per-floor multiplier
  // rail without round-tripping to /pick. difficulties[d].ladder[f] is the
  // ×100 multiplier after f completed floors (index 0 = 100).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/info', (_req: Request, res: Response) => {
    const difficulties: Record<string, { tiles: number; bombs: number; ladder: number[] }> = {};
    for (const d of Object.keys(TOWERS_DIFFICULTIES) as TowersDifficulty[]) {
      difficulties[d] = { ...TOWERS_DIFFICULTIES[d], ladder: towersMultiplierLadder(d) };
    }
    res.json({
      ok: true,
      floors: TOWERS_FLOORS,
      minBet: betLimits('towers').min,
      maxBet: betLimits('towers').max,
      houseEdgeBp: TOWERS_HOUSE_EDGE_BP,
      difficulties,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/towers/active — the wallet's active round (if any). Used
  // by the client on mount so a partly-climbed tower survives a page refresh —
  // without this, the one-active-round-per-wallet index would lock the wallet
  // out of Towers with no way to recover the roundId. Never includes the bomb
  // positions or any seed material beyond the public commitment hash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, difficulty, floor, picks, multiplier_x100, server_seed_hash
           FROM arcade_towers_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const difficulty = row.difficulty as TowersDifficulty;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          difficulty,
          floor: Number(row.floor),
          picks: Array.isArray(row.picks) ? row.picks : [],
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          ladder: towersMultiplierLadder(difficulty),
        },
      });
    } catch (err) {
      logger.error('[arcade-towers] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/towers/start — debit the bet, seal the bombs, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/towers/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('towers').min || bet > betLimits('towers').max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${betLimits('towers').min} and ${betLimits('towers').max} chips.`,
        });
      }

      const difficulty = req.body?.difficulty;
      if (!isTowersDifficulty(difficulty)) {
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

      // All 8 bombs are fixed here, before the first pick, behind the
      // committed hash — they never move and never leave the server while the
      // round is active.
      const bombs = deriveTowersBombs(
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
            'arcade_towers_bet',
            { type: 'arcade_towers', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_towers_rounds
               (id, wallet_address, bet, difficulty, floor, bomb_positions, picks,
                multiplier_x100, status, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb, '[]'::jsonb,
                     100, 'active', FALSE, 0,
                     $6, $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              difficulty,
              JSON.stringify(bombs),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              TOWERS_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        // The partial unique index throws "duplicate key" when there's already
        // an active round for this wallet; surface that as a clean 409 so the
        // UI can resume the existing round instead of starting another.
        if (/uniq_arcade_towers_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Towers round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        difficulty,
        floors: TOWERS_FLOORS,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: TOWERS_HOUSE_EDGE_BP,
        ladder: towersMultiplierLadder(difficulty),
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-towers] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/towers/pick — pick one tile on the current floor.
  // Safe → climb (floor 8 auto-settles as a win and credits the payout);
  // bomb → reveal the full tower + server seed, settle the row as a loss.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/towers/pick', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      const tile = req.body?.tile;
      if (!roundId || !Number.isInteger(tile) || (tile as number) < 0) {
        return res.status(400).json({ ok: false, error: 'Invalid round or tile.' });
      }

      let response: Record<string, unknown> | null = null;
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

        const difficulty = row.difficulty as TowersDifficulty;
        const { tiles } = TOWERS_DIFFICULTIES[difficulty];
        if ((tile as number) >= tiles) {
          response = {
            status: 400,
            body: { ok: false, error: `Tile must be between 0 and ${tiles - 1}.` },
          };
          return;
        }

        const floorNow = Number(row.floor);
        const bombs: number[] = Array.isArray(row.bomb_positions) ? row.bomb_positions : [];
        const picks: number[] = Array.isArray(row.picks) ? row.picks : [];
        const newPicks = [...picks, tile as number];
        const isBomb = bombs[floorNow] === tile;

        if (isBomb) {
          // Settle as a bust. Picks tail includes the bomb so the UI can
          // animate the explosion on the exact tile. No payout; the bombs and
          // the server seed are now public so the round is verifiable.
          await client.query(
            `UPDATE arcade_towers_rounds
               SET picks = $1::jsonb,
                   status = 'settled',
                   won = FALSE,
                   settled_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(newPicks), roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: false,
              settled: true,
              won: false,
              tile,
              floor: floorNow,
              picks: newPicks,
              bombPositions: bombs,
              status: 'settled',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        const newFloor = floorNow + 1;
        const ladder = towersMultiplierLadder(difficulty);
        const newMultiplierX100 = ladder[newFloor];

        if (newFloor >= TOWERS_FLOORS) {
          // Full climb — auto-settle as a win and credit the top of the ladder.
          const payout = towersPayout(Number(row.bet), newMultiplierX100);
          await client.query(
            `UPDATE arcade_towers_rounds
               SET picks = $1::jsonb,
                   floor = $2,
                   multiplier_x100 = $3,
                   status = 'settled',
                   won = TRUE,
                   payout = $4,
                   settled_at = NOW()
             WHERE id = $5`,
            [JSON.stringify(newPicks), newFloor, newMultiplierX100, payout, roundId],
          );
          const newBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_towers_payout',
            { type: 'arcade_towers', id: roundId },
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: true,
              settled: true,
              won: true,
              tile,
              floor: newFloor,
              picks: newPicks,
              multiplierX100: newMultiplierX100,
              payout,
              bombPositions: bombs,
              status: 'settled',
              serverSeed: row.server_seed,
              chipBalance: newBalance.toString(),
            },
          };
          return;
        }

        await client.query(
          `UPDATE arcade_towers_rounds
             SET picks = $1::jsonb,
                 floor = $2,
                 multiplier_x100 = $3
           WHERE id = $4`,
          [JSON.stringify(newPicks), newFloor, newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            settled: false,
            tile,
            floor: newFloor,
            picks: newPicks,
            multiplierX100: newMultiplierX100,
            // Hint: payout if the player cashes out right now.
            cashoutPayout: Math.floor((Number(row.bet) * newMultiplierX100) / 100),
            floorsRemaining: TOWERS_FLOORS - newFloor,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not pick the tile.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-towers] pick failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not pick the tile.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/towers/cashout — bank the current multiplier as a payout.
  // Must be called while status='active' AND at least one floor completed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/towers/cashout', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }

      let response: Record<string, unknown> | null = null;
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

        const floorNow = Number(row.floor);
        if (floorNow < 1) {
          response = {
            status: 400,
            body: { ok: false, error: 'Climb at least one floor before cashing out.' },
          };
          return;
        }

        const payout = towersPayout(Number(row.bet), Number(row.multiplier_x100));
        await client.query(
          `UPDATE arcade_towers_rounds
             SET status = 'settled', won = TRUE, payout = $1, settled_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_towers_payout',
          { type: 'arcade_towers', id: roundId },
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            floor: floorNow,
            picks: Array.isArray(row.picks) ? row.picks : [],
            multiplierX100: Number(row.multiplier_x100),
            payout,
            bombPositions: row.bomb_positions,
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
      logger.error('[arcade-towers] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/towers/history — caller's settled rounds for the web
  // history panel. Cookie-auth only in practice (GET has no body, so
  // resolveWallet falls through to the SIWE session).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, difficulty, floor, bomb_positions, picks, multiplier_x100, won, payout, created_at
           FROM arcade_towers_rounds
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
          floor: Number(row.floor),
          // Full reveal for the client-side replay (settled rounds only).
          picks: Array.isArray(row.picks) ? row.picks : [],
          bombPositions: Array.isArray(row.bomb_positions) ? row.bomb_positions : [],
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-towers] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/towers/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, difficulty, floor, multiplier_x100, won, payout,
                created_at
           FROM arcade_towers_rounds
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
          floor: Number(row.floor),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-towers] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/towers/leaderboard — public. All-time top players by net
  // over settled rounds.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_towers_rounds
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
      logger.error('[arcade-towers] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/towers/verify/:id — public, settled rounds ONLY. Returns
  // the seeds + the bomb positions + the recipe so anyone can independently
  // recompute every bomb and confirm the tower was fixed at /start (matching
  // `serverSeedHash`) and never moved. An ACTIVE round 404s — even its
  // commitment stays out of this endpoint so there is zero surface for
  // probing a tower mid-climb.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/towers/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, difficulty, floor, bomb_positions, picks, multiplier_x100,
                status, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, house_edge_bp, created_at, settled_at
           FROM arcade_towers_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const difficulty = row.difficulty as TowersDifficulty;
      const { tiles, bombs } = TOWERS_DIFFICULTIES[difficulty];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        difficulty,
        tiles,
        floors: TOWERS_FLOORS,
        floor: Number(row.floor),
        picks: Array.isArray(row.picks) ? row.picks : [],
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        bombPositions: row.bomb_positions,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          `For floor f in [0..${TOWERS_FLOORS - 1}]: ` +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, f*4); ' +
          'r = bytesToFloat(bytes); bombPositions[f] = floor(r * tiles) ' +
          `(tiles = ${tiles} on ${difficulty}). ` +
          'Ladder: m[0] = 100; m[f] = floor(m[f-1] * tiles * (10000 - houseEdgeBp) / ' +
          `(10000 * (tiles - ${bombs}))). Payout on win = floor(bet * m[floor] / 100).`,
      });
    } catch (err) {
      logger.error('[arcade-towers] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-towers] routes registered');
}
