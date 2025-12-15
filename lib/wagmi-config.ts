import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { pulsechain } from './chains'

export const config = getDefaultConfig({
  appName: 'Morbius Lotto',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [pulsechain],
  ssr: true,
  walletConnectVersion: '2',
  storage: typeof window !== 'undefined' ? {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Handle storage quota exceeded or other errors silently
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Handle errors silently
      }
    },
  } : undefined,
})
