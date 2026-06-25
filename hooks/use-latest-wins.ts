'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * A single recent win, sourced from the unified chip ledger via
 * GET /api/analytics/recent-wins. Every game credits a `*_payout` row, so this
 * covers the whole lineup (arcade, blackjack, keno, plinko, etc.) automatically.
 */
export interface WinEntry {
  id: string
  address: string
  /** Player's display name (chat_display_names), or null to fall back to the short address. */
  username: string | null
  /** Whole chips won (1 chip = 1 MORBIUS). */
  amount: number
  /** Game key — matches GameArt keys + lobby routes (e.g. 'chicken', 'video-poker', 'blackjack'). */
  game: string
  timestamp: number
}

const POLL_INTERVAL = 10000 // refresh every 10s

export function useLatestWins() {
  const [wins, setWins] = useState<WinEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchRecentWins = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/recent-wins?limit=40`, { cache: 'no-store' })
      if (res.ok) {
        const { wins: apiWins } = await res.json()
        const mapped: WinEntry[] = (apiWins || [])
          .map((w: any) => ({
            id: String(w.id ?? ''),
            address: w.playerAddress ?? '',
            username: w.username ?? null,
            amount: Number(w.amount ?? 0),
            game: String(w.game ?? ''),
            timestamp: typeof w.timestamp === 'number' ? w.timestamp : Date.now(),
          }))
          .filter((w: WinEntry) => w.amount > 0)
        setWins(mapped)
      }
    } catch (e) {
      console.error('Error fetching recent wins:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecentWins()
    const interval = setInterval(fetchRecentWins, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRecentWins])

  return { wins, isLoading, refetch: fetchRecentWins }
}
