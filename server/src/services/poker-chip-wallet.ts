import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { POKER_CHIP_WEI } from '../lib/poker-chip-scale';

export type PokerChipLedgerReason =
  | 'purchase'
  | 'cashout'
  | 'cash_join'
  | 'cash_join_auto_purchase'
  | 'cash_leave'
  | 'cash_reup'
  | 'cash_reup_auto_purchase'
  | 'cash_admin_return'
  | 'tournament_create_guarantee'
  | 'tournament_buyin'
  | 'tournament_refund'
  | 'tournament_prize'
  | 'rake'
  | 'creator_fee'
  | 'platform_fee'
  | 'video_poker_bet'
  | 'video_poker_payout'
  | 'arcade_limbo_bet'
  | 'arcade_limbo_payout'
  | 'arcade_mines_bet'
  | 'arcade_mines_payout'
  | 'arcade_hilo_bet'
  | 'arcade_hilo_payout'
  | 'arcade_dice_bet'
  | 'arcade_dice_payout'
  | 'arcade_dicex2_bet'
  | 'arcade_dicex2_payout'
  | 'arcade_craps_bet'
  | 'arcade_craps_payout'
  | 'arcade_craps_refund'
  // Shared-felt craps. Kept distinct from the solo reasons so the ledger says
  // which game a chip moved in, but the `_bet` / `_payout` / `_refund` suffixes
  // are load-bearing: VipService and the Weekly Drop classify wagers by
  // `reason LIKE '%\_bet'`, so renaming these silently drops multiplayer craps
  // out of rakeback and raffle accrual.
  | 'craps_multi_bet'
  | 'craps_multi_payout'
  | 'craps_multi_refund'
  // Multiplayer Ultimate Hold'em. Same suffix rule as above — VipService and
  // the Weekly Drop find wagers with `reason LIKE '%\_bet'`.
  | 'uth_multi_bet'
  | 'uth_multi_payout'
  | 'uth_multi_refund'
  // Multiplayer roulette. Same suffix rule as above — VipService and the
  // Weekly Drop find wagers with `reason LIKE '%\_bet'`.
  | 'roulette_multi_bet'
  | 'roulette_multi_payout'
  | 'roulette_multi_refund'
  | 'arcade_baccarat_bet'
  | 'arcade_baccarat_payout'
  | 'arcade_crash_bet'
  | 'arcade_crash_payout'
  | 'arcade_roulette_bet'
  | 'arcade_roulette_payout'
  | 'arcade_towers_bet'
  | 'arcade_towers_payout'
  | 'arcade_chicken_bet'
  | 'arcade_chicken_payout'
  | 'arcade_dragon_tiger_bet'
  | 'arcade_dragon_tiger_payout'
  | 'arcade_andar_bahar_bet'
  | 'arcade_andar_bahar_payout'
  | 'arcade_pachinko_bet'
  | 'arcade_pachinko_payout'
  | 'arcade_cascade_bet'
  | 'arcade_cascade_payout'
  | 'arcade_firewalk_bet'
  | 'arcade_firewalk_payout'
  | 'arcade_heist_bet'
  | 'arcade_heist_payout'
  | 'arcade_three_card_poker_bet'
  | 'arcade_three_card_poker_payout'
  | 'arcade_pai_gow_poker_bet'
  | 'arcade_pai_gow_poker_payout'
  | 'arcade_greed_dice_bet'
  | 'arcade_greed_dice_payout'
  | 'arcade_cipher_bet'
  | 'arcade_cipher_payout'
  | 'arcade_ultimate_holdem_bet'
  | 'arcade_ultimate_holdem_payout'
  | 'arcade_caribbean_stud_bet'
  | 'arcade_caribbean_stud_payout'
  | 'arcade_blackjack_variants_bet'
  | 'arcade_blackjack_variants_payout'
  | 'keno_bet'
  | 'keno_payout'
  | 'plinko_bet'
  | 'plinko_payout'
  | 'blackjack_bet'        // single + multiplayer blackjack wager
  | 'blackjack_payout'     // blackjack win / push credit
  | 'blackjack_refund'     // blackjack bet returned (cancel / leave / AFK kick)
  | 'blackjack_tip'        // MP blackjack: tip routed to dealer/deployer
  // Solo blackjack win-streak chain bonus (5/7/15/25/37/50% of bet at 2..7+
  // consecutive wins). Deliberately NOT `*_payout`/`*_bet` suffixed: the gift
  // must not offset VIP net-loss rakeback nor count as wager turnover.
  | 'blackjack_streak_bonus'
  | 'deposit'              // on-chain MORBIUS deposit auto-converted to chips
  | 'withdrawal'           // chips auto-converted back to on-chain MORBIUS
  | 'migration'            // one-time players.balance (wei) → chip ledger move
  | 'holder_reward'     // MORBIUS holder epoch credit (1.25% slice → chips)
  | 'lp_holder_reward'  // LP holder epoch credit (1.5% slice → chips)
  | 'vip_rakeback'      // VIP loyalty: % of NET LOSS (bets − payouts) since last claim (owner decision 2026-07-02)
  | 'vip_tier_bonus'    // VIP loyalty: one-time chip bonus on reaching a new tier
  | 'admin_credit'      // manual admin balance top-up from the /activity dashboard
  | 'admin_debit'       // manual admin balance clawback (negative) from the /activity dashboard
  | 'vip_weekly_bonus'  // LEGACY (feature removed 2026-07-02): weekly cashback — historical rows only, no new accrual
  | 'vip_monthly_bonus' // LEGACY (feature removed 2026-07-02): monthly cashback — historical rows only, no new accrual
  | 'referral_welcome'  // referral: one-time welcome bonus credited to a referee on binding
  | 'referral_reward'   // referral: % of a referee's rakeback credited to their referrer
  | 'referral_clawback' // referral: admin reversal of earned referral rewards when a referrer is blacklisted for abuse
  | 'referral_welcome_clawback' // referral: admin reversal of a welcome bonus paid to a farmed referee
  | 'weekly_drop_prize'; // The Weekly Drop raffle prize (WEEKLY_DROP_SPEC.md) — auto-credit at draw

