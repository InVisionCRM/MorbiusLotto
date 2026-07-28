/**
 * arcade-dice.routes.ts — MORBIUS Arcade: Dice.
 *
 * Endpoints for the Telegram Mini App:
 *   GET  /api/arcade/dice/info        — public: bet/target bounds + house edge
 *   POST /api/arcade/dice/play        — charge bet, roll, settle in one txn
 *   GET  /api/arcade/dice/verify/:id  — public: provably-fair verification
 *
 * Auth on /play is the signed Telegram `initData`. The whole round (bet debit,
 * roll, payout, row insert) happens in a single DB transaction so a round is
 * atomic — never half-settled, never paid twice. Mirrors arcade-limbo.routes.ts.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveDice,
  multiplierX100ForTarget,
  DICE_HOUSE_EDGE_BP,
  DICE_MIN_TARGET_X100,
  DICE_MAX_TARGET_X100,
  type DiceResult,
} from '../services/arcade-dice';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeDiceRoutesOptions {
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

export function registerArcadeDiceRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeDiceRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /dice2). Telegram wins when both are present so the Mini App
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
  // GET /api/arcade/dice/info — public bounds + house edge so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('dice').min,
      maxBet: betLimits('dice').max,
      minTargetX100: DICE_MIN_TARGET_X100,
      maxTargetX100: DICE_MAX_TARGET_X100,
      houseEdgeBp: DICE_HOUSE_EDGE_BP,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/dice/play — charge the bet, roll, settle in one txn.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/dice/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('dice').min || bet > betLimits('dice').max) {
        return res
          .status(400)
          .json({ ok: false, error: `Bet must be between ${betLimits('dice').min} and ${betLimits('dice').max} chips.` });
      }

      const targetX100 = Math.floor(Number(req.body?.targetX100));
      if (
        !Number.isFinite(targetX100) ||
        targetX100 < DICE_MIN_TARGET_X100 ||
        targetX100 > DICE_MAX_TARGET_X100
      ) {
        return res.status(400).json({
          ok: false,
          error: `Target must be between ${(DICE_MIN_TARGET_X100 / 100).toFixed(2)} and ${(DICE_MAX_TARGET_X100 / 100).toFixed(2)}.`,
        });
      }

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let result!: DiceResult;
      let serverSeedHash = '';
      let nonce = 0;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_dice_bet',
          { type: 'arcade_dice', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the roll was
        // provably fixed in advance, not chosen at settle time. Same single
        // 4-byte cursor-0 HMAC primitive as before; only the seed provenance
        // and the (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, wallet);
        serverSeedHash = seed.serverSeedHash;
        nonce = seed.nonce;
        const r = pf.bytesToFloat(pf.hmacByteStream(seed.serverSeed, seed.clientSeed, seed.nonce, 0));
        result = resolveDice(targetX100, bet, r);

        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_dice_payout',
            { type: 'arcade_dice', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO arcade_dice_rounds
             (id, wallet_address, bet, target_x100, roll_x100, multiplier_x100,
              won, payout, server_seed, server_seed_hash, client_seed, nonce,
              house_edge_bp, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, $13)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            targetX100,
            result.rollX100,
            result.multiplierX100,
            result.won,
            result.payout,
            serverSeedHash,
            seed.clientSeed,
            nonce,
            DICE_HOUSE_EDGE_BP,
            seed.seedPairId,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        targetX100,
        rollX100: result.rollX100,
        multiplierX100: result.multiplierX100,
        won: result.won,
        payout: result.payout,
        serverSeedHash,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-dice] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dice/history — caller's recent rounds (cookie auth in
  // practice; GET has no body, so resolveWallet falls through to SIWE).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, target_x100, roll_x100, multiplier_x100, won, payout, created_at
           FROM arcade_dice_rounds
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
          rollX100: Number(row.roll_x100),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dice] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dice/recent — public. Latest rolls across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, target_x100, roll_x100, multiplier_x100, won, payout, created_at
           FROM arcade_dice_rounds
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
          rollX100: Number(row.roll_x100),
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-dice] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dice/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rolls,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_dice_rounds
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
      logger.error('[arcade-dice] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/dice/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive `roll_x100`.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, target_x100, roll_x100, multiplier_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at, seed_pair_id
           FROM arcade_dice_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      // multiplier is fully determined by target + edge; surface the formula
      // we'd recompute if `multiplier_x100` were ever missing.
      const recomputedMultiplier = multiplierX100ForTarget(
        Number(row.target_x100),
        Number(row.house_edge_bp),
      );
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
        bet: Number(row.bet),
        targetX100: Number(row.target_x100),
        rollX100: Number(row.roll_x100),
        multiplierX100: Number(row.multiplier_x100),
        recomputedMultiplierX100: recomputedMultiplier,
        won: row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          'rollX100 = floor(r * 10000). ' +
          'multiplierX100 = floor((10000 - houseEdgeBp) * 100 / targetX100). ' +
          'Player wins when rollX100 < targetX100, paid bet * multiplierX100 / 100. ' +
          'The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-dice] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-dice] routes registered');
}
