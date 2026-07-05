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
import { Volume2, VolumeX } from 'lucide-react'
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
import { GameWalletModal } from '@/components/shared/GameWalletModal'
import { probeSiweSession } from '@/lib/api-auth'
import { useBigWin } from '@/contexts/big-win-context'
import { kenoAudio } from './keno-audio'
import { KenoBoard } from './KenoBoard'
import { KenoHotNumbers } from './KenoHotNumbers'
import { KenoPayoutBar } from './KenoPayoutBar'
import { KenoFairnessModal } from './KenoFairnessModal'
import { KenoRulesModal } from './KenoRulesModal'
import { KenoInfoTabs } from './KenoInfoTabs'
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { playKenoDropReveal, type KenoRevealHandle } from './keno-ball-reveal'
import { useKenoRecent } from '@/hooks/use-keno-recent'
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
  const { reportWin } = useBigWin()

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
  const [muted, setMuted] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [history, setHistory] = useState<KenoHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Replay: a staged past round (confirm overlay) + the picks to show on the
  // board while re-running its draw. Replays never touch balance/history.
  const [pendingReplay, setPendingReplay] = useState<KenoHistoryRound | null>(null)
  const [replayPicks, setReplayPicks] = useState<Set<number> | null>(null)
  const [replaying, setReplaying] = useState(false)

  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  // Ball-draw reveal (real-keno "Drop" style): overlay stage + the live handle.
  const boardWrapRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const revealHandle = useRef<KenoRevealHandle | null>(null)
  // Hold-until-reveal: balance freezes during the draw and only updates when the
  // last ball lands. `holding` suppresses the background poll from clobbering it.
  const holdingBalance = useRef(false)
  // Autoplay: games remaining in the current batch + a cancel flag.
  const [autoLeft, setAutoLeft] = useState(0)
  const autoCancel = useRef(false)

  // Global feed: recent wins (tab) + hot numbers (strip under the board).
  const { recent, loading: recentLoading, refetch: refetchRecent } = useKenoRecent()

  // Balance: public read keyed by wallet address (no sign-in popup), then kept
  // fresh from authoritative play responses and exchange completions.
  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null)
  const [balance, setBalance] = useState<bigint | null>(null)
  useEffect(() => {
    if (holdingBalance.current) return // don't overwrite a held balance mid-reveal
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
    return () => {
      autoCancel.current = true
      revealTimers.current.forEach(clearTimeout)
      revealHandle.current?.cancel()
    }
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
  const autoRunning = autoLeft > 0
  const busy = phase !== 'idle' || autoRunning || replaying

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
    revealHandle.current?.cancel()
    revealHandle.current = null
    holdingBalance.current = false
  }, [])

  const resetRound = useCallback(() => {
    setResult(null)
    setRevealed(null)
    setResultHits(null)
    setReplayPicks(null)
  }, [])

  const toggleTile = useCallback(
    (n: number) => {
      if (busy) return
      kenoAudio.init()
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
          kenoAudio.playPick()
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

  // ── Replay a past round: stage the confirm overlay, then re-run the exact
  // same ball draw (no server call, no balance/history change). ──
  const handleReplay = useCallback(
    (round: KenoHistoryRound) => {
      if (busy) return
      kenoAudio.init()
      setPendingReplay(round)
      boardWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [busy],
  )

  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    clearReveal()
    setResult(null)
    setResultHits(null)
    setReplaying(true)
    setReplayPicks(new Set(round.picks))
    setRevealed(new Set())
    const done = () => {
      setResultHits(round.hits)
      setReplaying(false)
      if (round.payout > 0) kenoAudio.playWin()
      else kenoAudio.playLose()
    }
    const board = boardWrapRef.current
    const stage = stageRef.current
    if (board && stage) {
      revealHandle.current = playKenoDropReveal({
        board,
        stage,
        drawn: round.drawn,
        fast: false,
        onLand: (n) => {
          setRevealed((prev) => {
            const next = new Set(prev ?? [])
            next.add(n)
            return next
          })
          kenoAudio.playDraw()
        },
        onDone: done,
      })
    } else {
      setRevealed(new Set(round.drawn))
      done()
    }
  }, [pendingReplay, clearReveal])

  /**
   * Play a single round. `fast` (used by autoplay) collapses the cinematic ball
   * drop to an instant reveal + short pause so a batch of 10/25/50 doesn't take
   * minutes. Resolves true on success, false on error (so autoplay can stop).
   */
  const runRound = useCallback(
    (fast: boolean): Promise<boolean> =>
      new Promise((resolve) => {
        if (picksCount === 0) {
          resolve(false)
          return
        }
        kenoAudio.init()
        const stake = clampBet(bet)
        setBet(stake)
        setError(null)
        setNoChips(false)
        setPhase('betting')
        setReplayPicks(null) // a real round exits any replay view
        void (async () => {
          let res: KenoPlayResult
          try {
            res = await playKeno({
              picks: [...selected],
              risk,
              bet: stake,
              clientSeed: clientSeed.trim() || undefined,
            })
          } catch (e) {
            setPhase('idle')
            const msg = (e as Error)?.message ?? ''
            if (/NO_CHIPS|Not enough chips|402/i.test(msg)) {
              setError('Not enough MORBIUS for that bet.')
              setNoChips(true)
            } else if (/401|auth/i.test(msg)) {
              setError('Connect your wallet to play.')
            } else {
              setError(serverDetail(msg) ?? 'Could not place the bet. Try again.')
            }
            resolve(false)
            return
          }

          setResult(res)
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

          // Hold-until-reveal — balance only updates when the reveal finishes.
          clearReveal()
          setPhase('revealing')
          setRevealed(new Set())
          setResultHits(null)
          holdingBalance.current = true

          const settle = () => {
            holdingBalance.current = false
            try {
              setBalance(BigInt(res.chipBalance))
            } catch {
              /* keep last known */
            }
            setResultHits(res.hits)
            setPhase('idle')
            reportWin({ game: 'Keno', bet: res.bet, payout: res.payout })
            if (res.payout > 0) kenoAudio.playWin()
            else kenoAudio.playLose()
            void refetchRecent() // refresh hot numbers + recent-wins feed
            resolve(true)
          }

          const board = boardWrapRef.current
          const stage = stageRef.current
          if (board && stage) {
            // Same real-keno ball drop for both — autoplay just runs it faster.
            revealHandle.current = playKenoDropReveal({
              board,
              stage,
              drawn: res.drawn,
              fast,
              onLand: (n) => {
                setRevealed((prev) => {
                  const next = new Set(prev ?? [])
                  next.add(n)
                  return next
                })
                kenoAudio.playDraw()
              },
              onDone: settle,
            })
          } else {
            // Refs not ready — reveal instantly so play never stalls.
            setRevealed(new Set(res.drawn))
            const t = setTimeout(settle, fast ? 200 : 520)
            revealTimers.current.push(t)
          }
        })()
      }),
    [picksCount, selected, risk, bet, clientSeed, clampBet, clearReveal, refetchRecent, reportWin],
  )

  const placeBet = useCallback(async () => {
    if (busy) return
    await runRound(false)
  }, [busy, runRound])

  const stopAuto = useCallback(() => {
    autoCancel.current = true
  }, [])

  const startAuto = useCallback(
    async (count: number) => {
      if (busy || autoLeft > 0 || picksCount === 0) return
      kenoAudio.init()
      autoCancel.current = false
      for (let i = 0; i < count; i++) {
        if (autoCancel.current) break
        setAutoLeft(count - i)
        const ok = await runRound(true)
        if (!ok || autoCancel.current) break
        // Brief beat between games (the reveal itself already paces things).
        await new Promise<void>((r) => {
          const t = setTimeout(() => r(), 300)
          revealTimers.current.push(t)
        })
      }
      setAutoLeft(0)
      autoCancel.current = false
    },
    [busy, autoLeft, picksCount, runRound],
  )

  const openVerify = useCallback((roundId: string | null) => {
    setVerifyTarget(roundId)
    setFairnessOpen(true)
  }, [])

  const toggleMute = () => {
    kenoAudio.init()
    kenoAudio.setMute(!muted)
    setMuted(!muted)
  }

  const profit = result ? result.payout - result.bet : 0
  const settled = resultHits !== null
  const showWinBanner = settled && result !== null && result.payout > 0

  return (
    <div className="mx-auto w-full max-w-5xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ───────── Controls rail ───────── */}
        <Card className="arc-panel order-2 h-fit space-y-4 border-0 p-4 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-amber-300">
                {balance != null ? `${formatChips(balance)} MORBIUS` : '—'}
              </span>
              <button
                type="button"
                onClick={() => setExchangeOpen(true)}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
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

          {/* Autoplay: run a fixed batch of rounds back-to-back (fast reveal). */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">Autoplay</label>
            {autoRunning ? (
              <Button
                type="button"
                onClick={stopAuto}
                className="h-10 w-full bg-rose-500/90 text-sm font-bold uppercase tracking-wider text-white hover:bg-rose-500"
              >
                Stop · {autoLeft} left
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[10, 25, 50].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    disabled={busy || picksCount === 0}
                    onClick={() => void startAuto(n)}
                    className="border-cyan-950 bg-transparent font-semibold tabular-nums hover:bg-cyan-500/10"
                  >
                    {n}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Action button: pinned to a fixed bottom bar on mobile (Bet always reachable
              without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <Button
              type="button"
              disabled={busy || picksCount === 0}
              onClick={placeBet}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {autoRunning
                ? `Auto-playing · ${autoLeft}`
                : phase === 'betting'
                  ? 'Placing…'
                  : phase === 'revealing'
                    ? 'Drawing…'
                    : 'Bet'}
            </Button>
          </div>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-red-400">{error}</p>
              {noChips && (
                <button
                  type="button"
                  onClick={() => setExchangeOpen(true)}
                  className="text-sm font-semibold text-cyan-400 underline-offset-2 hover:underline"
                >
                  Deposit MORBIUS
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
                    +{profit.toLocaleString()} MORBIUS ({formatMultiplier(result.multiplierX100)})
                  </span>
                ) : (
                  <span>no win</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button type="button" onClick={() => openVerify(result?.roundId ?? null)} className="transition-colors hover:text-cyan-400">
              Provably Fair{result ? ' · verify last round' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Board + payouts ───────── */}
        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          {/* Board + hot-numbers strip kept tight together (attached look). */}
          <div className="space-y-1.5">
            <Card className="arc-panel relative border-0 p-3 sm:p-4">
              {/* Wrapper bounds the tile grid; the ball-draw overlay sits on top. */}
              <div ref={boardWrapRef} className="relative">
                <KenoBoard
                  selected={replayPicks ?? selected}
                  drawn={revealed}
                  settled={settled}
                  disabled={busy}
                  onToggle={toggleTile}
                />
                <div
                  ref={stageRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
                />
              </div>
              {showWinBanner && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                  <div className="arc-banner-in arc-panel rounded-2xl border border-amber-400/40 px-8 py-5 text-center shadow-[0_0_60px_-12px_rgba(245,158,11,0.55)]">
                    <div className="arc-display text-3xl font-bold text-amber-300 sm:text-4xl">
                      {formatMultiplier(result.multiplierX100)}
                    </div>
                    <div className="arc-mono mt-1 text-sm tabular-nums text-amber-200/90">
                      +{profit.toLocaleString()} MORBIUS
                    </div>
                  </div>
                </div>
              )}
              {pendingReplay && (
                <ReplayConfirmOverlay
                  title="Replay draw"
                  headline={formatMultiplier(pendingReplay.multiplierX100)}
                  sub={`${
                    pendingReplay.payout - pendingReplay.bet > 0
                      ? `+${(pendingReplay.payout - pendingReplay.bet).toLocaleString()}`
                      : (pendingReplay.payout - pendingReplay.bet).toLocaleString()
                  } MORBIUS`}
                  onPlay={startReplay}
                  onCancel={() => setPendingReplay(null)}
                />
              )}
            </Card>
            <KenoHotNumbers hot={recent.hotNumbers} />
          </div>
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
          <KenoInfoTabs
            rounds={history}
            loading={historyLoading}
            onVerify={openVerify}
            onReplay={handleReplay}
            recentWins={recent.wins}
            recentLoading={recentLoading}
          />
        </div>
      )}

      <KenoRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
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

      <GameWalletModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        defaultTab="deposit"
        balanceLabel="MORBIUS"
        onBalanceSync={async () => { await refetchBalance(); }}
      />
    </div>
  )
}
