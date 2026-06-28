'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchKenoRecent, type KenoRecent } from '@/lib/keno-client'

const EMPTY: KenoRecent = { wins: [], hotNumbers: [], roundsAnalyzed: 0 }
const POLL_MS = 20_000

/**
 * Global Keno feed — recent wins + hot (most-drawn) numbers, from the public
 * /api/keno/recent endpoint. Polls every 20s and exposes refetch() so the game
 * can refresh it the moment a round settles.
 */
export function useKenoRecent(limit = 200) {
  const [recent, setRecent] = useState<KenoRecent>(EMPTY)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const data = await fetchKenoRecent(limit)
    setRecent(data)
    setLoading(false)
  }, [limit])

  useEffect(() => {
    let active = true
    void fetchKenoRecent(limit).then((d) => {
      if (active) {
        setRecent(d)
        setLoading(false)
      }
    })
    const id = setInterval(() => void refetch(), POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [limit, refetch])

  return { recent, loading, refetch }
}
