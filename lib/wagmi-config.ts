import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { pulsechain } from './chains'
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'

const injectedWalletRenamed: typeof injectedWallet = (params) => ({
  ...injectedWallet(params),
  name: 'Injected',
})

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        injectedWalletRenamed,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'MORBIUS Lotto',
    projectId: 'b37311be7b32236140b8f3b965a17bfa',
  }
)

export const config = createConfig({
  connectors,
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: http(),
  },
  ssr: true,
})
