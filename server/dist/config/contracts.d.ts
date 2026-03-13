export declare const MORBIUS_TOKEN_ADDRESS: `0x${string}`;
export declare const PLINKO_ADDRESS: `0x${string}`;
export declare const KENO_ADDRESS: `0x${string}`;
/** Instant Lottery 6-of-55 (house bankroll). When set, analytics use this for lottery stats. */
export declare const LOTTERY_INSTANT_ADDRESS: `0x${string}`;
export declare const BIGWHEEL_ADDRESS: `0x${string}`;
/** Blackjack V2. Set BLACKJACK_ADDRESS in .env (BLACKJACK_CONTRACT_ADDRESS also accepted). */
export declare const BLACKJACK_ADDRESS: `0x${string}`;
/** Legacy Blackjack contracts (for admin health). Accept BLACKJACK_LEGACY_CONTRACT_ADDRESS* or NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS*. */
export declare const BLACKJACK_LEGACY_ADDRESS: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_2: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_3: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_4: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_5: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_6: `0x${string}`;
export declare const BLACKJACK_LEGACY_ADDRESS_7: `0x${string}`;
/** All Blackjack contracts to show in admin health: current first, then legacy 1–6 (only those set). */
export declare function getAllBlackjackContracts(): Array<{
    address: `0x${string}`;
    label: string;
}>;
/** Full Plinko ABI from contracts/abi/plinko.json. */
export declare const PLINKO_GET_GLOBAL_STATS_ABI: readonly unknown[];
/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
export declare const KENO_GET_GLOBAL_STATS_ABI: readonly unknown[];
/** Minimal ABI: getContractReserve() -> uint256 */
export declare const KENO_GET_CONTRACT_RESERVE_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "getContractReserve";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
/** Full Lottery 6-of-55 V2 ABI from contracts/abi/lottery6of55-v2.json. */
export declare const LOTTERY_STATS_ABI: readonly unknown[];
/** Instant Lottery 6-of-55 ABI (totalPlays, totalWagered, totalPayouts). */
export declare const INSTANT_LOTTERY_STATS_ABI: readonly unknown[];
/** Minimal Blackjack stats ABI for snapshot reads (fee totals, off-chain payouts, reserves). */
export declare const BLACKJACK_STATS_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "totalBurnFeesCollected";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalDistributionFeesCollected";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalLpDistributionFeesCollected";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalPlatformFeesCollected";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalOffChainPayouts";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalReserves";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
/** Minimal ABI: getGlobalStats() -> (spins, volume, payouts, contractBalance, contractReserveBalance) */
export declare const BIGWHEEL_GET_GLOBAL_STATS_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "getGlobalStats";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "spins";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "volume";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "payouts";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "contractBalance";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "contractReserveBalance";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
//# sourceMappingURL=contracts.d.ts.map