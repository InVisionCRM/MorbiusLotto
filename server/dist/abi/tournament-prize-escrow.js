"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentPrizeEscrowAbi = void 0;
exports.tournamentPrizeEscrowAbi = [
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }, { name: 'winner', type: 'address' }, { name: 'amount', type: 'uint256' }],
        name: 'payout',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'getPool',
        outputs: [
            { name: 'token', type: 'address' },
            { name: 'totalDeposited', type: 'uint256' },
            { name: 'amountPaidOut', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }, { name: 'to', type: 'address' }],
        name: 'payoutRemainderTo',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }, { name: 'to', type: 'address' }],
        name: 'reclaimUnclaimed',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];
//# sourceMappingURL=tournament-prize-escrow.js.map