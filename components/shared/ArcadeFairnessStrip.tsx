'use client'

/**
 * ArcadeFairnessStrip — the always-visible fairness bar for every chip game,
 * fed by the wallet's shared arcade seed pair (the same commitment the game's
 * fairness modal manages).
 *
 * States are explicit and honest — the old UX collapsed every failure into
 * "connect your wallet", which was wrong and gave no way forward:
 *   · signed in  → active client seed + committed server-seed hash + nonce
 *   · signed out → "Sign in to view your seed" with a button that actually
 *                  starts the sign-in (via the global gate), then loads
 *   · error      → "Couldn't load your seed" with a Retry button
 *
 * The initial load never pops the sign-in gate: it probes the session first
 * and only fetches when one exists. The prompt fires only from the explicit
 * Sign in button.
 */

import { useCallback, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { ProvablyFairStrip } from '@/components/shared/ProvablyFairStrip'
import { probeSiweSession } from '@/lib/api-auth'
import { fetchActiveSeed, type ArcadeSeedState } from '@/lib/arcade-seed-client'

type StripState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error' }
  | { kind: 'ready'; seed: ArcadeSeedState }

export function ArcadeFairnessStrip({ onOpenPanel }: { onOpenPanel: () => void }) {
  const [state, setState] = useState<StripState>({ kind: 'loading' })

  /** Quiet load: never triggers the sign-in prompt. */
  const loadQuiet = useCallback(async () => {
    try {
      const hasSession = await probeSiweSession()
      if (!hasSession) {
        setState({ kind: 'signed-out' })
        return
      }
      const seed = await fetchActiveSeed()
      setState({ kind: 'ready', seed })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])

  /** Explicit load: allowed to open the sign-in gate (user clicked). */
  const loadPrompting = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const seed = await fetchActiveSeed()
      setState({ kind: 'ready', seed })
    } catch {
      // They dismissed the gate or it genuinely failed — back to signed-out
      // rather than a scary error, since the likeliest cause is "didn't sign".
      const hasSession = await probeSiweSession()
      setState(hasSession ? { kind: 'error' } : { kind: 'signed-out' })
    }
  }, [])

  useEffect(() => {
    void loadQuiet()
    // A sign-out elsewhere (wallet switch, logout) should drop the seed display.
    const onCleared = () => setState({ kind: 'signed-out' })
    window.addEventListener('siwe:session-cleared', onCleared)
    return () => window.removeEventListener('siwe:session-cleared', onCleared)
  }, [loadQuiet])

  if (state.kind === 'ready') {
    return (
      <ProvablyFairStrip
        clientSeed={state.seed.clientSeed}
        serverSeedHash={state.seed.serverSeedHash}
        nonce={state.seed.nonce}
        onOpenPanel={onOpenPanel}
      />
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-cyan-300">
        <Shield className="h-3.5 w-3.5" />
        Provably fair
      </span>
      {state.kind === 'loading' ? (
        <span className="text-white/50">Loading your seed…</span>
      ) : state.kind === 'signed-out' ? (
        <>
          <span className="text-white/60">Sign in to view your seed pair.</span>
          <button
            type="button"
            onClick={() => void loadPrompting()}
            className="ml-auto rounded-md border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/50 hover:text-white"
          >
            Sign in
          </button>
        </>
      ) : (
        <>
          <span className="text-white/60">Couldn&apos;t load your seed.</span>
          <button
            type="button"
            onClick={() => void loadQuiet()}
            className="ml-auto rounded-md border border-white/15 px-2.5 py-1 font-semibold text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Retry
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onOpenPanel}
        className="rounded-md border border-white/15 px-2.5 py-1 font-semibold text-white/70 transition-colors hover:border-white/30 hover:text-white"
      >
        Details
      </button>
    </div>
  )
}
