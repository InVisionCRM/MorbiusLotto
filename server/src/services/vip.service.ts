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

/** SQL fragment matching every wager (debit) ledger reason: plinko_bet, keno_bet, arcade_*_bet, … */
const BET_REASON_PREDICATE = `reason LIKE '%\\_bet'`;

export interface VipTier {
  tierLevel: number;
  tierName: string;
  minLifetimeWagerChips: string; // whole chips, as decimal string
  rakebackBps: number;
  levelUpBonusChips: string;     // whole chips, as decimal string
  color: string;
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
  /** Lifetime claimed totals. */
  lifetimeRakebackChips: string;
  lifetimeBonusChips: string;
  /** When rakeback accrual currently starts from. */
  rakebackSince: string;
}

export interface VipClaimResult {
  rakebackCredited: string;
  bonusCredited: string;
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
}

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

export class VipService {
  private tierCache: VipTier[] | null = null;
  private tierCacheAt = 0;
  private static readonly TIER_TTL_MS = 60_000;

  constructor(private pool: Pool) {}

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
    }>(
      `SELECT tier_level, tier_name, min_lifetime_wager_chips::text AS min_lifetime_wager_chips,
              rakeback_bps, level_up_bonus_chips::text AS level_up_bonus_chips, color
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
              lifetime_bonus_chips::text AS lifetime_bonus_chips
       FROM player_vip_state WHERE wallet_address = $1`,
      [addr],
    );
    return rows[0];
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
                lifetime_bonus_chips::text AS lifetime_bonus_chips
         FROM player_vip_state WHERE wallet_address = $1 FOR UPDATE`,
        [addr],
      );
      const state = stateRows[0];

      const lifetime = await this.wagerSince(client, addr, null);
      const wagerSinceClaim = await this.wagerSince(client, addr, new Date(state.last_rakeback_claim_at));
      const currentTier = this.tierForWager(tiers, lifetime);

      const rakebackChips = (wagerSinceClaim * BigInt(currentTier.rakebackBps)) / 10000n;
      const bonusChips = this.pendingBonus(tiers, state.highest_tier_awarded, currentTier.tierLevel);

      let chipBalance = 0n;
      if (rakebackChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, rakebackChips, 'vip_rakeback', {
          type: 'vip_claim',
          id: null,
        });
      }
      if (bonusChips > 0n) {
        chipBalance = await applyPokerChipDelta(client, addr, bonusChips, 'vip_tier_bonus', {
          type: 'vip_claim',
          id: null,
        });
      }

      // Advance the rakeback cursor and the highest-paid tier; bump lifetime totals.
      await client.query(
        `UPDATE player_vip_state
         SET last_rakeback_claim_at  = NOW(),
             highest_tier_awarded    = GREATEST(highest_tier_awarded, $2),
             lifetime_rakeback_chips = lifetime_rakeback_chips + $3::NUMERIC,
             lifetime_bonus_chips    = lifetime_bonus_chips + $4::NUMERIC,
             updated_at              = NOW()
         WHERE wallet_address = $1`,
        [addr, currentTier.tierLevel, rakebackChips.toString(), bonusChips.toString()],
      );

      await client.query('COMMIT');

      // If nothing was credited the balance read above stayed 0 — fetch the real one.
      if (rakebackChips === 0n && bonusChips === 0n) {
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
        tier: currentTier.tierLevel,
      });

      return {
        rakebackCredited: rakebackChips.toString(),
        bonusCredited: bonusChips.toString(),
        totalCredited: (rakebackChips + bonusChips).toString(),
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
