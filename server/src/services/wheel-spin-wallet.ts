import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Balance-change listener — server.ts wires this to wsService.broadcastToPlayer
// so the floating wheel launcher in the browser ticks up the moment a spin is
// granted/spent. Kept as a simple function pointer to avoid coupling this
// pure-data service to the WebSocket service. Listener errors are swallowed
// so a flaky WS connection cannot corrupt ledger writes.
// ---------------------------------------------------------------------------
export interface WheelBalanceChangeEvent {
  wallet: string;            // lowercase 0x address
  spinsAvailable: number;    // new balance
  delta: number;             // signed change (+grant, -spend)
  reason: WheelSpinReason | WheelWagerReason;
  ref?: WheelRef;
}
let balanceChangeListener: ((e: WheelBalanceChangeEvent) => void) | null = null;
export function setWheelBalanceListener(fn: ((e: WheelBalanceChangeEvent) => void) | null): void {
  balanceChangeListener = fn;
}
function emitBalanceChange(e: WheelBalanceChangeEvent): void {
  if (!balanceChangeListener) return;
  try { balanceChangeListener(e); } catch (err) {
    logger.warn('wheel balance listener threw', { error: (err as Error).message });
  }
}

export type WheelSpinReason =
  | 'wager_volume_blackjack'
  | 'wager_volume_blackjack_multi'
  | 'wager_volume_poker'
  | 'tournament_entry'
  | 'tournament_cancel_refund'
  | 'daily_first_game'
  | 'loss_streak_pity'
  | 'wheel_spin'
  | 'free_spin_reward'
  | 'manual_grant';

export type WheelWagerReason =
  | 'wager_volume_blackjack'
  | 'wager_volume_blackjack_multi'
  | 'wager_volume_poker';

export interface WheelRef {
  type: string;
  id: string;
}

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

function isPoolClient(x: Pool | PoolClient): x is PoolClient {
  return typeof (x as PoolClient).release === 'function';
}

async function withClient<T>(
  executor: Pool | PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isPoolClient(executor)) {
    return fn(executor);
  }
  const client = await executor.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getWheelBalance(
  executor: Pool | PoolClient,
  walletAddress: string,
): Promise<number> {
  const addr = normalizeAddr(walletAddress);
  const r = await executor.query<{ spins_available: number }>(
    'SELECT spins_available FROM wheel_spin_wallets WHERE wallet_address = $1',
    [addr],
  );
  return r.rows[0]?.spins_available ?? 0;
}

export async function getWheelRule(
  executor: Pool | PoolClient,
  key: string,
): Promise<string | null> {
  const r = await executor.query<{ rule_value: string }>(
    'SELECT rule_value FROM wheel_spin_rules WHERE rule_key = $1',
    [key],
  );
  return r.rows[0]?.rule_value ?? null;
}

async function getWheelRuleBig(
  executor: Pool | PoolClient,
  key: string,
): Promise<bigint> {
  const v = await getWheelRule(executor, key);
  if (v == null) throw new Error(`Missing wheel_spin_rules entry: ${key}`);
  return BigInt(v);
}

async function getWheelRuleInt(
  executor: Pool | PoolClient,
  key: string,
): Promise<number> {
  const v = await getWheelRule(executor, key);
  if (v == null) throw new Error(`Missing wheel_spin_rules entry: ${key}`);
  return parseInt(v, 10);
}

export interface WheelDeltaResult {
  balance_after: number;
  applied: boolean;
  delta_applied: number;
}

export interface WheelDeltaOptions {
  /** If true and a negative delta would underflow, clamp to -current_balance instead of throwing. */
  clamp?: boolean;
}

/**
 * Runs `fn` inside a savepoint so an expected failure can be caught without
 * poisoning the surrounding transaction.
 *
 * Postgres aborts the entire transaction on any failed statement, and every
 * later command then returns 25P02 ("current transaction is aborted") until it
 * unwinds. So catching a duplicate-key violation and carrying on is only safe
 * if the failure is rolled back first. That matters here because callers may
 * pass a PoolClient belonging to *their* transaction — swallowing a dedupe hit
 * without unwinding would break the caller's work, not ours.
 */
async function inSavepoint<T>(
  client: PoolClient,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (e) {
    // Best-effort unwind: never let cleanup replace the original error.
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {});
    await client.query(`RELEASE SAVEPOINT ${name}`).catch(() => {});
    throw e;
  }
}

/**
 * Apply a signed spin delta. Idempotent on (reason, ref_type, ref_id) when ref.id is set.
 * If executor is a Pool, a new BEGIN/COMMIT transaction is opened internally.
 * If executor is a PoolClient, the caller's transaction is reused.
 */
