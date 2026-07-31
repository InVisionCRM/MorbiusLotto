'use client'

import { createAppKit } from '@reown/appkit/react'
import { pulsechain } from '@reown/appkit/networks'
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
import ChainGuard from '@/components/shared/ChainGuard'
import { WalletActionProvider } from '@/contexts/wallet-action-context'
import { BigWinProvider } from '@/contexts/big-win-context'
// Side-effect: force AppKit's All Wallets list to load every page (its lazy-load
// IntersectionObserver doesn't fire in our runtime). See the file for details.
import '@/lib/appkit-preload-wallets'

// Initialize Reown AppKit once, at module load (this file is 'use client').
// Registers the <appkit-*> web components and wires the connect modal to the
// wagmi adapter. Replaces RainbowKitProvider.
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  // PulseChain is the app's operating chain even though we declare more
  // networks (those exist only to widen the wallet-explorer list — see
  // lib/wagmi-config.ts). This pins the active chain and prompts wallets to
  // switch to PulseChain on connect.
  defaultNetwork: pulsechain,
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
          {/* Keeps a connected wallet on PulseChain — the wide `networks` list
              makes other chains valid session chains, so drift is possible. */}
          <ChainGuard />
          <WalletActionProvider>
            <SiweProvider>
              <ProfileSettingsModalProvider>
                <ProfileWsProvider>
                  <PwaInstallPromptProvider>
                    <InstallAppHelpDialogProvider>
                      <BigWinProvider>{children}</BigWinProvider>
                    </InstallAppHelpDialogProvider>
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
