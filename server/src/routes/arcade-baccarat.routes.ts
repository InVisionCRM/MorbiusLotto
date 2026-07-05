/**
 * arcade-baccarat.routes.ts — MORBIUS Arcade: Baccarat (Punto Banco).
 *
 * Endpoints for the Telegram Mini App and the web client (/baccarat):
 *   GET  /api/arcade/baccarat/info         — public: bet bounds + payouts
 *   POST /api/arcade/baccarat/play         — charge wagers, deal, settle in one txn
 *   GET  /api/arcade/baccarat/history      — authed: caller's recent hands
 *   GET  /api/arcade/baccarat/recent       — public: latest hands across players
 *   GET  /api/arcade/baccarat/leaderboard  — public: all-time top players by net
 *   GET  /api/arcade/baccarat/verify/:id   — public: provably-fair verification
 *
 * Auth on /play is the signed Telegram `initData` OR the SIWE morb_session
 * cookie (web /baccarat) — same dual-anchor scheme as arcade-limbo.routes.ts.
 * The whole round (bet debits, deal, payout credits, row insert) happens
 * inside one DB transaction so a round is atomic — never half-settled.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  dealBaccarat,
  resolvePayouts,
  sumPayouts,
  validateBets,
  BACC_MIN_BET,
  BACC_MAX_BET,
  BACC_PAY_PLAYER,
  BACC_PAY_BANKER,
  BACC_PAY_TIE,
  BACC_PAY_PAIR,
  type BaccaratBets,
} from '../services/arcade-baccarat';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeBaccaratRoutesOptions {
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

/** Coerce the raw bets payload into a fully-typed BaccaratBets (each field a non-negative integer). */
function sanitizeBets(raw: unknown): BaccaratBets {
  const r = (raw ?? {}) as Record<string, unknown>;
  const f = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    player: f(r.player),
    banker: f(r.banker),
    tie: f(r.tie),
    playerPair: f(r.playerPair),
    bankerPair: f(r.bankerPair),
  };
}

