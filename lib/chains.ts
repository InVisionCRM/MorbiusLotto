import { defineChain } from 'viem'

export const pulsechain = defineChain({
  id: 369,
  name: 'PulseChain',
  nativeCurrency: {
    name: 'Pulse',
    symbol: 'PLS',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.pulsechain.com',
        'https://pulsechain-rpc.publicnode.com', // Fallback RPC
      ],
    },
    public: {
      http: [
        'https://rpc.pulsechain.com',
        'https://pulsechain-rpc.publicnode.com', // Fallback RPC
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'PulseScan',
      url: 'https://scan.pulsechain.box',
    },
  },
  contracts: {
    ensRegistry: undefined,
    ensUniversalResolver: undefined,
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 14353601,
    },
  },
})
