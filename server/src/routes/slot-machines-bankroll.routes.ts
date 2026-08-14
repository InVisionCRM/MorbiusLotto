/**
 * slot-machines-bankroll.routes.ts — PRC-20 token config + creator bankroll
 * for community slot machines (Phase 2 of real-money community slots).
 *
 *   POST /api/slot-machines/:slug/token             — owner: pick the betting token
 *   GET  /api/slot-machines/:slug/bankroll          — public: token + bankroll status
 *   POST /api/slot-machines/:slug/bankroll/deposit  — owner: claim a verified escrow funding tx
 *   POST /api/slot-machines/:slug/bankroll/withdraw — owner: escrow payout back to the owner
 *
 * How funding works (documented here for the Phase 4 builder UI):
 *   1. Owner picks a token (POST /token — server reads decimals/symbol/name
 *      from the chain; changeable only before the first deposit, because the
 *      escrow pool's token is fixed forever by its first addToPrizePool).
 *   2. Owner approves the escrow and calls
 *      addToPrizePool(keccak256(machineUUID), token, amount) on the
 *      Tournament Prize Escrow — the same call poker buy-ins use.
 *   3. Owner POSTs the tx hash to /bankroll/deposit; the server verifies the
 *      PrizePoolAdded event on-chain and credits the EVENT amount (what the
 *      escrow's own books say). One tx credits exactly once (unique index).
 *
 * Withdrawals debit the DB ledger first, then send the authorized-key escrow
 * payout, refunding the ledger if the send fails — the failure mode is an
 * understated bankroll (a support case), never a double-payable one.
 *
 * Fee-on-transfer tokens (product decision: warn, never block): a detected
 * shortfall between the escrow's balance delta and the event amount flags
 * token_fee_warning on the machine permanently.
 *
 * Amounts in every request/response are token base-unit strings.
 */

import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { DatabaseService, CommunitySlotMachine } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { realSlotBankrollChain, type SlotBankrollChain } from '../lib/community-slot-bankroll';
import { defaultCreditValue, parseCreditValue } from '../lib/community-slot-real';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterSlotMachineBankrollRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
  /** Injectable for tests; defaults to the real PulseChain implementation. */
  chain?: SlotBankrollChain;
}

