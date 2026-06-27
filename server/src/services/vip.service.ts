/**
 * VipService — off-chain chip loyalty / VIP program (MVP).
 *
 * Model (standard crypto-casino VIP, xgame.io / Stake-style):
 *   - A player's TIER is the highest rung in vip_tier_config whose
 *     min_lifetime_wager_chips they have met. Lifetime wager is derived live by
 *     summing the negative `*_bet` deltas in poker_chip_ledger (every house game
 *     already records these), so no separate volume table is maintained.
 *   - RAKEBACK accrues forward from player_vip_state.last_rakeback_claim_at at
 *     the current tier's rakeback_bps applied to wager turnover since that
 *     instant. Claiming credits chips and advances the cursor to NOW().
 *   - A one-time LEVEL-UP BONUS is granted for every tier crossed above
 *     player_vip_state.highest_tier_awarded.
 *
 * All rewards are paid in chips through applyPokerChipDelta() (reasons
 * 'vip_rakeback' / 'vip_tier_bonus'), mirroring holder rewards (migration 148).
 * Wager volume / chips are whole chips (1 chip = 1 MORBIUS); see poker-chip-scale.ts.
 *
 * Schema: migration 166_vip_rewards.sql.
 */

import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { applyPokerChipDelta } from './poker-chip-wallet';
import type { ReferralService } from './referral.service';

/** SQL fragment matching every wager (debit) ledger reason: plinko_bet, keno_bet, arcade_*_bet, … */
const BET_REASON_PREDICATE = `reason LIKE '%\\_bet'`;

export interface VipTier {
  tierLevel: number;
  tierName: string;
  minLifetimeWagerChips: string; // whole chips, as decimal string
  rakebackBps: number;
  levelUpBonusChips: string;     // whole chips, as decimal string
  color: string;
  /** Weekly cashback rate (bps of rolling 7-day wager), claimable once / 7 days. */
  weeklyCashbackBps: number;
  /** Monthly cashback rate (bps of rolling 30-day wager), claimable once / 30 days. */
  monthlyCashbackBps: number;
}

/** Minimal, PUBLIC view of a wallet's tier — safe to expose for badges/leaderboards. */
export interface VipPublicTier {
  address: string;
  tierLevel: number;
  tierName: string;
  color: string;
  rakebackBps: number;
  lifetimeWagerChips: string;
}

export interface VipStatus {
  address: string;
  /** Wager turnover in whole chips, as decimal strings. */
  lifetimeWagerChips: string;
  wager7dChips: string;
  wager30dChips: string;
  /** Current tier and the next rung (null at the top of the ladder). */
  currentTier: VipTier;
  nextTier: VipTier | null;
  /** 0–100 progress toward nextTier (100 when already at max tier). */
  progressPct: number;
  /** Wager chips still needed to reach nextTier ('0' at max tier). */
  wagerToNextChips: string;
  /** Claimable now (whole chips, decimal strings). */
  claimableRakebackChips: string;
  pendingTierBonusChips: string;
  /** Weekly/monthly cashback claimable right now (0 until the cadence elapses). */
  weeklyCashbackChips: string;
  monthlyCashbackChips: string;
  /** Whether the weekly/monthly cadence has elapsed (claimable this cycle). */
  weeklyCashbackReady: boolean;
  monthlyCashbackReady: boolean;
  /** ISO timestamps when the next weekly/monthly cashback unlocks (null = ready now). */
  weeklyCashbackReadyAt: string | null;
  monthlyCashbackReadyAt: string | null;
  /** Lifetime claimed totals. */
  lifetimeRakebackChips: string;
  lifetimeBonusChips: string;
  /** When rakeback accrual currently starts from. */
  rakebackSince: string;
}

export interface VipClaimResult {
  rakebackCredited: string;
  bonusCredited: string;
  weeklyCredited: string;
  monthlyCredited: string;
  totalCredited: string;
  chipBalance: string;
  newTier: VipTier;
}

interface VipStateRow {
  wallet_address: string;
  last_rakeback_claim_at: string;
  highest_tier_awarded: number;
  lifetime_rakeback_chips: string;
  lifetime_bonus_chips: string;
  last_weekly_claim_at: string | null;
  last_monthly_claim_at: string | null;
}

