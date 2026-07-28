/**
 * arcade-hilo.routes.ts — MORBIUS Arcade: Hi-Lo (card higher/lower).
 *
 * Endpoints for the Telegram Mini App and the web client (/hilo):
 *   GET  /api/arcade/hilo/info        — public: bet bounds + house edge + caps
 *   POST /api/arcade/hilo/state       — return the wallet's active round (if any)
 *   POST /api/arcade/hilo/start       — debit bet, seed the round, deal base card
 *   POST /api/arcade/hilo/pick        — reveal next card; win bumps multiplier,
 *                                       lose finalizes 'busted'
 *   POST /api/arcade/hilo/cashout     — bank the current multiplier as a payout
 *   GET  /api/arcade/hilo/history     — caller's settled rounds (web panel)
 *   GET  /api/arcade/hilo/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/hilo/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/hilo/verify/:id  — public: re-derivable card recipe
 *
 * Stateful flow mirrors Mines: /start INSERTs status='active' and debits the
 * bet; /pick UPDATEs cards + multiplier or finalizes 'busted'; /cashout pays
 * out and finalizes 'cashed_out'. The server seed is only revealed when the
 * round is finalized — that's what makes the round verifiable (and why
 * /verify must NEVER publish it mid-round: the seed derives future cards).
 *
 * Auth on /state, /start, /pick, /cashout and /history is the signed Telegram
 * `initData` (Mini App) or the SIWE morb_session cookie (web /hilo) — see
 * `resolveWallet`. Wallet locks are taken via SELECT … FOR UPDATE on the
 * round row so a double-tap can't double-spend or double-pay. The
 * `uniq_arcade_hilo_active_per_wallet` partial unique index also guarantees
 * one active round per wallet at the DB level — defence-in-depth against a
 * flurry of /start clicks.
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
  HILO_HOUSE_EDGE_BP,
  HILO_MAX_PICKS,
  advanceHiLoMultiplier,
  deriveHiLoCard,
  hiLoPayout,
  hiLoWinDenominator,
  isHiLoWin,
  type HiLoDirection,
} from '../services/arcade-hilo';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeHiLoRoutesOptions {
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

function isValidDirection(d: unknown): d is HiLoDirection {
  return d === 'hi' || d === 'lo';
}

/** SELECT … FOR UPDATE the round row inside an open transaction. */
async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, bet, cards, picks, multiplier_x100, status,
            server_seed, server_seed_hash, client_seed, nonce, house_edge_bp
       FROM arcade_hilo_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

/** Map a card index 0..51 to a JSON shape the client can render. */
function cardJson(index: number) {
  return { index, rank: (index % 13) + 1, suit: Math.floor(index / 13) };
}