const DEFAULT_PLATFORM_FEE_WALLET = '0x41682815b05fe6b54a6c0f8813bb99423ee0309d';

export function getPlatformFeeWalletLower(): string {
  const raw = process.env.PLATFORM_FEE_WALLET?.trim();
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
  return DEFAULT_PLATFORM_FEE_WALLET;
}

/**
 * The Weekly Drop settlement hook (WEEKLY_DROP_SPEC.md — "Settlement hook: on
 * every settled bet, add 0.25% of wager to the open draw's pot and accrue entry
 * progress at that game's rate").
 *
 * applyPokerChipDelta is the single choke point every game wager passes
 * through (all `*_bet` debits land here — the same fact VipService relies on
 * for wager volume), so the raffle accrues here. Registered from server.ts via
 * setWeeklyDropWagerHook (a setter, mirroring setWheelBalanceListener, so this
 * module never imports weekly-drop.service — no import cycle). The hook itself
 * runs under a SAVEPOINT and never throws into game settlement.
 */
export type WeeklyDropWagerHook = (
  client: PoolClient,
  walletAddress: string,
  wagerChips: bigint,
  reason: string,
) => Promise<void>;

let weeklyDropWagerHook: WeeklyDropWagerHook | null = null;

export function setWeeklyDropWagerHook(hook: WeeklyDropWagerHook | null): void {
  weeklyDropWagerHook = hook;
}

/**
 * Refund counterpart (WeeklyDropService.reverseWagerAccrual): when a wager or
 * tournament buy-in is returned to the player, its Weekly Drop accrual is
 * unwound so register→refund loops can't farm raffle tickets. Same signature
 * and fail-safe contract as the wager hook.
 */
let weeklyDropRefundHook: WeeklyDropWagerHook | null = null;

export function setWeeklyDropRefundHook(hook: WeeklyDropWagerHook | null): void {
  weeklyDropRefundHook = hook;
}

