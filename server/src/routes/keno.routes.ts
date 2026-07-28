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
 * keno_payout). The server seed is a PERSISTENT per-wallet commitment (shared
 * arcade-seed.service): its hash is published before the bet and the plaintext
 * is revealed only when the player rotates, which is what makes each round
 * verifiable — the draw could not be chosen after the fact.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
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
  type KenoResult,
} from '../services/keno';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';

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
  'hits = |picks ∩ drawn|. payout = floor(bet × multiplierX100(risk, picks.length, hits) / 100). ' +
  'The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and ' +
  'confirm sha256(serverSeed) === serverSeedHash.';

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
      minBet: betLimits('keno').min,
      maxBet: betLimits('keno').max,
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
  // The draw is derived from the wallet's PERSISTENT pre-committed seed pair
  // (consumeSeedForBet) — the client seed lives on that pair, not per-bet.
  // Body: { picks: number[], risk: 'classic'|'low'|'medium'|'high', bet: number }
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
      if (!Number.isFinite(bet) || bet < betLimits('keno').min || bet > betLimits('keno').max) {
        return res
          .status(400)
          .json({ ok: false, error: `bet must be between ${betLimits('keno').min} and ${betLimits('keno').max} chips` });
      }

      // --- atomic settle (bet debit, provably-fair draw, payout, insert) ---
      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let drawn: number[] = [];
      let result!: KenoResult;
      let serverSeedHash = '';
      let clientSeed = '';
      let nonce = 0;
      await dbService.withTransaction(async (client) => {
        // Charge the bet first (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          addr,
          BigInt(-bet),
          'keno_bet',
          { type: 'keno_round', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the draw was
        // provably fixed in advance, not chosen at settle time. Same
        // drawKenoNumbers derivation as before; only the seed provenance and the
        // (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, addr);
        serverSeedHash = seed.serverSeedHash;
        clientSeed = seed.clientSeed;
        nonce = seed.nonce;
        drawn = pf.drawKenoNumbers(seed.serverSeed, seed.clientSeed, seed.nonce);
        result = resolveKeno(picks, drawn, risk, bet);

        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            addr,
            BigInt(result.payout),
            'keno_payout',
            { type: 'keno_round', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO keno_rounds
             (id, wallet_address, bet, risk, picks, drawn, hits, multiplier_x100,
              payout, server_seed, server_seed_hash, client_seed, nonce, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NULL, $10, $11, $12, $13)`,
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
            serverSeedHash,
            clientSeed,
            nonce,
            seed.seedPairId,
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
  // GET /api/keno/recent — public global feed. From the most recent rounds it
  // derives BOTH the recent *wins* (payout > 0, newest first) and the *hot
  // numbers* (how often each tile has been drawn across those rounds). One query
  // powers the "Recent wins" tab and the hot-numbers strip under the board.
  // ---------------------------------------------------------------------------
  app.get('/api/keno/recent', async (req: Request, res: Response) => {
    // Analyse a wide window for hot numbers; surface a smaller slice of wins.
    const sample = Math.max(40, Math.min(400, parseInt(String(req.query.limit ?? '200'), 10) || 200));
    const MAX_WINS = 25;
    try {
      const r = await pool.query(
        `SELECT kr.id, kr.wallet_address, kr.bet, kr.risk, kr.drawn, kr.hits,
                kr.multiplier_x100, kr.payout, kr.created_at, cdn.display_name
           FROM keno_rounds kr
           LEFT JOIN chat_display_names cdn
             ON LOWER(cdn.wallet_address) = LOWER(kr.wallet_address)
          ORDER BY kr.created_at DESC
          LIMIT $1`,
        [sample],
      );
      const counts = new Map<number, number>();
      const wins: Array<Record<string, unknown>> = [];
      for (const row of r.rows) {
        const drawn: number[] = Array.isArray(row.drawn) ? row.drawn : [];
        for (const n of drawn) counts.set(n, (counts.get(n) ?? 0) + 1);
        if (Number(row.payout) > 0 && wins.length < MAX_WINS) {
          wins.push({
            roundId: row.id,
            address: row.wallet_address,
            username: row.display_name ?? null,
            bet: Number(row.bet),
            hits: row.hits,
            multiplierX100: Number(row.multiplier_x100),
            payout: Number(row.payout),
            createdAt: row.created_at,
          });
        }
      }
      const hotNumbers = Array.from(counts.entries())
        .map(([n, count]) => ({ n, count }))
        .sort((a, b) => b.count - a.count || a.n - b.n);
      res.json({ ok: true, roundsAnalyzed: r.rows.length, hotNumbers, wins });
    } catch (e) {
      logger.error('keno.recent failed', { error: (e as Error).message });
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
                payout, server_seed, server_seed_hash, client_seed, nonce, created_at,
                seed_pair_id
           FROM keno_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];

      // Plaintext server seed is revealed ONLY once the pair has been rotated —
      // until then the round exposes just the pre-published commitment.
      const reveal = await revealedSeedForRound(
        pool,
        row.seed_pair_id ?? null,
        row.server_seed ?? null,
      );

      // Re-derive the draw and re-score from the seeds — only possible once the
      // server seed has been revealed. Until then, checks are reported false.
      const recomputedDrawn = reveal.serverSeed
        ? pf.drawKenoNumbers(reveal.serverSeed, row.client_seed, Number(row.nonce))
        : [];
      const recomputed = reveal.serverSeed
        ? resolveKeno(row.picks, recomputedDrawn, row.risk, Number(row.bet))
        : null;
      const hashMatches = reveal.serverSeed
        ? pf.createServerSeedHash(reveal.serverSeed) === row.server_seed_hash
        : false;
      const drawMatches = reveal.serverSeed
        ? JSON.stringify(recomputedDrawn) === JSON.stringify(row.drawn)
        : false;
      const payoutMatches =
        recomputed != null &&
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
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        serverSeedHash: row.server_seed_hash,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        verification: {
          hashMatches,
          drawMatches,
          payoutMatches,
          recomputedDrawn,
          recomputedHits: recomputed?.hits ?? null,
          recomputedMultiplierX100: recomputed?.multiplierX100 ?? null,
          recomputedPayout: recomputed?.payout ?? null,
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
