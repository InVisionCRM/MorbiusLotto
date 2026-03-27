"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ENGINE_CHIPS_BIGINT = exports.DEFAULT_POKER_CHIP_WEI = void 0;
exports.getPokerChipWei = getPokerChipWei;
exports.getPokerRakeWallet = getPokerRakeWallet;
exports.assertCashBlindsValid = assertCashBlindsValid;
exports.assertCashChipMultiple = assertCashChipMultiple;
exports.weiToEngineChips = weiToEngineChips;
exports.engineChipsToWeiRounded = engineChipsToWeiRounded;
exports.enginePotChipsToPotWei = enginePotChipsToPotWei;
exports.totalPotChips = totalPotChips;
exports.splitBigIntEqually = splitBigIntEqually;
const logger_1 = require("../utils/logger");
/** Default: 0.001 MORBIUS per engine chip (10^15 wei when MORBIUS uses 18 decimals). */
exports.DEFAULT_POKER_CHIP_WEI = 10n ** 15n;
function getPokerChipWei() {
    const raw = process.env.POKER_CHIP_WEI?.trim();
    if (!raw)
        return exports.DEFAULT_POKER_CHIP_WEI;
    try {
        const v = BigInt(raw);
        if (v <= 0n)
            return exports.DEFAULT_POKER_CHIP_WEI;
        return v;
    }
    catch {
        logger_1.logger.warn('Invalid POKER_CHIP_WEI env, using default');
        return exports.DEFAULT_POKER_CHIP_WEI;
    }
}
const DEFAULT_RAKE_WALLET = '0x2D6f6a61cFDc7C7d000C9279bD7a743D277736bB'.toLowerCase();
function getPokerRakeWallet() {
    const raw = process.env.POKER_RAKE_WALLET?.trim();
    if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
        return DEFAULT_RAKE_WALLET;
    }
    return raw.toLowerCase();
}
exports.MAX_ENGINE_CHIPS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
function assertCashBlindsValid(smallBlindWei, bigBlindWei) {
    const cw = getPokerChipWei();
    if (smallBlindWei <= 0n || bigBlindWei <= 0n)
        throw new Error('Blinds must be positive');
    if (smallBlindWei % cw !== 0n || bigBlindWei % cw !== 0n) {
        throw new Error(`Blinds must be multiples of poker chip size (${cw.toString()} wei). Run migration 083 or update poker_tables.`);
    }
    if (bigBlindWei < smallBlindWei)
        throw new Error('bigBlind must be >= smallBlind');
}
function assertCashChipMultiple(amountWei, label) {
    const cw = getPokerChipWei();
    if (amountWei <= 0n)
        throw new Error(`${label} must be positive`);
    if (amountWei % cw !== 0n) {
        throw new Error(`${label} must be a multiple of one poker chip (${cw.toString()} wei)`);
    }
    if (amountWei / cw > exports.MAX_ENGINE_CHIPS_BIGINT)
        throw new Error(`${label} too large for poker engine`);
}
function weiToEngineChips(amountWei) {
    assertCashChipMultiple(amountWei, 'Amount');
    const cw = getPokerChipWei();
    const chips = amountWei / cw;
    return Number(chips);
}
function engineChipsToWeiRounded(chips) {
    if (!Number.isFinite(chips) || chips <= 0)
        return 0n;
    const rounded = Math.round(chips);
    if (BigInt(rounded) > exports.MAX_ENGINE_CHIPS_BIGINT)
        throw new Error('Stack overflow in poker engine');
    return BigInt(rounded) * getPokerChipWei();
}
function enginePotChipsToPotWei(totalChipsFloat, chipWei) {
    if (!Number.isFinite(totalChipsFloat) || totalChipsFloat <= 0)
        return 0n;
    const chips = BigInt(Math.max(0, Math.round(totalChipsFloat)));
    return chips * chipWei;
}
function totalPotChips(table) {
    const potSum = table.pots.reduce((sum, p) => sum + p.amount, 0);
    const betSum = table.players.reduce((sum, p) => sum + (p?.bet ?? 0), 0);
    return potSum + betSum;
}
function splitBigIntEqually(total, n) {
    if (n <= 0)
        return [];
    const bn = BigInt(n);
    const base = total / bn;
    let rem = total % bn;
    const arr = [];
    for (let i = 0; i < n; i++) {
        arr.push(base + (rem > 0n ? 1n : 0n));
        if (rem > 0n)
            rem -= 1n;
    }
    return arr;
}
//# sourceMappingURL=poker-chip-scale.js.map