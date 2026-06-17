/**
 * arcade-heist.routes.ts — MORBIUS Arcade: Heist.
 *
 * Endpoints (web /heist + Telegram Mini App):
 *   GET  /api/arcade/heist/info        — public: bounds + difficulties + ladders
 *   POST /api/arcade/heist/start       — charge bet, seal every room's alarms, id
 *   POST /api/arcade/heist/step        — open a door (index) in the current room
 *                                        (safe → advance; alarm → reveal + settle)
 *   POST /api/arcade/heist/cashout     — escape with the current multiplier
 *   GET  /api/arcade/heist/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/heist/history     — caller's settled rounds
 *   GET  /api/arcade/heist/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/heist/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/heist/verify/:id  — public: seeds + alarm doors (settled ONLY)
 *
 * Stateful flow mirrors Towers/Mines: /start INSERTs status='active' and debits
 * the bet; /step UPDATEs picks + room + multiplier or settles (alarm → won=false;
 * final room → auto-settle won=true and credit); /cashout pays out and settles
 * won=true. The server seed AND the alarm doors are only revealed when the round
 * is settled — an active round never leaks either.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round (debit → steps → settle) is wrapped in row-level locking so a
 * double-tap can't double-spend or double-pay. The
 * `uniq_arcade_heist_active_per_wallet` partial unique index also guarantees one
 * active round per wallet at a time at the DB level.
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
  HEIST_DIFFICULTIES,
  HEIST_HOUSE_EDGE_BP,
  HEIST_MAX_BET,
  HEIST_MIN_BET,
  deriveAlarmDoors,
  heistMultiplierLadder,
  heistPayout,
  isHeistDifficulty,
  type HeistDifficulty,
} from '../services/arcade-heist';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeHeistRoutesOptions {
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
    `SELECT id, wallet_address, bet, difficulty, room, alarm_doors, picks,
            multiplier_x100, status, won, payout, server_seed, server_seed_hash,
            client_seed, nonce, house_edge_bp
       FROM arcade_heist_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeHeistRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeHeistRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /heist). Telegram wins when both are present.
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
  // GET /api/arcade/heist/info — public bounds + the full ladder for every
  // difficulty. difficulties[d].ladder[r] is the ×100 multiplier after r
  // cleared rooms (index 0 = 100).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/info', (_req: Request, res: Response) => {
    const difficulties: Record<
      string,
      { doors: number; alarms: number; rooms: number; ladder: number[] }
    > = {};
    for (const d of Object.keys(HEIST_DIFFICULTIES) as HeistDifficulty[]) {
      difficulties[d] = { ...HEIST_DIFFICULTIES[d], ladder: heistMultiplierLadder(d) };
    }
    res.json({
      ok: true,
      minBet: HEIST_MIN_BET,
      maxBet: HEIST_MAX_BET,
      houseEdgeBp: HEIST_HOUSE_EDGE_BP,
      difficulties,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/heist/active — the wallet's active round (if any). Used by
  // the client on mount so a partly-cracked vault survives a page refresh —
  // without this, the one-active-round-per-wallet index would lock the wallet
  // out of Heist with no way to recover the roundId. Never includes the alarm
  // doors or any seed material beyond the public commitment hash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, difficulty, room, picks, multiplier_x100, server_seed_hash
           FROM arcade_heist_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const difficulty = row.difficulty as HeistDifficulty;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          difficulty,
          room: Number(row.room),
          picks: Array.isArray(row.picks) ? row.picks : [],
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          rooms: HEIST_DIFFICULTIES[difficulty].rooms,
          doors: HEIST_DIFFICULTIES[difficulty].doors,
          alarms: HEIST_DIFFICULTIES[difficulty].alarms,
          ladder: heistMultiplierLadder(difficulty),
        },
      });
    } catch (err) {
      logger.error('[arcade-heist] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/heist/start — debit the bet, seal the alarms, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/heist/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < HEIST_MIN_BET || bet > HEIST_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${HEIST_MIN_BET} and ${HEIST_MAX_BET} chips.`,
        });
      }

      const difficulty = req.body?.difficulty;
      if (!isHeistDifficulty(difficulty)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Difficulty must be sneaky, standard or daring.' });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Every room's alarm door(s) are fixed here, before the first pick, behind
      // the committed hash — they never move and never leave the server while
      // the round is active.
      const alarmDoors = deriveAlarmDoors(
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
            'arcade_heist_bet',
            { type: 'arcade_heist', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_heist_rounds
               (id, wallet_address, bet, difficulty, room, alarm_doors, picks,
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
              JSON.stringify(alarmDoors),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              HEIST_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        // The partial unique index throws "duplicate key" when there's already
        // an active round for this wallet; surface that as a clean 409 so the
        // UI can resume the existing round instead of starting another.
        if (/uniq_arcade_heist_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Heist round — finish or escape it first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        difficulty,
        rooms: HEIST_DIFFICULTIES[difficulty].rooms,
        doors: HEIST_DIFFICULTIES[difficulty].doors,
        alarms: HEIST_DIFFICULTIES[difficulty].alarms,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: HEIST_HOUSE_EDGE_BP,
        ladder: heistMultiplierLadder(difficulty),
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-heist] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/heist/step — open one door (index) in the current room.
  // Safe → advance (the final room auto-settles as a win and credits the
  // payout); alarm → reveal the full vault + server seed, settle as a loss.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/heist/step', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      const door = req.body?.door;
      if (!roundId || !Number.isInteger(door) || (door as number) < 0) {
        return res.status(400).json({ ok: false, error: 'Invalid round or door.' });
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

        const difficulty = row.difficulty as HeistDifficulty;
        const { doors, rooms } = HEIST_DIFFICULTIES[difficulty];
        if ((door as number) >= doors) {
          response = {
            status: 400,
            body: { ok: false, error: `Door must be between 0 and ${doors - 1}.` },
          };
          return;
        }

        const roomNow = Number(row.room);
        const alarmDoors: number[][] = Array.isArray(row.alarm_doors) ? row.alarm_doors : [];
        const picks: number[] = Array.isArray(row.picks) ? row.picks : [];
        const roomAlarms: number[] = Array.isArray(alarmDoors[roomNow]) ? alarmDoors[roomNow] : [];
        const newPicks = [...picks, door as number];
        const isAlarm = roomAlarms.includes(door as number);

        if (isAlarm) {
          // Settle as a bust. Picks tail includes the alarm door so the UI can
          // animate the strobe on the exact door. No payout; the alarm doors and
          // the server seed are now public so the round is verifiable.
          await client.query(
            `UPDATE arcade_heist_rounds
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
              door,
              room: roomNow,
              picks: newPicks,
              alarmDoors,
              status: 'settled',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        const newRoom = roomNow + 1;
        const ladder = heistMultiplierLadder(difficulty);
        const newMultiplierX100 = ladder[newRoom];

        if (newRoom >= rooms) {
          // Full clear — auto-settle as a win and credit the top of the ladder.
          const payout = heistPayout(Number(row.bet), newMultiplierX100);
          await client.query(
            `UPDATE arcade_heist_rounds
               SET picks = $1::jsonb,
                   room = $2,
                   multiplier_x100 = $3,
                   status = 'settled',
                   won = TRUE,
                   payout = $4,
                   settled_at = NOW()
             WHERE id = $5`,
            [JSON.stringify(newPicks), newRoom, newMultiplierX100, payout, roundId],
          );
          const newBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_heist_payout',
            { type: 'arcade_heist', id: roundId },
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: true,
              settled: true,
              won: true,
              door,
              room: newRoom,
              picks: newPicks,
              multiplierX100: newMultiplierX100,
              payout,
              alarmDoors,
              status: 'settled',
              serverSeed: row.server_seed,
              chipBalance: newBalance.toString(),
            },
          };
          return;
        }

        await client.query(
          `UPDATE arcade_heist_rounds
             SET picks = $1::jsonb,
                 room = $2,
                 multiplier_x100 = $3
           WHERE id = $4`,
          [JSON.stringify(newPicks), newRoom, newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            settled: false,
            door,
            room: newRoom,
            picks: newPicks,
            multiplierX100: newMultiplierX100,
            // Hint: payout if the player escapes right now.
            cashoutPayout: Math.floor((Number(row.bet) * newMultiplierX100) / 100),
            roomsRemaining: rooms - newRoom,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not open the door.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-heist] step failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not open the door.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/heist/cashout — escape with the current multiplier.
  // Must be called while status='active' AND at least one room cleared.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/heist/cashout', async (req: Request, res: Response) => {
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

        const roomNow = Number(row.room);
        if (roomNow < 1) {
          response = {
            status: 400,
            body: { ok: false, error: 'Crack at least one vault before escaping.' },
          };
          return;
        }

        const payout = heistPayout(Number(row.bet), Number(row.multiplier_x100));
        await client.query(
          `UPDATE arcade_heist_rounds
             SET status = 'settled', won = TRUE, payout = $1, settled_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_heist_payout',
          { type: 'arcade_heist', id: roundId },
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            room: roomNow,
            picks: Array.isArray(row.picks) ? row.picks : [],
            multiplierX100: Number(row.multiplier_x100),
            payout,
            alarmDoors: row.alarm_doors,
            status: 'settled',
            won: true,
            serverSeed: row.server_seed,
            chipBalance: newBalance.toString(),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not escape the round.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-heist] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not escape the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/heist/history — caller's settled rounds for the web panel.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, difficulty, room, multiplier_x100, won, payout, created_at
           FROM arcade_heist_rounds
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
          room: Number(row.room),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-heist] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/heist/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, difficulty, room, multiplier_x100, won, payout,
                created_at
           FROM arcade_heist_rounds
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
          room: Number(row.room),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-heist] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/heist/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_heist_rounds
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
      logger.error('[arcade-heist] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/heist/verify/:id — public, settled rounds ONLY. Returns the
  // seeds + the alarm doors + the recipe so anyone can independently recompute
  // every room and confirm the vault was fixed at /start (matching
  // `serverSeedHash`) and never moved. An ACTIVE round 404s — even its
  // commitment stays out of this endpoint so there is zero surface for probing a
  // vault mid-heist.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/heist/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, difficulty, room, alarm_doors, picks, multiplier_x100,
                status, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, house_edge_bp, created_at, settled_at
           FROM arcade_heist_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const difficulty = row.difficulty as HeistDifficulty;
      const { doors, alarms, rooms } = HEIST_DIFFICULTIES[difficulty];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        difficulty,
        doors,
        alarms,
        rooms,
        room: Number(row.room),
        picks: Array.isArray(row.picks) ? row.picks : [],
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        alarmDoors: row.alarm_doors,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          `For room r in [0..${rooms - 1}], cursor starts at 0 and advances 4 bytes per ` +
          `alarm draw across all rooms. For draw b in [0..${alarms - 1}]: ` +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, cursor); ' +
          'rfloat = bytesToFloat(bytes); j = b + floor(rfloat * (doors - b)); swap idx[b], idx[j]; ' +
          `cursor += 4 (doors = ${doors}). alarmDoors[r] = sort(idx[0..${alarms - 1}]). ` +
          'Ladder: m[0] = 100; m[r] = floor(m[r-1] * doors * (10000 - houseEdgeBp) / ' +
          `(10000 * (doors - ${alarms}))). Payout on win = floor(bet * m[room] / 100).`,
      });
    } catch (err) {
      logger.error('[arcade-heist] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-heist] routes registered');
}
