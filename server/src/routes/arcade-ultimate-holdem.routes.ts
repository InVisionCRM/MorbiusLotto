/**
 * arcade-ultimate-holdem.routes.ts — MORBIUS Arcade: Ultimate Texas Hold'em.
 *
 * Endpoints (web /ultimate-holdem + Telegram Mini App):
 *   GET  /api/arcade/ultimate-holdem/info         — public: bounds + paytables
 *   GET  /api/arcade/ultimate-holdem/active       — caller's live hand (resume)
 *   POST /api/arcade/ultimate-holdem/deal         — debit Ante + Blind (+Trips),
 *                                                   shuffle, return ONLY the
 *                                                   player's 2 hole cards
 *   POST /api/arcade/ultimate-holdem/action       — {action}: check advances a
 *                                                   street and reveals board
 *                                                   cards; a Play bet or a
 *                                                   river fold settles the hand
 *   GET  /api/arcade/ultimate-holdem/history      — caller's settled hands
 *   GET  /api/arcade/ultimate-holdem/recent       — public: latest settled hands
 *   GET  /api/arcade/ultimate-holdem/leaderboard  — public: top players by net
 *   GET  /api/arcade/ultimate-holdem/verify/:id   — public: seeds + deck recipe
 *                                                   (settled hands ONLY)
 *
 * Multi-step session flow (Three Card Poker with more streets): /deal INSERTs
 * status='active' stage='preflop' and debits Ante + Blind (+ Trips); each
 * /action either advances the stage and reveals the next board cards, or
 * commits the Play bet (or folds at the river) and FINAL-UPDATEs to
 * status='settled'. The dealer's hole cards and the unrevealed board are sealed
 * behind a committed server-seed hash from /deal — the plaintext server seed is
 * only published when the hand settles.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. Every
 * chip move runs inside a transaction with the round row locked FOR UPDATE, so
 * a double-tap can neither double-spend nor double-pay. The
 * `uniq_arcade_ultimate_holdem_active_per_wallet` partial unique index also
 * guarantees one live hand per wallet at the DB level.
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
  UTH_BLIND_PAY,
  UTH_TRIPS_PAY,
  UTH_CATEGORY_NAME,
  UTH_PAYING_ORDER,
  UTH_HOUSE_EDGE_ANTE_BP,
  UTH_HOUSE_EDGE_TRIPS_BP,
  settleUth,
  uthBest,
  uthLegalActions,
  uthNextStage,
  uthPlayMultiple,
  validateUthDeal,
  type UthAction,
  type UthStage,
} from '../services/arcade-ultimate-holdem';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeUltimateHoldemRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

const ALL_ACTIONS: UthAction[] = ['bet4', 'bet3', 'check', 'bet2', 'bet1', 'fold'];

/**
 * How much of the board the player is allowed to see at each stage. The client
 * only ever gets this slice, so an unrevealed street can't be read off the
 * wire before the player has committed to it.
 */
