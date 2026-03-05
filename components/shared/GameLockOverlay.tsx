'use client'

import { useGameLock } from '@/contexts/game-lock-context'

export function GameLockOverlay() {
  const { gameLocked } = useGameLock()
  if (!gameLocked) return null

  return (
    <div
      className="fixed inset-0 z-[100001]"
      style={{ background: 'transparent' }}
      onClick={(e) => e.stopPropagation()}
      aria-hidden
    />
  )
}
