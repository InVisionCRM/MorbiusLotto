/**
 * arcade-cascade.routes.ts — MORBIUS Arcade: Cascade (cluster-pays chain reaction).
 *
 * Endpoints for the Telegram Mini App + web (/cascade):
 *   GET  /api/arcade/cascade/info        — public: bounds + per-volatility configs
 *   POST /api/arcade/cascade/play        — charge bet, resolve cascade, settle (one txn);
 *                                          returns the FULL ordered step sequence for replay
 *   GET  /api/arcade/cascade/history     — caller's recent rounds
 *   GET  /api/arcade/cascade/recent      — public: latest rounds across all players
 *   GET  /api/arcade/cascade/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/cascade/verify/:id  — public: seeds + recipe; the entire cascade
 *                                          re-derives from (serverSeed, clientSeed, nonce)
 *
 * Single-shot: the whole round (bet debit, deterministic cascade, payout, row
 * insert) happens in a single DB transaction so it's atomic — never
 * half-settled, never paid twice. Mirrors arcade-dicex2.routes.ts; multi-mode
 * /info shape mirrors arcade-chicken.routes.ts. The step replay is NOT stored —
 * verify recomputes it from the published seeds with the same engine.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveCascade,
  cascadePayout,
  isCascadeVolatility,
  CASCADE_VOLATILITIES,
  CASCADE_MIN_BET,
  CASCADE_MAX_BET,
  CASCADE_COLS,
  CASCADE_ROWS,
  type CascadeVolatility,
} from '../services/arcade-cascade';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeCascadeRoutesOptions {
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

/**
 * Build the float stream for a round from the provably-fair HMAC byte stream.
 * One float per gem drawn, cursor += 4 per draw — the SAME convention as
 * drawPlinkoPath / deriveChickenBumpers. resolveCascade pulls gems in a fixed
 * order, so this stream re-derives the entire cascade in verify.
 */
function cascadeFloatStream(serverSeed: string, clientSeed: string, nonce: number): () => number {
  let cursor = 0;
  return () => {
    const bytes = pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor);
    cursor += 4;
    return pf.bytesToFloat(bytes);
  };
}

