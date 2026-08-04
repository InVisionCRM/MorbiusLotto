'use client'

/**
 * AndarBaharGame — the interactive client for chips Andar Bahar (/andar-bahar).
 *
 * Faithful port of the approved prototype (public/andar-bahar-lab.html): a
 * controls rail (Bet on side · Bet amount · Pays) beside a board (HUD · felt with
 * the joker, Andar and Bahar piles · win/loss banner), plus My-rounds / FAQ tabs
 * and the provably-fair Verify modal.
 *
 * Single-shot, server-resolved: one POST /api/arcade/andar-bahar/play debits the
 * bet, cuts the joker, deals both piles until a rank matches, and settles in one
 * transaction. The server returns the WHOLE deal; the client just REPLAYS it as
 * the alternating reveal animation — the timing is cosmetic and deterministic, the
 * outcome is already decided on the server. (No client-side RNG anywhere.)
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
import { ArcadeFairnessStrip } from '@/components/shared/ArcadeFairnessStrip'
import { probeSiweSession } from '@/lib/api-auth'
import { useBigWin } from '@/contexts/big-win-context'
import { AndarBaharInfoTabs } from './AndarBaharInfoTabs'
import { AndarBaharRulesModal } from './AndarBaharRulesModal'
import { AndarBaharFairnessModal } from './AndarBaharFairnessModal'
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay'
import { andarBaharAudio } from './andar-bahar-audio'
import {
  fetchAndarBaharInfo,
  fetchAndarBaharHistory,
  playAndarBahar,
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  cardRank0,
  formatPayMultiplier,
  sideLabel,
  type AndarBaharInfo,
  type AndarBaharPlayResult,
  type AndarBaharHistoryRound,
  type AndarBaharSide,
} from '@/lib/andar-bahar-client'

const HISTORY_LIMIT = 25
const JOKER_CUT_MS = 420 // prototype: time before the joker flips
const DEAL_STEP_MS = 220 // prototype: interval between alternating cards
const SETTLE_MS = 420 // prototype: pause after the last card before settling

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
/** Auto play (serialized): repeat the current side + bet N times, one full deal at a time. */
const AUTO_COUNTS = [10, 25, 50, 100] as const
const AUTO_GAP_MS = 700 // pause after a round settles before the next deal

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

type Phase = 'idle' | 'dealing' | 'settled'

interface PlayingCard {
  card: number
  match: boolean
}

/** A face-up playing card — felt cream stock, red pip on hearts/diamonds. */
function FeltCard({ card, big = false, match = false }: { card: number; big?: boolean; match?: boolean }) {
  return (
    <div
      className={[
        'arc-banner-in flex flex-col items-center justify-center rounded-md bg-[#f2efe6] font-semibold leading-none shadow-[0_2px_6px_-2px_rgba(0,0,0,0.6)]',
        cardIsRed(card) ? 'text-[#b3261e]' : 'text-[#1f2937]',
        big ? 'h-[68px] w-[50px] text-xl' : 'h-[38px] w-[27px] text-[13px]',
        match ? 'ring-2 ring-cyan-400 shadow-[0_0_16px_-3px_#22d3ee]' : '',
      ].join(' ')}
    >
      <span>{cardRankLabel(card)}</span>
      <span className={big ? 'text-xl' : 'text-[12px]'}>{cardSuitGlyph(card)}</span>
    </div>
  )
}

/** A face-down placeholder card (shown for the joker before the cut). */
function CardBack({ big = false }: { big?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-center rounded-md bg-gradient-to-br from-[#0c2a38] to-[#06121b] text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3)]',
        big ? 'h-[68px] w-[50px] text-xl' : 'h-[38px] w-[27px] text-[13px]',
      ].join(' ')}
    >
      ✦
    </div>
  )
}

