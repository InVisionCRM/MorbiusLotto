"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentPrizeEscrowV2Abi = void 0;
/**
 * ABI for the deployed escrow contract at TOURNAMENT_PRIZE_ESCROW_ADDRESS.
 *
 * Filename retained for compatibility with existing imports — actually the V4 contract
 * (TournamentPrizeEscrowV4.sol). Differences vs the legacy V2 layout:
 *   - getPool returns 6 fields (no `active`); derive `active = !cancelled && remaining > 0`
 *   - payoutMultiple takes uint256[] amounts (raw wei), NOT percentages
 *   - setUnclaimedShares + claim + unclaimedOf added for the pull-backup path
 */
exports.tournamentPrizeEscrowV2Abi = [
    // Funding
    {
        inputs: [
            { name: 'tournamentId', type: 'bytes32' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'depositPrizePool',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Push payouts
    {
        inputs: [
            { name: 'tournamentId', type: 'bytes32' },
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
            { name: 'tournamentId', type: 'bytes32' },
            { name: 'winners', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
        ],
        name: 'payoutMultiple',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Pull payouts (backup path)
    {
        inputs: [
            { name: 'tournamentId', type: 'bytes32' },
            { name: 'winners', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
        ],
        name: 'setUnclaimedShares',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'claim',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tournamentId', type: 'bytes32' },
            { name: 'winner', type: 'address' },
        ],
        name: 'unclaimedOf',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    // Cancel + reclaim
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
        inputs: [
            { name: 'tournamentId', type: 'bytes32' },
            { name: 'to', type: 'address' },
        ],
        name: 'payoutRemainderTo',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Admin
    {
        inputs: [],
        name: 'authorizedServer',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'owner',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_authorizedServer', type: 'address' }],
        name: 'setAuthorizedServer',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Reads — getPool returns 6 fields (no `active`)
    {
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
        inputs: [{ name: 'tournamentId', type: 'bytes32' }],
        name: 'getRemainingBalance',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getTournamentCount',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getAllTournamentIds',
        outputs: [{ type: 'bytes32[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'token', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
            { indexed: true, name: 'depositor', type: 'address' },
        ],
        name: 'PrizePoolDeposited',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'winner', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
        ],
        name: 'Payout',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'winner', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
        ],
        name: 'ClaimableSet',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'winner', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
        ],
        name: 'Claimed',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'depositor', type: 'address' },
        ],
        name: 'TournamentCancelled',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'creator', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
        ],
        name: 'CreatorReclaimed',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'tournamentId', type: 'bytes32' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
        ],
        name: 'RemainderReclaimed',
        type: 'event',
    },
];
//# sourceMappingURL=tournament-prize-escrow-v2.js.map