/**
 * keno.routes.ts — Server-side Stake-style Keno (chips, provably fair).
 *
 * Endpoints (main web app, wallet-session auth via requireAuth):
 *   GET  /api/keno/info          — public: tiles / draw / pick & bet bounds / risks
 *   GET  /api/keno/multipliers   — public: full ×100 paytables for every risk
 *   GET  /api/keno/balance       — auth:   caller's chip balance
 *   POST /api/keno/play          — auth:   charge bet, draw 10, settle in one txn
 *   GET  /api/keno/history       — auth:   caller's recent rounds
 *   GET  /api/keno/verify/:id    — public: published seeds + recipe to re-derive the draw
 *
 * Settlement model mirrors arcade-dice.routes.ts: the whole round (bet debit,
 * draw, payout credit, row insert) runs in a single DB transaction, so a round
 * is atomic — never half-settled, never paid twice. Chips move through the
 * shared player_poker_chips wallet (poker_chip_ledger reasons keno_bet /
 * keno_payout). The committed server seed is revealed in the same row at play
 * time (instant-settle game), which is what makes each round verifiable.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { logger } from '../utils/logger';
import { applyPokerChipDelta, getPokerChipBalance } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveKeno,
  normalizeKenoPicks,
  isKenoRisk,
  KENO_PAYTABLES,
  KENO_RISKS,
  KENO_TOTAL_TILES,
  KENO_DRAW_COUNT,
  KENO_MIN_PICKS,
  KENO_MAX_PICKS,
  KENO_MIN_BET,
  KENO_MAX_BET,
} from '../services/keno';

interface RegisterKenoRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

/** The verifier recipe string, published on every /verify response. */
const KENO_RECIPE =
  'drawn = ProvablyFairService.drawKenoNumbers(serverSeed, clientSeed, nonce): ' +
  'partial Fisher-Yates over tiles 1..40 using HMAC-SHA256 byte stream ' +
  '(message = `${clientSeed}:${nonce}:${roundIndex}`), taking the top 10 slots in draw order. ' +
  'hits = |picks ∩ drawn|. payout = floor(bet × multiplierX100(risk, picks.length, hits) / 100).';

