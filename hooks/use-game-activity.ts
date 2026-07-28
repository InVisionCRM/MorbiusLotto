'use client'

import { useQuery } from '@tanstack/react-query'

export interface GameSummary {
  key: string
  label: string
  wagered: string
  won: string
  plays: number
  players: number
}

export interface GameSummariesResult {
  games: GameSummary[]
  totalPlayers: number
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

/** A play in the cross-game feed — carries which game it belongs to. */
export interface RecentPlay extends GamePlay {
  gameKey: string
  gameLabel: string
}

/** Time windows the dashboard can slice its stats by. */
export type StatsWindow = '24h' | '7d' | '30d' | 'all'

/** All games + totals (wagered / won / plays / players) for a window, busiest first. */
export function useGameSummaries(enabled = true, window: StatsWindow = 'all') {
  return useQuery({
    queryKey: ['activity-games', window],
    queryFn: async (): Promise<GameSummariesResult> => {
      const r = await fetch(`/api/activity/games?window=${window}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`games ${r.status}`)
      const d = await r.json()
      return {
        games: Array.isArray(d?.games) ? d.games : [],
        totalPlayers: Number(d?.totalPlayers ?? 0),
      }
    },
    enabled,
    staleTime: 30_000,
  })
}

/** Most recent plays across every game (global feed), newest first. */
export function useRecentPlays(enabled = true, limit = 40) {
  return useQuery({
    queryKey: ['activity-recent-plays', limit],
    queryFn: async (): Promise<RecentPlay[]> => {
      const r = await fetch(`/api/activity/plays?limit=${limit}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`plays ${r.status}`)
      const d = await r.json()
      return Array.isArray(d?.plays) ? d.plays : []
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 15_000 : false,
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
