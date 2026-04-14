'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_ROULETTE_ROOM_BG,
  isRouletteRoomBgId,
  ROULETTE_ROOM_BACKGROUNDS,
  type RouletteRoomBgId,
} from '@/lib/roulette-room-backgrounds'

const STORAGE_KEY = 'morb-roulette-room-bg'

export function useRouletteRoomBackground() {
  const [id, setIdState] = useState<RouletteRoomBgId>(DEFAULT_ROULETTE_ROOM_BG)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw && isRouletteRoomBgId(raw)) setIdState(raw)
    } catch {
      /* private mode */
    }
  }, [])

  const setId = useCallback((next: RouletteRoomBgId) => {
    setIdState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* noop */
    }
  }, [])

  const preset =
    ROULETTE_ROOM_BACKGROUNDS.find((p) => p.id === id) ?? ROULETTE_ROOM_BACKGROUNDS[0]

  return { id, setId, preset }
}
