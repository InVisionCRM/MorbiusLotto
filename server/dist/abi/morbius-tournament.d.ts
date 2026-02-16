export declare const morbiusTournamentAbi: readonly [{
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
    }];
    readonly name: "setCompleted";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "buyInAmount";
        readonly type: "uint256";
    }, {
        readonly name: "maxPlayers";
        readonly type: "uint256";
    }, {
        readonly name: "prizeToken";
        readonly type: "address";
    }, {
        readonly name: "prizeAmount";
        readonly type: "uint256";
    }];
    readonly name: "createTournament";
    readonly outputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
    }];
    readonly name: "joinTournament";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "uint256";
    }];
    readonly name: "getTournament";
    readonly outputs: readonly [{
        readonly name: "creator";
        readonly type: "address";
    }, {
        readonly name: "buyInAmount";
        readonly type: "uint256";
    }, {
        readonly name: "maxPlayers";
        readonly type: "uint256";
    }, {
        readonly name: "prizeToken";
        readonly type: "address";
    }, {
        readonly name: "prizeAmount";
        readonly type: "uint256";
    }, {
        readonly name: "prizePool";
        readonly type: "uint256";
    }, {
        readonly name: "entryCount";
        readonly type: "uint256";
    }, {
        readonly name: "status";
        readonly type: "uint8";
    }, {
        readonly name: "createdAt";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}];
//# sourceMappingURL=morbius-tournament.d.ts.map