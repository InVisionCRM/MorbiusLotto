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

/** A win pays at least this multiple of the bet to trigger the share card. */
export const BIG_WIN_MULTIPLIER = 10

export interface ReportWinArgs {
  /** Display name of the game, e.g. "Plinko". */
  game: string
  /** Amount staked on the round (whole chips / MORBIUS). */
  bet: number
  /** Amount returned by the round (whole chips / MORBIUS). 0 on a loss. */
  payout: number
}

interface BigWin {
  game: string
  roiPct: number
  multiplier: number
}

interface BigWinContextValue {
  /** Report a settled round. Fires the share card when payout ≥ 10× bet. */
  reportWin: (args: ReportWinArgs) => void
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

  const reportWin = useCallback(({ game, bet, payout }: ReportWinArgs) => {
    if (showingRef.current) return
    if (!Number.isFinite(bet) || !Number.isFinite(payout) || bet <= 0) return
    const multiplier = payout / bet
    if (multiplier < BIG_WIN_MULTIPLIER) return
    showingRef.current = true
    setExpanded(false)
    setWin({ game, multiplier, roiPct: roiPctFromBet(bet, payout) })
  }, [])

  const dismiss = useCallback(() => {
    showingRef.current = false
    setExpanded(false)
    setWin(null)
  }, [])

  const value = useMemo<BigWinContextValue>(() => ({ reportWin }), [reportWin])

  return (
    <BigWinContext.Provider value={value}>
      {children}
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

const NOOP: BigWinContextValue = { reportWin: () => {} }
