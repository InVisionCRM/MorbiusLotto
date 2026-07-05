/**
 * ReferralService — house-funded "refer a friend" layer (off-chain chips).
 *
 * Model:
 *   - Every wallet has a shareable CODE (lazily minted on first view).
 *   - A new player BINDs one referrer's code (once, while still new) and is paid
 *     a one-time welcome bonus in chips.
 *   - Whenever a referee CLAIMS VIP rakeback, their referrer earns reward_bps of
 *     that rakeback. This is house-funded: credited ON TOP of the referee's
 *     reward, never deducted. The credit happens inside the referee's claim
 *     transaction (see VipService.claim → payReferralReward), so it is atomic.
 *
 * All payouts go through applyPokerChipDelta() with reasons
 * 'referral_welcome' / 'referral_reward'. Chips are whole chips (1 = 1 MORBIUS).
 *
 * Schema: migration 169_referrals.sql.
 */

import { randomInt } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { applyPokerChipDelta } from './poker-chip-wallet';

/** Same wager predicate the VIP service uses: every `*_bet` debit reason. */
const BET_REASON_PREDICATE = `reason LIKE '%\\_bet'`;

/** Crockford-style alphabet minus easily-confused glyphs (no I, L, O, U). */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

export interface ReferralConfig {
  rewardBps: number;
  welcomeBonusChips: string;
  maxBindWagerChips: string;
  enabled: boolean;
}

/** One friend who has used this wallet's referral code. */
export interface ReferralReferee {
  /** The referee's wallet address (lowercase). */
  address: string;
  /** When they applied the code (ISO 8601). */
  boundAt: string;
  /** Welcome bonus the referee received (whole chips). */
  welcomeBonusChips: string;
  /** Lifetime chips this referral has earned the referrer so far (whole chips). */
  totalRewardChips: string;
}

export interface ReferralSummary {
  address: string;
  /** This wallet's own shareable code. */
  code: string;
  /** Who referred this wallet (lowercase address), or null. */
  referrer: string | null;
  /** Welcome bonus this wallet received when it bound a code (whole chips). */
  welcomeBonusReceivedChips: string;
  /** People this wallet has referred, and lifetime chips earned from them. */
  refereeCount: number;
  totalEarnedChips: string;
  /** The individual referrals (most recent first) — who used the code and when. */
  referees: ReferralReferee[];
  /** Whether this wallet may still bind a code (new, unbound, program enabled). */
  canBind: boolean;
  /** Echoed config so the UI can explain the current terms. */
  rewardBps: number;
  welcomeBonusChips: string;
  enabled: boolean;
}

