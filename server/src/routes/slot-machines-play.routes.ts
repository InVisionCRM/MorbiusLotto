/**
 * slot-machines-play.routes.ts — server-authoritative play for community slot
 * machines. Two session modes per (machine, player):
 *
 *   play credits (Phase 1) — free, auto-refilling, no chain involvement
 *   real money  (Phase 3)  — token-denominated: deposits convert base units →
 *                            credits at the machine's fixed credit_value,
 *                            spins settle player ↔ bankroll symmetrically,
 *                            cashouts pay out of the machine's escrow pool
 *
 *   GET  /api/slot-machines/:slug/session          — auth: balance, bet steps, solvency (?mode=real)
 *   POST /api/slot-machines/:slug/spin             — auth: debit, roll, settle in one txn ({real:true})
 *   POST /api/slot-machines/:slug/session/reset    — auth: refill PLAY credits when broke (never real)
 *   POST /api/slot-machines/:slug/session/deposit  — auth: claim a verified escrow deposit into the real session
 *   POST /api/slot-machines/:slug/session/cashout  — auth: escrow payout of real-session credits
 *   GET  /api/slot-machines/spins/:id/verify       — public: provably-fair recipe
 *
 * The roll uses the wallet's shared arcade seed pair (arcade_seed_pairs) — the
 * same commitment that covers Dice/Limbo/etc. — consumed at a sequential nonce
 * inside the same transaction as the debit, exactly like arcade-limbo.routes.ts.
 * The spin itself runs in lib/community-slot-spin.ts through the vendored
 * cabinet-math, so what the server pays is what the builder's math says.
 *
 * Real-money solvency (lib/community-slot-real.ts): every real spin locks the
 * machine row, prices the effective max bet off the live bankroll, and rejects
 * or pauses BEFORE money moves. Bets flow into the bankroll, payouts flow out
 * of it, atomically with the session update — the pool stays partitioned into
 * "house money" (bankroll) and "player money" (session balances) at all times.
 *
 * Cashouts work even on disabled machines: player funds are always exitable.
 *
 * Play is allowed on published machines for everyone, and on the owner's own
 * drafts (so a creator can test-drive before publishing).
 */

import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import type { DatabaseService, CommunitySlotMachine } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { consumeSeedForBet, revealedSeedForRound } from '../services/arcade-seed.service';
import { executeSpin, betStepsFor, startingBalanceFor } from '../lib/community-slot-spin';
import {
  baseUnitsToCredits, creditsToBaseUnits, effectiveMaxBetCredits,
} from '../lib/community-slot-real';
import { realSlotBankrollChain, type SlotBankrollChain } from '../lib/community-slot-bankroll';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterSlotMachinePlayRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
  /** Injectable for tests; defaults to the real PulseChain implementation. */
  chain?: SlotBankrollChain;
}

interface SessionRow {
  id: string;
  balance: number;
  feature_state: Record<string, unknown>;
}

interface MachineMoneyRow {
  bankroll: bigint;
  credit_value: bigint | null;
  token_symbol: string | null;
}

