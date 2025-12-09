'use client'

import { RoundHistory } from '@/components/lottery/round-history'

interface RoundHistoryModalProps {
  currentRoundId: number
  maxRounds?: number
}

export function RoundHistoryModal({ currentRoundId, maxRounds = 10 }: RoundHistoryModalProps) {
  return (
    <RoundHistory currentRoundId={currentRoundId} maxRounds={maxRounds} />
  )
}

