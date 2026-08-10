'use client'

/**
 * BigWinProvider — one app-wide place that watches for big wins and offers a
 * shareable "Nice win!" card. Any game calls `reportWin({ game, bet, payout })`
 * when a round settles; if the payout is a big multiple of the bet, a small
 * non-blocking "Quick Share" toast appears. Tapping Share on the toast opens
 * the full share-card modal. Centralising it here means each game needs only a
 * one-line call and the threshold / card live in a single place.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { roiPctFromBet } from '@/lib/win-share-card'
import { BigWinModal } from '@/components/share/BigWinModal'
import { BigWinToast } from '@/components/share/BigWinToast'
import { winTierFor } from '@/components/shared/TableWinFx'
import { TableWinTextStyles } from '@/components/shared/TableWinText'
import { WinTextOverlay } from '@/components/shared/WinTextOverlay'

/** A win pays at least this multiple of the bet to trigger the share card. */
export const BIG_WIN_MULTIPLIER = 10

/*
 * The win word runs on its own, lower bar than the share card — a hand worth
 * celebrating is far more common than one worth posting. Everything below is
 * about NOT showing it too often, because the failure mode here is not "too
 * quiet", it is a strobe.
 *
 * Only `big` and `huge` qualify (1.5x profit and up). An ordinary win is left
 * to whatever the game already does; a grind of 1.02x dice rolls says nothing
 * at all. Games that show the word anchored in their own felt pass
 * ownsCelebration and are skipped entirely.
 */

/** Quiet period after a word, so two quick wins don't overlap. */
const WIN_TEXT_COOLDOWN_MS = 1400
/*
 * Auto-bet and turbo exist in Plinko, Limbo, Dice and Keno, where rounds land
 * several times a second. Rather than have each of them remember to declare
 * it, the rate is measured here: settles this close together are a machine
 * playing, not a person, and the word stands down until it quiets.
 */
const RAPID_WINDOW_MS = 3000
const RAPID_ROUNDS = 3

export interface WinTextGateArgs {
  bet: number
  payout: number
  /** Milliseconds, as from Date.now(). */
  now: number
  /** When the last word was shown, or 0 if none this session. */
  lastWordAt: number
  /** Settles seen in the last RAPID_WINDOW_MS, this one included. */
  settlesInWindow: number
}

/**
 * Whether this settle earns the centre-screen word, and at what size.
 *
 * Exported so the three reasons it stays quiet can be tested directly — the
 * whole value of this function is in what it refuses, and that is exactly the
 * part that is invisible until it is wrong and shipped.
 */
export function winTextGate({
  bet,
  payout,
  now,
  lastWordAt,
  settlesInWindow,
}: WinTextGateArgs): 'big' | 'huge' | null {
  const tier = winTierFor(bet, payout)
  if (tier !== 'big' && tier !== 'huge') return null
  if (now - lastWordAt <= WIN_TEXT_COOLDOWN_MS) return null
  if (settlesInWindow >= RAPID_ROUNDS) return null
  return tier
}

export interface ReportWinArgs {
  /** Display name of the game, e.g. "Plinko". */
  game: string
  /** Amount staked on the round (whole chips / MORBIUS). */
  bet: number
  /** Amount returned by the round (whole chips / MORBIUS). 0 on a loss. */
  payout: number
  /**
   * The game already celebrates this win itself — the card felts land the word
   * inside the table once the last card turns, which is better than a generic
   * one centre screen and would otherwise fire twice.
   */
  ownsCelebration?: boolean
}

interface BigWin {
  game: string
  roiPct: number
  multiplier: number
}

interface ShareCardArgs {
  game: string
  /** Return on bet as a whole percent (may be negative for a down session). */
  roiPct: number
  /** Optional ×-multiple for the modal caption; derived from ROI when omitted. */
  multiplier?: number
}

interface BigWinContextValue {
  /** Report a settled round. Fires the "Quick Share" toast when payout ≥ 10× bet. */
  reportWin: (args: ReportWinArgs) => void
  /** Open the full share card immediately for an arbitrary game + ROI (e.g. a
   *  session summary from the session chart's Share button). Skips the toast. */
  shareCard: (args: ShareCardArgs) => void
}

