export const merkleClaimLpAbi = [
  // ---- Constructor ----
  {
    inputs: [{ internalType: 'address', name: '_morbiusToken', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },

  // ---- Events ----
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'epochId', type: 'uint256' },
      { indexed: false, internalType: 'bytes32', name: 'root', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
    ],
    name: 'EpochCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'epochId', type: 'uint256' },
    ],
    name: 'EpochRevoked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'epochId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'claimant', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'Claimed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'TokensRescued',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: 'address', name: 'operator', type: 'address' }],
    name: 'OperatorAdded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: 'address', name: 'operator', type: 'address' }],
    name: 'OperatorRemoved',
    type: 'event',
  },

  // ---- Views ----
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'operators',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'morbiusToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'epochRoots',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'epochTotalAmount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'epochClaimedAmount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
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
    inputs: [
      { internalType: 'uint256', name: 'epochId', type: 'uint256' },
      { internalType: 'address', name: 'claimant', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'bytes32[]', name: 'proof', type: 'bytes32[]' },
    ],
    name: 'verifyProof',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'epochId', type: 'uint256' }],
    name: 'epochUnclaimedAmount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
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
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },

  // ---- Writes ----
  {
    inputs: [{ internalType: 'address', name: 'operator', type: 'address' }],
    name: 'addOperator',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'operator', type: 'address' }],
    name: 'removeOperator',
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
    inputs: [
      { internalType: 'uint256', name: 'epochId', type: 'uint256' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'bytes32[]', name: 'proof', type: 'bytes32[]' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'rescueTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
