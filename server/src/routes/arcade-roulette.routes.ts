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
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  validateRouletteBets,
  resolveRoulettePayouts,
  sumRoulettePayouts,
  rouletteResultFromFloat,
  roulettePayoutMultiplier,
  ROULETTE_MAX_TOTAL_BET,
  ROULETTE_MAX_ZONES,
  type RouletteBet,
} from '../services/arcade-roulette';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeRouletteRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
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
  authService,
}: RegisterArcadeRouletteRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /** Caller's wallet: Telegram initData (Mini App) or the SIWE morb_session cookie (web /roulette2). */
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/info
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      minBet: betLimits('roulette').min,
      maxBetPerZone: betLimits('roulette').max,
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
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bets = sanitizeBets(req.body?.bets);
      const v = validateRouletteBets(bets);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const totalBet = v.total;

      const spinId = crypto.randomUUID();
      let chipBalance = 0n;
      let result = 0;
      let payouts: number[] = [];
      let totalPayout = 0;
      let serverSeedHash = '';
      let nonce = 0;

      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-totalBet),
          'arcade_roulette_bet',
          { type: 'arcade_roulette', id: spinId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. The
        // pocket was fixed by a hash published before the spin (and hidden until
        // rotation) — no longer minted-and-revealed inside this one request.
        const seed = await consumeSeedForBet(client, wallet);
        serverSeedHash = seed.serverSeedHash;
        nonce = seed.nonce;
        const r = pf.bytesToFloat(pf.hmacByteStream(seed.serverSeed, seed.clientSeed, seed.nonce, 0));
        result = rouletteResultFromFloat(r);
        payouts = resolveRoulettePayouts(bets, result);
        totalPayout = sumRoulettePayouts(payouts);

        if (totalPayout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(totalPayout),
            'arcade_roulette_payout',
            { type: 'arcade_roulette', id: spinId },
          );
        }
        // server_seed stays NULL — revealed via seed-pair rotation, not per-spin.
        await client.query(
          `INSERT INTO arcade_roulette_spins
             (id, wallet_address, bets, total_bet, result, payouts, total_payout,
              server_seed, server_seed_hash, client_seed, nonce, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11)`,
          [
            spinId,
            wallet.toLowerCase(),
            JSON.stringify(bets),
            totalBet,
            result,
            JSON.stringify(payouts),
            totalPayout,
            serverSeedHash,
            seed.clientSeed,
            nonce,
            seed.seedPairId,
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
        nonce,
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
  // GET /api/arcade/roulette/history — caller's recent spins.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bets, total_bet, result, total_payout, created_at
           FROM arcade_roulette_spins
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        spins: r.rows.map((row) => ({
          spinId: row.id,
          bets: row.bets,
          totalBet: Number(row.total_bet),
          result: Number(row.result),
          totalPayout: Number(row.total_payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-roulette] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/recent — public. Latest spins across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, total_bet, result, total_payout, created_at
           FROM arcade_roulette_spins
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        spins: r.rows.map((row) => ({
          spinId: row.id,
          wallet: row.wallet_address,
          totalBet: Number(row.total_bet),
          result: Number(row.result),
          totalPayout: Number(row.total_payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-roulette] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS spins,
                SUM(total_bet)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(total_bet))::text AS net
           FROM arcade_roulette_spins
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(total_bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          spins: Number(row.spins),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-roulette] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/roulette/verify/:id
  // -------------------------------------------------------------------------
  app.get('/api/arcade/roulette/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bets, total_bet, result, payouts, total_payout,
                server_seed, server_seed_hash, client_seed, nonce, created_at, seed_pair_id
           FROM arcade_roulette_spins WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Spin not found.' });
      const row = r.rows[0];
      // Reveal the plaintext seed only once its pair has been rotated.
      const reveal = await revealedSeedForRound(
        pool,
        row.seed_pair_id ?? null,
        row.server_seed ?? null,
      );
      return res.json({
        ok: true,
        spinId: row.id,
        bets: row.bets,
        totalBet: Number(row.total_bet),
        result: Number(row.result),
        payouts: row.payouts,
        totalPayout: Number(row.total_payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)[0..3]). ' +
          'result = Math.floor(r * 37) — pocket 0 = zero, 1-36 = number. ' +
          'The serverSeedHash was committed before the spin; rotate your seed to reveal serverSeed, then sha256(serverSeed) must equal serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-roulette] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the spin.' });
    }
  });

  logger.info('[arcade-roulette] routes registered');
}
