'use client'

/**
 * StakePlinkoGame — the interactive client for server-side chips Plinko.
 *
 * The board itself is the existing PlinkoGame canvas (Matter.js physics,
 * pegs, buckets, sounds — untouched). This component replaces the on-chain
 * transaction flow with /api/plinko/play: the server decides the bucket
 * provably fairly; the canvas replays a deterministic drop into that bucket
 * via its seed-database mechanism, exactly like contract mode always has.
 *
 * Stake-style firing model:
 *   • Manual — every click is one independent bet, fired immediately. Balls
 *     fly concurrently (they don't collide with each other); a soft in-flight
 *     cap keeps a stuck network from queueing unbounded bets.
 *   • Auto — repeats single bets at a fixed cadence for a chosen count.
 *     Stops on any error (including running out of chips) or on Stop.
 *
 * Wiring notes (same conventions as StakeKenoGame):
 *   • Bet bounds come from /api/plinko/info; local fallbacks cover the window.
 *   • Balance reads use the public chips endpoint (no sign-in popup on load),
 *     then every play response keeps it authoritative.
 *   • History loads only after probeSiweSession() confirms a session and is
 *     prepended live as balls settle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { Volume2, VolumeX, Play, X } from 'lucide-react'
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
import PlinkoGame from '@/components/PLINKO/PlinkoGame'
import type { RiskLevel } from '@/app/PLINKO/types'
import { PlinkoInfoTabs } from './PlinkoInfoTabs'
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
import { PlinkoFairnessModal } from './PlinkoFairnessModal'
import { PlinkoRulesModal } from './PlinkoRulesModal'
import { plinkoAudio } from './plinko-audio'
import {
  fetchPlinkoInfo,
  fetchPlinkoMultipliers,
  fetchPlinkoHistory,
  playPlinko,
  formatMultiplier,
  PLINKO_RISKS,
  PLINKO_RISK_LABELS,
  PLINKO_RISK_TO_BOARD,
  type PlinkoMultipliers,
  type PlinkoRisk,
  type PlinkoHistoryRound,
} from '@/lib/plinko-client'

const HISTORY_LIMIT = 25
const MAX_IN_FLIGHT = 8
const AUTO_INTERVAL_MS = 250
/** "∞" for the fast path, which counts down rather than running unbounded. */
const UNBOUNDED_AUTO = 100_000
const RECENT_LIMIT = 10

/** "402 Payment Required: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

interface BoardDrop {
  id: number
  risk: RiskLevel
  contractResult: {
    /** Picks the deterministic replay seed inside PlinkoGame (BigInt-safe int). */
    seed: number
    bucket: number
    /** Decimal multiplier — PlinkoGame uses it for the win/lose landing sound. */
    multiplier: number
    multiplierX100: number
    bet: number
    payout: number
    roundId: string
    /** True when this drop is a visual replay of a past ball — no balance/session effect. */
    isReplay?: boolean
  }
}

interface RecentChip {
  key: number
  multiplierX100: number
  profit: number
}

