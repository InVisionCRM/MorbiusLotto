/**
 * Cash-game Texas Hold'em buy-in limits (MVP).
 * Keep in sync with lib/poker-buy-in.ts (repo root).
 */
export declare const POKER_CASH_MIN_BUY_IN_BB = 40;
export declare const POKER_CASH_MAX_BUY_IN_BB = 100;
export declare function getCashBuyInBoundsWei(bigBlindWei: bigint): {
    minWei: bigint;
    maxWei: bigint;
};
//# sourceMappingURL=poker-cash-buy-in.d.ts.map