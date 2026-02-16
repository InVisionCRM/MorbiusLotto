export declare const tournamentPrizeEscrowV3Abi: readonly [{
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "depositPrizePool";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
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
        readonly type: "uint256";
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
        readonly type: "uint256";
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
}];
//# sourceMappingURL=tournament-prize-escrow-v3.d.ts.map