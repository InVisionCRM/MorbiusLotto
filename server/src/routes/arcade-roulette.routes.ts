/**
 * arcade-roulette.routes.ts — MORBIUS Arcade: Roulette (European).
 *
 * Endpoints:
 *   GET  /api/arcade/roulette/info        — public: bet bounds + payout table
 *   POST /api/arcade/roulette/spin        — debit bets, spin, credit, insert (atomic)
 *   GET  /api/arcade/roulette/verify/:id  — public: provably-fair verification
 *
 * Settlement is instant (like Baccarat) — no player decisions after the spin.
 * The entire round is one DB transaction: bet debit → HMAC roll → payout credit
 * → row insert, so a spin is never half-settled.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  validateRouletteBets,
  resolveRoulettePayouts,
  sumRoulettePayouts,
  rouletteResultFromFloat,
  roulettePayoutMultiplier,
  ROULETTE_MIN_BET,
  ROULETTE_MAX_BET_PER_ZONE,
  ROULETTE_MAX_TOTAL_BET,
  ROULETTE_MAX_ZONES,
  type RouletteBet,
} from '../services/arcade-roulette';
import type { DatabaseService } from '../services/database.service';

interface RegisterArcadeRouletteRoutesOptions {
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

function sanitizeBets(raw: unknown): RouletteBet[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const b = (item ?? {}) as Record<string, unknown>;
    return {
      type: String(b.type ?? '') as RouletteBet['type'],
      amount: Math.floor(Number(b.amount)),
      numbers: Array.isArray(b.numbers)
        ? (b.numbers as unknown[]).map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n))
        : undefined,
    } as RouletteBet;
  });
}

export function registerArcadeRouletteRoutes({
  app,
  dbService,
}: RegisterArcadeRouletteRoutesOptions): void {
  const pool = dbService.getPool();

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/info
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: ROULETTE_MIN_BET,
      maxBetPerZone: ROULETTE_MAX_BET_PER_ZONE,
      maxTotalBet: ROULETTE_MAX_TOTAL_BET,
      maxZones: ROULETTE_MAX_ZONES,
      payouts: {
        straight: roulettePayoutMultiplier('straight'),
        split:    roulettePayoutMultiplier('split'),
        street:   roulettePayoutMultiplier('street'),
        corner:   roulettePayoutMultiplier('corner'),
        line:     roulettePayoutMultiplier('line'),
        dozen:    roulettePayoutMultiplier('dozen'),
        column:   roulettePayoutMultiplier('column'),
        evenmoney: roulettePayoutMultiplier('red'),
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/roulette/spin
  // -------------------------------------------------------------------------
  app.post('/api/arcade/roulette/spin', async (req: Request, res: Response) => {
    try {
      const wallet = await walletFromInitData(dbService, req.body?.initData);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: 'Invalid Telegram session, or no wallet linked.' });
      }

      const bets = sanitizeBets(req.body?.bets);
      const v = validateRouletteBets(bets);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const totalBet = v.total;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
      const r = pf.bytesToFloat(bytes);
      const result = rouletteResultFromFloat(r);
      const payouts = resolveRoulettePayouts(bets, result);
      const totalPayout = sumRoulettePayouts(payouts);

      const spinId = crypto.randomUUID();
      let chipBalance = 0n;

      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-totalBet),
          'arcade_roulette_bet',
          { type: 'arcade_roulette', id: spinId },
        );
        if (totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(totalPayout),
            'arcade_roulette_payout',
            { type: 'arcade_roulette', id: spinId },
          );
        }
        await client.query(
          `INSERT INTO arcade_roulette_spins
             (id, wallet_address, bets, total_bet, result, payouts, total_payout,
              server_seed, server_seed_hash, client_seed, nonce)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            spinId,
            wallet.toLowerCase(),
            JSON.stringify(bets),
            totalBet,
            result,
            JSON.stringify(payouts),
            totalPayout,
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce,
          ],
        );
      });

      return res.json({
        ok: true,
        spinId,
        bets,
        totalBet,
        result,
        payouts,
        totalPayout,
        serverSeedHash,
        serverSeed,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that wager.' });
      }
      logger.error('[arcade-roulette] spin failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not complete the spin.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/verify/:id
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bets, total_bet, result, payouts, total_payout,
                server_seed, server_seed_hash, client_seed, nonce, created_at
           FROM arcade_roulette_spins WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Spin not found.' });
      const row = r.rows[0];
      return res.json({
        ok: true,
        spinId: row.id,
        bets: row.bets,
        totalBet: Number(row.total_bet),
        result: Number(row.result),
        payouts: row.payouts,
        totalPayout: Number(row.total_payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)[0..3]). ' +
          'result = Math.floor(r * 37) — pocket 0 = zero, 1-36 = number. ' +
          'sha256(serverSeed) must equal serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-roulette] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the spin.' });
    }
  });

  logger.info('[arcade-roulette] routes registered');
}