export async function applyWheelSpinDelta(
  executor: Pool | PoolClient,
  walletAddress: string,
  delta: number,
  reason: WheelSpinReason,
  ref?: WheelRef,
  metadata?: Record<string, unknown>,
  options: WheelDeltaOptions = {},
): Promise<WheelDeltaResult> {
  if (!Number.isInteger(delta)) throw new Error('delta must be integer');
  if (delta === 0) {
    return {
      balance_after: await getWheelBalance(executor, walletAddress),
      applied: false,
      delta_applied: 0,
    };
  }
  const addr = normalizeAddr(walletAddress);
  return withClient(executor, async (client) => {
    await client.query(
      `INSERT INTO wheel_spin_wallets (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [addr],
    );
    const row = await client.query<{ spins_available: number }>(
      `SELECT spins_available FROM wheel_spin_wallets
       WHERE wallet_address = $1 FOR UPDATE`,
      [addr],
    );
    const before = row.rows[0]?.spins_available ?? 0;

    let effectiveDelta = delta;
    if (delta < 0 && before + delta < 0) {
      if (!options.clamp) {
        throw new Error('Insufficient spins');
      }
      effectiveDelta = -before;
      if (effectiveDelta === 0) {
        return { balance_after: before, applied: false, delta_applied: 0 };
      }
    }
    const after = before + effectiveDelta;

    try {
      const meta = { ...(metadata ?? {}) } as Record<string, unknown>;
      if (effectiveDelta !== delta) meta.clamped_from = delta;
      // Savepointed: a dedupe hit is expected, and must not abort a caller's
      // transaction on its way to being swallowed below.
      await inSavepoint(client, 'wheel_spin_ledger_insert', () =>
        client.query(
          `INSERT INTO wheel_spin_ledger
             (wallet_address, delta, balance_after, reason, ref_type, ref_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            addr,
            effectiveDelta,
            after,
            reason,
            ref?.type ?? null,
            ref?.id ?? null,
            Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
          ],
        ),
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        logger.debug('Wheel spin delta deduped', { wallet: addr, reason, ref });
        return { balance_after: before, applied: false, delta_applied: 0 };
      }
      throw e;
    }

    const earnedInc = effectiveDelta > 0 ? effectiveDelta : 0;
    const usedInc = effectiveDelta < 0 ? -effectiveDelta : 0;
    await client.query(
      `UPDATE wheel_spin_wallets
         SET spins_available       = $2,
             spins_lifetime_earned = spins_lifetime_earned + $3,
             spins_lifetime_used   = spins_lifetime_used   + $4,
             updated_at            = NOW()
       WHERE wallet_address = $1`,
      [addr, after, earnedInc, usedInc],
    );

    emitBalanceChange({ wallet: addr, spinsAvailable: after, delta: effectiveDelta, reason, ref });
    return { balance_after: after, applied: true, delta_applied: effectiveDelta };
  });
}

export interface WheelWagerResult {
  spins_granted: number;
  balance_after: number;
  applied: boolean;
}

/**
 * Credit wager volume toward the spin accumulator and mint whole spins when the
 * remainder crosses the per-game threshold. Idempotent on (reason, ref_type, ref_id).
 *
 * wagerWei must be in MORBIUS wei (1 MORBIUS = 1e18). For poker chips, the caller
 * converts using `poker_chip_to_wei_ratio` from wheel_spin_rules (default 1:1 wei,
 * which yields 1 chip = 1e-18 MORBIUS — see below: poker hook scales by 1e18).
 */
export async function applyWheelWagerCredit(
  executor: Pool | PoolClient,
  walletAddress: string,
  wagerWei: bigint,
  reason: WheelWagerReason,
  ref: WheelRef,
): Promise<WheelWagerResult> {
  if (wagerWei <= 0n) {
    return { spins_granted: 0, balance_after: await getWheelBalance(executor, walletAddress), applied: false };
  }
  const addr = normalizeAddr(walletAddress);
  const ruleKey = `wager_wei_per_spin.${reason.replace('wager_volume_', '')}`;

  return withClient(executor, async (client) => {
    const threshold = await getWheelRuleBig(client, ruleKey);
    if (threshold <= 0n) throw new Error(`Invalid threshold for ${ruleKey}`);

    await client.query(
      `INSERT INTO wheel_spin_wallets (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [addr],
    );
    const row = await client.query<{ spins_available: number; wager_credit_remainder: string }>(
      `SELECT spins_available, wager_credit_remainder::text AS wager_credit_remainder
         FROM wheel_spin_wallets
        WHERE wallet_address = $1 FOR UPDATE`,
      [addr],
    );
    const before = row.rows[0]?.spins_available ?? 0;
    const remainder = BigInt(row.rows[0]?.wager_credit_remainder ?? '0');

    const totalRemainder = remainder + wagerWei;
    const spinsGranted = Number(totalRemainder / threshold);
    const newRemainder = totalRemainder - BigInt(spinsGranted) * threshold;
    const after = before + spinsGranted;

    try {
      // Savepointed for the same reason as applyWheelSpinDelta: this runs on the
      // caller's transaction when handed a PoolClient (blackjack multi settlement
      // does exactly that), so a duplicate here would otherwise abort the whole
      // settle and surface as 25P02 long after the real cause.
      await inSavepoint(client, 'wheel_wager_ledger_insert', () =>
        client.query(
          `INSERT INTO wheel_spin_ledger
             (wallet_address, delta, balance_after, reason, ref_type, ref_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            addr,
            spinsGranted,
            after,
            reason,
            ref.type,
            ref.id,
            JSON.stringify({ wager_wei: wagerWei.toString() }),
          ],
        ),
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        return { spins_granted: 0, balance_after: before, applied: false };
      }
      throw e;
    }

    await client.query(
      `UPDATE wheel_spin_wallets
         SET spins_available        = $2,
             spins_lifetime_earned  = spins_lifetime_earned + $3,
             wager_credit_remainder = $4::NUMERIC,
             updated_at             = NOW()
       WHERE wallet_address = $1`,
      [addr, after, spinsGranted, newRemainder.toString()],
    );

    if (spinsGranted > 0) {
      logger.debug('Wheel spins granted from wager', {
        wallet: addr,
        reason,
        spins_granted: spinsGranted,
        balance_after: after,
      });
      emitBalanceChange({ wallet: addr, spinsAvailable: after, delta: spinsGranted, reason, ref });
    }

    return { spins_granted: spinsGranted, balance_after: after, applied: true };
  });
}