const BigWinContext = createContext<BigWinContextValue | null>(null)

export function BigWinProvider({ children }: { children: React.ReactNode }) {
  const [win, setWin] = useState<BigWin | null>(null)
  // Whether the full share-card modal is open. A big win first shows the small
  // "Quick Share" toast; the modal opens only when the player taps Share.
  const [expanded, setExpanded] = useState(false)
  // While a toast/card is showing we ignore further wins so an auto-bet streak
  // can't stack prompts; the current one must be dismissed first.
  const showingRef = useRef(false)

  // The centre-screen word, which is independent of the share card: it fires
  // more often, clears itself, and never blocks anything.
  const [celebration, setCelebration] = useState<{
    tier: 'big' | 'huge'
    seed: string
    multiplier: number
  } | null>(null)
  const lastWordAtRef = useRef(0)
  const recentSettlesRef = useRef<number[]>([])

  const reportWin = useCallback(({ game, bet, payout, ownsCelebration }: ReportWinArgs) => {
    if (!Number.isFinite(bet) || !Number.isFinite(payout) || bet <= 0) return
    const multiplier = payout / bet
    const now = Date.now()

    // Every settle counts toward the rate, including losses and the ones a
    // game celebrates itself — what's being measured is how fast the table is
    // running, not how often it pays.
    const recent = recentSettlesRef.current.filter((t) => now - t < RAPID_WINDOW_MS)
    recent.push(now)
    recentSettlesRef.current = recent

    if (!ownsCelebration) {
      const tier = winTextGate({
        bet,
        payout,
        now,
        lastWordAt: lastWordAtRef.current,
        settlesInWindow: recent.length,
      })
      if (tier) {
        lastWordAtRef.current = now
        setCelebration({ tier, seed: `${game}:${now}`, multiplier })
      }
    }

    // The share card keeps its own, higher bar and its own one-at-a-time rule.
    if (showingRef.current) return
    if (multiplier < BIG_WIN_MULTIPLIER) return
    showingRef.current = true
    setExpanded(false)
    setWin({ game, multiplier, roiPct: roiPctFromBet(bet, payout) })
  }, [])

  const shareCard = useCallback(({ game, roiPct, multiplier }: ShareCardArgs) => {
    showingRef.current = true
    setExpanded(true) // open the full card directly — no toast for a manual share
    setWin({ game, roiPct, multiplier: multiplier ?? 1 + roiPct / 100 })
  }, [])

  const dismiss = useCallback(() => {
    showingRef.current = false
    setExpanded(false)
    setWin(null)
  }, [])

  const value = useMemo<BigWinContextValue>(() => ({ reportWin, shareCard }), [reportWin, shareCard])

  return (
    <BigWinContext.Provider value={value}>
      {children}
      {celebration && (
        <WinTextOverlay
          tier={celebration.tier}
          seed={celebration.seed}
          multiplier={celebration.multiplier}
          onDone={() => setCelebration(null)}
        />
      )}
      {/* Mounted app-wide because the overlay can appear over any game. */}
      <TableWinTextStyles />
      {win && !expanded && (
        <BigWinToast
          game={win.game}
          multiplier={win.multiplier}
          onShare={() => setExpanded(true)}
          onClose={dismiss}
        />
      )}
      {win && expanded && (
        <BigWinModal game={win.game} roiPct={win.roiPct} multiplier={win.multiplier} onClose={dismiss} />
      )}
    </BigWinContext.Provider>
  )
}

/**
 * Access the big-win reporter. Returns a no-op reporter if used outside the
 * provider so a game never crashes for lacking it (the popup just won't show).
 */
export function useBigWin(): BigWinContextValue {
  const ctx = useContext(BigWinContext)
  return ctx ?? NOOP
}

const NOOP: BigWinContextValue = { reportWin: () => {}, shareCard: () => {} }
