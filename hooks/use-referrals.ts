'use client'

import { useCallback, useEffect, useState } from 'react'

export interface ReferralConfig {
  rewardBps: number
  welcomeBonusChips: string
  maxBindWagerChips: string
  enabled: boolean
}

export interface ReferralSummary {
  address: string
  code: string
  referrer: string | null
  welcomeBonusReceivedChips: string
  refereeCount: number
  totalEarnedChips: string
  canBind: boolean
  rewardBps: number
  welcomeBonusChips: string
  enabled: boolean
}

export interface ReferralBindResult {
  ok: boolean
  referrer: string
  welcomeCredited: string
  chipBalance: string
}

/**
 * Loads the public referral terms + (when a wallet is connected & signed in)
 * that wallet's personal referral summary, and exposes a bind() action. All
 * requests go same-origin through /api/referrals/* (cookies forwarded to the
 * Express backend). Mirrors useVipStatus.
 */
export function useReferrals(address?: string) {
  const [config, setConfig] = useState<ReferralConfig | null>(null)
  const [summary, setSummary] = useState<ReferralSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [binding, setBinding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/referrals/config', { credentials: 'include' })
      if (res.ok) setConfig((await res.json()) as ReferralConfig)
    } catch {
      /* terms are non-critical for first paint */
    }
  }, [])

  const loadSummary = useCallback(async () => {
    if (!address) {
      setSummary(null)
      setAuthRequired(false)
      return
    }
    setError(null)
    try {
      const res = await fetch(`/api/referrals/${address}/summary`, { credentials: 'include' })
      if (res.status === 401) {
        setSummary(null)
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
        throw new Error(`Referrals unavailable (${res.status}${detail ? `: ${detail}` : ''})`)
      }
      setSummary((await res.json()) as ReferralSummary)
    } catch (e) {
      setSummary(null)
      setError((e as Error).message)
    }
  }, [address])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([loadConfig(), loadSummary()]).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadConfig, loadSummary])

  const bind = useCallback(
    async (code: string): Promise<ReferralBindResult | null> => {
      if (!address) return null
      setBinding(true)
      setError(null)
      try {
        const res = await fetch(`/api/referrals/${address}/bind`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const data = await res.json()
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not apply referral code')
        await loadSummary()
        return data as ReferralBindResult
      } catch (e) {
        setError((e as Error).message)
        return null
      } finally {
        setBinding(false)
      }
    },
    [address, loadSummary],
  )

  return { config, summary, loading, binding, error, authRequired, bind, refresh: loadSummary }
}
