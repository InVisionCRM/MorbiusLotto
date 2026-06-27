'use client'

import { useQuery } from '@tanstack/react-query'

export interface GameSummary {
  key: string
  label: string
  wagered: string
  won: string
  plays: number
}

export type PlayResult = 'win' | 'loss' | 'push'

export interface GamePlay {
  wallet: string
  displayName: string | null
  wager: string
  payout: string
  net: string
  result: PlayResult
  at: string
}

/** All games + all-time totals (wagered / won / plays), busiest first. */
export function useGameSummaries(enabled = true) {
  return useQuery({
    queryKey: ['activity-games'],
    queryFn: async (): Promise<GameSummary[]> => {
      const r = await fetch('/api/activity/games', { credentials: 'include' })
      if (!r.ok) throw new Error(`games ${r.status}`)
      const d = await r.json()
      return Array.isArray(d?.games) ? d.games : []
    },
    enabled,
    staleTime: 30_000,
  })
}

/** Most recent plays for one game (up to 500). */
export function useGamePlays(gameKey: string | null) {
  return useQuery({
    queryKey: ['activity-plays', gameKey],
    queryFn: async (): Promise<GamePlay[]> => {
      const r = await fetch(`/api/activity/games/${gameKey}/plays?limit=500`, { credentials: 'include' })
      if (!r.ok) throw new Error(`plays ${r.status}`)
      const d = await r.json()
      return Array.isArray(d?.plays) ? d.plays : []
    },
    enabled: !!gameKey,
    staleTime: 15_000,
  })
}
