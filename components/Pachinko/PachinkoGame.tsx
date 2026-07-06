'use client'

/**
 * PachinkoGame — the interactive client for chips Pachinko (/pachinko).
 *
 * Faithful port of public/pachinko-lab.html: a canvas triangular pin field,
 * nine pockets across the bottom with a rare amber CENTER jackpot gate, three
 * risk levels, and an animated ball drop. The drop is single-shot and
 * server-resolved — /api/arcade/pachinko/play decides the landing pocket
 * provably fairly and the canvas animates a cosmetic bounce into THAT pocket
 * (the bounce is decoration; only the pocket decides money, exactly like the
 * lab's "the bounce is the reveal animation").
 *
 * Balance, history, session chart, info tabs and the fairness/rules modals
 * follow the same arcade2 conventions as plinko2/dicex2.
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
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { PachinkoInfoTabs } from './PachinkoInfoTabs'
import { PachinkoFairnessModal } from './PachinkoFairnessModal'
import { PachinkoRulesModal } from './PachinkoRulesModal'
import { pachinkoAudio } from './pachinko-audio'
import {
  fetchPachinkoInfo,
  fetchPachinkoHistory,
  playPachinko,
  formatMultiplier,
  PACHINKO_RISK_LABELS,
  PACHINKO_CENTER,
  type PachinkoInfo,
  type PachinkoRisk,
  type PachinkoPlayResult,
  type PachinkoHistoryRound,
} from '@/lib/pachinko-client'

const HISTORY_LIMIT = 25
const RECENT_LIMIT = 10
const AUTO_COUNTS = [10, 25, 50, 100] as const
/** Pause after the drop animation settles before the next auto round fires. */
const AUTO_GAP_MS = 650

// ── Canvas geometry (1:1 with the lab) ────────────────────────────────────
const WORLD_W = 440
const WORLD_H = 360
const ROWS = 10
const N = 9
const MARGIN = 24
const PINY0 = 46
const PINGAP = (WORLD_H - 90) / ROWS
const POCKY = WORLD_H - 40

