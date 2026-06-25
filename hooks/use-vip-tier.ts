'use client'

import { useQuery } from '@tanstack/react-query'

/** Public, minimal VIP tier for a wallet — returned by GET /api/vip/tier/:address. */
export interface VipPublicTier {
  address: string
  tierLevel: number
  tierName: string
  color: string
  rakebackBps: number
  lifetimeWagerChips: string
}

/**
 * Fetch any wallet's current VIP tier (public, no auth). Cached per address via
 * react-query so the same address looked up across many seats hits the network
 * once. Tiers move slowly, so the cache is generous.
 */
export function useVipTier(address?: string | null) {
  const addr = address && /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : null
  return useQuery({
    queryKey: ['vip-tier', addr],
    queryFn: async (): Promise<VipPublicTier | null> => {
      if (!addr) return null
      const res = await fetch(`/api/vip/tier/${addr}`, { credentials: 'include' })
      if (!res.ok) return null
      return (await res.json()) as VipPublicTier
    },
    enabled: !!addr,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
