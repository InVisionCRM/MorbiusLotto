/**
 * ABI for TournamentPrizeEscrowV6 — gas-optimized successor to V5.
 *
 * Same external API as V5 (drop-in compatible for `getPool`, `depositPrizePool`, `addToPrizePool`,
 * `payout` / `payoutMultiple`, `setUnclaimedShares` / `claim` / `unclaimedOf`,
 * `cancelTournament` / `creatorReclaim` / `payoutRemainderTo`).
 *
 * New entrypoints:
 *   - `depositPrizePoolWithPermit(tournamentId, token, amount, deadline, v, r, s)`
 *   - `addToPrizePoolWithPermit(tournamentId, token, amount, deadline, v, r, s)`
 *
 * Removed (vs V5 ABI):
 *   - `tournamentIds(uint256)` auto-getter, `getTournamentCount()`, `getAllTournamentIds()` —
 *     enumeration views were unused by the app. Use Postgres + indexed `PrizePoolDeposited` /
 *     `PrizePoolAdded` events instead.
 */
export declare const tournamentPrizeEscrowV6Abi: readonly [{
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
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
        readonly type: "bytes32";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "addToPrizePool";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "deadline";
        readonly type: "uint256";
    }, {
        readonly name: "v";
        readonly type: "uint8";
    }, {
        readonly name: "r";
        readonly type: "bytes32";
    }, {
        readonly name: "s";
        readonly type: "bytes32";
    }];
    readonly name: "depositPrizePoolWithPermit";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "deadline";
        readonly type: "uint256";
    }, {
        readonly name: "v";
        readonly type: "uint8";
    }, {
        readonly name: "r";
        readonly type: "bytes32";
    }, {
        readonly name: "s";
        readonly type: "bytes32";
    }];
    readonly name: "addToPrizePoolWithPermit";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
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
    }, {
        readonly name: "winners";
        readonly type: "address[]";
    }, {
        readonly name: "amounts";
        readonly type: "uint256[]";
    }];
    readonly name: "payoutMultiple";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "winners";
        readonly type: "address[]";
    }, {
        readonly name: "amounts";
        readonly type: "uint256[]";
    }];
    readonly name: "setUnclaimedShares";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }];
    readonly name: "claim";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly name: "winner";
        readonly type: "address";
    }];
    readonly name: "unclaimedOf";
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
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
    }, {
        readonly name: "to";
        readonly type: "address";
    }];
    readonly name: "payoutRemainderTo";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "authorizedServer";
    readonly outputs: readonly [{
        readonly type: "address";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "owner";
    readonly outputs: readonly [{
        readonly type: "address";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly name: "_authorizedServer";
        readonly type: "address";
    }];
    readonly name: "setAuthorizedServer";
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
    }];
    readonly name: "getRemainingBalance";
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly indexed: true;
        readonly name: "depositor";
        readonly type: "address";
    }];
    readonly name: "PrizePoolDeposited";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly indexed: true;
        readonly name: "contributor";
        readonly type: "address";
    }];
    readonly name: "PrizePoolAdded";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "winner";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "Payout";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "winner";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "ClaimableSet";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "winner";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "Claimed";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "depositor";
        readonly type: "address";
    }];
    readonly name: "TournamentCancelled";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "creator";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "CreatorReclaimed";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly name: "tournamentId";
        readonly type: "bytes32";
    }, {
        readonly indexed: true;
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "RemainderReclaimed";
    readonly type: "event";
}];
//# sourceMappingURL=tournament-prize-escrow-v6.d.ts.map