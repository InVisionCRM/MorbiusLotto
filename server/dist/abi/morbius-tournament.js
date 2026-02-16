"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.morbiusTournamentAbi = void 0;
exports.morbiusTournamentAbi = [
    {
        inputs: [{ name: 'tournamentId', type: 'uint256' }],
        name: 'setCompleted',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'buyInAmount', type: 'uint256' },
            { name: 'maxPlayers', type: 'uint256' },
            { name: 'prizeToken', type: 'address' },
            { name: 'prizeAmount', type: 'uint256' },
        ],
        name: 'createTournament',
        outputs: [{ name: 'tournamentId', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'uint256' }],
        name: 'joinTournament',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'uint256' }],
        name: 'setActive',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'player', type: 'address' },
        ],
        name: 'hasJoined',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
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
        inputs: [{ name: 'tournamentId', type: 'uint256' }],
        name: 'getTournament',
        outputs: [
            { name: 'creator', type: 'address' },
            { name: 'buyInAmount', type: 'uint256' },
            { name: 'maxPlayers', type: 'uint256' },
            { name: 'prizeToken', type: 'address' },
            { name: 'prizeAmount', type: 'uint256' },
            { name: 'prizePool', type: 'uint256' },
            { name: 'entryCount', type: 'uint256' },
            { name: 'status', type: 'uint8' },
            { name: 'createdAt', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
//# sourceMappingURL=morbius-tournament.js.map