const WEEK_MS = 7 * 86_400_000;
const MONTH_MS = 30 * 86_400_000;

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

export class VipService {
  private tierCache: VipTier[] | null = null;
  private tierCacheAt = 0;
  private static readonly TIER_TTL_MS = 60_000;

  // referralService is optional so VipService can be constructed standalone
  // (e.g. in tests); when present, a referee's claim also pays their referrer.
  constructor(private pool: Pool, private referralService?: ReferralService) {}

  // ──────────────────────────────────────────────────────────────────
  // Tier ladder (cached 60s; runtime-tunable via vip_tier_config)
  // ──────────────────────────────────────────────────────────────────

  async getTiers(): Promise<VipTier[]> {
    const now = Date.now();
    if (this.tierCache && now - this.tierCacheAt < VipService.TIER_TTL_MS) {
      return this.tierCache;
    }
    const { rows } = await this.pool.query<{
      tier_level: number;
      tier_name: string;
      min_lifetime_wager_chips: string;
      rakeback_bps: number;
      level_up_bonus_chips: string;
      color: string;
      weekly_cashback_bps: number;
      monthly_cashback_bps: number;
    }>(
      `SELECT tier_level, tier_name, min_lifetime_wager_chips::text AS min_lifetime_wager_chips,
              rakeback_bps, level_up_bonus_chips::text AS level_up_bonus_chips, color,
              weekly_cashback_bps, monthly_cashback_bps
       FROM vip_tier_config
       ORDER BY tier_level ASC`,
    );
    const tiers = rows.map((r) => ({
      tierLevel: r.tier_level,
      tierName: r.tier_name,
      minLifetimeWagerChips: r.min_lifetime_wager_chips,
      rakebackBps: r.rakeback_bps,
      levelUpBonusChips: r.level_up_bonus_chips,
      color: r.color,
      weeklyCashbackBps: r.weekly_cashback_bps ?? 0,
      monthlyCashbackBps: r.monthly_cashback_bps ?? 0,
    }));
    this.tierCache = tiers;
    this.tierCacheAt = now;
    return tiers;
  }

  /** Highest tier whose lifetime-wager threshold is met by `lifetimeWager`. */
  private tierForWager(tiers: VipTier[], lifetimeWager: bigint): VipTier {
    let current = tiers[0];
    for (const t of tiers) {
      if (lifetimeWager >= BigInt(t.minLifetimeWagerChips)) current = t;
      else break;
    }
    return current;
  }

  // ──────────────────────────────────────────────────────────────────
  // Public tier lookups (no auth, no state mutation) — power avatar badges,
  // leaderboards, profiles. Tier is derived purely from lifetime wager.
  // ──────────────────────────────────────────────────────────────────

  /** A single wallet's current tier. */
  async getTierForAddress(walletAddress: string): Promise<VipPublicTier> {
    const addr = normalizeAddr(walletAddress);
    const tiers = await this.getTiers();
    const lifetime = await this.wagerSince(this.pool, addr, null);
    const tier = this.tierForWager(tiers, lifetime);
    return {
      address: addr,
      tierLevel: tier.tierLevel,
      tierName: tier.tierName,
      color: tier.color,
      rakebackBps: tier.rakebackBps,
      lifetimeWagerChips: lifetime.toString(),
    };
  }

