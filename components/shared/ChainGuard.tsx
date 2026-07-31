'use client'

/**
 * ChainGuard — keeps a connected wallet on PulseChain.
 *
 * lib/wagmi-config.ts deliberately declares ten networks to AppKit so Reown's
 * wallet-explorer returns ~500 wallets instead of ~88. The side effect is that
 * every one of those chains is part of the approved WalletConnect session, so a
 * wallet sitting on Ethereum is "valid" as far as the session is concerned and
 * has no reason to move — and on reconnect the session restores the last-used
 * chain rather than `defaultNetwork`. This closes that gap: whenever a connected
 * wallet is on anything other than 369, ask it to switch back.
 *
 * Prompting rules, so this never becomes a popup loop:
 *   - one automatic attempt per wrong chain; if the user declines we stop and
 *     leave a toast with a manual "Switch" action instead of re-prompting,
 *   - the attempt marker resets once the wallet is back on PulseChain (or
 *     disconnects), so a later drift is handled again,
 *   - nothing happens at all while disconnected — wagmi still reports a chainId
 *     then, and prompting a wallet that isn't connected is just noise.
 */

import { useEffect, useRef } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { pulsechain } from '@/lib/chains'

export default function ChainGuard() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  /** The wrong chain we have already prompted for (null = free to prompt). */
  const promptedFor = useRef<number | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!isConnected) {
      promptedFor.current = null
      return
    }
    if (chainId === pulsechain.id) {
      promptedFor.current = null
      return
    }
    if (inFlight.current || promptedFor.current === chainId) return

    promptedFor.current = chainId
    inFlight.current = true

    switchChainAsync({ chainId: pulsechain.id })
      .catch(() => {
        // Declined, or the wallet can't switch programmatically. Don't re-prompt —
        // surface a manual path instead.
        toast.warning('Morbius runs on PulseChain', {
          description: 'Your wallet is on another network. Switch to PulseChain to play.',
          duration: 12000,
          action: {
            label: 'Switch',
            onClick: () => {
              promptedFor.current = null
              switchChainAsync({ chainId: pulsechain.id }).catch(() => {
                toast.error('Could not switch automatically', {
                  description: 'Please select PulseChain in your wallet.',
                })
              })
            },
          },
        })
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [isConnected, chainId, switchChainAsync])

  return null
}
