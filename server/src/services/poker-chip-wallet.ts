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
  | 'arcade_greed_dice_bet'
  | 'arcade_greed_dice_payout'
  | 'arcade_cipher_bet'
  | 'arcade_cipher_payout'
  | 'keno_bet'
  | 'keno_payout'
  | 'plinko_bet'
  | 'plinko_payout'
  | 'blackjack_bet'        // single + multiplayer blackjack wager
  | 'blackjack_payout'     // blackjack win / push credit
  | 'blackjack_refund'     // blackjack bet returned (cancel / leave / AFK kick)
  | 'blackjack_tip'        // MP blackjack: tip routed to dealer/deployer
  | 'deposit'              // on-chain MORBIUS deposit auto-converted to chips
  | 'withdrawal'           // chips auto-converted back to on-chain MORBIUS
  | 'migration'            // one-time players.balance (wei) → chip ledger move
  | 'holder_reward'     // MORBIUS holder epoch credit (1.25% slice → chips)
  | 'lp_holder_reward'  // LP holder epoch credit (1.5% slice → chips)
  | 'vip_rakeback'      // VIP loyalty: % of wager turnover returned since last claim
  | 'vip_tier_bonus'    // VIP loyalty: one-time chip bonus on reaching a new tier
  | 'vip_weekly_bonus'  // VIP loyalty: weekly cashback on rolling 7-day wager
  | 'vip_monthly_bonus'; // VIP loyalty: monthly cashback on rolling 30-day wager

const DEFAULT_PLATFORM_FEE_WALLET = '0x41682815b05fe6b54a6c0f8813bb99423ee0309d';

export function getPlatformFeeWalletLower(): string {
  const raw = process.env.PLATFORM_FEE_WALLET?.trim();
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
  return DEFAULT_PLATFORM_FEE_WALLET;
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
