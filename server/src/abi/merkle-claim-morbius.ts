export const merkleClaimMorbiusAbi = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'depositRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'epochId', type: 'uint256' },
      { internalType: 'bytes32', name: 'root', type: 'bytes32' },
      { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
    ],
    name: 'setEpochRoot',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
