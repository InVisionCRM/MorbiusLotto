'use client'

/**
 * DragonTigerGame — the interactive client for chips Dragon Tiger
 * (/dragon-tiger). Faithful production port of public/dragon-tiger-lab.html.
 *
 * One card to Dragon, one to Tiger, higher rank wins (Ace LOW). Single-shot,
 * server-resolved and provably fair: the deck (and therefore both cards) is
 * sealed behind a committed server seed before the bet, so the round is decided
 * entirely at /play, like Baccarat / Dice x2. The client just paces the reveal
 * (deal face-down → flip Dragon → flip Tiger → settle banner) over the cards the
 * server returns.
 *
 * Bet model mirrors the lab: pick ONE zone (Dragon / Tie / Tiger), set a stake,
 * deal. Payouts (gross): Dragon/Tiger win 1:1 (×2), Tie win 11:1 (×12); on a
 * tie outcome Dragon/Tiger bets give back half the stake.
 *
 * Layout + visuals (Deep-Sea Neon, arcade2-scope) follow the lab: controls rail
 * with Bet-on / Bet-amount / Pays panels, a board with the Wagered/Result/Payout
 * HUD, the felt duel, a win/loss/push banner, then the info tabs.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { Volume2, VolumeX } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance'
import { formatChips } from '@/lib/format-poker-chips'
import { GameWalletModal } from '@/components/shared/GameWalletModal'
import { ArcadeFairnessStrip } from '@/components/shared/ArcadeFairnessStrip'
import { probeSiweSession } from '@/lib/api-auth'
import { useBigWin } from '@/contexts/big-win-context'
import { DragonTigerInfoTabs } from './DragonTigerInfoTabs'
import { DragonTigerFairnessModal } from './DragonTigerFairnessModal'
import { DragonTigerRulesModal } from './DragonTigerRulesModal'
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { dragonTigerAudio } from './dragon-tiger-audio'
import {
  fetchDragonTigerInfo,
  fetchDragonTigerHistory,
  playDragonTiger,
  cardRank,
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  resultLabel,
  type DragonTigerInfo,
  type DragonTigerPlayResult,
  type DragonTigerHistoryRound,
  type DragonTigerResult,
} from '@/lib/dragon-tiger-client'

const HISTORY_LIMIT = 25
/** Reveal pacing — matches the lab's staged flip timing. */
const DEAL_DELAY_MS = 360
const FLIP_GAP_MS = 480
const SETTLE_DELAY_MS = 520
const CHIP_ADDS = [100, 500, 1000] as const
/** Auto play (serialized): repeat the current zone bet N times, one full
 *  deal/reveal at a time, pausing between rounds. */
const AUTO_COUNTS = [10, 25, 50, 100] as const
const AUTO_GAP_MS = 700 // pause after a round settles before the next deal

type Pick = 'dragon' | 'tie' | 'tiger'

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** A single felt card: face-down back, or a face-up rank+suit, with optional flip/win classes. */
function FeltCard({
  cardIdx,
  faceDown,
  flip,
  win,
}: {
  cardIdx: number | null
  faceDown: boolean
  flip?: boolean
  win?: boolean
}) {
  if (faceDown || cardIdx == null) {
    return (
      <div className={`dt-card dt-card-back ${flip ? 'dt-flip' : ''}`} aria-hidden>
        ✦
      </div>
    )
  }
  return (
    <div
      className={`dt-card ${cardIsRed(cardIdx) ? 'dt-card-red' : ''} ${flip ? 'dt-flip' : ''} ${
        win ? 'dt-card-win' : ''
      }`}
    >
      <span className="dt-card-rank">{cardRankLabel(cardIdx)}</span>
      <span className="dt-card-suit">{cardSuitGlyph(cardIdx)}</span>
    </div>
  )
}

