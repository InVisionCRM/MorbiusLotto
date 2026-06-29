'use client'

import { useQuery } from '@tanstack/react-query'

/** Public VIP ladder rung (from GET /api/vip/config). */
export interface VipLadderTier {
  tierLevel: number
  tierName: string
  minLifetimeWagerChips: string
  color: string
}

/** The VIP tier ladder (public). Cached generously — thresholds move rarely. */
export function useVipTiers() {
  return useQuery({
    queryKey: ['vip-tiers'],
    queryFn: async (): Promise<VipLadderTier[]> => {
      const res = await fetch('/api/vip/config', { credentials: 'include' })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.tiers) ? data.tiers : []
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
