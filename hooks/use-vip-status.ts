'use client'

import { useCallback, useEffect, useState } from 'react'

export interface VipTier {
  tierLevel: number
  tierName: string
  minLifetimeWagerChips: string
  rakebackBps: number
  levelUpBonusChips: string
  color: string
  weeklyCashbackBps: number
  monthlyCashbackBps: number
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
  weeklyCashbackChips: string
  monthlyCashbackChips: string
  weeklyCashbackReady: boolean
  monthlyCashbackReady: boolean
  weeklyCashbackReadyAt: string | null
  monthlyCashbackReadyAt: string | null
  lifetimeRakebackChips: string
  lifetimeBonusChips: string
  rakebackSince: string
}

export interface VipClaimResult {
  ok: boolean
  rakebackCredited: string
  bonusCredited: string
  weeklyCredited: string
  monthlyCredited: string
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
  // Distinguish "you need to sign in" (401) from "the VIP service errored"
  // (404/500 — e.g. backend not deployed or migration not run) so the UI can
  // show an honest message instead of telling a signed-in user to sign in.
  const [authRequired, setAuthRequired] = useState(false)

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
      setAuthRequired(false)
      return
    }
    setError(null)
    try {
      const res = await fetch(`/api/vip/${address}/status`, { credentials: 'include' })
      if (res.status === 401) {
        // Genuinely not signed in — tier ladder still renders, just no personal data.
        setStatus(null)
        setAuthRequired(true)
        return
      }
      setAuthRequired(false)
      if (!res.ok) {
        let detail = ''
        try {
          detail = (await res.json())?.error ?? ''
        } catch {
          /* non-JSON error body */
        }
        throw new Error(`VIP status unavailable (${res.status}${detail ? `: ${detail}` : ''})`)
      }
      setStatus((await res.json()) as VipStatus)
    } catch (e) {
      setStatus(null)
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

  return { tiers, status, loading, claiming, error, authRequired, claim, refresh: loadStatus }
}