export function registerSlotMachinePlayRoutes({ app, dbService, authService, chain = realSlotBankrollChain }: RegisterSlotMachinePlayRoutesOptions): void {
  const pool = dbService.getPool();

  const spinLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 90,
    message: 'Too many spins from this IP, slow down.',
    validate: { xForwardedForHeader: false },
  });
  const sessionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: 'Too many requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  /** Published for everyone; drafts playable by their owner only. */
  async function playableMachine(slug: string, wallet: string): Promise<CommunitySlotMachine | null> {
    const m = await dbService.getSlotMachineBySlug(slug);
    if (!m) return null;
    if (m.status === 'published') return m;
    if (m.status === 'draft' && m.owner_address.toLowerCase() === wallet.toLowerCase()) return m;
    return null;
  }

  /** Lock (or lazily create) the caller's session row inside an open transaction.
   *  Play-credit sessions start funded; real sessions start at ZERO — real
   *  balance only ever enters through a verified on-chain deposit. */
  async function lockSession(client: PoolClient, machine: CommunitySlotMachine, wallet: string, real: boolean): Promise<SessionRow> {
    const w = wallet.toLowerCase();
    await client.query(
      `INSERT INTO community_slot_sessions (machine_id, player_address, balance, real)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (machine_id, player_address, real) DO NOTHING`,
      [machine.id, w, real ? 0 : startingBalanceFor(machine.machine_def), real],
    );
    const r = await client.query(
      `SELECT id, balance, feature_state FROM community_slot_sessions
       WHERE machine_id = $1 AND player_address = $2 AND real = $3
       FOR UPDATE`,
      [machine.id, w, real],
    );
    const row = r.rows[0];
    return {
      id: String(row.id),
      balance: Number(row.balance),
      feature_state: (row.feature_state ?? {}) as Record<string, unknown>,
    };
  }

  /** Lock the machine's money row (bankroll/credit_value). Call BEFORE
   *  lockSession — every real-money path takes locks in this order, so two
   *  concurrent operations can never deadlock across the pair. */
  async function lockMachineMoney(client: PoolClient, machineId: string): Promise<MachineMoneyRow> {
    const r = await client.query(
      `SELECT bankroll, credit_value, token_symbol FROM community_slot_machines WHERE id = $1 FOR UPDATE`,
      [machineId],
    );
    const row = r.rows[0];
    return {
      bankroll: BigInt(String(row.bankroll ?? '0')),
      credit_value: row.credit_value != null ? BigInt(String(row.credit_value)) : null,
      token_symbol: row.token_symbol ?? null,
    };
  }

  /** Non-locking read of the machine's money fields. */
  async function readMachineMoney(machineId: string): Promise<MachineMoneyRow & { token_address: string | null }> {
    const r = await pool.query(
      `SELECT bankroll, credit_value, token_symbol, token_address FROM community_slot_machines WHERE id = $1`,
      [machineId],
    );
    const row = r.rows[0];
    return {
      bankroll: BigInt(String(row.bankroll ?? '0')),
      credit_value: row.credit_value != null ? BigInt(String(row.credit_value)) : null,
      token_symbol: row.token_symbol ?? null,
      token_address: row.token_address ?? null,
    };
  }

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/:slug/session — bootstrap for server play.
  // ---------------------------------------------------------------------
  app.get(
    '/api/slot-machines/:slug/session',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const real = String(req.query.mode ?? '') === 'real';
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });

        const { minBet, steps } = betStepsFor(machine.machine_def);
        if (!real) {
          const session = await dbService.withTransaction((client) => lockSession(client, machine, wallet, false));
          return sendJson(res, {
            ok: true,
            mode: 'credits',
            balance: session.balance,
            minBet,
            betSteps: steps,
            winCapX: machine.win_cap_x,
            currency: 'CREDITS',
            machine: { name: machine.name, status: machine.status, defVersion: machine.def_version },
          });
        }

        const money = await readMachineMoney(machine.id);
        if (!money.token_address || !money.credit_value) {
          return res.status(409).json({ ok: false, error: 'This machine has no betting token configured — real-money play is not available.' });
        }
        const session = await dbService.withTransaction((client) => lockSession(client, machine, wallet, true));
        const effMax = effectiveMaxBetCredits({
          bankrollBaseUnits: money.bankroll,
          creditValue: money.credit_value,
          winCapX: machine.win_cap_x,
          ladderMaxBet: steps[steps.length - 1],
        });
        return sendJson(res, {
          ok: true,
          mode: 'real',
          balance: session.balance,
          minBet,
          betSteps: steps,
          effectiveMaxBet: effMax,
          paused: effMax < minBet,
          winCapX: machine.win_cap_x,
          currency: money.token_symbol || 'TOKENS',
          creditValue: money.credit_value.toString(),
          machine: { name: machine.name, status: machine.status, defVersion: machine.def_version },
        });
      } catch (error) {
        logger.error('[SlotPlay] session failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/spin — the round: debit, roll, settle.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/spin',
    spinLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });

        const { minBet, steps } = betStepsFor(machine.machine_def);
        const maxBet = steps[steps.length - 1];
        const bet = Math.floor(Number(req.body?.bet));
        if (!Number.isFinite(bet) || bet < minBet || bet > maxBet) {
          return res.status(400).json({ ok: false, error: `Bet must be between ${minBet} and ${maxBet} credits.` });
        }

        const isReal = req.body?.real === true;
        const spinId = crypto.randomUUID();
        const outcome = await dbService.withTransaction(async (client) => {
          // Real money: price the bet against the LIVE bankroll first — the
          // machine lock also serializes concurrent real spins on this machine
          // so the bankroll can never be over-committed between checks.
          let money: MachineMoneyRow | null = null;
          if (isReal) {
            money = await lockMachineMoney(client, machine.id);
            if (!money.credit_value) {
              const err = new Error('NO_TOKEN'); (err as any).code = 'NO_TOKEN'; throw err;
            }
            const effMax = effectiveMaxBetCredits({
              bankrollBaseUnits: money.bankroll,
              creditValue: money.credit_value,
              winCapX: machine.win_cap_x,
              ladderMaxBet: maxBet,
            });
            if (effMax < minBet) {
              const err = new Error('MACHINE_PAUSED'); (err as any).code = 'MACHINE_PAUSED'; throw err;
            }
            if (bet > effMax) {
              const err = new Error('BET_OVER_SOLVENCY'); (err as any).code = 'BET_OVER_SOLVENCY'; (err as any).effMax = effMax; throw err;
            }
          }

          const session = await lockSession(client, machine, wallet, isReal);
          if (session.balance < bet) {
            const err = new Error('INSUFFICIENT_BALANCE');
            (err as any).code = 'INSUFFICIENT_BALANCE';
            throw err;
          }

          // Seed consumption shares the transaction with the debit, so the
          // nonce advances iff the bet is actually recorded.
          const seed = await consumeSeedForBet(client, wallet);

          // Snapshot the pre-spin feature state for the verify recipe —
          // executeSpin mutates both the def clone and the feature state.
          const featureStateBefore = JSON.stringify(session.feature_state);
          const def = JSON.parse(JSON.stringify(machine.machine_def));
          const exec = executeSpin(def, bet, machine.win_cap_x, seed, session.feature_state);

          const newBalance = session.balance - bet + exec.payout;
          await client.query(
            `UPDATE community_slot_sessions
             SET balance = $2, feature_state = $3::jsonb, updated_at = NOW()
             WHERE id = $1`,
            [session.id, newBalance, JSON.stringify(session.feature_state)],
          );

          // Real money: the bankroll takes the bet and pays the win — the
          // mirror image of the session update, in the same transaction.
          if (isReal && money?.credit_value) {
            const deltaBase = creditsToBaseUnits(BigInt(bet - exec.payout), money.credit_value);
            const upd = await client.query(
              `UPDATE community_slot_machines
               SET bankroll = bankroll + $2::numeric, updated_at = NOW()
               WHERE id = $1
               RETURNING bankroll`,
              [machine.id, deltaBase.toString()],
            );
            // Unreachable by construction (payout ≤ bet×winCap ≤ bankroll/SAFETY),
            // but money code gets belt AND suspenders: roll back rather than
            // ever recording a negative bankroll.
            if (BigInt(String(upd.rows[0].bankroll)) < 0n) {
              throw new Error('bankroll would go negative — settlement aborted');
            }
          }

          await client.query(
            `INSERT INTO community_slot_spins
               (id, machine_id, session_id, player_address, bet, payout, base_payout,
                bonus_kind, bonus_payout, scatter, chain, slam,
                seed_pair_id, server_seed_hash, client_seed, nonce, draws, def_version,
                feature_state_before)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
            [spinId, machine.id, session.id, wallet.toLowerCase(), bet, exec.payout, exec.basePayout,
              exec.bonus ? exec.bonus.kind : null, exec.bonusPayout,
              exec.res.scatter, exec.res.chain, exec.res.slam,
              seed.seedPairId, seed.serverSeedHash, seed.clientSeed, seed.nonce, exec.draws,
              machine.def_version, featureStateBefore],
          );

          // Post-settle solvency readout so the client can re-clamp its ladder.
          let effectiveMaxBet: number | null = null;
          if (isReal && money?.credit_value) {
            const after = await client.query(`SELECT bankroll FROM community_slot_machines WHERE id = $1`, [machine.id]);
            effectiveMaxBet = effectiveMaxBetCredits({
              bankrollBaseUnits: BigInt(String(after.rows[0].bankroll)),
              creditValue: money.credit_value,
              winCapX: machine.win_cap_x,
              ladderMaxBet: maxBet,
            });
          }

          return { exec, seed, newBalance, effectiveMaxBet };
        });

        return sendJson(res, {
          ok: true,
          spinId,
          mode: isReal ? 'real' : 'credits',
          res: outcome.exec.res,
          basePayout: outcome.exec.basePayout,
          bonus: outcome.exec.bonus,
          payout: outcome.exec.payout,
          capped: outcome.exec.capped,
          balance: outcome.newBalance,
          effectiveMaxBet: outcome.effectiveMaxBet,
          seed: {
            serverSeedHash: outcome.seed.serverSeedHash,
            clientSeed: outcome.seed.clientSeed,
            nonce: outcome.seed.nonce,
          },
        });
      } catch (err) {
        const code = (err as any)?.code;
        if (code === 'INSUFFICIENT_BALANCE') {
          return res.status(400).json({ ok: false, code, error: 'Not enough credits for that bet.' });
        }
        if (code === 'NO_TOKEN') {
          return res.status(409).json({ ok: false, code, error: 'This machine has no betting token configured.' });
        }
        if (code === 'MACHINE_PAUSED') {
          return res.status(409).json({ ok: false, code, error: 'Machine paused — the bankroll cannot safely cover the minimum bet. The creator needs to top it up.' });
        }
        if (code === 'BET_OVER_SOLVENCY') {
          return res.status(400).json({ ok: false, code, effectiveMaxBet: (err as any).effMax, error: 'Bet exceeds what the bankroll can safely cover right now.' });
        }
        logger.error('[SlotPlay] spin failed', { error: (err as Error)?.message });
        return res.status(500).json({ ok: false, error: 'Could not play the spin.' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/session/reset — refill when broke.
  // Play credits only; Phase 3 replaces this with real deposits.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/session/reset',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
        const { minBet } = betStepsFor(machine.machine_def);
        const refill = startingBalanceFor(machine.machine_def);

        const balance = await dbService.withTransaction(async (client) => {
          // Play-credit sessions only — a real session refills through
          // verified deposits, never for free.
          const session = await lockSession(client, machine, wallet, false);
          if (session.balance >= minBet) return session.balance; // not broke — no refill
          await client.query(
            `UPDATE community_slot_sessions SET balance = $2, updated_at = NOW() WHERE id = $1`,
            [session.id, refill],
          );
          return refill;
        });
        return sendJson(res, { ok: true, balance });
      } catch (error) {
        logger.error('[SlotPlay] reset failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/session/deposit { txHash }
  // Claim a verified fundBankroll deposit into the caller's REAL session.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/session/deposit',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await playableMachine(req.params.slug, wallet);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
        const money = await readMachineMoney(machine.id);
        if (!money.token_address || !money.credit_value) {
          return res.status(409).json({ ok: false, error: 'This machine has no betting token configured.' });
        }
        const txHash = String(req.body?.txHash ?? '').trim().toLowerCase();

        // On-chain verification BEFORE touching the DB — sender must be the caller.
        const v = await chain.verifyBankrollDeposit({
          machineId: machine.id, txHash, contributor: wallet, tokenAddress: money.token_address,
        });
        if (!v.ok || !v.amount) {
          return res.status(422).json({ ok: false, error: v.error ?? 'Deposit could not be verified' });
        }
        const credits = baseUnitsToCredits(v.amount, money.credit_value);
        if (credits <= 0n) {
          return res.status(422).json({ ok: false, error: 'Deposit is smaller than one credit for this machine.' });
        }

        const result = await dbService.withTransaction(async (client) => {
          // One tx credits exactly once — across BOTH ledgers. A creator's
          // bankroll deposit and a player deposit share the same on-chain
          // shape, so the same hash must never be claimable in each.
          const dup = await client.query(
            `SELECT 1 FROM community_slot_bankroll_events WHERE tx_hash = $1 AND kind = 'deposit'
             UNION ALL
             SELECT 1 FROM community_slot_player_events WHERE tx_hash = $1 AND kind = 'deposit'
             LIMIT 1`,
            [txHash],
          );
          if (dup.rows.length > 0) return null;

          const session = await lockSession(client, machine, wallet, true);
          await client.query(
            `INSERT INTO community_slot_player_events (machine_id, session_id, player_address, kind, base_units, credits, tx_hash)
             VALUES ($1, $2, $3, 'deposit', $4, $5, $6)`,
            [machine.id, session.id, wallet.toLowerCase(), v.amount!.toString(), credits.toString(), txHash],
          );
          const upd = await client.query(
            `UPDATE community_slot_sessions SET balance = balance + $2::numeric, updated_at = NOW()
             WHERE id = $1 RETURNING balance`,
            [session.id, credits.toString()],
          );
          if (v.feeDetected) {
            await client.query(
              `UPDATE community_slot_machines SET token_fee_warning = TRUE, updated_at = NOW() WHERE id = $1`,
              [machine.id],
            );
          }
          return { balance: Number(upd.rows[0].balance) };
        });
        if (!result) return res.status(409).json({ ok: false, error: 'This deposit transaction was already credited.' });

        return sendJson(res, {
          ok: true,
          credited: credits.toString(),
          balance: result.balance,
          currency: money.token_symbol || 'TOKENS',
          feeDetectedOnThisDeposit: !!v.feeDetected,
        });
      } catch (error) {
        logger.error('[SlotPlay] deposit failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/session/cashout { credits? }
  // Escrow payout of real-session credits (default: everything). Works on
  // ANY machine status — a player's funds must always be exitable, even
  // from a disabled machine.
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/session/cashout',
    sessionLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await dbService.getSlotMachineBySlug(req.params.slug);
        if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
        const money = await readMachineMoney(machine.id);
        if (!money.credit_value) {
          return res.status(409).json({ ok: false, error: 'This machine has no betting token configured.' });
        }
        const creditValue = money.credit_value;

        // 1. Debit the session first (locked), recording the pending cashout.
        const debit = await dbService.withTransaction(async (client) => {
          const session = await lockSession(client, machine, wallet, true);
          const balance = BigInt(session.balance);
          let credits: bigint;
          if (req.body?.credits == null) {
            credits = balance;
          } else {
            const n = Math.floor(Number(req.body.credits));
            if (!Number.isFinite(n) || n <= 0) return { err: 'credits must be a positive integer' };
            credits = BigInt(n);
          }
          if (credits <= 0n) return { err: 'Nothing to cash out.' };
          if (credits > balance) return { err: 'Cashout exceeds your session balance.' };
          const baseUnits = creditsToBaseUnits(credits, creditValue);
          await client.query(
            `UPDATE community_slot_sessions SET balance = balance - $2::numeric, updated_at = NOW() WHERE id = $1`,
            [session.id, credits.toString()],
          );
          const ev = await client.query(
            `INSERT INTO community_slot_player_events (machine_id, session_id, player_address, kind, base_units, credits)
             VALUES ($1, $2, $3, 'cashout', $4, $5)
             RETURNING id`,
            [machine.id, session.id, wallet.toLowerCase(), baseUnits.toString(), credits.toString()],
          );
          return { eventId: String(ev.rows[0].id), sessionId: session.id, credits, baseUnits };
        });
        if ('err' in debit) return res.status(400).json({ ok: false, error: debit.err });

        // 2. Send the escrow payout; refund the session on failure — the
        //    failure mode is an understated balance, never a double payout.
        const sent = await chain.sendBankrollWithdrawal(machine.id, wallet, debit.baseUnits);
        if (!sent.success) {
          await dbService.withTransaction(async (client) => {
            await client.query(
              `UPDATE community_slot_sessions SET balance = balance + $2::numeric, updated_at = NOW() WHERE id = $1`,
              [debit.sessionId, debit.credits.toString()],
            );
            await client.query(`DELETE FROM community_slot_player_events WHERE id = $1`, [debit.eventId]);
          }).catch((refundErr) => {
            logger.error('[SlotPlay] cashout refund failed — session understated', {
              machineId: machine.id, eventId: debit.eventId, credits: debit.credits.toString(), refundErr: String(refundErr),
            });
          });
          return res.status(502).json({ ok: false, error: sent.error ?? 'Escrow payout failed — nothing was cashed out.' });
        }
        if (sent.txHash) {
          await pool.query(
            `UPDATE community_slot_player_events SET tx_hash = $2 WHERE id = $1`,
            [debit.eventId, sent.txHash.toLowerCase()],
          ).catch(() => { /* best-effort backfill; the payout already happened */ });
        }
        const after = await pool.query(`SELECT balance FROM community_slot_sessions WHERE id = $1`, [debit.sessionId]);
        return sendJson(res, {
          ok: true,
          cashedOut: debit.credits.toString(),
          baseUnits: debit.baseUnits.toString(),
          txHash: sent.txHash ?? null,
          balance: Number(after.rows[0].balance),
        });
      } catch (error) {
        logger.error('[SlotPlay] cashout failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/spins/:id/verify — public provably-fair recipe.
  // ---------------------------------------------------------------------
  app.get('/api/slot-machines/spins/:id/verify', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT s.*, d.machine_def
           FROM community_slot_spins s
           JOIN community_slot_machine_defs d
             ON d.machine_id = s.machine_id AND d.version = s.def_version
          WHERE s.id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Spin not found.' });
      const row = r.rows[0];
      const reveal = await revealedSeedForRound(pool, row.seed_pair_id ?? null, null);

      // The def drives the math; symbol art is presentation and can be huge
      // (inline data: URIs), so it is stripped from the verify payload.
      const def = row.machine_def as any;
      if (Array.isArray(def?.symbols)) {
        def.symbols = def.symbols.map((s: any) => { const { art: _art, ...rest } = s; return rest; });
      }

      return sendJson(res, {
        ok: true,
        spinId: row.id,
        bet: Number(row.bet),
        payout: Number(row.payout),
        basePayout: Number(row.base_payout),
        bonusKind: row.bonus_kind,
        bonusPayout: Number(row.bonus_payout),
        scatter: Number(row.scatter),
        chain: Number(row.chain),
        slam: Number(row.slam),
        serverSeedHash: row.server_seed_hash,
        serverSeed: reveal.serverSeed,
        seedRevealed: reveal.revealed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        draws: Number(row.draws),
        defVersion: Number(row.def_version),
        def,
        featureStateBefore: row.feature_state_before ?? {},
        createdAt: row.created_at,
        recipe:
          'float(i) = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, i*4)) for i = 0..draws-1. ' +
          'Run cabinet-math (public/slots/cabinet-math.js) against the def with that stream: ' +
          'stops = drawStops(rng, buildStrips(def)); grid = windowAt(stops, strips, def.rows); ' +
          'res = resolveSpin(def, strips, grid, rng, featureStateBefore); payout = round(payoutOf(def, bet, res)); ' +
          'a triggered bonus continues drawing from the same stream (free spins re-run the same recipe with fresh state; ' +
          'wheel takes one float over weights [22,20,16,14,10,9,6,3]; pick Fisher-Yates shuffles [1,1,2,2,3,3,4,5,6,8,10,15]). ' +
          'The serverSeedHash was committed before the bet; rotate your arcade seed to reveal serverSeed and confirm sha256(serverSeed) === serverSeedHash.',
      });
    } catch (err) {
      logger.error('[SlotPlay] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the spin.' });
    }
  });

  logger.info('[SlotPlay] routes registered');
}
