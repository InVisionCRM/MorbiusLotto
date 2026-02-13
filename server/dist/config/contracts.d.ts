export declare const MORBIUS_TOKEN_ADDRESS: `0x${string}`;
export declare const PLINKO_ADDRESS: `0x${string}`;
export declare const KENO_ADDRESS: `0x${string}`;
export declare const LOTTERY_ADDRESS: `0x${string}`;
export declare const BIGWHEEL_ADDRESS: `0x${string}`;
/** Blackjack V2; use BLACKJACK_CONTRACT_ADDRESS in .env if different. */
export declare const BLACKJACK_ADDRESS: `0x${string}`;
/** Full Plinko ABI from contracts/abi/plinko.json. */
export declare const PLINKO_GET_GLOBAL_STATS_ABI: readonly unknown[];
/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
export declare const KENO_GET_GLOBAL_STATS_ABI: readonly unknown[];
/** Full Lottery 6-of-55 V2 ABI from contracts/abi/lottery6of55-v2.json. */
export declare const LOTTERY_STATS_ABI: readonly unknown[];
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