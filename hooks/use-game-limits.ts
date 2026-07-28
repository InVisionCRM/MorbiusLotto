'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashWindow } from './use-admin-dashboard'

export interface GameLimitStats {
  gameKey: string
  wagered: string
  won: string
  net: string
  holdPct: number
  plays: number
  players: number
  biggestWin: string
  biggestWinBy: string | null
  /** Largest payout/wager ratio this game has actually produced. */
  maxMultiplierSeen: number | null
  lastPlayAt: string | null
}

export interface GameLimitRow {
  gameKey: string
  label: string
  min: number
  max: number
  defaultMin: number
  defaultMax: number
  /** True when running on an admin override rather than the built-in default. */
  overridden: boolean
  stats: GameLimitStats | null
}

export interface LimitHistoryRow {
  gameKey: string
  admin: string
  oldMin: number | null
  oldMax: number | null
  newMin: number
  newMax: number
  at: string
}

export interface GameLimitsPayload {
  window: DashWindow
  games: GameLimitRow[]
  history: LimitHistoryRow[]
}

export function useGameLimits(enabled: boolean, window: DashWindow = '7d') {
  return useQuery({
    queryKey: ['game-limits', window],
    queryFn: async (): Promise<GameLimitsPayload> => {
      const r = await fetch(`/api/admin-ops/game-limits?window=${window}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`limits ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 20_000,
    refetchInterval: enabled ? 45_000 : false,
  })
}

export function useSaveGameLimits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (changes: Array<{ gameKey: string; min: number; max: number }>) => {
      const r = await fetch('/api/admin-ops/game-limits', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Save failed')
      return d as { updated: string[] }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['game-limits'] }),
  })
}

export function useResetGameLimit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gameKey: string) => {
      const r = await fetch('/api/admin-ops/game-limits/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameKey }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Reset failed')
      return d
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['game-limits'] }),
  })
}
