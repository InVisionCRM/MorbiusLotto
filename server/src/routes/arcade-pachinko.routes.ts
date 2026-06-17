/**
 * arcade-pachinko.routes.ts — MORBIUS Arcade: Pachinko (pin-drop, custom pockets).
 *
 * Endpoints for the web (/pachinko) + Telegram Mini App:
 *   GET  /api/arcade/pachinko/info        — public: bounds + per-risk pocket tables
 *   POST /api/arcade/pachinko/play        — charge bet, draw pocket, settle in one txn
 *   GET  /api/arcade/pachinko/history     — caller's recent drops
 *   GET  /api/arcade/pachinko/recent      — public: latest drops across all players
 *   GET  /api/arcade/pachinko/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/pachinko/verify/:id  — public: seeds + recipe so anyone re-derives it
 *
 * Single-shot, server-resolved: the bet debit, weighted pocket draw, payout
 * credit and row insert all happen in one DB transaction so a drop is atomic —
 * never half-settled, never paid twice. The bounce the client animates is a
 * cosmetic replay of the same `path`; only the pocket decides money. Mirrors
 * arcade-dicex2.routes.ts and plinko.routes.ts.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolvePachinko,
  derivePachinkoPocket,
  PACHINKO_RISKS,
  PACHINKO_POCKETS,
  PACHINKO_CENTER,
  PACHINKO_ROWS,
  PACHINKO_MIN_BET,
  PACHINKO_MAX_BET,
  isPachinkoRisk,
  type PachinkoRisk,
} from '../services/arcade-pachinko';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadePachinkoRoutesOptions {
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

export function registerArcadePachinkoRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadePachinkoRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /pachinko). Telegram wins when both are present.
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
  // GET /api/arcade/pachinko/info — public bounds + the per-risk pocket tables
  // (multipliers ×100 + draw weights) so the UI always renders the same pockets
  // and odds the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pachinko/info', (_req: Request, res: Response) => {
    const risks: Record<
      string,
      { multX100: number[]; weights: number[]; total: number }
    > = {};
    for (const r of Object.keys(PACHINKO_RISKS) as PachinkoRisk[]) {
      const cfg = PACHINKO_RISKS[r];
      risks[r] = {
        multX100: cfg.multX100,
        weights: cfg.weights,
        total: cfg.weights.reduce((a, b) => a + b, 0),
      };
    }
    res.json({
      ok: true,
      minBet: PACHINKO_MIN_BET,
      maxBet: PACHINKO_MAX_BET,
      pockets: PACHINKO_POCKETS,
      center: PACHINKO_CENTER,
      rows: PACHINKO_ROWS,
      risks,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/pachinko/play — charge the bet, draw the pocket, settle in
  // one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/pachinko/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < PACHINKO_MIN_BET || bet > PACHINKO_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${PACHINKO_MIN_BET} and ${PACHINKO_MAX_BET} chips.`,
        });
      }

      const risk = req.body?.risk;
      if (!isPachinkoRisk(risk)) {
        return res.status(400).json({ ok: false, error: 'Risk must be low, medium or high.' });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Pocket (cursor 0) + cosmetic path (cursors 4..) from the shared HMAC
      // float stream — identical primitive to Plinko/Chicken, so the verifier
      // re-uses the same code.
      const result = resolvePachinko(
        risk,
        bet,
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_pachinko_bet',
          { type: 'arcade_pachinko', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_pachinko_payout',
            { type: 'arcade_pachinko', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_pachinko_rounds
             (id, wallet_address, bet, risk, pocket, path, multiplier_x100,
              won, payout, server_seed, server_seed_hash, client_seed, nonce)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            risk,
            result.pocket,
            JSON.stringify(result.path),
            result.multiplierX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        risk,
        pocket: result.pocket,
        path: result.path,
        multiplierX100: result.multiplierX100,
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
      logger.error('[arcade-pachinko] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/pachinko/history — caller's recent drops (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pachinko/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, risk, pocket, multiplier_x100, won, payout, created_at
           FROM arcade_pachinko_rounds
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
          risk: row.risk,
          pocket: Number(row.pocket),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-pachinko] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/pachinko/recent — public. Latest drops across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pachinko/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, risk, pocket, multiplier_x100, won, payout, created_at
           FROM arcade_pachinko_rounds
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
          risk: row.risk,
          pocket: Number(row.pocket),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-pachinko] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/pachinko/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pachinko/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS drops,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_pachinko_rounds
          GROUP BY wallet_address
          ORDER BY SUM(payout) - SUM(bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          drops: Number(row.drops),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-pachinko] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/pachinko/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive `pocket` (and the cosmetic
  // `path`) and confirm SHA-256(serverSeed) === serverSeedHash.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/pachinko/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, risk, pocket, path, multiplier_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, created_at
           FROM arcade_pachinko_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      const risk = row.risk as PachinkoRisk;
      const cfg = PACHINKO_RISKS[risk];
      const total = cfg.weights.reduce((a, b) => a + b, 0);
      // Re-derive the pocket from the published seeds (independent of the stored
      // value) so the verifier surfaces the recomputed pocket too.
      const f0 = pf.bytesToFloat(pf.hmacByteStream(row.server_seed, row.client_seed, Number(row.nonce), 0));
      const recomputedPocket = derivePachinkoPocket(risk, f0);
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        risk,
        pockets: PACHINKO_POCKETS,
        center: PACHINKO_CENTER,
        rows: PACHINKO_ROWS,
        multX100: cfg.multX100,
        weights: cfg.weights,
        weightTotal: total,
        pocket: Number(row.pocket),
        recomputedPocket,
        path: row.path,
        multiplierX100: Number(row.multiplier_x100),
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'f0 = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          `weights = ${JSON.stringify(cfg.weights)} (total ${total}); ` +
          'pocket = first index i where f0 × total < Σ(weights[0..i]). ' +
          `multiplierX100 = multX100[pocket] (multX100 = ${JSON.stringify(cfg.multX100)}); ` +
          'payout = floor(bet × multiplierX100 / 100). ' +
          `Cosmetic bounce: for row R in [0..${PACHINKO_ROWS - 1}], ` +
          'step R = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, (R+1)×4)) < 0.5 ? 0 : 1 — ' +
          'a reveal animation only; it does not pick the pocket.',
      });
    } catch (err) {
      logger.error('[arcade-pachinko] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-pachinko] routes registered');
}
