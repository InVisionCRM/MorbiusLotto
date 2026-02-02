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
    <div
      className="relative"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {/* Radial gradient overlay matching ticket-purchase-builder */}
      
      <div className="relative">
        {hasCompleteDraw ? (
          <BallDrawSimulator
            winningNumbers={winningNumbers.slice(0, 6)}
            roundId={roundId}
            playerTickets={playerTickets}
            autoStart
          />
        ) : (
          <div
            className="p-6 text-center rounded-lg"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          >
            <p className="text-white/60">No winning numbers available for this round.</p>
          </div>
        )}
      </div>
    </div>
  )
}
