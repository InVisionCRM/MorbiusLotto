'use client'

import { useCallback, useEffect, useState } from 'react'

export interface VipTier {
  tierLevel: number
  tierName: string
  minLifetimeWagerChips: string
  rakebackBps: number
  levelUpBonusChips: string
  color: string
}

export interface VipStatus {
  address: string
  lifetimeWagerChips: string
  wager7dChips: string
  wager30dChips: string
  currentTier: VipTier
  nextTier: VipTier | null
  progressPct: number
  wagerToNextChips: string
  claimableRakebackChips: string
  pendingTierBonusChips: string
  lifetimeRakebackChips: string
  lifetimeBonusChips: string
  rakebackSince: string
}

export interface VipClaimResult {
  ok: boolean
  rakebackCredited: string
  bonusCredited: string
  totalCredited: string
  chipBalance: string
  newTier: VipTier
}

/**
 * Loads the public tier ladder + (when a wallet is connected & signed in) that
 * wallet's personal VIP status, and exposes a claim() action. All requests go
 * same-origin through /api/vip/* (cookies forwarded to the Express backend).
 */
export function useVipStatus(address?: string) {
  const [tiers, setTiers] = useState<VipTier[]>([])
  const [status, setStatus] = useState<VipStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/config', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setTiers(Array.isArray(data?.tiers) ? data.tiers : [])
      }
    } catch {
      /* tier ladder is non-critical for first paint */
    }
  }, [])

  const loadStatus = useCallback(async () => {
    if (!address) {
      setStatus(null)
      return
    }
    try {
      const res = await fetch(`/api/vip/${address}/status`, { credentials: 'include' })
      if (res.status === 401) {
        // Not signed in — tier ladder still renders, just no personal data.
        setStatus(null)
        return
      }
      if (!res.ok) throw new Error(`status ${res.status}`)
      setStatus((await res.json()) as VipStatus)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [address])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([loadConfig(), loadStatus()]).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadConfig, loadStatus])

  const claim = useCallback(async (): Promise<VipClaimResult | null> => {
    if (!address) return null
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch(`/api/vip/${address}/claim`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Claim failed')
      await loadStatus()
      return data as VipClaimResult
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setClaiming(false)
    }
  }, [address, loadStatus])

  return { tiers, status, loading, claiming, error, claim, refresh: loadStatus }
}
