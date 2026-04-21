/**
 * Cash-game Texas Hold'em buy-in limits (MVP).
 * Keep in sync with server/src/lib/poker-cash-buy-in.ts
 */
export const POKER_CASH_MIN_BUY_IN_BB = 40;
export const POKER_CASH_MAX_BUY_IN_BB = 100;

/** 1 chip = 1 MORBIUS = 10^18 wei. Mirrors server/src/lib/poker-chip-scale.ts. */
export const POKER_CHIP_WEI = 10n ** 18n;

/**
 * @deprecated Server now stores blinds as chip integers; use `getCashBuyInBoundsWeiFromChips` instead.
 * Kept for callers that still pass pre-migration wei values.
 */
export function getCashBuyInBoundsWei(bigBlindWei: bigint): { minWei: bigint; maxWei: bigint } {
  return {
    minWei: bigBlindWei * BigInt(POKER_CASH_MIN_BUY_IN_BB),
    maxWei: bigBlindWei * BigInt(POKER_CASH_MAX_BUY_IN_BB),
  };
}

/** Bounds computed from a chip-count big blind (what the server returns post-migration 097). */
export function getCashBuyInBoundsWeiFromChips(bigBlindChips: bigint): { minWei: bigint; maxWei: bigint } {
  const bbWei = bigBlindChips * POKER_CHIP_WEI;
  return {
    minWei: bbWei * BigInt(POKER_CASH_MIN_BUY_IN_BB),
    maxWei: bbWei * BigInt(POKER_CASH_MAX_BUY_IN_BB),
  };
}
