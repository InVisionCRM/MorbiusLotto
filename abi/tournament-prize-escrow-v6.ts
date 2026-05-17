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
export const tournamentPrizeEscrowV6Abi = [
  // ============ Funding ============
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
  {
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'addToPrizePool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'depositPrizePoolWithPermit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'addToPrizePoolWithPermit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ============ Push payouts ============
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

  // ============ Pull payouts ============
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

  // ============ Cancel + reclaim ============
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

  // ============ Admin ============
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

  // ============ Reads (V5-compatible shape) ============
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

  // ============ Events (identical topics to V5) ============
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
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: true, name: 'contributor', type: 'address' },
    ],
    name: 'PrizePoolAdded',
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
] as const;