  /** Tiers for many wallets in one query (e.g. every seat at a table). */
  async getTiersForAddresses(addresses: string[]): Promise<VipPublicTier[]> {
    const addrs = Array.from(
      new Set(
        addresses
          .map((a) => {
            try {
              return normalizeAddr(a);
            } catch {
              return null;
            }
          })
          .filter((a): a is string => a !== null),
      ),
    );
    if (addrs.length === 0) return [];
    const tiers = await this.getTiers();
    const { rows } = await this.pool.query<{ wallet_address: string; wagered: string }>(
      `SELECT wallet_address, COALESCE(-SUM(delta), 0)::text AS wagered
       FROM poker_chip_ledger
       WHERE wallet_address = ANY($1) AND ${BET_REASON_PREDICATE}
       GROUP BY wallet_address`,
      [addrs],
    );
    const wagerByAddr = new Map<string, bigint>();
    for (const r of rows) {
      const v = BigInt(r.wagered ?? '0');
      wagerByAddr.set(r.wallet_address, v > 0n ? v : 0n);
    }
    return addrs.map((addr) => {
      const lifetime = wagerByAddr.get(addr) ?? 0n;
      const tier = this.tierForWager(tiers, lifetime);
      return {
        address: addr,
        tierLevel: tier.tierLevel,
        tierName: tier.tierName,
        color: tier.color,
        rakebackBps: tier.rakebackBps,
        lifetimeWagerChips: lifetime.toString(),
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Wager volume — derived live from poker_chip_ledger bet reasons.
  // delta is negative for bets, so -SUM(delta) = positive turnover in chips.
  // ──────────────────────────────────────────────────────────────────

  private async wagerSince(
    db: Pool | PoolClient,
    addr: string,
    since: Date | null,
  ): Promise<bigint> {
    const params: unknown[] = [addr];
    let sinceClause = '';
    if (since) {
      params.push(since.toISOString());
      sinceClause = `AND created_at > $2`;
    }
    const { rows } = await db.query<{ wagered: string }>(
      `SELECT COALESCE(-SUM(delta), 0)::text AS wagered
       FROM poker_chip_ledger
       WHERE wallet_address = $1
         AND ${BET_REASON_PREDICATE}
         ${sinceClause}`,
      params,
    );
    const v = BigInt(rows[0]?.wagered ?? '0');
    return v > 0n ? v : 0n;
  }

  // ──────────────────────────────────────────────────────────────────
  // State row — lazily created (forward-looking rakeback cursor = NOW()).
  // ──────────────────────────────────────────────────────────────────

  private async ensureState(db: Pool | PoolClient, addr: string): Promise<VipStateRow> {
    await db.query(
      `INSERT INTO player_vip_state (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [addr],
    );
    const { rows } = await db.query<VipStateRow>(
      `SELECT wallet_address,
              last_rakeback_claim_at::text AS last_rakeback_claim_at,
              highest_tier_awarded,
              lifetime_rakeback_chips::text AS lifetime_rakeback_chips,
              lifetime_bonus_chips::text AS lifetime_bonus_chips,
              last_weekly_claim_at::text AS last_weekly_claim_at,
              last_monthly_claim_at::text AS last_monthly_claim_at
       FROM player_vip_state WHERE wallet_address = $1`,
      [addr],
    );
    return rows[0];
  }

  /**
   * Cashback eligibility/amount for one cadence. Eligible when the cursor is
   * null (never claimed) or the period has fully elapsed; the amount is the
   * tier's bps applied to the rolling-window wager. Returns the ISO instant the
   * next claim unlocks (null = ready now).
   */
  private cashbackFor(
    nowMs: number,
    lastClaimAt: string | null,
    periodMs: number,
    bps: number,
    windowWager: bigint,
  ): { ready: boolean; chips: bigint; readyAt: string | null } {
    const last = lastClaimAt ? new Date(lastClaimAt).getTime() : null;
    const ready = last === null || nowMs - last >= periodMs;
    if (!ready) {
      return { ready: false, chips: 0n, readyAt: new Date((last ?? nowMs) + periodMs).toISOString() };
    }
    const chips = bps > 0 ? (windowWager * BigInt(bps)) / 10000n : 0n;
    return { ready: true, chips, readyAt: null };
  }

  /** Sum of level-up bonuses for tiers in (fromTierExclusive, toTierInclusive]. */
  private pendingBonus(tiers: VipTier[], fromTierExclusive: number, toTierInclusive: number): bigint {
    let sum = 0n;
    for (const t of tiers) {
      if (t.tierLevel > fromTierExclusive && t.tierLevel <= toTierInclusive) {
        sum += BigInt(t.levelUpBonusChips);
      }
    }
    return sum;
  }

  // ──────────────────────────────────────────────────────────────────
  // Read: full status for the player's VIP dashboard.
  // ──────────────────────────────────────────────────────────────────

  async getStatus(walletAddress: string): Promise<VipStatus> {
    const addr = normalizeAddr(walletAddress);
    const tiers = await this.getTiers();
    const state = await this.ensureState(this.pool, addr);

    const now = Date.now();
    const lastClaim = new Date(state.last_rakeback_claim_at);
    const lifetime = await this.wagerSince(this.pool, addr, null);
    const wager7d = await this.wagerSince(this.pool, addr, new Date(now - 7 * 86_400_000));
    const wager30d = await this.wagerSince(this.pool, addr, new Date(now - 30 * 86_400_000));
    const wagerSinceClaim = await this.wagerSince(this.pool, addr, lastClaim);

    const currentTier = this.tierForWager(tiers, lifetime);
    const nextTier = tiers.find((t) => t.tierLevel === currentTier.tierLevel + 1) ?? null;

    let progressPct = 100;
    let wagerToNext = 0n;
    if (nextTier) {
      const floor = BigInt(currentTier.minLifetimeWagerChips);
      const ceil = BigInt(nextTier.minLifetimeWagerChips);
      const span = ceil - floor;
      const into = lifetime - floor;
      wagerToNext = ceil > lifetime ? ceil - lifetime : 0n;
      progressPct = span > 0n ? Math.min(100, Math.max(0, Number((into * 10000n) / span) / 100)) : 0;
    }

    // Rakeback uses the current tier's rate on turnover accrued since last claim.
    const claimableRakeback = (wagerSinceClaim * BigInt(currentTier.rakebackBps)) / 10000n;
    const pendingBonus = this.pendingBonus(tiers, state.highest_tier_awarded, currentTier.tierLevel);

    // Weekly/monthly cashback: tier bps × rolling-window wager, gated by cadence.
    const weekly = this.cashbackFor(now, state.last_weekly_claim_at, WEEK_MS, currentTier.weeklyCashbackBps, wager7d);
    const monthly = this.cashbackFor(now, state.last_monthly_claim_at, MONTH_MS, currentTier.monthlyCashbackBps, wager30d);

    return {
      address: addr,
      lifetimeWagerChips: lifetime.toString(),
      wager7dChips: wager7d.toString(),
      wager30dChips: wager30d.toString(),
      currentTier,
      nextTier,
      progressPct,
      wagerToNextChips: wagerToNext.toString(),
      claimableRakebackChips: claimableRakeback.toString(),
      pendingTierBonusChips: pendingBonus.toString(),
      weeklyCashbackChips: weekly.chips.toString(),
      monthlyCashbackChips: monthly.chips.toString(),
      weeklyCashbackReady: weekly.ready,
      monthlyCashbackReady: monthly.ready,
      weeklyCashbackReadyAt: weekly.readyAt,
      monthlyCashbackReadyAt: monthly.readyAt,
      lifetimeRakebackChips: state.lifetime_rakeback_chips,
      lifetimeBonusChips: state.lifetime_bonus_chips,
      rakebackSince: state.last_rakeback_claim_at,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutate: claim rakeback + any pending level-up bonuses in one txn.
  // ──────────────────────────────────────────────────────────────────

  async claim(walletAddress: string): Promise<VipClaimResult> {
    const addr = normalizeAddr(walletAddress);
    const tiers = await this.getTiers();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the state row for the duration of the claim (creating it if missing).
      await client.query(
        `INSERT INTO player_vip_state (wallet_address) VALUES ($1)
         ON CONFLICT (wallet_address) DO NOTHING`,
        [addr],
      );
      const { rows: stateRows } = await client.query<VipStateRow>(
        `SELECT wallet_address,
                last_rakeback_claim_at::text AS last_rakeback_claim_at,
                highest_tier_awarded,
                lifetime_rakeback_chips::text AS lifetime_rakeback_chips,
                lifetime_bonus_chips::text AS lifetime_bonus_chips,
                last_weekly_claim_at::text AS last_weekly_claim_at,
                last_monthly_claim_at::text AS last_monthly_claim_at
         FROM player_vip_state WHERE wallet_address = $1 FOR UPDATE`,
        [addr],
      );
      const state = stateRows[0];

      const now = Date.now();
      const lifetime = await this.wagerSince(client, addr, null);
      const wagerSinceClaim = await this.wagerSince(client, addr, new Date(state.last_rakeback_claim_at));
      const wager7d = await this.wagerSince(client, addr, new Date(now - WEEK_MS));
      const wager30d = await this.wagerSince(client, addr, new Date(now - MONTH_MS));
      const currentTier = this.tierForWager(tiers, lifetime);

      const rakebackChips = (wagerSinceClaim * BigInt(currentTier.rakebackBps)) / 10000n;
      const bonusChips = this.pendingBonus(tiers, state.highest_tier_awarded, currentTier.tierLevel);
      const weekly = this.cashbackFor(now, state.last_weekly_claim_at, WEEK_MS, currentTier.weeklyCashbackBps, wager7d);
      const monthly = this.cashbackFor(now, state.last_monthly_claim_at, MONTH_MS, currentTier.monthlyCashbackBps, wager30d);
      const weeklyChips = weekly.chips;
      const monthlyChips = monthly.chips;

      let chipBalance = 0n;
      let credited = false;
      if (rakebackChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, rakebackChips, 'vip_rakeback', {
          type: 'vip_claim',
          id: null,
        });
        credited = true;
      }
      if (bonusChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, bonusChips, 'vip_tier_bonus', {
          type: 'vip_claim',
          id: null,
        });
        credited = true;
      }
      if (weeklyChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, weeklyChips, 'vip_weekly_bonus', {
          type: 'vip_claim',
          id: null,
        });
        credited = true;
      }
      if (monthlyChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, monthlyChips, 'vip_monthly_bonus', {
          type: 'vip_claim',
          id: null,
        });
        credited = true;
      }

      // Pay this player's referrer their cut of the rakeback (house-funded, on
      // top of the player's reward). Runs in the same txn so it commits — or
      // rolls back — atomically with the claim. (A thrown error here poisons the
      // pg transaction, so it must propagate to the outer ROLLBACK, not be
      // swallowed; referral payout failures are DB-level and vanishingly rare.)
      if (this.referralService && rakebackChips > 0n) {
        await this.referralService.payReferralReward(client, addr, rakebackChips);
      }

      // Advance the rakeback cursor and the highest-paid tier; bump lifetime totals.
      // The weekly/monthly cadence cursors only advance when that cashback was
      // actually paid this claim (ready AND non-zero), so an early claim doesn't
      // burn the cycle.
      await client.query(
        `UPDATE player_vip_state
         SET last_rakeback_claim_at  = NOW(),
             highest_tier_awarded    = GREATEST(highest_tier_awarded, $2),
             lifetime_rakeback_chips = lifetime_rakeback_chips + $3::NUMERIC,
             lifetime_bonus_chips    = lifetime_bonus_chips + $4::NUMERIC,
             last_weekly_claim_at    = CASE WHEN $5 THEN NOW() ELSE last_weekly_claim_at END,
             last_monthly_claim_at   = CASE WHEN $6 THEN NOW() ELSE last_monthly_claim_at END,
             updated_at              = NOW()
         WHERE wallet_address = $1`,
        [
          addr,
          currentTier.tierLevel,
          rakebackChips.toString(),
          bonusChips.toString(),
          weeklyChips > 0n,
          monthlyChips > 0n,
        ],
      );

      await client.query('COMMIT');

      // If nothing was credited the balance read above stayed 0 — fetch the real one.
      if (!credited) {
        const { rows } = await this.pool.query<{ balance: string }>(
          'SELECT COALESCE(balance, 0)::text AS balance FROM player_poker_chips WHERE wallet_address = $1',
          [addr],
        );
        chipBalance = BigInt(rows[0]?.balance ?? '0');
      }

      logger.info('[VIP] claim', {
        addr,
        rakeback: rakebackChips.toString(),
        bonus: bonusChips.toString(),
        weekly: weeklyChips.toString(),
        monthly: monthlyChips.toString(),
        tier: currentTier.tierLevel,
      });

      return {
        rakebackCredited: rakebackChips.toString(),
        bonusCredited: bonusChips.toString(),
        weeklyCredited: weeklyChips.toString(),
        monthlyCredited: monthlyChips.toString(),
        totalCredited: (rakebackChips + bonusChips + weeklyChips + monthlyChips).toString(),
        chipBalance: chipBalance.toString(),
        newTier: currentTier,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
