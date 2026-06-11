/**
 * arcade-mines.routes.ts — MORBIUS Arcade: Mines.
 *
 * Endpoints for the Telegram Mini App:
 *   GET  /api/arcade/mines/info        — public: bounds + house edge + ladders
 *   POST /api/arcade/mines/start       — charge bet, seed the round, return id
 *   POST /api/arcade/mines/pick        — reveal one cell (safe → bump multiplier;
 *                                        bomb → reveal grid, finalize as busted)
 *   POST /api/arcade/mines/cashout     — bank the current multiplier as a payout
 *   GET  /api/arcade/mines/verify/:id  — public: re-derivable bomb grid recipe
 *
 * Stateful flow (unlike Limbo, which is one-shot):
 *   start  → INSERT round (status='active'), debit chips, return serverSeedHash
 *           + ladder; player picks cells client-side and pushes /pick calls.
 *   pick   → if active && cell not yet picked && cell ∉ bombs:
 *              UPDATE picks, recompute multiplier, return { safe, multiplier }.
 *            if cell ∈ bombs: UPDATE status='busted', reveal full grid +
 *              serverSeed, return { safe:false, bombs, serverSeed }.
 *   cashout→ if active: UPDATE status='cashed_out', credit payout, return seed.
 *
 * Auth on /start, /pick, /cashout is the signed Telegram `initData`. The full
 * round (debit → picks → settle) is wrapped in row-level locking so a double-
 * tap can't double-spend or double-pay. The `uniq_arcade_mines_active_per_wallet`
 * partial unique index also guarantees one active round per wallet at a time
 * at the DB level — defence-in-depth against a flurry of /start clicks.
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
  MINES_HOUSE_EDGE_BP,
  MINES_MAX_BET,
  MINES_MAX_BOMBS,
  MINES_MIN_BET,
  MINES_MIN_BOMBS,
  MINES_TOTAL_CELLS,
  deriveBombGrid,
  minesMultiplierLadder,
  minesMultiplierX100,
  minesPayout,
} from '../services/arcade-mines';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeMinesRoutesOptions {
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

/** Cell index validity: integer in [0, 25). */
function isValidCell(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < MINES_TOTAL_CELLS;
}

