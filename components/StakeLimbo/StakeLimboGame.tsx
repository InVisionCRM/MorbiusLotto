'use client'

/**
 * StakeLimboGame — the interactive client for chips Limbo (/limbo2).
 *
 * Limbo: pick a target multiplier; the server draws a result multiplier
 * provably fairly and settles in one transaction. Win when result ≥ target,
 * paid bet × target.
 *
 * Firing model is StakePlinkoGame's: every click is one independent bet
 * (results are instant), requests pipeline up to MAX_IN_FLIGHT, and Auto
 * repeats at a fixed cadence WITHOUT serializing on the network round-trip.
 * Balance, history, session chart and the info tabs follow the same arcade2
 * conventions as plinko2/dice2/mines2.
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
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart'
import { FloatingPanel } from '@/components/arcade2/FloatingPanel'
import { AutoBetPanel } from '@/components/shared/AutoBetPanel'
import { useAutoBetStrategy } from '@/hooks/use-auto-bet-strategy'
import {
  defaultStrategy,
  stopReasonLabel,
  type AutoBetStrategy,
  type SettledRound,
} from '@/lib/auto-bet-strategy'
import { LimboInfoTabs } from './LimboInfoTabs'
import { LimboFairnessModal } from './LimboFairnessModal'
import { LimboRulesModal } from './LimboRulesModal'
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { limboAudio } from './limbo-audio'
import {
  fetchLimboInfo,
  fetchLimboHistory,
  playLimbo,
  formatMultiplier,
  limboWinChancePct,
  type LimboInfo,
  type LimboPlayResult,
  type LimboHistoryRound,
} from '@/lib/limbo-client'

const HISTORY_LIMIT = 25
const MAX_IN_FLIGHT = 8
const AUTO_INTERVAL_MS = 250
/** "∞" for the fast path, which counts down rather than running unbounded. */
const UNBOUNDED_AUTO = 100_000
const RECENT_LIMIT = 10
const TARGET_PRESETS_X100 = [200, 500, 1000, 10000] as const

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

interface RecentRound {
  key: number
  resultX100: number
  won: boolean
}