function visibleBoard(board: number[], stage: UthStage): number[] {
  if (stage === 'preflop') return [];
  if (stage === 'flop') return board.slice(0, 3);
  return board.slice(0, 5);
}

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
    `SELECT id, wallet_address, ante, blind, trips, play, play_multiple,
            hole_cards, dealer_cards, board, stage, folded, status,
            server_seed, server_seed_hash, client_seed, nonce
       FROM arcade_ultimate_holdem_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeUltimateHoldemRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeUltimateHoldemRoutesOptions): void {
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
  // GET /info — public bounds + paytables so the UI always renders the same
  // numbers the server pays.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/info', (_req: Request, res: Response) => {
    const l = betLimits('ultimate_holdem');
    res.json({
      ok: true,
      minBet: l.min,
      maxBet: l.max,
      blindPay: UTH_BLIND_PAY,
      tripsPay: UTH_TRIPS_PAY,
      categoryNames: UTH_CATEGORY_NAME,
      payingOrder: UTH_PAYING_ORDER,
      dealerQualify: 'Pair or better',
      houseEdgeAnteBp: UTH_HOUSE_EDGE_ANTE_BP,
      houseEdgeTripsBp: UTH_HOUSE_EDGE_TRIPS_BP,
    });
  });

  // -------------------------------------------------------------------------
  // GET /active — the wallet's live hand, if any, so a refresh mid-hand resumes
  // rather than stranding the already-debited Ante and Blind. Returns only the
  // board cards that stage has earned.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const r = await pool.query(
        `SELECT id, ante, blind, trips, play, play_multiple, hole_cards, board,
                stage, server_seed_hash, client_seed, nonce
           FROM arcade_ultimate_holdem_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) return res.json({ ok: true, active: null });

      const row = r.rows[0];
      const stage = row.stage as UthStage;
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          ante: Number(row.ante),
          blind: Number(row.blind),
          trips: Number(row.trips),
          play: Number(row.play),
          playMultiple: Number(row.play_multiple),
          holeCards: row.hole_cards as number[],
          board: visibleBoard(row.board as number[], stage),
          stage,
          legalActions: uthLegalActions(stage),
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        },
      });
    } catch (err) {
      logger.error('[arcade-ultimate-holdem] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load hand state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /deal — debit Ante + Blind (+ Trips), shuffle a provably-fair deck,
  // seal it, return ONLY the player's 2 hole cards.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/ultimate-holdem/deal', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const v = validateUthDeal(req.body?.ante, req.body?.trips);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const { ante, trips } = v;
      const blind = ante; // The Blind always matches the Ante.

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // The whole hand — both players' cards AND all five board cards — is
      // fixed here, behind the committed hash, before a single decision.
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const holeCards = [deck[0], deck[1]];
      const dealerCards = [deck[2], deck[3]];
      const board = [deck[4], deck[5], deck[6], deck[7], deck[8]];

      const roundId = crypto.randomUUID();
      const cost = ante + blind + trips;
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-cost),
            'arcade_ultimate_holdem_bet',
            { type: 'arcade_ultimate_holdem', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_ultimate_holdem_rounds
               (id, wallet_address, ante, blind, trips, play, play_multiple,
                hole_cards, dealer_cards, board, stage, status,
                server_seed, server_seed_hash, client_seed, nonce)
             VALUES ($1, $2, $3, $4, $5, 0, 0,
                     $6::jsonb, $7::jsonb, $8::jsonb, 'preflop', 'active',
                     $9, $10, $11, $12)`,
            [
              roundId,
              wallet.toLowerCase(),
              ante,
              blind,
              trips,
              JSON.stringify(holeCards),
              JSON.stringify(dealerCards),
              JSON.stringify(board),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_ultimate_holdem_active_per_wallet|duplicate key/i.test(msg)) {
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
        blind,
        trips,
        holeCards,
        board: [],
        stage: 'preflop' as UthStage,
        legalActions: uthLegalActions('preflop'),
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
      logger.error('[arcade-ultimate-holdem] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not deal the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /action — {roundId, action}.
  //
  // A check advances the street and reveals the next board cards. A Play bet
  // (4x/3x pre-flop, 2x on the flop, 1x on the river) or a river fold ends the
  // hand: the dealer's cards and the server seed become public and the payout
  // is credited.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/ultimate-holdem/action', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const roundId = String(req.body?.roundId ?? '');
      const action = req.body?.action as UthAction;
      if (!roundId) return res.status(400).json({ ok: false, error: 'Invalid round.' });
      if (!ALL_ACTIONS.includes(action)) {
        return res.status(400).json({ ok: false, error: 'Unknown action.' });
      }

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

        const stage = row.stage as UthStage;
        const legal = uthLegalActions(stage);
        if (!legal.includes(action)) {
          response = {
            status: 400,
            body: {
              ok: false,
              error: `You can't do that right now.`,
              stage,
              legalActions: legal,
            },
          };
          return;
        }

        const ante = Number(row.ante);
        const blind = Number(row.blind);
        const trips = Number(row.trips);
        const holeCards = row.hole_cards as number[];
        const dealerCards = row.dealer_cards as number[];
        const board = row.board as number[];

        const nextStage = uthNextStage(stage, action);

        // ── A check: no chips move, the next street comes out. ──────────────
        if (nextStage !== 'settled') {
          await client.query(
            `UPDATE arcade_ultimate_holdem_rounds SET stage = $1 WHERE id = $2`,
            [nextStage, roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              roundId,
              action,
              stage: nextStage,
              board: visibleBoard(board, nextStage),
              legalActions: uthLegalActions(nextStage),
              settled: false,
            },
          };
          return;
        }

        // ── A Play bet or a fold: the hand ends here. ───────────────────────
        const multiple = uthPlayMultiple(action);
        const play = multiple * ante;
        const folded = action === 'fold';

        let chipBalance: bigint | null = null;
        if (play > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-play),
            'arcade_ultimate_holdem_bet',
            { type: 'arcade_ultimate_holdem', id: roundId },
          );
        }

        const playerHand = uthBest(holeCards, board);
        const dealerHand = uthBest(dealerCards, board);
        const s = settleUth(playerHand, dealerHand, ante, blind, trips, play, folded);

        await client.query(
          `UPDATE arcade_ultimate_holdem_rounds
             SET play = $1, play_multiple = $2, stage = 'settled', folded = $3,
                 result = $4, player_category = $5, dealer_category = $6,
                 dealer_qualified = $7, ante_payout = $8, blind_payout = $9,
                 play_payout = $10, trips_payout = $11, total_payout = $12,
                 won = $13, status = 'settled', settled_at = NOW()
           WHERE id = $14`,
          [
            play,
            multiple,
            folded,
            s.result,
            s.playerCategory,
            s.dealerCategory,
            s.dealerQualified,
            s.antePayout,
            s.blindPayout,
            s.playPayout,
            s.tripsPayout,
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
            'arcade_ultimate_holdem_payout',
            { type: 'arcade_ultimate_holdem', id: roundId },
          );
        }

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            action,
            settled: true,
            stage: 'settled' as UthStage,
            folded,
            ante,
            blind,
            trips,
            play,
            playMultiple: multiple,
            holeCards,
            dealerCards,
            board,
            playerCategory: s.playerCategory,
            playerCategoryName: UTH_CATEGORY_NAME[s.playerCategory],
            dealerCategory: s.dealerCategory,
            dealerCategoryName: UTH_CATEGORY_NAME[s.dealerCategory],
            dealerQualified: s.dealerQualified,
            result: s.result,
            antePayout: s.antePayout,
            blindPayout: s.blindPayout,
            playPayout: s.playPayout,
            tripsPayout: s.tripsPayout,
            totalPayout: s.totalPayout,
            committed: s.committed,
            won: s.won,
            winSide: s.winSide,
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
      logger.error('[arcade-ultimate-holdem] action failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not resolve the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /history — caller's settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, ante, blind, trips, play, play_multiple, folded,
                hole_cards, dealer_cards, board, result, player_category,
                dealer_category, dealer_qualified, ante_payout, blind_payout,
                play_payout, trips_payout, total_payout, won, created_at
           FROM arcade_ultimate_holdem_rounds
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
          blind: Number(row.blind),
          trips: Number(row.trips),
          play: Number(row.play),
          playMultiple: Number(row.play_multiple),
          folded: !!row.folded,
          holeCards: row.hole_cards as number[],
          dealerCards: row.dealer_cards as number[],
          board: row.board as number[],
          result: row.result as string,
          playerCategory: row.player_category as string | null,
          dealerCategory: row.dealer_category as string | null,
          dealerQualified: row.dealer_qualified as boolean | null,
          antePayout: Number(row.ante_payout),
          blindPayout: Number(row.blind_payout),
          playPayout: Number(row.play_payout),
          tripsPayout: Number(row.trips_payout),
          totalPayout: Number(row.total_payout),
          committed:
            Number(row.ante) + Number(row.blind) + Number(row.trips) + Number(row.play),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-ultimate-holdem] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /recent — public. Latest settled hands.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, ante, blind, trips, play, result,
                player_category, total_payout, won, created_at
           FROM arcade_ultimate_holdem_rounds
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
          committed:
            Number(row.ante) + Number(row.blind) + Number(row.trips) + Number(row.play),
          result: row.result as string,
          playerCategory: row.player_category as string | null,
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-ultimate-holdem] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /leaderboard — public. Net = returned − committed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS hands,
                SUM(ante + blind + trips + play)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(ante + blind + trips + play))::text AS net
           FROM arcade_ultimate_holdem_rounds
          WHERE status = 'settled'
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(ante + blind + trips + play) DESC
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
      logger.error('[arcade-ultimate-holdem] leaderboard failed', {
        error: (err as Error)?.message,
      });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /verify/:id — public, settled hands ONLY. Returns the seeds plus the
  // recipe so anyone can re-derive the deck and confirm every card — including
  // the board the player never saw — was fixed at /deal and never moved.
  // An ACTIVE hand 404s; its seed and sealed cards stay sealed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/ultimate-holdem/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, ante, blind, trips, play, play_multiple, folded,
                hole_cards, dealer_cards, board, result, player_category,
                dealer_category, dealer_qualified, ante_payout, blind_payout,
                play_payout, trips_payout, total_payout, won, status,
                server_seed, server_seed_hash, client_seed, nonce,
                created_at, settled_at
           FROM arcade_ultimate_holdem_rounds WHERE id = $1`,
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
        blind: Number(row.blind),
        trips: Number(row.trips),
        play: Number(row.play),
        playMultiple: Number(row.play_multiple),
        folded: !!row.folded,
        holeCards: row.hole_cards as number[],
        dealerCards: row.dealer_cards as number[],
        board: row.board as number[],
        result: row.result as string,
        playerCategory: row.player_category as string | null,
        dealerCategory: row.dealer_category as string | null,
        dealerQualified: row.dealer_qualified as boolean | null,
        antePayout: Number(row.ante_payout),
        blindPayout: Number(row.blind_payout),
        playPayout: Number(row.play_payout),
        tripsPayout: Number(row.trips_payout),
        totalPayout: Number(row.total_payout),
        committed: Number(row.ante) + Number(row.blind) + Number(row.trips) + Number(row.play),
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
          'holeCards = deck[0,1]; dealerCards = deck[2,3]; board = deck[4..8] ' +
          '(flop 4,5,6 / turn 7 / river 8). ' +
          'rank = (idx % 13) + 2 (14 = Ace, high); suit = floor(idx / 13). ' +
          'Each side makes its best 5-card hand from its 2 hole cards + the 5 board cards. ' +
          'The dealer qualifies on a pair or better, which only affects the Ante.',
      });
    } catch (err) {
      logger.error('[arcade-ultimate-holdem] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[arcade-ultimate-holdem] routes registered');
}