export function registerArcadeBaccaratRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeBaccaratRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /baccarat). Telegram wins when both are present so the Mini
   * App keeps working unchanged inside a browser that also has a web session.
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
  // GET /api/arcade/baccarat/info — public bounds + payouts so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/baccarat/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: BACC_MIN_BET,
      maxBet: BACC_MAX_BET,
      // Multipliers ×100 paid on a winning bet (gross — bet was debited).
      payouts: {
        player: BACC_PAY_PLAYER,
        banker: BACC_PAY_BANKER,
        tie: BACC_PAY_TIE,
        playerPair: BACC_PAY_PAIR,
        bankerPair: BACC_PAY_PAIR,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/baccarat/play — debit, deal, credit, insert in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/baccarat/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bets = sanitizeBets(req.body?.bets);
      const v = validateBets(bets);
      if (!v.ok) {
        return res.status(400).json({ ok: false, error: v.error ?? 'Invalid bets.' });
      }
      const totalBet = v.total;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Same Fisher-Yates shuffle used by Video Poker / Blackjack — the deck is
      // the full provably-fair commitment for this hand.
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const hand = dealBaccarat(deck);
      const payouts = resolvePayouts(bets, hand);
      const totalPayout = sumPayouts(payouts);

      const handId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charge the total wager — throws if the wallet can't cover it.
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-totalBet),
          'arcade_baccarat_bet',
          { type: 'arcade_baccarat', id: handId },
        );
        if (totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(totalPayout),
            'arcade_baccarat_payout',
            { type: 'arcade_baccarat', id: handId },
          );
        }
        await client.query(
          `INSERT INTO arcade_baccarat_hands
             (id, wallet_address, bets, total_bet, deck, player_cards, banker_cards,
              player_total, banker_total, result, player_pair, banker_pair,
              payouts, total_payout, server_seed, server_seed_hash, client_seed, nonce)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            handId,
            wallet.toLowerCase(),
            JSON.stringify(bets),
            totalBet,
            JSON.stringify(deck),
            JSON.stringify(hand.playerCards),
            JSON.stringify(hand.bankerCards),
            hand.playerTotal,
            hand.bankerTotal,
            hand.result,
            hand.playerPair,
            hand.bankerPair,
            JSON.stringify(payouts),
            totalPayout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
          ],
        );
      });

      return res.json({
        ok: true,
        handId,
        bets,
        totalBet,
        playerCards: hand.playerCards,
        bankerCards: hand.bankerCards,
        playerTotal: hand.playerTotal,
        bankerTotal: hand.bankerTotal,
        result: hand.result,
        playerPair: hand.playerPair,
        bankerPair: hand.bankerPair,
        payouts,
        totalPayout,
        serverSeedHash,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that wager.' });
      }
      logger.error('[arcade-baccarat] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/baccarat/history — caller's recent hands (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/baccarat/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bets, total_bet, player_cards, banker_cards, player_total, banker_total, result,
                player_pair, banker_pair, payouts, total_payout, created_at
           FROM arcade_baccarat_hands
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        hands: r.rows.map((row) => ({
          handId: row.id,
          bets: row.bets,
          totalBet: Number(row.total_bet),
          playerCards: row.player_cards,
          bankerCards: row.banker_cards,
          playerTotal: Number(row.player_total),
          bankerTotal: Number(row.banker_total),
          result: row.result,
          playerPair: !!row.player_pair,
          bankerPair: !!row.banker_pair,
          payouts: row.payouts,
          totalPayout: Number(row.total_payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-baccarat] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/baccarat/recent — public. Latest hands across all players
  // (also seeds the web client's bead road).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/baccarat/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, total_bet, player_total, banker_total, result,
                player_pair, banker_pair, total_payout, created_at
           FROM arcade_baccarat_hands
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        hands: r.rows.map((row) => ({
          handId: row.id,
          wallet: row.wallet_address,
          totalBet: Number(row.total_bet),
          playerTotal: Number(row.player_total),
          bankerTotal: Number(row.banker_total),
          result: row.result,
          playerPair: !!row.player_pair,
          bankerPair: !!row.banker_pair,
          totalPayout: Number(row.total_payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-baccarat] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/baccarat/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/baccarat/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS hands,
                SUM(total_bet)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(total_bet))::text AS net
           FROM arcade_baccarat_hands
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(total_bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          hands: Number(row.hands),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-baccarat] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/baccarat/verify/:id — public. Returns the published seeds
  // and the dealt cards so anyone can independently re-run the shuffle and
  // confirm the hand wasn't moved mid-round.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/baccarat/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bets, total_bet, deck, player_cards, banker_cards,
                player_total, banker_total, result, player_pair, banker_pair,
                payouts, total_payout, server_seed, server_seed_hash,
                client_seed, nonce, created_at
           FROM arcade_baccarat_hands WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Hand not found.' });
      }
      const row = r.rows[0];
      return res.json({
        ok: true,
        handId: row.id,
        bets: row.bets,
        totalBet: Number(row.total_bet),
        deck: row.deck,
        playerCards: row.player_cards,
        bankerCards: row.banker_cards,
        playerTotal: row.player_total,
        bankerTotal: row.banker_total,
        result: row.result,
        playerPair: row.player_pair,
        bankerPair: row.banker_pair,
        payouts: row.payouts,
        totalPayout: Number(row.total_payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce). ' +
          'Deal P1 = deck[0], B1 = deck[1], P2 = deck[2], B2 = deck[3], ' +
          'P3 = deck[4] (if player drew), B3 = deck[5] (if banker drew). ' +
          'Card value: A = 1, 2-9 = face, 10/J/Q/K = 0. Hand value = sum mod 10. ' +
          'Standard punto-banco third-card rules apply.',
      });
    } catch (err) {
      logger.error('[arcade-baccarat] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[arcade-baccarat] routes registered');
}
