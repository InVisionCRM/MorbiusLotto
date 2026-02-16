export const tournamentPrizeEscrowV2Abi = [
  {
    inputs: [{ name: 'tournamentId', type: 'bytes32' }],
    name: 'creatorReclaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
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
] as const;
