/**
 * Cash-game Texas Hold'em buy-in limits (MVP).
 * Keep in sync with lib/poker-buy-in.ts (repo root).
 */
export const POKER_CASH_MIN_BUY_IN_BB = 40;
export const POKER_CASH_MAX_BUY_IN_BB = 100;

export function getCashBuyInBoundsChips(bigBlindChips: number): { minChips: number; maxChips: number } {
  return {
    minChips: bigBlindChips * POKER_CASH_MIN_BUY_IN_BB,
    maxChips: bigBlindChips * POKER_CASH_MAX_BUY_IN_BB,
  };
}
