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
        'https://rpc-pulsechain.g4mm4.io', // g4mm4 ("gamma") — primary
        'https://rpc.pulsechainstats.com', // backup (rpc.pulsechain.com dropped — unreliable)
      ],
    },
    public: {
      http: [
        'https://rpc-pulsechain.g4mm4.io', // g4mm4 ("gamma") — primary
        'https://rpc.pulsechainstats.com', // backup (rpc.pulsechain.com dropped — unreliable)
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'PulseScan',
      url: 'https://scan.pulsechain.com',
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