export function AndarBaharGame() {
  const { address } = useAccount()
  const { reportWin } = useBigWin()

  const [info, setInfo] = useState<AndarBaharInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [side, setSide] = useState<AndarBaharSide>('andar')
  const [bet, setBet] = useState<number>(500)

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoCount, setAutoCount] = useState<number>(25)
  const [autoLeft, setAutoLeft] = useState<number | null>(null)

  // Live deal state (replayed from the server result).
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [joker, setJoker] = useState<number | null>(null)
  const [andar, setAndar] = useState<PlayingCard[]>([])
  const [bahar, setBahar] = useState<PlayingCard[]>([])
  const [feltMsg, setFeltMsg] = useState('Pick a side and deal')
  const [lastResult, setLastResult] = useState<AndarBaharPlayResult | null>(null)
  const [banner, setBanner] = useState<{ kind: 'win' | 'loss'; label: string; value: string } | null>(null)

  // Replay: a staged past round (confirm overlay) + a flag while its deal
  // re-runs. Replays are a pure re-watch — no server call, balance, history,
  // session, or reportWin.
  const [pendingReplay, setPendingReplay] = useState<AndarBaharHistoryRound | null>(null)
  const [replaying, setReplaying] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  const [history, setHistory] = useState<AndarBaharHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const mounted = useRef(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const boardRef = useRef<HTMLDivElement | null>(null)
  // Auto loop bookkeeping. autoActiveRef gates the run; autoTimer holds the
  // inter-round pause; settleResolve releases the loop once a deal finishes.
  const autoActiveRef = useRef(false)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    fetchAndarBaharInfo()
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
      timers.current.forEach(clearTimeout)
      timers.current = []
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
      .then((ok) => (ok ? fetchAndarBaharHistory(HISTORY_LIMIT) : []))
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
  const payAndarX100 = info?.payAndarX100 ?? 190
  const payBaharX100 = info?.payBaharX100 ?? 200

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )

  const payLabel = (s: AndarBaharSide) => (s === 'andar' ? '0.9:1' : '1:1')

  /**
   * Replay the server's deal as the alternating reveal, then settle. Reused for
   * the user-facing "Replay" of a past round: with `isReplay`, the settlement
   * step is a pure re-watch — banner + felt only, no reportWin / balance /
   * history (those already happened when the round was first played).
   */
  const replayDeal = useCallback(
    (res: AndarBaharPlayResult, opts?: { isReplay?: boolean }) => {
      const isReplay = opts?.isReplay ?? false
      const jr = cardRank0(res.joker)
      // Flatten the two piles back into alternating deal order so the reveal
      // matches how the cards actually came off the deck (Andar, Bahar, …).
      const total = res.andarCards.length + res.baharCards.length
      const sequence: { toAndar: boolean; card: number; last: boolean }[] = []
      let ai = 0
      let bi = 0
      for (let p = 0; p < total; p++) {
        const toAndar = p % 2 === 0
        const card = toAndar ? res.andarCards[ai++]! : res.baharCards[bi++]!
        sequence.push({ toAndar, card, last: p === total - 1 })
      }

      const push = (t: ReturnType<typeof setTimeout>) => timers.current.push(t)

      // 1) Cut the joker (face-down → flip).
      setFeltMsg('Cutting the joker…')
      andarBaharAudio.playDeal()
      push(
        setTimeout(() => {
          if (!mounted.current) return
          setJoker(res.joker)
          andarBaharAudio.playMatch()
          setFeltMsg(`Matching the ${cardRankLabel(res.joker)} — Andar first…`)

          // 2) Deal the cards one at a time, alternating.
          sequence.forEach((step, i) => {
            push(
              setTimeout(() => {
                if (!mounted.current) return
                const playing: PlayingCard = { card: step.card, match: step.last }
                if (step.toAndar) setAndar((prev) => [...prev, playing])
                else setBahar((prev) => [...prev, playing])
                andarBaharAudio.playDeal()
                if (step.last) andarBaharAudio.playMatch()
              }, i * DEAL_STEP_MS),
            )
          })

          // 3) Settle after the last card.
          push(
            setTimeout(() => {
              if (!mounted.current) return
              const net = res.payout - res.bet
              if (!isReplay) reportWin({ game: 'Andar Bahar', bet: res.bet, payout: res.payout })
              if (net > 0) {
                andarBaharAudio.playWin()
                setBanner({
                  kind: 'win',
                  label: `${sideLabel(res.winningSide)} matched`,
                  value: `+${net.toLocaleString()} MORBIUS`,
                })
              } else {
                andarBaharAudio.playLose()
                setBanner({
                  kind: 'loss',
                  label: `${sideLabel(res.winningSide)} matched`,
                  value: `−${Math.abs(net).toLocaleString()} MORBIUS`,
                })
              }
              setFeltMsg(
                `${sideLabel(res.winningSide)} matched the ${cardRankLabel(res.joker)} after ${total} card${
                  total === 1 ? '' : 's'
                }.`,
              )
              setPhase('settled')
              if (isReplay) {
                setReplaying(false)
              } else {
                setBusy(false)
                // Deal fully settled — release any awaiting serialized-auto loop.
                const resolve = settleResolve.current
                settleResolve.current = null
                resolve?.()
              }
            }, sequence.length * DEAL_STEP_MS + SETTLE_MS),
          )
          void jr
        }, JOKER_CUT_MS),
      )
    },
    [reportWin],
  )

  const deal = useCallback(async (): Promise<'ok' | 'stop'> => {
    if (busy || replaying || !info) return 'stop'
    const stake = clampBet(bet)
    setBet(stake)
    setError(null)
    setNoChips(false)
    // A real deal exits any replay view (pending prompt + in-flight reveal).
    setPendingReplay(null)
    setReplaying(false)
    setBusy(true)
    setPhase('dealing')

    // Reset the felt for a fresh deal.
    timers.current.forEach(clearTimeout)
    timers.current = []
    setJoker(null)
    setAndar([])
    setBahar([])
    setBanner(null)
    setLastResult(null)
    setFeltMsg('Dealing…')

    andarBaharAudio.init()

    try {
      const res = await playAndarBahar({
        side,
        bet: stake,
      })
      if (!mounted.current) return 'stop'
      setBalance(BigInt(res.chipBalance))
      setLastResult(res)
      setHistory((prev) =>
        [
          {
            roundId: res.roundId,
            side: res.side,
            bet: res.bet,
            joker: res.joker,
            andarCards: res.andarCards,
            baharCards: res.baharCards,
            winningSide: res.winningSide,
            matchIndex: res.matchIndex,
            won: res.won,
            payout: res.payout,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )
      // Resolve once replayDeal's settle runs (full alternating deal done).
      const settledPromise = new Promise<void>((resolve) => {
        settleResolve.current = resolve
      })
      replayDeal(res)
      await settledPromise
      return mounted.current ? 'ok' : 'stop'
    } catch (e) {
      if (!mounted.current) return 'stop'
      const msg = (e as Error)?.message ?? ''
      if (/Not enough chips|insufficient|402/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not play the round. Try again.')
      }
      setPhase('idle')
      setBusy(false)
      setFeltMsg('Pick a side and deal')
      return 'stop'
    }
  }, [busy, replaying, info, bet, side, clampBet, replayDeal])

  // ── Replay a past round: stage the confirm overlay, then re-run the exact
  // same alternating deal (no server call, no balance/history change). ──
  const handleReplay = useCallback(
    (round: AndarBaharHistoryRound) => {
      if (busy || replaying) return
      andarBaharAudio.init()
      setPendingReplay(round)
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [busy, replaying],
  )

  const startReplay = useCallback(() => {
    const round = pendingReplay
    if (!round) return
    setPendingReplay(null)
    timers.current.forEach(clearTimeout)
    timers.current = []
    setReplaying(true)
    // Reset the felt so the reveal re-runs from scratch.
    setJoker(null)
    setAndar([])
    setBahar([])
    setBanner(null)
    setPhase('dealing')
    andarBaharAudio.init()
    // Rebuild the play-result shape replayDeal needs from the stored row.
    const res: AndarBaharPlayResult = {
      roundId: round.roundId,
      side: round.side,
      bet: round.bet,
      joker: round.joker,
      andarCards: round.andarCards,
      baharCards: round.baharCards,
      winningSide: round.winningSide,
      matchIndex: round.matchIndex,
      won: round.won,
      payout: round.payout,
      serverSeedHash: '',
      chipBalance: '',
    }
    setLastResult(res)
    replayDeal(res, { isReplay: true })
  }, [pendingReplay, replayDeal])

  const stopAuto = useCallback(() => {
    autoActiveRef.current = false
    setAutoLeft(null)
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }, [])

  /**
   * Serialized auto loop: deal one round, await the full alternating reveal,
   * pause briefly, then fire the next — until the count is exhausted, Stop is
   * pressed, the wallet can't cover the bet, or an error occurs. Repeats the
   * current side + bet.
   */
  const runAuto = useCallback(async () => {
    let left = autoCount
    autoActiveRef.current = true
    setAutoLeft(left)
    while (mounted.current && autoActiveRef.current && left > 0) {
      const r = await deal()
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
  }, [autoCount, deal, stopAuto])

  const startAuto = useCallback(() => {
    if (autoActiveRef.current || busy || replaying) return
    void runAuto()
  }, [busy, replaying, runAuto])

  const autoRunning = autoLeft != null

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  const toggleMute = useCallback(() => {
    andarBaharAudio.init()
    setMuted((m) => {
      andarBaharAudio.setMute(!m)
      return !m
    })
  }, [])

  const wagerHud = lastResult?.bet ?? (phase === 'idle' ? null : clampBet(bet))
  const payoutHud = phase === 'settled' ? lastResult?.payout ?? null : null
  const winner = phase === 'settled' ? lastResult?.winningSide ?? null : null

  const sideButtons: { key: AndarBaharSide; pay: number }[] = useMemo(
    () => [
      { key: 'andar', pay: payAndarX100 },
      { key: 'bahar', pay: payBaharX100 },
    ],
    [payAndarX100, payBaharX100],
  )

  return (
    <div className="mx-auto w-full max-w-5xl pb-28 lg:pb-0">
      {/* Top bar: balance + buy + sound + provably fair */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-[#081420]/70 px-3 py-2 ring-1 ring-cyan-500/15">
          <span className="h-[18px] w-[18px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#7be9fb,#22D3EE_55%,#0e7490)] shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
          <span className="arc-mono text-base font-bold tabular-nums text-white">
            {balance != null ? formatChips(balance) : '—'}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-cyan-300">MORBIUS</span>
          <button
            type="button"
            onClick={() => setExchangeOpen(true)}
            className="ml-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            Buy
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#081420]/70 px-3 py-2 text-xs uppercase tracking-wide text-slate-400 ring-1 ring-cyan-500/15 transition-colors hover:text-cyan-300"
          >
            Rules
          </button>
          <button
            type="button"
            onClick={() => openVerify(history[0]?.roundId ?? null)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#081420]/70 px-3 py-2 text-xs uppercase tracking-wide text-slate-400 ring-1 ring-cyan-500/15 transition-colors hover:text-cyan-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            Provably fair
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="rounded-xl bg-[#081420]/70 p-2 text-slate-400 ring-1 ring-cyan-500/15 transition-colors hover:text-cyan-300"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
        {/* ───────── Controls rail ───────── */}
        <div className="order-2 space-y-3.5 lg:order-1">
          {/* Manual / Auto */}
          <Card className="arc-panel border-0 p-4">
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
                      : 'text-slate-500 ring-1 ring-cyan-500/15 hover:text-slate-300',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
            {mode === 'auto' && (
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {AUTO_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={autoRunning}
                    onClick={() => setAutoCount(n)}
                    className={[
                      'arc-mono rounded-lg py-2 text-[12.5px] font-semibold tabular-nums transition-colors',
                      autoCount === n
                        ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50'
                        : 'bg-[#06101906] text-slate-400 ring-1 ring-cyan-500/15 hover:text-cyan-300',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Bet on */}
          <Card className="arc-panel border-0 p-4">
            <p className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-slate-500">Bet on</p>
            <div className="grid grid-cols-2 gap-2">
              {sideButtons.map((s) => {
                const active = side === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={busy || autoRunning}
                    onClick={() => setSide(s.key)}
                    className={[
                      'rounded-xl px-2 py-2.5 text-center transition-colors',
                      active
                        ? 'bg-gradient-to-b from-cyan-500/15 to-cyan-500/[0.04] text-white ring-1 ring-cyan-500 shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]'
                        : 'bg-[#06101906] text-slate-400 ring-1 ring-cyan-500/15 hover:ring-cyan-500/40',
                      busy ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <div className="arc-display text-sm font-semibold uppercase tracking-wide">
                      {sideLabel(s.key)}
                    </div>
                    <div className={`arc-mono mt-0.5 text-[11px] ${active ? 'text-cyan-300' : 'text-slate-500'}`}>
                      {payLabel(s.key)}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Bet amount */}
          <Card className="arc-panel border-0 p-4">
            <p className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-slate-500">Bet amount</p>
            <div className="mb-2.5 flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#02080d]/70 px-3 ring-1 ring-cyan-500/15">
                <span className="h-[18px] w-[18px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#7be9fb,#22D3EE_55%,#0e7490)]" />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={minBet}
                  max={maxBet}
                  value={bet}
                  disabled={busy || autoRunning}
                  onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  onBlur={() => setBet((b) => clampBet(b))}
                  className="arc-mono border-0 bg-transparent px-0 text-[17px] font-bold tabular-nums text-white focus-visible:ring-0"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || autoRunning}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="arc-mono w-10 border-cyan-500/15 bg-[#081420]/70 px-0 font-bold hover:bg-cyan-500/10"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || autoRunning}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="arc-mono w-10 border-cyan-500/15 bg-[#081420]/70 px-0 font-bold hover:bg-cyan-500/10"
              >
                2×
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '+100', add: 100 },
                { label: '+500', add: 500 },
                { label: '+1k', add: 1000 },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  disabled={busy || autoRunning}
                  onClick={() => setBet((b) => clampBet((Number(b) || 0) + c.add))}
                  className="arc-mono rounded-lg bg-[#06101906] py-2 text-[12.5px] font-semibold text-slate-400 ring-1 ring-cyan-500/15 transition-colors hover:text-cyan-300 hover:ring-cyan-500/40 disabled:opacity-50"
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || autoRunning}
                onClick={() => setBet(balance != null ? clampBet(Number(balance)) : maxBet)}
                className="arc-mono rounded-lg bg-[#06101906] py-2 text-[12.5px] font-semibold text-slate-400 ring-1 ring-cyan-500/15 transition-colors hover:text-cyan-300 hover:ring-cyan-500/40 disabled:opacity-50"
              >
                Max
              </button>
            </div>
            <div className="arc-mono mt-2.5 flex justify-between text-[10.5px] text-slate-500">
              <span>Min {minBet.toLocaleString()}</span>
              <span>Max {maxBet.toLocaleString()}</span>
            </div>
          </Card>

          {/* Pays */}
          <Card className="arc-panel border-0 p-4">
            <p className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-slate-500">Pays</p>
            <div className="space-y-1.5">
              <div className="flex items-center text-xs text-slate-400">
                <span>Andar (dealt first)</span>
                <span className="arc-mono ml-auto text-slate-300">{payLabel('andar')}</span>
              </div>
              <div className="flex items-center text-xs text-slate-400">
                <span>Bahar</span>
                <span className="arc-mono ml-auto text-slate-300">{payLabel('bahar')}</span>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-slate-500">
                Cards deal to Andar first, then Bahar, alternating until one matches the joker&apos;s rank.
              </p>
            </div>
          </Card>
        </div>

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <div ref={boardRef} className="relative">
          <div className="overflow-hidden rounded-2xl bg-[linear-gradient(rgba(255,255,255,0.025),rgba(255,255,255,0)_16%),rgba(6,16,25,0.72)] ring-1 ring-cyan-500/15 shadow-[0_24px_50px_-30px_rgba(0,0,0,0.95)]">
            {/* HUD */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <HudCell k="Wagered" v={wagerHud != null ? wagerHud.toLocaleString() : '—'} tone="amber" idle={wagerHud == null} />
              <HudCell k="Joker" v={joker != null ? cardRankLabel(joker) : '—'} tone="cyan" idle={joker == null} />
              <HudCell k="Payout" v={payoutHud != null ? payoutHud.toLocaleString() : '—'} tone="white" idle={payoutHud == null} />
            </div>

            {/* Felt */}
            <div className="relative flex min-h-[320px] flex-col gap-2.5 bg-[radial-gradient(ellipse_80%_64%_at_50%_30%,rgba(34,211,238,0.06),transparent_70%)] p-3 sm:p-4">
              {/* Joker */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-500">Joker</div>
                {joker != null ? <FeltCard card={joker} big /> : <CardBack big />}
              </div>

              {/* Andar pile */}
              <AbSide
                name="Andar"
                pay={payLabel('andar')}
                nameClass="text-[#7be9fb]"
                cards={andar}
                winner={winner === 'andar'}
              />
              {/* Bahar pile */}
              <AbSide
                name="Bahar"
                pay={payLabel('bahar')}
                nameClass="text-[#fbd36b]"
                cards={bahar}
                winner={winner === 'bahar'}
              />

              <div className="mt-auto min-h-[18px] text-center text-[13px] text-slate-400">{feltMsg}</div>

              {/* Win/loss banner */}
              {banner && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={[
                      'arc-banner-in rounded-2xl px-7 py-4 text-center',
                      banner.kind === 'win'
                        ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.22),rgba(4,12,19,0.6))] ring-1 ring-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                        : 'bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.16),rgba(4,12,19,0.65))] ring-1 ring-rose-400/40',
                    ].join(' ')}
                  >
                    <div
                      className={`text-xs uppercase tracking-[0.22em] ${
                        banner.kind === 'win' ? 'text-amber-400' : 'text-rose-400'
                      }`}
                    >
                      {banner.label}
                    </div>
                    <div className="arc-mono mt-1 text-3xl font-bold tabular-nums text-white sm:text-4xl">
                      {banner.value}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {pendingReplay && (
            <ReplayConfirmOverlay
              title="Replay round"
              headline={sideLabel(pendingReplay.winningSide)}
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

          {/* Deal / Auto button — pinned to a fixed bottom bar on mobile (always
              reachable without scrolling); in-flow on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {mode === 'manual' ? (
            <Button
              type="button"
              disabled={!info || busy || replaying}
              onClick={() => void deal()}
              className="arc-display h-14 w-full bg-gradient-to-b from-[#3ee0f5] via-cyan-400 to-[#0fb6d4] text-base font-bold uppercase tracking-widest text-[#04141b] shadow-[0_0_24px_-6px_rgba(34,211,238,0.68)] hover:brightness-105 disabled:opacity-50"
            >
              {replaying ? 'Replaying…' : busy ? 'Dealing…' : phase === 'settled' ? 'Deal again' : 'Place bet & deal'}
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
              className="arc-display h-14 w-full bg-gradient-to-b from-[#3ee0f5] via-cyan-400 to-[#0fb6d4] text-base font-bold uppercase tracking-widest text-[#04141b] shadow-[0_0_24px_-6px_rgba(34,211,238,0.68)] hover:brightness-105 disabled:opacity-50"
            >
              Start auto ({autoCount})
            </Button>
          )}
          </div>

          {infoFailed && (
            <p className="text-center text-sm text-slate-400">
              Couldn&apos;t load the game config.{' '}
              <button type="button" onClick={loadInfo} className="font-semibold text-cyan-400 underline-offset-2 hover:underline">
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
        </div>
      </div>

      {/* Always-visible fairness bar — active seed pair + commitment. */}
      <ArcadeFairnessStrip onOpenPanel={() => setFairnessOpen(true)} />

      {/* ───────── Info tabs ───────── */}
      <div className="mt-4">
        <AndarBaharInfoTabs history={history} historyLoading={historyLoading} onVerify={openVerify} onReplay={handleReplay} />
      </div>

      <AndarBaharRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />

      <AndarBaharFairnessModal
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

function HudCell({
  k,
  v,
  tone,
  idle,
}: {
  k: string
  v: string
  tone: 'amber' | 'cyan' | 'white'
  idle: boolean
}) {
  const color = idle
    ? 'text-slate-500'
    : tone === 'amber'
      ? 'text-amber-400'
      : tone === 'cyan'
        ? 'text-cyan-300'
        : 'text-white'
  return (
    <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{k}</div>
      <div className={`arc-mono mt-0.5 text-lg font-bold tabular-nums sm:text-xl ${color}`}>{v}</div>
    </div>
  )
}

function AbSide({
  name,
  pay,
  nameClass,
  cards,
  winner,
}: {
  name: string
  pay: string
  nameClass: string
  cards: PlayingCard[]
  winner: boolean
}) {
  return (
    <div
      className={[
        'min-h-[64px] rounded-xl p-2.5 transition-colors',
        winner
          ? 'bg-cyan-500/[0.06] ring-1 ring-cyan-500/35 shadow-[0_0_20px_-6px_rgba(34,211,238,0.5)]'
          : 'ring-1 ring-cyan-500/10',
      ].join(' ')}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${nameClass}`}>{name}</span>
        <span className="arc-mono text-[10.5px] text-slate-500">{pay}</span>
      </div>
      <div className="flex min-h-[40px] flex-wrap gap-1.5">
        {cards.map((c, i) => (
          <FeltCard key={i} card={c.card} match={c.match} />
        ))}
      </div>
    </div>
  )
}
