'use client'

/**
 * The always-visible fairness bar — Stake-style: it lives on the game page
 * itself, not behind a popup. Shows the active client seed and, when the game
 * exposes them, the current round's server-seed commitment and round number,
 * each one copyable. "Change seed" / "Verify" open the full fairness panel.
 */

import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'

const shorten = (v: string, head = 8, tail = 6) =>
  v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`

export function ProvablyFairStrip({
  clientSeed,
  serverSeedHash,
  nonce,
  onOpenPanel,
}: {
  clientSeed: string
  serverSeedHash?: string | null
  nonce?: number | null
  onOpenPanel: () => void
}) {
  // Client seeds come from localStorage / per-session randomness, so their
  // value differs between the server render and the client. Painting the seed
  // only after mount keeps the SSR text stable and avoids hydration errors.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const shownSeed = mounted ? clientSeed : ''

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-cyan-300">
        <Shield className="h-3.5 w-3.5" />
        Provably fair
      </span>

      <span className="flex min-w-0 items-center gap-1 text-white/60">
        Client seed
        <code className="font-mono text-cyan-100" title={shownSeed}>
          {shownSeed ? shorten(shownSeed) : '…'}
        </code>
        <CopyButton
          content={shownSeed}
          copyToast="Client seed copied"
          variant="ghost"
          size="xs"
          className="h-5 w-5 text-white/40 hover:text-white"
        />
      </span>

      {serverSeedHash ? (
        <span className="flex min-w-0 items-center gap-1 text-white/60">
          Server hash
          <code className="font-mono text-purple-200" title={serverSeedHash}>
            {shorten(serverSeedHash)}
          </code>
          <CopyButton
            content={serverSeedHash}
            copyToast="Server seed hash copied"
            variant="ghost"
            size="xs"
            className="h-5 w-5 text-white/40 hover:text-white"
          />
        </span>
      ) : null}

      {typeof nonce === 'number' && nonce > 0 ? (
        <span className="text-white/60">
          Round <span className="font-mono text-white/90">#{nonce}</span>
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPanel}
          className="rounded-md border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/50 hover:text-white"
        >
          Change seed
        </button>
        <button
          type="button"
          onClick={onOpenPanel}
          className="rounded-md border border-white/15 px-2.5 py-1 font-semibold text-white/70 transition-colors hover:border-white/30 hover:text-white"
        >
          Verify
        </button>
      </span>
    </div>
  )
}
