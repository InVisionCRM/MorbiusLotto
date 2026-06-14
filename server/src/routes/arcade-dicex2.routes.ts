/**
 * arcade-dicex2.routes.ts — MORBIUS Arcade: Dice x2 (range / "in" dice).
 *
 * Endpoints for the Telegram Mini App + web (/dicex2):
 *   GET  /api/arcade/dicex2/info        — public: bet/width bounds + house edge
 *   POST /api/arcade/dicex2/play        — charge bet, roll, settle in one txn
 *   GET  /api/arcade/dicex2/verify/:id  — public: provably-fair verification
 *
 * The player sends a win band [lowX100, highX100); the round (bet debit, roll,
 * payout, row insert) happens in a single DB transaction so it's atomic — never
 * half-settled, never paid twice. Mirrors arcade-dice.routes.ts.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveDiceX2,
  multiplierX100ForWidth,
  DICEX2_HOUSE_EDGE_BP,
  DICEX2_MIN_BET,
  DICEX2_MAX_BET,
  DICEX2_MIN_WIDTH_X100,
  DICEX2_MAX_WIDTH_X100,
  DICEX2_SCALE_MAX_X100,
} from '../services/arcade-dicex2';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeDiceX2RoutesOptions {
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

export function registerArcadeDiceX2Routes({
  app,
  dbService,
  authService,
}: RegisterArcadeDiceX2RoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /dicex2). Telegram wins when both are present.
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
  // GET /api/arcade/dicex2/info — public bounds + house edge so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dicex2/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: DICEX2_MIN_BET,
      maxBet: DICEX2_MAX_BET,
      minWidthX100: DICEX2_MIN_WIDTH_X100,
      maxWidthX100: DICEX2_MAX_WIDTH_X100,
      scaleMaxX100: DICEX2_SCALE_MAX_X100,
      houseEdgeBp: DICEX2_HOUSE_EDGE_BP,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/dicex2/play — charge the bet, roll, settle in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/dicex2/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < DICEX2_MIN_BET || bet > DICEX2_MAX_BET) {
        return res
          .status(400)
          .json({ ok: false, error: `Bet must be between ${DICEX2_MIN_BET} and ${DICEX2_MAX_BET} chips.` });
      }

      const lowX100 = Math.floor(Number(req.body?.lowX100));
      const highX100 = Math.floor(Number(req.body?.highX100));
      if (
        !Number.isFinite(lowX100) ||
        !Number.isFinite(highX100) ||
        lowX100 < 0 ||
        highX100 > DICEX2_SCALE_MAX_X100 ||
        lowX100 >= highX100
      ) {
        return res.status(400).json({
          ok: false,
          error: `Band must lie within 0.00–${(DICEX2_SCALE_MAX_X100 / 100).toFixed(2)} with low below high.`,
        });
      }
      const widthX100 = highX100 - lowX100;
      if (widthX100 < DICEX2_MIN_WIDTH_X100 || widthX100 > DICEX2_MAX_WIDTH_X100) {
        return res.status(400).json({
          ok: false,
          error: `Band width must be between ${(DICEX2_MIN_WIDTH_X100 / 100).toFixed(2)} and ${(DICEX2_MAX_WIDTH_X100 / 100).toFixed(2)}.`,
        });
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Same primitive as Dice/Limbo: one 4-byte slice of the HMAC stream at
      // cursor 0 → float in [0,1), so the verifier re-uses identical code.
      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const result = resolveDiceX2(lowX100, highX100, bet, r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_dicex2_bet',
          { type: 'arcade_dicex2', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_dicex2_payout',
            { type: 'arcade_dicex2', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_dicex2_rounds
             (id, wallet_address, bet, low_x100, high_x100, roll_x100, multiplier_x100,
              won, payout, server_seed, server_seed_hash, client_seed, nonce,
              house_edge_bp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            lowX100,
            highX100,
            result.rollX100,
            result.multiplierX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            DICEX2_HOUSE_EDGE_BP,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        lowX100,
        highX100,
        widthX100,
        rollX100: result.rollX100,
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
      logger.error('[arcade-dicex2] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dicex2/history — caller's recent rounds (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dicex2/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, low_x100, high_x100, roll_x100, multiplier_x100, won, payout, created_at
           FROM arcade_dicex2_rounds
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
          lowX100: Number(row.low_x100),
          highX100: Number(row.high_x100),
          rollX100: Number(row.roll_x100),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dicex2] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dicex2/recent — public. Latest rolls across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dicex2/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, low_x100, high_x100, roll_x100, multiplier_x100, won, payout, created_at
           FROM arcade_dicex2_rounds
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
          lowX100: Number(row.low_x100),
          highX100: Number(row.high_x100),
          rollX100: Number(row.roll_x100),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dicex2] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dicex2/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dicex2/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rolls,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_dicex2_rounds
          GROUP BY wallet_address
          ORDER BY SUM(payout) - SUM(bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          rolls: Number(row.rolls),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-dicex2] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dicex2/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive `roll_x100`.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dicex2/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, low_x100, high_x100, roll_x100, multiplier_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at
           FROM arcade_dicex2_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      // multiplier is fully determined by band width + edge; surface the formula
      // we'd recompute if `multiplier_x100` were ever missing.
      const widthX100 = Number(row.high_x100) - Number(row.low_x100);
      const recomputedMultiplier = multiplierX100ForWidth(widthX100, Number(row.house_edge_bp));
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        lowX100: Number(row.low_x100),
        highX100: Number(row.high_x100),
        widthX100,
        rollX100: Number(row.roll_x100),
        multiplierX100: Number(row.multiplier_x100),
        recomputedMultiplierX100: recomputedMultiplier,
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
          'rollX100 = floor(r * 10000). ' +
          'widthX100 = highX100 - lowX100. ' +
          'multiplierX100 = floor((10000 - houseEdgeBp) * 100 / widthX100). ' +
          'Player wins when lowX100 <= rollX100 < highX100, paid bet * multiplierX100 / 100.',
      });
    } catch (err) {
      logger.error('[arcade-dicex2] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-dicex2] routes registered');
}
