'use client'

/**
 * StakeKenoGame — the interactive client for server-side Stake-style Keno.
 *
 * Owns selection / risk / bet state, talks to /api/keno/*, and paces a light
 * cosmetic reveal of the 10 drawn tiles (the server returns the whole draw at
 * once; the staggered reveal is presentation only). Chips are settled entirely
 * server-side — this component only reflects balances the server reports.
 *
 * Wiring notes:
 *   • Bet bounds come from /api/keno/info so the UI enforces exactly what the
 *     server does; the local fallbacks only cover the fetch window.
 *   • Balance reads use the public chips endpoint (usePokerChipBalance) so a
 *     logged-out visitor never triggers a sign-in popup; the authed play
 *     response then keeps it current. Buying chips reuses the poker exchange.
 *   • History loads only after probeSiweSession() confirms a session (again:
 *     no popup on page load) and is prepended live as rounds settle.
 *   • phase: 'betting' covers the in-flight POST — the gap that used to allow
 *     a double-click to place two bets — and 'revealing' covers the stagger.
 *
 * Layout mirrors Stake: controls rail on the left (stacks under the board on
 * mobile), the 40-tile board on the right, payout strip beneath the board,
 * history full-width below.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
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
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance'
import { formatChips } from '@/lib/format-poker-chips'
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal'
import { probeSiweSession } from '@/lib/api-auth'
import { KenoBoard } from './KenoBoard'
import { KenoPayoutBar } from './KenoPayoutBar'
import { KenoFairnessModal } from './KenoFairnessModal'
import { KenoHistory } from './KenoHistory'
import {
  fetchKenoInfo,
  fetchKenoMultipliers,
  fetchKenoHistory,
  playKeno,
  formatMultiplier,
  KENO_RISKS,
  KENO_RISK_LABELS,
  KENO_TOTAL_TILES,
  KENO_MAX_PICKS,
  type KenoMultipliers,
  type KenoRisk,
  type KenoPlayResult,
  type KenoHistoryRound,
} from '@/lib/keno-client'

const REVEAL_STEP_MS = 110
const HISTORY_LIMIT = 25

/** "402 Payment Required: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

function randomSample(size: number): Set<number> {
  const pool = Array.from({ length: KENO_TOTAL_TILES }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return new Set(pool.slice(0, size))
}

export function StakeKenoGame() {
  const { address } = useAccount()

  const [multipliers, setMultipliers] = useState<KenoMultipliers | null>(null)
  const [multipliersFailed, setMultipliersFailed] = useState(false)
  const [bounds, setBounds] = useState({ minBet: 1, maxBet: 1_000 })

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [risk, setRisk] = useState<KenoRisk>('classic')
  const [bet, setBet] = useState<number>(10)
  const [clientSeed, setClientSeed] = useState('')

  const [revealed, setRevealed] = useState<Set<number> | null>(null)
  const [result, setResult] = useState<KenoPlayResult | null>(null)
  const [resultHits, setResultHits] = useState<number | null>(null)
  // 'betting' covers the in-flight POST so a double-click can't place two bets;
  // 'revealing' covers the staged tile reveal that follows the response.
  const [phase, setPhase] = useState<'idle' | 'betting' | 'revealing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [history, setHistory] = useState<KenoHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Balance: public read keyed by wallet address (no sign-in popup), then kept
  // fresh from authoritative play responses and exchange completions.
  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null)
  const [balance, setBalance] = useState<bigint | null>(null)
  useEffect(() => {
    if (chainBalance != null) {
      try {
        setBalance(BigInt(chainBalance.split('.')[0] || '0'))
      } catch {
        /* keep last known */
      }
    } else if (!address) {
      setBalance(null)
    }
  }, [chainBalance, address])

  const loadMultipliers = useCallback(() => {
    setMultipliersFailed(false)
    fetchKenoMultipliers()
      .then(setMultipliers)
      .catch(() => setMultipliersFailed(true))
  }, [])

  // Paytables + bounds (public) on mount.
  useEffect(() => {
    loadMultipliers()
    fetchKenoInfo()
      .then((info) => {
        if (Number.isFinite(info.minBet) && Number.isFinite(info.maxBet)) {
          setBounds({ minBet: info.minBet, maxBet: info.maxBet })
        }
      })
      .catch(() => {
        /* keep defaults — server still enforces */
      })
    return () => revealTimers.current.forEach(clearTimeout)
  }, [loadMultipliers])

  // History: only fetch once a session provably exists (never pop a sign-in on load).
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    probeSiweSession()
      .then((ok) => (ok ? fetchKenoHistory(HISTORY_LIMIT) : []))
      .then((rounds) => {
        if (!cancelled) setHistory(rounds)
      })
      .catch(() => {
        /* leave empty — panel shows its empty state */
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const picksCount = selected.size
  const busy = phase !== 'idle'

  const clampBet = useCallback(
    (n: number) => Math.min(bounds.maxBet, Math.max(bounds.minBet, Math.floor(n || 0))),
    [bounds],
  )

  const maxMultiplierX100 = useMemo(() => {
    if (!multipliers || picksCount === 0) return 0
    const row = multipliers[risk]?.[picksCount] ?? {}
    return Math.max(0, ...Object.values(row))
  }, [multipliers, risk, picksCount])

  const clearReveal = useCallback(() => {
    revealTimers.current.forEach(clearTimeout)
    revealTimers.current = []
  }, [])

  const resetRound = useCallback(() => {
    setResult(null)
    setRevealed(null)
    setResultHits(null)
  }, [])

  const toggleTile = useCallback(
    (n: number) => {
      if (busy) return
      setError(null)
      setNoChips(false)
      // Tapping after a resolved round starts a fresh selection.
      resetRound()
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
    [busy, resetRound],
  )

  const autoPick = useCallback(() => {
    if (busy) return
    setError(null)
    setNoChips(false)
    resetRound()
    setSelected(randomSample(picksCount > 0 ? picksCount : KENO_MAX_PICKS))
  }, [busy, picksCount, resetRound])

  const clearTable = useCallback(() => {
    if (busy) return
    clearReveal()
    setSelected(new Set())
    resetRound()
    setError(null)
    setNoChips(false)
  }, [busy, clearReveal, resetRound])

  const placeBet = useCallback(async () => {
    if (busy || picksCount === 0) return
    const stake = clampBet(bet)
    setBet(stake)
    setError(null)
    setNoChips(false)
    setPhase('betting')
    try {
      const res = await playKeno({
        picks: [...selected],
        risk,
        bet: stake,
        clientSeed: clientSeed.trim() || undefined,
      })
      setResult(res)
      setBalance(BigInt(res.chipBalance))
      setHistory((prev) =>
        [
          {
            roundId: res.roundId,
            bet: res.bet,
            risk: res.risk,
            picks: res.picks,
            drawn: res.drawn,
            hits: res.hits,
            multiplierX100: res.multiplierX100,
            payout: res.payout,
            serverSeedHash: res.serverSeedHash,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )

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
      setPhase('idle')
      const msg = (e as Error)?.message ?? ''
      if (/NO_CHIPS|Not enough chips|402/i.test(msg)) {
        setError('Not enough chips for that bet.')
        setNoChips(true)
      } else if (/401|auth/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not place the bet. Try again.')
      }
    }
  }, [busy, picksCount, selected, risk, bet, clientSeed, clampBet, clearReveal])

  const openVerify = useCallback((roundId: string | null) => {
    setVerifyTarget(roundId)
    setFairnessOpen(true)
  }, [])

  const profit = result ? result.payout - result.bet : 0
  const settled = resultHits !== null
  const showWinBanner = settled && result !== null && result.payout > 0

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ───────── Controls rail ───────── */}
        <Card className="arc-panel order-2 h-fit space-y-4 border-0 p-4 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-amber-300">
                {balance != null ? `${formatChips(balance)} chips` : '—'}
              </span>
              <button
                type="button"
                onClick={() => setExchangeOpen(true)}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Buy
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Bet amount{' '}
              <span className="normal-case text-slate-600">
                ({bounds.minBet.toLocaleString()}–{bounds.maxBet.toLocaleString()})
              </span>
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={bounds.minBet}
                max={bounds.maxBet}
                value={bet}
                disabled={busy}
                onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                onBlur={() => setBet((b) => clampBet(b))}
                className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                2×
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBet(bounds.maxBet)}
                className="border-cyan-950 bg-transparent px-2.5 text-xs hover:bg-cyan-500/10"
              >
                Max
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
                resetRound()
              }}
              disabled={busy}
            >
              <SelectTrigger className="border-cyan-950 bg-[#081420]">
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
              className="border-cyan-950 bg-transparent hover:bg-cyan-500/10"
            >
              Auto Pick
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || picksCount === 0}
              onClick={clearTable}
              className="border-cyan-950 bg-transparent hover:bg-cyan-500/10"
            >
              Clear
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="arc-mono tabular-nums">
              {picksCount}/{KENO_MAX_PICKS} selected
            </span>
            {picksCount > 0 && (
              <span>
                max{' '}
                <span className="arc-mono text-cyan-300">
                  {formatMultiplier(maxMultiplierX100)}
                </span>
              </span>
            )}
          </div>

          <Button
            type="button"
            disabled={busy || picksCount === 0}
            onClick={placeBet}
            className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
          >
            {phase === 'betting' ? 'Placing…' : phase === 'revealing' ? 'Drawing…' : 'Bet'}
          </Button>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-red-400">{error}</p>
              {noChips && (
                <button
                  type="button"
                  onClick={() => setExchangeOpen(true)}
                  className="text-sm font-semibold text-cyan-400 underline-offset-2 hover:underline"
                >
                  Buy chips →
                </button>
              )}
            </div>
          )}

          <div aria-live="polite">
            {result && settled && (
              <div
                className={[
                  'rounded-lg px-3 py-2 text-center text-sm',
                  profit > 0
                    ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/40'
                    : 'bg-[#081420] text-slate-400 ring-1 ring-cyan-950',
                ].join(' ')}
              >
                {result.hits} hit{result.hits === 1 ? '' : 's'} ·{' '}
                {result.payout > 0 ? (
                  <span className="arc-mono text-amber-300">
                    +{profit.toLocaleString()} chips ({formatMultiplier(result.multiplierX100)})
                  </span>
                ) : (
                  <span>no win</span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => openVerify(result?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-400"
          >
            Provably Fair{result ? ' · verify last round' : ''}
          </button>
        </Card>

        {/* ───────── Board + payouts ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="arc-panel relative border-0 p-3 sm:p-4">
            <KenoBoard
              selected={selected}
              drawn={revealed}
              settled={settled}
              disabled={busy}
              onToggle={toggleTile}
            />
            {showWinBanner && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="arc-banner-in arc-panel rounded-2xl border border-amber-400/40 px-8 py-5 text-center shadow-[0_0_60px_-12px_rgba(245,158,11,0.55)]">
                  <div className="arc-display text-3xl font-bold text-amber-300 sm:text-4xl">
                    {formatMultiplier(result.multiplierX100)}
                  </div>
                  <div className="arc-mono mt-1 text-sm tabular-nums text-amber-200/90">
                    +{profit.toLocaleString()} chips
                  </div>
                </div>
              </div>
            )}
          </Card>
          <KenoPayoutBar
            multipliers={multipliers}
            loadFailed={multipliersFailed}
            onRetry={loadMultipliers}
            risk={risk}
            picksCount={picksCount}
            resultHits={resultHits}
          />
        </div>
      </div>

      {/* ───────── History ───────── */}
      {address && (
        <div className="mt-4">
          <KenoHistory rounds={history} loading={historyLoading} onVerify={openVerify} />
        </div>
      )}

      <KenoFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false)
          setVerifyTarget(null)
        }}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        requestVerifyId={verifyTarget}
      />

      <PokerChipExchangeModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        walletAddress={address ?? null}
        onExchangeComplete={() => void refetchBalance()}
      />
    </div>
  )
}