export function registerArcadeHiLoRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeHiLoRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /hilo). Telegram wins when both are present so the Mini App
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
  // GET /api/arcade/hilo/info — public bounds + house edge so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/hilo/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('hilo').min,
      maxBet: betLimits('hilo').max,
      maxPicks: HILO_MAX_PICKS,
      houseEdgeBp: HILO_HOUSE_EDGE_BP,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/hilo/state — return the wallet's active round (if any).
  // Used by the client on screen mount so a partly-played round survives a
  // page refresh or a Telegram restart.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/hilo/state', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, cards, picks, multiplier_x100, server_seed_hash, client_seed,
                nonce, house_edge_bp
           FROM arcade_hilo_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const cards = Array.isArray(row.cards) ? (row.cards as number[]) : [];
      const picks = Array.isArray(row.picks) ? (row.picks as HiLoDirection[]) : [];
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          cards: cards.map(cardJson),
          picks,
          multiplierX100: Number(row.multiplier_x100),
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
          houseEdgeBp: Number(row.house_edge_bp),
          maxPicks: HILO_MAX_PICKS,
        },
      });
    } catch (err) {
      logger.error('[arcade-hilo] state failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/hilo/start — debit the bet, seed the round, deal base card.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/hilo/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('hilo').min || bet > betLimits('hilo').max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${betLimits('hilo').min} and ${betLimits('hilo').max} chips.`,
        });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Base card — cursor 0. Any subsequent /pick consumes cursor = N*4 where
      // N is the new card's index in `cards`.
      const baseCard = deriveHiLoCard(
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
        0,
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_hilo_bet',
            { type: 'arcade_hilo', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_hilo_rounds
               (id, wallet_address, bet, cards, picks,
                multiplier_x100, status, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb,
                     100, 'active', 0,
                     $5, $6, $7, $8, $9)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              JSON.stringify([baseCard.index]),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              HILO_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_hilo_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Hi-Lo round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        cards: [cardJson(baseCard.index)],
        picks: [] as HiLoDirection[],
        multiplierX100: 100,
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: HILO_HOUSE_EDGE_BP,
        maxPicks: HILO_MAX_PICKS,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-hilo] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/hilo/pick — reveal the next card. Win → bump multiplier,
  // lose → finalize 'busted'.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/hilo/pick', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      const direction = req.body?.direction;
      if (!roundId || !isValidDirection(direction)) {
        return res.status(400).json({ ok: false, error: 'Invalid round or direction.' });
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

        const cards: number[] = Array.isArray(row.cards) ? row.cards : [];
        const picks: HiLoDirection[] = Array.isArray(row.picks) ? row.picks : [];
        if (cards.length === 0) {
          response = { status: 500, body: { ok: false, error: 'Round is corrupt.' } };
          return;
        }
        if (picks.length >= HILO_MAX_PICKS) {
          response = {
            status: 400,
            body: {
              ok: false,
              error: 'Max picks reached for this round — cash out to finish.',
            },
          };
          return;
        }

        // Reject impossible picks (lo from Ace, hi from King): these have a 0
        // win-denominator and would divide by zero in the multiplier math.
        const prevRank = (cards[cards.length - 1]! % 13) + 1;
        if (hiLoWinDenominator(direction, prevRank) <= 0) {
          response = {
            status: 400,
            body: {
              ok: false,
              error:
                direction === 'hi'
                  ? 'No card is strictly higher than a King — pick the other side.'
                  : 'No card is strictly lower than an Ace — pick the other side.',
            },
          };
          return;
        }

        // Deal the next card from cursor = cards.length * 4 (cards.length is
        // also the next card's chronological index, 1-based off the base).
        const nextCard = deriveHiLoCard(
          (cursor) =>
            pf.hmacByteStream(row.server_seed, row.client_seed, Number(row.nonce), cursor),
          (b) => pf.bytesToFloat(b),
          cards.length,
        );
        const newCards = [...cards, nextCard.index];
        const newPicks = [...picks, direction];

        if (!isHiLoWin(direction, prevRank, nextCard.rank)) {
          // Bust — finalize with the losing reveal in cards/picks tail. No payout.
          await client.query(
            `UPDATE arcade_hilo_rounds
               SET cards = $1::jsonb,
                   picks = $2::jsonb,
                   status = 'busted',
                   finalized_at = NOW()
             WHERE id = $3`,
            [JSON.stringify(newCards), JSON.stringify(newPicks), roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              safe: false,
              direction,
              card: cardJson(nextCard.index),
              cards: newCards.map(cardJson),
              picks: newPicks,
              status: 'busted',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        const newMultiplierX100 = advanceHiLoMultiplier(
          Number(row.multiplier_x100),
          direction,
          prevRank,
        );
        await client.query(
          `UPDATE arcade_hilo_rounds
             SET cards = $1::jsonb,
                 picks = $2::jsonb,
                 multiplier_x100 = $3
           WHERE id = $4`,
          [JSON.stringify(newCards), JSON.stringify(newPicks), newMultiplierX100, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            safe: true,
            direction,
            card: cardJson(nextCard.index),
            cards: newCards.map(cardJson),
            picks: newPicks,
            multiplierX100: newMultiplierX100,
            cashoutPayout: hiLoPayout(Number(row.bet), newMultiplierX100),
            picksRemaining: HILO_MAX_PICKS - newPicks.length,
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not resolve the pick.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-hilo] pick failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not resolve the pick.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/hilo/cashout — bank the current multiplier as a payout.
  // Must be called while status='active' AND at least one correct pick made.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/hilo/cashout', async (req: Request, res: Response) => {
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
        const picks: HiLoDirection[] = Array.isArray(row.picks) ? row.picks : [];
        if (picks.length === 0) {
          response = {
            status: 400,
            body: { ok: false, error: 'Make at least one correct pick before cashing out.' },
          };
          return;
        }

        const payout = hiLoPayout(Number(row.bet), Number(row.multiplier_x100));
        await client.query(
          `UPDATE arcade_hilo_rounds
             SET status = 'cashed_out', payout = $1, finalized_at = NOW()
           WHERE id = $2`,
          [payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_hilo_payout',
          { type: 'arcade_hilo', id: roundId },
        );

        const cards: number[] = Array.isArray(row.cards) ? row.cards : [];
        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            cards: cards.map(cardJson),
            picks,
            multiplierX100: Number(row.multiplier_x100),
            payout,
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
      logger.error('[arcade-hilo] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/hilo/history — caller's recent settled rounds for the web
  // history panel. Cookie-auth only in practice (GET has no body, so
  // resolveWallet falls through to the SIWE session); the Mini App doesn't
  // render a history list. Active rounds are excluded — they resume via /state.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/hilo/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, cards, picks, multiplier_x100, payout, status, created_at
           FROM arcade_hilo_rounds
          WHERE wallet_address = $1 AND status <> 'active'
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => {
          const picks = Array.isArray(row.picks) ? (row.picks as HiLoDirection[]) : [];
          const cards = Array.isArray(row.cards) ? (row.cards as number[]) : [];
          // On a bust the picks tail is the losing guess — don't count it as a win.
          const wins = row.status === 'busted' ? Math.max(0, picks.length - 1) : picks.length;
          return {
            roundId: row.id,
            bet: Number(row.bet),
            picks: picks.length,
            wins,
            // Full reveal for the client-side replay (finalized rounds only).
            cards: cards.map(cardJson),
            guesses: picks,
            multiplierX100: Number(row.multiplier_x100),
            payout: Number(row.payout),
            status: row.status as 'busted' | 'cashed_out',
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err) {
      logger.error('[arcade-hilo] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/hilo/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/hilo/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, picks, multiplier_x100, payout, status, created_at
           FROM arcade_hilo_rounds
          WHERE status <> 'active'
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => {
          const picks = Array.isArray(row.picks) ? (row.picks as HiLoDirection[]) : [];
          const wins = row.status === 'busted' ? Math.max(0, picks.length - 1) : picks.length;
          return {
            roundId: row.id,
            wallet: row.wallet_address,
            bet: Number(row.bet),
            picks: picks.length,
            wins,
            multiplierX100: Number(row.multiplier_x100),
            payout: Number(row.payout),
            status: row.status as 'busted' | 'cashed_out',
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err) {
      logger.error('[arcade-hilo] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/hilo/leaderboard — public. All-time top players by net
  // chips across settled rounds (active rounds are still in flight — their
  // debited bet would read as a loss until the round finalizes).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/hilo/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_hilo_rounds
          WHERE status <> 'active'
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
      logger.error('[arcade-hilo] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/hilo/verify/:id — public. Once a round is finalized we
  // return the seeds + cards + picks so anyone can independently confirm the
  // deck was fixed at /start (matching `serverSeedHash`) and never re-dealt.
  // While the round is active the server seed stays hidden — only the
  // commitment hash and already-revealed cards are returned.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/hilo/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, cards, picks, multiplier_x100, status, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at, finalized_at
           FROM arcade_hilo_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      const finalized = row.status !== 'active';
      const cards = Array.isArray(row.cards) ? (row.cards as number[]) : [];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        cards: cards.map(cardJson),
        picks: Array.isArray(row.picks) ? row.picks : [],
        multiplierX100: Number(row.multiplier_x100),
        payout: Number(row.payout),
        status: row.status,
        serverSeedHash: row.server_seed_hash,
        serverSeed: finalized ? row.server_seed : null,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        finalizedAt: row.finalized_at,
        recipe:
          'For each card N=0..cards.length-1: ' +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, N*4); ' +
          'r = bytesToFloat(bytes); ' +
          'cardIndex = min(51, floor(r * 52)); ' +
          'rank = (cardIndex % 13) + 1; suit = floor(cardIndex / 13). ' +
          "Direction 'hi' wins on next.rank >= prev.rank; 'lo' on next.rank < prev.rank.",
      });
    } catch (err) {
      logger.error('[arcade-hilo] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-hilo] routes registered');
}
