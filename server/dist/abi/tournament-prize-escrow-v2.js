"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentPrizeEscrowV2Abi = void 0;
exports.tournamentPrizeEscrowV2Abi = [
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }, { name: 'winner', type: 'address' }, { name: 'amount', type: 'uint256' }],
        name: 'payout',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        // The deployed contract returns 6 fields (no `active`). A phantom 7th field
        // makes viem fail decode and silently fall through to a V1 ABI elsewhere
        // that mis-aligns `totalDeposited` into `amountPaidOut`. See escrow-status.ts.
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
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
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'cancelTournament',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'creatorReclaim',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'getRemainingBalance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getTournamentCount',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'index', type: 'uint256' }],
        name: 'getTournamentId',
        outputs: [{ name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getAllTournamentIds',
        outputs: [{ name: '', type: 'bytes32[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentIds_', type: 'bytes32[]' }],
        name: 'getPoolsBatch',
        outputs: [
            { name: 'tokens', type: 'address[]' },
            { name: 'depositors', type: 'address[]' },
            { name: 'totalDepositeds', type: 'uint256[]' },
            { name: 'amountPaidOuts', type: 'uint256[]' },
            { name: 'depositedAts', type: 'uint256[]' },
            { name: 'cancelleds', type: 'bool[]' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getActivePools',
        outputs: [
            { name: 'activeIds', type: 'bytes32[]' },
            { name: 'balances', type: 'uint256[]' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'depositor', type: 'address' }],
        name: 'getPoolsByDepositor',
        outputs: [
            { name: 'ids', type: 'bytes32[]' },
            { name: 'tokens', type: 'address[]' },
            { name: 'totalDepositeds', type: 'uint256[]' },
            { name: 'amountPaidOuts', type: 'uint256[]' },
            { name: 'depositedAts', type: 'uint256[]' },
            { name: 'cancelleds', type: 'bool[]' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'token', type: 'address' }],
        name: 'getTotalValueLocked',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getEscrowSummary',
        outputs: [
            { name: 'totalTournaments', type: 'uint256' },
            { name: 'activeTournaments', type: 'uint256' },
            { name: 'cancelledTournaments', type: 'uint256' },
            { name: 'totalValueLocked', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
//# sourceMappingURL=tournament-prize-escrow-v2.js.map