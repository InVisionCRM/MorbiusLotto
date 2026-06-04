import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { pulsechain } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { http, fallback } from 'wagmi'

// WalletConnect / Reown: projectId is public. Allowlist app origins in Reown Cloud
// (https://cloud.reown.com) → project → App domains: production, preview hosts, http://localhost:3000.
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '88a763ec5a64c568fcce729fbe4b87a8'

/** Networks AppKit + wagmi operate on. PulseChain (chainId 369). */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [pulsechain]

/** Must match the live site origin or WalletConnect warns (metadata.url vs window.location). */
function walletConnectAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_WALLETCONNECT_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://morbius.io'
  const trimmed = raw.trim().replace(/\/$/, '')
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return u.origin
  } catch {
    return 'https://morbius.io'
  }
}

export const appMetadata = {
  name: 'Morbius',
  description: 'MORBlotto — Web3 casino on PulseChain',
  url: walletConnectAppUrl(),
  icons: ['https://morbius.io/icons/web-app-manifest-512x512.png'],
}

/**
 * Reown AppKit wagmi adapter — replaces the previous RainbowKit
 * `connectorsForWallets` setup. The adapter builds the wagmi config (default
 * injected / EIP-6963 + WalletConnect + Coinbase connectors); AppKit renders
 * the connect modal. `createAppKit()` is called once in app/providers.tsx.
 *
 * IMPORTANT: Do NOT configure featuredWalletIds (here OR in the Reown Cloud
 * dashboard). AppKit's all-wallets list fails to attach its pagination
 * IntersectionObserver when featured wallets exist at first render
 * (createPaginationObserver runs before the `#local-paginator` element is
 * rendered), which permanently strands the wallet list after the first page.
 * No featured wallets → the list lazy-loads correctly on scroll.
 */
export const wagmiAdapter = new WagmiAdapter({
  projectId: walletConnectProjectId,
  networks,
  ssr: true,
  transports: {
    [pulsechain.id]: fallback([
      http('https://rpc.pulsechain.com'),
      http('https://rpc-pulsechain.g4mm4.io'),
    ]),
  },
})

export const config = wagmiAdapter.wagmiConfig