/**
 * Fail-safe invokers for settlement paths that DON'T produce a `*_bet` /
 * `*_refund` chip-ledger row (poker cash rake in poker-game.service.ts, the
 * legacy wei-balance MORBIUS tournaments in tournament.service.ts). `client`
 * must be inside an open transaction; errors are logged and swallowed so the
 * raffle can never break game settlement.
 */
export async function runWeeklyDropAccrual(
  client: PoolClient,
  walletAddress: string,
  wagerChips: bigint,
  gameKey: string,
): Promise<void> {
  if (!weeklyDropWagerHook || wagerChips <= 0n) return;
  try {
    await weeklyDropWagerHook(client, walletAddress.trim().toLowerCase(), wagerChips, gameKey);
  } catch (err) {
    logger.error('Weekly Drop accrual failed (ignored)', { gameKey, error: (err as Error)?.message });
  }
}

export async function runWeeklyDropReversal(
  client: PoolClient,
  walletAddress: string,
  wagerChips: bigint,
  gameKey: string,
): Promise<void> {
  if (!weeklyDropRefundHook || wagerChips <= 0n) return;
  try {
    await weeklyDropRefundHook(client, walletAddress.trim().toLowerCase(), wagerChips, gameKey);
  } catch (err) {
    logger.error('Weekly Drop reversal failed (ignored)', { gameKey, error: (err as Error)?.message });
  }
}

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

export async function getPokerChipBalance(db: Pool | PoolClient, walletAddress: string): Promise<bigint> {
  const addr = normalizeAddr(walletAddress);
  const r = await db.query<{ balance: string }>(
    'SELECT balance::text AS balance FROM player_poker_chips WHERE wallet_address = $1',
    [addr],
  );
  if (r.rows.length === 0) return 0n;
  return BigInt(r.rows[0].balance ?? '0');
}

export interface PokerChipRef {
  type: string;
  id: string | null;
}

/**
 * Apply a signed chip delta inside an open transaction (`client` must already be in BEGIN).
 * Positive = credit, negative = debit.
 */
export async function applyPokerChipDelta(
  client: PoolClient,
  walletAddress: string,
  delta: bigint,
  reason: PokerChipLedgerReason,
  ref?: PokerChipRef,
): Promise<bigint> {
  if (delta === 0n) {
    return getPokerChipBalance(client, walletAddress);
  }
  const addr = normalizeAddr(walletAddress);
  await client.query(
    `INSERT INTO player_poker_chips (wallet_address, balance) VALUES ($1, 0)
     ON CONFLICT (wallet_address) DO NOTHING`,
    [addr],
  );
  const row = await client.query<{ balance: string }>(
    `SELECT balance::text AS balance FROM player_poker_chips WHERE wallet_address = $1 FOR UPDATE`,
    [addr],
  );
  const before = BigInt(row.rows[0]?.balance ?? '0');
  const after = before + delta;
  if (after < 0n) {
    throw new Error('Insufficient poker chips');
  }
  await client.query(
    `UPDATE player_poker_chips SET balance = $2::NUMERIC, updated_at = NOW() WHERE wallet_address = $1`,
    [addr, after.toString()],
  );
  const refId =
    ref?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref.id)
      ? ref.id
      : null;
  await client.query(
    `INSERT INTO poker_chip_ledger (wallet_address, delta, balance_after, reason, ref_type, ref_id)
     VALUES ($1, $2::NUMERIC, $3::NUMERIC, $4, $5, $6)`,
    [addr, delta.toString(), after.toString(), reason, ref?.type ?? null, refId],
  );
  // Weekly Drop raffle accrual (WEEKLY_DROP_SPEC.md): every settled wager
  // (`*_bet` debit) funds 0.25% of the pot + entry progress. Fail-safe by
  // design — the hook SAVEPOINTs its own work and errors never reach the
  // game settlement this delta belongs to.
  if (delta < 0n && reason.endsWith('_bet')) {
    await runWeeklyDropAccrual(client, addr, -delta, reason.slice(0, -'_bet'.length));
  } else if (delta < 0n && reason === 'tournament_buyin') {
    // Poker tournament buy-in — a real wager, but its reason doesn't carry the
    // `_bet` suffix. Accrues under the shared 'tournament' game key (rate in
    // DROP_ENTRY_RATES); the matching 'tournament_refund' credit below unwinds
    // it, so unregister loops can't farm tickets.
    await runWeeklyDropAccrual(client, addr, -delta, 'tournament');
  } else if (delta > 0n && reason.endsWith('_refund')) {
    // Bet / buy-in returned (blackjack_refund, arcade_craps_refund,
    // tournament_refund) — un-accrue what the original debit accrued so
    // refunds are raffle-neutral. Game key must mirror the accrual key.
    if (reason === 'tournament_refund') {
      // Freeroll guarantee returns reuse 'tournament_refund' but their debit
      // was 'tournament_create_guarantee', which never accrued — only unwind
      // when this wallet actually paid a chip buy-in for this tournament.
      // Fail-safe: a lookup error just skips the reversal, never settlement.
      try {
        const boughtIn = refId
          ? await client.query(
              `SELECT 1 FROM poker_chip_ledger
               WHERE wallet_address = $1 AND reason = 'tournament_buyin' AND ref_id = $2
               LIMIT 1`,
              [addr, refId],
            )
          : null;
        if (boughtIn && boughtIn.rows.length > 0) {
          await runWeeklyDropReversal(client, addr, delta, 'tournament');
        }
      } catch (err) {
        logger.error('Weekly Drop tournament reversal lookup failed (ignored)', {
          error: (err as Error)?.message,
        });
      }
    } else {
      await runWeeklyDropReversal(client, addr, delta, reason.slice(0, -'_refund'.length));
    }
  }
  logger.debug('Poker chip delta', { wallet: addr, delta: delta.toString(), after: after.toString(), reason });
  return after;
}

