'use client'

import { createAppKit } from '@reown/appkit/react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config, wagmiAdapter, networks, walletConnectProjectId, appMetadata } from '@/lib/wagmi-config'
import { useState } from 'react'
import { GameLockProvider } from '@/contexts/game-lock-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { ProfileSettingsModalProvider } from '@/components/shared/ProfileSettingsModalContext'
import { ProfileWsProvider } from '@/contexts/profile-ws-context'
import { PwaInstallPromptProvider } from '@/contexts/pwa-install-prompt-context'
import { InstallAppHelpDialogProvider } from '@/contexts/install-app-help-dialog-context'
import { SiweProvider } from '@/contexts/siwe-context'
import { WalletActionProvider } from '@/contexts/wallet-action-context'

// Initialize Reown AppKit once, at module load (this file is 'use client').
// Registers the <appkit-*> web components and wires the connect modal to the
// wagmi adapter. Replaces RainbowKitProvider.
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: walletConnectProjectId,
  metadata: appMetadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#06b6d4', // cyan — single accent, matches app chrome
    '--w3m-border-radius-master': '2px',
  },
  // Wallet-only modal (no email / social / on-ramp / swaps), matching prior UX.
  features: {
    analytics: true,
    email: false,
    socials: false,
    onramp: false,
    swaps: false,
    send: false,
  },
  // Intentionally NO featuredWalletIds — see lib/wagmi-config.ts for why.
})

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient once per provider instance to prevent cache resets
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        retry: (failureCount, error) => {
          // Don't retry on user rejection errors
          if (error?.message?.includes('user rejected') ||
              error?.message?.includes('User rejected')) {
            return false
          }
          // Retry other errors up to 3 times
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  }))

  return (
    <GameLockProvider>
      <LocaleProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <WalletActionProvider>
            <SiweProvider>
              <ProfileSettingsModalProvider>
                <ProfileWsProvider>
                  <PwaInstallPromptProvider>
                    <InstallAppHelpDialogProvider>{children}</InstallAppHelpDialogProvider>
                  </PwaInstallPromptProvider>
                </ProfileWsProvider>
              </ProfileSettingsModalProvider>
            </SiweProvider>
          </WalletActionProvider>
        </QueryClientProvider>
      </WagmiProvider>
      </LocaleProvider>
    </GameLockProvider>
  )
}
