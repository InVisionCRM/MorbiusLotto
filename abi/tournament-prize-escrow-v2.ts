export const tournamentPrizeEscrowV2Abi = [
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
      { name: 'winner', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'payout',
    outputs: [],
    stateMutability: 'nonpayable',
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
    // The deployed contract at TOURNAMENT_PRIZE_ESCROW_ADDRESS returns 6 fields, NOT 7.
    // It is a bytes32-keyed V3 layout (no `active` field). Decoding with a 7-field ABI
    // throws "Position 192 is out of bounds" and silently misreads `totalDeposited` as
    // `amountPaidOut` in V1 fallback paths — which is what the "Escrow has already paid out"
    // bug was: false positives from a bad ABI, not a real on-chain payout.
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
] as const;
