/**
 * plinko-chips.routes.ts — Server-side Plinko (chips, provably fair).
 *
 * Endpoints (main web app, wallet-session auth via requireAuth):
 *   GET  /api/plinko/info          — public: rows / buckets / bet bounds / risks
 *   GET  /api/plinko/multipliers   — public: full ×100 tables for every risk
 *   POST /api/plinko/play          — auth:   one ball — charge, draw path, settle in one txn
 *   GET  /api/plinko/history       — auth:   caller's recent balls
 *   GET  /api/plinko/verify/:id    — public: published seeds + recipe to re-derive the path
 *
 * NOTE: the legacy on-chain reads live at /api/plinko/player/:address/* —
 * these paths are chosen not to collide with them.
 *
 * Settlement model mirrors keno.routes.ts: the whole ball (bet debit, draw,
 * payout credit, row insert) runs in a single DB transaction through the
 * shared player_poker_chips wallet (ledger reasons plinko_bet/plinko_payout).
 * Stake-style rapid fire is just this endpoint called once per ball — each
 * ball is independently seeded, settled and verifiable.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { logger } from '../utils/logger';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import {
  resolvePlinko,
  isPlinkoRisk,
  PLINKO_MULTIPLIERS_X100,
  PLINKO_RISKS,
  PLINKO_ROWS,
  PLINKO_BUCKETS,
  PLINKO_MIN_BET,
  PLINKO_MAX_BET,
} from '../services/plinko-chips';

interface RegisterPlinkoChipRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();

/** The verifier recipe string, published on every /verify response. */
const PLINKO_RECIPE =
  'path = ProvablyFairService.drawPlinkoPath(serverSeed, clientSeed, nonce): ' +
  '16 steps, 4 HMAC-SHA256 stream bytes each (message = `${clientSeed}:${nonce}:${roundIndex}`), ' +
  'step = float < 0.5 ? 0 (left) : 1 (right). bucket = sum(path). ' +
  'payout = floor(bet × multiplierX100(risk, bucket) / 100).';

