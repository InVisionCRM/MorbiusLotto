/**
 * Contract addresses and minimal ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel).
 * Addresses match lib/contracts.ts on PulseChain mainnet.
 */
export declare const PLINKO_ADDRESS: `0x${string}`;
export declare const KENO_ADDRESS: `0x${string}`;
export declare const LOTTERY_ADDRESS: `0x${string}`;
export declare const BIGWHEEL_ADDRESS: `0x${string}`;
/** Minimal ABI: getGlobalStats() -> (totalDrops, totalBallsSold, totalRevenue, totalPayouts, contractReserve) */
export declare const PLINKO_GET_GLOBAL_STATS_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "getGlobalStats";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "_totalDrops";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "_totalBallsSold";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "_totalRevenue";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "_totalPayouts";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "_contractReserve";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
/** Minimal ABI: getGlobalStats() -> (totalWagered, totalWon, ticketCount, activeRoundId) */
export declare const KENO_GET_GLOBAL_STATS_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "getGlobalStats";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "totalWagered";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "totalWon";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "ticketCount";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "activeRoundId";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
/** Minimal ABI: totalTicketsEver(), totalMORBIUSEverCollected(), totalMORBIUSEverClaimed() */
export declare const LOTTERY_STATS_ABI: readonly [{
    readonly inputs: readonly [];
    readonly name: "totalTicketsEver";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalMORBIUSEverCollected";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "totalMORBIUSEverClaimed";
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