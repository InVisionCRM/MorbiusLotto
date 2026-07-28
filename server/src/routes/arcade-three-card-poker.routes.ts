/**
 * arcade-three-card-poker.routes.ts — MORBIUS Arcade: Three Card Poker.
 *
 * Endpoints (web /three-card-poker + Telegram Mini App):
 *   GET  /api/arcade/three-card-poker/info        — public: bounds + paytables
 *   GET  /api/arcade/three-card-poker/active       — caller's active hand (resume)
 *   POST /api/arcade/three-card-poker/deal         — debit Ante (+ Pair Plus),
 *                                                    shuffle, return ONLY the
 *                                                    player's 3 cards + round id
 *   POST /api/arcade/three-card-poker/decision     — {action:'play'|'fold'}:
 *                                                    debit Play (on play), reveal
 *                                                    the dealer, settle, credit
 *   GET  /api/arcade/three-card-poker/history      — caller's settled hands
 *   GET  /api/arcade/three-card-poker/recent       — public: latest settled hands
 *   GET  /api/arcade/three-card-poker/leaderboard  — public: top players by net
 *   GET  /api/arcade/three-card-poker/verify/:id   — public: seeds + deck recipe
 *                                                    (settled hands ONLY)
 *
 * Two-step session flow (mirrors Chicken): /deal INSERTs status='active' and
 * debits the Ante (+ Pair Plus); /decision FINAL-UPDATEs status='settled',
 * debits the Play bet on 'play', reveals the dealer, settles and credits the
 * payout. The deck (and therefore the dealer's hand) is sealed behind a
 * committed server-seed hash at /deal — the plaintext server seed AND the
 * dealer's cards are only revealed when the hand settles.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * whole hand (debit → settle) is wrapped in row-level locking so a double-tap
 * can't double-spend or double-pay. The
 * `uniq_arcade_three_card_poker_active_per_wallet` partial unique index also
 * guarantees one active hand per wallet at the DB level.
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
  TCP_PAIR_PLUS_PAY,
  TCP_ANTE_BONUS,
  TCP_HOUSE_EDGE_ANTE_BP,
  TCP_HOUSE_EDGE_PAIR_PLUS_BP,
  evaluate3,
  dealerQualifies,
  settleThreeCard,
  validateDeal,
} from '../services/arcade-three-card-poker';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeThreeCardPokerRoutesOptions {
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
    `SELECT id, wallet_address, ante, pair_plus, play, player_cards, dealer_cards,
            result, ante_payout, pairplus_payout, total_payout, won, status,
            server_seed, server_seed_hash, client_seed, nonce
       FROM arcade_three_card_poker_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeThreeCardPokerRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeThreeCardPokerRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web). Telegram wins when both are present.
   */
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
  // GET /api/arcade/three-card-poker/info — public bounds + paytables so the UI
  // always renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('three_card_poker').min,
      maxBet: betLimits('three_card_poker').max,
      // Net odds (X:1) by 3-card category index (5=SF .. 1=pair).
      pairPlusPay: TCP_PAIR_PLUS_PAY,
      anteBonus: TCP_ANTE_BONUS,
      dealerQualify: 'Queen-high or better',
      houseEdgeAnteBp: TCP_HOUSE_EDGE_ANTE_BP,
      houseEdgePairPlusBp: TCP_HOUSE_EDGE_PAIR_PLUS_BP,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/three-card-poker/active — the wallet's active (dealt,
  // undecided) hand, if any. Used on mount so a refresh between deal and
  // decision resumes the hand. Returns ONLY the player's 3 cards — the dealer's
  // hand and the server seed stay sealed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, ante, pair_plus, player_cards, server_seed_hash
           FROM arcade_three_card_poker_rounds
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
          ante: Number(row.ante),
          pairPlus: Number(row.pair_plus),
          playerCards: row.player_cards as number[],
          serverSeedHash: row.server_seed_hash,
        },
      });
    } catch (err) {
      logger.error('[arcade-three-card-poker] active failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'Could not load hand state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/three-card-poker/deal — debit the Ante (+ Pair Plus),
  // shuffle a provably-fair deck, seal it, return ONLY the player's 3 cards.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/three-card-poker/deal', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const v = validateDeal(req.body?.ante, req.body?.pairPlus);
      if (!v.ok) {
        return res.status(400).json({ ok: false, error: v.error });
      }
      const { ante, pairPlus } = v;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Whole deck is fixed here, behind the committed hash. Player gets the
      // first 3 cards, dealer the next 3 — both sealed; the dealer's hand never
      // leaves the server until the round settles.
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const playerCards = [deck[0], deck[1], deck[2]];
      const dealerCards = [deck[3], deck[4], deck[5]];

      const roundId = crypto.randomUUID();
      const cost = ante + pairPlus;
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-cost),
            'arcade_three_card_poker_bet',
            { type: 'arcade_three_card_poker', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_three_card_poker_rounds
               (id, wallet_address, ante, pair_plus, play, player_cards, dealer_cards,
                status, server_seed, server_seed_hash, client_seed, nonce)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb,
                     'active', $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              ante,
              pairPlus,
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
        if (/uniq_arcade_three_card_poker_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have a hand in play — finish it first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        ante,
        pairPlus,
        // Player must see their hand to decide; dealer stays hidden.
        playerCards,
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
      logger.error('[arcade-three-card-poker] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not deal the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/three-card-poker/decision — {action:'play'|'fold'}.
  // 'play' debits the Play bet (= Ante), reveals the dealer and settles;
  // 'fold' forfeits the Ante (and Pair Plus). Either way the hand is settled,
  // the dealer's cards + the server seed are now public, and the net payout
  // (if any) is credited.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/three-card-poker/decision', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      const action = req.body?.action;
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }
      if (action !== 'play' && action !== 'fold') {
        return res.status(400).json({ ok: false, error: "Action must be 'play' or 'fold'." });
      }
      const played = action === 'play';

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
        const pairPlus = Number(row.pair_plus);
        const playerCards = row.player_cards as number[];
        const dealerCards = row.dealer_cards as number[];
        const playerEval = evaluate3(playerCards);
        const dealerEval = evaluate3(dealerCards);

        // On 'play', the Play bet (= Ante) is debited now.
        let chipBalance: bigint | null = null;
        if (played) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-ante),
            'arcade_three_card_poker_bet',
            { type: 'arcade_three_card_poker', id: roundId },
          );
        }

        const s = settleThreeCard(playerEval, dealerEval, ante, pairPlus, played);
        const play = played ? ante : 0;

        await client.query(
          `UPDATE arcade_three_card_poker_rounds
             SET play = $1,
                 result = $2,
                 ante_payout = $3,
                 pairplus_payout = $4,
                 total_payout = $5,
                 won = $6,
                 status = 'settled',
                 settled_at = NOW()
           WHERE id = $7`,
          [
            play,
            s.result,
            s.antePayout,
            s.pairPlusPayout,
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
            'arcade_three_card_poker_payout',
            { type: 'arcade_three_card_poker', id: roundId },
          );
        }

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            action,
            played,
            ante,
            pairPlus,
            play,
            playerCards,
            dealerCards,
            dealerQualifies: dealerQualifies(dealerEval),
            result: s.result,
            antePayout: s.antePayout,
            pairPlusPayout: s.pairPlusPayout,
            totalPayout: s.totalPayout,
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
        return res.status(400).json({ ok: false, error: 'Not enough chips for the Play bet.' });
      }
      logger.error('[arcade-three-card-poker] decision failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not resolve the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/three-card-poker/history — caller's settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, ante, pair_plus, play, player_cards, dealer_cards, result,
                ante_payout, pairplus_payout, total_payout, won, created_at
           FROM arcade_three_card_poker_rounds
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
          pairPlus: Number(row.pair_plus),
          play: Number(row.play),
          playerCards: row.player_cards as number[],
          dealerCards: row.dealer_cards as number[],
          result: row.result as string,
          antePayout: Number(row.ante_payout),
          pairPlusPayout: Number(row.pairplus_payout),
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-three-card-poker] history failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/three-card-poker/recent — public. Latest settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, ante, pair_plus, play, result,
                total_payout, won, created_at
           FROM arcade_three_card_poker_rounds
          WHERE status = 'settled'
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => {
          const committed = Number(row.ante) + Number(row.play) + Number(row.pair_plus);
          return {
            roundId: row.id,
            wallet: row.wallet_address,
            ante: Number(row.ante),
            pairPlus: Number(row.pair_plus),
            play: Number(row.play),
            result: row.result as string,
            committed,
            totalPayout: Number(row.total_payout),
            won: !!row.won,
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err) {
      logger.error('[arcade-three-card-poker] recent failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/three-card-poker/leaderboard — public. Top players by net.
  // Net = total returned − total committed (ante + play + pair_plus).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS hands,
                SUM(ante + play + pair_plus)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(ante + play + pair_plus))::text AS net
           FROM arcade_three_card_poker_rounds
          WHERE status = 'settled'
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(ante + play + pair_plus) DESC
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
      logger.error('[arcade-three-card-poker] leaderboard failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/three-card-poker/verify/:id — public, settled hands ONLY.
  // Returns the seeds + the recipe so anyone can re-derive the deck and confirm
  // both hands were fixed at /deal (matching `serverSeedHash`) and never moved.
  // An ACTIVE hand 404s (its server seed and dealer cards stay sealed).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/three-card-poker/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, ante, pair_plus, play, player_cards, dealer_cards, result,
                ante_payout, pairplus_payout, total_payout, won, status,
                server_seed, server_seed_hash, client_seed, nonce,
                created_at, settled_at
           FROM arcade_three_card_poker_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Hand not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Hand still in progress.' });
      }
      const committed = Number(row.ante) + Number(row.play) + Number(row.pair_plus);
      return res.json({
        ok: true,
        roundId: row.id,
        ante: Number(row.ante),
        pairPlus: Number(row.pair_plus),
        play: Number(row.play),
        playerCards: row.player_cards as number[],
        dealerCards: row.dealer_cards as number[],
        result: row.result as string,
        antePayout: Number(row.ante_payout),
        pairPlusPayout: Number(row.pairplus_payout),
        totalPayout: Number(row.total_payout),
        committed,
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
          'playerCards = deck[0,1,2]; dealerCards = deck[3,4,5]. ' +
          'rank = (idx % 13) + 2 (14 = Ace, high); suit = floor(idx / 13). ' +
          '3-card ranking: straight flush > trips > straight > flush > pair > high ' +
          '(a straight beats a flush). Dealer qualifies on Queen-high or better.',
      });
    } catch (err) {
      logger.error('[arcade-three-card-poker] verify failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[arcade-three-card-poker] routes registered');
}