export function registerPlinkoChipRoutes({
  app,
  dbService,
  authService,
}: RegisterPlinkoChipRoutesOptions): void {
  const pool = dbService.getPool();

  // ---------------------------------------------------------------------------
  // GET /api/plinko/info — public bounds so the UI renders exactly what the
  // server enforces.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/info', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      rows: PLINKO_ROWS,
      buckets: PLINKO_BUCKETS,
      minBet: PLINKO_MIN_BET,
      maxBet: PLINKO_MAX_BET,
      risks: PLINKO_RISKS,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/plinko/multipliers — public. Full ×100 tables for all risks.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/multipliers', (_req: Request, res: Response) => {
    res.json({ ok: true, multipliersX100: PLINKO_MULTIPLIERS_X100 });
  });

  // ---------------------------------------------------------------------------
  // POST /api/plinko/play — auth. One ball: charge, draw the path, settle in
  // one txn. Body: { risk: 'low'|'medium'|'high', bet: number }
  // ---------------------------------------------------------------------------
  app.post('/api/plinko/play', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    try {
      const risk = req.body?.risk;
      if (!isPlinkoRisk(risk)) {
        return res.status(400).json({ ok: false, error: 'risk must be low, medium or high' });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < PLINKO_MIN_BET || bet > PLINKO_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `bet must be between ${PLINKO_MIN_BET} and ${PLINKO_MAX_BET} chips`,
        });
      }

      // --- atomic settle: charge, then derive the path from the wallet's
      // pre-committed active seed, settle, all in one txn. ---
      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let path: number[] = [];
      let result!: ReturnType<typeof resolvePlinko>;
      let serverSeedHash = '';
      let clientSeed = '';
      let nonce = 0;
      await dbService.withTransaction(async (client) => {
        chipBalance = await applyPokerChipDelta(
          client,
          addr,
          BigInt(-bet),
          'plinko_bet',
          { type: 'plinko_round', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the path was
        // provably fixed in advance, not chosen at settle time. Same
        // drawPlinkoPath derivation as before; only the seed provenance and the
        // (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, addr);
        serverSeedHash = seed.serverSeedHash;
        clientSeed = seed.clientSeed;
        nonce = seed.nonce;
        path = pf.drawPlinkoPath(seed.serverSeed, seed.clientSeed, seed.nonce);
        result = resolvePlinko(risk, bet, path);

        if (result.payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            addr,
            BigInt(result.payout),
            'plinko_payout',
            { type: 'plinko_round', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO plinko_rounds
             (id, wallet_address, bet, risk, path, bucket, multiplier_x100,
              payout, server_seed, server_seed_hash, client_seed, nonce, seed_pair_id)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, NULL, $9, $10, $11, $12)`,
          [
            roundId,
            addr,
            bet,
            risk,
            JSON.stringify(path),
            result.bucket,
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
        risk,
        bet,
        path,
        bucket: result.bucket,
        multiplierX100: result.multiplierX100,
        payout: result.payout,
        won: result.payout > bet,
        serverSeedHash,
        clientSeed,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res
          .status(402)
          .json({ ok: false, error: 'Not enough chips for that bet.', code: 'NO_CHIPS' });
      }
      logger.error('[plinko-chips] play failed', { addr, error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the ball.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/plinko/history — auth. Recent balls for the player's history panel.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/history', requireAuth(authService), async (req: Request, res: Response) => {
    const addr = req.user!.address.toLowerCase();
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, bet, risk, path, bucket, multiplier_x100, payout,
                server_seed_hash, created_at
           FROM plinko_rounds
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
          path: row.path,
          bucket: row.bucket,
          multiplierX100: Number(row.multiplier_x100),
          payout: Number(row.payout),
          serverSeedHash: row.server_seed_hash,
          createdAt: row.created_at,
        })),
      });
    } catch (e) {
      logger.error('plinko-chips.history failed', { addr, error: (e as Error).message });
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/plinko/recent — public. Latest balls across all players for the
  // /plinko2 info tabs. Raw wallet addresses; the client shortens for display.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, risk, bucket, multiplier_x100, payout, created_at
           FROM plinko_rounds
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          wallet: row.wallet_address,
          bet: Number(row.bet),
          risk: row.risk,
          bucket: Number(row.bucket),
          multiplierX100: Number(row.multiplier_x100),
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (e) {
      logger.error('[plinko-chips] recent failed', { error: (e as Error).message });
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/plinko/leaderboard — public. All-time top players by net chips.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS balls,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM plinko_rounds
          GROUP BY wallet_address
          ORDER BY SUM(payout) - SUM(bet) DESC
          LIMIT $1`,
        [limit],
      );
      res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          balls: Number(row.balls),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (e) {
      logger.error('[plinko-chips] leaderboard failed', { error: (e as Error).message });
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/plinko/verify/:id — public. Published seeds + recipe and an
  // independent re-derivation so anyone can confirm the path and payout.
  // ---------------------------------------------------------------------------
  app.get('/api/plinko/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, risk, path, bucket, multiplier_x100,
                payout, server_seed, server_seed_hash, client_seed, nonce, created_at,
                seed_pair_id
           FROM plinko_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];

      // Plaintext server seed is revealed ONLY once the pair has been rotated —
      // until then the round exposes just the pre-published commitment. Legacy
      // rows that stored the plaintext inline stay verifiable as before.
      const reveal = await revealedSeedForRound(
        pool,
        row.seed_pair_id ?? null,
        row.server_seed ?? null,
      );
      const revealedSeed = reveal.serverSeed;

      // Independent re-derivation is only possible once the seed is revealed;
      // otherwise the checks stay false and the UI shows "rotate to reveal".
      const recomputedPath = revealedSeed
        ? pf.drawPlinkoPath(revealedSeed, row.client_seed, Number(row.nonce))
        : [];
      const recomputed = revealedSeed
        ? resolvePlinko(row.risk, Number(row.bet), recomputedPath)
        : null;
      const hashMatches = revealedSeed
        ? pf.createServerSeedHash(revealedSeed) === row.server_seed_hash
        : false;
      const pathMatches = revealedSeed
        ? JSON.stringify(recomputedPath) === JSON.stringify(row.path)
        : false;
      const payoutMatches =
        recomputed != null &&
        recomputed.bucket === row.bucket &&
        recomputed.multiplierX100 === Number(row.multiplier_x100) &&
        recomputed.payout === Number(row.payout);

      return res.json({
        ok: true,
        roundId: row.id,
        wallet: row.wallet_address,
        bet: Number(row.bet),
        risk: row.risk,
        path: row.path,
        bucket: row.bucket,
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
          pathMatches,
          payoutMatches,
          recomputedPath,
          recomputedBucket: recomputed?.bucket ?? null,
          recomputedMultiplierX100: recomputed?.multiplierX100 ?? null,
          recomputedPayout: recomputed?.payout ?? null,
        },
        recipe:
          PLINKO_RECIPE +
          ' The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (e) {
      logger.error('plinko-chips.verify failed', { id: req.params.id, error: (e as Error).message });
      res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[plinko-chips] routes registered');
}