export function StakePlinkoGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [multipliers, setMultipliers] = useState<PlinkoMultipliers | null>(null)
  const [bounds, setBounds] = useState({ minBet: 1, maxBet: 1_000 })

  const [risk, setRisk] = useState<PlinkoRisk>('low')
  const [bet, setBet] = useState<number>(10)

  const [lastDrop, setLastDrop] = useState<BoardDrop | null>(null)
  const [recent, setRecent] = useState<RecentChip[]>([])
  const [session, setSession] = useState<SessionPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoLeft, setAutoLeft] = useState<number | null>(null)
  const [strategy, setStrategy] = useState<AutoBetStrategy>(() => defaultStrategy(10))
  const [strategyNote, setStrategyNote] = useState<string | null>(null)
  // Read inside the stop callback, which outlives the render that armed it.
  const strategyRef = useRef(strategy)
  strategyRef.current = strategy

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  // A replay staged by tapping "Replay" in history — shows a centered Play
  // prompt on the board so the drop only starts when the player hits Play
  // (gives them a beat to start screen-recording).
  const [pendingReplay, setPendingReplay] = useState<PlinkoHistoryRound | null>(null)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<PlinkoHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const dropSeq = useRef(0)
  const chipSeq = useRef(0)
  const inFlight = useRef(0)
  // Balls released onto the board (server-settled) but not yet landed in a
  // bucket. Their balance change is held back until the land so the displayed
  // balance doesn't jump the moment the ball drops (keeps the anticipation).
  const airborne = useRef(0)
  const autoLeftRef = useRef<number | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  // The board container — a replay scrolls it into view so the drop is
  // recordable even when the tap came from the history panel below the fold.
  const boardRef = useRef<HTMLDivElement>(null)

  // Balance: public read keyed by wallet address (no sign-in popup), then kept
  // fresh from authoritative play responses and exchange completions.
  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null)
  const [balance, setBalance] = useState<bigint | null>(null)
  useEffect(() => {
    if (chainBalance != null) {
      // Don't overwrite the on-screen balance while balls are mid-flight or
      // airborne — it must stay frozen until each ball lands (the land applies
      // the net delta). Reconcile to the authoritative read only when idle.
      if (inFlight.current === 0 && airborne.current === 0) {
        try {
          setBalance(BigInt(chainBalance.split('.')[0] || '0'))
        } catch {
          /* keep last known */
        }
      }
    } else if (!address) {
      setBalance(null)
    }
  }, [chainBalance, address])

  // Self-heal safety net: a short while after the last drop, clear any leaked
  // airborne count and pull the authoritative server balance. Guarantees the
  // on-screen number can never get stuck if a ball's land event is missed or
  // malformed (re-armed on every drop, cleared once everything settles).
  const armReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current)
    reconcileTimer.current = setTimeout(() => {
      airborne.current = 0
      void refetchBalance()
    }, 4000)
  }, [refetchBalance])

  // Tables + bounds (public) on mount.
  useEffect(() => {
    mounted.current = true
    fetchPlinkoMultipliers().then(setMultipliers).catch(() => setMultipliers(null))
    fetchPlinkoInfo()
      .then((info) => {
        if (Number.isFinite(info.minBet) && Number.isFinite(info.maxBet)) {
          setBounds({ minBet: info.minBet, maxBet: info.maxBet })
        }
      })
      .catch(() => {
        /* keep defaults — server still enforces */
      })
    return () => {
      mounted.current = false
      if (autoTimer.current) clearTimeout(autoTimer.current)
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current)
    }
  }, [])

  // History: only fetch once a session provably exists (never pop a sign-in on load).
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    probeSiweSession()
      .then((ok) => (ok ? fetchPlinkoHistory(HISTORY_LIMIT) : []))
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

  const clampBet = useCallback(
    (n: number) => Math.min(bounds.maxBet, Math.max(bounds.minBet, Math.floor(n || 0))),
    [bounds],
  )

  const stopAuto = useCallback(() => {
    autoLeftRef.current = null
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Fire one ball. Returns the settled round, or null when the loop should
   * stop. `stakeOverride` lets the strategy loop stake what it decided rather
   * than whatever is in the bet field.
   */
  const dropBall = useCallback(async (stakeOverride?: number): Promise<SettledRound | null> => {
    if (inFlight.current >= MAX_IN_FLIGHT) return { bet: 0, payout: 0 }
    plinkoAudio.init()
    const stake = clampBet(stakeOverride ?? bet)
    setBet(stake)
    setError(null)
    setNoChips(false)
    inFlight.current += 1
    try {
      const res = await playPlinko({
        risk,
        bet: stake,
      })
      if (!mounted.current) return null
      // NB: the balance is deliberately NOT updated here. The bet is already
      // settled server-side, but on screen we hold the change until the ball
      // lands (handleScore) so the balance moves with the result, not the drop.
      setHistory((prev) =>
        [
          {
            roundId: res.roundId,
            bet: res.bet,
            risk: res.risk,
            path: res.path,
            bucket: res.bucket,
            multiplierX100: res.multiplierX100,
            payout: res.payout,
            serverSeedHash: res.serverSeedHash,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )
      setLastDrop({
        id: ++dropSeq.current,
        risk: PLINKO_RISK_TO_BOARD[res.risk],
        contractResult: {
          seed: parseInt(res.serverSeedHash.slice(0, 12), 16),
          bucket: res.bucket,
          multiplier: res.multiplierX100 / 100,
          multiplierX100: res.multiplierX100,
          bet: res.bet,
          payout: res.payout,
          roundId: res.roundId,
        },
      })
      // Ball is now on the board; its balance change is applied when it lands.
      airborne.current += 1
      armReconcile()
      plinkoAudio.playDrop()
      return { bet: res.bet, payout: res.payout }
    } catch (e) {
      if (!mounted.current) return null
      const msg = (e as Error)?.message ?? ''
      if (/NO_CHIPS|Not enough chips|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not drop the ball. Try again.')
      }
      return null
    } finally {
      inFlight.current -= 1
    }
  }, [bet, risk, clampBet, armReconcile])

  // Fixed-cadence scheduler: fire each ball WITHOUT awaiting the server
  // round-trip (the old loop serialized RTT + interval, ~1.5s/ball). Balls
  // pipeline concurrently up to MAX_IN_FLIGHT; a saturated pipe holds the
  // beat without consuming a ball; any error stops the run.
  const autoTick = useCallback(() => {
    const left = autoLeftRef.current
    if (left == null || left <= 0 || !mounted.current) {
      stopAuto()
      return
    }
    if (inFlight.current < MAX_IN_FLIGHT) {
      autoLeftRef.current = left - 1
      setAutoLeft(left - 1)
      void dropBall().then((settled) => {
        if (!settled) stopAuto()
      })
    }
    if (autoLeftRef.current != null && autoLeftRef.current > 0) {
      autoTimer.current = setTimeout(autoTick, AUTO_INTERVAL_MS)
    } else {
      stopAuto()
    }
  }, [dropBall, stopAuto])

  const startAuto = useCallback(
    (count: number) => {
      if (autoLeftRef.current != null) return
      autoLeftRef.current = count
      setAutoLeft(count)
      autoTick()
    },
    [autoTick],
  )

  const betLimits = useMemo(
    () => ({ min: bounds.minBet, max: bounds.maxBet }),
    [bounds.minBet, bounds.maxBet],
  )

  // ── Strategy autoplay ────────────────────────────────────────────────────
  // Serialized (one bet at a time) because each outcome sizes the next stake.
  // Plain autoplay keeps the fast pipelined path above.
  const strat = useAutoBetStrategy({
    strategy,
    limits: betLimits,
    intervalMs: AUTO_INTERVAL_MS,
    placeBet: useCallback(
      async (stake: number) => {
        const settled = await dropBall(stake)
        // bet === 0 is the "skipped, in-flight full" sentinel; it can't happen
        // on a serialized run, and counting it would corrupt the tally.
        if (!settled || settled.bet === 0) return null
        return settled
      },
      [dropBall],
    ),
    onStop: useCallback((reason, state) => {
      setStrategyNote(stopReasonLabel(reason, state.profit))
      // Restore the CONFIGURED base bet. The bet field mirrors the escalating
      // stake while a run goes; without this the last escalated stake would
      // become the new base — a martingale that ended at 320 would start the
      // next run (and the next manual bet) at 320 instead of 10.
      setBet(strategyRef.current.baseBet)
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

  /** Lands feed the recent-results strip + session chart (server data rode along on the ball). */
  const handleScore = useCallback(
    (_multiplier: number, _bucketIndex: number, contractData?: BoardDrop['contractResult'] & { risk?: RiskLevel }) => {
      // Replays are a pure re-watch of a past ball: they were never charged and
      // never incremented `airborne`, so they must NOT touch balance, the
      // airborne count, the recent strip, or the session chart. Just play the
      // landing sound (nice for the screen recording) and bail.
      if (contractData?.isReplay) {
        plinkoAudio.playLand(contractData.payout - contractData.bet > 0)
        return
      }
      // Release this ball from the airborne count FIRST — even if its data is
      // malformed — so one bad land can never freeze balance reconciliation.
      airborne.current = Math.max(0, airborne.current - 1)
      if (!contractData || typeof contractData.multiplierX100 !== 'number') {
        if (airborne.current === 0 && inFlight.current === 0) void refetchBalance()
        return
      }
      const profit = contractData.payout - contractData.bet
      // Apply this ball's net balance change now that it has landed. Using the
      // per-ball delta (not the absolute settled balance) keeps the running
      // total correct even when several balls are airborne and land out of order.
      setBalance((prev) => (prev != null ? prev + BigInt(contractData.payout) - BigInt(contractData.bet) : prev))
      // Everything settled → snap to the authoritative server balance so any
      // drift self-heals immediately instead of lingering on screen.
      if (airborne.current === 0 && inFlight.current === 0) {
        if (reconcileTimer.current) clearTimeout(reconcileTimer.current)
        void refetchBalance()
      }
      plinkoAudio.playLand(profit > 0)
      setRecent((prev) =>
        [
          {
            key: ++chipSeq.current,
            multiplierX100: contractData.multiplierX100,
            profit,
          },
          ...prev,
        ].slice(0, RECENT_LIMIT),
      )
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: contractData.bet, profit }])
      // Big-win share card fires here (on the land, with the reveal), never on a replay.
      reportWin({ game: 'Plinko', bet: contractData.bet, payout: contractData.payout })
    },
    [refetchBalance, reportWin],
  )

  const openVerify = useCallback((roundId: string | null) => {
    setVerifyTarget(roundId)
    setFairnessOpen(true)
  }, [])

  /**
   * Stage a replay: bring the board into view and show the centered Play
   * prompt. The ball is NOT dropped yet — the player hits Play (below) when
   * they're ready to record. Re-tapping Replay just re-arms the prompt.
   */
  const handleReplay = useCallback((round: PlinkoHistoryRound) => {
    plinkoAudio.init()
    setPendingReplay(round)
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  /**
   * Start the staged replay: re-drop the ball on the board with the SAME seed
   * so the canvas reproduces the exact animation the player originally saw (the
   * seed picks the pre-baked deterministic drop that lands in this bucket).
   * Marked isReplay so handleScore leaves balance/session untouched.
   */
  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    // Same derivation as a live drop (dropBall). Legacy rows without a seed hash
    // fall back to a stable hash of the round id so the replay is still
    // deterministic (same ball every time), just not identical to the original.
    const seedFromHash = round.serverSeedHash
      ? parseInt(round.serverSeedHash.slice(0, 12), 16)
      : NaN
    const seed = Number.isFinite(seedFromHash)
      ? seedFromHash
      : Array.from(round.roundId).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
    setLastDrop({
      id: ++dropSeq.current,
      risk: PLINKO_RISK_TO_BOARD[round.risk],
      contractResult: {
        seed,
        bucket: round.bucket,
        multiplier: round.multiplierX100 / 100,
        multiplierX100: round.multiplierX100,
        bet: round.bet,
        payout: round.payout,
        roundId: round.roundId,
        isReplay: true,
      },
    })
    plinkoAudio.playDrop()
  }, [pendingReplay])

  const toggleMute = () => {
    plinkoAudio.init()
    plinkoAudio.setMute(!muted)
    setMuted(!muted)
  }

  const autoRunning = autoLeft != null || strat.running
  const maxWinX100 = multipliers?.[risk]?.[0] ?? 0
  const boardRisk = PLINKO_RISK_TO_BOARD[risk]

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
              Bet per ball{' '}
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
                if (autoRunning) return
                setRisk(v as PlinkoRisk)
              }}
              disabled={autoRunning}
            >
              <SelectTrigger className="border-cyan-950 bg-[#081420]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLINKO_RISKS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {PLINKO_RISK_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              max win{' '}
              <span className="arc-mono text-cyan-300">
                {maxWinX100 > 0
                  ? `${Math.floor((clampBet(bet) * maxWinX100) / 100).toLocaleString()} MORBIUS`
                  : '—'}
              </span>
            </span>
            {maxWinX100 > 0 && (
              <span className="arc-mono text-slate-600">{formatMultiplier(maxWinX100)} top</span>
            )}
          </div>

          {/* Action button: pinned to a fixed bottom bar on mobile (Drop ball / Start auto
              always reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              onClick={() => void dropBall()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400"
            >
              Drop ball
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
              onClick={() => {
                setStrategyNote(null)
                // Flat betting with no stop conditions keeps the fast pipelined
                // loop; anything the strategy actually decides must serialize.
                if (strat.active) strat.start()
                else startAuto(strategy.bets ?? UNBOUNDED_AUTO)
              }}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400"
            >
              Start auto{strategy.bets ? ` (${strategy.bets})` : ''}
            </Button>
          )}
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

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button type="button" onClick={() => openVerify(history[0]?.roundId ?? null)} className="transition-colors hover:text-cyan-400">
              Provably Fair{history.length > 0 ? ' · verify last ball' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Board ───────── */}
        <div ref={boardRef} className="order-1 space-y-3 lg:order-2">
          <Card className="arc-panel relative h-[420px] border-0 p-2 sm:h-[540px] sm:p-3 xl:h-[620px]">
            <PlinkoGame
              onScore={handleScore}
              lastDrop={lastDrop}
              selectedRiskLevel={boardRisk}
            />

            {/* Replay confirm — a centered prompt so the drop only starts on Play
                (gives the player a beat to start their screen recording). */}
            {pendingReplay && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-[#050E16]/80 backdrop-blur-sm"
                role="dialog"
                aria-label="Replay this ball"
                onClick={() => setPendingReplay(null)}
              >
                <div
                  className="relative mx-4 w-full max-w-xs rounded-2xl border border-cyan-500/30 bg-[#07131F]/95 p-5 text-center shadow-[0_0_40px_-8px_rgba(34,211,238,0.55)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPendingReplay(null)}
                    aria-label="Cancel replay"
                    className="absolute right-2 top-2 rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                  >
                    <X size={16} />
                  </button>

                  <div className="arc-display text-xs uppercase tracking-widest text-cyan-300/70">
                    Replay ball
                  </div>
                  <div className="arc-mono mt-1 text-3xl font-bold tabular-nums text-amber-300">
                    {formatMultiplier(pendingReplay.multiplierX100)}
                  </div>
                  <div className="arc-mono mt-1 text-sm tabular-nums text-slate-400">
                    {pendingReplay.payout - pendingReplay.bet > 0
                      ? `+${(pendingReplay.payout - pendingReplay.bet).toLocaleString()}`
                      : (pendingReplay.payout - pendingReplay.bet).toLocaleString()}{' '}
                    MORBIUS
                  </div>

                  <button
                    type="button"
                    onClick={startReplay}
                    className="arc-display mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] transition-colors hover:bg-cyan-400"
                  >
                    <Play size={18} className="fill-current" />
                    Play
                  </button>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Start recording, then hit Play.
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Recent results strip — newest first, amber when the ball profited. */}
          <div
            aria-live="polite"
            aria-label="Recent results"
            className="flex min-h-[2rem] flex-wrap items-center gap-1.5"
          >
            {recent.map((c) => (
              <span
                key={c.key}
                className={[
                  'arc-banner-in arc-mono rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1',
                  c.profit > 0
                    ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40'
                    : 'bg-[#081420] text-slate-500 ring-cyan-950',
                ].join(' ')}
              >
                {formatMultiplier(c.multiplierX100)}
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* ───────── Session chart + info tabs (chart/tabs forked from /PLINKO) ─────────
          The session chart is a draggable floating widget (FloatingPanel) on all
          sizes so it can live wherever the player parks it. */}
      <div className="mt-4 space-y-4">
        <PlinkoInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="plinko2.sessionChart.pos">
        <SessionChart
          gameName="Plinko"
          points={session}
          unitLabel="Balls"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchPlinkoHistory(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }));
          }}
        />
      </FloatingPanel>

      <PlinkoRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <PlinkoFairnessModal
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
