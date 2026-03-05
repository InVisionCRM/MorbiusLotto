export const merkleClaimLpAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'address', name: '', type: 'address' },
    ],
    name: 'hasClaimed',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'contractBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
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
  {
    inputs: [{ internalType: 'uint256', name: 'epochId', type: 'uint256' }],
    name: 'revokeEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
