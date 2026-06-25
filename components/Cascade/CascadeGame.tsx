'use client'

/**
 * CascadeGame — the interactive client for chips Cascade (/cascade).
 *
 * Faithful React port of public/cascade-lab.html. One drop ignites a 6×6 gem
 * grid; the SERVER resolves the entire cluster-pays chain reaction and returns
 * the full ordered step sequence — this component just REPLAYS that sequence as
 * the pop / tumble / refill animation, with the combo HUD climbing each chain
 * link, exactly as the prototype does. The math is server-authoritative; the
 * animation is cosmetic.
 *
 * Layout, palette, HUD, volatility selector, bet controls, paytable, banner and
 * the My-drops / FAQ tabs all mirror the lab (and the shared arcade2 chrome).
 * Animation cadence (pop 430ms, clear 300ms, settle/tick 170ms, drop flourish)
 * is ported 1:1 from the lab's animate() so the feel matches.
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
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart'
import { FloatingPanel } from '@/components/arcade2/FloatingPanel'
import { CascadeInfoTabs } from './CascadeInfoTabs'
import { CascadeFairnessModal } from './CascadeFairnessModal'
import { CascadeRulesModal } from './CascadeRulesModal'
import { cascadeAudio } from './cascade-audio'
import {
  fetchCascadeInfo,
  fetchCascadeHistory,
  playCascade,
  formatMultiplierX100,
  formatCombo,
  type CascadeInfo,
  type CascadePlayResult,
  type CascadeHistoryRound,
  type CascadeVolatility,
} from '@/lib/cascade-client'

const HISTORY_LIMIT = 25
const COLS = 6
const ROWS = 6

// Replay cadence — ported 1:1 from the prototype's animate().
const POP_MS = 430 // winners highlighted → pop
const CLEAR_MS = 300 // pop animation duration
const TICK_MS = 170 // settle gap before next chain link
const SETTLE_MS = 260 // final-board hold before banner

// Gem tokens (rarity ascending). Colours are game tokens, not chrome — mirrors
// the prototype's GEMS array.
const GEMS: Array<{ g: string; c: string }> = [
  { g: '●', c: '#5E8CA8' },
  { g: '▲', c: '#48C39A' },
  { g: '◆', c: '#9B8CF0' },
  { g: '✦', c: '#E0913C' },
  { g: '⬢', c: '#E2658C' },
]

const VOLATILITIES: ReadonlyArray<{ key: CascadeVolatility; name: string; range: string }> = [
  { key: 'calm', name: 'Calm', range: '×1 → ×5' },
  { key: 'standard', name: 'Std', range: '×1 → ×12' },
  { key: 'frenzy', name: 'Frenzy', range: '×1 → ×30' },
]

const BET_PRESETS = [100, 500, 1000] as const

type Board = Array<Array<number | null>>
type TileExtra = '' | ' win' | ' pop' | ' drop'

interface TileState {
  sym: number | null
  extra: TileExtra
}

/** Auto play (serialized): repeat the current bet N times, one full cascade at a time. */
const AUTO_COUNTS = [10, 25, 50, 100] as const
const AUTO_GAP_MS = 650 // pause after a cascade settles before the next drop

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => new Array<number | null>(COLS).fill(null))
}

function boardToTiles(board: Board, extraFor?: (r: number, c: number) => TileExtra): TileState[] {
  const out: TileState[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push({ sym: board[r][c], extra: extraFor ? extraFor(r, c) : '' })
    }
  }
  return out
}

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

/** Smallest cluster value ×100 for a gem at the volatility's threshold, for the paytable. */
function minClusterX100(
  gem: number,
  cfg: CascadeInfo['volatilities'][CascadeVolatility],
): number {
  // size === threshold → (1 + sizeBonus*0) = 1; matches clusterPayX100 in the engine.
  return Math.round(cfg.pay[gem] * cfg.payScale)
}