function parseBaseUnits(raw: unknown): bigint | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,78}$/.test(raw)) return null;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export function registerSlotMachineBankrollRoutes({
  app, dbService, authService, chain = realSlotBankrollChain,
}: RegisterSlotMachineBankrollRoutesOptions): void {
  const pool = dbService.getPool();

  const writeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: 'Too many bankroll requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  /** allowDisabled: money must always be exitable — withdrawals work even on
   *  a soft-deleted machine, while token config and new deposits do not. */
  async function ownedMachine(slug: string, wallet: string, res: Response, allowDisabled = false): Promise<CommunitySlotMachine | null> {
    const m = await dbService.getSlotMachineBySlug(slug);
    if (!m || (m.status === 'disabled' && !allowDisabled)) { res.status(404).json({ ok: false, error: 'not found' }); return null; }
    if (m.owner_address.toLowerCase() !== wallet.toLowerCase()) {
      res.status(403).json({ ok: false, error: 'not your machine', code: 'WRONG_WALLET' });
      return null;
    }
    return m;
  }

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/token { tokenAddress }
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/token',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const machine = await ownedMachine(req.params.slug, req.user!.address, res);
        if (!machine) return;
        const tokenAddress = String(req.body?.tokenAddress ?? '').trim().toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) {
          return res.status(400).json({ ok: false, error: 'tokenAddress must be a 0x-prefixed 20-byte address' });
        }
        // The escrow pool's token is fixed forever by its first deposit — a
        // later "change" would leave the pool unfundable. Block once funded.
        const dep = await pool.query(
          `SELECT 1 FROM community_slot_bankroll_events WHERE machine_id = $1 AND kind = 'deposit' LIMIT 1`,
          [machine.id],
        );
        if (dep.rows.length > 0) {
          return res.status(409).json({ ok: false, error: 'This machine has already been funded — its token can no longer change.' });
        }

        let meta;
        try {
          meta = await chain.readTokenMetadata(tokenAddress);
        } catch (e) {
          return res.status(422).json({ ok: false, error: 'Could not read this token from the chain — is it a PRC-20? (' + String((e as Error)?.message ?? e) + ')' });
        }
        // Credit value: how many base units one spin credit is worth.
        // Default 0.001 token; creator-overridable until the first deposit
        // (it locks with the token — re-pricing live balances would corrupt
        // every session and the bankroll at once).
        const creditValue = req.body?.creditValue != null
          ? parseCreditValue(req.body.creditValue)
          : defaultCreditValue(meta.decimals);
        if (creditValue === null) {
          return res.status(400).json({ ok: false, error: 'creditValue must be a positive base-unit integer string' });
        }
        await pool.query(
          `UPDATE community_slot_machines
           SET token_address = $2, token_decimals = $3, token_symbol = $4, token_name = $5,
               credit_value = $6::numeric, updated_at = NOW()
           WHERE id = $1`,
          [machine.id, tokenAddress, meta.decimals, meta.symbol, meta.name, creditValue.toString()],
        );
        return sendJson(res, {
          ok: true,
          token: { address: tokenAddress, decimals: meta.decimals, symbol: meta.symbol, name: meta.name },
          creditValue: creditValue.toString(),
          note: 'If this token charges a fee on transfers, deposits will credit the escrow\'s recorded amount while the vault receives less — the machine will carry a fee warning and payouts can fall short. Plain PRC-20s are strongly recommended.',
        });
      } catch (error) {
        logger.error('[SlotBankroll] set token failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/:slug/bankroll — public transparency read.
  // ---------------------------------------------------------------------
  app.get('/api/slot-machines/:slug/bankroll', async (req: Request, res: Response) => {
    try {
      const m = await dbService.getSlotMachineBySlug(req.params.slug);
      if (!m || m.status === 'disabled') return res.status(404).json({ ok: false, error: 'not found' });
      const r = await pool.query(
        `SELECT token_address, token_decimals, token_symbol, token_name, token_fee_warning, bankroll
         FROM community_slot_machines WHERE id = $1`,
        [m.id],
      );
      const row = r.rows[0];
      return sendJson(res, {
        ok: true,
        token: row.token_address
          ? { address: row.token_address, decimals: Number(row.token_decimals), symbol: row.token_symbol, name: row.token_name }
          : null,
        bankroll: String(row.bankroll ?? '0'),
        feeWarning: !!row.token_fee_warning,
      });
    } catch (error) {
      logger.error('[SlotBankroll] status failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/bankroll/deposit { txHash }
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/bankroll/deposit',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await ownedMachine(req.params.slug, wallet, res);
        if (!machine) return;
        const txHash = String(req.body?.txHash ?? '').trim();
        const tok = await pool.query(
          `SELECT token_address, token_fee_warning FROM community_slot_machines WHERE id = $1`,
          [machine.id],
        );
        const tokenAddress = tok.rows[0]?.token_address as string | null;
        if (!tokenAddress) {
          return res.status(409).json({ ok: false, error: 'Pick a token for this machine first.' });
        }

        // On-chain verification BEFORE touching the DB — trust the chain, not the client.
        const v = await chain.verifyBankrollDeposit({ machineId: machine.id, txHash, contributor: wallet, tokenAddress });
        if (!v.ok || !v.amount) {
          return res.status(422).json({ ok: false, error: v.error ?? 'Deposit could not be verified' });
        }

        const result = await dbService.withTransaction(async (client) => {
          // One tx credits exactly once — across BOTH ledgers. The same
          // on-chain deposit must never be claimable as a bankroll top-up
          // AND a player session deposit.
          const dupPlayer = await client.query(
            `SELECT 1 FROM community_slot_player_events WHERE tx_hash = $1 AND kind = 'deposit' LIMIT 1`,
            [txHash.toLowerCase()],
          );
          if (dupPlayer.rows.length > 0) return null;
          // The partial unique index rejects a replayed tx hash — surface it cleanly.
          const ins = await client.query(
            `INSERT INTO community_slot_bankroll_events (machine_id, kind, actor_address, amount, tx_hash, fee_detected)
             VALUES ($1, 'deposit', $2, $3, $4, $5)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [machine.id, wallet.toLowerCase(), v.amount!.toString(), txHash.toLowerCase(), !!v.feeDetected],
          );
          if (ins.rows.length === 0) return null; // tx already credited
          const upd = await client.query(
            `UPDATE community_slot_machines
             SET bankroll = bankroll + $2::numeric,
                 token_fee_warning = token_fee_warning OR $3,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING bankroll, token_fee_warning`,
            [machine.id, v.amount!.toString(), !!v.feeDetected],
          );
          return upd.rows[0];
        });
        if (!result) {
          return res.status(409).json({ ok: false, error: 'This deposit transaction was already credited.' });
        }
        return sendJson(res, {
          ok: true,
          credited: v.amount.toString(),
          bankroll: String(result.bankroll),
          feeWarning: !!result.token_fee_warning,
          feeDetectedOnThisDeposit: !!v.feeDetected,
        });
      } catch (error) {
        logger.error('[SlotBankroll] deposit failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  // ---------------------------------------------------------------------
  // POST /api/slot-machines/:slug/bankroll/withdraw { amount }
  // ---------------------------------------------------------------------
  app.post(
    '/api/slot-machines/:slug/bankroll/withdraw',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const wallet = req.user!.address;
        const machine = await ownedMachine(req.params.slug, wallet, res, true);
        if (!machine) return;
        const amount = parseBaseUnits(req.body?.amount);
        if (amount === null) {
          return res.status(400).json({ ok: false, error: 'amount must be a positive base-unit integer string' });
        }

        // 1. Debit the ledger first (locked), recording the pending withdrawal.
        const debit = await dbService.withTransaction(async (client) => {
          const r = await client.query(
            `SELECT bankroll FROM community_slot_machines WHERE id = $1 FOR UPDATE`,
            [machine.id],
          );
          const bankroll = BigInt(String(r.rows[0].bankroll ?? '0'));
          if (amount > bankroll) return null;
          await client.query(
            `UPDATE community_slot_machines SET bankroll = bankroll - $2::numeric, updated_at = NOW() WHERE id = $1`,
            [machine.id, amount.toString()],
          );
          const ev = await client.query(
            `INSERT INTO community_slot_bankroll_events (machine_id, kind, actor_address, amount)
             VALUES ($1, 'withdrawal', $2, $3)
             RETURNING id`,
            [machine.id, wallet.toLowerCase(), amount.toString()],
          );
          return { eventId: String(ev.rows[0].id) };
        });
        if (!debit) {
          return res.status(400).json({ ok: false, error: 'Withdrawal exceeds the machine bankroll.' });
        }

        // 2. Send the escrow payout. On failure, refund the ledger — worst
        //    case is an understated bankroll, never a double-payable one.
        const sent = await chain.sendBankrollWithdrawal(machine.id, wallet, amount);
        if (!sent.success) {
          await dbService.withTransaction(async (client) => {
            await client.query(
              `UPDATE community_slot_machines SET bankroll = bankroll + $2::numeric, updated_at = NOW() WHERE id = $1`,
              [machine.id, amount.toString()],
            );
            await client.query(`DELETE FROM community_slot_bankroll_events WHERE id = $1`, [debit.eventId]);
          }).catch((refundErr) => {
            // Refund failed too: bankroll is understated. Loud log; the event
            // row (no tx hash) is the audit trail for support.
            logger.error('[SlotBankroll] withdraw refund failed — bankroll understated', {
              machineId: machine.id, eventId: debit.eventId, amount: amount.toString(), refundErr: String(refundErr),
            });
          });
          return res.status(502).json({ ok: false, error: sent.error ?? 'Escrow payout failed — nothing was withdrawn.' });
        }
        if (sent.txHash) {
          await pool.query(
            `UPDATE community_slot_bankroll_events SET tx_hash = $2 WHERE id = $1`,
            [debit.eventId, sent.txHash.toLowerCase()],
          ).catch(() => { /* hash backfill is best-effort; the payout already happened */ });
        }
        const after = await pool.query(`SELECT bankroll FROM community_slot_machines WHERE id = $1`, [machine.id]);
        return sendJson(res, {
          ok: true,
          withdrawn: amount.toString(),
          txHash: sent.txHash ?? null,
          bankroll: String(after.rows[0].bankroll),
        });
      } catch (error) {
        logger.error('[SlotBankroll] withdraw failed', error);
        return res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    },
  );

  logger.info('[SlotBankroll] routes registered');
}
