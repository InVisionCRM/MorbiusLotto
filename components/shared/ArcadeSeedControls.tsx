'use client'

/**
 * ArcadeSeedControls — shared provably-fair seed panel for the instant arcade
 * games (Dice, Limbo, Roulette). Renders inside each game's fairness modal.
 *
 * This is the piece that makes the commitment MEAN something for a one-shot
 * game: it shows the active server-seed hash that was published BEFORE any bet,
 * lets the player set their own client seed, and — critically — lets them
 * "Rotate & reveal", which uncovers the plaintext server seed so every past
 * round under it can be checked with sha256(serverSeed) === serverSeedHash.
 */

import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  fetchActiveSeed,
  setArcadeClientSeed,
  rotateArcadeSeed,
  type ArcadeSeedState,
} from '@/lib/arcade-seed-client'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="arc-mono break-all rounded-md bg-[#081420] px-2 py-1 text-xs text-slate-300">
        {value}
      </div>
    </div>
  )
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
function randomClientSeed(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function ArcadeSeedControls({ open }: { open: boolean }) {
  const [state, setState] = useState<ArcadeSeedState | null>(null)
  const [draftSeed, setDraftSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justRevealed, setJustRevealed] = useState<ArcadeSeedState['previous']>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const s = await fetchActiveSeed()
      setState(s)
      setDraftSeed(s.clientSeed)
    } catch (e) {
      // Say what actually happened — and SHOW the underlying response, so a
      // report of this error names the real failure instead of inviting
      // guesses. The old copy blamed the wallet for every failure.
      const err = e as Error & { status?: number }
      const detail = err?.message ? ` (${err.message})` : ''
      setError(
        err?.status === 401
          ? 'Sign in with your wallet to view your seed — the sign-in prompt may have been dismissed.'
          : err?.status === 429
            ? 'Rate limited — too many requests from your connection right now (autoplay counts). Wait a minute, then Retry.'
            : `Could not load your seed just now — it’s not a wallet problem.${detail} Retry in a moment.`,
      )
    }
  }, [])

  // Fetch the active commitment whenever the panel is shown.
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function saveClientSeed() {
    const cs = draftSeed.trim()
    if (!cs || busy) return
    setBusy(true)
    setError(null)
    try {
      const s = await setArcadeClientSeed(cs)
      setState(s)
      setDraftSeed(s.clientSeed)
    } catch {
      setError('Could not update the client seed.')
    } finally {
      setBusy(false)
    }
  }

  async function rotate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const cs = draftSeed.trim()
      const s = await rotateArcadeSeed(cs || undefined)
      setJustRevealed(s.previous)
      setState(s)
      setDraftSeed(s.clientSeed)
    } catch {
      setError('Could not rotate the seed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Active server seed</h3>
        <p className="text-xs text-slate-500">
          This hash is published <span className="text-slate-300">before</span> you bet and
          covers every roll until you rotate — so the outcome can’t be chosen after the fact.
          Rotate to reveal the seed and verify your past rounds.
        </p>
      </div>

      {state ? (
        <>
          <Field label="Server seed hash (committed, pre-bet)" value={state.serverSeedHash} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              Next nonce: <span className="arc-mono text-slate-200">{state.nonce}</span>
            </span>
            <span className="text-slate-500">Seed pair: {state.seedPairId.slice(0, 8)}…</span>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Your client seed</div>
            <div className="flex gap-2">
              <Input
                value={draftSeed}
                onChange={(e) => setDraftSeed(e.target.value.slice(0, 128))}
                placeholder="Your client seed"
                className="arc-mono border-cyan-950 bg-[#081420] text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftSeed(randomClientSeed())}
                className="shrink-0 border-cyan-950 bg-transparent text-cyan-300 hover:bg-cyan-500/10"
              >
                Random
              </Button>
              <Button
                type="button"
                onClick={saveClientSeed}
                disabled={busy || !draftSeed.trim() || draftSeed.trim() === state.clientSeed}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
              >
                Save
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={rotate}
            disabled={busy}
            className="w-full border-amber-900/60 bg-transparent text-amber-300 hover:bg-amber-500/10"
          >
            {busy ? 'Working…' : 'Rotate & reveal current seed'}
          </Button>

          {justRevealed && (
            <div className="arc-panel space-y-2 rounded-lg p-3">
              <div className="text-xs font-semibold text-amber-300">Revealed — verify past rounds against this</div>
              <Field label="Revealed server seed" value={justRevealed.serverSeed} />
              <Field label="Its committed hash" value={justRevealed.serverSeedHash} />
              <Field label="Client seed" value={justRevealed.clientSeed} />
              <Field label="Bets placed under it" value={String(justRevealed.nonce)} />
            </div>
          )}
        </>
      ) : (
        !error && <div className="text-xs text-slate-500">Loading seed…</div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
            Retry
          </Button>
        </div>
      )}
    </section>
  )
}