/**
 * Ensure the player's poker-chip wallet holds at least `requiredChips`, auto-topping-up any
 * shortfall straight from their general MORBIUS `players.balance`. This removes the separate
 * "buy chips first" step: a cash join / re-up converts MORBIUS → chips on demand.
 *
 * Must run inside the caller's open transaction (`client` already in BEGIN) so the top-up and
 * the subsequent buy-in debit commit atomically. Existing chips are spent first; only the
 * shortfall is pulled from MORBIUS. No-op (and no ledger row) when the wallet already covers it.
 *
 * Throws 'Insufficient MORBIUS balance' if the player cannot cover the shortfall.
 */
export async function ensurePokerChips(
  client: PoolClient,
  walletAddress: string,
  requiredChips: bigint,
  reason: PokerChipLedgerReason,
  ref?: PokerChipRef,
): Promise<void> {
  if (requiredChips <= 0n) return;
  const addr = normalizeAddr(walletAddress);
  // Lock the chip row (creating it if missing) so the read → top-up decision is race-safe.
  await client.query(
    `INSERT INTO player_poker_chips (wallet_address, balance) VALUES ($1, 0)
     ON CONFLICT (wallet_address) DO NOTHING`,
    [addr],
  );
  const row = await client.query<{ balance: string }>(
    `SELECT balance::text AS balance FROM player_poker_chips WHERE wallet_address = $1 FOR UPDATE`,
    [addr],
  );
  const current = BigInt(row.rows[0]?.balance ?? '0');
  if (current >= requiredChips) return;

  const shortfallChips = requiredChips - current;
  const shortfallWei = shortfallChips * POKER_CHIP_WEI;
  // Debit the general MORBIUS balance for exactly the shortfall, guarded so it can never go negative.
  const deduct = await client.query(
    `UPDATE players SET balance = balance - $2::NUMERIC
     WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
     RETURNING balance`,
    [addr, shortfallWei.toString()],
  );
  if (deduct.rows.length === 0) {
    throw new Error('Insufficient MORBIUS balance');
  }
  // Credit the shortfall into the chip wallet (records an audit ledger row).
  await applyPokerChipDelta(client, addr, shortfallChips, reason, ref);
}
