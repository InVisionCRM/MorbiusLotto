/**
 * video-poker.routes.ts — MORBIUS Arcade: Video Poker (Jacks or Better).
 *
 * Endpoints for the Telegram Mini App:
 *   GET  /api/video-poker/paytable        — public: bet limits + the paytable
 *   POST /api/video-poker/deal            — charge the bet, deal a provably-fair hand
 *   POST /api/video-poker/draw            — apply holds, evaluate, pay out
 *   GET  /api/video-poker/verify/:handId  — public: provably-fair verification
 *
 * Auth on deal/draw is the signed Telegram `initData` — the same trust anchor
 * as the rest of the Mini App. The whole 52-card deck is committed at deal
 * time, so the draw outcome is locked before the player picks what to hold.
 * Every chip move runs inside a DB transaction, and the draw is guarded by a
 * row lock + a status check so a hand can never be resolved (or paid) twice.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { getPokerChipBalance, applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  applyHolds,
  resolveVideoPokerHand,
  VIDEO_POKER_PAYTABLE,
  VIDEO_POKER_CATEGORY_NAME,
  VIDEO_POKER_PAYING_ORDER,
  type VideoPokerResult,
} from '../services/video-poker';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterVideoPokerRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

interface DrawOutcome {
  finalHand: number[];
  serverSeed: string;
  clientSeed: string;
  result: VideoPokerResult;
  chipBalance: bigint;
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

export function registerVideoPokerRoutes({
  app,
  dbService,
  authService,
}: RegisterVideoPokerRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /video-poker). Telegram wins when both are present so the Mini
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
  // GET /api/video-poker/paytable — public. Bet limits + the live paytable so
  // the Mini App always renders the exact numbers the server pays.
  // -------------------------------------------------------------------------
  app.get('/api/video-poker/paytable', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('video_poker').min,
      maxBet: betLimits('video_poker').max,
      paytable: VIDEO_POKER_PAYTABLE,
      names: VIDEO_POKER_CATEGORY_NAME,
      order: VIDEO_POKER_PAYING_ORDER,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/video-poker/deal — charge the bet and deal a provably-fair hand.
  // -------------------------------------------------------------------------
  app.post('/api/video-poker/deal', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      const limits = betLimits('video_poker');
      if (!Number.isFinite(bet) || bet < limits.min || bet > limits.max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${limits.min.toLocaleString()} and ${limits.max.toLocaleString()} chips.`,
        });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;
      const deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const dealtHand = deck.slice(0, 5);
      const handId = crypto.randomUUID();

      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charges the bet; throws 'Insufficient poker chips' if it can't cover.
        chipBalance = await applyPokerChipDelta(client, wallet, BigInt(-bet), 'video_poker_bet', {
          type: 'video_poker',
          id: handId,
        });
        await client.query(
          `INSERT INTO video_poker_hands
             (id, wallet_address, bet, status, server_seed, server_seed_hash,
              client_seed, nonce, deck, dealt_hand)
           VALUES ($1, $2, $3, 'dealt', $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
          [
            handId,
            wallet.toLowerCase(),
            bet,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            JSON.stringify(deck),
            JSON.stringify(dealtHand),
          ],
        );
      });

      return res.json({
        ok: true,
        handId,
        dealtHand,
        bet,
        serverSeedHash,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[video-poker] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the hand.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/video-poker/draw — apply the player's holds, evaluate, pay out.
  // -------------------------------------------------------------------------
  app.post('/api/video-poker/draw', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const handId = typeof req.body?.handId === 'string' ? req.body.handId : '';
      const rawHolds = req.body?.holds;
      if (!handId || !Array.isArray(rawHolds) || rawHolds.length !== 5) {
        return res.status(400).json({ ok: false, error: 'A hand id and 5 holds are required.' });
      }
      const holds = rawHolds.map((h) => h === true);

      let out: DrawOutcome | null = null;
      await dbService.withTransaction(async (client) => {
        // Row lock + status check: a hand can never be drawn (or paid) twice.
        const r = await client.query(
          `SELECT bet, status, server_seed, client_seed, deck
             FROM video_poker_hands
            WHERE id = $1 AND wallet_address = $2
            FOR UPDATE`,
          [handId, wallet.toLowerCase()],
        );
        if (r.rows.length === 0) throw new Error('HAND_NOT_FOUND');
        const row = r.rows[0];
        if (row.status !== 'dealt') throw new Error('HAND_ALREADY_RESOLVED');

        const bet = Number(row.bet);
        const deck: number[] = Array.isArray(row.deck) ? row.deck : JSON.parse(row.deck);
        const finalHand = applyHolds(deck, holds);
        const result = resolveVideoPokerHand(finalHand, bet);

        let chipBalance = await getPokerChipBalance(client, wallet);
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'video_poker_payout',
            { type: 'video_poker', id: handId },
          );
        }
        await client.query(
          `UPDATE video_poker_hands
              SET status = 'resolved', holds = $2::jsonb, final_hand = $3::jsonb,
                  result_category = $4, payout = $5, resolved_at = NOW()
            WHERE id = $1`,
          [handId, JSON.stringify(holds), JSON.stringify(finalHand), result.category, result.payout],
        );
        out = {
          finalHand,
          serverSeed: row.server_seed,
          clientSeed: row.client_seed,
          result,
          chipBalance,
        };
      });

      if (!out) throw new Error('draw produced no result');
      const o: DrawOutcome = out;
      return res.json({
        ok: true,
        handId,
        holds,
        finalHand: o.finalHand,
        category: o.result.category,
        categoryName: o.result.categoryName,
        multiplier: o.result.multiplier,
        payout: o.result.payout,
        serverSeed: o.serverSeed,
        clientSeed: o.clientSeed,
        chipBalance: o.chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'HAND_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: 'Hand not found.' });
      }
      if (msg === 'HAND_ALREADY_RESOLVED') {
        return res.status(409).json({ ok: false, error: 'This hand has already been drawn.' });
      }
      logger.error('[video-poker] draw failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not complete the draw.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/video-poker/verify/:handId — public. Once a hand is resolved this
  // returns the server seed + deck so anyone can independently re-derive it.
  // -------------------------------------------------------------------------
  app.get('/api/video-poker/verify/:handId', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, status, bet, server_seed, server_seed_hash, client_seed, nonce,
                deck, dealt_hand, holds, final_hand, result_category, payout, resolved_at
           FROM video_poker_hands WHERE id = $1`,
        [req.params.handId],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Hand not found.' });
      }
      const h = r.rows[0];
      const resolved = h.status === 'resolved';
      return res.json({
        ok: true,
        handId: h.id,
        status: h.status,
        bet: Number(h.bet),
        serverSeedHash: h.server_seed_hash,
        clientSeed: h.client_seed,
        nonce: Number(h.nonce),
        // The server seed is only revealed once the hand is resolved.
        serverSeed: resolved ? h.server_seed : null,
        deck: resolved ? h.deck : null,
        dealtHand: h.dealt_hand,
        holds: h.holds ?? null,
        finalHand: h.final_hand ?? null,
        resultCategory: h.result_category ?? null,
        payout: h.payout != null ? Number(h.payout) : null,
        resolvedAt: h.resolved_at ?? null,
        recipe:
          'fisherYatesShuffle(serverSeed, clientSeed, nonce): deck[0..4] is the deal, deck[5..9] are the draw replacements.',
      });
    } catch (err) {
      logger.error('[video-poker] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the hand.' });
    }
  });

  logger.info('[video-poker] routes registered');
}
