/**
 * arcade-cipher.routes.ts — MORBIUS Arcade: Cipher (Mastermind code-breaking).
 *
 * Endpoints (web /cipher + Telegram Mini App):
 *   GET  /api/arcade/cipher/info        — public: bounds + difficulties + ladders
 *   POST /api/arcade/cipher/start       — charge bet, seal the secret code, return id
 *   POST /api/arcade/cipher/guess       — submit a guess, return exact/partial pegs
 *                                          (full crack → win the crack ladder;
 *                                          last guess spent → bust)
 *   POST /api/arcade/cipher/cashout     — bank the secured value (best exact pegs)
 *   GET  /api/arcade/cipher/active      — caller's active round (refresh-resume)
 *   GET  /api/arcade/cipher/history     — caller's settled rounds
 *   GET  /api/arcade/cipher/recent      — public: latest settled rounds, all players
 *   GET  /api/arcade/cipher/leaderboard — public: all-time top players by net
 *   GET  /api/arcade/cipher/verify/:id  — public: seeds + code + guesses (settled ONLY)
 *
 * Stateful flow mirrors Chicken/Towers: /start INSERTs status='active', debits
 * the bet and seals the secret code behind the committed hash; /guess appends the
 * guess + its feedback and advances guess_count / best_exact, or settles
 * (crack → won=true + crack ladder; last guess → won=false bust); /cashout banks
 * the secured value (won=true). The server seed AND the secret code are only
 * revealed when the round is settled — an active round never leaks either, only
 * per-guess peg feedback.
 *
 * Auth is the signed Telegram `initData` or the SIWE morb_session cookie. The
 * full round is wrapped in row-level locking so a double-tap can't double-spend
 * or double-pay. The `uniq_arcade_cipher_active_per_wallet` partial unique index
 * also guarantees one active round per wallet at a time at the DB level.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  CIPHER_DIFFICULTIES,
  CIPHER_HOUSE_EDGE_BP,
  cipherCrackMultiplierX100,
  cipherFeedback,
  cipherPayout,
  cipherSecuredMultiplierX100,
  deriveSecretCode,
  isCipherDifficulty,
  validateCipherGuess,
  type CipherDifficulty,
  type CipherFeedback,
} from '../services/arcade-cipher';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeCipherRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

interface StoredGuess {
  guess: number[];
  exact: number;
  partial: number;
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

/** SELECT … FOR UPDATE the round row inside an open transaction. */
async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, bet, difficulty, code, guesses, guess_count,
            best_exact, cracked, multiplier_x100, status, won, payout,
            server_seed, server_seed_hash, client_seed, nonce, house_edge_bp
       FROM arcade_cipher_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export function registerArcadeCipherRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeCipherRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  /**
   * Caller's wallet: Telegram `initData` (Mini App) or the SIWE morb_session
   * cookie (web /cipher). Telegram wins when both are present.
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
  // GET /api/arcade/cipher/info — public bounds + the full ladder set for every
  // difficulty (codeLen, symbols, maxGuesses, crack ladder, secure ladder).
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/info', (_req: Request, res: Response) => {
    const difficulties: Record<
      string,
      {
        codeLen: number;
        symbols: number;
        maxGuesses: number;
        crack: number[];
        secure: number[];
      }
    > = {};
    for (const d of Object.keys(CIPHER_DIFFICULTIES) as CipherDifficulty[]) {
      difficulties[d] = { ...CIPHER_DIFFICULTIES[d] };
    }
    res.json({
      ok: true,
      minBet: betLimits('cipher').min,
      maxBet: betLimits('cipher').max,
      houseEdgeBp: CIPHER_HOUSE_EDGE_BP,
      difficulties,
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cipher/active — the wallet's active round (if any). Used by
  // the client on mount so a partly-guessed code survives a page refresh. Never
  // includes the secret code or any seed material beyond the commitment hash —
  // only the public guess history and its feedback.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const r = await pool.query(
        `SELECT id, bet, difficulty, guesses, guess_count, best_exact,
                multiplier_x100, server_seed_hash
           FROM arcade_cipher_rounds
          WHERE wallet_address = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase()],
      );
      if (r.rows.length === 0) {
        return res.json({ ok: true, active: null });
      }
      const row = r.rows[0];
      const difficulty = row.difficulty as CipherDifficulty;
      const cfg = CIPHER_DIFFICULTIES[difficulty];
      const guesses: StoredGuess[] = Array.isArray(row.guesses) ? row.guesses : [];
      const guessCount = Number(row.guess_count);
      const bestExact = Number(row.best_exact);
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          bet: Number(row.bet),
          difficulty,
          codeLen: cfg.codeLen,
          symbols: cfg.symbols,
          maxGuesses: cfg.maxGuesses,
          crack: cfg.crack,
          secure: cfg.secure,
          guesses,
          guessCount,
          bestExact,
          // Helpful, server-authoritative hints for the rail.
          crackNextX100: cipherCrackMultiplierX100(difficulty, guessCount + 1),
          securedX100: cipherSecuredMultiplierX100(difficulty, bestExact),
          serverSeedHash: row.server_seed_hash,
        },
      });
    } catch (err) {
      logger.error('[arcade-cipher] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/cipher/start — debit the bet, seal the secret code, return id.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/cipher/start', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }

      const bet = Math.floor(Number(req.body?.bet));
      if (!Number.isFinite(bet) || bet < betLimits('cipher').min || bet > betLimits('cipher').max) {
        return res.status(400).json({
          ok: false,
          error: `Bet must be between ${betLimits('cipher').min} and ${betLimits('cipher').max} chips.`,
        });
      }

      const difficulty = req.body?.difficulty;
      if (!isCipherDifficulty(difficulty)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Difficulty must be easy, medium or hard.' });
      }
      const cfg = CIPHER_DIFFICULTIES[difficulty];

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // The secret code is derived here, before the first guess, behind the
      // committed hash — it never moves and never leaves the server while the
      // round is active.
      const code = deriveSecretCode(
        (cursor) => pf.hmacByteStream(serverSeed, clientSeed, nonce, cursor),
        (b) => pf.bytesToFloat(b),
        difficulty,
      );

      const roundId = crypto.randomUUID();
      let chipBalance = 0n;
      try {
        await dbService.withTransaction(async (client) => {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-bet),
            'arcade_cipher_bet',
            { type: 'arcade_cipher', id: roundId },
          );
          await client.query(
            `INSERT INTO arcade_cipher_rounds
               (id, wallet_address, bet, difficulty, code, guesses, guess_count,
                best_exact, cracked, multiplier_x100, status, won, payout,
                server_seed, server_seed_hash, client_seed, nonce, house_edge_bp)
             VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb, 0,
                     0, FALSE, 0, 'active', FALSE, 0,
                     $6, $7, $8, $9, $10)`,
            [
              roundId,
              wallet.toLowerCase(),
              bet,
              difficulty,
              JSON.stringify(code),
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              CIPHER_HOUSE_EDGE_BP,
            ],
          );
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_cipher_active_per_wallet|duplicate key/i.test(msg)) {
          return res.status(409).json({
            ok: false,
            error: 'You already have an active Cipher round — finish or cash it out first.',
          });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        bet,
        difficulty,
        codeLen: cfg.codeLen,
        symbols: cfg.symbols,
        maxGuesses: cfg.maxGuesses,
        crack: cfg.crack,
        secure: cfg.secure,
        crackNextX100: cipherCrackMultiplierX100(difficulty, 1),
        serverSeedHash,
        clientSeed,
        nonce,
        houseEdgeBp: CIPHER_HOUSE_EDGE_BP,
        chipBalance: chipBalance.toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-cipher] start failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not start the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/cipher/guess — submit a guess; return exact/partial pegs.
  // A full crack auto-settles as a win at the crack ladder for the guess used;
  // spending the last guess without cracking auto-settles as a bust. Neither the
  // code nor the seed is revealed except on settle.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/cipher/guess', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }
      const rawGuess = req.body?.guess;

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = {
            status: 409,
            body: { ok: false, error: 'Round already settled.', status: row.status },
          };
          return;
        }

        const difficulty = row.difficulty as CipherDifficulty;
        const cfg = CIPHER_DIFFICULTIES[difficulty];

        const guess = validateCipherGuess(rawGuess, difficulty);
        if (!guess) {
          response = {
            status: 400,
            body: {
              ok: false,
              error: `Guess must be ${cfg.codeLen} symbols, each 0–${cfg.symbols - 1}.`,
            },
          };
          return;
        }

        const code: number[] = Array.isArray(row.code) ? row.code : [];
        const prevGuesses: StoredGuess[] = Array.isArray(row.guesses) ? row.guesses : [];
        const guessCount = Number(row.guess_count);
        if (guessCount >= cfg.maxGuesses) {
          response = { status: 409, body: { ok: false, error: 'No guesses left.' } };
          return;
        }

        const fb: CipherFeedback = cipherFeedback(guess, code);
        const newGuessCount = guessCount + 1;
        const bestExact = Math.max(Number(row.best_exact), fb.exact);
        const guesses: StoredGuess[] = [
          ...prevGuesses,
          { guess, exact: fb.exact, partial: fb.partial },
        ];
        const cracked = fb.exact === cfg.codeLen;

        if (cracked) {
          // Settle as a win at the crack ladder for this guess.
          const multX100 = cipherCrackMultiplierX100(difficulty, newGuessCount);
          const payout = cipherPayout(Number(row.bet), multX100);
          await client.query(
            `UPDATE arcade_cipher_rounds
               SET guesses = $1::jsonb, guess_count = $2, best_exact = $3,
                   cracked = TRUE, multiplier_x100 = $4, status = 'settled',
                   won = TRUE, payout = $5, settled_at = NOW()
             WHERE id = $6`,
            [JSON.stringify(guesses), newGuessCount, bestExact, multX100, payout, roundId],
          );
          const newBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(payout),
            'arcade_cipher_payout',
            { type: 'arcade_cipher', id: roundId },
          );
          response = {
            status: 200,
            body: {
              ok: true,
              exact: fb.exact,
              partial: fb.partial,
              guessCount: newGuessCount,
              bestExact,
              cracked: true,
              settled: true,
              won: true,
              multiplierX100: multX100,
              payout,
              code,
              status: 'settled',
              serverSeed: row.server_seed,
              chipBalance: newBalance.toString(),
            },
          };
          return;
        }

        if (newGuessCount >= cfg.maxGuesses) {
          // Last guess spent without a crack and without banking → bust.
          await client.query(
            `UPDATE arcade_cipher_rounds
               SET guesses = $1::jsonb, guess_count = $2, best_exact = $3,
                   cracked = FALSE, multiplier_x100 = 0, status = 'settled',
                   won = FALSE, payout = 0, settled_at = NOW()
             WHERE id = $4`,
            [JSON.stringify(guesses), newGuessCount, bestExact, roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true,
              exact: fb.exact,
              partial: fb.partial,
              guessCount: newGuessCount,
              bestExact,
              cracked: false,
              settled: true,
              won: false,
              multiplierX100: 0,
              payout: 0,
              code,
              status: 'settled',
              serverSeed: row.server_seed,
            },
          };
          return;
        }

        // Active continues — persist the guess + progress. No code / seed leaks.
        await client.query(
          `UPDATE arcade_cipher_rounds
             SET guesses = $1::jsonb, guess_count = $2, best_exact = $3
           WHERE id = $4`,
          [JSON.stringify(guesses), newGuessCount, bestExact, roundId],
        );
        response = {
          status: 200,
          body: {
            ok: true,
            exact: fb.exact,
            partial: fb.partial,
            guessCount: newGuessCount,
            bestExact,
            cracked: false,
            settled: false,
            guessesRemaining: cfg.maxGuesses - newGuessCount,
            crackNextX100: cipherCrackMultiplierX100(difficulty, newGuessCount + 1),
            securedX100: cipherSecuredMultiplierX100(difficulty, bestExact),
            cashoutPayout: cipherPayout(
              Number(row.bet),
              cipherSecuredMultiplierX100(difficulty, bestExact),
            ),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not submit the guess.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-cipher] guess failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not submit the guess.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/arcade/cipher/cashout — bank the secured value (best exact pegs).
  // Must be called while status='active' AND with at least one exact peg landed.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/cipher/cashout', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const roundId = String(req.body?.roundId ?? '');
      if (!roundId) {
        return res.status(400).json({ ok: false, error: 'Invalid round.' });
      }

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = {
            status: 409,
            body: { ok: false, error: 'Round already settled.', status: row.status },
          };
          return;
        }

        const difficulty = row.difficulty as CipherDifficulty;
        const bestExact = Number(row.best_exact);
        const multX100 = cipherSecuredMultiplierX100(difficulty, bestExact);
        if (multX100 <= 0) {
          response = {
            status: 400,
            body: { ok: false, error: 'Land at least one exact peg before banking.' },
          };
          return;
        }

        const payout = cipherPayout(Number(row.bet), multX100);
        await client.query(
          `UPDATE arcade_cipher_rounds
             SET multiplier_x100 = $1, status = 'settled', won = TRUE,
                 payout = $2, settled_at = NOW()
           WHERE id = $3`,
          [multX100, payout, roundId],
        );
        const newBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(payout),
          'arcade_cipher_payout',
          { type: 'arcade_cipher', id: roundId },
        );

        const code: number[] = Array.isArray(row.code) ? row.code : [];
        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            bestExact,
            multiplierX100: multX100,
            payout,
            code,
            status: 'settled',
            won: true,
            serverSeed: row.server_seed,
            chipBalance: newBalance.toString(),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      logger.error('[arcade-cipher] cashout failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not cash out the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cipher/history — caller's settled rounds for the web panel.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) {
        return res.status(401).json({ ok: false, error: AUTH_ERROR });
      }
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT id, bet, difficulty, code, guesses, guess_count, best_exact, cracked,
                multiplier_x100, won, payout, created_at
           FROM arcade_cipher_rounds
          WHERE wallet_address = $1 AND status = 'settled'
          ORDER BY created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          bet: Number(row.bet),
          difficulty: row.difficulty,
          // Revealed code + full guess history so the client can re-render the
          // settled board (replay) without another round.
          code: Array.isArray(row.code) ? row.code : [],
          guesses: Array.isArray(row.guesses) ? row.guesses : [],
          guessCount: Number(row.guess_count),
          bestExact: Number(row.best_exact),
          cracked: !!row.cracked,
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-cipher] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cipher/recent — public. Latest settled rounds, all players.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, bet, difficulty, guess_count, best_exact,
                cracked, multiplier_x100, won, payout, created_at
           FROM arcade_cipher_rounds
          WHERE status = 'settled'
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
          difficulty: row.difficulty,
          guessCount: Number(row.guess_count),
          bestExact: Number(row.best_exact),
          cracked: !!row.cracked,
          multiplierX100: Number(row.multiplier_x100),
          won: !!row.won,
          payout: Number(row.payout),
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-cipher] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cipher/leaderboard — public. All-time top players by net.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(bet)::text AS wagered,
                SUM(payout)::text AS won,
                (SUM(payout) - SUM(bet))::text AS net
           FROM arcade_cipher_rounds
          WHERE status = 'settled'
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
      logger.error('[arcade-cipher] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/arcade/cipher/verify/:id — public, settled rounds ONLY. Returns the
  // seeds + the secret code + the guess history + the recipe so anyone can
  // independently re-derive the code (matching `serverSeedHash`), re-score every
  // guess, and reconcile the payout. An ACTIVE round 404s.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/cipher/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, bet, difficulty, code, guesses, guess_count, best_exact,
                cracked, multiplier_x100, status, won, payout, server_seed,
                server_seed_hash, client_seed, nonce, house_edge_bp,
                created_at, settled_at
           FROM arcade_cipher_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Round not found.' });
      }
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const difficulty = row.difficulty as CipherDifficulty;
      const cfg = CIPHER_DIFFICULTIES[difficulty];
      return res.json({
        ok: true,
        roundId: row.id,
        bet: Number(row.bet),
        difficulty,
        codeLen: cfg.codeLen,
        symbols: cfg.symbols,
        maxGuesses: cfg.maxGuesses,
        crack: cfg.crack,
        secure: cfg.secure,
        code: Array.isArray(row.code) ? row.code : [],
        guesses: Array.isArray(row.guesses) ? row.guesses : [],
        guessCount: Number(row.guess_count),
        bestExact: Number(row.best_exact),
        cracked: !!row.cracked,
        multiplierX100: Number(row.multiplier_x100),
        status: row.status,
        won: !!row.won,
        payout: Number(row.payout),
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        houseEdgeBp: Number(row.house_edge_bp),
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          `For peg P in [0..${cfg.codeLen - 1}]: ` +
          'bytes = hmacByteStream(serverSeed, clientSeed, nonce, P*4); ' +
          'r = bytesToFloat(bytes); ' +
          `symbol[P] = min(${cfg.symbols - 1}, floor(r * ${cfg.symbols})). ` +
          'Feedback per guess: exact = positions matching the code; partial = ' +
          'sum over colours of min(remaining-in-code, remaining-in-guess) after ' +
          'removing exacts. Crack pays crack[guessCount]; a bank pays ' +
          'secure[bestExact]. Payout = floor(bet * multiplierX100 / 100).',
      });
    } catch (err) {
      logger.error('[arcade-cipher] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-cipher] routes registered');
}
