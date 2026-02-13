export declare const tournamentPrizeEscrowAbi: readonly [{
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
        readonly name: "totalDeposited";
        readonly type: "uint256";
    }, {
        readonly name: "amountPaidOut";
        readonly type: "uint256";
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
}];
//# sourceMappingURL=tournament-prize-escrow.d.ts.map