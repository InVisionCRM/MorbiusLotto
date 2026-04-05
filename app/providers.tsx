'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi-config'
import { useState } from 'react'
import { GameLockProvider } from '@/contexts/game-lock-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { ProfileSettingsModalProvider } from '@/components/shared/ProfileSettingsModalContext'
import { ProfileWsProvider } from '@/contexts/profile-ws-context'
import { PwaInstallPromptProvider } from '@/contexts/pwa-install-prompt-context'
import { InstallAppHelpDialogProvider } from '@/contexts/install-app-help-dialog-context'

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
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: '#8B5CF6', // Purple accent to match your theme
              accentColorForeground: 'white',
              borderRadius: 'medium',
              fontStack: 'system',
              overlayBlur: 'small',
            })}
            modalSize="wide"
            coolMode={true}
            showRecentTransactions={true}
          >
            <ProfileSettingsModalProvider>
              <ProfileWsProvider>
                <PwaInstallPromptProvider>
                  <InstallAppHelpDialogProvider>{children}</InstallAppHelpDialogProvider>
                </PwaInstallPromptProvider>
              </ProfileWsProvider>
            </ProfileSettingsModalProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
      </LocaleProvider>
    </GameLockProvider>
  )
}