export function StakeLimboGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [info, setInfo] = useState<LimboInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [bet, setBet] = useState<number>(10)
  const [targetX100, setTargetX100] = useState<number>(200)

  const [lastRound, setLastRound] = useState<LimboPlayResult | null>(null)
  const [recent, setRecent] = useState<RecentRound[]>([])
  const [session, setSession] = useState<SessionPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoLeft, setAutoLeft] = useState<number | null>(null)
  const [strategy, setStrategy] = useState<AutoBetStrategy>(() => defaultStrategy(10))
  const [strategyNote, setStrategyNote] = useState<string | null>(null)

  const [muted, setMuted] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [history, setHistory] = useState<LimboHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Replay: a staged past round (confirm overlay) + a flag while its stored
  // result is re-shown. Replays never touch balance/history/session/recent.
  const [pendingReplay, setPendingReplay] = useState<LimboHistoryRound | null>(null)
  const [replaying, setReplaying] = useState(false)

  const roundSeq = useRef(0)
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
    fetchLimboInfo()
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
      .then((ok) => (ok ? fetchLimboHistory(HISTORY_LIMIT) : []))
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
  const minTargetX100 = info?.minTargetX100 ?? 101
  const maxTargetX100 = info?.maxTargetX100 ?? 100_000
  const houseEdgeBp = info?.houseEdgeBp ?? 0

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )
  const clampTarget = useCallback(
    (n: number) => Math.min(maxTargetX100, Math.max(minTargetX100, Math.floor(n || 0))),
    [minTargetX100, maxTargetX100],
  )

  const chancePct = limboWinChancePct(targetX100, houseEdgeBp)
  const winPayout = Math.floor((clampBet(bet) * targetX100) / 100)

  const stopAuto = useCallback(() => {
    autoLeftRef.current = null
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Fire one round. Returns the settled round, or null when the loop should
   * stop. `stakeOverride` lets the strategy loop stake what it decided rather
   * than whatever is in the bet field.
   */
  const playOnce = useCallback(async (stakeOverride?: number): Promise<SettledRound | null> => {
    if (!info) return null
    if (inFlight.current >= MAX_IN_FLIGHT) return { bet: 0, payout: 0 }
    const stake = clampBet(stakeOverride ?? bet)
    const target = clampTarget(targetX100)
    setBet(stake)
    setTargetX100(target)
    setError(null)
    setNoChips(false)
    // A real round exits any replay view.
    setPendingReplay(null)
    setReplaying(false)
    if (replayTimer.current) {
      clearTimeout(replayTimer.current)
      replayTimer.current = null
    }
    inFlight.current += 1
    limboAudio.init()
    limboAudio.playLaunch()
    try {
      const res = await playLimbo({
        bet: stake,
        targetX100: target,
      })
      if (!mounted.current) return null
      const profit = res.payout - res.bet
      reportWin({ game: 'Limbo', bet: res.bet, payout: res.payout })
      setBalance(BigInt(res.chipBalance))
      if (res.won) limboAudio.playWin()
      else limboAudio.playLose()
      setLastRound(res)
      setRecent((prev) =>
        [{ key: ++roundSeq.current, resultX100: res.resultX100, won: res.won }, ...prev].slice(
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
            resultX100: res.resultX100,
            won: res.won,
            payout: res.payout,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )
      return { bet: res.bet, payout: res.payout }
    } catch (e) {
      if (!mounted.current) return null
      const msg = (e as Error)?.message ?? ''
      if (/Not enough chips|insufficient|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not play the round. Try again.')
      }
      return null
    } finally {
      inFlight.current -= 1
    }
  }, [info, bet, targetX100, clampBet, clampTarget, reportWin])

  // Fixed-cadence auto loop — fire each round WITHOUT awaiting the round-trip
  // (same scheduler as plinko2/dice2). Errors stop the run.
  const autoTick = useCallback(() => {
    const left = autoLeftRef.current
    if (left == null || left <= 0 || !mounted.current) {
      stopAuto()
      return
    }
    if (inFlight.current < MAX_IN_FLIGHT) {
      autoLeftRef.current = left - 1
      setAutoLeft(left - 1)
      void playOnce().then((settled) => {
        if (!settled) stopAuto()
      })
    }
    if (autoLeftRef.current != null && autoLeftRef.current > 0) {
      autoTimer.current = setTimeout(autoTick, AUTO_INTERVAL_MS)
    } else {
      stopAuto()
    }
  }, [playOnce, stopAuto])

  const startAuto = useCallback(
    (count: number) => {
      if (autoLeftRef.current != null) return
      autoLeftRef.current = count
      setAutoLeft(count)
      autoTick()
    },
    [autoTick],
  )

  const betLimits = useMemo(() => ({ min: minBet, max: maxBet }), [minBet, maxBet])

  // ── Strategy autoplay ────────────────────────────────────────────────────
  // Serialized (one bet at a time) because each outcome sizes the next stake.
  // Plain autoplay keeps the fast pipelined path above.
  const strat = useAutoBetStrategy({
    strategy,
    limits: betLimits,
    intervalMs: AUTO_INTERVAL_MS,
    placeBet: useCallback(
      async (stake: number) => {
        const settled = await playOnce(stake)
        // bet === 0 is the "skipped, in-flight full" sentinel; it can't happen
        // on a serialized run, and counting it would corrupt the tally.
        if (!settled || settled.bet === 0) return null
        return settled
      },
      [playOnce],
    ),
    onStop: useCallback((reason, state) => {
      setStrategyNote(stopReasonLabel(reason, state.profit))
    }, []),
  })

  // Show the stake the strategy is about to place, so escalation is visible.
  useEffect(() => {
    if (strat.running) setBet(strat.run.nextBet)
  }, [strat.running, strat.run.nextBet])

  // The bet field is the strategy's base bet while idle — one number to set.
  useEffect(() => {
    if (!strat.running) setStrategy((s) => (s.baseBet === bet ? s : { ...s, baseBet: bet }))
  }, [bet, strat.running])

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  const toggleMute = () => {
    limboAudio.init()
    limboAudio.setMute(!muted)
    setMuted(!muted)
  }

  const autoRunning = autoLeft != null || strat.running
  const busy = autoRunning || replaying

  // ── Replay a past round: stage the confirm overlay, then re-show the exact
  // stored result (no server call, no balance/history/session/recent change). ──
  const handleReplay = useCallback(
    (round: LimboHistoryRound) => {
      if (busy) return
      limboAudio.init()
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
    // Align the odds strip target with the replayed round.
    setTargetX100(round.targetX100)
    limboAudio.init()
    limboAudio.playLaunch()
    // Re-show the stored result through the SAME reveal path (lastRound) — no
    // settle: no balance, no history/session/recent, no reportWin.
    setLastRound({
      roundId: round.roundId,
      bet: round.bet,
      targetX100: round.targetX100,
      resultX100: round.resultX100,
      won: round.won,
      payout: round.payout,
      serverSeedHash: '',
      chipBalance: '',
    })
    if (round.won) limboAudio.playWin()
    else limboAudio.playLose()
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
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
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
              Bet per round{' '}
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

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Target multiplier{' '}
              <span className="normal-case text-slate-600">
                ({formatMultiplier(minTargetX100)}–{formatMultiplier(maxTargetX100)})
              </span>
            </label>
            <Input
              type="number"
              step="0.01"
              min={minTargetX100 / 100}
              max={maxTargetX100 / 100}
              value={(targetX100 / 100).toString()}
              disabled={autoRunning}
              onChange={(e) =>
                setTargetX100(Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))
              }
              onBlur={() => setTargetX100((t) => clampTarget(t))}
              className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
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
                  {formatMultiplier(t)}
                </button>
              ))}
            </div>
          </div>

          {mode === 'auto' && (
            <>
              <AutoBetPanel
                strategy={strategy}
                onChange={setStrategy}
                disabled={autoRunning}
                status={strat.running ? strat.run : null}
              />
              {!strat.running && strategyNote && (
                <p className="text-xs text-slate-400">{strategyNote}</p>
              )}
            </>
          )}

          {/* Action button: pinned to a fixed bottom bar on mobile (Bet/Start/Stop always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || replaying}
              onClick={() => void playOnce()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Bet
            </Button>
          ) : autoRunning ? (
            <Button
              type="button"
              onClick={() => {
                stopAuto()
                strat.stop()
              }}
              className="arc-display h-12 w-full bg-rose-500 text-base font-bold uppercase tracking-widest text-[#1B0308] hover:bg-rose-400"
            >
              {strat.running ? `Stop · bet ${strat.run.betsPlaced}` : `Stop · ${autoLeft} left`}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!info || replaying}
              onClick={() => {
                setStrategyNote(null)
                // Flat betting with no stop conditions keeps the fast pipelined
                // loop; anything the strategy actually decides must serialize.
                if (strat.active) strat.start()
                else startAuto(strategy.bets ?? UNBOUNDED_AUTO)
              }}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Start auto{strategy.bets ? ` (${strategy.bets})` : ''}
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
              Provably Fair{history.length > 0 ? ' · verify last round' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Result display ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card ref={boardRef} className="arc-panel relative border-0 p-4 sm:p-6">
            <div className="flex min-h-[160px] items-center justify-center sm:min-h-[220px]" aria-live="polite">
              {lastRound ? (
                <div key={lastRound.roundId} className="arc-banner-in text-center">
                  <div
                    className={[
                      'arc-display text-6xl font-bold tabular-nums sm:text-7xl',
                      lastRound.won
                        ? 'text-cyan-300 drop-shadow-[0_0_22px_rgba(34,211,238,0.6)]'
                        : 'text-rose-400 drop-shadow-[0_0_16px_rgba(244,63,94,0.45)]',
                    ].join(' ')}
                  >
                    {formatMultiplier(lastRound.resultX100)}
                  </div>
                  <div className="arc-mono mt-2 text-sm tabular-nums">
                    {lastRound.won ? (
                      <span className="text-amber-300">
                        +{(lastRound.payout - lastRound.bet).toLocaleString()} MORBIUS at{' '}
                        {formatMultiplier(lastRound.targetX100)}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        needed {formatMultiplier(lastRound.targetX100)} or higher
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="arc-display text-2xl uppercase tracking-widest text-slate-600">
                  Clear {formatMultiplier(targetX100)} to win
                </span>
              )}
            </div>

            {/* Live odds strip */}
            <div className="mt-2 grid grid-cols-3 divide-x divide-cyan-950/60 rounded-xl bg-[#081420]/70 px-2 py-3 text-center ring-1 ring-cyan-950/70">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Win chance</div>
                <div className="arc-mono text-sm font-semibold tabular-nums text-slate-300 sm:text-base">
                  {chancePct.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Target</div>
                <div className="arc-mono text-sm font-semibold tabular-nums text-cyan-300 sm:text-base">
                  {formatMultiplier(targetX100)}
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
                title="Replay round"
                headline={formatMultiplier(pendingReplay.resultX100)}
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

          {/* Recent results strip — newest first. */}
          <div
            aria-live="polite"
            aria-label="Recent rounds"
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
                {formatMultiplier(c.resultX100)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <LimboInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="limbo2.sessionChart.pos">
        <SessionChart
          gameName="Limbo"
          points={session}
          unitLabel="Rounds"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchLimboHistory(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }));
          }}
        />
      </FloatingPanel>

      <LimboRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <LimboFairnessModal
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
