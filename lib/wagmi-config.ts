import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import {
  pulsechain,
  mainnet,
  bsc,
  polygon,
  base,
  arbitrum,
  optimism,
  avalanche,
  gnosis,
  fantom,
} from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { http, fallback } from 'wagmi'

// WalletConnect / Reown: projectId is public. Allowlist app origins in Reown Cloud
// (https://cloud.reown.com) → project → App domains: production, preview hosts, http://localhost:3000.
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '88a763ec5a64c568fcce729fbe4b87a8'

/**
 * Networks declared to AppKit. PulseChain (369) is the app's actual operating
 * chain — all contracts live there and `defaultNetwork: pulsechain` in
 * createAppKit pins reads/writes to it. The other chains are declared ONLY so
 * Reown's wallet-explorer API returns wallets that work on them: the API treats
 * `chains=` as a union (wallet supports ANY of these → eligible), so declaring
 * one chain caps the modal at ~88 wallets, while declaring the popular EVM
 * chains opens it up to ~500+. This matches what reference sites like
 * app.provex.com do (their bundle declares the same ~10 chains).
 *
 * Adding networks doesn't change what the app does — contract hooks pass
 * `chainId: 369` explicitly and `defaultNetwork: pulsechain` prompts wallets to
 * switch to PulseChain on connect.
 */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  pulsechain, // 369 — the app's operating chain
  mainnet, // 1
  bsc, // 56
  polygon, // 137
  base, // 8453
  arbitrum, // 42161
  optimism, // 10
  avalanche, // 43114
  gnosis, // 100
  fantom, // 250
]

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
    // g4mm4 ("gamma") primary, then two independent backups.
    //
    // rpc.pulsechainstats.com was REMOVED: it is dead (TLS connection reset —
    // no HTTP response at all), which left the chain with exactly one working
    // endpoint. Any g4mm4 hiccup or rate-limit therefore fell through to a host
    // that could never answer, and the PLS deposit quote — which has no
    // off-chain fallback by design — reported "PLS price unavailable" and
    // blocked the deposit outright.
    //
    // publicnode and rpc.pulsechain.com were both verified to serve the exact
    // getReserves call the quote makes, with `access-control-allow-origin: *`
    // so they work from the browser. rpc.pulsechain.com is ranked last because
    // it has historically been slow on reads, but a slow endpoint that answers
    // beats a dead one, and `rank` below routes around latency automatically.
    [pulsechain.id]: fallback(
      [
        http('https://rpc-pulsechain.g4mm4.io'),
        http('https://pulsechain-rpc.publicnode.com'),
        http('https://rpc.pulsechain.com'),
      ],
      // Re-rank on live latency/error rate so a degrading primary is bypassed
      // instead of being retried until it times out.
      { rank: { interval: 30_000, sampleCount: 5 }, retryCount: 2 },
    ),
  },
})

export const config = wagmiAdapter.wagmiConfig
