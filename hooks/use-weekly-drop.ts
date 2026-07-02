'use client'

import { useQuery } from '@tanstack/react-query'

/** Current open draw — returned by GET /api/drop. */
export interface WeeklyDropDraw {
  id: string | number
  closesAt: string
  potChips: string
  guaranteedMin: string
  status: string
}

/** The caller's personal entry state (null when no/unknown address given). */
export interface WeeklyDropYou {
  entries: number
  progressWagered: string
  progressTarget: string
}

/** One of last draw's top-3 winners. */
export interface WeeklyDropLastWinner {
  rank: number
  address: string
  displayName: string | null
  amountChips: string
}

export interface WeeklyDropResponse {
  draw: WeeklyDropDraw
  you: WeeklyDropYou | null
  /** Players holding ≥ 1 entry in the open draw. Optional: older backends omit it. */
  totalEntrants?: number
  lastWinners: WeeklyDropLastWinner[]
  commitment: string | null
}

/** One row of GET /api/drop/entrants. */
export interface WeeklyDropEntrant {
  address: string
  displayName: string | null
  entries: number
}

export interface WeeklyDropEntrantsResponse {
  drawId: string
  totalEntrants: number
  totalEntries: number
  entrants: WeeklyDropEntrant[]
}

/**
 * Fetch the Weekly Drop state (open pot, countdown target, caller's entries,
 * last draw's winners). Pass the connected address to get the personal `you`
 * block. Polls every 30s so the home module stays live.
 */
export function useWeeklyDrop(address?: string | null) {
  const addr = address && /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : null
  return useQuery({
    queryKey: ['weekly-drop', addr],
    queryFn: async (): Promise<WeeklyDropResponse | null> => {
      const res = await fetch(`/api/drop${addr ? `?address=${addr}` : ''}`, { credentials: 'include' })
      if (!res.ok) return null
      return (await res.json()) as WeeklyDropResponse
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
    gcTime: 5 * 60_000,
  })
}

/**
 * Fetch the open draw's entrant list (GET /api/drop/entrants). Pass
 * `enabled: false` until the entrants modal opens so the list is only
 * fetched on demand.
 */
export function useWeeklyDropEntrants(enabled: boolean) {
  return useQuery({
    queryKey: ['weekly-drop-entrants'],
    queryFn: async (): Promise<WeeklyDropEntrantsResponse | null> => {
      const res = await fetch('/api/drop/entrants', { credentials: 'include' })
      if (!res.ok) return null
      return (await res.json()) as WeeklyDropEntrantsResponse
    },
    enabled,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
  })
}
