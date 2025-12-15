import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { pulsechain } from './chains'

export const config = getDefaultConfig({
  appName: 'Morbius Lotto',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [pulsechain],
  ssr: true,
})
