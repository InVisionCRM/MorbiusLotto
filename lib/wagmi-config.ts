import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { pulsechain } from './chains'
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'

const internetMoneyWallet: typeof walletConnectWallet = ({ projectId, options }) => {
  const wcWallet = walletConnectWallet({ projectId, options })
  return {
    ...wcWallet,
    id: 'internetmoney',
    name: 'Internet Money',
    iconUrl: 'https://internetmoney.io/images/logo.png',
    iconBackground: '#000000',
    downloadUrls: {
      android: 'https://play.google.com/store/apps/details?id=io.internetmoney.app',
      ios: 'https://apps.apple.com/app/internet-money-wallet/id6443579962',
      qrCode: 'https://internetmoney.io',
    },
    mobile: {
      getUri: (uri: string) => `internetmoney://wc?uri=${encodeURIComponent(uri)}`,
    },
    qrCode: {
      getUri: (uri: string) => uri,
    },
  }
}

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        internetMoneyWallet,
        injectedWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'MORBIUS Lotto',
    projectId: '21fef48091f12692cad574a6f7753643',
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
