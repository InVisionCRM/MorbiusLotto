'use client'

import { useQuery } from '@tanstack/react-query'

export type DashWindow = '24h' | '7d' | '30d' | 'all'

export interface Financials {
  window: DashWindow
  wagered: string
  ggr: string
  houseGgr: string
  rake: string
  fees: string
  won: string
  holdPct: number
  plays: number
  activePlayers: number
  newPlayers: number
  depositsTotal: string
  depositsCount: number
  withdrawalsTotal: string
  withdrawalsNet: string
  withdrawalFees: string
  withdrawalsCount: number
  withdrawalsPending: number
  netFlow: string
  rakebackPaid: string
  referralPaid: string
  dropPrizesPaid: string
  adminAdjustments: string
  holderRewardsPaid: string
  bonusCostTotal: string
  playerLiability: string
  houseFloat: string
  netRevenue: string
}

export interface PlayerRow {
  wallet: string
  displayName: string | null
  wagered: string
  won: string
  net: string
  plays: number
  balance: string
  lastAt: string
}

export interface DepositRow {
  wallet: string
  displayName: string | null
  amount: string
  txHash: string
  at: string
}

export interface WithdrawalRow {
  wallet: string
  displayName: string | null
  amount: string
  net: string
  fee: string
  status: string
  txHash: string | null
  at: string
}

export interface BigWinRow {
  wallet: string
  displayName: string | null
  gameKey: string
  gameLabel: string
  wager: string
  payout: string
  net: string
  multiplier: number | null
  at: string
}

export interface ReferrerRow {
  wallet: string
  displayName: string | null
  referees: number
  earned: string
  welcomePaid: string
  lastBoundAt: string
}

export interface HistoryRow {
  day: string
  wagered: string
  won: string
  ggr: string
  plays: number
  players: number
}

/** A player's repeat high-multiplier record — frequency is the abuse signal. */
export interface MultiplierPlayerRow {
  wallet: string
  displayName: string | null
  hits: number
  maxMultiplier: number
  avgMultiplier: number
  wagered: string
  payout: string
  net: string
  games: number
  topGameLabel: string
  firstAt: string
  lastAt: string
  hitsPerDay: number
}

export interface MultiplierGameRow {
  gameKey: string
  gameLabel: string
  hits: number
  players: number
  maxMultiplier: number
  avgMultiplier: number
  payout: string
  payoutSharePct: number
}

export interface MultiplierFrequency {
  minMultiplier: number
  totalHits: number
  byPlayer: MultiplierPlayerRow[]
  byGame: MultiplierGameRow[]
}

export interface DashboardPayload {
  financials: Financials
  players: PlayerRow[]
  deposits: DepositRow[]
  withdrawals: WithdrawalRow[]
  bigWins: BigWinRow[]
  referrals: { referrers: ReferrerRow[]; totals: { referrers: number; referees: number; earned: string; welcomePaid: string } }
  history: HistoryRow[]
  multiplier: MultiplierFrequency
}

export interface LiveNowPlayer {
  wallet: string
  displayName: string | null
  gameKey: string
  gameLabel: string
  plays: number
  wagered: string
  lastAt: string
}

export interface LiveNow {
  minutes: number
  players: number
  plays: number
  wagered: string
  lastPlayAt: string | null
  active: LiveNowPlayer[]
}

/**
 * Who is playing right now. Polls fast (10s) and independently of the heavy
 * dashboard query so the live badge stays responsive.
 */
export function useLiveNow(enabled: boolean, minutes = 5) {
  return useQuery({
    queryKey: ['admin-live-now', minutes],
    queryFn: async (): Promise<LiveNow> => {
      const r = await fetch(`/api/admin-ops/dashboard/live?minutes=${minutes}`, {
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`live ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 5_000,
    refetchInterval: enabled ? 10_000 : false,
  })
}

/**
 * The whole dashboard in one round trip. Auto-refreshes so the operator sees
 * money move without reloading.
 */
export function useAdminDashboard(
  enabled: boolean,
  window: DashWindow,
  minPayout: string,
  minMultiplier = 0,
  freqMultiplier = 10,
) {
  return useQuery({
    queryKey: ['admin-dashboard', window, minPayout, minMultiplier, freqMultiplier],
    queryFn: async (): Promise<DashboardPayload> => {
      const qs = new URLSearchParams({
        window,
        minPayout,
        minMultiplier: String(minMultiplier),
        freqMultiplier: String(freqMultiplier),
      })
      const r = await fetch(`/api/admin-ops/dashboard?${qs}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`dashboard ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
  })
}
