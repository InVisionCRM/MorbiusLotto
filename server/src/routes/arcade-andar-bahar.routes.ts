/**
 * arcade-andar-bahar.routes.ts — MORBIUS Arcade: Andar Bahar.
 *
 * Endpoints for the Telegram Mini App + web (/andar-bahar):
 *   GET  /api/arcade/andar-bahar/info            — public: bet bounds + payouts + edge
 *   POST /api/arcade/andar-bahar/play            — charge bet, deal, settle in one txn
 *   GET  /api/arcade/andar-bahar/history         — caller's recent rounds
 *   GET  /api/arcade/andar-bahar/recent          — public: latest rounds across players
 *   GET  /api/arcade/andar-bahar/leaderboard     — public: all-time top players by net
 *   GET  /api/arcade/andar-bahar/verify/:id      — public: provably-fair verification
 *
 * The player picks a side (andar/bahar) + a bet; the round (bet debit, deal,
 * payout, row insert) happens in a single DB transaction so it's atomic — never
 * half-settled, never paid twice. Mirrors arcade-dicex2.routes.ts.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveAndarBahar,
  validateAndarBahar,
  AB_MIN_BET,
  AB_MAX_BET,
  AB_PAY_ANDAR,
  AB_PAY_BAHAR,
  AB_HOUSE_EDGE_BP,
  type AndarBaharSide,
  type AndarBaharResult,
} from '../services/arcade-andar-bahar';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeAndarBaharRoutesOptions {
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

export function registerArcadeAndarBaharRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeAndarBaharRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /andar-bahar). Telegram wins when both are present.
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
  // GET /api/arcade/andar-bahar/info — public bounds + payouts so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/andar-bahar/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: AB_MIN_BET,
      maxBet: AB_MAX_BET,
      payAndarX100: AB_PAY_ANDAR,
      payBaharX100: AB_PAY_BAHAR,
      houseEdgeBp: AB_HOUSE_EDGE_BP,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/andar-bahar/play — charge the bet, deal, settle in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/andar-bahar/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const side = req.body?.side as unknown;
      const bet = Math.floor(Number(req.body?.bet));
      const validation = validateAndarBahar(side, bet);
      if (!validation.ok) {
        return res.status(400).json({ ok: false, error: validation.error });
      }

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let result!: AndarBaharResult;
      let serverSeedHash = '';
      let nonce = 0;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_andar_bahar_bet',
          { type: 'arcade_andar_bahar', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the deal was
        // provably fixed in advance, not chosen at settle time. Same Fisher-Yates
        // 52-card shuffle primitive as before; only the seed provenance and the
        // (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, wallet);
        serverSeedHash = seed.serverSeedHash;
        nonce = seed.nonce;
        // Same primitive as Baccarat: a Fisher-Yates 52-card shuffle so the verifier
        // re-uses identical code. Only rank0 (idx % 13) decides the match.
        const deck = pf.fisherYatesShuffle(seed.serverSeed, seed.clientSeed, seed.nonce);
        result = resolveAndarBahar(deck, side as AndarBaharSide, bet);

        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_andar_bahar_payout',
            { type: 'arcade_andar_bahar', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO arcade_andar_bahar_rounds
             (id, wallet_address, side, bet, joker_card, andar_cards, bahar_cards,
              winning_side, match_index, won, payout, server_seed, server_seed_hash,
              client_seed, nonce, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12, $13, $14, $15)`,
          [
            roundId,
            wallet.toLowerCase(),
            side,
            bet,
            result.joker,
            JSON.stringify(result.andarCards),
            JSON.stringify(result.baharCards),
            result.winningSide,
            result.matchIndex,
            result.won,
            result.payout,
            serverSeedHash,
            seed.clientSeed,
            nonce,
            seed.seedPairId,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        side,
        bet,
        joker: result.joker,
        andarCards: result.andarCards,
        baharCards: result.baharCards,
        winningSide: result.winningSide,
        matchIndex: result.matchIndex,
        won: result.won,
        payout: result.payout,
        serverSeedHash,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-andar-bahar] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/andar-bahar/history — caller's recent rounds (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/andar-bahar/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, side, bet, joker_card, andar_cards, bahar_cards, winning_side,
                match_index, won, payout, created_at
           FROM arcade_andar_bahar_rounds
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          side: row.side,
          bet: Number(row.bet),
          joker: Number(row.joker_card),
          andarCards: row.andar_cards as number[],
          baharCards: row.bahar_cards as number[],
          winningSide: row.winning_side,
          matchIndex: Number(row.match_index),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-andar-bahar] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/andar-bahar/recent — public. Latest rounds across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/andar-bahar/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, side, bet, joker_card, winning_side, match_index,
                won, payout, created_at
           FROM arcade_andar_bahar_rounds
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          wallet: row.wallet_address,
          side: row.side,
          bet: Number(row.bet),
          joker: Number(row.joker_card),
          winningSide: row.winning_side,
          matchIndex: Number(row.match_index),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-andar-bahar] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/andar-bahar/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/andar-bahar/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_andar_bahar_rounds
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
      logger.error('[arcade-andar-bahar] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/andar-bahar/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive the joker + both piles.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/andar-bahar/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, side, bet, joker_card, andar_cards, bahar_cards, winning_side,
                match_index, won, payout, server_seed, server_seed_hash, client_seed,
                nonce, created_at, seed_pair_id
           FROM arcade_andar_bahar_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      // Plaintext server seed is revealed ONLY once the pair has been rotated —
      // until then the round exposes just the pre-published commitment.
      const reveal = await revealedSeedForRound(
        pool,
        row.seed_pair_id ?? null,
        row.server_seed ?? null,
      );
      // Re-derive the deal from the REVEALED seed so the verifier can confirm the
      // stored joker / piles / winner weren't tampered with server-side. Only
      // possible once the seed has been revealed; until then echo the stored deal.
      const recomputed = reveal.serverSeed
        ? resolveAndarBahar(
            pf.fisherYatesShuffle(reveal.serverSeed, row.client_seed, Number(row.nonce)),
            row.side as AndarBaharSide,
            Number(row.bet),
          )
        : null;
      return res.json({
        ok: true,
        roundId: row.id,
        side: row.side,
        bet: Number(row.bet),
        joker: Number(row.joker_card),
        andarCards: row.andar_cards as number[],
        baharCards: row.bahar_cards as number[],
        winningSide: row.winning_side,
        matchIndex: Number(row.match_index),
        won: row.won,
        payout: Number(row.payout),
        // Recomputed deal (from the revealed seed) for an independent check —
        // falls back to the stored deal while the seed is still committed.
        recomputedJoker: recomputed ? recomputed.joker : Number(row.joker_card),
        recomputedAndarCards: recomputed ? recomputed.andarCards : (row.andar_cards as number[]),
        recomputedBaharCards: recomputed ? recomputed.baharCards : (row.bahar_cards as number[]),
        recomputedWinningSide: recomputed
          ? recomputed.winningSide
          : (row.winning_side as AndarBaharSide),
        recomputedPayout: recomputed ? recomputed.payout : Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: AB_HOUSE_EDGE_BP,
        createdAt: row.created_at,
        recipe:
          'deck = fisherYatesShuffle(serverSeed, clientSeed, nonce) → 52 indices 0..51. ' +
          'joker = deck[0]; jokerRank = deck[0] % 13. ' +
          'Deal deck[1], deck[2], … alternately to Andar (first) then Bahar until a ' +
          'card with rank (idx % 13) === jokerRank; that pile wins. ' +
          'Andar pays 1.90× total, Bahar pays 2.00× total on a win. ' +
          'The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-andar-bahar] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-andar-bahar] routes registered');
}
