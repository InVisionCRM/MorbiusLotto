"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentPrizeEscrowV3Abi = void 0;
exports.tournamentPrizeEscrowV3Abi = [
    {
        inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'depositPrizePool',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'winner', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'payout',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'to', type: 'address' },
        ],
        name: 'payoutRemainderTo',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'uint256' }],
        name: 'getPool',
        outputs: [
            { name: 'token', type: 'address' },
            { name: 'depositor', type: 'address' },
            { name: 'totalDeposited', type: 'uint256' },
            { name: 'amountPaidOut', type: 'uint256' },
            { name: 'depositedAt', type: 'uint256' },
            { name: 'cancelled', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
//# sourceMappingURL=tournament-prize-escrow-v3.js.map