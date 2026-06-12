/**
 * arcade-limbo.routes.ts — MORBIUS Arcade: Limbo.
 *
 * Endpoints for the Telegram Mini App:
 *   GET  /api/arcade/limbo/info        — public: bet/target bounds + house edge
 *   POST /api/arcade/limbo/play        — charge bet, roll, settle in one txn
 *   GET  /api/arcade/limbo/verify/:id  — public: provably-fair verification
 *
 * Auth on /play is the signed Telegram `initData` — same trust anchor as the
 * rest of the Mini App. The whole round (bet debit, roll, payout, row insert)
 * happens in a single DB transaction so a round is atomic — never half-settled,
 * never paid twice.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveLimbo,
  LIMBO_HOUSE_EDGE_BP,
  LIMBO_MIN_BET,
  LIMBO_MAX_BET,
  LIMBO_MIN_TARGET_X100,
  LIMBO_MAX_TARGET_X100,
} from '../services/arcade-limbo';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeLimboRoutesOptions {
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

export function registerArcadeLimboRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeLimboRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /limbo2). Telegram wins when both are present so the Mini App
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
  // GET /api/arcade/limbo/info — public bounds + house edge so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/limbo/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: LIMBO_MIN_BET,
      maxBet: LIMBO_MAX_BET,
      minTargetX100: LIMBO_MIN_TARGET_X100,
      maxTargetX100: LIMBO_MAX_TARGET_X100,
      houseEdgeBp: LIMBO_HOUSE_EDGE_BP,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/limbo/play — charge the bet, roll, settle in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/limbo/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < LIMBO_MIN_BET || bet > LIMBO_MAX_BET) {
        return res
          .status(400)
          .json({ ok: false, error: `Bet must be between ${LIMBO_MIN_BET} and ${LIMBO_MAX_BET} chips.` });
      }

      const targetX100 = Math.floor(Number(req.body?.targetX100));
      if (
        !Number.isFinite(targetX100) ||
        targetX100 < LIMBO_MIN_TARGET_X100 ||
        targetX100 > LIMBO_MAX_TARGET_X100
      ) {
        return res.status(400).json({
          ok: false,
          error: `Target must be between ${(LIMBO_MIN_TARGET_X100 / 100).toFixed(2)}x and ${(LIMBO_MAX_TARGET_X100 / 100).toFixed(2)}x.`,
        });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Derive the round's float from a single 4-byte slice of the HMAC stream
      // at cursor 0 — identical primitive to the lottery/poker shuffle paths so
      // verification can re-use exactly the same code.
      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const result = resolveLimbo(targetX100, bet, r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_limbo_bet',
          { type: 'arcade_limbo', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_limbo_payout',
            { type: 'arcade_limbo', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_limbo_rounds
             (id, wallet_address, bet, target_x100, result_x100, won, payout,
              server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            targetX100,
            result.resultX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            LIMBO_HOUSE_EDGE_BP,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        targetX100,
        resultX100: result.resultX100,
        won: result.won,
        payout: result.payout,
        serverSeedHash,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-limbo] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/limbo/history — caller's recent rounds (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/limbo/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, target_x100, result_x100, won, payout, created_at
           FROM arcade_limbo_rounds
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          bet: Number(row.bet),
          targetX100: Number(row.target_x100),
          resultX100: Number(row.result_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-limbo] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/limbo/recent — public. Latest rounds across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/limbo/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, target_x100, result_x100, won, payout, created_at
           FROM arcade_limbo_rounds
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
          targetX100: Number(row.target_x100),
          resultX100: Number(row.result_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-limbo] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/limbo/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/limbo/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_limbo_rounds
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
      logger.error('[arcade-limbo] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/limbo/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive `result_x100`.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/limbo/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, target_x100, result_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at
           FROM arcade_limbo_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        targetX100: Number(row.target_x100),
        resultX100: Number(row.result_x100),
        won: row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          'crashX100 = max(100, floor(((1 - houseEdgeBp/10000) / (1 - r)) * 100)). ' +
          'Player wins target_x100/100 × bet when crashX100 >= target_x100.',
      });
    } catch (err) {
      logger.error('[arcade-limbo] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-limbo] routes registered');
}
