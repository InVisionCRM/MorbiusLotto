/**
 * Cash-game Texas Hold'em buy-in limits (MVP).
 * Keep in sync with server/src/lib/poker-cash-buy-in.ts
 */
export const POKER_CASH_MIN_BUY_IN_BB = 40;
export const POKER_CASH_MAX_BUY_IN_BB = 100;

export function getCashBuyInBoundsWei(bigBlindWei: bigint): { minWei: bigint; maxWei: bigint } {
  return {
    minWei: bigBlindWei * BigInt(POKER_CASH_MIN_BUY_IN_BB),
    maxWei: bigBlindWei * BigInt(POKER_CASH_MAX_BUY_IN_BB),
  };
}
