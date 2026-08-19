/**
 * VipService — off-chain chip loyalty / VIP program (MVP).
 *
 * Model (standard crypto-casino VIP, xgame.io / Stake-style):
 *   - A player's TIER is the highest rung in vip_tier_config whose
 *     min_lifetime_wager_chips they have met. Lifetime wager is derived live by
 *     summing the negative `*_bet` deltas in poker_chip_ledger (every house game
 *     already records these), so no separate volume table is maintained.
 *   - RAKEBACK accrues forward from player_vip_state.last_rakeback_claim_at at
 *     the current tier's rakeback_bps applied to the player's NET LOSS since
 *     that instant — max(0, total bets − total payouts/refunds) over the
 *     window — NOT to raw wager turnover. (Owner decision 2026-07-02: rakeback
 *     is losses-only; tier progression stays wager-based.) Claiming credits
 *     chips and advances the cursor to NOW(); the max(0, …) clamp means a
 *     winning window simply accrues nothing — already-claimed rakeback is
 *     never clawed back.
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

/**
 * SQL fragment matching every credit that offsets those `*_bet` debits when
 * computing NET LOSS for rakeback (owner decision 2026-07-02: rakeback accrues
 * on losses only, not wager volume):
 *   - `*_payout`  — win/push credits for every house game (plinko_payout,
 *     keno_payout, blackjack_payout, arcade_*_payout, video_poker_payout, …).
 *   - `*_refund`  — a returned bet (blackjack_refund, arcade_craps_refund);
 *     counted so a cancelled bet nets to 0 loss instead of farming rakeback.
 *     `tournament_refund` is excluded: its debit is `tournament_buyin`, which
 *     never matched BET_REASON_PREDICATE in the first place.
 */
const GAME_CREDIT_REASON_PREDICATE =
  `(reason LIKE '%\\_payout' OR (reason LIKE '%\\_refund' AND reason <> 'tournament_refund'))`;

export interface VipTier {
  tierLevel: number;
  tierName: string;
  minLifetimeWagerChips: string; // whole chips, as decimal string
  rakebackBps: number;
  levelUpBonusChips: string;     // whole chips, as decimal string
  color: string;
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
  /** Lifetime wager turnover in whole chips, as a decimal string (drives tier). */
  lifetimeWagerChips: string;
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
  /** Sticky once true; re-checked while false (code may deploy before migration 195 runs). */
  private wagerCreditsTablePresent = false;

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
    // Bonus tier-progress credits (migration 195) add on top of ledger wagers.
    if (await this.hasWagerCreditsTable(this.pool)) {
      const { rows: creditRows } = await this.pool.query<{ wallet_address: string; credits: string }>(
        `SELECT wallet_address, COALESCE(SUM(chips), 0)::text AS credits
         FROM vip_wager_credits
         WHERE wallet_address = ANY($1)
         GROUP BY wallet_address`,
        [addrs],
      );
      for (const r of creditRows) {
        wagerByAddr.set(r.wallet_address, (wagerByAddr.get(r.wallet_address) ?? 0n) + BigInt(r.credits ?? '0'));
      }
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

  /** True once vip_wager_credits exists (migration 195). to_regclass never throws, so this is transaction-safe. */
  private async hasWagerCreditsTable(db: Pool | PoolClient): Promise<boolean> {
    if (this.wagerCreditsTablePresent) return true;
    const { rows } = await db.query<{ present: boolean }>(
      `SELECT to_regclass('vip_wager_credits') IS NOT NULL AS present`,
    );
    if (rows[0]?.present) this.wagerCreditsTablePresent = true;
    return this.wagerCreditsTablePresent;
  }

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
    const ledgerWager = v > 0n ? v : 0n;
    // Bonus tier-progress credits (migration 195: blackjack chain bonuses)
    // count toward lifetime wager without fabricating ledger bets. Existence-
    // checked (not try/caught — a failed query would poison claim()'s
    // transaction) so tiers still resolve if the migration hasn't run yet.
    if (!(await this.hasWagerCreditsTable(db))) return ledgerWager;
    const { rows: creditRows } = await db.query<{ credits: string }>(
      `SELECT COALESCE(SUM(chips), 0)::text AS credits
       FROM vip_wager_credits
       WHERE wallet_address = $1
         ${sinceClause}`,
      params,
    );
    return ledgerWager + BigInt(creditRows[0]?.credits ?? '0');
  }

  /**
   * NET LOSS in the window: max(0, bets − payouts/refunds), the rakeback base
   * per the 2026-07-02 owner decision (rakeback = rakeback_bps × net loss,
   * losses only — a break-even or winning window accrues 0). Bets are negative
   * deltas and credits positive, so -SUM(delta) over both reason sets is
   * exactly bets − credits. Ledger rows are written at round settlement (the
   * `*_payout` credit lands with — or immediately after — its `*_bet` debit),
   * so at claim time the payout side of every settled bet is already visible.
   * The clamp also guarantees a claim can never be negative / clawed back.
   */
  private async netLossSince(
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
    const { rows } = await db.query<{ net_loss: string }>(
      `SELECT COALESCE(-SUM(delta), 0)::text AS net_loss
       FROM poker_chip_ledger
       WHERE wallet_address = $1
         AND (${BET_REASON_PREDICATE} OR ${GAME_CREDIT_REASON_PREDICATE})
         ${sinceClause}`,
      params,
    );
    const v = BigInt(rows[0]?.net_loss ?? '0');
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

    const lastClaim = new Date(state.last_rakeback_claim_at);
    const lifetime = await this.wagerSince(this.pool, addr, null);
    // Rakeback base is NET LOSS since last claim, not wager (owner decision 2026-07-02).
    const netLossSinceClaim = await this.netLossSince(this.pool, addr, lastClaim);

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

    // Rakeback (2026-07-02 owner decision): current tier's rate × net loss
    // (max(0, bets − payouts)) since last claim — losses only, never wager volume.
    const claimableRakeback = (netLossSinceClaim * BigInt(currentTier.rakebackBps)) / 10000n;
    const pendingBonus = this.pendingBonus(tiers, state.highest_tier_awarded, currentTier.tierLevel);

    return {
      address: addr,
      lifetimeWagerChips: lifetime.toString(),
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
      // Rakeback base is NET LOSS since last claim (owner decision 2026-07-02:
      // rakeback = bps × max(0, bets − payouts), losses only). Tier progression
      // (`lifetime` above) intentionally stays wager-based.
      const netLossSinceClaim = await this.netLossSince(client, addr, new Date(state.last_rakeback_claim_at));
      const currentTier = this.tierForWager(tiers, lifetime);

      const rakebackChips = (netLossSinceClaim * BigInt(currentTier.rakebackBps)) / 10000n;
      const bonusChips = this.pendingBonus(tiers, state.highest_tier_awarded, currentTier.tierLevel);

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

      // Pay this player's referrer their cut of the rakeback (house-funded, on
      // top of the player's reward). Runs in the same txn so it commits — or
      // rolls back — atomically with the claim. (A thrown error here poisons the
      // pg transaction, so it must propagate to the outer ROLLBACK, not be
      // swallowed; referral payout failures are DB-level and vanishingly rare.)
      if (this.referralService && rakebackChips > 0n) {
        await this.referralService.payReferralReward(client, addr, rakebackChips);
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