/** "402 …: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

function pocketX(i: number): number {
  return MARGIN + (i + 0.5) * ((WORLD_W - 2 * MARGIN) / N)
}

interface PocketColor {
  f: string
  s: string
  t: string
}
function pocketColor(i: number, multX100: number[]): PocketColor {
  const m = multX100[i]
  if (i === PACHINKO_CENTER) return { f: 'rgba(245,158,11,.22)', s: '#F59E0B', t: '#fbd36b' }
  if (m >= 150) return { f: 'rgba(34,211,238,.18)', s: '#22D3EE', t: '#7be9fb' }
  if (m >= 80) return { f: 'rgba(34,211,238,.08)', s: 'rgba(34,211,238,.5)', t: '#9fe6f4' }
  return { f: 'rgba(148,163,184,.07)', s: 'rgba(148,163,184,.4)', t: '#94A3B8' }
}

function multLabel(x100: number): string {
  return formatMultiplier(x100)
}

interface RecentChip {
  key: number
  multiplierX100: number
  profit: number
  jackpot: boolean
}

type Phase = 'idle' | 'dropping' | 'settled'

export function PachinkoGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [info, setInfo] = useState<PachinkoInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [risk, setRisk] = useState<PachinkoRisk>('low')
  const [bet, setBet] = useState<number>(500)
  const [clientSeed, setClientSeed] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [lastDrop, setLastDrop] = useState<PachinkoPlayResult | null>(null)
  const [recent, setRecent] = useState<RecentChip[]>([])
  const [session, setSession] = useState<SessionPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'win' | 'loss'; head: string; sub: string } | null>(
    null,
  )

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<PachinkoHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Replay: a staged past round (confirm overlay) + a flag while re-watching.
  // Replays never touch balance/history/session — they only re-run the drop.
  const [pendingReplay, setPendingReplay] = useState<PachinkoHistoryRound | null>(null)
  const [replaying, setReplaying] = useState(false)

  const dropSeq = useRef(0)
  const mounted = useRef(true)
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const ballRef = useRef<{ x: number; y: number } | null>(null)
  const settledPocketRef = useRef<number>(-1)
  // Auto loop bookkeeping. autoActiveRef gates the run; autoTimer holds the
  // inter-round pause so it can be cleared on Stop / unmount.
  const autoActiveRef = useRef(false)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Balance: public read keyed by wallet (no sign-in popup), then kept fresh
  // from authoritative play responses and exchange completions.
  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null)
  const [balance, setBalance] = useState<bigint | null>(null)
  // Mirror of `balance` for the auto loop's affordability check, since the loop's
  // closure can't observe React state updated mid-run.
  const balanceRef = useRef<bigint | null>(null)
  useEffect(() => {
    balanceRef.current = balance
  }, [balance])
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
    fetchPachinkoInfo()
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (autoTimer.current) clearTimeout(autoTimer.current)
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
      .then((ok) => (ok ? fetchPachinkoHistory(HISTORY_LIMIT) : []))
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

  const minBet = info?.minBet ?? 10
  const maxBet = info?.maxBet ?? 100_000

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )

  // Pocket multipliers for the current risk — server tables when available,
  // local fallbacks (verbatim from the server) keep the board drawable on load.
  const multX100 = useMemo<number[]>(() => {
    if (info) return info.risks[risk].multX100
    const FALLBACK: Record<PachinkoRisk, number[]> = {
      low: [149, 108, 76, 46, 505, 46, 76, 108, 149],
      medium: [200, 120, 60, 30, 1300, 30, 60, 120, 200],
      high: [405, 150, 38, 15, 3000, 15, 38, 150, 405],
    }
    return FALLBACK[risk]
  }, [info, risk])

  // ── Canvas rendering ──────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    if (cv.width !== WORLD_W * dpr) {
      cv.width = WORLD_W * dpr
      cv.height = WORLD_H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WORLD_W, WORLD_H)

    // pins (triangle)
    ctx.fillStyle = 'rgba(125,233,251,.35)'
    for (let r = 0; r < ROWS; r++) {
      const count = r + 3
      const y = PINY0 + r * PINGAP
      const span = ((WORLD_W - 2 * MARGIN) * (count - 1)) / (N - 1)
      for (let c = 0; c < count; c++) {
        const x = WORLD_W / 2 - span / 2 + c * (span / (count - 1 || 1))
        ctx.beginPath()
        ctx.arc(x, y, 2.4, 0, 7)
        ctx.fill()
      }
    }

    // pockets
    const pw = (WORLD_W - 2 * MARGIN) / N
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }
    for (let i = 0; i < N; i++) {
      const col = pocketColor(i, multX100)
      const x = MARGIN + i * pw
      ctx.fillStyle = col.f
      ctx.strokeStyle = col.s
      ctx.lineWidth = 1.2
      roundRect(x + 2, POCKY, pw - 4, 30, 5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = col.t
      ctx.font = `600 ${i === PACHINKO_CENTER ? '11' : '10'}px "JetBrains Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(i === PACHINKO_CENTER ? 'JACK' : multLabel(multX100[i]), x + pw / 2, POCKY + 15)
    }

    // ball
    const ball = ballRef.current
    if (ball) {
      ctx.save()
      ctx.fillStyle = '#7be9fb'
      ctx.shadowColor = '#22D3EE'
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, 7, 0, 7)
      ctx.fill()
      ctx.restore()
    }

    // highlight settled pocket
    const settled = settledPocketRef.current
    if (settled >= 0) {
      const col = pocketColor(settled, multX100)
      const xx = MARGIN + settled * pw
      ctx.strokeStyle = col.s
      ctx.lineWidth = 2.5
      roundRect(xx + 2, POCKY, pw - 4, 30, 5)
      ctx.stroke()
    }
  }, [multX100])

  // Redraw whenever the static board changes (risk / pocket table / settle).
  useEffect(() => {
    draw()
  }, [draw])

  // Animate the ball into `target`, biased by the cosmetic L/R path, then settle.
  const animateDrop = useCallback(
    (target: number, path: number[], onDone: () => void) => {
      const startX = WORLD_W / 2
      const endX = pocketX(target)
      const topY = 20
      const T = 78
      let f = 0
      let lastRow = -1
      const step = () => {
        if (!mounted.current) return
        f++
        const t = f / T
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const y = topY + (POCKY - topY) * t
        // The wiggle samples the path so the bounce visibly leans the way the
        // server's path stepped (decoration only — the ball always lands in
        // `target`).
        const rowIdx = Math.min(path.length - 1, Math.max(0, Math.floor(t * ROWS)))
        const lean = path.length ? (path[rowIdx] === 1 ? 1 : -1) : 0
        const wig = (1 - t) * 16 * Math.sin(t * Math.PI * ROWS) * (lean || 1)
        const x = startX + (endX - startX) * e + wig
        ballRef.current = { x, y }
        const row = Math.floor((y - PINY0) / PINGAP)
        if (row !== lastRow && row >= 0 && row < ROWS) {
          lastRow = row
          pachinkoAudio.playPin()
        }
        draw()
        if (f < T) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          ballRef.current = { x: endX, y: POCKY + 4 }
          draw()
          onDone()
        }
      }
      step()
    },
    [draw],
  )

  // Fire one drop. The returned Promise resolves only once the drop animation
  // has fully settled (the same point the manual flow re-enables the button), so
  // the serialized auto loop can await a complete round before the next. Resolves
  // 'ok' to continue, 'stop' when the loop should halt (error / no chips / busy).
  const dropOnce = useCallback(
    (stakeArg?: number, riskArg?: PachinkoRisk): Promise<'ok' | 'stop'> => {
      return new Promise<'ok' | 'stop'>((resolve) => {
        if (busy || replaying || !info) {
          resolve('stop')
          return
        }
        const useRisk = riskArg ?? risk
        const stake = clampBet(stakeArg ?? bet)
        if (balance != null && BigInt(stake) > balance) {
          setError('Not enough MORBIUS for that bet.')
          setNoChips(true)
          resolve('stop')
          return
        }
        // A real drop exits any replay view (staged overlay + settled highlight).
        setPendingReplay(null)
        setBet(stake)
        setError(null)
        setNoChips(false)
        setBusy(true)
        setPhase('dropping')
        setBanner(null)
        settledPocketRef.current = -1
        pachinkoAudio.init()
        playPachinko({
          bet: stake,
          risk: useRisk,
          clientSeed: clientSeed.trim() || undefined,
        })
          .then((res) => {
            if (!mounted.current) {
              resolve('stop')
              return
            }
            const nextBal = BigInt(res.chipBalance)
            balanceRef.current = nextBal
            setBalance(nextBal)
            // Animate into the server's pocket, replaying its cosmetic path.
            animateDrop(res.pocket, res.path, () => {
              if (!mounted.current) {
                resolve('stop')
                return
              }
              settledPocketRef.current = res.pocket
              setPhase('settled')
              setBusy(false)
              setLastDrop(res)
              const profit = res.payout - res.bet
              reportWin({ game: 'Pachinko', bet: res.bet, payout: res.payout })
              const jackpot = res.pocket === PACHINKO_CENTER
              if (jackpot) {
                pachinkoAudio.playJackpot()
                setBanner({
                  kind: 'win',
                  head: `★ Jackpot gate · ${formatMultiplier(res.multiplierX100)}`,
                  sub: `+${profit.toLocaleString()} MORBIUS`,
                })
              } else if (profit > 0) {
                pachinkoAudio.playWin()
                setBanner({
                  kind: 'win',
                  head: `${formatMultiplier(res.multiplierX100)} pocket`,
                  sub: `+${profit.toLocaleString()} MORBIUS`,
                })
              } else {
                pachinkoAudio.playLose()
                setBanner({
                  kind: 'loss',
                  head: `${formatMultiplier(res.multiplierX100)} pocket`,
                  sub: `${profit.toLocaleString()} MORBIUS`,
                })
              }
              setRecent((prev) =>
                [
                  { key: ++dropSeq.current, multiplierX100: res.multiplierX100, profit, jackpot },
                  ...prev,
                ].slice(0, RECENT_LIMIT),
              )
              setSession((prev) => [...prev, { drop: prev.length + 1, bet: res.bet, profit }])
              setHistory((prev) =>
                [
                  {
                    roundId: res.roundId,
                    bet: res.bet,
                    risk: res.risk,
                    pocket: res.pocket,
                    path: res.path,
                    multiplierX100: res.multiplierX100,
                    won: res.won,
                    payout: res.payout,
                    createdAt: new Date().toISOString(),
                  },
                  ...prev,
                ].slice(0, HISTORY_LIMIT),
              )
              // Animation has fully settled — the round is complete.
              resolve('ok')
            })
          })
          .catch((e) => {
            if (!mounted.current) {
              resolve('stop')
              return
            }
            setBusy(false)
            setPhase('idle')
            ballRef.current = null
            draw()
            const msg = (e as Error)?.message ?? ''
            if (/Not enough chips|insufficient|402/i.test(msg)) {
              setError('Not enough MORBIUS for that bet.')
              setNoChips(true)
            } else if (/401|auth|No session/i.test(msg)) {
              setError('Connect your wallet to play.')
            } else {
              setError(serverDetail(msg) ?? 'Could not play the round. Try again.')
            }
            resolve('stop')
          })
      })
    },
    [busy, replaying, info, bet, balance, clampBet, risk, clientSeed, animateDrop, draw, reportWin],
  )

  const stopAuto = useCallback(() => {
    autoActiveRef.current = false
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Serialized auto loop: drop one ball, await its full animation, pause briefly,
   * then fire the next — until the count is exhausted, Stop is pressed, the wallet
   * can't cover the bet, or an error occurs. Repeats the current risk + bet.
   */
  const runAuto = useCallback(async () => {
    let left = autoCount
    autoActiveRef.current = true
    setAutoLeft(left)
    while (mounted.current && autoActiveRef.current && left > 0) {
      const r = await dropOnce()
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
  }, [autoCount, dropOnce, stopAuto])

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
    pachinkoAudio.init()
    setMuted((m) => {
      pachinkoAudio.setMute(!m)
      return !m
    })
  }, [])

  const changeRisk = useCallback(
    (r: PachinkoRisk) => {
      if (busy || replaying) return
      setRisk(r)
      setPhase('idle')
      setBanner(null)
      settledPocketRef.current = -1
      ballRef.current = null
    },
    [busy, replaying],
  )

  // ── Replay a past drop: stage the confirm overlay, then re-run the exact same
  // ball drop (no server call, no balance/history/session change). ──
  const handleReplay = useCallback(
    (round: PachinkoHistoryRound) => {
      if (busy || replaying) return
      pachinkoAudio.init()
      setPendingReplay(round)
      arenaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [busy, replaying],
  )

  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setError(null)
    setNoChips(false)
    setBanner(null)
    settledPocketRef.current = -1
    setReplaying(true)
    pachinkoAudio.init()
    // Animate into the recorded pocket, replaying its cosmetic path. onDone is a
    // pure re-watch: it only highlights the pocket + shows the banner — it never
    // touches balance, reportWin, recent, session, history or lastDrop.
    animateDrop(round.pocket, round.path ?? [], () => {
      if (!mounted.current) return
      settledPocketRef.current = round.pocket
      draw()
      setReplaying(false)
      const profit = round.payout - round.bet
      const jackpot = round.pocket === PACHINKO_CENTER
      if (jackpot) {
        pachinkoAudio.playJackpot()
        setBanner({
          kind: 'win',
          head: `★ Jackpot gate · ${formatMultiplier(round.multiplierX100)}`,
          sub: `+${profit.toLocaleString()} MORBIUS`,
        })
      } else if (profit > 0) {
        pachinkoAudio.playWin()
        setBanner({
          kind: 'win',
          head: `${formatMultiplier(round.multiplierX100)} pocket`,
          sub: `+${profit.toLocaleString()} MORBIUS`,
        })
      } else {
        pachinkoAudio.playLose()
        setBanner({
          kind: 'loss',
          head: `${formatMultiplier(round.multiplierX100)} pocket`,
          sub: `${profit.toLocaleString()} MORBIUS`,
        })
      }
    })
  }, [pendingReplay, animateDrop, draw])

  const winPayout = Math.floor((clampBet(bet) * (multX100[0] ?? 0)) / 100)
  const jackpotPayout = Math.floor((clampBet(bet) * (multX100[PACHINKO_CENTER] ?? 0)) / 100)

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

          {/* Risk */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">Risk</label>
            <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Risk level">
              {(['low', 'medium', 'high'] as const).map((r) => {
                const on = risk === r
                return (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    disabled={busy || autoRunning}
                    onClick={() => changeRisk(r)}
                    className={[
                      'rounded-xl px-1 py-2 text-center transition-colors',
                      on
                        ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-500/60 shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]'
                        : 'text-slate-400 ring-1 ring-cyan-950 hover:ring-cyan-500/30',
                    ].join(' ')}
                  >
                    <div className="arc-display text-[13px] font-semibold uppercase tracking-wide">
                      {PACHINKO_RISK_LABELS[r]}
                    </div>
                    <div
                      className={`arc-mono mt-0.5 text-[10.5px] tabular-nums ${
                        on ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      jackpot {formatMultiplier(multForRisk(info, r, PACHINKO_CENTER))}
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
              <Button
                type="button"
                variant="outline"
                disabled={busy || autoRunning}
                onClick={() => setBet(maxBet)}
                className="border-cyan-950 bg-transparent px-2.5 text-xs hover:bg-cyan-500/10"
              >
                Max
              </Button>
            </div>
          </div>

          {/* Drop / Auto button — pinned to a fixed bottom bar on mobile (always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || busy}
              onClick={() => void dropOnce()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'settled' ? 'Drop again' : 'Place bet & drop'}
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
              disabled={!info || busy}
              onClick={startAuto}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Start auto ({autoCount})
            </Button>
          )}
          </div>

          {/* Outer / jackpot payout preview */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#081420]/70 px-2 py-3 text-center ring-1 ring-cyan-950/70">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Top pocket</div>
              <div className="arc-mono text-sm font-semibold tabular-nums text-cyan-300">
                {winPayout.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Jackpot</div>
              <div className="arc-mono text-sm font-semibold tabular-nums text-amber-300">
                {jackpotPayout.toLocaleString()}
              </div>
            </div>
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
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="transition-colors hover:text-cyan-400"
            >
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
            <div className="grid grid-cols-3 divide-x divide-cyan-500/10 border-b border-cyan-500/10">
              <HudCell label="Bet" value={lastDrop ? lastDrop.bet.toLocaleString() : '—'} tone="amber" />
              <HudCell
                label="Pocket"
                value={
                  lastDrop
                    ? lastDrop.pocket === PACHINKO_CENTER
                      ? `JACKPOT ${formatMultiplier(lastDrop.multiplierX100)}`
                      : formatMultiplier(lastDrop.multiplierX100)
                    : '—'
                }
                tone="cyan"
              />
              <HudCell label="Payout" value={lastDrop ? lastDrop.payout.toLocaleString() : '—'} />
            </div>

            {/* Arena */}
            <div
              ref={arenaRef}
              className="relative"
              style={{ background: 'linear-gradient(180deg,#071521,#040d15)' }}
            >
              <canvas
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: 'auto' }}
                aria-label="Pachinko board"
              />
              {banner && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={[
                      'arc-banner-in rounded-2xl px-7 py-4 text-center',
                      banner.kind === 'win'
                        ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,.22),rgba(4,12,19,.6))] ring-1 ring-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                        : 'bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,.16),rgba(4,12,19,.65))] ring-1 ring-rose-500/40',
                    ].join(' ')}
                  >
                    <div
                      className={`text-xs uppercase tracking-[0.22em] ${
                        banner.kind === 'win' ? 'text-amber-300' : 'text-rose-400'
                      }`}
                    >
                      {banner.head}
                    </div>
                    <div className="arc-mono mt-1 text-3xl font-bold tabular-nums text-white sm:text-4xl">
                      {banner.sub}
                    </div>
                  </div>
                </div>
              )}
              {pendingReplay && (
                <ReplayConfirmOverlay
                  title="Replay drop"
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
            </div>
          </Card>

          {/* Recent drops strip — newest first. */}
          <div
            aria-live="polite"
            aria-label="Recent drops"
            className="flex min-h-[2rem] flex-wrap items-center gap-1.5"
          >
            {recent.map((c) => (
              <span
                key={c.key}
                className={[
                  'arc-banner-in arc-mono rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1',
                  c.jackpot
                    ? 'bg-amber-500/15 text-amber-300 ring-amber-500/50'
                    : c.profit > 0
                      ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
                      : 'bg-[#081420] text-rose-400/80 ring-cyan-950',
                ].join(' ')}
              >
                {formatMultiplier(c.multiplierX100)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <PachinkoInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="pachinko.sessionChart.pos">
        <SessionChart
          gameName="Pachinko"
          points={session}
          unitLabel="Drops"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchPachinkoHistory(365)
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }))
          }}
        />
      </FloatingPanel>

      <PachinkoRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <PachinkoFairnessModal
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

/** Jackpot (or any pocket) multiplier for a risk, server table or local fallback. */
function multForRisk(info: PachinkoInfo | null, risk: PachinkoRisk, pocket: number): number {
  if (info) return info.risks[risk].multX100[pocket]
  const FALLBACK: Record<PachinkoRisk, number[]> = {
    low: [149, 108, 76, 46, 505, 46, 76, 108, 149],
    medium: [200, 120, 60, 30, 1300, 30, 60, 120, 200],
    high: [405, 150, 38, 15, 3000, 15, 38, 150, 405],
  }
  return FALLBACK[risk][pocket]
}

function HudCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'amber' | 'cyan'
}) {
  const idle = value === '—'
  return (
    <div className="px-3 py-3 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div
        className={[
          'arc-mono mt-0.5 text-base font-bold tabular-nums sm:text-lg',
          idle ? 'text-slate-500' : tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-white',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
