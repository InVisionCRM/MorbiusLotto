/**
 * arcade-crash.routes.ts — MORBIUS Arcade: Crash.
 *
 * Endpoints for the Telegram Mini App:
 *   GET  /api/arcade/crash/info        — public: bet/cashout bounds + house edge
 *   POST /api/arcade/crash/play        — charge bet, roll crash point, settle in one txn
 *   GET  /api/arcade/crash/verify/:id  — public: provably-fair verification
 *
 * Crash is instant-settlement (like Limbo): the entire round — bet debit,
 * provably-fair roll, payout credit, row insert — happens in a single DB
 * transaction, so a round is atomic and can never be half-settled.
 *
 * Auth on /play is the signed Telegram `initData`, the same trust anchor used
 * across all Arcade games.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveCrash,
  CRASH_HOUSE_EDGE_BP,
  CRASH_MIN_BET,
  CRASH_MAX_BET,
  CRASH_MIN_CASHOUT_X100,
  CRASH_MAX_CASHOUT_X100,
} from '../services/arcade-crash';
import type { DatabaseService } from '../services/database.service';

interface RegisterArcadeCrashRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const pf = new ProvablyFairService();

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

export function registerArcadeCrashRoutes({
  app,
  dbService,
}: RegisterArcadeCrashRoutesOptions): void {
  const pool = dbService.getPool();

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/info — public bounds so the UI enforces the same
  // limits the server validates.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: CRASH_MIN_BET,
      maxBet: CRASH_MAX_BET,
      minCashoutX100: CRASH_MIN_CASHOUT_X100,
      maxCashoutX100: CRASH_MAX_CASHOUT_X100,
      houseEdgeBp: CRASH_HOUSE_EDGE_BP,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/arcade/crash/play — charge the bet, roll the crash point,
  // settle in one atomic transaction.
  //
  // Body: { initData, bet, autoCashoutX100?, clientSeed? }
  //   autoCashoutX100: integer ×100 in [101..10000], or omitted/null for no
  //                    target (instant bust — useful for demos / free play only).
  // ---------------------------------------------------------------------------
  app.post('/api/arcade/crash/play', async (req: Request, res: Response) => {
    try {
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < CRASH_MIN_BET || bet > CRASH_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${CRASH_MIN_BET} and ${CRASH_MAX_BET} chips.`,
        });
      }

      // autoCashoutX100 is optional; null means "no target".
      let autoCashoutX100: number | null = null;
      if (req.body?.autoCashoutX100 != null) {
        autoCashoutX100 = Math.floor(Number(req.body.autoCashoutX100));
        if (
          !Number.isFinite(autoCashoutX100) ||
          autoCashoutX100 < CRASH_MIN_CASHOUT_X100 ||
          autoCashoutX100 > CRASH_MAX_CASHOUT_X100
        ) {
          return res.status(400).json({
            ok: false,
            error: `Auto-cashout must be between ${(CRASH_MIN_CASHOUT_X100 / 100).toFixed(2)}x and ${(CRASH_MAX_CASHOUT_X100 / 100).toFixed(2)}x.`,
          });
        }
      }

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const result = resolveCrash(autoCashoutX100, bet, r);

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_crash_bet',
          { type: 'arcade_crash', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(result.payout),
            'arcade_crash_payout',
            { type: 'arcade_crash', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO arcade_crash_rounds
             (id, wallet_address, bet, auto_cashout_x100, crash_x100,
              cashout_x100, won, payout,
              server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            autoCashoutX100,
            result.crashX100,
            result.cashoutX100,
            result.won,
            result.payout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
            CRASH_HOUSE_EDGE_BP,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        autoCashoutX100,
        crashX100: result.crashX100,
        cashoutX100: result.cashoutX100,
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
      logger.error('[arcade-crash] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/arcade/crash/verify/:id — public. Returns the revealed seeds +
  // the recipe so anyone can independently re-derive the crash point.
  // ---------------------------------------------------------------------------
  app.get('/api/arcade/crash/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, auto_cashout_x100, crash_x100, cashout_x100, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at
           FROM arcade_crash_rounds WHERE id = $1`,
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
        autoCashoutX100: row.auto_cashout_x100 != null ? Number(row.auto_cashout_x100) : null,
        crashX100: Number(row.crash_x100),
        cashoutX100: row.cashout_x100 != null ? Number(row.cashout_x100) : null,
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
          'crashX100 = max(100, floor(((1 - houseEdgeBp/10000) / r) * 100)). ' +
          'Player wins autoCashoutX100/100 × bet when crashX100 >= autoCashoutX100.',
      });
    } catch (err) {
      logger.error('[arcade-crash] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-crash] routes registered');
}