/**
 * Record a daily milestone (e.g. first-of-day game played) and grant the configured
 * spin reward exactly once per (wallet, day, milestone_key). Idempotent.
 */
export async function recordDailyMilestone(
  executor: Pool | PoolClient,
  walletAddress: string,
  milestoneKey: string,
): Promise<WheelDeltaResult> {
  const addr = normalizeAddr(walletAddress);
  return withClient(executor, async (client) => {
    const day = new Date().toISOString().slice(0, 10);
    const r = await client.query<{ milestones: string[] }>(
      `INSERT INTO wheel_daily_state (wallet_address, day, milestones)
         VALUES ($1, $2, ARRAY[$3])
       ON CONFLICT (wallet_address, day)
         DO UPDATE SET milestones =
           CASE WHEN $3 = ANY(wheel_daily_state.milestones)
                THEN wheel_daily_state.milestones
                ELSE array_append(wheel_daily_state.milestones, $3)
           END
       RETURNING milestones`,
      [addr, day, milestoneKey],
    );
    // If the milestone was already present in the array before this UPSERT,
    // the row didn't actually change — but the RETURNING returns either case.
    // We dedupe via the ledger ref instead, with ref_id = "${day}:${milestoneKey}".
    const spins = await getWheelRuleInt(client, 'daily_first_game_spins');
    return applyWheelSpinDelta(
      client,
      addr,
      spins,
      'daily_first_game',
      { type: 'milestone', id: `${addr}:${day}:${milestoneKey}` },
      { milestone: milestoneKey },
    );
  });
}

/**
 * Track loss streak per wallet/day/game. On reaching the pity threshold, grant a
 * spin (capped per day) and reset the streak for that game. `won` true resets to 0.
 */
export async function recordGameOutcome(
  executor: Pool | PoolClient,
  walletAddress: string,
  game: 'blackjack' | 'blackjack_multi' | 'poker',
  won: boolean,
): Promise<{ pity_granted: boolean; balance_after: number }> {
  const addr = normalizeAddr(walletAddress);
  return withClient(executor, async (client) => {
    const day = new Date().toISOString().slice(0, 10);
    const threshold = await getWheelRuleInt(client, 'loss_streak_pity_threshold');
    const dailyCap = await getWheelRuleInt(client, 'loss_streak_pity_daily_cap');

    await client.query(
      `INSERT INTO wheel_daily_state (wallet_address, day)
         VALUES ($1, $2)
       ON CONFLICT (wallet_address, day) DO NOTHING`,
      [addr, day],
    );
    const row = await client.query<{ loss_streak: Record<string, number> }>(
      `SELECT loss_streak FROM wheel_daily_state
        WHERE wallet_address = $1 AND day = $2 FOR UPDATE`,
      [addr, day],
    );
    const streak = row.rows[0]?.loss_streak ?? {};
    const currentStreak = streak[game] ?? 0;
    const pityGrants = streak[`${game}_pity_count`] ?? 0;
    const newStreak = won ? 0 : currentStreak + 1;

    let pityGranted = false;
    let balanceAfter = await getWheelBalance(client, addr);

    if (!won && newStreak >= threshold && pityGrants < dailyCap) {
      const refId = `${addr}:${day}:${game}:${pityGrants + 1}`;
      const res = await applyWheelSpinDelta(
        client,
        addr,
        1,
        'loss_streak_pity',
        { type: 'pity', id: refId },
        { game, streak_length: newStreak },
      );
      if (res.applied) {
        pityGranted = true;
        balanceAfter = res.balance_after;
        streak[`${game}_pity_count`] = pityGrants + 1;
        streak[game] = 0;
      } else {
        streak[game] = newStreak;
      }
    } else {
      streak[game] = newStreak;
    }

    await client.query(
      `UPDATE wheel_daily_state SET loss_streak = $3::jsonb
        WHERE wallet_address = $1 AND day = $2`,
      [addr, day, JSON.stringify(streak)],
    );

    return { pity_granted: pityGranted, balance_after: balanceAfter };
  });
}
