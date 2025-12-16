'use client'

import { BracketDisplay } from '@/components/lottery/bracket-display'

interface PreviousRoundsBracketsModalProps {
  brackets: Array<{
    bracketId: number
    poolAmount: bigint
    winnerCount: number
    matchCount: number
  }>
  isLoading: boolean
}

export function PreviousRoundsBracketsModal({
  brackets,
  isLoading,
}: PreviousRoundsBracketsModalProps) {
  return (
    <BracketDisplay
      brackets={brackets}
      isLoading={isLoading}
    />
  )
}

