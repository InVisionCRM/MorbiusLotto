/**
 * Unified poker-chip scale.
 *
 * The poker engine and all `poker_*` tables (stacks, blinds, pots, bets, rake)
 * store raw chip integers. MORBIUS (wei) only appears at named boundary points:
 *   - Cash join buy-in (wei debited from balance → chips on seat)
 *   - Cash leave / re-up / rake credit (chips → wei to balance)
 *   - Tournament buy-in / prize payout (wei; chips stay virtual in-tournament)
 *
 * One chip = 10^18 wei (1 MORBIUS). Hardcoded — do not make configurable.
 */
/** 10^18 wei per chip (1 chip = 1 MORBIUS). */
export declare const POKER_CHIP_WEI: bigint;
/** Chip values feed directly into the chevtek engine, which uses JS `number`. */
export declare const MAX_ENGINE_CHIPS_BIGINT: bigint;
export declare function getPokerRakeWallet(): string;
/** Convert MORBIUS wei to chips. Throws if not a whole number of chips. */
export declare function weiToChips(amountWei: bigint, label?: string): number;
/** Convert chip count back to MORBIUS wei. */
export declare function chipsToWei(chips: number): bigint;
/** Total chips across a chevtek Table's pots + live bets. */
export declare function totalPotChips(table: {
    pots: {
        amount: number;
    }[];
    players: ({
        bet?: number;
    } | null)[];
}): number;
/** Split a bigint `total` into `n` near-equal parts (remainder goes to first recipients). */
export declare function splitBigIntEqually(total: bigint, n: number): bigint[];
//# sourceMappingURL=poker-chip-scale.d.ts.map