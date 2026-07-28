'use client'

import { useQuery } from '@tanstack/react-query'

export type DashWindow = '24h' | '7d' | '30d' | 'all'

export interface Financials {
  window: DashWindow
  wagered: string
  won: string
  ggr: string
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
  bonusCostTotal: string
  playerLiability: string
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

export interface DashboardPayload {
  financials: Financials
  players: PlayerRow[]
  deposits: DepositRow[]
  withdrawals: WithdrawalRow[]
  bigWins: BigWinRow[]
  referrals: { referrers: ReferrerRow[]; totals: { referrers: number; referees: number; earned: string; welcomePaid: string } }
  history: HistoryRow[]
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
export function useAdminDashboard(enabled: boolean, window: DashWindow, minPayout: string) {
  return useQuery({
    queryKey: ['admin-dashboard', window, minPayout],
    queryFn: async (): Promise<DashboardPayload> => {
      const r = await fetch(
        `/api/admin-ops/dashboard?window=${window}&minPayout=${encodeURIComponent(minPayout)}`,
        { credentials: 'include' },
      )
      if (!r.ok) throw new Error(`dashboard ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
  })
}
