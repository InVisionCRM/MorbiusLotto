'use client'

/**
 * StakeDiceGame — the interactive client for chips Dice (/dice2).
 *
 * Roll-under dice: pick a target (0.00–99.99); the server draws the roll
 * provably fairly and settles in one transaction. Win when roll < target,
 * paid bet × floor((10000 − edge) × 100 / targetX100) / 100.
 *
 * Firing model is StakePlinkoGame's: every click is one independent bet
 * (results are instant — no physics), balls of work pipeline up to
 * MAX_IN_FLIGHT, and Auto repeats at a fixed cadence WITHOUT serializing on
 * the network round-trip. Balance, history, session chart and the info tabs
 * follow the same arcade2 conventions as plinko2/mines2.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { Volume2, VolumeX } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance'
import { formatChips } from '@/lib/format-poker-chips'
import { GameWalletModal } from '@/components/shared/GameWalletModal'
import { probeSiweSession } from '@/lib/api-auth'
import { useBigWin } from '@/contexts/big-win-context'
import { ArcadeFairnessStrip } from '@/components/shared/ArcadeFairnessStrip'
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart'
import { FloatingPanel } from '@/components/arcade2/FloatingPanel'
import { DiceInfoTabs } from './DiceInfoTabs'
import { DiceFairnessModal } from './DiceFairnessModal'
import { DiceRulesModal } from './DiceRulesModal'
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { diceAudio } from './dice-audio'
import {
  fetchDiceInfo,
  fetchDiceHistory,
  playDice,
  formatMultiplier,
  formatX100,
  diceWinChancePct,
  diceMultiplierX100,
  type DiceInfo,
  type DicePlayResult,
  type DiceHistoryRound,
} from '@/lib/dice-client'

const HISTORY_LIMIT = 25
const MAX_IN_FLIGHT = 8
const AUTO_INTERVAL_MS = 250
const AUTO_COUNTS = [10, 25, 50, 100] as const
const RECENT_LIMIT = 10
const TARGET_PRESETS_X100 = [2500, 5000, 7500] as const

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

interface RecentRoll {
  key: number
  rollX100: number
  won: boolean
}

export function StakeDiceGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [info, setInfo] = useState<DiceInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [bet, setBet] = useState<number>(10)
  const [targetX100, setTargetX100] = useState<number>(5000)

  const [lastRoll, setLastRoll] = useState<DicePlayResult | null>(null)
  const [recent, setRecent] = useState<RecentRoll[]>([])
  const [session, setSession] = useState<SessionPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<DiceHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Replay: a staged past round (confirm overlay) + a flag while its stored
  // roll is re-shown. Replays never touch balance/history/session/recent.
  const [pendingReplay, setPendingReplay] = useState<DiceHistoryRound | null>(null)
  const [replaying, setReplaying] = useState(false)

  const rollSeq = useRef(0)
  const inFlight = useRef(0)
  const autoLeftRef = useRef<number | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const mounted = useRef(true)

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

  const loadInfo = useCallback(() => {
    setInfoFailed(false)
    fetchDiceInfo()
      .then((i) => {
        setInfo(i)
        setBet((b) => Math.min(i.maxBet, Math.max(i.minBet, b)))
        setTargetX100((t) => Math.min(i.maxTargetX100, Math.max(i.minTargetX100, t)))
      })
      .catch(() => setInfoFailed(true))
  }, [])

  useEffect(() => {
    mounted.current = true
    loadInfo()
    return () => {
      mounted.current = false
      if (autoTimer.current) clearTimeout(autoTimer.current)
      if (replayTimer.current) clearTimeout(replayTimer.current)
    }
  }, [loadInfo])

  // History: only fetch once a session provably exists (never pop a sign-in on load).
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    probeSiweSession()
      .then((ok) => (ok ? fetchDiceHistory(HISTORY_LIMIT) : []))
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

  const minBet = info?.minBet ?? 1
  const maxBet = info?.maxBet ?? 1_000
  const minTargetX100 = info?.minTargetX100 ?? 200
  const maxTargetX100 = info?.maxTargetX100 ?? 9800
  const houseEdgeBp = info?.houseEdgeBp ?? 0

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )
  const clampTarget = useCallback(
    (n: number) => Math.min(maxTargetX100, Math.max(minTargetX100, Math.floor(n || 0))),
    [minTargetX100, maxTargetX100],
  )

  const multX100 = useMemo(
    () => diceMultiplierX100(targetX100, houseEdgeBp),
    [targetX100, houseEdgeBp],
  )
  const chancePct = diceWinChancePct(targetX100)
  const winPayout = Math.floor((clampBet(bet) * multX100) / 100)

  const stopAuto = useCallback(() => {
    autoLeftRef.current = null
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /** Fire one independent roll. Returns false when the loop should stop. */
  const rollOnce = useCallback(async (): Promise<boolean> => {
    if (inFlight.current >= MAX_IN_FLIGHT || !info) return true
    const stake = clampBet(bet)
    const target = clampTarget(targetX100)
    setBet(stake)
    setTargetX100(target)
    setError(null)
    setNoChips(false)
    // A real roll exits any replay view.
    setPendingReplay(null)
    setReplaying(false)
    if (replayTimer.current) {
      clearTimeout(replayTimer.current)
      replayTimer.current = null
    }
    inFlight.current += 1
    diceAudio.init()
    diceAudio.playRoll()
    try {
      const res = await playDice({
        bet: stake,
        targetX100: target,
      })
      if (!mounted.current) return false
      const profit = res.payout - res.bet
      reportWin({ game: 'Dice', bet: res.bet, payout: res.payout })
      if (profit > 0) diceAudio.playWin()
      else diceAudio.playLose()
      setBalance(BigInt(res.chipBalance))
      setLastRoll(res)
      setRecent((prev) =>
        [{ key: ++rollSeq.current, rollX100: res.rollX100, won: res.won }, ...prev].slice(
          0,
          RECENT_LIMIT,
        ),
      )
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: res.bet, profit }])
      setHistory((prev) =>
        [
          {
            roundId: res.roundId,
            bet: res.bet,
            targetX100: res.targetX100,
            rollX100: res.rollX100,
            multiplierX100: res.multiplierX100,
            won: res.won,
            payout: res.payout,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )
      return true
    } catch (e) {
      if (!mounted.current) return false
      const msg = (e as Error)?.message ?? ''
      if (/Not enough chips|insufficient|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not play the roll. Try again.')
      }
      return false
    } finally {
      inFlight.current -= 1
    }
  }, [info, bet, targetX100, clampBet, clampTarget, reportWin])

  // Fixed-cadence auto loop — fire each roll WITHOUT awaiting the round-trip
  // (same scheduler as plinko2). Errors stop the run.
  const autoTick = useCallback(() => {
    const left = autoLeftRef.current
    if (left == null || left <= 0 || !mounted.current) {
      stopAuto()
      return
    }
    if (inFlight.current < MAX_IN_FLIGHT) {
      autoLeftRef.current = left - 1
      setAutoLeft(left - 1)
      void rollOnce().then((ok) => {
        if (!ok) stopAuto()
      })
    }
    if (autoLeftRef.current != null && autoLeftRef.current > 0) {
      autoTimer.current = setTimeout(autoTick, AUTO_INTERVAL_MS)
    } else {
      stopAuto()
    }
  }, [rollOnce, stopAuto])

  const startAuto = useCallback(() => {
    if (autoLeftRef.current != null) return
    autoLeftRef.current = autoCount
    setAutoLeft(autoCount)
    autoTick()
  }, [autoCount, autoTick])

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  const toggleMute = useCallback(() => {
    diceAudio.init()
    setMuted((m) => {
      diceAudio.setMute(!m)
      return !m
    })
  }, [])

  const autoRunning = autoLeft != null
  const busy = autoRunning || replaying

  // ── Replay a past roll: stage the confirm overlay, then re-show the exact
  // stored roll (no server call, no balance/history/session/recent change). ──
  const handleReplay = useCallback(
    (round: DiceHistoryRound) => {
      if (busy) return
      diceAudio.init()
      setPendingReplay(round)
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [busy],
  )

  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    setError(null)
    setNoChips(false)
    setReplaying(true)
    // Align the win-zone track/marker with the replayed target.
    setTargetX100(round.targetX100)
    diceAudio.init()
    diceAudio.playRoll()
    // Re-show the stored roll through the SAME reveal path (lastRoll) — no
    // settle: no balance, no history/session/recent, no reportWin.
    setLastRoll({
      roundId: round.roundId,
      bet: round.bet,
      targetX100: round.targetX100,
      rollX100: round.rollX100,
      multiplierX100: round.multiplierX100,
      won: round.won,
      payout: round.payout,
      serverSeedHash: '',
      chipBalance: '',
    })
    if (round.won) diceAudio.playWin()
    else diceAudio.playLose()
    if (replayTimer.current) clearTimeout(replayTimer.current)
    replayTimer.current = setTimeout(() => {
      if (mounted.current) setReplaying(false)
    }, 600)
  }, [pendingReplay])

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-0">
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
                aria-label={muted ? 'Unmute sound' : 'Mute sound'}
                className="rounded border border-cyan-950 bg-transparent p-1 text-slate-500 transition-colors hover:text-cyan-300"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Bet mode">
            {(['manual', 'auto'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={autoRunning}
                onClick={() => setMode(m)}
                className={[
                  'arc-display rounded-md py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors',
                  mode === m
                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50'
                    : 'text-slate-500 ring-1 ring-cyan-950 hover:text-slate-300',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Bet per roll{' '}
              <span className="normal-case text-slate-600">
                ({minBet.toLocaleString()}–{maxBet.toLocaleString()})
              </span>
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={minBet}
                max={maxBet}
                value={bet}
                disabled={autoRunning}
                onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                onBlur={() => setBet((b) => clampBet(b))}
                className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                disabled={autoRunning}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={autoRunning}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                2×
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={autoRunning}
                onClick={() => setBet(maxBet)}
                className="border-cyan-950 bg-transparent px-2.5 text-xs hover:bg-cyan-500/10"
              >
                Max
              </Button>
            </div>
          </div>

          {mode === 'auto' && (
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-slate-500">Number of rolls</label>
              <div className="grid grid-cols-4 gap-2">
                {AUTO_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={autoRunning}
                    onClick={() => setAutoCount(n)}
                    className={[
                      'arc-mono rounded-md py-1.5 text-xs tabular-nums transition-colors',
                      autoCount === n
                        ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50'
                        : 'text-slate-500 ring-1 ring-cyan-950 hover:text-slate-300',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action button: pinned to a fixed bottom bar on mobile (Roll/Start/Stop always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || replaying}
              onClick={() => void rollOnce()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Roll
            </Button>
          ) : autoRunning ? (
            <Button
              type="button"
              onClick={stopAuto}
              className="arc-display h-12 w-full bg-rose-500 text-base font-bold uppercase tracking-widest text-[#1B0308] hover:bg-rose-400"
            >
              Stop · {autoLeft} left
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!info || replaying}
              onClick={startAuto}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Start auto ({autoCount})
            </Button>
          )}
          </div>

          {infoFailed && (
            <p className="text-center text-sm text-slate-400">
              Couldn&apos;t load the game config.{' '}
              <button
                type="button"
                onClick={loadInfo}
                className="font-semibold text-cyan-400 underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </p>
          )}

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

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button type="button" onClick={() => openVerify(history[0]?.roundId ?? null)} className="transition-colors hover:text-cyan-400">
              Provably Fair{history.length > 0 ? ' · verify last roll' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Roll display + target ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card ref={boardRef} className="arc-panel relative border-0 p-4 sm:p-6">
            {/* Last roll readout */}
            <div className="flex min-h-[96px] items-center justify-center" aria-live="polite">
              {lastRoll ? (
                <div key={lastRoll.roundId} className="arc-banner-in text-center">
                  <div
                    className={[
                      'arc-display text-5xl font-bold tabular-nums sm:text-6xl',
                      lastRoll.won
                        ? 'text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.6)]'
                        : 'text-rose-400 drop-shadow-[0_0_14px_rgba(244,63,94,0.45)]',
                    ].join(' ')}
                  >
                    {formatX100(lastRoll.rollX100)}
                  </div>
                  <div className="arc-mono mt-1 text-sm tabular-nums">
                    {lastRoll.won ? (
                      <span className="text-amber-300">
                        +{(lastRoll.payout - lastRoll.bet).toLocaleString()} MORBIUS (
                        {formatMultiplier(lastRoll.multiplierX100)})
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        needed under {formatX100(lastRoll.targetX100)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="arc-display text-2xl uppercase tracking-widest text-slate-600">
                  Roll under {formatX100(targetX100)}
                </span>
              )}
            </div>

            {/* Win-zone track: cyan = under target (win), rose = over (lose), dot = last roll. */}
            <div className="relative mt-4 h-3 w-full rounded-full bg-rose-500/15 ring-1 ring-cyan-950">
              <div
                className="absolute inset-y-0 left-0 rounded-l-full bg-cyan-500/30"
                style={{ width: `${targetX100 / 100}%` }}
              />
              <div
                className="absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                style={{ left: `calc(${targetX100 / 100}% - 1px)` }}
                aria-hidden
              />
              {lastRoll && (
                <div
                  key={lastRoll.roundId}
                  className={[
                    'arc-banner-in absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2',
                    lastRoll.won
                      ? 'bg-cyan-300 ring-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.8)]'
                      : 'bg-rose-400 ring-rose-500/60 shadow-[0_0_8px_1px_rgba(244,63,94,0.6)]',
                  ].join(' ')}
                  style={{ left: `${lastRoll.rollX100 / 100}%` }}
                  aria-hidden
                />
              )}
            </div>

            {/* Target slider + presets */}
            <div className="mt-4 space-y-2">
              <input
                type="range"
                min={minTargetX100}
                max={maxTargetX100}
                step={50}
                value={targetX100}
                disabled={autoRunning}
                onChange={(e) => setTargetX100(clampTarget(parseInt(e.target.value, 10)))}
                aria-label="Roll-under target"
                className="w-full accent-cyan-400"
              />
              <div className="flex gap-1.5">
                {TARGET_PRESETS_X100.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={autoRunning}
                    onClick={() => setTargetX100(clampTarget(t))}
                    className={[
                      'arc-mono flex-1 rounded-md py-1 text-xs tabular-nums transition-colors',
                      targetX100 === t
                        ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50'
                        : 'text-slate-500 ring-1 ring-cyan-950 hover:text-slate-300',
                    ].join(' ')}
                  >
                    &lt; {formatX100(t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Live odds strip */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-cyan-950/60 rounded-xl bg-[#081420]/70 px-2 py-3 text-center ring-1 ring-cyan-950/70">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Win chance</div>
                <div className="arc-mono text-sm font-semibold tabular-nums text-slate-300 sm:text-base">
                  {chancePct.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Multiplier</div>
                <div className="arc-mono text-sm font-semibold tabular-nums text-cyan-300 sm:text-base">
                  {formatMultiplier(multX100)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Win pays</div>
                <div className="arc-mono text-sm font-semibold tabular-nums text-amber-300 sm:text-base">
                  {winPayout.toLocaleString()}
                </div>
              </div>
            </div>

            {pendingReplay && (
              <ReplayConfirmOverlay
                title="Replay roll"
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

          {/* Recent rolls strip — newest first. */}
          <div
            aria-live="polite"
            aria-label="Recent rolls"
            className="flex min-h-[2rem] flex-wrap items-center gap-1.5"
          >
            {recent.map((c) => (
              <span
                key={c.key}
                className={[
                  'arc-banner-in arc-mono rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1',
                  c.won
                    ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
                    : 'bg-[#081420] text-rose-400/80 ring-cyan-950',
                ].join(' ')}
              >
                {formatX100(c.rollX100)}
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* Always-visible fairness bar — active seed pair + commitment. */}
      <ArcadeFairnessStrip onOpenPanel={() => setFairnessOpen(true)} />

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <DiceInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="dice2.sessionChart.pos">
        <SessionChart
          gameName="Dice"
          points={session}
          unitLabel="Rolls"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchDiceHistory(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }));
          }}
        />
      </FloatingPanel>

      <DiceRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <DiceFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false)
          setVerifyTarget(null)
        }}
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