export function registerKenoRoutes({ app, dbService, authService }: RegisterKenoRoutesOptions): void {
  const pool = dbService.getPool();

  // ---------------------------------------------------------------------------
  // GET /api/keno/info — public bounds so the UI renders exactly what the
  // server enforces.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      totalTiles: KENO_TOTAL_TILES,
      drawCount: KENO_DRAW_COUNT,
      minPicks: KENO_MIN_PICKS,
      maxPicks: KENO_MAX_PICKS,
      minBet: KENO_MIN_BET,
      maxBet: KENO_MAX_BET,
      risks: KENO_RISKS,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/keno/multipliers — public. Full ×100 paytables for all four risks
  // so the client can render the live payout strip from one source of truth.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/multipliers', (_req: Request, res: Response) => {
    res.json({ ok: true, multipliersX100: KENO_PAYTABLES });
  });

  // ---------------------------------------------------------------------------
  // GET /api/keno/balance — auth. Current chip balance.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/balance', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    try {
      const balance = await getPokerChipBalance(pool, addr);
      res.json({ ok: true, address: addr, chipBalance: balance.toString() });
    } catch (e) {
      logger.error('keno.balance failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/keno/play — auth. Charge the bet, draw 10, settle in one txn.
  // Body: { picks: number[], risk: 'classic'|'low'|'medium'|'high',
  //         bet: number, clientSeed?: string }
  // ---------------------------------------------------------------------------
  app.post('/api/keno/play', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    try {
      // --- validate inputs (all map to 400) ---
      let picks: number[];
      try {
        picks = normalizeKenoPicks(req.body?.picks);
      } catch (e) {
        return res.status(400).json({ ok: false, error: (e as Error).message });
      }

      const risk = req.body?.risk;
      if (!isKenoRisk(risk)) {
        return res.status(400).json({ ok: false, error: 'risk must be classic, low, medium or high' });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < KENO_MIN_BET || bet > KENO_MAX_BET) {
        return res
          .status(400)
          .json({ ok: false, error: `bet must be between ${KENO_MIN_BET} and ${KENO_MAX_BET} chips` });
      }

      // --- provably-fair draw (fresh server seed per round, like Dice) ---
      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      const drawn = pf.drawKenoNumbers(serverSeed, clientSeed, nonce);
      const result = resolveKeno(picks, drawn, risk, bet);

      // --- atomic settle ---
      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          addr,
          BigInt(-bet),
          'keno_bet',
          { type: 'keno_round', id: roundId },
        );
        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            addr,
            BigInt(result.payout),
            'keno_payout',
            { type: 'keno_round', id: roundId },
          );
        }
        await client.query(
          `INSERT INTO keno_rounds
             (id, wallet_address, bet, risk, picks, drawn, hits, multiplier_x100,
              payout, server_seed, server_seed_hash, client_seed, nonce)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)`,
          [
            roundId,
            addr,
            bet,
            risk,
            JSON.stringify(picks),
            JSON.stringify(drawn),
            result.hits,
            result.multiplierX100,
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
        picks,
        drawn,
        risk,
        bet,
        hits: result.hits,
        multiplierX100: result.multiplierX100,
        payout: result.payout,
        won: result.payout > 0,
        serverSeedHash,
        serverSeed,
        clientSeed,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(402).json({ ok: false, error: 'Not enough chips for that bet.', code: 'NO_CHIPS' });
      }
      logger.error('[keno] play failed', { addr, error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/keno/history — auth. Recent rounds for the player's history panel.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/history', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, bet, risk, picks, drawn, hits, multiplier_x100, payout,
                server_seed_hash, created_at
           FROM keno_rounds
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [addr, limit],
      );
      res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          bet: Number(row.bet),
          risk: row.risk,
          picks: row.picks,
          drawn: row.drawn,
          hits: row.hits,
          multiplierX100: Number(row.multiplier_x100),
          payout: Number(row.payout),
          serverSeedHash: row.server_seed_hash,
          createdAt: row.created_at,
        })),
      });
    } catch (e) {
      logger.error('keno.history failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/keno/verify/:id — public. Returns the published seeds + the recipe
  // and an independent re-derivation so anyone can confirm the draw and payout.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, risk, picks, drawn, hits, multiplier_x100,
                payout, server_seed, server_seed_hash, client_seed, nonce, created_at
           FROM keno_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];

      // Re-derive the draw and re-score from the published seeds.
      const recomputedDrawn = pf.drawKenoNumbers(row.server_seed, row.client_seed, Number(row.nonce));
      const recomputed = resolveKeno(row.picks, recomputedDrawn, row.risk, Number(row.bet));
      const hashMatches = pf.createServerSeedHash(row.server_seed) === row.server_seed_hash;
      const drawMatches = JSON.stringify(recomputedDrawn) === JSON.stringify(row.drawn);
      const payoutMatches =
        recomputed.hits === row.hits &&
        recomputed.multiplierX100 === Number(row.multiplier_x100) &&
        recomputed.payout === Number(row.payout);

      return res.json({
        ok: true,
        roundId: row.id,
        wallet: row.wallet_address,
        bet: Number(row.bet),
        risk: row.risk,
        picks: row.picks,
        drawn: row.drawn,
        hits: row.hits,
        multiplierX100: Number(row.multiplier_x100),
        payout: Number(row.payout),
        serverSeed: row.server_seed,
        serverSeedHash: row.server_seed_hash,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        verification: {
          hashMatches,
          drawMatches,
          payoutMatches,
          recomputedDrawn,
          recomputedHits: recomputed.hits,
          recomputedMultiplierX100: recomputed.multiplierX100,
          recomputedPayout: recomputed.payout,
        },
        recipe: KENO_RECIPE,
      });
    } catch (e) {
      logger.error('keno.verify failed', { id: req.params.id, error: (e as Error).message });
      res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[keno] routes registered');
}
