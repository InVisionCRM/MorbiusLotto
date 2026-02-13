export const tournamentPrizeEscrowAbi = [
  {
    inputs: [{ name: '_authorizedServer', type: 'address' }],
    name: 'setAuthorizedServer',
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
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'to', type: 'address' },
    ],
    name: 'payoutRemainderTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'to', type: 'address' },
    ],
    name: 'reclaimUnclaimed',
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
] as const
