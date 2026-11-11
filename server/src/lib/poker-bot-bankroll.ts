/**
 * Poker bot bankroll — the ONLY way chips enter or leave a bot wallet.
 *
 * Every chip a bot holds is a liability the house minted (1 chip = 1 MORBIUS,
 * and real players can win it and withdraw it). So bot funding is never a
 * balance write: it is a ledgered transfer from an explicit house wallet
 * (`POKER_BOT_BANKROLL_WALLET`) into the bot, and winnings are swept back the
 * same way. Nightly exposure is then a ledger query:
 *
 *   SELECT SUM(-delta) FROM poker_chip_ledger
 *    WHERE reason = 'bot_bankroll_fund' AND wallet_address = <bankroll>
 *
 * Reasons deliberately do NOT end in `_bet` / `_payout` / `_refund`, so they
 * never count as wager turnover for VIP tiers or the Weekly Drop.
 *
 * Fail-fast: funding throws if the bankroll wallet is unset, is itself a bot,
 * or cannot cover the top-up ("Insufficient poker chips" from the ledger).
 */

import type { PoolClient } from 'pg';
import { applyPokerChipDelta, getPokerChipBalance, type PokerChipRef } from '../services/poker-chip-wallet';
import { isPokerBotWallet } from './poker-bot-registry';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** House wallet that funds bot buy-ins. Required env; validated and lowercased. */
export function getPokerBotBankrollWallet(): string {
  const raw = process.env.POKER_BOT_BANKROLL_WALLET?.trim();
  if (!raw || !ADDRESS_RE.test(raw)) {
    throw new Error('POKER_BOT_BANKROLL_WALLET is not set to a valid 0x address');
  }
  const addr = raw.toLowerCase();
  if (isPokerBotWallet(addr)) {
    throw new Error('POKER_BOT_BANKROLL_WALLET must not be a bot wallet');
  }
  return addr;
}

function requireBot(address: string): string {
  const addr = address.trim().toLowerCase();
  if (!isPokerBotWallet(addr)) {
    throw new Error(`Not a registered poker bot wallet: ${addr}`);
  }
  return addr;
}

export interface BotFundResult {
  /** Chips moved bankroll → bot this call (0n when already at/above target). */
  funded: bigint;
  /** Bot chip balance after the call. */
  balance: bigint;
}

/**
 * Top a bot up to exactly `targetChips` (never above). Runs inside the
 * caller's open transaction so the top-up and the buy-in it pays for commit
 * together. Two ledger rows per transfer: a debit on the bankroll wallet and
 * a credit on the bot, both `bot_bankroll_fund` with the same `ref`.
 */
export async function fundPokerBotToBalance(
  client: PoolClient,
  botAddress: string,
  targetChips: bigint,
  ref?: PokerChipRef,
): Promise<BotFundResult> {
  if (targetChips < 0n) throw new Error('targetChips must be non-negative');
  const bot = requireBot(botAddress);
  const bankroll = getPokerBotBankrollWallet();

  const current = await getPokerChipBalance(client, bot);
  if (current >= targetChips) {
    return { funded: 0n, balance: current };
  }
  const delta = targetChips - current;

  // Debit first: throws 'Insufficient poker chips' if the bankroll can't cover it.
  await applyPokerChipDelta(client, bankroll, -delta, 'bot_bankroll_fund', ref);
  const balance = await applyPokerChipDelta(client, bot, delta, 'bot_bankroll_fund', ref);
  return { funded: delta, balance };
}

/**
 * Return a bot's entire chip balance to the bankroll wallet (e.g. after a
 * tournament completes). Returns the swept amount; 0n when nothing to sweep.
 */
export async function sweepPokerBotBankroll(
  client: PoolClient,
  botAddress: string,
  ref?: PokerChipRef,
): Promise<bigint> {
  const bot = requireBot(botAddress);
  const bankroll = getPokerBotBankrollWallet();

  const balance = await getPokerChipBalance(client, bot);
  if (balance <= 0n) return 0n;

  await applyPokerChipDelta(client, bot, -balance, 'bot_bankroll_sweep', ref);
  await applyPokerChipDelta(client, bankroll, balance, 'bot_bankroll_sweep', ref);
  return balance;
}
