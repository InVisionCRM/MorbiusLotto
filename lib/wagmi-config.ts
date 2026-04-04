import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http, fallback } from 'wagmi'
import { pulsechain } from './chains'
import {
  coinbaseWallet,
  trustWallet,
  rabbyWallet,
  okxWallet,
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'

const injectedWalletRenamed = () => ({
  ...injectedWallet(),
  name: 'Injected',
})

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '88a763ec5a64c568fcce729fbe4b87a8'

// WalletConnect / Reown: projectId is public. Allowlist app origins in Reown Cloud
// (https://cloud.reown.com) → project → App domains: production, preview hosts, http://localhost:3000.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        trustWallet,
        rabbyWallet,
        okxWallet,
        injectedWalletRenamed,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'Morbius',
    appUrl: 'https://morbius.money',
    projectId: walletConnectProjectId,
    walletConnectParameters: {
      qrModalOptions: {
        enableExplorer: true,
      },
    },
  }
)

export const config = createConfig({
  connectors,
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: fallback([
      http('https://rpc.pulsechain.com'),
      http('https://rpc-pulsechain.g4mm4.io'),
    ]),
  },
  ssr: true,
})
