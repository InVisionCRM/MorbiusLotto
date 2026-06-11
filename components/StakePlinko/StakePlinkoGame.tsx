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

import { useCallback, useEffect, useRef, useState } from 'react'
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
import PlinkoGame from '@/components/PLINKO/PlinkoGame'
import type { RiskLevel } from '@/app/PLINKO/types'
import { PlinkoHistory } from './PlinkoHistory'
import { PlinkoFairnessModal } from './PlinkoFairnessModal'
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
const AUTO_INTERVAL_MS = 450
const AUTO_COUNTS = [10, 25, 50, 100] as const
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
  }
}

interface RecentChip {
  key: number
  multiplierX100: number
  profit: number
}

export function StakePlinkoGame() {
  const { address } = useAccount()

  const [multipliers, setMultipliers] = useState<PlinkoMultipliers | null>(null)
  const [bounds, setBounds] = useState({ minBet: 1, maxBet: 1_000 })

  const [risk, setRisk] = useState<PlinkoRisk>('low')
  const [bet, setBet] = useState<number>(10)
  const [clientSeed, setClientSeed] = useState('')

  const [lastDrop, setLastDrop] = useState<BoardDrop | null>(null)
  const [recent, setRecent] = useState<RecentChip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [history, setHistory] = useState<PlinkoHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const dropSeq = useRef(0)
  const chipSeq = useRef(0)
  const inFlight = useRef(0)
  const autoLeftRef = useRef<number | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  /** Fire one independent bet. Returns false when the loop should stop. */
  const dropBall = useCallback(async (): Promise<boolean> => {
    if (inFlight.current >= MAX_IN_FLIGHT) return true
    const stake = clampBet(bet)
    setBet(stake)
    setError(null)
    setNoChips(false)
    inFlight.current += 1
    try {
      const res = await playPlinko({
        risk,
        bet: stake,
        clientSeed: clientSeed.trim() || undefined,
      })
      if (!mounted.current) return false
      setBalance(BigInt(res.chipBalance))
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
      return true
    } catch (e) {
      if (!mounted.current) return false
      const msg = (e as Error)?.message ?? ''
      if (/NO_CHIPS|Not enough chips|402/i.test(msg)) {
        setError('Not enough chips for that bet.')
        setNoChips(true)
      } else if (/401|auth/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not drop the ball. Try again.')
      }
      return false
    } finally {
      inFlight.current -= 1
    }
  }, [bet, risk, clientSeed, clampBet])

  const autoTick = useCallback(async () => {
    const left = autoLeftRef.current
    if (left == null || left <= 0 || !mounted.current) {
      stopAuto()
      return
    }
    autoLeftRef.current = left - 1
    setAutoLeft(left - 1)
    const ok = await dropBall()
    if (!ok || autoLeftRef.current == null || autoLeftRef.current <= 0) {
      stopAuto()
      return
    }
    autoTimer.current = setTimeout(() => void autoTick(), AUTO_INTERVAL_MS)
  }, [dropBall, stopAuto])

  const startAuto = useCallback(() => {
    if (autoLeftRef.current != null) return
    autoLeftRef.current = autoCount
    setAutoLeft(autoCount)
    void autoTick()
  }, [autoCount, autoTick])

  /** Lands feed the recent-results strip (server data rode along on the ball). */
  const handleScore = useCallback(
    (_multiplier: number, _bucketIndex: number, contractData?: BoardDrop['contractResult'] & { risk?: RiskLevel }) => {
      if (!contractData || typeof contractData.multiplierX100 !== 'number') return
      setRecent((prev) =>
        [
          {
            key: ++chipSeq.current,
            multiplierX100: contractData.multiplierX100,
            profit: contractData.payout - contractData.bet,
          },
          ...prev,
        ].slice(0, RECENT_LIMIT),
      )
    },
    [],
  )

  const openVerify = useCallback((roundId: string | null) => {
    setVerifyTarget(roundId)
    setFairnessOpen(true)
  }, [])

  const autoRunning = autoLeft != null
  const maxWinX100 = multipliers?.[risk]?.[0] ?? 0
  const boardRisk = PLINKO_RISK_TO_BOARD[risk]

  return (
    <div className="mx-auto w-full max-w-6xl">
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
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-slate-500">Number of balls</label>
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

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              max win{' '}
              <span className="arc-mono text-cyan-300">
                {maxWinX100 > 0
                  ? `${Math.floor((clampBet(bet) * maxWinX100) / 100).toLocaleString()} chips`
                  : '—'}
              </span>
            </span>
            {maxWinX100 > 0 && (
              <span className="arc-mono text-slate-600">{formatMultiplier(maxWinX100)} top</span>
            )}
          </div>

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
              onClick={stopAuto}
              className="arc-display h-12 w-full bg-rose-500 text-base font-bold uppercase tracking-widest text-[#1B0308] hover:bg-rose-400"
            >
              Stop · {autoLeft} left
            </Button>
          ) : (
            <Button
              type="button"
              onClick={startAuto}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400"
            >
              Start auto ({autoCount})
            </Button>
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
                  Buy chips →
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => openVerify(history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-400"
          >
            Provably Fair{history.length > 0 ? ' · verify last ball' : ''}
          </button>
        </Card>

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card className="arc-panel relative h-[420px] border-0 p-2 sm:h-[540px] sm:p-3 xl:h-[620px]">
            <PlinkoGame
              onScore={handleScore}
              lastDrop={lastDrop}
              selectedRiskLevel={boardRisk}
            />
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

      {/* ───────── History ───────── */}
      {address && (
        <div className="mt-4">
          <PlinkoHistory rounds={history} loading={historyLoading} onVerify={openVerify} />
        </div>
      )}

      <PlinkoFairnessModal
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
