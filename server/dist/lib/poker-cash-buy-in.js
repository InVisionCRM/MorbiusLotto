"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POKER_CASH_MAX_BUY_IN_BB = exports.POKER_CASH_MIN_BUY_IN_BB = void 0;
exports.getCashBuyInBoundsWei = getCashBuyInBoundsWei;
/**
 * Cash-game Texas Hold'em buy-in limits (MVP).
 * Keep in sync with lib/poker-buy-in.ts (repo root).
 */
exports.POKER_CASH_MIN_BUY_IN_BB = 40;
exports.POKER_CASH_MAX_BUY_IN_BB = 100;
function getCashBuyInBoundsWei(bigBlindWei) {
    return {
        minWei: bigBlindWei * BigInt(exports.POKER_CASH_MIN_BUY_IN_BB),
        maxWei: bigBlindWei * BigInt(exports.POKER_CASH_MAX_BUY_IN_BB),
    };
}
//# sourceMappingURL=poker-cash-buy-in.js.map