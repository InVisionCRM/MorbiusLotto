'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * Aggregate "All Stats" summary for the player dashboard, backed by
 * /api/players/:address/stats-summary. Computed server-side from the same unified
 * sources as the Activity feed (all chip games incl. arcade + blackjack + lottery)
 * plus poker — so totals are complete and consistent. Money fields are WEI strings.
 */
export interface PerGameStat {
  gameKey: string
  gameLabel: string
  games: number
  net: string // wei
  winRate: number // 0-100
}

export interface PlayerStatsSummary {
  balance: string // wei
  totalWagered: string // wei
  totalWon: string // wei
  net: string // wei
  games: number
  wins: number
  winRate: number // 0-100
  roi: number // %
  currentStreak: number
  bestStreak: number
  biggestWin: { amount: string; gameKey: string; gameLabel: string } | null
  favoriteGame: { gameKey: string; gameLabel: string; games: number } | null
  perGame: PerGameStat[]
  series: Array<{ date: string; totalInvested: number; totalWon: number }>
}

export function usePlayerStatsSummary(address: string | null) {
  return useQuery<PlayerStatsSummary>({
    queryKey: ['playerStatsSummary', address],
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async () => {
      if (!address) throw new Error('Address required')
      const res = await fetch(`/api/players/${address}/stats-summary`)
      if (!res.ok) throw new Error('Failed to fetch stats summary')
      const d = await res.json()
      return {
        balance: String(d?.balance ?? '0'),
        totalWagered: String(d?.totalWagered ?? '0'),
        totalWon: String(d?.totalWon ?? '0'),
        net: String(d?.net ?? '0'),
        games: Number(d?.games ?? 0),
        wins: Number(d?.wins ?? 0),
        winRate: Number(d?.winRate ?? 0),
        roi: Number(d?.roi ?? 0),
        currentStreak: Number(d?.currentStreak ?? 0),
        bestStreak: Number(d?.bestStreak ?? 0),
        biggestWin: d?.biggestWin ?? null,
        favoriteGame: d?.favoriteGame ?? null,
        perGame: Array.isArray(d?.perGame) ? d.perGame : [],
        series: Array.isArray(d?.series) ? d.series : [],
      }
    },
  })
}