export function DragonTigerGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [info, setInfo] = useState<DragonTigerInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [bet, setBet] = useState<number>(500)
  const [pick, setPick] = useState<Pick>('dragon')

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  // Round state for the felt: cards revealed one at a time as we pace the reveal.
  const [dragonCard, setDragonCard] = useState<number | null>(null)
  const [tigerCard, setTigerCard] = useState<number | null>(null)
  const [dragonShown, setDragonShown] = useState(false)
  const [tigerShown, setTigerShown] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'dealing' | 'settled'>('idle')
  const [lastRound, setLastRound] = useState<DragonTigerPlayResult | null>(null)
  const [feltMsg, setFeltMsg] = useState('Pick a side and deal')
  const [banner, setBanner] = useState<{ kind: 'win' | 'loss' | 'push'; k: string; v: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  // Replay: a staged past round (confirm overlay) + a flag while its deal
  // re-runs. Replays are a pure re-watch — no server call, balance, history,
  // session, or reportWin.
  const [pendingReplay, setPendingReplay] = useState<DragonTigerHistoryRound | null>(null)
  const [replaying, setReplaying] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<DragonTigerHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const mounted = useRef(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const boardRef = useRef<HTMLDivElement | null>(null)
  const autoLeftRef = useRef<number | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Resolver fired once a round fully settles, so the serialized auto loop can
  // wait for the reveal/settle animation before pacing the next deal.
  const settleResolve = useRef<(() => void) | null>(null)

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
    fetchDragonTigerInfo()
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
      timers.current.forEach((t) => clearTimeout(t))
      timers.current = []
      if (autoTimer.current) clearTimeout(autoTimer.current)
      autoTimer.current = null
      settleResolve.current = null
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
      .then((ok) => (ok ? fetchDragonTigerHistory(HISTORY_LIMIT) : []))
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
  const maxBet = info?.maxBet ?? 50_000

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )

  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      if (mounted.current) fn()
    }, ms)
    timers.current.push(t)
  }, [])

  const toggleMute = useCallback(() => {
    dragonTigerAudio.init()
    setMuted((m) => {
      dragonTigerAudio.setMute(!m)
      return !m
    })
  }, [])

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  /** Settle the felt once both cards are face up — banner, HUD, history. */
  const settle = useCallback((res: DragonTigerPlayResult) => {
    if (!mounted.current) return
    const result: DragonTigerResult = res.result
    const net = res.totalPayout - res.totalBet
    reportWin({ game: 'Dragon Tiger', bet: res.totalBet, payout: res.totalPayout })
    setPhase('settled')
    setBusy(false)
    setFeltMsg(`Dragon ${res.dragonRank + 1} · Tiger ${res.tigerRank + 1}`)

    const label = resultLabel(result)
    if (net > 0) {
      dragonTigerAudio.playWin()
      setBanner({ kind: 'win', k: label, v: `+${fmt(net)} MORBIUS` })
    } else if (net === 0) {
      dragonTigerAudio.playPush()
      setBanner({ kind: 'push', k: label, v: '±0 MORBIUS' })
    } else {
      dragonTigerAudio.playLose()
      setBanner({ kind: 'loss', k: label, v: `−${fmt(-net)} MORBIUS` })
    }

    setBalance(BigInt(res.chipBalance))
    setHistory((prev) =>
      [
        {
          roundId: res.roundId,
          bets: res.bets,
          totalBet: res.totalBet,
          dragonCard: res.dragonCard,
          tigerCard: res.tigerCard,
          result: res.result,
          payouts: res.payouts,
          totalPayout: res.totalPayout,
          won: res.won,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, HISTORY_LIMIT),
    )

    // Round fully settled — let any awaiting serialized-auto loop proceed.
    const resolve = settleResolve.current
    settleResolve.current = null
    resolve?.()
  }, [reportWin])

  /**
   * Replay finish: show the banner + HUD readout and release the replay flag.
   * No reportWin / balance / history — pure re-watch.
   */
  const finishReplay = useCallback((res: DragonTigerPlayResult) => {
    if (!mounted.current) return
    const net = res.totalPayout - res.totalBet
    setPhase('settled')
    setReplaying(false)
    setFeltMsg(`Dragon ${res.dragonRank + 1} · Tiger ${res.tigerRank + 1}`)
    const label = resultLabel(res.result)
    if (net > 0) {
      dragonTigerAudio.playWin()
      setBanner({ kind: 'win', k: label, v: `+${fmt(net)} MORBIUS` })
    } else if (net === 0) {
      dragonTigerAudio.playPush()
      setBanner({ kind: 'push', k: label, v: '±0 MORBIUS' })
    } else {
      dragonTigerAudio.playLose()
      setBanner({ kind: 'loss', k: label, v: `−${fmt(-net)} MORBIUS` })
    }
  }, [])

  /** Pace the reveal of the server-decided round: face-down → flip D → flip T → settle. */
  const runReveal = useCallback(
    (res: DragonTigerPlayResult, opts?: { isReplay?: boolean }) => {
      const isReplay = opts?.isReplay ?? false
      setDragonCard(res.dragonCard)
      setTigerCard(res.tigerCard)
      setDragonShown(false)
      setTigerShown(false)
      setFeltMsg('Dealing…')
      dragonTigerAudio.playDeal()
      after(DEAL_DELAY_MS, () => {
        setDragonShown(true)
        dragonTigerAudio.playDeal()
        after(FLIP_GAP_MS, () => {
          setTigerShown(true)
          dragonTigerAudio.playDeal()
          // On replay, skip settle entirely — just re-show the outcome banner.
          after(SETTLE_DELAY_MS, () => (isReplay ? finishReplay(res) : settle(res)))
        })
      })
    },
    [after, settle, finishReplay],
  )

  /**
   * Play one full round (place bet → await server → pace the reveal → settle).
   * Resolves to `true` once the round has fully settled, or `false` if it could
   * not be placed (insufficient chips / auth / error) — the serialized auto loop
   * uses that to decide whether to continue.
   */
  const playRound = useCallback(async (): Promise<boolean> => {
    if (busy || replaying || !info) return false
    const stake = clampBet(bet)
    setBet(stake)
    setError(null)
    setNoChips(false)
    // A real deal exits any replay view (pending prompt + in-flight cards/banner).
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    setPendingReplay(null)
    setReplaying(false)
    setBusy(true)
    setPhase('dealing')
    setBanner(null)
    setLastRound(null)
    setDragonShown(false)
    setTigerShown(false)
    setDragonCard(null)
    setTigerCard(null)
    setFeltMsg('Dealing…')
    dragonTigerAudio.init()

    const bets = {
      dragon: pick === 'dragon' ? stake : 0,
      tiger: pick === 'tiger' ? stake : 0,
      tie: pick === 'tie' ? stake : 0,
    }

    try {
      const res = await playDragonTiger({ bets })
      if (!mounted.current) return false
      setLastRound(res)
      // Resolve when settle() runs at the end of the paced reveal.
      const settled = new Promise<void>((resolve) => {
        settleResolve.current = resolve
      })
      runReveal(res)
      await settled
      return mounted.current
    } catch (e) {
      if (!mounted.current) return false
      const msg = (e as Error)?.message ?? ''
      setBusy(false)
      setPhase('idle')
      setFeltMsg('Pick a side and deal')
      if (/Not enough chips|insufficient|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not play the round. Try again.')
      }
      return false
    }
  }, [busy, replaying, info, bet, pick, clampBet, runReveal])

  const deal = useCallback(() => {
    void playRound()
  }, [playRound])

  // ── Replay a past round: stage the confirm overlay, then re-run the exact
  // same card reveal (no server call, no balance/history change). ──
  const handleReplay = useCallback(
    (round: DragonTigerHistoryRound) => {
      if (busy || replaying) return
      dragonTigerAudio.init()
      setPendingReplay(round)
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [busy, replaying],
  )

  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    setReplaying(true)
    setBanner(null)
    dragonTigerAudio.init()
    // Rebuild the play-result shape runReveal needs from the stored row.
    const res: DragonTigerPlayResult = {
      roundId: round.roundId,
      bets: round.bets,
      totalBet: round.totalBet,
      dragonCard: round.dragonCard,
      tigerCard: round.tigerCard,
      dragonRank: cardRank(round.dragonCard),
      tigerRank: cardRank(round.tigerCard),
      result: round.result,
      payouts: round.payouts,
      totalPayout: round.totalPayout,
      won: round.won,
      serverSeedHash: '',
      chipBalance: '',
    }
    setLastRound(res)
    runReveal(res, { isReplay: true })
  }, [pendingReplay, runReveal])

  const stopAuto = useCallback(() => {
    autoLeftRef.current = null
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Serialized auto loop: play one round, wait for it to fully settle, pause
   * briefly, then fire the next — until the count is exhausted, Stop is pressed,
   * the wallet can't cover the bet, or an error occurs.
   */
  const runAuto = useCallback(async () => {
    while (mounted.current && autoLeftRef.current != null && autoLeftRef.current > 0) {
      const ok = await playRound()
      if (!mounted.current || autoLeftRef.current == null) return // stopped / unmounted
      if (!ok) {
        stopAuto()
        return
      }
      const left = (autoLeftRef.current ?? 0) - 1
      autoLeftRef.current = left
      setAutoLeft(left)
      if (left <= 0) {
        stopAuto()
        return
      }
      // Pause between rounds (interruptible by Stop / unmount).
      await new Promise<void>((resolve) => {
        autoTimer.current = setTimeout(() => {
          autoTimer.current = null
          resolve()
        }, AUTO_GAP_MS)
      })
    }
  }, [playRound, stopAuto])

  const startAuto = useCallback(() => {
    if (autoLeftRef.current != null || busy || replaying) return
    autoLeftRef.current = autoCount
    setAutoLeft(autoCount)
    void runAuto()
  }, [autoCount, busy, replaying, runAuto])

  const autoRunning = autoLeft != null

  // HUD readouts derive from lastRound once settled.
  const settled = phase === 'settled' && lastRound != null
  const hudWager = lastRound ? lastRound.totalBet : null
  const hudResult = settled ? resultLabel(lastRound!.result) : null
  const hudPayout = settled ? lastRound!.totalPayout : null

  const winningSide: DragonTigerResult | null = settled ? lastRound!.result : null

  const PICKS: { id: Pick; name: string; meta: string }[] = [
    { id: 'dragon', name: 'Dragon', meta: '1:1' },
    { id: 'tie', name: 'Tie', meta: '11:1' },
    { id: 'tiger', name: 'Tiger', meta: '1:1' },
  ]

  return (
    <div className="dt-scope mx-auto w-full max-w-6xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
        {/* ───────── Controls rail ───────── */}
        <Card className="arc-panel order-2 h-fit space-y-4 border-0 p-4 lg:order-1">
          {/* Balance + buy + mute */}
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
              <span className="text-xs uppercase tracking-wide text-slate-500">Number of rounds</span>
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

          {/* Bet on — single-selection (Dragon / Tie / Tiger) */}
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Bet on</span>
            <div className="grid grid-cols-3 gap-2">
              {PICKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy || autoRunning}
                  onClick={() => setPick(p.id)}
                  className={[
                    'rounded-xl border px-1.5 py-2.5 text-center transition-colors',
                    pick === p.id
                      ? 'border-cyan-500 bg-cyan-500/10 text-white shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]'
                      : 'border-cyan-950 bg-[#06101a]/60 text-slate-400 hover:border-cyan-500/40',
                    busy ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div className="arc-display text-[13px] font-semibold uppercase tracking-wide">
                    {p.name}
                  </div>
                  <div
                    className={`arc-mono mt-0.5 text-[10.5px] ${
                      pick === p.id ? 'text-cyan-300' : 'text-slate-500'
                    }`}
                  >
                    {p.meta}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Bet amount */}
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Bet amount</span>
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
              {CHIP_ADDS.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={busy || autoRunning}
                  onClick={() => setBet((b) => clampBet((b || 0) + a))}
                  className="arc-mono rounded-md border border-cyan-950 bg-[#06101a]/60 py-2 text-xs tabular-nums text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
                >
                  +{a >= 1000 ? `${a / 1000}k` : a}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || autoRunning}
                onClick={() =>
                  setBet(
                    balance != null
                      ? clampBet(Math.min(maxBet, Number(balance)))
                      : maxBet,
                  )
                }
                className="arc-mono rounded-md border border-cyan-950 bg-[#06101a]/60 py-2 text-xs tabular-nums text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
              >
                Max
              </button>
            </div>
            <div className="flex justify-between text-[10.5px] text-slate-500">
              <span className="arc-mono">Min {fmt(minBet)}</span>
              <span className="arc-mono">Max {fmt(maxBet)}</span>
            </div>
          </div>

          {/* Pays */}
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Pays</span>
            <div className="space-y-1.5 rounded-xl border border-cyan-950 bg-[#06101a]/40 p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Dragon / Tiger</span>
                <span className="arc-mono text-slate-300">1:1</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Tie</span>
                <span className="arc-mono text-slate-300">11:1</span>
              </div>
              <div className="pt-1 text-[10.5px] leading-snug text-slate-500">
                Ace is the lowest card. On a tie, Dragon &amp; Tiger bets lose half.
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
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button
              type="button"
              onClick={() => openVerify(history[0]?.roundId ?? null)}
              className="transition-colors hover:text-cyan-400"
            >
              Provably Fair{history.length > 0 ? ' · verify last round' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <div ref={boardRef} className="relative">
          <div className="dt-board-shell">
            {/* HUD */}
            <div className="dt-hud">
              <div className="dt-hud-cell">
                <div className="dt-hud-k">Wagered</div>
                <div className={`dt-hud-v dt-hud-amt ${hudWager == null ? 'dt-hud-idle' : ''}`}>
                  {hudWager != null ? fmt(hudWager) : '—'}
                </div>
              </div>
              <div className="dt-hud-cell">
                <div className="dt-hud-k">Result</div>
                <div className={`dt-hud-v dt-hud-res ${hudResult == null ? 'dt-hud-idle' : ''}`}>
                  {hudResult ?? '—'}
                </div>
              </div>
              <div className="dt-hud-cell">
                <div className="dt-hud-k">Payout</div>
                <div className={`dt-hud-v ${hudPayout == null ? 'dt-hud-idle' : ''}`}>
                  {hudPayout != null ? fmt(hudPayout) : '—'}
                </div>
              </div>
            </div>

            {/* Felt */}
            <div className="dt-felt">
              <div className="dt-duel">
                <div className={`dt-side dt-side-dragon ${winningSide === 'dragon' ? 'dt-winner' : ''}`}>
                  <div className="dt-sl">Dragon</div>
                  <FeltCard
                    cardIdx={dragonCard}
                    faceDown={!dragonShown}
                    flip={dragonShown}
                    win={winningSide === 'dragon'}
                  />
                  <div className="dt-sv">
                    {dragonShown && dragonCard != null ? `value ${cardRank(dragonCard) + 1}` : ''}
                  </div>
                </div>
                <div className="dt-vs">VS</div>
                <div className={`dt-side dt-side-tiger ${winningSide === 'tiger' ? 'dt-winner' : ''}`}>
                  <div className="dt-sl">Tiger</div>
                  <FeltCard
                    cardIdx={tigerCard}
                    faceDown={!tigerShown}
                    flip={tigerShown}
                    win={winningSide === 'tiger'}
                  />
                  <div className="dt-sv">
                    {tigerShown && tigerCard != null ? `value ${cardRank(tigerCard) + 1}` : ''}
                  </div>
                </div>
              </div>
              <div className="dt-felt-mid">{feltMsg}</div>

              {banner && (
                <div className="dt-banner-host">
                  <div className={`dt-banner dt-banner-${banner.kind} arc-banner-in`}>
                    <div className="dt-banner-k">{banner.k}</div>
                    <div className="dt-banner-v">{banner.v}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {pendingReplay && (
            <ReplayConfirmOverlay
              title="Replay round"
              headline={
                pendingReplay.result === 'dragon'
                  ? 'Dragon'
                  : pendingReplay.result === 'tiger'
                    ? 'Tiger'
                    : 'Tie'
              }
              sub={`${
                pendingReplay.totalPayout - pendingReplay.totalBet > 0
                  ? `+${(pendingReplay.totalPayout - pendingReplay.totalBet).toLocaleString()}`
                  : (pendingReplay.totalPayout - pendingReplay.totalBet).toLocaleString()
              } MORBIUS`}
              onPlay={startReplay}
              onCancel={() => setPendingReplay(null)}
            />
          )}
          </div>

          {/* Deal / Auto button — pinned to a fixed bottom bar on mobile (always
              reachable without scrolling); in-flow on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || busy || replaying}
              onClick={() => void deal()}
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {replaying ? 'Replaying…' : phase === 'settled' ? 'Deal again' : 'Place bet & deal'}
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
              disabled={!info || busy || replaying}
              onClick={startAuto}
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Start auto ({autoCount})
            </Button>
          )}
          </div>
        </div>
      </div>

      {/* Always-visible fairness bar — active seed pair + commitment. */}
      <ArcadeFairnessStrip onOpenPanel={() => setFairnessOpen(true)} />

      {/* ───────── Info tabs ───────── */}
      <div className="mt-4">
        <DragonTigerInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>

      <DragonTigerRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <DragonTigerFairnessModal
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

      {/* Board + card styling — ported from the Deep-Sea Neon lab. */}
      <style jsx>{`
        .dt-board-shell {
          background: linear-gradient(rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0) 16%), rgba(6, 16, 25, 0.72);
          border: 1px solid rgba(34, 211, 238, 0.12);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 24px 50px -30px rgba(0, 0, 0, 0.95);
        }
        .dt-hud {
          display: flex;
          gap: 1px;
          background: rgba(34, 211, 238, 0.12);
        }
        .dt-hud-cell {
          flex: 1;
          background: rgba(4, 12, 19, 0.85);
          padding: 11px 12px;
          text-align: center;
        }
        .dt-hud-k {
          font-size: 9.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #64748b;
        }
        .dt-hud-v {
          font-family: var(--font-arc-mono), ui-monospace, monospace;
          font-weight: 700;
          font-size: clamp(15px, 3.8vw, 21px);
          color: #fff;
          margin-top: 3px;
          font-variant-numeric: tabular-nums;
        }
        .dt-hud-amt {
          color: #f59e0b;
        }
        .dt-hud-res {
          color: #22d3ee;
          font-family: var(--font-arc-display), 'Chakra Petch', sans-serif;
        }
        .dt-hud-idle {
          color: #64748b !important;
        }
        .dt-felt {
          position: relative;
          min-height: clamp(250px, 50vw, 320px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 20px 14px;
          background: radial-gradient(ellipse 75% 60% at 50% 45%, rgba(34, 211, 238, 0.06), transparent 70%);
        }
        .dt-duel {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(14px, 5vw, 40px);
          width: 100%;
        }
        .dt-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .dt-sl {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #64748b;
          font-weight: 600;
        }
        .dt-side-dragon .dt-sl {
          color: #7be9fb;
        }
        .dt-side-tiger .dt-sl {
          color: #fbd36b;
        }
        .dt-side.dt-winner .dt-sl {
          color: #fff;
        }
        .dt-sv {
          font-family: var(--font-arc-mono), ui-monospace, monospace;
          font-size: 13px;
          color: #94a3b8;
          min-height: 16px;
        }
        .dt-vs {
          font-family: var(--font-arc-display), 'Chakra Petch', sans-serif;
          font-weight: 700;
          font-size: 18px;
          color: #64748b;
          letter-spacing: 0.1em;
        }
        .dt-card {
          width: clamp(64px, 18vw, 86px);
          aspect-ratio: 5 / 7;
          border-radius: 10px;
          background: #f2efe6;
          color: #1f2937;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 0.5px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.7);
          font-weight: 600;
        }
        .dt-card-red {
          color: #b3261e;
        }
        .dt-card-rank {
          font-size: clamp(20px, 5.4vw, 28px);
          line-height: 1;
        }
        .dt-card-suit {
          font-size: clamp(22px, 6vw, 34px);
          line-height: 1.05;
        }
        .dt-card-back {
          background: linear-gradient(135deg, #0c2a38, #06121b);
          color: #22d3ee;
          box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.3), 0 4px 12px -4px rgba(0, 0, 0, 0.7);
          justify-content: center;
          font-size: 30px;
        }
        .dt-card-win {
          box-shadow: 0 0 0 3px #22d3ee, 0 0 26px -4px #22d3ee;
        }
        .dt-flip {
          animation: dt-flip 0.42s cubic-bezier(0.34, 1.2, 0.6, 1) both;
        }
        @keyframes dt-flip {
          0% {
            transform: rotateY(90deg) scale(0.92);
            opacity: 0.2;
          }
          100% {
            transform: none;
            opacity: 1;
          }
        }
        .dt-felt-mid {
          font-size: 13px;
          color: #94a3b8;
          text-align: center;
          min-height: 18px;
        }
        .dt-banner-host {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          z-index: 8;
          pointer-events: none;
        }
        .dt-banner {
          text-align: center;
          padding: 16px 28px;
          border-radius: 18px;
        }
        .dt-banner-win {
          background: radial-gradient(ellipse at center, rgba(245, 158, 11, 0.22), rgba(4, 12, 19, 0.6));
          border: 1px solid rgba(245, 158, 11, 0.5);
          box-shadow: 0 0 50px -8px rgba(245, 158, 11, 0.55);
        }
        .dt-banner-loss {
          background: radial-gradient(ellipse at center, rgba(251, 113, 133, 0.16), rgba(4, 12, 19, 0.65));
          border: 1px solid rgba(251, 113, 133, 0.4);
        }
        .dt-banner-push {
          background: radial-gradient(ellipse at center, rgba(148, 163, 184, 0.16), rgba(4, 12, 19, 0.6));
          border: 1px solid rgba(148, 163, 184, 0.35);
        }
        .dt-banner-k {
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .dt-banner-win .dt-banner-k {
          color: #f59e0b;
        }
        .dt-banner-loss .dt-banner-k {
          color: #fb7185;
        }
        .dt-banner-v {
          font-family: var(--font-arc-mono), ui-monospace, monospace;
          font-weight: 700;
          font-size: clamp(24px, 7vw, 38px);
          color: #fff;
          margin-top: 4px;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  )
}
