/**
 * arcade-dragon-tiger.routes.ts — MORBIUS Arcade: Dragon Tiger.
 *
 * Endpoints for the Telegram Mini App and the web client (/dragon-tiger):
 *   GET  /api/arcade/dragon-tiger/info         — public: bet bounds + payouts
 *   POST /api/arcade/dragon-tiger/play         — charge wagers, deal, settle in one txn
 *   GET  /api/arcade/dragon-tiger/history      — authed: caller's recent rounds
 *   GET  /api/arcade/dragon-tiger/recent       — public: latest rounds across players
 *   GET  /api/arcade/dragon-tiger/leaderboard  — public: all-time top players by net
 *   GET  /api/arcade/dragon-tiger/verify/:id   — public: provably-fair verification
 *
 * Auth on /play is the signed Telegram `initData` OR the SIWE morb_session
 * cookie (web /dragon-tiger) — same dual-anchor scheme as arcade-baccarat.routes.ts.
 * The whole round (bet debits, deal, payout credits, row insert) happens inside
 * one DB transaction so a round is atomic — never half-settled.
 *
 * One card each: dragonCard = deck[0], tigerCard = deck[1]. Ace is LOW; higher
 * rank wins; equal = tie. Tie pays 11:1 and Dragon/Tiger bets lose half on a tie.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  dealDragonTiger,
  resolvePayouts,
  sumPayouts,
  validateBets,
  DT_MIN_BET,
  DT_MAX_BET,
  DT_PAY_SIDE,
  DT_PAY_TIE,
  DT_TIE_REFUND,
  DT_HOUSE_EDGE_SIDE_BP,
  DT_HOUSE_EDGE_TIE_BP,
  type DragonTigerBets,
} from '../services/arcade-dragon-tiger';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeDragonTigerRoutesOptions {
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

/** Coerce the raw bets payload into a fully-typed DragonTigerBets (each field a non-negative integer). */
function sanitizeBets(raw: unknown): DragonTigerBets {
  const r = (raw ?? {}) as Record<string, unknown>;
  const f = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    dragon: f(r.dragon),
    tiger: f(r.tiger),
    tie: f(r.tie),
  };
}

export function registerArcadeDragonTigerRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeDragonTigerRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /dragon-tiger). Telegram wins when both are present so the Mini
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
  // GET /api/arcade/dragon-tiger/info — public bounds + payouts so the UI
  // always renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dragon-tiger/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: DT_MIN_BET,
      maxBet: DT_MAX_BET,
      // Multipliers ×100 paid on a winning bet (gross — bet was debited).
      payouts: {
        dragon: DT_PAY_SIDE,
        tiger: DT_PAY_SIDE,
        tie: DT_PAY_TIE,
        // On a tie outcome, Dragon/Tiger bets return half the stake.
        tieRefund: DT_TIE_REFUND,
      },
      houseEdgeBp: {
        side: DT_HOUSE_EDGE_SIDE_BP,
        tie: DT_HOUSE_EDGE_TIE_BP,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/dragon-tiger/play — debit, deal, credit, insert in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/dragon-tiger/play', async (req: Request, res: Response) => {
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

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let round!: ReturnType<typeof dealDragonTiger>;
      let payouts!: ReturnType<typeof resolvePayouts>;
      let totalPayout = 0;
      let won = false;
      let serverSeedHash = '';
      let nonce = 0;
      await dbService.withTransaction(async (client) => {
        // Charge the total wager — throws if the wallet can't cover it.
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-totalBet),
          'arcade_dragon_tiger_bet',
          { type: 'arcade_dragon_tiger', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the deck was
        // provably fixed in advance, not chosen at settle time. Same Fisher-Yates
        // shuffle used by Baccarat / Video Poker / Blackjack; only the seed
        // provenance and the (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, wallet);
        serverSeedHash = seed.serverSeedHash;
        nonce = seed.nonce;
        const deck = pf.fisherYatesShuffle(seed.serverSeed, seed.clientSeed, seed.nonce);
        round = dealDragonTiger(deck);
        payouts = resolvePayouts(bets, round);
        totalPayout = sumPayouts(payouts);
        won = totalPayout > totalBet;

        if (totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(totalPayout),
            'arcade_dragon_tiger_payout',
            { type: 'arcade_dragon_tiger', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO arcade_dragon_tiger_rounds
             (id, wallet_address, bets, total_bet, dragon_card, tiger_card, result,
              payouts, total_payout, won, server_seed, server_seed_hash, client_seed,
              nonce, house_edge_bp, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12, $13, $14, $15)`,
          [
            roundId,
            wallet.toLowerCase(),
            JSON.stringify(bets),
            totalBet,
            round.dragonCard,
            round.tigerCard,
            round.result,
            JSON.stringify(payouts),
            totalPayout,
            won,
            serverSeedHash,
            seed.clientSeed,
            nonce,
            DT_HOUSE_EDGE_SIDE_BP,
            seed.seedPairId,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bets,
        totalBet,
        dragonCard: round.dragonCard,
        tigerCard: round.tigerCard,
        dragonRank: round.dragonRank,
        tigerRank: round.tigerRank,
        result: round.result,
        payouts,
        totalPayout,
        won,
        serverSeedHash,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that wager.' });
      }
      logger.error('[arcade-dragon-tiger] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dragon-tiger/history — caller's recent rounds (cookie auth
  // in practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dragon-tiger/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bets, total_bet, dragon_card, tiger_card, result,
                payouts, total_payout, won, created_at
           FROM arcade_dragon_tiger_rounds
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          bets: row.bets,
          totalBet: Number(row.total_bet),
          dragonCard: Number(row.dragon_card),
          tigerCard: Number(row.tiger_card),
          result: row.result,
          payouts: row.payouts,
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dragon-tiger] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dragon-tiger/recent — public. Latest rounds across players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dragon-tiger/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, total_bet, dragon_card, tiger_card, result,
                total_payout, won, created_at
           FROM arcade_dragon_tiger_rounds
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          wallet: row.wallet_address,
          totalBet: Number(row.total_bet),
          dragonCard: Number(row.dragon_card),
          tigerCard: Number(row.tiger_card),
          result: row.result,
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dragon-tiger] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dragon-tiger/leaderboard — public. All-time top by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dragon-tiger/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(total_bet)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(total_bet))::text AS net
           FROM arcade_dragon_tiger_rounds
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(total_bet) DESC
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
      logger.error('[arcade-dragon-tiger] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dragon-tiger/verify/:id — public. Returns the published
  // seeds and the dealt cards so anyone can independently re-run the shuffle
  // and confirm the round wasn't moved mid-deal.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dragon-tiger/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bets, total_bet, dragon_card, tiger_card, result,
                payouts, total_payout, won, server_seed, server_seed_hash,
                client_seed, nonce, created_at, seed_pair_id
           FROM arcade_dragon_tiger_rounds WHERE id = $1`,
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
      return res.json({
        ok: true,
        roundId: row.id,
        bets: row.bets,
        totalBet: Number(row.total_bet),
        dragonCard: Number(row.dragon_card),
        tigerCard: Number(row.tiger_card),
        result: row.result,
        payouts: row.payouts,
        totalPayout: Number(row.total_payout),
        won: !!row.won,
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce). ' +
          'dragonCard = deck[0], tigerCard = deck[1]. ' +
          'rank0 = cardIndex % 13 (0 = Ace LOW .. 12 = King); suit = floor(cardIndex / 13). ' +
          'Higher rank0 wins (Dragon vs Tiger); equal rank0 = tie. ' +
          'Payouts ×100 (gross): Dragon/Tiger win = 200, Tie win = 1200; ' +
          'on a tie, Dragon & Tiger bets return 50 (half the stake). ' +
          'The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-dragon-tiger] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-dragon-tiger] routes registered');
}
