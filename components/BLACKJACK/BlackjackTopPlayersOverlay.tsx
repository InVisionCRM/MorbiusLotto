'use client'

import React from 'react'
import { useBlackjackTopPlayers } from '@/hooks/use-blackjack-stats'
import { OverlayLayouts } from './BlackjackTopPlayersLayouts'

const TOP_N = 25

export function BlackjackTopPlayersOverlay() {
  const { data: players, isLoading } = useBlackjackTopPlayers(TOP_N)

  if (isLoading || !players?.length) return null

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      <OverlayLayouts.C entries={players} transparent />
    </div>
  )
}
