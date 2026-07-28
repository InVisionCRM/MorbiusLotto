/**
 * arcade-pai-gow-poker.routes.ts — MORBIUS Arcade: Pai Gow Poker.
 *
 * Endpoints (web /pai-gow-poker + Telegram Mini App):
 *   GET  /api/arcade/pai-gow-poker/info        — public: bounds + rules
 *   GET  /api/arcade/pai-gow-poker/active      — caller's dealt-but-unset hand (resume)
 *   POST /api/arcade/pai-gow-poker/deal        — debit the bet, shuffle, return
 *                                                ONLY the player's 7 cards + round id
 *   POST /api/arcade/pai-gow-poker/decision    — {roundId, lowIndices:[i,j]}: validate
 *                                                the split (no foul), set the dealer by
 *                                                the house way, reveal, settle, credit
 *   GET  /api/arcade/pai-gow-poker/history     — caller's settled hands
 *   GET  /api/arcade/pai-gow-poker/recent      — public: latest settled hands
 *   GET  /api/arcade/pai-gow-poker/leaderboard — public: top players by net
 *   GET  /api/arcade/pai-gow-poker/verify/:id  — public: seeds + deck recipe (settled only)
 *
 * Two-step session flow (mirrors Three Card Poker): /deal INSERTs status='active'
 * and debits the whole bet; /decision records the player's chosen split, sets the
 * dealer by the fixed house way, settles to status='settled' and credits the
 * payout. The deck (dealer's hand + the plaintext server seed) is sealed behind a
 * committed server-seed hash at /deal and only revealed once the hand settles.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * whole hand (debit → settle) is row-locked so a double-tap can't double-spend or
 * double-pay; `uniq_arcade_pai_gow_poker_active_per_wallet` is the DB backstop.
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
  PG_COMMISSION_BP,
  PG_HOUSE_EDGE_BP,
  validateBet,
  validateSplit,
  houseWaySplit,
  settlePaiGow,
} from '../services/arcade-pai-gow-poker';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadePaiGowPokerRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

/** Resolve the wallet linked to a Telegram `initData` payload, or null. */
async function walletFromInitData(dbService: DatabaseService, initData: unknown): Promise<string | null> {
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
    `SELECT id, wallet_address, bet, player_cards, dealer_cards, status,
            server_seed, server_seed_hash, client_seed, nonce
       FROM arcade_pai_gow_poker_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadePaiGowPokerRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadePaiGowPokerRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /** Caller's wallet: Telegram `initData` (Mini App) or SIWE morb_session cookie (web). */
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /info — public bounds + rules so the UI renders the numbers the server
  // enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('pai_gow_poker').min,
      maxBet: betLimits('pai_gow_poker').max,
      commissionBp: PG_COMMISSION_BP,
      houseEdgeBp: PG_HOUSE_EDGE_BP,
      rules: {
        winBoth: '1:1 minus 5% commission',
        winOne: 'push',
        loseBoth: 'bet lost',
        copies: 'to dealer',
        dealer: 'sets by house way',
        deck: 'standard 52 cards, no joker',
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /active — the wallet's dealt-but-unset hand, if any (resume on refresh).
  // Returns ONLY the player's 7 cards — the dealer's hand + server seed stay
  // sealed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const r = await pool.query(
        `SELECT id, bet, player_cards, server_seed_hash, client_seed, nonce
           FROM arcade_pai_gow_poker_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) return res.json({ ok: true, active: null });
      const row = r.rows[0];
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          playerCards: row.player_cards as number[],
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        },
      });
    } catch (err) {
      logger.error('[arcade-pai-gow-poker] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load hand state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /deal — debit the bet, shuffle a provably-fair deck, seal it, return
  // ONLY the player's 7 cards.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/pai-gow-poker/deal', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const v = validateBet(req.body?.bet);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const { bet } = v;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Whole deck fixed here behind the committed hash. Player = deck[0..6],
      // dealer = deck[7..13]; the dealer's hand never leaves the server until
      // the round settles.
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const playerCards = deck.slice(0, 7);
      const dealerCards = deck.slice(7, 14);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(client, wallet, BigInt(-bet), 'arcade_pai_gow_poker_bet', {
            type: 'arcade_pai_gow_poker',
            id: roundId,
          });
          await client.query(
            `INSERT INTO arcade_pai_gow_poker_rounds
               (id, wallet_address, bet, player_cards, dealer_cards,
                status, server_seed, server_seed_hash, client_seed, nonce)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'active', $6, $7, $8, $9)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              JSON.stringify(playerCards),
              JSON.stringify(dealerCards),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_pai_gow_poker_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({ ok: false, error: 'You already have a hand in play — finish it first.' });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        playerCards, // player must see their 7 cards to set them; dealer stays hidden
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
      logger.error('[arcade-pai-gow-poker] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not deal the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /decision — {roundId, lowIndices:[i,j]}. Validate the player's split
  // (must be 2 of their dealt cards and NOT foul the high hand), set the dealer
  // by the house way, reveal, settle and credit the payout. The bet was already
  // debited at /deal, so there is no further debit here.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/pai-gow-poker/decision', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) return res.status(400).json({ ok: false, error: 'Invalid round.' });

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Hand not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your hand.' } };
          return;
        }
        if (row.status !== 'active') {
          response = { status: 409, body: { ok: false, error: 'Hand already settled.', status: row.status } };
          return;
        }

        const bet = Number(row.bet);
        const playerCards = row.player_cards as number[];
        const dealerCards = row.dealer_cards as number[];

        // Validate the player's chosen 2-card low hand. Reject fouls here — the
        // client blocks Confirm on a foul, but the server is authoritative.
        const split = validateSplit(playerCards, req.body?.lowIndices);
        if (!split.ok) {
          response = { status: 400, body: { ok: false, error: split.error } };
          return;
        }
        const pLow = split.low;
        const pHigh = split.high;

        // Dealer always sets by the fixed house way.
        const dealer = houseWaySplit(dealerCards);
        const dLow = dealer.low;
        const dHigh = dealer.high;

        const s = settlePaiGow(pHigh, pLow, dHigh, dLow, bet);

        await client.query(
          `UPDATE arcade_pai_gow_poker_rounds
             SET player_low = $1::jsonb, player_high = $2::jsonb,
                 dealer_low = $3::jsonb, dealer_high = $4::jsonb,
                 result = $5, total_payout = $6, won = $7,
                 status = 'settled', settled_at = NOW()
           WHERE id = $8`,
          [
            JSON.stringify(pLow),
            JSON.stringify(pHigh),
            JSON.stringify(dLow),
            JSON.stringify(dHigh),
            s.result,
            s.totalPayout,
            s.won,
            roundId,
          ],
        );

        let chipBalance: bigint | null = null;
        if (s.totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(client, wallet, BigInt(s.totalPayout), 'arcade_pai_gow_poker_payout', {
            type: 'arcade_pai_gow_poker',
            id: roundId,
          });
        }

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            bet,
            playerCards,
            dealerCards,
            playerLow: pLow,
            playerHigh: pHigh,
            dealerLow: dLow,
            dealerHigh: dHigh,
            result: s.result,
            totalPayout: s.totalPayout,
            net: s.net,
            winHigh: s.winHigh,
            winLow: s.winLow,
            copyHigh: s.copyHigh,
            copyLow: s.copyLow,
            won: s.won,
            status: 'settled',
            serverSeed: row.server_seed,
            ...(chipBalance !== null ? { chipBalance: chipBalance.toString() } : {}),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not resolve the hand.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-pai-gow-poker] decision failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not resolve the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /history — caller's settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, player_cards, dealer_cards, player_low, player_high,
                dealer_low, dealer_high, result, total_payout, won, created_at
           FROM arcade_pai_gow_poker_rounds
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
          playerCards: row.player_cards as number[],
          dealerCards: row.dealer_cards as number[],
          playerLow: row.player_low as number[] | null,
          playerHigh: row.player_high as number[] | null,
          dealerLow: row.dealer_low as number[] | null,
          dealerHigh: row.dealer_high as number[] | null,
          result: row.result as string,
          totalPayout: Number(row.total_payout),
          net: Number(row.total_payout) - Number(row.bet),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-pai-gow-poker] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /recent — public. Latest settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, result, total_payout, won, created_at
           FROM arcade_pai_gow_poker_rounds
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
          result: row.result as string,
          committed: Number(row.bet),
          totalPayout: Number(row.total_payout),
          net: Number(row.total_payout) - Number(row.bet),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-pai-gow-poker] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /leaderboard — public. Top players by net (total returned − total bet).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS hands,
                SUM(bet)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(bet))::text AS net
           FROM arcade_pai_gow_poker_rounds
          WHERE status = 'settled'
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(bet) DESC
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
      logger.error('[arcade-pai-gow-poker] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /verify/:id — public, settled hands ONLY. Seeds + recipe so anyone can
  // re-derive the deck, re-run the dealer's house way and confirm the split +
  // settlement. An ACTIVE hand 404s (seed + dealer cards stay sealed).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pai-gow-poker/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, player_cards, dealer_cards, player_low, player_high,
                dealer_low, dealer_high, result, total_payout, won, status,
                server_seed, server_seed_hash, client_seed, nonce, created_at, settled_at
           FROM arcade_pai_gow_poker_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Hand not found.' });
      const row = r.rows[0];
      if (row.status === 'active') return res.status(404).json({ ok: false, error: 'Hand still in progress.' });
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        playerCards: row.player_cards as number[],
        dealerCards: row.dealer_cards as number[],
        playerLow: row.player_low as number[] | null,
        playerHigh: row.player_high as number[] | null,
        dealerLow: row.dealer_low as number[] | null,
        dealerHigh: row.dealer_high as number[] | null,
        result: row.result as string,
        totalPayout: Number(row.total_payout),
        committed: Number(row.bet),
        net: Number(row.total_payout) - Number(row.bet),
        won: !!row.won,
        status: row.status,
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          'deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce) → 52 indices 0..51. ' +
          'playerCards = deck[0..6]; dealerCards = deck[7..13]. ' +
          'rank = (idx % 13) + 2 (14 = Ace, high); suit = floor(idx / 13). ' +
          'The dealer sets by the fixed house way; win both hands = 1:1 minus 5% commission, ' +
          'win one = push, lose both = loss; copies (exact ties) go to the dealer.',
      });
    } catch (err) {
      logger.error('[arcade-pai-gow-poker] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[arcade-pai-gow-poker] routes registered');
}
