import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import type { Wallet } from '@rainbow-me/rainbowkit'
import { createConfig, http, fallback } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { pulsechain } from './chains'
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'

type InternetMoneyProvider = {
  isInternetMoney?: boolean
  _isInternetMoney?: boolean
  eip6963ProviderDetails?: {
    info?: {
      rdns?: string
      icon?: string
    }
  }
  providers?: InternetMoneyProvider[]
}

const isInternetMoneyProvider = (
  provider: InternetMoneyProvider | undefined
): provider is InternetMoneyProvider => {
  if (!provider) return false
  if (provider.isInternetMoney || provider._isInternetMoney) return true
  return provider.eip6963ProviderDetails?.info?.rdns === 'io.internetmoney'
}

const getInternetMoneyProvider = () => {
  if (typeof window === 'undefined') return undefined

  const ethereum = window.ethereum as InternetMoneyProvider | undefined
  if (Array.isArray(ethereum?.providers)) {
    const providerFromArray = ethereum.providers.find(isInternetMoneyProvider)
    if (providerFromArray) return providerFromArray
  }

  if (isInternetMoneyProvider(ethereum)) return ethereum
  return undefined
}

const internetMoneyWallet = (): Wallet => ({
  id: 'internetMoney',
  name: 'Internet Money',
  iconUrl: async () => {
    const provider = getInternetMoneyProvider()
    const icon = provider?.eip6963ProviderDetails?.info?.icon
    return icon ?? 'https://internetmoney.io/favicon.ico'
  },
  iconBackground: '#111111',
  installed: typeof window !== 'undefined' ? !!getInternetMoneyProvider() : undefined,
  downloadUrls: {
    browserExtension: 'https://internetmoney.io/chrome',
    mobile: 'https://internetmoney.io/',
  },
  createConnector: () =>
    injected({
      target: {
        id: 'internetMoney',
        name: 'Internet Money',
        provider: () => getInternetMoneyProvider(),
      },
    }),
})

const injectedWalletRenamed = () => ({
  ...injectedWallet(),
  name: 'Injected',
})

// WalletConnect / Reown: projectId is public. Allowlist app origins in Reown Cloud
// (https://cloud.reown.com) → project → App domains: production, preview hosts, http://localhost:3000.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        internetMoneyWallet,
        metaMaskWallet,
        injectedWalletRenamed,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'Morbius',
    projectId: '88a763ec5a64c568fcce729fbe4b87a8',
  }
)

export const config = createConfig({
  connectors,
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: fallback([
      http('https://rpc.pulsechain.com'),
      http('https://pulsechain-rpc.publicnode.com'),
      http('https://rpc-pulsechain.g4mm4.io'),
    ]),
  },
  ssr: true,
})
