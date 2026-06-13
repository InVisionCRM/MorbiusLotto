/**
 * arcade-craps.routes.ts — MORBIUS Arcade: Craps (provably-fair, multi-roll).
 *
 * Bankroll is the player's poker_chips balance. Every bet debits chips,
 * every clear refunds chips, every win credits chips — all via
 * applyPokerChipDelta inside dbService.withTransaction so a roll can never
 * be observed half-settled.
 *
 * Endpoints:
 *   POST /api/arcade/craps/session              — create a new shooter session (wallet required)
 *   GET  /api/arcade/craps/session/:id          — full state snapshot + chip balance
 *   POST /api/arcade/craps/session/:id/bet      — debit chips, add to a zone
 *   POST /api/arcade/craps/session/:id/clear    — pick up clearable bets, refund chips
 *   POST /api/arcade/craps/session/:id/roll     — throw the dice, settle wins/losses
 *   POST /api/arcade/craps/session/:id/rotate   — reveal old seed, commit new
 *   POST /api/arcade/craps/session/:id/close    — reveal seed, end session
 *   GET  /api/arcade/craps/verify/:id           — public: seed reveal + recipe
 *   GET  /api/arcade/craps/history              — caller's recent rolls (wallet required)
 *   GET  /api/arcade/craps/recent               — public: latest rolls across players
 *   GET  /api/arcade/craps/leaderboard          — public: top players by net P&L
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta, getPokerChipBalance } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  type CrapsBetType,
  type CrapsBets,
  type CrapsPhase,
  rollDiceFromSeeds,
  evaluateRoll,
  canPlaceBet,
  canClearBet,
  isValidBetType,
} from '../services/arcade-craps';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeCrapsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();
const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

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
 * Load the active server seed for a session from the pending-seeds table.
 * Throws if missing (the session has been rotated or closed → no live seed).
 */
async function loadPendingSeed(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ server_seed: string }> }> },
  sessionId: string,
): Promise<string> {
  const r = await client.query(
    'SELECT server_seed FROM arcade_craps_session_pending_seeds WHERE session_id = $1',
    [sessionId],
  );
  if (r.rows.length === 0) throw new Error('Session has no live seed (rotated or closed).');
  return String(r.rows[0].server_seed);
}

