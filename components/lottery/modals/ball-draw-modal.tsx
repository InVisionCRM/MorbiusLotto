'use client'

import BallDrawSimulator from '../ball-draw-simulator/BallDrawSimulator'

interface BallDrawModalProps {
  winningNumbers: number[] // Array of 6 winning numbers (1-55)
  roundId?: number
  playerTickets?: Array<{
    ticketId: bigint | number
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
  }>
}

export function BallDrawModal({ winningNumbers, roundId, playerTickets = [] }: BallDrawModalProps) {
  const hasCompleteDraw = winningNumbers.length >= 6

  return (
    <div>
      {hasCompleteDraw ? (
        <BallDrawSimulator
          winningNumbers={winningNumbers.slice(0, 6)}
          roundId={roundId}
          playerTickets={playerTickets}
          autoStart
        />
      ) : (
        <div className="p-6 text-center">
          <p className="text-white/60">No winning numbers available for this round.</p>
        </div>
      )}
    </div>
  )
}