export function registerArcadeCascadeRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeCascadeRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /cascade). Telegram wins when both are present.
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
  // GET /api/arcade/cascade/info — public bounds + every volatility's config so
  // the UI renders the same paytable/combo curve/threshold the server enforces.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cascade/info', (_req: Request, res: Response) => {
    const volatilities: Record<
      string,
      {
        label: string;
        threshold: number;
        weights: number[];
        combo: number[];
        pay: number[];
        sizeBonus: number;
        payScale: number;
      }
    > = {};
    for (const v of Object.keys(CASCADE_VOLATILITIES) as CascadeVolatility[]) {
      const c = CASCADE_VOLATILITIES[v];
      volatilities[v] = {
        label: c.label,
        threshold: c.threshold,
        weights: c.weights,
        combo: c.combo,
        pay: c.pay,
        sizeBonus: c.sizeBonus,
        payScale: c.payScale,
      };
    }
    res.json({
      ok: true,
      minBet: CASCADE_MIN_BET,
      maxBet: CASCADE_MAX_BET,
      cols: CASCADE_COLS,
      rows: CASCADE_ROWS,
      volatilities,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/cascade/play — charge the bet, resolve the cascade, settle
  // in one txn. Returns the full ordered replay sequence so the client can
  // animate the exact same chain reaction the server computed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/cascade/play', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < CASCADE_MIN_BET || bet > CASCADE_MAX_BET) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${CASCADE_MIN_BET} and ${CASCADE_MAX_BET} chips.`,
        });
      }

      const volatility = req.body?.volatility;
      if (!isCascadeVolatility(volatility)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Volatility must be calm, standard or frenzy.' });
      }

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      let result!: ReturnType<typeof resolveCascade>;
      let serverSeedHash = '';
      let nonce = 0;
      let totalMultiplierX100 = 0;
      let payout = 0;
      let won = false;
      await dbService.withTransaction(async (client) => {
        // Charges the bet (throws if the wallet can't cover it).
        chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-bet),
          'arcade_cascade_bet',
          { type: 'arcade_cascade', id: roundId },
        );

        // Consume the wallet's PRE-COMMITTED active seed at the next nonce. Its
        // hash was published before this bet (GET /api/arcade/seed/active) and
        // the plaintext stays hidden until the player rotates — so the whole
        // cascade was provably fixed in advance, not chosen at settle time. The
        // SAME deterministic derivation as before; only the seed provenance and
        // the (now sequential) nonce changed.
        const seed = await consumeSeedForBet(client, wallet);
        serverSeedHash = seed.serverSeedHash;
        nonce = seed.nonce;
        result = resolveCascade(
          volatility,
          cascadeFloatStream(seed.serverSeed, seed.clientSeed, seed.nonce),
        );
        totalMultiplierX100 = result.totalMultiplierX100;
        payout = cascadePayout(bet, totalMultiplierX100);
        won = payout > 0;

        if (payout > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_cascade_payout',
            { type: 'arcade_cascade', id: roundId },
          );
        }
        // server_seed stays NULL on the round — the plaintext lives only in the
        // seed pair's pending row and is revealed via rotation, not per-round.
        await client.query(
          `INSERT INTO arcade_cascade_rounds
             (id, wallet_address, bet, volatility, multiplier_x100, clusters,
              chain_log, won, payout, server_seed, server_seed_hash, client_seed, nonce,
              seed_pair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NULL, $10, $11, $12, $13)`,
          [
            roundId,
            wallet.toLowerCase(),
            bet,
            volatility,
            totalMultiplierX100,
            result.clusters,
            JSON.stringify(result.chainLog),
            won,
            payout,
            serverSeedHash,
            seed.clientSeed,
            nonce,
            seed.seedPairId,
          ],
        );
      });

      return res.json({
        ok: true,
        roundId,
        bet,
        volatility,
        // Full replay payload — the client animates this exact sequence.
        initialBoard: result.initialBoard,
        finalBoard: result.finalBoard,
        steps: result.steps,
        chainLog: result.chainLog,
        clusters: result.clusters,
        multiplierX100: totalMultiplierX100,
        won,
        payout,
        serverSeedHash,
        nonce,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-cascade] play failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not play the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cascade/history — caller's recent rounds.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cascade/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, volatility, multiplier_x100, clusters, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, created_at, seed_pair_id
           FROM arcade_cascade_rounds
          WHERE wallet_address = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: await Promise.all(
          r.rows.map(async (row) => {
            const volatility = row.volatility as CascadeVolatility;
            // The board isn't stored — re-derive the settled grid from the
            // published seeds (same engine as verify) so the client can re-show
            // the final board for a replay without another round. The server
            // seed is committed until the player rotates, so the board is only
            // re-derivable (non-null) once the seed pair has been revealed.
            const reveal = await revealedSeedForRound(
              pool,
              row.seed_pair_id ?? null,
              row.server_seed ?? null,
            );
            const finalBoard =
              reveal.serverSeed && isCascadeVolatility(volatility)
                ? resolveCascade(
                    volatility,
                    cascadeFloatStream(reveal.serverSeed, row.client_seed, Number(row.nonce)),
                  ).finalBoard
                : null;
            return {
              roundId: row.id,
              bet: Number(row.bet),
              volatility,
              multiplierX100: Number(row.multiplier_x100),
              clusters: Number(row.clusters),
              won: !!row.won,
              payout: Number(row.payout),
              finalBoard,
              createdAt: row.created_at,
            };
          }),
        ),
      });
    } catch (err) {
      logger.error('[arcade-cascade] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cascade/recent — public. Latest rounds across all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cascade/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, volatility, multiplier_x100, clusters, won, payout,
                created_at
           FROM arcade_cascade_rounds
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
          volatility: row.volatility,
          multiplierX100: Number(row.multiplier_x100),
          clusters: Number(row.clusters),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-cascade] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cascade/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cascade/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_cascade_rounds
          GROUP BY wallet_address
          ORDER BY SUM(payout) - SUM(bet) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          rounds: Number(row.rounds),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-cascade] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cascade/verify/:id — public. Returns the published seeds +
  // the recipe and re-derives the ENTIRE cascade from
  // (serverSeed, clientSeed, nonce) so anyone can independently confirm the
  // grid, every pop, and the total multiplier. The recomputed total is returned
  // alongside the stored one for a direct match check.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cascade/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, volatility, multiplier_x100, clusters, chain_log, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, created_at, seed_pair_id
           FROM arcade_cascade_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      const volatility = row.volatility as CascadeVolatility;

      // Plaintext server seed is revealed ONLY once the pair has been rotated —
      // until then the round exposes just the pre-published commitment, and the
      // cascade cannot be re-derived yet.
      const reveal = await revealedSeedForRound(
        pool,
        row.seed_pair_id ?? null,
        row.server_seed ?? null,
      );

      // Re-derive the whole cascade from the revealed seeds (null until reveal).
      const recomputed =
        reveal.serverSeed && isCascadeVolatility(volatility)
          ? resolveCascade(
              volatility,
              cascadeFloatStream(reveal.serverSeed, row.client_seed, Number(row.nonce)),
            )
          : null;

      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        volatility,
        multiplierX100: Number(row.multiplier_x100),
        recomputedMultiplierX100: recomputed ? recomputed.totalMultiplierX100 : null,
        clusters: Number(row.clusters),
        chainLog: row.chain_log,
        // Full re-derived replay so the verifier can show the same cascade.
        steps: recomputed ? recomputed.steps : [],
        initialBoard: recomputed ? recomputed.initialBoard : null,
        finalBoard: recomputed ? recomputed.finalBoard : null,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        createdAt: row.created_at,
        recipe:
          'Draw floats from f(k) = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, k*4)), k = 0,1,2,…. ' +
          'Fill the 6×6 grid row-major (36 draws), then repeat: find every cluster of >= threshold ' +
          'connected matching gems; each pays round(pay[gem] × (1 + sizeBonus × (size - threshold)) × payScale); ' +
          'sum × combo[chain] / 100 is that link\'s win ×100; pop winners, drop survivors, refill empty slots ' +
          'column-by-column bottom-up (one draw each, in column order). Stop when no clusters form. ' +
          'multiplierX100 = sum of every link\'s win; payout = floor(bet × multiplierX100 / 100). ' +
          'The serverSeedHash was committed before the bet; rotate your seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[arcade-cascade] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-cascade] routes registered');
}
