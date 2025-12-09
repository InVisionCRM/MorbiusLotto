'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Play, ChevronDown, ChevronUp, Receipt } from 'lucide-react'
import PhysicsMachine from './PhysicsMachine'
import BallResult from './BallResult'
import { DrawState } from './types'
import { formatUnits } from 'viem'
import { TICKET_PRICE } from '@/lib/contracts'

// Calculate responsive size for physics machine (responsive with a 350px cap)
const getPhysicsMachineSize = () => {
  if (typeof window === 'undefined') return { width: 280, height: 280 }
  const maxSize = Math.min(window.innerWidth, window.innerHeight) * 0.7
  const size = Math.min(maxSize, 332) // +18 wrapper = max 350px visible
  return { width: size, height: size }
}

interface BallDrawSimulatorProps {
  winningNumbers: number[] // Array of 6 winning numbers (1-55)
  roundId?: number // Round ID being displayed
  playerTickets?: Array<{
    ticketId: bigint | number
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
  }> // User's tickets for this round
  ballCount?: number // Default 30
  drawCount?: number // Default 6
  onComplete?: () => void // Callback when draw completes
  autoStart?: boolean // Auto-start the draw
  onClose?: () => void // Callback to close the simulator
}

const BallDrawSimulator: React.FC<BallDrawSimulatorProps> = ({
  winningNumbers,
  roundId,
  playerTickets = [],
  ballCount = 30,
  drawCount = 6,
  onComplete,
  autoStart = false,
  onClose,
}) => {
  const [currentState, setCurrentState] = useState<DrawState>(DrawState.IDLE)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]) // Winning numbers drawn
  const [drawnBallIds, setDrawnBallIds] = useState<number[]>([]) // Ball IDs that have been drawn
  const [triggerDraw, setTriggerDraw] = useState(false)
  const [currentTarget, setCurrentTarget] = useState<number | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [machineSize, setMachineSize] = useState(getPhysicsMachineSize())
  const clampedMachineSize = Math.min(machineSize.width, 332) // keep physics area within 350px wrapper

  // Update machine size on window resize
  useEffect(() => {
    const handleResize = () => {
      setMachineSize(getPhysicsMachineSize())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && currentState === DrawState.IDLE && winningNumbers.length === drawCount) {
      resetDraw()
      setCurrentState(DrawState.MIXING)
    }
  }, [autoStart, currentState, winningNumbers.length, drawCount])

  const resetDraw = () => {
    setDrawnNumbers([])
    setDrawnBallIds([])
    setCurrentTarget(null)
    setTriggerDraw(false)
  }

  // Orchestrator Effect
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    // Phase 1: Mixing
    if (currentState === DrawState.MIXING) {
      timeout = setTimeout(() => {
        setCurrentState(DrawState.DRAWING)
      }, 2500)
    }

    // Phase 2: Drawing Balls
    if (currentState === DrawState.DRAWING) {
      if (drawnNumbers.length < drawCount) {
        // Set target to the next winning number
        const nextWinningNumber = winningNumbers[drawnNumbers.length]
        setCurrentTarget(nextWinningNumber)

        timeout = setTimeout(() => {
          setTriggerDraw(true)
        }, 2000)
      } else {
        setCurrentState(DrawState.COMPLETED)
        onComplete?.()
      }
    }

    return () => clearTimeout(timeout)
  }, [currentState, drawnNumbers, winningNumbers, drawCount, onComplete])

  // Callbacks from Physics Machine
  const handleBallSelected = useCallback(
    (ballId: number, winningNumber: number) => {
      setDrawnNumbers((prev) => [...prev, winningNumber])
      setDrawnBallIds((prev) => [...prev, ballId])
      setTriggerDraw(false)
      setCurrentTarget(null)
    },
    []
  )

  const startDraw = () => {
    resetDraw()
    setCurrentState(DrawState.MIXING)
  }

  return (
    <div className="w-screen h-screen min-w-[340px] bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white font-sans flex flex-col items-center justify-center px-6 py-6 relative overflow-hidden">
      {/* Round Number - Top Center */}
      {roundId !== undefined && (
        <div className="absolute inset-x-0 z-20 top-3 z-30 text-center pointer-events-none">
          <div className="inline-block px-3 py-1 rounded-full bg-black/40 border border-white/10 shadow-lg">
            <span className="text-lg font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
              Round #{roundId}
            </span>
          </div>
        </div>
      )}
      
      {/* Receipt - Top Right (spaced left of global X) */}
      <div className="absolute top-4 right-14 z-20">
        <div className="relative">
          <button
            onClick={() => setShowReceipt(!showReceipt)}
            className="flex items-center gap-2 px-3 pr-4 py-1.5 bg-slate-900 border border-white/10 rounded-lg hover:bg-black/60 transition-colors text-xs"
          >
            <Receipt className="w-4 h-4" />
            <span>View Receipt</span>
            {showReceipt ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
              
          {/* Receipt Dropdown */}
          {showReceipt && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] bg-slate-900/95 border border-white/20 rounded-lg shadow-2xl z-50 p-5 max-h-[65vh] overflow-y-auto">
                  <div className="space-y-3">
                    <div className="border-b border-white/10 pb-3">
                      <h3 className="text-base font-bold">Purchase Receipt</h3>
                      {roundId !== undefined && (
                        <p className="text-xs text-white/60">Round #{roundId}</p>
                      )}
                    </div>
                    
                    {playerTickets.length === 0 ? (
                      <div className="text-center py-6 text-white/60 text-sm">
                        <p>No tickets purchased for this round</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2.5 max-h-56 overflow-y-auto">
                          {playerTickets.map((ticket, idx) => {
                            const ticketNumbers = ticket.numbers.map(n => Number(n))
                            const isFree = ticket.isFreeTicket
                            const cost = isFree ? BigInt(0) : TICKET_PRICE
                            const ticketId = ticket.ticketId ? Number(ticket.ticketId) : idx + 1
                            return (
                              <div
                                key={idx}
                                className="p-2.5 bg-black/40 border border-white/10 rounded-lg"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold">Ticket #{ticketId}</span>
                                    {isFree && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                                        FREE
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold">
                                    {formatPssh(cost)} <span className="text-white/60 text-[10px]">Morbius</span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {ticketNumbers.map((num) => (
                                    <div
                                      key={num}
                                      className="flex items-center justify-center w-6 h-6 rounded bg-white/10 text-white text-[11px] font-bold"
                                    >
                                      {num}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="border-t border-white/10 pt-3">
                          <div className="flex justify-center items-center text-sm">
                            <span className="font-semibold">Total:</span>
                            <span className="font-bold text-base">
                              {formatPssh(
                                BigInt(playerTickets.filter(t => !t.isFreeTicket).length) * TICKET_PRICE
                              )}{' '}
                              <span className="text-white/60 text-xs">Morbius</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-white/60 mt-1 text-center">
                            {playerTickets.length} ticket{playerTickets.length !== 1 ? 's' : ''} purchased
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
        </div>
      </div>

      <main className="w-full h-full flex flex-col items-center justify-center space-y-4 overflow-visible pt-14 pb-6 relative">
        {/* Drawn Numbers Display */}
        <section className="absolute top-8 left-0 right-0 flex justify-center">
          <div className="flex flex-wrap gap-2 justify-center items-center z-10 px-4">
            {Array.from({ length: drawCount }).map((_, i) => (
              <div
                key={`ball-${i}`}
                className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center"
              >
                {drawnNumbers[i] ? (
                  <BallResult number={drawnNumbers[i]} type="white" animate={true} />
                ) : (
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-dashed border-green-700/50 flex items-center justify-center">
                    <span className="text-gray-800 text-base font-bold">{i + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Machine */}
        <section className="flex justify-center flex-1 items-center w-full overflow-hidden min-h-0 pt-16">
          <div className="flex flex-col items-center transition-transform">
            <div
              className="glass-panel p-3 rounded-full shadow-[0_0_55px_-12px_rgba(59,130,246,0.25)] relative border border-white/5 bg-gray-900/40"
              style={{
                width: `${Math.min(machineSize.width + 18, 350)}px`,
                height: `${Math.min(machineSize.height + 18, 350)}px`,
                maxWidth: '350px',
                maxHeight: '350px',
              }}
            >
              <PhysicsMachine
                width={clampedMachineSize}
                height={clampedMachineSize}
                ballCount={ballCount}
                isMixing={currentState === DrawState.MIXING || currentState === DrawState.DRAWING}
                drawnBallIds={drawnBallIds}
                onBallSelected={handleBallSelected}
                triggerDraw={triggerDraw}
                targetWinningNumber={currentTarget}
              />
              {/* Reflection Overlay */}
              <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none sphere-overlay"></div>
            </div>

          </div>
        </section>

        {/* Controls */}
        <section className="flex justify-center gap-3 flex-shrink-0">
          {!autoStart && (
            <button
              onClick={startDraw}
              disabled={currentState !== DrawState.IDLE && currentState !== DrawState.COMPLETED}
              className="group relative px-6 py-2.5 bg-white text-gray-950 rounded-full font-bold text-base shadow-[0_0_24px_-6px_rgba(255,255,255,0.3)] hover:shadow-[0_0_32px_-6px_rgba(255,255,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 active:translate-y-0"
            >
              <div className="flex items-center justify-center gap-2">
                <Play
                  className={`w-4 h-4 ${
                    [DrawState.MIXING, DrawState.DRAWING].includes(currentState) ? 'animate-spin' : ''
                  } fill-current`}
                />
                {currentState === DrawState.COMPLETED ? 'Reset & Draw Again' : 'Start Draw'}
              </div>
            </button>
          )}
        </section>
      </main>
    </div>
  )
}

export default BallDrawSimulator
