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
import { verifyTelegramInitData } from '../services/telegram.service';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveDice,
  multiplierX100ForTarget,
  DICE_HOUSE_EDGE_BP,
  DICE_MIN_BET,
  DICE_MAX_BET,
  DICE_MIN_TARGET_X100,
  DICE_MAX_TARGET_X100,
} from '../services/arcade-dice';
import type { DatabaseService } from '../services/database.service';

interface RegisterArcadeDiceRoutesOptions {
  app: Express;
  dbService: DatabaseService;
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
}: RegisterArcadeDiceRoutesOptions): void {
  const pool = dbService.getPool();

  // -------------------------------------------------------------------------
  // GET /api/arcade/dice/info — public bounds + house edge so the UI always
  // renders the same numbers the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: DICE_MIN_BET,
      maxBet: DICE_MAX_BET,
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
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < DICE_MIN_BET || bet > DICE_MAX_BET) {
        return res
          .status(400)
          .json({ ok: false, error: `Bet must be between ${DICE_MIN_BET} and ${DICE_MAX_BET} chips.` });
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

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Derive the round's float from a single 4-byte slice of the HMAC stream
      // at cursor 0 — identical primitive to Limbo so the verifier re-uses
      // exactly the same code.
      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const result = resolveDice(targetX100, bet, r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_dice_bet',
          { type: 'arcade_dice', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_dice_payout',
            { type: 'arcade_dice', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_dice_rounds
             (id, wallet_address, bet, target_x100, roll_x100, multiplier_x100,
              won, payout, server_seed, server_seed_hash, client_seed, nonce,
              house_edge_bp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            targetX100,
            result.rollX100,
            result.multiplierX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            DICE_HOUSE_EDGE_BP,
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
  // GET /api/arcade/dice/verify/:id — public. Returns the published seeds +
  // the recipe so anyone can independently re-derive `roll_x100`.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/dice/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, target_x100, roll_x100, multiplier_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at
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
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)); ' +
          'rollX100 = floor(r * 10000). ' +
          'multiplierX100 = floor((10000 - houseEdgeBp) * 100 / targetX100). ' +
          'Player wins when rollX100 < targetX100, paid bet * multiplierX100 / 100.',
      });
    } catch (err) {
      logger.error('[arcade-dice] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-dice] routes registered');
}
