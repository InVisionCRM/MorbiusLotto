'use client'

/**
 * StakeMinesGame — the interactive client for chips Mines (/mines2).
 *
 * Stateful, server-owned round (unlike keno/plinko's one-shot bets):
 *   start   → bet is debited, bombs sealed behind a committed hash
 *   pick    → reveal one cell; safe bumps the multiplier, a mine busts
 *   cashout → bank floor(bet × multiplier) any time after the first gem
 *
 * Wiring notes (same conventions as StakeKenoGame / StakePlinkoGame):
 *   • Bounds + per-bombs ladders come from /api/arcade/mines/info.
 *   • Balance reads use the public chips endpoint (usePokerChipBalance) so a
 *     logged-out visitor never triggers a sign-in popup; authed responses
 *     (start/cashout) then keep it current. Buying chips reuses the poker
 *     exchange modal.
 *   • On mount (session permitting) we call /state to RESUME an active round —
 *     the server allows one active round per wallet, so a refresh mid-round
 *     must pick up where it left off rather than locking the player out.
 *   • Picks are serialized: one in-flight /pick at a time (pendingCell), and
 *     every phase transition happens before its await so double-clicks can't
 *     double-spend.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Volume2, VolumeX } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance'
import { formatChips } from '@/lib/format-poker-chips'
import { GameWalletModal } from '@/components/shared/GameWalletModal'
import { probeSiweSession } from '@/lib/api-auth'
import { MinesBoard, type MinesCellState } from './MinesBoard'
import { MinesInfoTabs } from './MinesInfoTabs'
import { MinesFairnessModal } from './MinesFairnessModal'
import { MinesRulesModal } from './MinesRulesModal'
import { minesAudio } from './mines-audio'
import {
  fetchMinesInfo,
  fetchMinesState,
  fetchMinesHistory,
  startMines,
  pickMines,
  cashoutMines,
  formatMultiplier,
  MINES_TOTAL_CELLS,
  type MinesInfo,
  type MinesActiveRound,
  type MinesHistoryRound,
} from '@/lib/mines-client'

const HISTORY_LIMIT = 25
const BOMB_PRESETS = [1, 3, 5, 10, 24]

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/)
  return m ? m[1] : null
}

type Phase = 'idle' | 'starting' | 'active' | 'picking' | 'cashing' | 'busted' | 'cashed'

const HIDDEN_BOARD: MinesCellState[] = Array.from({ length: MINES_TOTAL_CELLS }, () => 'hidden')

export function StakeMinesGame() {
  const { address } = useAccount()

  const [info, setInfo] = useState<MinesInfo | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)

  const [bet, setBet] = useState<number>(10)
  const [bombsCount, setBombsCount] = useState<number>(3)
  const [clientSeed, setClientSeed] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [roundId, setRoundId] = useState<string | null>(null)
  const [roundBet, setRoundBet] = useState<number>(0)
  const [roundBombs, setRoundBombs] = useState<number>(0)
  const [ladder, setLadder] = useState<number[] | null>(null)
  const [cells, setCells] = useState<MinesCellState[]>(HIDDEN_BOARD)
  const [pendingCell, setPendingCell] = useState<number | null>(null)
  const [multiplierX100, setMultiplierX100] = useState(100)
  const [cashedPayout, setCashedPayout] = useState<number | null>(null)
  const [lastFinalizedId, setLastFinalizedId] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [noChips, setNoChips] = useState(false)
  const [muted, setMuted] = useState(false)

  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)

  const [history, setHistory] = useState<MinesHistoryRound[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Balance: public read keyed by wallet address (no sign-in popup), then kept
  // fresh from authoritative start/cashout responses and exchange completions.
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
    fetchMinesInfo()
      .then((i) => {
        setInfo(i)
        setBet((b) => Math.min(i.maxBet, Math.max(i.minBet, b)))
        setBombsCount((c) => Math.min(i.maxBombs, Math.max(i.minBombs, c)))
      })
      .catch(() => setInfoFailed(true))
  }, [])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  /** Hydrate an active round returned by /state (mount resume or 409 recovery). */
  const hydrateActive = useCallback((active: MinesActiveRound) => {
    const next = [...HIDDEN_BOARD]
    for (const cell of active.picks) next[cell] = 'gem' // active rounds only hold safe picks
    setRoundId(active.roundId)
    setRoundBet(active.bet)
    setRoundBombs(active.bombs)
    setLadder(active.ladder)
    setCells(next)
    setMultiplierX100(active.multiplierX100)
    setBet(active.bet)
    setBombsCount(active.bombs)
    setCashedPayout(null)
    setPhase('active')
  }, [])

  // Session-gated mount work: resume an active round + load history.
  // probeSiweSession first so a logged-out visitor never gets a wallet popup.
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    probeSiweSession()
      .then(async (ok) => {
        if (!ok) return
        const [active, rounds] = await Promise.all([
          fetchMinesState().catch(() => null),
          fetchMinesHistory(HISTORY_LIMIT).catch(() => [] as MinesHistoryRound[]),
        ])
        if (cancelled) return
        setHistory(rounds)
        if (active) hydrateActive(active)
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
  }, [address, hydrateActive])

  const minBet = info?.minBet ?? 1
  const maxBet = info?.maxBet ?? 1_000
  const minBombs = info?.minBombs ?? 1
  const maxBombs = info?.maxBombs ?? 24

  const clampBet = useCallback(
    (n: number) => Math.min(maxBet, Math.max(minBet, Math.floor(n || 0))),
    [minBet, maxBet],
  )
  const clampBombs = useCallback(
    (n: number) => Math.min(maxBombs, Math.max(minBombs, Math.floor(n || 0))),
    [minBombs, maxBombs],
  )

  const inRound = phase === 'active' || phase === 'picking' || phase === 'cashing'
  const canStart = phase === 'idle' || phase === 'busted' || phase === 'cashed'
  const gems = useMemo(() => cells.filter((c) => c === 'gem').length, [cells])
  const cashoutValue = Math.floor((roundBet * multiplierX100) / 100)

  // Ladder for the stats strip: the live round's when in one, otherwise the
  // preview for the currently selected mines count.
  const previewLadder = inRound ? ladder : (info?.ladders?.[bombsCount] ?? null)
  const shownGems = inRound ? gems : 0
  const nextMultX100 = previewLadder?.[shownGems + 1] ?? null
  const maxMultX100 = previewLadder?.[previewLadder.length - 1] ?? null

  /** Re-sync with the server when our view of the round went stale (409s). */
  const resync = useCallback(async () => {
    try {
      const active = await fetchMinesState()
      if (active) {
        hydrateActive(active)
      } else {
        setPhase('idle')
        setRoundId(null)
        setCells(HIDDEN_BOARD)
        setMultiplierX100(100)
      }
    } catch {
      /* leave as-is; next action will surface an error */
    }
  }, [hydrateActive])

  const onStart = useCallback(async () => {
    if (!canStart || !info) return
    const stake = clampBet(bet)
    const mines = clampBombs(bombsCount)
    setBet(stake)
    setBombsCount(mines)
    setError(null)
    setNoChips(false)
    setCashedPayout(null)
    setPhase('starting')
    minesAudio.init()
    try {
      const res = await startMines({
        bet: stake,
        bombs: mines,
        clientSeed: clientSeed.trim() || undefined,
      })
      setRoundId(res.roundId)
      setRoundBet(res.bet)
      setRoundBombs(res.bombs)
      setLadder(res.ladder)
      setCells(HIDDEN_BOARD)
      setMultiplierX100(100)
      setBalance(BigInt(res.chipBalance))
      setPhase('active')
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (/409/.test(msg)) {
        // An active round already exists (other tab / earlier refresh) — resume it.
        await resync()
        return
      }
      setPhase('idle')
      if (/Not enough chips|insufficient/i.test(msg)) {
        setError('Not enough MORBIUS for that bet.')
        setNoChips(true)
      } else if (/401|auth|No session/i.test(msg)) {
        setError('Connect your wallet to play.')
      } else {
        setError(serverDetail(msg) ?? 'Could not start the round. Try again.')
      }
    }
  }, [canStart, info, bet, bombsCount, clientSeed, clampBet, clampBombs, resync])

  const onPick = useCallback(
    async (cell: number) => {
      if (phase !== 'active' || !roundId || pendingCell !== null) return
      if (cells[cell] !== 'hidden') return
      setError(null)
      setPendingCell(cell)
      setPhase('picking')
      minesAudio.playTick()
      try {
        const res = await pickMines(roundId, cell)
        if (res.safe) {
          setCells((prev) => {
            const next = [...prev]
            next[cell] = 'gem'
            return next
          })
          setMultiplierX100(res.multiplierX100)
          minesAudio.playSafe(res.picks.length)
          setPhase('active')
        } else {
          // Bust: show the hit mine hot, the rest dimmed.
          setCells((prev) => {
            const next = [...prev]
            for (const b of res.bombs) next[b] = b === cell ? 'bomb' : 'bomb-other'
            return next
          })
          minesAudio.playBust()
          setPhase('busted')
          setLastFinalizedId(roundId)
          setHistory((prev) =>
            [
              {
                roundId,
                bet: roundBet,
                bombs: roundBombs,
                gems: res.picks.length - 1,
                multiplierX100: 0,
                payout: 0,
                status: 'busted' as const,
                createdAt: new Date().toISOString(),
              },
              ...prev,
            ].slice(0, HISTORY_LIMIT),
          )
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? ''
        if (/409/.test(msg)) {
          await resync()
        } else {
          setPhase('active')
          setError(serverDetail(msg) ?? 'Could not reveal that cell. Try again.')
        }
      } finally {
        setPendingCell(null)
      }
    },
    [phase, roundId, pendingCell, cells, roundBet, roundBombs, resync],
  )

  const onCashout = useCallback(async () => {
    if (phase !== 'active' || !roundId || gems === 0) return
    setError(null)
    setPhase('cashing')
    try {
      const res = await cashoutMines(roundId)
      setCells((prev) => {
        const next = [...prev]
        for (const b of res.bombs) if (next[b] === 'hidden') next[b] = 'bomb-other'
        return next
      })
      setMultiplierX100(res.multiplierX100)
      setCashedPayout(res.payout)
      setBalance(BigInt(res.chipBalance))
      minesAudio.playCashout()
      setPhase('cashed')
      setLastFinalizedId(roundId)
      setHistory((prev) =>
        [
          {
            roundId,
            bet: roundBet,
            bombs: roundBombs,
            gems: res.picks.length,
            multiplierX100: res.multiplierX100,
            payout: res.payout,
            status: 'cashed_out' as const,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      )
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (/409/.test(msg)) {
        await resync()
      } else {
        setPhase('active') // round is still live — let the player retry
        setError(serverDetail(msg) ?? 'Could not cash out. Try again.')
      }
    }
  }, [phase, roundId, gems, roundBet, roundBombs, resync])

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id)
    setFairnessOpen(true)
  }, [])

  const toggleMute = () => {
    minesAudio.init()
    minesAudio.setMute(!muted)
    setMuted(!muted)
  }

  const profit = cashedPayout !== null ? cashedPayout - roundBet : 0
  const showWinBanner = phase === 'cashed' && cashedPayout !== null && cashedPayout > 0

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
                ({minBet.toLocaleString()}–{maxBet.toLocaleString()})
              </span>
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={minBet}
                max={maxBet}
                value={bet}
                disabled={!canStart}
                onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                onBlur={() => setBet((b) => clampBet(b))}
                className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!canStart}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canStart}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
              >
                2×
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canStart}
                onClick={() => setBet(maxBet)}
                className="border-cyan-950 bg-transparent px-2.5 text-xs hover:bg-cyan-500/10"
              >
                Max
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Mines{' '}
              <span className="normal-case text-slate-600">
                ({minBombs}–{maxBombs} of {MINES_TOTAL_CELLS} cells)
              </span>
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={minBombs}
                max={maxBombs}
                value={bombsCount}
                disabled={!canStart}
                onChange={(e) =>
                  setBombsCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                onBlur={() => setBombsCount((c) => clampBombs(c))}
                className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
              />
              <div className="flex flex-1 gap-1.5">
                {BOMB_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!canStart}
                    onClick={() => setBombsCount(clampBombs(n))}
                    className={[
                      'arc-mono flex-1 rounded-md px-1 py-2 text-xs font-semibold tabular-nums ring-1 transition-colors',
                      bombsCount === n
                        ? 'bg-rose-500/15 text-rose-300 ring-rose-500/50'
                        : 'bg-[#081420] text-slate-400 ring-cyan-950 hover:text-rose-300',
                      !canStart ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action button: pinned to a fixed bottom bar on mobile (Bet / Cash out always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {canStart ? (
            <Button
              type="button"
              disabled={phase === 'starting' || !info}
              onClick={onStart}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'starting' ? 'Starting…' : 'Bet'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={phase !== 'active' || gems === 0}
              onClick={onCashout}
              className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1B1203] shadow-[0_0_24px_-6px_rgba(245,158,11,0.8)] hover:bg-amber-300 disabled:opacity-50"
            >
              {phase === 'cashing'
                ? 'Cashing out…'
                : gems === 0
                  ? 'Pick a cell to begin'
                  : `Cash out ${cashoutValue.toLocaleString()}`}
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

          <div aria-live="polite">
            {phase === 'busted' && (
              <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300 ring-1 ring-rose-500/40">
                Boom — hit a mine after {gems} gem{gems === 1 ? '' : 's'}.
              </div>
            )}
            {phase === 'cashed' && cashedPayout !== null && (
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200 ring-1 ring-amber-500/40">
                Cashed out{' '}
                <span className="arc-mono text-amber-300">
                  +{profit.toLocaleString()} MORBIUS ({formatMultiplier(multiplierX100)})
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button type="button" onClick={() => openVerify(lastFinalizedId)} className="transition-colors hover:text-cyan-400">
              Provably Fair{lastFinalizedId ? ' · verify last round' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Board + ladder strip ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="arc-panel relative border-0 p-3 sm:p-5">
            <MinesBoard
              cells={cells}
              pendingCell={pendingCell}
              interactive={phase === 'active'}
              onPick={onPick}
            />
            {showWinBanner && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="arc-banner-in arc-panel rounded-2xl border border-amber-400/40 px-8 py-5 text-center shadow-[0_0_60px_-12px_rgba(245,158,11,0.55)]">
                  <div className="arc-display text-3xl font-bold text-amber-300 sm:text-4xl">
                    {formatMultiplier(multiplierX100)}
                  </div>
                  <div className="arc-mono mt-1 text-sm tabular-nums text-amber-200/90">
                    +{profit.toLocaleString()} MORBIUS
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="arc-panel grid grid-cols-3 divide-x divide-cyan-950/60 rounded-xl px-2 py-3 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {inRound ? 'Current' : 'First gem pays'}
              </div>
              <div className="arc-mono text-sm font-semibold tabular-nums text-cyan-300 sm:text-base">
                {inRound
                  ? formatMultiplier(multiplierX100)
                  : previewLadder?.[1] != null
                    ? formatMultiplier(previewLadder[1])
                    : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Next gem</div>
              <div className="arc-mono text-sm font-semibold tabular-nums text-slate-300 sm:text-base">
                {nextMultX100 != null ? formatMultiplier(nextMultX100) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Clear board pays
              </div>
              <div className="arc-mono text-sm font-semibold tabular-nums text-amber-300 sm:text-base">
                {maxMultX100 != null ? formatMultiplier(maxMultX100) : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────── History ───────── */}
      {address && (
        <div className="mt-4">
          <MinesInfoTabs rounds={history} loading={historyLoading} onVerify={openVerify} />
        </div>
      )}

      <MinesRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <MinesFairnessModal
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
