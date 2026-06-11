'use client'

/**
 * StakeKenoGame — the interactive client for server-side Stake-style Keno.
 *
 * Owns selection / risk / bet state, talks to /api/keno/*, and paces a light
 * cosmetic reveal of the 10 drawn tiles (the server returns the whole draw at
 * once; the staggered reveal is presentation only). Chips are settled entirely
 * server-side — this component only reflects the balance the server returns.
 *
 * Layout mirrors Stake: controls rail on the left (stacks on top on mobile),
 * the 40-tile board on the right, payout strip beneath the board.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KenoBoard } from './KenoBoard'
import { KenoPayoutBar } from './KenoPayoutBar'
import { KenoFairnessModal } from './KenoFairnessModal'
import {
  fetchKenoMultipliers,
  fetchKenoBalance,
  playKeno,
  formatMultiplier,
  KENO_RISKS,
  KENO_RISK_LABELS,
  KENO_TOTAL_TILES,
  KENO_MAX_PICKS,
  type KenoMultipliers,
  type KenoRisk,
  type KenoPlayResult,
} from '@/lib/keno-client'

const REVEAL_STEP_MS = 110

function randomSample(size: number): Set<number> {
  const pool = Array.from({ length: KENO_TOTAL_TILES }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return new Set(pool.slice(0, size))
}

export function StakeKenoGame() {
  const [multipliers, setMultipliers] = useState<KenoMultipliers | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [risk, setRisk] = useState<KenoRisk>('classic')
  const [bet, setBet] = useState<number>(10)
  const [clientSeed, setClientSeed] = useState('')

  const [revealed, setRevealed] = useState<Set<number> | null>(null)
  const [result, setResult] = useState<KenoPlayResult | null>(null)
  const [resultHits, setResultHits] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'revealing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fairnessOpen, setFairnessOpen] = useState(false)

  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Load paytables (public) + balance (auth — degrade quietly when logged out).
  useEffect(() => {
    fetchKenoMultipliers().then(setMultipliers).catch(() => setMultipliers(null))
    fetchKenoBalance().then(setBalance).catch(() => setBalance(null))
    return () => revealTimers.current.forEach(clearTimeout)
  }, [])

  const picksCount = selected.size
  const busy = phase === 'revealing'

  const maxMultiplierX100 = useMemo(() => {
    if (!multipliers || picksCount === 0) return 0
    const row = multipliers[risk]?.[picksCount] ?? {}
    return Math.max(0, ...Object.values(row))
  }, [multipliers, risk, picksCount])

  const clearReveal = useCallback(() => {
    revealTimers.current.forEach(clearTimeout)
    revealTimers.current = []
  }, [])

  const toggleTile = useCallback(
    (n: number) => {
      if (busy) return
      setError(null)
      // Tapping after a resolved round starts a fresh selection.
      setResult(null)
      setRevealed(null)
      setResultHits(null)
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(n)) {
          next.delete(n)
        } else if (next.size < KENO_MAX_PICKS) {
          next.add(n)
        }
        return next
      })
    },
    [busy],
  )

  const autoPick = useCallback(() => {
    if (busy) return
    setError(null)
    setResult(null)
    setRevealed(null)
    setResultHits(null)
    setSelected(randomSample(picksCount > 0 ? picksCount : KENO_MAX_PICKS))
  }, [busy, picksCount])

  const clearTable = useCallback(() => {
    if (busy) return
    clearReveal()
    setSelected(new Set())
    setResult(null)
    setRevealed(null)
    setResultHits(null)
    setError(null)
  }, [busy, clearReveal])

  const placeBet = useCallback(async () => {
    if (busy || picksCount === 0) return
    setError(null)
    try {
      const res = await playKeno({
        picks: [...selected],
        risk,
        bet,
        clientSeed: clientSeed.trim() || undefined,
      })
      setResult(res)
      setBalance(BigInt(res.chipBalance))

      // Cosmetic staged reveal of the drawn tiles.
      setPhase('revealing')
      setRevealed(new Set())
      setResultHits(null)
      clearReveal()
      res.drawn.forEach((n, i) => {
        const t = setTimeout(() => {
          setRevealed((prev) => {
            const next = new Set(prev ?? [])
            next.add(n)
            return next
          })
          if (i === res.drawn.length - 1) {
            setResultHits(res.hits)
            setPhase('idle')
          }
        }, REVEAL_STEP_MS * (i + 1))
        revealTimers.current.push(t)
      })
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (/NO_CHIPS|Not enough chips|402/i.test(msg)) {
        setError('Not enough chips for that bet.')
      } else if (/401|auth/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError('Could not place the bet. Try again.')
      }
    }
  }, [busy, picksCount, selected, risk, bet, clientSeed, clearReveal])

  const profit = result ? result.payout - result.bet : 0

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ───────── Controls rail ───────── */}
        <Card className="order-2 space-y-4 border-slate-800 bg-slate-900/60 p-4 lg:order-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <span className="font-mono text-sm tabular-nums text-amber-300">
              {balance != null ? `${balance.toLocaleString()} chips` : '—'}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">Bet amount</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={bet}
                disabled={busy}
                onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                className="border-slate-700 bg-slate-950 tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}
                className="border-slate-700 px-3"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBet((b) => Math.max(1, b * 2))}
                className="border-slate-700 px-3"
              >
                2×
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">Risk</label>
            <Select
              value={risk}
              onValueChange={(v) => {
                if (busy) return
                setRisk(v as KenoRisk)
                // Clear the prior result so the payout strip doesn't highlight a
                // stale hit count against the newly selected risk's row.
                setResult(null)
                setRevealed(null)
                setResultHits(null)
              }}
              disabled={busy}
            >
              <SelectTrigger className="border-slate-700 bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KENO_RISKS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {KENO_RISK_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={autoPick}
              className="border-slate-700"
            >
              Auto Pick
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || picksCount === 0}
              onClick={clearTable}
              className="border-slate-700"
            >
              Clear
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{picksCount}/{KENO_MAX_PICKS} selected</span>
            {picksCount > 0 && (
              <span>
                max <span className="text-cyan-300">{formatMultiplier(maxMultiplierX100)}</span>
              </span>
            )}
          </div>

          <Button
            type="button"
            disabled={busy || picksCount === 0}
            onClick={placeBet}
            className="h-12 w-full bg-cyan-600 text-base font-semibold hover:bg-cyan-500 disabled:opacity-50"
          >
            {busy ? 'Drawing…' : 'Bet'}
          </Button>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          {result && phase === 'idle' && (
            <div
              className={[
                'rounded-lg px-3 py-2 text-center text-sm',
                profit > 0
                  ? 'bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/40'
                  : 'bg-slate-800/60 text-slate-400',
              ].join(' ')}
            >
              {result.hits} hit{result.hits === 1 ? '' : 's'} ·{' '}
              {result.payout > 0 ? (
                <span className="text-amber-300">
                  +{(result.payout - result.bet).toLocaleString()} chips ({formatMultiplier(result.multiplierX100)})
                </span>
              ) : (
                <span>no win</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setFairnessOpen(true)}
            className="w-full text-center text-xs text-slate-500 hover:text-cyan-400"
          >
            Provably Fair {result ? '· verify last round' : ''}
          </button>
        </Card>

        {/* ───────── Board + payouts ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="border-slate-800 bg-slate-900/60 p-3 sm:p-4">
            <KenoBoard
              selected={selected}
              drawn={revealed}
              settled={resultHits !== null}
              disabled={busy}
              onToggle={toggleTile}
            />
          </Card>
          <KenoPayoutBar
            multipliers={multipliers}
            risk={risk}
            picksCount={picksCount}
            resultHits={resultHits}
          />
        </div>
      </div>

      <KenoFairnessModal
        open={fairnessOpen}
        onClose={() => setFairnessOpen(false)}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        lastRoundId={result?.roundId ?? null}
      />
    </div>
  )
}