export function registerArcadeCrapsRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeCrapsRoutesOptions): void {
  const pool = dbService.getPool();

  /**
   * Wallet resolver — Telegram initData OR SIWE cookie. Mirrors arcade-dice
   * so a user can play craps on web (cookie) or Mini App (Telegram) without
   * differences in the API.
   */
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  /** Owner check — every session-mutating endpoint must run against the
   *  same wallet that created the session. Returns the lowercase wallet on
   *  success; sends 401/403/404 and returns null on failure. */
  async function requireSessionOwner(
    req: Request,
    res: Response,
    sessionId: string,
  ): Promise<string | null> {
    const wallet = await resolveWallet(req);
    if (!wallet) {
      res.status(401).json({ ok: false, error: AUTH_ERROR });
      return null;
    }
    const r = await pool.query<{ wallet_address: string }>(
      'SELECT wallet_address FROM arcade_craps_sessions WHERE id = $1',
      [sessionId],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ ok: false, error: 'Session not found.' });
      return null;
    }
    if (String(r.rows[0].wallet_address).toLowerCase() !== wallet.toLowerCase()) {
      res.status(403).json({ ok: false, error: 'Not your session.' });
      return null;
    }
    return wallet.toLowerCase();
  }

  // ─── POST /api/arcade/craps/session — create ────────────────────────────
  app.post('/api/arcade/craps/session', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const sessionId = crypto.randomUUID();
      let chipBalance = 0n;

      await dbService.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO arcade_craps_sessions
             (id, wallet_address, server_seed_hash, client_seed, phase, status)
           VALUES ($1, $2, $3, $4, 'COME_OUT', 'active')`,
          [sessionId, wallet.toLowerCase(), serverSeedHash, clientSeed],
        );
        await client.query(
          'INSERT INTO arcade_craps_session_pending_seeds (session_id, server_seed) VALUES ($1, $2)',
          [sessionId, serverSeed],
        );
        chipBalance = await getPokerChipBalance(client, wallet);
      });

      return res.json({
        ok: true,
        sessionId,
        serverSeedHash,
        clientSeed,
        chipBalance: chipBalance.toString(),
        phase: 'COME_OUT' as CrapsPhase,
        point: null,
        bets: {},
        nonce: 0,
        rollHistory: [],
      });
    } catch (err) {
      logger.error('[arcade-craps] create session failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not start a session.' });
    }
  });

  // ─── GET /api/arcade/craps/session/:id — snapshot ───────────────────────
  app.get('/api/arcade/craps/session/:id', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const sess = await pool.query(
        `SELECT id, server_seed_hash, server_seed_revealed, client_seed,
                nonce_counter, phase, point, bets, status
           FROM arcade_craps_sessions WHERE id = $1`,
        [sId],
      );
      const s = sess.rows[0];

      const rolls = await pool.query<{ sum: number }>(
        `SELECT sum FROM arcade_craps_rolls
          WHERE session_id = $1 ORDER BY nonce DESC LIMIT 10`,
        [sId],
      );

      const chipBalance = await getPokerChipBalance(pool, wallet);

      return res.json({
        ok: true,
        sessionId: s.id,
        serverSeedHash: s.server_seed_hash,
        serverSeedRevealed: s.server_seed_revealed,
        clientSeed: s.client_seed,
        nonce: Number(s.nonce_counter),
        phase: s.phase,
        point: s.point === null ? null : Number(s.point),
        chipBalance: chipBalance.toString(),
        bets: s.bets as CrapsBets,
        status: s.status,
        rollHistory: rolls.rows.map((r: { sum: number }) => Number(r.sum)),
      });
    } catch (err) {
      logger.error('[arcade-craps] snapshot failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the session.' });
    }
  });

  // ─── POST /api/arcade/craps/session/:id/bet ─────────────────────────────
  app.post('/api/arcade/craps/session/:id/bet', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const type = req.body?.type as CrapsBetType;
      const amount = Math.floor(Number(req.body?.amount));
      if (!isValidBetType(type)) return res.status(400).json({ ok: false, error: 'Invalid bet type.' });
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, error: 'Amount must be positive.' });
      }

      const updated = await dbService.withTransaction(async (client) => {
        const r = await client.query(
          `SELECT phase, bets, status
             FROM arcade_craps_sessions WHERE id = $1 FOR UPDATE`,
          [sId],
        );
        if (r.rows.length === 0) throw new Error('NOT_FOUND');
        const row = r.rows[0];
        if (row.status !== 'active') throw new Error('CLOSED');
        const phase: CrapsPhase = row.phase;
        const bets: CrapsBets = row.bets as CrapsBets;

        if (!canPlaceBet(type, phase)) throw new Error('LOCKED');

        // Debit chips first — throws 'Insufficient poker chips' on overdraft.
        const chipBalance = await applyPokerChipDelta(
          client,
          wallet,
          BigInt(-amount),
          'arcade_craps_bet',
          { type: 'arcade_craps', id: sId },
        );

        const nextBets: CrapsBets = { ...bets, [type]: (bets[type] || 0) + amount };
        await client.query(
          'UPDATE arcade_craps_sessions SET bets = $1 WHERE id = $2',
          [JSON.stringify(nextBets), sId],
        );

        return { chipBalance: chipBalance.toString(), bets: nextBets, phase };
      });

      return res.json({ ok: true, ...updated });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return res.status(404).json({ ok: false, error: 'Session not found.' });
      if (msg === 'CLOSED') return res.status(400).json({ ok: false, error: 'Session is closed.' });
      if (msg === 'LOCKED') return res.status(400).json({ ok: false, error: 'This bet is locked while the point is on.' });
      if (/insufficient/i.test(msg)) return res.status(400).json({ ok: false, error: 'Not enough chips.' });
      logger.error('[arcade-craps] bet failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not place the bet.' });
    }
  });

  // ─── POST /api/arcade/craps/session/:id/clear ───────────────────────────
  app.post('/api/arcade/craps/session/:id/clear', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const updated = await dbService.withTransaction(async (client) => {
        const r = await client.query(
          `SELECT phase, bets, status
             FROM arcade_craps_sessions WHERE id = $1 FOR UPDATE`,
          [sId],
        );
        if (r.rows.length === 0) throw new Error('NOT_FOUND');
        const row = r.rows[0];
        if (row.status !== 'active') throw new Error('CLOSED');
        const phase: CrapsPhase = row.phase;
        const bets: CrapsBets = row.bets as CrapsBets;

        let refund = 0;
        const nextBets: CrapsBets = { ...bets };
        for (const [k, v] of Object.entries(bets)) {
          if (!canClearBet(k as CrapsBetType, phase)) continue;
          refund += Number(v);
          delete nextBets[k];
        }
        let chipBalance: bigint = 0n;
        if (refund > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(refund),
            'arcade_craps_refund',
            { type: 'arcade_craps', id: sId },
          );
        } else {
          chipBalance = await getPokerChipBalance(client, wallet);
        }
        await client.query(
          'UPDATE arcade_craps_sessions SET bets = $1 WHERE id = $2',
          [JSON.stringify(nextBets), sId],
        );
        return { chipBalance: chipBalance.toString(), bets: nextBets, refund };
      });
      return res.json({ ok: true, ...updated });
    } catch (err) {
      const msg = (err as Error)?.message;
      if (msg === 'NOT_FOUND') return res.status(404).json({ ok: false, error: 'Session not found.' });
      if (msg === 'CLOSED') return res.status(400).json({ ok: false, error: 'Session is closed.' });
      logger.error('[arcade-craps] clear failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not clear bets.' });
    }
  });

  // ─── POST /api/arcade/craps/session/:id/roll — provably-fair throw ──────
  app.post('/api/arcade/craps/session/:id/roll', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const out = await dbService.withTransaction(async (client) => {
        const r = await client.query(
          `SELECT client_seed, nonce_counter, phase, point, bets, status
             FROM arcade_craps_sessions WHERE id = $1 FOR UPDATE`,
          [sId],
        );
        if (r.rows.length === 0) throw new Error('NOT_FOUND');
        const row = r.rows[0];
        if (row.status !== 'active') throw new Error('CLOSED');

        const serverSeed = await loadPendingSeed(client, sId);
        const nonce = Number(row.nonce_counter);
        const [die1, die2] = rollDiceFromSeeds(pf, serverSeed, String(row.client_seed), nonce);

        const phase: CrapsPhase = row.phase;
        const point: number | null = row.point === null ? null : Number(row.point);
        const bets: CrapsBets = row.bets as CrapsBets;
        const outcome = evaluateRoll(die1, die2, phase, point, bets);

        // Credit winnings (if any). Losses already happened at bet placement;
        // place-bet stake remains on the felt unchanged.
        let chipBalance: bigint;
        if (outcome.wins > 0) {
          chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(outcome.wins),
            'arcade_craps_payout',
            { type: 'arcade_craps', id: sId },
          );
        } else {
          chipBalance = await getPokerChipBalance(client, wallet);
        }

        const rollId = crypto.randomUUID();
        await client.query(
          `INSERT INTO arcade_craps_rolls
             (id, session_id, nonce, die1, die2, sum,
              phase_before, phase_after, point_before, point_after,
              wins, losses, is_point, is_seven_out,
              bets_before, bets_after)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            rollId, sId, nonce,
            outcome.die1, outcome.die2, outcome.sum,
            outcome.phaseBefore, outcome.phaseAfter,
            outcome.pointBefore, outcome.pointAfter,
            outcome.wins, outcome.losses,
            outcome.isPoint, outcome.isSevenOut,
            JSON.stringify(outcome.betsBefore), JSON.stringify(outcome.betsAfter),
          ],
        );

        await client.query(
          `UPDATE arcade_craps_sessions
              SET nonce_counter = $1,
                  phase = $2,
                  point = $3,
                  bets = $4
            WHERE id = $5`,
          [
            nonce + 1,
            outcome.phaseAfter,
            outcome.pointAfter,
            JSON.stringify(outcome.betsAfter),
            sId,
          ],
        );

        const history: { rows: Array<{ sum: number }> } = await client.query(
          `SELECT sum FROM arcade_craps_rolls
            WHERE session_id = $1 ORDER BY nonce DESC LIMIT 10`,
          [sId],
        );

        return {
          rollId,
          nonce,
          die1: outcome.die1,
          die2: outcome.die2,
          sum: outcome.sum,
          phase: outcome.phaseAfter,
          point: outcome.pointAfter,
          chipBalance: chipBalance.toString(),
          bets: outcome.betsAfter,
          wins: outcome.wins,
          losses: outcome.losses,
          isPoint: outcome.isPoint,
          isSevenOut: outcome.isSevenOut,
          rollHistory: history.rows.map((h: { sum: number }) => Number(h.sum)),
        };
      });
      return res.json({ ok: true, ...out });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return res.status(404).json({ ok: false, error: 'Session not found.' });
      if (msg === 'CLOSED') return res.status(400).json({ ok: false, error: 'Session is closed.' });
      if (/no live seed/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Seed was rotated — start a new session.' });
      }
      logger.error('[arcade-craps] roll failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not roll the dice.' });
    }
  });

  // ─── POST /api/arcade/craps/session/:id/rotate ──────────────────────────
  app.post('/api/arcade/craps/session/:id/rotate', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const out = await dbService.withTransaction(async (client) => {
        const r = await client.query(
          'SELECT status FROM arcade_craps_sessions WHERE id = $1 FOR UPDATE',
          [sId],
        );
        if (r.rows.length === 0) throw new Error('NOT_FOUND');
        if (r.rows[0].status !== 'active') throw new Error('CLOSED');

        const oldServerSeed = await loadPendingSeed(client, sId);
        const newServerSeed = pf.generateServerSeed();
        const newHash = pf.createServerSeedHash(newServerSeed);

        await client.query(
          `UPDATE arcade_craps_sessions
              SET server_seed_revealed = $1,
                  server_seed_hash = $2,
                  nonce_counter = 0
            WHERE id = $3`,
          [oldServerSeed, newHash, sId],
        );
        await client.query(
          'UPDATE arcade_craps_session_pending_seeds SET server_seed = $1 WHERE session_id = $2',
          [newServerSeed, sId],
        );
        return { serverSeedRevealed: oldServerSeed, serverSeedHash: newHash, nonce: 0 };
      });
      return res.json({ ok: true, ...out });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return res.status(404).json({ ok: false, error: 'Session not found.' });
      if (msg === 'CLOSED') return res.status(400).json({ ok: false, error: 'Session is closed.' });
      logger.error('[arcade-craps] rotate failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not rotate seed.' });
    }
  });

  // ─── POST /api/arcade/craps/session/:id/close — reveal + end ────────────
  // Refunds any clearable bets so the player isn't stuck with chips on the
  // felt of a session that's closing.
  app.post('/api/arcade/craps/session/:id/close', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const wallet = await requireSessionOwner(req, res, sId);
      if (!wallet) return;

      const out = await dbService.withTransaction(async (client) => {
        const r = await client.query(
          'SELECT phase, bets, status FROM arcade_craps_sessions WHERE id = $1 FOR UPDATE',
          [sId],
        );
        if (r.rows.length === 0) throw new Error('NOT_FOUND');
        const row = r.rows[0];
        if (row.status !== 'active') throw new Error('ALREADY_CLOSED');

        // Refund any clearable open bets back to the chip wallet.
        const phase: CrapsPhase = row.phase;
        const bets: CrapsBets = row.bets as CrapsBets;
        let refund = 0;
        for (const [k, v] of Object.entries(bets)) {
          if (canClearBet(k as CrapsBetType, phase)) refund += Number(v);
        }
        let chipBalance: bigint;
        if (refund > 0) {
          chipBalance = await applyPokerChipDelta(
            client, wallet, BigInt(refund),
            'arcade_craps_refund', { type: 'arcade_craps', id: sId },
          );
        } else {
          chipBalance = await getPokerChipBalance(client, wallet);
        }

        const serverSeed = await loadPendingSeed(client, sId);
        await client.query(
          `UPDATE arcade_craps_sessions
              SET status = 'closed',
                  server_seed_revealed = $1,
                  closed_at = NOW(),
                  bets = '{}'::jsonb
            WHERE id = $2`,
          [serverSeed, sId],
        );
        await client.query(
          'DELETE FROM arcade_craps_session_pending_seeds WHERE session_id = $1',
          [sId],
        );
        return { serverSeedRevealed: serverSeed, refund, chipBalance: chipBalance.toString() };
      });
      return res.json({ ok: true, ...out });
    } catch (err) {
      const msg = (err as Error)?.message;
      if (msg === 'NOT_FOUND') return res.status(404).json({ ok: false, error: 'Session not found.' });
      if (msg === 'ALREADY_CLOSED') return res.status(400).json({ ok: false, error: 'Already closed.' });
      logger.error('[arcade-craps] close failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not close the session.' });
    }
  });

  // ─── GET /api/arcade/craps/verify/:id — public verifier ─────────────────
  // Server re-derives every roll from the published seeds (only when the seed
  // has been revealed) and ships the verification result. Mirrors Plinko's
  // verifier so the client can render ✓/✗ marks without duplicating PF code.
  app.get('/api/arcade/craps/verify/:id', async (req: Request, res: Response) => {
    try {
      const sId = req.params.id;
      const sess = await pool.query(
        `SELECT id, server_seed_hash, server_seed_revealed, client_seed,
                nonce_counter, status
           FROM arcade_craps_sessions WHERE id = $1`,
        [sId],
      );
      if (sess.rows.length === 0) return res.status(404).json({ ok: false, error: 'Session not found.' });
      const s = sess.rows[0];

      interface VerifyRollRow { nonce: number; die1: number; die2: number; sum: number; created_at: Date }
      const rolls = await pool.query<VerifyRollRow>(
        `SELECT nonce, die1, die2, sum, created_at
           FROM arcade_craps_rolls
          WHERE session_id = $1 ORDER BY nonce ASC`,
        [sId],
      );

      const persistedRolls = rolls.rows.map((r: VerifyRollRow) => ({
        nonce: Number(r.nonce),
        die1: Number(r.die1),
        die2: Number(r.die2),
        sum: Number(r.sum),
        createdAt: r.created_at,
      }));

      // Re-derive every roll iff the serverSeed has been revealed. If it's
      // still hidden (active session), we can only confirm the commitment
      // shape; the player must rotate or close to unlock full verification.
      const revealed: string | null = s.server_seed_revealed;
      let verification: {
        hashMatches: boolean;
        rollsMatch: boolean;
        seedRevealed: boolean;
        recomputedRolls: Array<{ nonce: number; die1: number; die2: number; sum: number }>;
      } = {
        hashMatches: false,
        rollsMatch: false,
        seedRevealed: false,
        recomputedRolls: [],
      };

      if (revealed) {
        const recomputedHash = pf.createServerSeedHash(revealed);
        const hashMatches = recomputedHash === String(s.server_seed_hash);
        const recomputed: Array<{ nonce: number; die1: number; die2: number; sum: number }> = [];
        let rollsMatch = true;
        for (const r of persistedRolls) {
          const [d1, d2] = rollDiceFromSeeds(pf, revealed, String(s.client_seed), r.nonce);
          recomputed.push({ nonce: r.nonce, die1: d1, die2: d2, sum: d1 + d2 });
          if (d1 !== r.die1 || d2 !== r.die2) rollsMatch = false;
        }
        verification = { hashMatches, rollsMatch, seedRevealed: true, recomputedRolls: recomputed };
      }

      return res.json({
        ok: true,
        sessionId: s.id,
        status: s.status,
        serverSeedHash: s.server_seed_hash,
        serverSeedRevealed: revealed,
        clientSeed: s.client_seed,
        nonceCounter: Number(s.nonce_counter),
        rolls: persistedRolls,
        verification,
        recipe:
          'For each roll: die1 = floor(bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)) * 6) + 1; ' +
          'die2 = floor(bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 4)) * 6) + 1. ' +
          'Verify the commitment by re-hashing the revealed serverSeed with SHA-256.',
      });
    } catch (err) {
      logger.error('[arcade-craps] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the verification record.' });
    }
  });

  // ─── GET /api/arcade/craps/history — caller's recent rolls ──────────────
  app.get('/api/arcade/craps/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      interface HistoryRow {
        id: string;
        session_id: string;
        nonce: number;
        die1: number;
        die2: number;
        sum: number;
        phase_before: string;
        phase_after: string;
        point_before: number | null;
        point_after: number | null;
        wins: string;
        losses: string;
        is_point: boolean;
        is_seven_out: boolean;
        created_at: Date;
      }
      const r = await pool.query<HistoryRow>(
        `SELECT r.id, r.session_id, r.nonce, r.die1, r.die2, r.sum,
                r.phase_before, r.phase_after, r.point_before, r.point_after,
                r.wins::text, r.losses::text, r.is_point, r.is_seven_out, r.created_at
           FROM arcade_craps_rolls r
           JOIN arcade_craps_sessions s ON s.id = r.session_id
          WHERE s.wallet_address = $1
          ORDER BY r.created_at DESC
          LIMIT $2`,
        [wallet.toLowerCase(), limit],
      );
      return res.json({
        ok: true,
        rolls: r.rows.map((row) => ({
          rollId: row.id,
          sessionId: row.session_id,
          nonce: Number(row.nonce),
          die1: Number(row.die1),
          die2: Number(row.die2),
          sum: Number(row.sum),
          phaseBefore: row.phase_before,
          phaseAfter: row.phase_after,
          pointBefore: row.point_before === null ? null : Number(row.point_before),
          pointAfter: row.point_after === null ? null : Number(row.point_after),
          wins: row.wins,
          losses: row.losses,
          isPoint: row.is_point,
          isSevenOut: row.is_seven_out,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-craps] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // ─── GET /api/arcade/craps/recent — public feed across all players ──────
  app.get('/api/arcade/craps/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      interface RecentRow {
        id: string;
        wallet_address: string;
        sum: number;
        die1: number;
        die2: number;
        wins: string;
        losses: string;
        created_at: Date;
      }
      const r = await pool.query<RecentRow>(
        `SELECT r.id, s.wallet_address, r.sum, r.die1, r.die2,
                r.wins::text, r.losses::text, r.created_at
           FROM arcade_craps_rolls r
           JOIN arcade_craps_sessions s ON s.id = r.session_id
          ORDER BY r.created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rolls: r.rows.map((row) => ({
          rollId: row.id,
          wallet: row.wallet_address,
          die1: Number(row.die1),
          die2: Number(row.die2),
          sum: Number(row.sum),
          wins: row.wins,
          losses: row.losses,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-craps] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // ─── GET /api/arcade/craps/leaderboard — public ─────────────────────────
  app.get('/api/arcade/craps/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    try {
      const r = await pool.query(
        `SELECT s.wallet_address,
                COUNT(r.*)::int AS rolls,
                SUM(r.wins)::text AS won,
                SUM(r.losses)::text AS lost,
                (SUM(r.wins) - SUM(r.losses))::text AS net
           FROM arcade_craps_rolls r
           JOIN arcade_craps_sessions s ON s.id = r.session_id
          GROUP BY s.wallet_address
          ORDER BY SUM(r.wins) - SUM(r.losses) DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        players: r.rows.map((row: { wallet_address: string; rolls: number; won: string | null; lost: string | null; net: string | null }) => ({
          wallet: row.wallet_address,
          rolls: Number(row.rolls),
          won: String(row.won ?? '0'),
          lost: String(row.lost ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-craps] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  logger.info('[arcade-craps] routes registered');
}
