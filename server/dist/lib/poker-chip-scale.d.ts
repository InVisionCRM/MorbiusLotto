/** Default: 0.001 MORBIUS per engine chip (10^15 wei when MORBIUS uses 18 decimals). */
export declare const DEFAULT_POKER_CHIP_WEI: bigint;
export declare function getPokerChipWei(): bigint;
export declare function getPokerRakeWallet(): string;
export declare const MAX_ENGINE_CHIPS_BIGINT: bigint;
export declare function assertCashBlindsValid(smallBlindWei: bigint, bigBlindWei: bigint): void;
export declare function assertCashChipMultiple(amountWei: bigint, label: string): void;
export declare function weiToEngineChips(amountWei: bigint): number;
export declare function engineChipsToWeiRounded(chips: number): bigint;
export declare function enginePotChipsToPotWei(totalChipsFloat: number, chipWei: bigint): bigint;
export declare function totalPotChips(table: {
    pots: {
        amount: number;
    }[];
    players: ({
        bet?: number;
    } | null)[];
}): number;
export declare function splitBigIntEqually(total: bigint, n: number): bigint[];
//# sourceMappingURL=poker-chip-scale.d.ts.map