/** SELECT … FOR UPDATE the round row inside an open transaction. */
async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, bet, bombs, bombs_grid, picks,
            multiplier_x100, status, server_seed, server_seed_hash, client_seed,
            nonce, house_edge_bp
       FROM arcade_mines_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeMinesRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeMinesRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /mines2). Telegram wins when both are present so the Mini App
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
  // GET /api/arcade/mines/info — public bounds + per-bombs multiplier ladders.
  // The UI uses the ladder to render the "next pick pays N" preview without
  // round-tripping to /pick to find out. ladders[bombs] is an array of ×100
  // multipliers where ladders[bombs][k] = multiplier after k safe picks.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/mines/info', (_req: Request, res: Response) => {
    const ladders: Record<number, number[]> = {};
    for (let bombs = MINES_MIN_BOMBS; bombs <= MINES_MAX_BOMBS; bombs++) {
      ladders[bombs] = minesMultiplierLadder(bombs);
    }
    res.json({
      ok: true,
      totalCells: MINES_TOTAL_CELLS,
      minBet: MINES_MIN_BET,
      maxBet: MINES_MAX_BET,
      minBombs: MINES_MIN_BOMBS,
      maxBombs: MINES_MAX_BOMBS,
      houseEdgeBp: MINES_HOUSE_EDGE_BP,
      ladders,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/mines/state — return the wallet's active round (if any).
  // Used by the client on mount so a partly-played round survives a page
  // refresh — without this, the one-active-round-per-wallet index would lock
  // the wallet out of Mines with no way to recover the roundId. Mirrors
  // /api/arcade/hilo/state.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/mines/state', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, bombs, picks, multiplier_x100, server_seed_hash,
                client_seed, nonce, house_edge_bp
           FROM arcade_mines_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          bombs: Number(row.bombs),
          picks: Array.isArray(row.picks) ? row.picks : [],
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
          houseEdgeBp: Number(row.house_edge_bp),
          ladder: minesMultiplierLadder(Number(row.bombs)),
        },
      });
    } catch (err) {
      logger.error('[arcade-mines] state failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/mines/start — debit the bet, seed the round, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/mines/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < MINES_MIN_BET || bet > MINES_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${MINES_MIN_BET} and ${MINES_MAX_BET} chips.`,
        });
      }

      const bombs = Math.floor(Number(req.body?.bombs));
      if (!Number.isFinite(bombs) || bombs < MINES_MIN_BOMBS || bombs > MINES_MAX_BOMBS) {
        return res.status(400).json({
          ok: false,
          error: `Bombs must be between ${MINES_MIN_BOMBS} and ${MINES_MAX_BOMBS}.`,
        });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      const grid = deriveBombGrid(
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
        bombs,
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_mines_bet',
            { type: 'arcade_mines', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_mines_rounds
               (id, wallet_address, bet, bombs, bombs_grid, picks,
                multiplier_x100, status, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb,
                     100, 'active', 0,
                     $6, $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              bombs,
              JSON.stringify(grid),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              MINES_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        // The partial unique index throws "duplicate key" when there's already
        // an active round for this wallet; surface that as a clean 409 so the
        // UI can resume the existing round instead of starting another.
        if (/uniq_arcade_mines_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Mines round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        bombs,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: MINES_HOUSE_EDGE_BP,
        ladder: minesMultiplierLadder(bombs),
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-mines] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/mines/pick — reveal one cell. Safe → bump multiplier;
  // bomb → reveal full grid + server seed, finalize the row.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/mines/pick', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      const cell = req.body?.cell;
      if (!roundId || !isValidCell(cell)) {
        return res.status(400).json({ ok: false, error: 'Invalid round or cell.' });
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
            body: { ok: false, error: 'Round already finalized.', status: row.status },
          };
          return;
        }

        const picks: number[] = Array.isArray(row.picks) ? row.picks : [];
        if (picks.includes(cell)) {
          response = { status: 400, body: { ok: false, error: 'Cell already revealed.' } };
          return;
        }
        const bombs: number[] = Array.isArray(row.bombs_grid) ? row.bombs_grid : [];
        const isBomb = bombs.includes(cell);
        const newPicks = [...picks, cell];

        if (isBomb) {
          // Finalize as a bust. Picks tail includes the bomb so the UI can
          // animate the explosion on the exact cell. No payout.
          await client.query(
            `UPDATE arcade_mines_rounds
               SET picks = $1::jsonb,
                   status = 'busted',
                   finalized_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(newPicks), roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: false,
              cell,
              bombs,
              picks: newPicks,
              status: 'busted',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        const safePicks = newPicks.length; // how many safe reveals so far
        const newMultiplierX100 = minesMultiplierX100(row.bombs, safePicks);
        await client.query(
          `UPDATE arcade_mines_rounds
             SET picks = $1::jsonb,
                 multiplier_x100 = $2
           WHERE id = $3`,
          [JSON.stringify(newPicks), newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            cell,
            picks: newPicks,
            multiplierX100: newMultiplierX100,
            // Hint: payout if the player cashes out right now.
            cashoutPayout: Math.floor((Number(row.bet) * newMultiplierX100) / 100),
            safePicksRemaining: MINES_TOTAL_CELLS - row.bombs - safePicks,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not reveal the cell.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-mines] pick failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not reveal the cell.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/mines/cashout — bank the current multiplier as a payout.
  // Must be called while status='active' AND at least one safe cell revealed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/mines/cashout', async (req: Request, res: Response) => {
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
            body: { ok: false, error: 'Round already finalized.', status: row.status },
          };
          return;
        }

        const picks: number[] = Array.isArray(row.picks) ? row.picks : [];
        if (picks.length === 0) {
          response = {
            status: 400,
            body: { ok: false, error: 'Reveal at least one safe cell before cashing out.' },
          };
          return;
        }

        const payout = minesPayout(Number(row.bet), row.bombs, picks.length);
        await client.query(
          `UPDATE arcade_mines_rounds
             SET status = 'cashed_out', payout = $1, finalized_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_mines_payout',
          { type: 'arcade_mines', id: roundId },
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            picks,
            multiplierX100: row.multiplier_x100,
            payout,
            bombs: row.bombs_grid,
            status: 'cashed_out',
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
      logger.error('[arcade-mines] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/mines/history — caller's recent finalized rounds for the
  // web history panel. Cookie-auth only in practice (GET has no body, so
  // resolveWallet falls through to the SIWE session); the Mini App doesn't
  // render a history list.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/mines/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, bombs, picks, multiplier_x100, payout, status, created_at
           FROM arcade_mines_rounds
          WHERE wallet_address = $1 AND status <> 'active'
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => {
          const picks: number[] = Array.isArray(row.picks) ? row.picks : [];
          // On a bust the picks tail includes the bomb cell — don't count it as a gem.
          const gems = row.status === 'busted' ? Math.max(0, picks.length - 1) : picks.length;
          return {
            roundId: row.id,
            bet: Number(row.bet),
            bombs: Number(row.bombs),
            gems,
            multiplierX100: Number(row.multiplier_x100),
            payout: Number(row.payout),
            status: row.status as 'busted' | 'cashed_out',
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err) {
      logger.error('[arcade-mines] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/mines/verify/:id — public. Once a round is finalized we
  // return the seeds + grid + picks so anyone can independently confirm the
  // bombs were fixed at /start (matching `serverSeedHash`) and never moved.
  // While the round is active the server seed stays hidden — only the
  // commitment hash and (already-revealed) safe picks are returned.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/mines/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, bombs, bombs_grid, picks, multiplier_x100, status, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at, finalized_at
           FROM arcade_mines_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      const finalized = row.status !== 'active';
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        bombs: Number(row.bombs),
        picks: Array.isArray(row.picks) ? row.picks : [],
        multiplierX100: Number(row.multiplier_x100),
        payout: Number(row.payout),
        status: row.status,
        serverSeedHash: row.server_seed_hash,
        serverSeed: finalized ? row.server_seed : null,
        bombsGrid: finalized ? row.bombs_grid : null,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        finalizedAt: row.finalized_at,
        recipe:
          'For i in [24..(25-bombs)]: cursor=(24-i)*4; ' +
          'bytes=hmacByteStream(serverSeed, clientSeed, nonce, cursor); ' +
          'r=bytesToFloat(bytes); j=floor(r*(i+1)); swap(pool[i], pool[j]). ' +
          'bombsGrid = sorted(pool.slice(25-bombs)).',
      });
    } catch (err) {
      logger.error('[arcade-mines] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-mines] routes registered');
}
