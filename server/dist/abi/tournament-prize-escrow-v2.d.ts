export declare const tournamentPrizeEscrowV2Abi: readonly [{
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "winner";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "payout";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }];
    readonly name: "getPool";
    readonly outputs: readonly [{
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "depositor";
        readonly type: "address";
    }, {
        readonly name: "totalDeposited";
        readonly type: "uint256";
    }, {
        readonly name: "amountPaidOut";
        readonly type: "uint256";
    }, {
        readonly name: "depositedAt";
        readonly type: "uint256";
    }, {
        readonly name: "cancelled";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "to";
        readonly type: "address";
    }];
    readonly name: "payoutRemainderTo";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "to";
        readonly type: "address";
    }];
    readonly name: "reclaimUnclaimed";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }];
    readonly name: "cancelTournament";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }];
    readonly name: "creatorReclaim";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }];
    readonly name: "getRemainingBalance";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "getTournamentCount";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "index";
        readonly type: "uint256";
    }];
    readonly name: "getTournamentId";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "getAllTournamentIds";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32[]";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentIds_";
        readonly type: "bytes32[]";
    }];
    readonly name: "getPoolsBatch";
    readonly outputs: readonly [{
        readonly name: "tokens";
        readonly type: "address[]";
    }, {
        readonly name: "depositors";
        readonly type: "address[]";
    }, {
        readonly name: "totalDepositeds";
        readonly type: "uint256[]";
    }, {
        readonly name: "amountPaidOuts";
        readonly type: "uint256[]";
    }, {
        readonly name: "depositedAts";
        readonly type: "uint256[]";
    }, {
        readonly name: "cancelleds";
        readonly type: "bool[]";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "getActivePools";
    readonly outputs: readonly [{
        readonly name: "activeIds";
        readonly type: "bytes32[]";
    }, {
        readonly name: "balances";
        readonly type: "uint256[]";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "depositor";
        readonly type: "address";
    }];
    readonly name: "getPoolsByDepositor";
    readonly outputs: readonly [{
        readonly name: "ids";
        readonly type: "bytes32[]";
    }, {
        readonly name: "tokens";
        readonly type: "address[]";
    }, {
        readonly name: "totalDepositeds";
        readonly type: "uint256[]";
    }, {
        readonly name: "amountPaidOuts";
        readonly type: "uint256[]";
    }, {
        readonly name: "depositedAts";
        readonly type: "uint256[]";
    }, {
        readonly name: "cancelleds";
        readonly type: "bool[]";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
    }];
    readonly name: "getTotalValueLocked";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "getEscrowSummary";
    readonly outputs: readonly [{
        readonly name: "totalTournaments";
        readonly type: "uint256";
    }, {
        readonly name: "activeTournaments";
        readonly type: "uint256";
    }, {
        readonly name: "cancelledTournaments";
        readonly type: "uint256";
    }, {
        readonly name: "totalValueLocked";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
//# sourceMappingURL=tournament-prize-escrow-v2.d.ts.map