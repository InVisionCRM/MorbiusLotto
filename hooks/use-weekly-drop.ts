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
  lastWinners: WeeklyDropLastWinner[]
  commitment: string | null
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
