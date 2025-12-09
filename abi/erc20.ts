// Minimal ERC20 ABI used for balance/allowance/approve/transfer
export const ERC20_ABI = [
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'string', name: '' }],
    name: 'name',
    inputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'string', name: '' }],
    name: 'symbol',
    inputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'uint8', name: '' }],
    name: 'decimals',
    inputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'uint256', name: '' }],
    name: 'totalSupply',
    inputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'uint256', name: '' }],
    name: 'balanceOf',
    inputs: [{ type: 'address', name: 'account' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    outputs: [{ type: 'uint256', name: '' }],
    name: 'allowance',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'spender' },
    ],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    outputs: [{ type: 'bool', name: '' }],
    name: 'approve',
    inputs: [
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'amount' },
    ],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    outputs: [{ type: 'bool', name: '' }],
    name: 'transfer',
    inputs: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'amount' },
    ],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    outputs: [{ type: 'bool', name: '' }],
    name: 'transferFrom',
    inputs: [
      { type: 'address', name: 'from' },
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'amount' },
    ],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { type: 'address', name: 'from', indexed: true },
      { type: 'address', name: 'to', indexed: true },
      { type: 'uint256', name: 'value', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { type: 'address', name: 'owner', indexed: true },
      { type: 'address', name: 'spender', indexed: true },
      { type: 'uint256', name: 'value', indexed: false },
    ],
    anonymous: false,
  },
] as const;