export function CascadeGame() {
  const { address } = useAccount()

  const [info, setInfo] = useState<CascadeInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [bet, setBet] = useState<number>(500)
  const [volatility, setVolatility] = useState<CascadeVolatility>('calm')
  const [clientSeed, setClientSeed] = useState('')

  // Board + HUD are driven by the replay, not by React state per-frame for the
  // tiles (we set the whole tile array each frame).
  const [tiles, setTiles] = useState<TileState[]>(() => boardToTiles(emptyBoard()))
  const [hudMultX100, setHudMultX100] = useState(0)
  const [hudComboX100, setHudComboX100] = useState(100)
  const [hudWin, setHudWin] = useState<number | null>(null)

  const [banner, setBanner] = useState<{ kind: 'win' | 'loss'; k: string; v: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [settled, setSettled] = useState(false)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  const [session, setSession] = useState<SessionPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<CascadeHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const mounted = useRef(true)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  // Auto loop bookkeeping. autoActiveRef gates the run; autoTimer holds the
  // inter-round pause; settleResolve releases the loop once a cascade finishes.
  const autoActiveRef = useRef(false)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleResolve = useRef<(() => void) | null>(null)

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }, [])
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timers.current.push(t)
  }, [])

  // Balance: public read keyed by wallet address (no sign-in popup).
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
    fetchCascadeInfo()
      .then((i) => {
        setInfo(i)
        setBet((b) => Math.min(i.maxBet, Math.max(i.minBet, b)))
      })
      .catch(() => setInfoFailed(true))
  }, [])

  useEffect(() => {
    mounted.current = true
    loadInfo()
    return () => {
      mounted.current = false
      autoActiveRef.current = false
      if (autoTimer.current) clearTimeout(autoTimer.current)
      settleResolve.current = null
      clearTimers()
    }
  }, [loadInfo, clearTimers])

  // History: only fetch once a session provably exists (never pop a sign-in on load).
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    probeSiweSession()
      .then((ok) => (ok ? fetchCascadeHistory(HISTORY_LIMIT) : []))
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

  const minBet = info?.minBet ?? 100
  const maxBet = info?.maxBet ?? 100_000
  const cfg = info ? info.volatilities[volatility] : null

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )

  const setHud = useCallback((multX100: number, comboX100: number, win: number | null) => {
    setHudMultX100(multX100)
    setHudComboX100(comboX100)
    setHudWin(win)
  }, [])

  const resetBoardForVolatility = useCallback(() => {
    clearTimers()
    setBanner(null)
    setSettled(false)
    setTiles(boardToTiles(emptyBoard()))
    setHud(0, 100, null)
  }, [clearTimers, setHud])

  // ── Replay the server's step sequence as the cascade animation ──────────────
  const replay = useCallback(
    (res: CascadePlayResult) => {
      const steps = res.steps
      const finalBoard = res.finalBoard

      const finish = () => {
        if (!mounted.current) return
        setSettled(true)
        setBusy(false)
        const won = res.payout > 0
        setHud(
          res.multiplierX100,
          steps.length ? steps[steps.length - 1].comboX100 : 100,
          res.payout,
        )
        if (won) {
          cascadeAudio.playWin()
          setBanner({
            kind: 'win',
            k: `${res.clusters}-chain · ${formatMultiplierX100(res.multiplierX100)}`,
            v: `+${res.payout.toLocaleString()} MORBIUS`,
          })
        } else {
          cascadeAudio.playNoWin()
          setBanner({ kind: 'loss', k: 'No cluster ignited', v: `−${res.bet.toLocaleString()} MORBIUS` })
        }
        setBalance(BigInt(res.chipBalance))
        setSession((prev) => [
          ...prev,
          { drop: prev.length + 1, bet: res.bet, profit: res.payout - res.bet },
        ])
        setHistory((prev) =>
          [
            {
              roundId: res.roundId,
              bet: res.bet,
              volatility: res.volatility,
              multiplierX100: res.multiplierX100,
              clusters: res.clusters,
              won,
              payout: res.payout,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, HISTORY_LIMIT),
        )
        // Cascade fully settled — release any awaiting serialized-auto loop.
        const resolve = settleResolve.current
        settleResolve.current = null
        resolve?.()
      }

      // No clusters formed — show the opening board then settle (a fizzle).
      if (!steps.length) {
        setTiles(boardToTiles(res.initialBoard))
        later(finish, SETTLE_MS)
        return
      }

      const tick = (i: number) => {
        if (!mounted.current) return
        if (i >= steps.length) {
          setTiles(boardToTiles(finalBoard))
          later(finish, SETTLE_MS)
          return
        }
        const st = steps[i]
        // Winning cells of this chain link.
        const winKeys = new Set<string>()
        for (const cl of st.clusters) {
          for (const p of cl.cells) winKeys.add(`${p[0]},${p[1]}`)
        }
        // 1) Show this board with the winners highlighted; update the HUD.
        setTiles(
          boardToTiles(st.board, (r, c) => (winKeys.has(`${r},${c}`) ? ' win' : '')),
        )
        setHud(st.runningX100, st.comboX100, Math.round((res.bet * st.runningX100) / 100))
        cascadeAudio.playPop(i)
        // 2) Pop the winners.
        later(() => {
          if (!mounted.current) return
          setTiles(
            boardToTiles(st.board, (r, c) => (winKeys.has(`${r},${c}`) ? ' pop' : '')),
          )
          // 3) After the pop, advance to the next board with a drop flourish on top rows.
          later(() => {
            if (!mounted.current) return
            const next = i + 1
            const nextBoard = next < steps.length ? steps[next].board : finalBoard
            setTiles(
              boardToTiles(nextBoard, (r) => (r < 2 ? ' drop' : '')),
            )
            later(() => tick(next), TICK_MS)
          }, CLEAR_MS)
        }, POP_MS)
      }

      // Kick off with the opening board, then start the chain.
      setTiles(boardToTiles(res.initialBoard))
      cascadeAudio.playDrop()
      later(() => tick(0), TICK_MS)
    },
    [later, setHud],
  )

  const drop = useCallback(async (): Promise<'ok' | 'stop'> => {
    if (busy || !info) return 'stop'
    const stake = clampBet(bet)
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough MORBIUS for that bet.')
      setNoChips(true)
      return 'stop'
    }
    setBet(stake)
    setError(null)
    setNoChips(false)
    setBanner(null)
    setSettled(false)
    setBusy(true)
    setHud(0, 100, null)
    clearTimers()
    cascadeAudio.init()
    try {
      const res = await playCascade({
        bet: stake,
        volatility,
        clientSeed: clientSeed.trim() || undefined,
      })
      if (!mounted.current) return 'stop'
      // Resolve once the replay's finish() runs (full cascade animation done).
      const settledPromise = new Promise<void>((resolve) => {
        settleResolve.current = resolve
      })
      replay(res)
      await settledPromise
      return mounted.current ? 'ok' : 'stop'
    } catch (e) {
      if (!mounted.current) return 'stop'
      setBusy(false)
      const msg = (e as Error)?.message ?? ''
      if (/Not enough chips|insufficient|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not play the round. Try again.')
      }
      return 'stop'
    }
  }, [busy, info, bet, balance, clampBet, volatility, clientSeed, replay, clearTimers, setHud])

  const stopAuto = useCallback(() => {
    autoActiveRef.current = false
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Serialized auto loop: drop once, await the full cascade animation, pause
   * briefly, then fire the next — until the count is exhausted, Stop is pressed,
   * the wallet can't cover the bet, or an error occurs. Repeats the current bet.
   */
  const runAuto = useCallback(async () => {
    let left = autoCount
    autoActiveRef.current = true
    setAutoLeft(left)
    while (mounted.current && autoActiveRef.current && left > 0) {
      const r = await drop()
      if (!mounted.current || !autoActiveRef.current) return
      if (r === 'stop') {
        stopAuto()
        return
      }
      left -= 1
      setAutoLeft(left)
      if (left <= 0) {
        stopAuto()
        return
      }
      await new Promise<void>((resolve) => {
        autoTimer.current = setTimeout(() => {
          autoTimer.current = null
          resolve()
        }, AUTO_GAP_MS)
      })
    }
  }, [autoCount, drop, stopAuto])

  const startAuto = useCallback(() => {
    if (autoActiveRef.current || busy) return
    void runAuto()
  }, [busy, runAuto])

  const autoRunning = autoLeft != null

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  const toggleMute = useCallback(() => {
    cascadeAudio.init()
    setMuted((m) => {
      cascadeAudio.setMute(!m)
      return !m
    })
  }, [])

  const onPickVolatility = useCallback(
    (v: CascadeVolatility) => {
      if (busy) return
      setVolatility(v)
      resetBoardForVolatility()
    },
    [busy, resetBoardForVolatility],
  )

  const hudMultStr = `${(hudMultX100 / 100).toFixed(2)}×`
  const winPreview = Math.floor((clampBet(bet) * hudMultX100) / 100)

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
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

          {/* Manual / Auto */}
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

          {mode === 'auto' && (
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-slate-500">Number of drops</label>
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

          {/* Volatility */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">Volatility</label>
            <div className="grid grid-cols-3 gap-2">
              {VOLATILITIES.map((v) => {
                const on = volatility === v.key
                return (
                  <button
                    key={v.key}
                    type="button"
                    disabled={busy || autoRunning}
                    onClick={() => onPickVolatility(v.key)}
                    className={[
                      'rounded-xl px-1.5 py-2.5 text-center transition-colors disabled:opacity-50',
                      on
                        ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-500/60 shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]'
                        : 'text-slate-400 ring-1 ring-cyan-950 hover:ring-cyan-500/40',
                    ].join(' ')}
                  >
                    <div className="arc-display text-[13px] font-semibold uppercase tracking-wide">
                      {v.name}
                    </div>
                    <div className={`arc-mono mt-0.5 text-[10.5px] ${on ? 'text-cyan-300' : 'text-slate-500'}`}>
                      {v.range}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bet */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Bet amount{' '}
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
                disabled={busy || autoRunning}
                onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                onBlur={() => setBet((b) => clampBet(b))}
                className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || autoRunning}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || autoRunning}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                2×
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BET_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy || autoRunning}
                  onClick={() => setBet((b) => clampBet(b + p))}
                  className="arc-mono rounded-md py-1.5 text-xs tabular-nums text-slate-400 ring-1 ring-cyan-950 transition-colors hover:text-slate-200 disabled:opacity-50"
                >
                  +{p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || autoRunning}
                onClick={() => setBet(clampBet(balance != null ? Number(balance) : maxBet))}
                className="arc-mono rounded-md py-1.5 text-xs tabular-nums text-slate-400 ring-1 ring-cyan-950 transition-colors hover:text-slate-200 disabled:opacity-50"
              >
                Max
              </button>
            </div>
          </div>

          {/* Paytable */}
          {cfg && (
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Gems — bigger clusters pay more
              </label>
              <div className="space-y-1.5">
                {GEMS.map((gm, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span
                      className="grid h-6 w-6 flex-none place-items-center rounded-md text-sm"
                      style={{ color: gm.c, background: 'rgba(2,8,13,0.5)', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.1)' }}
                    >
                      {gm.g}
                    </span>
                    <span>cluster of {cfg.threshold}+</span>
                    <span className="arc-mono ml-auto text-slate-300">
                      {(minClusterX100(i, cfg) / 100).toFixed(2)}×+
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <button
              type="button"
              onClick={() => openVerify(history[0]?.roundId ?? null)}
              className="transition-colors hover:text-cyan-400"
            >
              Provably Fair{history.length > 0 ? ' · verify last drop' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card className="arc-panel overflow-hidden border-0 p-0">
            {/* HUD */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <div className="bg-[#040c13]/85 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Multiplier</div>
                <div
                  className={`arc-mono mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${
                    hudMultX100 > 0 ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {hudMultStr}
                </div>
              </div>
              <div className="bg-[#040c13]/85 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Combo</div>
                <div className="arc-mono mt-0.5 text-xl font-bold tabular-nums text-cyan-300 sm:text-2xl">
                  {formatCombo(hudComboX100)}
                </div>
              </div>
              <div className="bg-[#040c13]/85 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Win</div>
                <div className="arc-mono mt-0.5 text-xl font-bold tabular-nums text-white sm:text-2xl">
                  {hudWin != null && hudWin > 0 ? hudWin.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            {/* Arena */}
            <div
              className="relative p-2"
              style={{ background: 'linear-gradient(180deg,#071521,#040d15)' }}
            >
              <div className="cascade-grid grid grid-cols-6 gap-1.5">
                {tiles.map((t, idx) => {
                  const gm = t.sym != null ? GEMS[t.sym] : null
                  return (
                    <div
                      key={idx}
                      className={`cascade-tile${t.extra}`}
                      style={gm ? { color: gm.c } : undefined}
                    >
                      {gm ? gm.g : ''}
                    </div>
                  )
                })}
              </div>

              {/* Win / loss banner */}
              {banner && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={[
                      'arc-banner-in rounded-2xl px-7 py-4 text-center',
                      banner.kind === 'win'
                        ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.22),rgba(4,12,19,0.55))] ring-1 ring-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                        : 'bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.16),rgba(4,12,19,0.6))] ring-1 ring-rose-400/40',
                    ].join(' ')}
                  >
                    <div
                      className={`text-[11px] uppercase tracking-[0.22em] ${
                        banner.kind === 'win' ? 'text-amber-300' : 'text-rose-400'
                      }`}
                    >
                      {banner.k}
                    </div>
                    <div className="arc-mono mt-1 text-2xl font-bold text-white sm:text-3xl">
                      {banner.v}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Drop / Auto button — pinned to a fixed bottom bar on mobile (always
              reachable without scrolling); back in the board column, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || busy}
              onClick={() => void drop()}
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {busy ? 'Dropping…' : settled ? 'Drop again' : 'Place bet & drop'}
            </Button>
          ) : autoRunning ? (
            <Button
              type="button"
              onClick={stopAuto}
              className="arc-display h-14 w-full bg-rose-500 text-base font-bold uppercase tracking-widest text-[#1B0308] hover:bg-rose-400"
            >
              Stop · {autoLeft} left
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!info || busy}
              onClick={startAuto}
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Start auto ({autoCount})
            </Button>
          )}
          </div>

          {/* Win preview while idle */}
          {!busy && !settled && hudMultX100 === 0 && winPreview === 0 && (
            <p className="text-center text-xs text-slate-600">
              One drop · clusters pop and tumble · the combo climbs with every chain
            </p>
          )}
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <CascadeInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="cascade.sessionChart.pos">
        <SessionChart
          points={session}
          unitLabel="Drops"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchCascadeHistory(365)
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }))
          }}
        />
      </FloatingPanel>

      <CascadeRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <CascadeFairnessModal
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

      {/* Tile styling + pop / drop animations — ported from the prototype. */}
      <style jsx>{`
        .cascade-tile {
          aspect-ratio: 1;
          border-radius: 10px;
          display: grid;
          place-items: center;
          font-size: clamp(15px, 4.2vw, 23px);
          font-weight: 700;
          background: rgba(2, 8, 13, 0.5);
          box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.08);
        }
        .cascade-tile.win {
          box-shadow: inset 0 0 0 2px currentColor, 0 0 16px -3px currentColor;
        }
        .cascade-tile.pop {
          animation: cascade-pop 0.3s cubic-bezier(0.5, -0.2, 0.7, 0.2) forwards;
        }
        .cascade-tile.drop {
          animation: cascade-drop 0.26s ease;
        }
        @keyframes cascade-pop {
          0% {
            transform: scale(1);
          }
          38% {
            transform: scale(1.16);
          }
          100% {
            transform: scale(0.2);
            opacity: 0;
          }
        }
        @keyframes cascade-drop {
          0% {
            transform: translateY(-22%);
            opacity: 0.2;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
