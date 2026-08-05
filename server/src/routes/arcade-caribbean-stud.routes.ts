/**
 * arcade-caribbean-stud.routes.ts — MORBIUS Arcade: Caribbean Stud Poker.
 *
 * Endpoints (web /caribbean-stud + Telegram Mini App):
 *   GET  /api/arcade/caribbean-stud/info         — public: bounds + paytables
 *   GET  /api/arcade/caribbean-stud/active       — caller's live hand (resume)
 *   POST /api/arcade/caribbean-stud/deal         — debit Ante (+ 5+1 Bonus),
 *                                                  shuffle, return the player's
 *                                                  5 cards + the dealer's UP
 *                                                  card only
 *   POST /api/arcade/caribbean-stud/decision     — {action:'call'|'fold'}:
 *                                                  debit the Call (2x Ante) on
 *                                                  a call, reveal the dealer,
 *                                                  settle, credit
 *   GET  /api/arcade/caribbean-stud/history      — caller's settled hands
 *   GET  /api/arcade/caribbean-stud/recent       — public: latest settled hands
 *   GET  /api/arcade/caribbean-stud/leaderboard  — public: top players by net
 *   GET  /api/arcade/caribbean-stud/verify/:id   — public: seeds + deck recipe
 *                                                  (settled hands ONLY)
 *
 * Two-step session flow, the same shape as Three Card Poker: /deal INSERTs
 * status='active' and debits the Ante (+ Bonus); /decision FINAL-UPDATEs to
 * status='settled', debits the Call, reveals the dealer's four down cards and
 * credits the payout. The dealer's down cards are sealed behind a committed
 * server-seed hash from /deal — the plaintext server seed is only published
 * when the hand settles.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * whole hand runs under a FOR UPDATE row lock so a double-tap can neither
 * double-spend nor double-pay, and
 * `uniq_arcade_caribbean_stud_active_per_wallet` enforces one live hand per
 * wallet at the DB level.
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
import { bestHand } from '../services/poker-hand-eval';
import {
  CS_CALL_PAY,
  CS_BONUS_PAY,
  CS_CATEGORY_NAME,
  CS_PAYING_ORDER,
  CS_BONUS_PAYING_ORDER,
  CS_HOUSE_EDGE_ANTE_BP,
  CS_HOUSE_EDGE_BONUS_BP,
  csBonusHand,
  settleCaribbeanStud,
  validateCsDeal,
} from '../services/arcade-caribbean-stud';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeCaribbeanStudRoutesOptions {
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
    `SELECT id, wallet_address, ante, bonus, call_bet, player_cards, dealer_cards,
            status, server_seed, server_seed_hash, client_seed, nonce
       FROM arcade_caribbean_stud_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeCaribbeanStudRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeCaribbeanStudRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[
      SESSION_COOKIE_NAME
    ];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /info — public bounds + paytables.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/info', (_req: Request, res: Response) => {
    const l = betLimits('caribbean_stud');
    res.json({
      ok: true,
      minBet: l.min,
      maxBet: l.max,
      callPay: CS_CALL_PAY,
      bonusPay: CS_BONUS_PAY,
      categoryNames: CS_CATEGORY_NAME,
      payingOrder: CS_PAYING_ORDER,
      bonusPayingOrder: CS_BONUS_PAYING_ORDER,
      callMultiple: 2,
      dealerQualify: 'Ace-King high or better',
      houseEdgeAnteBp: CS_HOUSE_EDGE_ANTE_BP,
      houseEdgeBonusBp: CS_HOUSE_EDGE_BONUS_BP,
    });
  });

  // -------------------------------------------------------------------------
  // GET /active — the wallet's live hand, so a refresh between deal and
  // decision resumes rather than stranding the already-debited Ante. Returns
  // the player's five cards and the dealer's UP CARD only.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const r = await pool.query(
        `SELECT id, ante, bonus, player_cards, dealer_cards, server_seed_hash,
                client_seed, nonce
           FROM arcade_caribbean_stud_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) return res.json({ ok: true, active: null });

      const row = r.rows[0];
      const dealer = row.dealer_cards as number[];
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          ante: Number(row.ante),
          bonus: Number(row.bonus),
          callBet: Number(row.ante) * 2,
          playerCards: row.player_cards as number[],
          dealerUpCard: dealer[0],
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        },
      });
    } catch (err) {
      logger.error('[arcade-caribbean-stud] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load hand state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /deal — debit the Ante (+ Bonus), shuffle, return the player's five
  // cards and the dealer's up card.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/caribbean-stud/deal', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const v = validateCsDeal(req.body?.ante, req.body?.bonus);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const { ante, bonus } = v;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Both full hands are fixed here, behind the committed hash. Only the
      // dealer's first card is exposed; the other four stay on the server.
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const playerCards = deck.slice(0, 5);
      const dealerCards = deck.slice(5, 10);

      const roundId = crypto.randomUUID();
      const cost = ante + bonus;
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-cost),
            'arcade_caribbean_stud_bet',
            { type: 'arcade_caribbean_stud', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_caribbean_stud_rounds
               (id, wallet_address, ante, bonus, call_bet, player_cards,
                dealer_cards, status, server_seed, server_seed_hash,
                client_seed, nonce)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb,
                     'active', $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              ante,
              bonus,
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
        if (/uniq_arcade_caribbean_stud_active_per_wallet|duplicate key/i.test(msg)) {
          return res
            .status(409)
            .json({ ok: false, error: 'You already have a hand in play — finish it first.' });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        ante,
        bonus,
        callBet: ante * 2,
        playerCards,
        dealerUpCard: dealerCards[0],
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
      logger.error('[arcade-caribbean-stud] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not deal the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /decision — {roundId, action:'call'|'fold'}.
  //
  // 'call' debits 2x the Ante, reveals the dealer's four down cards and
  // settles; 'fold' forfeits the Ante. The 5+1 Bonus resolves either way.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/caribbean-stud/decision', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const roundId = String(req.body?.roundId ?? '');
      const action = req.body?.action;
      if (!roundId) return res.status(400).json({ ok: false, error: 'Invalid round.' });
      if (action !== 'call' && action !== 'fold') {
        return res.status(400).json({ ok: false, error: "Action must be 'call' or 'fold'." });
      }
      const folded = action === 'fold';

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
          response = {
            status: 409,
            body: { ok: false, error: 'Hand already settled.', status: row.status },
          };
          return;
        }

        const ante = Number(row.ante);
        const bonus = Number(row.bonus);
        const playerCards = row.player_cards as number[];
        const dealerCards = row.dealer_cards as number[];
        const call = folded ? 0 : ante * 2;

        let chipBalance: bigint | null = null;
        if (call > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-call),
            'arcade_caribbean_stud_bet',
            { type: 'arcade_caribbean_stud', id: roundId },
          );
        }

        const playerHand = bestHand(playerCards);
        const dealerHand = bestHand(dealerCards);
        // The 5+1 Bonus uses the dealer's UP card only — the same card the
        // player could see when they decided.
        const bonusHand = bonus > 0 ? csBonusHand(playerCards, dealerCards[0]) : null;
        const s = settleCaribbeanStud(
          playerHand,
          dealerHand,
          ante,
          call,
          bonus,
          folded,
          bonusHand,
        );

        await client.query(
          `UPDATE arcade_caribbean_stud_rounds
             SET call_bet = $1, result = $2, player_category = $3,
                 dealer_category = $4, dealer_qualified = $5, ante_payout = $6,
                 call_payout = $7, bonus_payout = $8, total_payout = $9,
                 won = $10, status = 'settled', settled_at = NOW()
           WHERE id = $11`,
          [
            call,
            s.result,
            s.playerCategory,
            s.dealerCategory,
            s.dealerQualified,
            s.antePayout,
            s.callPayout,
            s.bonusPayout,
            s.totalPayout,
            s.won,
            roundId,
          ],
        );

        if (s.totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(s.totalPayout),
            'arcade_caribbean_stud_payout',
            { type: 'arcade_caribbean_stud', id: roundId },
          );
        }

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            action,
            folded,
            ante,
            bonus,
            call,
            playerCards,
            dealerCards,
            playerCategory: s.playerCategory,
            playerCategoryName: CS_CATEGORY_NAME[s.playerCategory],
            dealerCategory: s.dealerCategory,
            dealerCategoryName: CS_CATEGORY_NAME[s.dealerCategory],
            dealerQualified: s.dealerQualified,
            result: s.result,
            antePayout: s.antePayout,
            callPayout: s.callPayout,
            bonusPayout: s.bonusPayout,
            totalPayout: s.totalPayout,
            committed: s.committed,
            won: s.won,
            winSide: s.winSide,
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
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for the Call bet.' });
      }
      logger.error('[arcade-caribbean-stud] decision failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not resolve the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /history — caller's settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, ante, bonus, call_bet, player_cards, dealer_cards, result,
                player_category, dealer_category, dealer_qualified, ante_payout,
                call_payout, bonus_payout, total_payout, won, created_at
           FROM arcade_caribbean_stud_rounds
          WHERE wallet_address = $1 AND status = 'settled'
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          ante: Number(row.ante),
          bonus: Number(row.bonus),
          call: Number(row.call_bet),
          playerCards: row.player_cards as number[],
          dealerCards: row.dealer_cards as number[],
          result: row.result as string,
          playerCategory: row.player_category as string | null,
          dealerCategory: row.dealer_category as string | null,
          dealerQualified: row.dealer_qualified as boolean | null,
          antePayout: Number(row.ante_payout),
          callPayout: Number(row.call_payout),
          bonusPayout: Number(row.bonus_payout),
          totalPayout: Number(row.total_payout),
          committed: Number(row.ante) + Number(row.bonus) + Number(row.call_bet),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-caribbean-stud] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /recent — public. Latest settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, ante, bonus, call_bet, result,
                player_category, total_payout, won, created_at
           FROM arcade_caribbean_stud_rounds
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
          ante: Number(row.ante),
          committed: Number(row.ante) + Number(row.bonus) + Number(row.call_bet),
          result: row.result as string,
          playerCategory: row.player_category as string | null,
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-caribbean-stud] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /leaderboard — public. Net = returned − committed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS hands,
                SUM(ante + bonus + call_bet)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(ante + bonus + call_bet))::text AS net
           FROM arcade_caribbean_stud_rounds
          WHERE status = 'settled'
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(ante + bonus + call_bet) DESC
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
      logger.error('[arcade-caribbean-stud] leaderboard failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /verify/:id — public, settled hands ONLY.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/caribbean-stud/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, ante, bonus, call_bet, player_cards, dealer_cards, result,
                player_category, dealer_category, dealer_qualified, ante_payout,
                call_payout, bonus_payout, total_payout, won, status,
                server_seed, server_seed_hash, client_seed, nonce,
                created_at, settled_at
           FROM arcade_caribbean_stud_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Hand not found.' });
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Hand still in progress.' });
      }
      return res.json({
        ok: true,
        roundId: row.id,
        ante: Number(row.ante),
        bonus: Number(row.bonus),
        call: Number(row.call_bet),
        playerCards: row.player_cards as number[],
        dealerCards: row.dealer_cards as number[],
        result: row.result as string,
        playerCategory: row.player_category as string | null,
        dealerCategory: row.dealer_category as string | null,
        dealerQualified: row.dealer_qualified as boolean | null,
        antePayout: Number(row.ante_payout),
        callPayout: Number(row.call_payout),
        bonusPayout: Number(row.bonus_payout),
        totalPayout: Number(row.total_payout),
        committed: Number(row.ante) + Number(row.bonus) + Number(row.call_bet),
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
          'playerCards = deck[0..4]; dealerCards = deck[5..9], and deck[5] is the up card. ' +
          'rank = (idx % 13) + 2 (14 = Ace, high); suit = floor(idx / 13). ' +
          'Standard 5-card poker ranking. The dealer qualifies on Ace-King high or better; ' +
          'when the dealer misses, the Ante pays 1:1 and the Call pushes. ' +
          'The 5+1 Bonus scores the best 6-card hand from playerCards + deck[5].',
      });
    } catch (err) {
      logger.error('[arcade-caribbean-stud] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[arcade-caribbean-stud] routes registered');
}
