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

interface RegisterArcadeLimboRoutesOptions {
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

export function registerArcadeLimboRoutes({
  app,
  dbService,
}: RegisterArcadeLimboRoutesOptions): void {
  const pool = dbService.getPool();

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
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
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
