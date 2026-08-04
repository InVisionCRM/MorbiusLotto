'use client'

/**
 * The provably-fair panel every game shares — modeled on Stake's fairness
 * modal so players recognise it instantly:
 *
 *   · ACTIVE client seed, always visible with a copy button — the seed your
 *     next bet is actually paired with, not a mystery box
 *   · an edit field that is a DRAFT: nothing changes until Save (or Random,
 *     which generates + saves in one click), and saving flashes an explicit
 *     "Seed updated" confirmation
 *   · optionally the server-seed commitment (hash) and round/nonce for games
 *     that expose them, plus a slot for extra per-game content (e.g. the
 *     multiplayer blackjack "verify a recent hand" list)
 *
 * `value`/`onChange` keep their original meaning — the committed seed — so
 * every existing caller works unchanged.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { CheckCircle } from 'lucide-react'
import { generateHexClientSeed } from '@/lib/generate-client-seed'

const MAX_LEN = 255

export type ProvablyFairClientSeedModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The committed (active) client seed. */
  value: string
  /** Called only when the player saves a new seed. */
  onChange: (next: string) => void
  /** Current round's committed server-seed hash, when the game exposes it. */
  serverSeedHash?: string | null
  /** Round number / nonce the current pair is on, when the game exposes it. */
  nonce?: number | null
  /** Extra per-game content rendered below the seeds (e.g. verify links). */
  children?: ReactNode
}

export function ProvablyFairClientSeedModal({
  open,
  onOpenChange,
  value,
  onChange,
  serverSeedHash,
  nonce,
  children,
}: ProvablyFairClientSeedModalProps) {
  const [draft, setDraft] = useState(value)
  const [savedFlash, setSavedFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)

  // Re-sync the draft each time the panel opens (or the active seed changes
  // underneath it, e.g. loaded from storage after mount).
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const flash = useCallback(() => {
    setSavedFlash(true)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2600)
  }, [])

  const save = useCallback(
    (next: string) => {
      const clean = next.trim().slice(0, MAX_LEN)
      if (!clean || clean === value) return
      onChange(clean)
      setDraft(clean)
      flash()
    },
    [value, onChange, flash],
  )

  const onRandom = useCallback(() => {
    const next = generateHexClientSeed()
    if (next) save(next)
  }, [save])

  const dirty = draft.trim().length > 0 && draft.trim() !== value

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-white">
            Provably fair
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-1">
          {/* ── Active pair ── */}
          <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                Active client seed
              </span>
              <CopyButton
                content={value}
                copyToast="Client seed copied"
                variant="ghost"
                size="sm"
              />
            </div>
            <code className="block break-all font-mono text-xs text-cyan-200">{value || '—'}</code>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">
              Mixed with the server seed to shuffle. This is the seed your next bet uses.
            </p>

            {serverSeedHash ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Server seed (hashed)
                  </span>
                  <CopyButton
                    content={serverSeedHash}
                    copyToast="Server seed hash copied"
                    variant="ghost"
                    size="sm"
                  />
                </div>
                <code className="block break-all font-mono text-[11px] text-purple-200">
                  {serverSeedHash}
                </code>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                  Committed before the deal{typeof nonce === 'number' ? ` · round #${nonce}` : ''} —
                  the plain seed is revealed after the round so anyone can check it.
                </p>
              </div>
            ) : null}
          </div>

          {/* ── Change seed ── */}
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Change client seed
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
              rows={2}
              spellCheck={false}
              placeholder="Type anything — your words become part of the shuffle"
              className="w-full resize-none rounded-lg border border-cyan-500/25 bg-black/40 px-3 py-2 font-mono text-xs text-cyan-100 placeholder:text-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-0"
              aria-label="New client seed"
            />
            <div className="mt-2 flex items-center gap-2">
              {savedFlash ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Seed updated — used from your next bet
                </span>
              ) : (
                <span className="text-[11px] text-white/40">
                  Takes effect on your next bet.
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-cyan-500/40 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 hover:text-white"
                  onClick={onRandom}
                >
                  Random
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty}
                  className="bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
                  onClick={() => save(draft)}
                >
                  Save seed
                </Button>
              </div>
            </div>
          </div>

          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
