/**
 * Blackjack win-streak chain (owner spec 2026-08-19).
 *
 * Solo blackjack keeps one consecutive-win counter per wallet
 * (blackjack_win_streaks). Every settled REAL-MONEY hand folds in exactly
 * once, from the game's overall result:
 *   - win (incl. natural blackjack) → streak + 1. From the 2nd straight win
 *     the chain pays an instant bonus on top of the normal payout:
 *       2 wins → 5%, 3 → 7%, 4 → 15%, 5 → 25%, 6 → 37%, 7+ → 50%
 *     of the hand's total main bet (Perfect Pairs excluded), floored to whole
 *     chips. Ledger reason 'blackjack_streak_bonus' — deliberately NOT a
 *     `*_payout`/`*_bet` suffix, so the gift neither offsets VIP net-loss
 *     rakeback nor inflates wager turnover.
 *   - loss → streak resets to 0. No clawback of past bonuses.
 *   - push → untouched (neutral).
 *
 * Each bonus also grants the SAME amount as VIP tier-progress credit
 * (vip_wager_credits, folded into lifetime wager by VipService) — chains push
 * players toward the next VIP tier faster without fabricating ledger bets.
 *
 * Tournament hands never reach this module: both callers guard on
 * game.total_bet_amount > 0n, and tournament games store 0 there.
 *
 * Everything (streak upsert + chip credit + VIP credit) commits in ONE
 * transaction so a crash can't pay a bonus without advancing the streak or
 * vice versa. Callers treat failures as non-fatal (the hand itself is already
 * settled) — same posture as the wheel/milestone hooks.
 */

import type { Pool } from 'pg';
import { applyPokerChipDelta } from './poker-chip-wallet';
import { POKER_CHIP_WEI } from '../lib/poker-chip-scale';

/** Chain ladder: consecutive wins → bonus % of the hand's total main bet. */
export const STREAK_BONUS_LADDER: ReadonlyArray<{ wins: number; pct: number }> = [
  { wins: 2, pct: 5 },
  { wins: 3, pct: 7 },
  { wins: 4, pct: 15 },
  { wins: 5, pct: 25 },
  { wins: 6, pct: 37 },
  { wins: 7, pct: 50 }, // 7 and up
];

export function streakBonusPct(streak: number): number {
  if (streak < 2) return 0;
  const capped = Math.min(streak, STREAK_BONUS_LADDER[STREAK_BONUS_LADDER.length - 1].wins);
  return STREAK_BONUS_LADDER.find((r) => r.wins === capped)?.pct ?? 0;
}

export interface StreakSettleResult {
  /** Consecutive-win count AFTER this hand. */
  streak: number;
  /** Bonus paid for this hand, whole chips (0 when streak < 2 or not a win). */
  bonusChips: bigint;
  /** Ladder % the bonus was computed at (0 when no bonus). */
  bonusPct: number;
}

function normalizeAddr(addr: string): string {
  const a = addr.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

/** Read a wallet's current streak without touching it (page-load hydration). */
export async function getBlackjackStreak(pool: Pool, walletAddress: string): Promise<number> {
  const addr = normalizeAddr(walletAddress);
  const { rows } = await pool.query<{ streak: number }>(
    'SELECT streak FROM blackjack_win_streaks WHERE wallet_address = $1',
    [addr],
  );
  return rows[0]?.streak ?? 0;
}

/**
 * Fold one settled real-money hand into the wallet's chain. Returns the new
 * streak and any bonus paid so the game service can surface both to the felt.
 */
export async function settleBlackjackStreak(
  pool: Pool,
  walletAddress: string,
  result: 'win' | 'loss' | 'push',
  totalBetWei: bigint,
  gameId: string,
): Promise<StreakSettleResult> {
  const addr = normalizeAddr(walletAddress);

  if (result === 'push') {
    return { streak: await getBlackjackStreak(pool, addr), bonusChips: 0n, bonusPct: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ streak: number }>(
      result === 'win'
        ? `INSERT INTO blackjack_win_streaks (wallet_address, streak) VALUES ($1, 1)
           ON CONFLICT (wallet_address)
           DO UPDATE SET streak = blackjack_win_streaks.streak + 1, updated_at = NOW()
           RETURNING streak`
        : `INSERT INTO blackjack_win_streaks (wallet_address, streak) VALUES ($1, 0)
           ON CONFLICT (wallet_address)
           DO UPDATE SET streak = 0, updated_at = NOW()
           RETURNING streak`,
      [addr],
    );
    const streak = rows[0].streak;

    let bonusChips = 0n;
    let bonusPct = 0;
    if (result === 'win') {
      bonusPct = streakBonusPct(streak);
      if (bonusPct > 0) {
        const betChips = totalBetWei / POKER_CHIP_WEI; // bets are whole MORBIUS
        bonusChips = (betChips * BigInt(bonusPct)) / 100n; // floor to whole chips
        if (bonusChips > 0n) {
          await applyPokerChipDelta(client, addr, bonusChips, 'blackjack_streak_bonus', {
            type: 'blackjack_game',
            id: gameId,
          });
          // Same amount again as VIP tier-progress credit (owner decision 2026-08-19).
          await client.query(
            `INSERT INTO vip_wager_credits (wallet_address, chips, reason, ref_type, ref_id)
             VALUES ($1, $2::NUMERIC, 'blackjack_streak', 'blackjack_game', $3)`,
            [addr, bonusChips.toString(), gameId],
          );
        } else {
          bonusPct = 0; // sub-chip bonus floors to nothing — report it that way
        }
      }
    }

    await client.query('COMMIT');
    return { streak, bonusChips, bonusPct };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