export interface ReferralBindResult {
  referrer: string;
  welcomeCredited: string;
  chipBalance: string;
}

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export class ReferralService {
  private configCache: ReferralConfig | null = null;
  private configCacheAt = 0;
  private static readonly CONFIG_TTL_MS = 60_000;

  constructor(private pool: Pool) {}

  // ──────────────────────────────────────────────────────────────────
  // Config (cached 60s; runtime-tunable via referral_config)
  // ──────────────────────────────────────────────────────────────────

  async getConfig(): Promise<ReferralConfig> {
    const now = Date.now();
    if (this.configCache && now - this.configCacheAt < ReferralService.CONFIG_TTL_MS) {
      return this.configCache;
    }
    const { rows } = await this.pool.query<{
      reward_bps: number;
      welcome_bonus_chips: string;
      max_bind_wager_chips: string;
      enabled: boolean;
    }>(
      `SELECT reward_bps, welcome_bonus_chips::text AS welcome_bonus_chips,
              max_bind_wager_chips::text AS max_bind_wager_chips, enabled
       FROM referral_config WHERE id = 1`,
    );
    const r = rows[0];
    const config: ReferralConfig = {
      rewardBps: r?.reward_bps ?? 0,
      welcomeBonusChips: r?.welcome_bonus_chips ?? '0',
      maxBindWagerChips: r?.max_bind_wager_chips ?? '0',
      enabled: r?.enabled ?? false,
    };
    this.configCache = config;
    this.configCacheAt = now;
    return config;
  }

  // ──────────────────────────────────────────────────────────────────
  // Lifetime wager (whole chips) — same derivation as VipService.
  // ──────────────────────────────────────────────────────────────────

  private async lifetimeWager(db: Pool | PoolClient, addr: string): Promise<bigint> {
    const { rows } = await db.query<{ wagered: string }>(
      `SELECT COALESCE(-SUM(delta), 0)::text AS wagered
       FROM poker_chip_ledger
       WHERE wallet_address = $1 AND ${BET_REASON_PREDICATE}`,
      [addr],
    );
    const v = BigInt(rows[0]?.wagered ?? '0');
    return v > 0n ? v : 0n;
  }

  // ──────────────────────────────────────────────────────────────────
  // Code allocation — one per wallet, unique, minted on demand.
  // ──────────────────────────────────────────────────────────────────

  async getOrCreateCode(walletAddress: string): Promise<string> {
    const addr = normalizeAddr(walletAddress);
    const existing = await this.pool.query<{ code: string }>(
      `SELECT code FROM referral_codes WHERE wallet_address = $1`,
      [addr],
    );
    if (existing.rows[0]) return existing.rows[0].code;

    // Mint a fresh code, retrying on the (rare) code collision.
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateCode();
      try {
        const ins = await this.pool.query<{ code: string }>(
          `INSERT INTO referral_codes (wallet_address, code) VALUES ($1, $2)
           ON CONFLICT (wallet_address) DO NOTHING
           RETURNING code`,
          [addr, code],
        );
        if (ins.rows[0]) return ins.rows[0].code;
        // Conflict on wallet_address (concurrent insert) — read back the winner.
        const again = await this.pool.query<{ code: string }>(
          `SELECT code FROM referral_codes WHERE wallet_address = $1`,
          [addr],
        );
        if (again.rows[0]) return again.rows[0].code;
      } catch (err) {
        // 23505 = unique_violation on the code; try a different one.
        if ((err as { code?: string }).code === '23505') continue;
        throw err;
      }
    }
    throw new Error('Could not allocate a referral code');
  }

  // ──────────────────────────────────────────────────────────────────
  // Read: full referral summary for the dashboard.
  // ──────────────────────────────────────────────────────────────────

  async getSummary(walletAddress: string): Promise<ReferralSummary> {
    const addr = normalizeAddr(walletAddress);
    const [code, config] = await Promise.all([this.getOrCreateCode(addr), this.getConfig()]);

    const mine = await this.pool.query<{ referrer_address: string; welcome_bonus_chips: string }>(
      `SELECT referrer_address, welcome_bonus_chips::text AS welcome_bonus_chips
       FROM referrals WHERE referee_address = $1`,
      [addr],
    );
    const referrer = mine.rows[0]?.referrer_address ?? null;
    const welcomeReceived = mine.rows[0]?.welcome_bonus_chips ?? '0';

    const agg = await this.pool.query<{ cnt: number; earned: string }>(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_reward_chips), 0)::text AS earned
       FROM referrals WHERE referrer_address = $1`,
      [addr],
    );

    // The individual referrals, newest first — powers the "code used" activity list.
    const refereeRows = await this.pool.query<{
      referee_address: string;
      bound_at: Date | string;
      welcome_bonus_chips: string;
      total_reward_chips: string;
    }>(
      `SELECT referee_address, bound_at,
              welcome_bonus_chips::text AS welcome_bonus_chips,
              total_reward_chips::text AS total_reward_chips
       FROM referrals WHERE referrer_address = $1
       ORDER BY bound_at DESC
       LIMIT 100`,
      [addr],
    );
    const referees: ReferralReferee[] = refereeRows.rows.map((r) => ({
      address: r.referee_address,
      boundAt: new Date(r.bound_at).toISOString(),
      welcomeBonusChips: r.welcome_bonus_chips,
      totalRewardChips: r.total_reward_chips,
    }));

    const lifetime = await this.lifetimeWager(this.pool, addr);
    const canBind = config.enabled && referrer === null && lifetime <= BigInt(config.maxBindWagerChips);

    return {
      address: addr,
      code,
      referrer,
      welcomeBonusReceivedChips: welcomeReceived,
      refereeCount: agg.rows[0]?.cnt ?? 0,
      totalEarnedChips: agg.rows[0]?.earned ?? '0',
      referees,
      canBind,
      rewardBps: config.rewardBps,
      welcomeBonusChips: config.welcomeBonusChips,
      enabled: config.enabled,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutate: bind this wallet to a referrer's code (once) + pay welcome.
  // ──────────────────────────────────────────────────────────────────

  async bind(refereeAddress: string, codeRaw: string): Promise<ReferralBindResult> {
    const referee = normalizeAddr(refereeAddress);
    const code = String(codeRaw ?? '').trim().toUpperCase();
    if (!code) throw new Error('Enter a referral code');

    const config = await this.getConfig();
    if (!config.enabled) throw new Error('Referrals are not active right now');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const codeRow = await client.query<{ wallet_address: string }>(
        `SELECT wallet_address FROM referral_codes WHERE code = $1`,
        [code],
      );
      const referrer = codeRow.rows[0]?.wallet_address;
      if (!referrer) throw new Error('That referral code does not exist');
      if (referrer === referee) throw new Error('You cannot use your own referral code');

      // Lock the referee's binding slot so a double-submit can't bind twice.
      const existing = await client.query<{ referrer_address: string }>(
        `SELECT referrer_address FROM referrals WHERE referee_address = $1 FOR UPDATE`,
        [referee],
      );
      if (existing.rows[0]) throw new Error('You have already used a referral code');

      const lifetime = await this.lifetimeWager(client, referee);
      if (lifetime > BigInt(config.maxBindWagerChips)) {
        throw new Error('Referral codes can only be applied by new players');
      }

      const welcome = BigInt(config.welcomeBonusChips);
      let chipBalance = 0n;
      if (welcome > 0n) {
        chipBalance = await applyPokerChipDelta(client, referee, welcome, 'referral_welcome', {
          type: 'referral',
          id: null,
        });
      }

      await client.query(
        `INSERT INTO referrals (referee_address, referrer_address, code, welcome_bonus_chips)
         VALUES ($1, $2, $3, $4::NUMERIC)`,
        [referee, referrer, code, welcome.toString()],
      );

      await client.query('COMMIT');

      if (welcome === 0n) {
        const { rows } = await this.pool.query<{ balance: string }>(
          'SELECT COALESCE(balance, 0)::text AS balance FROM player_poker_chips WHERE wallet_address = $1',
          [referee],
        );
        chipBalance = BigInt(rows[0]?.balance ?? '0');
      }

      logger.info('[Referral] bind', { referee, referrer, welcome: welcome.toString() });
      return { referrer, welcomeCredited: welcome.toString(), chipBalance: chipBalance.toString() };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Transactional hook: pay a referee's referrer their cut of rakeback.
  // Called from VipService.claim INSIDE the open claim transaction, so the
  // referrer credit commits atomically with the referee's claim.
  // ──────────────────────────────────────────────────────────────────

  async payReferralReward(
    client: PoolClient,
    refereeAddress: string,
    rakebackChips: bigint,
  ): Promise<{ referrer: string; reward: string } | null> {
    if (rakebackChips <= 0n) return null;
    const referee = normalizeAddr(refereeAddress);

    const config = await this.getConfig();
    if (!config.enabled || config.rewardBps <= 0) return null;

    const row = await client.query<{ referrer_address: string }>(
      `SELECT referrer_address FROM referrals WHERE referee_address = $1`,
      [referee],
    );
    const referrer = row.rows[0]?.referrer_address;
    if (!referrer) return null;

    const reward = (rakebackChips * BigInt(config.rewardBps)) / 10000n;
    if (reward <= 0n) return null;

    await applyPokerChipDelta(client, referrer, reward, 'referral_reward', {
      type: 'referral',
      id: null,
    });
    await client.query(
      `UPDATE referrals SET total_reward_chips = total_reward_chips + $2::NUMERIC WHERE referee_address = $1`,
      [referee, reward.toString()],
    );

    logger.info('[Referral] reward', { referee, referrer, reward: reward.toString() });
    return { referrer, reward: reward.toString() };
  }
}
