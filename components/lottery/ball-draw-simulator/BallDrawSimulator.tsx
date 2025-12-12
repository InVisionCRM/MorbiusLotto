'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Play, ChevronDown, ChevronUp, Receipt, RotateCcw } from 'lucide-react'
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
    startRound?: number
    endRound?: number
  }> // User's tickets for this round
  ballCount?: number // Default 30
  drawCount?: number // Default 6
  onComplete?: () => void // Callback when draw completes
  autoStart?: boolean // Auto-start the draw
  onClose?: () => void // Callback to close the simulator
  onDrawStart?: () => void // Notify when draw begins
  onDrawEnd?: () => void // Notify when draw ends
  isBackground?: boolean // Background-only mode (no controls/receipt)
  isMegaMorbius?: boolean // Whether this is a MegaMorbius round
  timeRemaining?: number // Time remaining in seconds for idle animation
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
  onDrawStart,
  onDrawEnd,
  isBackground = false,
  isMegaMorbius = false,
  timeRemaining = 0,
}) => {
  const [currentState, setCurrentState] = useState<DrawState>(DrawState.IDLE)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]) // Winning numbers drawn
  const [drawnBallIds, setDrawnBallIds] = useState<number[]>([]) // Ball IDs that have been drawn
  const [triggerDraw, setTriggerDraw] = useState(false)
  const [currentTarget, setCurrentTarget] = useState<number | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [machineSize, setMachineSize] = useState(getPhysicsMachineSize())
  const startedRef = useRef(false)
  const lastNumbersKeyRef = useRef<string | null>(null)
  const hasAnimatedRef = useRef(false) // Track if animation has played for current round
  const completedRef = useRef(false) // Track if onComplete has been called for current round
  const clampedMachineSize = Math.min(machineSize.width, 330) // keep globe large but responsive
  const visualSize = Math.min(clampedMachineSize + 5, 335) // wrapper only 5px larger than globe

  // Update machine size on window resize and initial mount
  useEffect(() => {
    const handleResize = () => {
      setMachineSize(getPhysicsMachineSize())
    }
    // Set initial size on mount
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])


  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  // Auto-start if enabled (guarded by stable numbers key + round ID)
  useEffect(() => {
    // Check if we have valid winning numbers
    const hasValidNumbers = winningNumbers.length === drawCount && winningNumbers.every(n => n > 0)

    console.log('🎱 BallDrawSimulator update:', {
      roundId,
      winningNumbers,
      hasValidNumbers,
      autoStart,
      drawCount,
      lastKey: lastNumbersKeyRef.current
    })

    // If no valid numbers and in background mode, just show idle animation
    if (!hasValidNumbers && isBackground) {
      console.log('🎱 Showing idle animation (no winning numbers yet)')
      setCurrentState(DrawState.IDLE)
      return
    }

    if (!hasValidNumbers) {
      console.log('🎱 Skipping: invalid winning numbers')
      return
    }
    
    // Create unique key combining round ID and winning numbers
    const numbersKey = `${roundId}-${winningNumbers.join(',')}`
    
    // Skip if this exact combination has already been shown
    if (numbersKey === lastNumbersKeyRef.current) {
      console.log('🎱 Skipping: already shown this round')
      return
    }
    
    console.log('🎱 Starting new draw for:', numbersKey)
    
    // Update key and reset flags for new round
    lastNumbersKeyRef.current = numbersKey
    hasAnimatedRef.current = false
    completedRef.current = false

    resetDraw()
    setCurrentState(DrawState.IDLE)
    startedRef.current = false

    const canStart = autoStart && hasValidNumbers
    
    if (canStart) {
      console.log('🎱 AUTO-STARTING animation!')
      startedRef.current = true
      hasAnimatedRef.current = true
      setCurrentState(DrawState.MIXING)
      onDrawStart?.()
    } else {
      console.log('🎱 Not auto-starting:', { autoStart, hasValidNumbers })
    }
  }, [winningNumbers, roundId, autoStart, drawCount, onDrawStart])

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
        // Only fire callbacks once per round
        if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
          onDrawEnd?.()
        }
      }
    }

    return () => clearTimeout(timeout)
  }, [currentState, drawnNumbers, winningNumbers, drawCount, onComplete, onDrawEnd])

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
    startedRef.current = true
    onDrawStart?.()
  }

  const handleReplay = () => {
    // Allow replay even if already played this round
    hasAnimatedRef.current = false
    completedRef.current = false
    startDraw()
  }

  return (
    <div className={`relative w-full max-w-xl min-h-[610px] min-w-[280px] ${isBackground ? 'bg-transparent' : 'bg-gradient-to-b from-gray-950 via-gray-900 to-black'} text-white font-sans flex flex-col items-center justify-center px-5 py-5 overflow-hidden rounded-2xl mx-auto`}>
      {/* Round Number - Top Center */}
      {!isBackground && roundId !== undefined && (
        <div className="absolute inset-x-0 z-20 top-3 z-30 text-center pointer-events-none">
          <div className={`inline-block px-3 py-1 rounded-full ${isMegaMorbius ? 'bg-gradient-to-r from-yellow-500/20 via-pink-500/20 to-purple-500/20 border-2 border-yellow-400/40 shadow-[0_0_20px_rgba(251,191,36,0.4)]' : 'bg-black/40 border border-white/10'} shadow-lg`}>
            {isMegaMorbius && (
              <span className="text-xs font-bold bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-transparent mr-1.5 tracking-wider">
                ⭐ MEGA
              </span>
            )}
            <span className={`text-lg font-bold ${isMegaMorbius ? 'bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400' : 'bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400'} bg-clip-text text-transparent`}>
              Round #{roundId}
            </span>
          </div>
        </div>
      )}
      
      {/* Receipt - Top Right (spaced left of global X) */}
      {!isBackground && (
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
                            const hasRoundRange = ticket.startRound && ticket.endRound
                            const roundRangeText = hasRoundRange
                              ? ticket.startRound === ticket.endRound
                                ? `Round ${ticket.startRound}`
                                : `Rounds ${ticket.startRound}-${ticket.endRound}`
                              : null
                            return (
                              <div
                                key={idx}
                                className="p-2.5 bg-black/40 border border-white/10 rounded-lg"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold">Ticket #{ticketId}</span>
                                    {isFree && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                                        FREE
                                      </span>
                                    )}
                                    {roundRangeText && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">
                                        {roundRangeText}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold">
                                    {formatPssh(cost)} <span className="text-white/60 text-[10px]">pSSH</span>
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
      )}

      <main className="w-full h-full flex flex-col items-center justify-center space-y-4 overflow-visible pt-14 pb-6 relative">
        {/* Drawn Numbers Display */}
        <section className="absolute top-8 left-0 right-0 flex justify-center">
          <div className="flex flex-wrap gap-3 justify-center items-center z-10 px-4">
            {Array.from({ length: drawCount }).map((_, i) => (
              <div
                key={`ball-${i}`}
                className={`w-10 h-10 flex items-center justify-center rounded-full ${drawnNumbers[i] ? 'border-1 border-purple-800 shadow-[0_0_8px_rgba(107,33,168,0.8)]' : ''}`}
              >
                {drawnNumbers[i] ? (
                  <BallResult number={drawnNumbers[i]} type="white" animate={true} />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-green-700/50 flex items-center justify-center">
                    <span className="text-gray-800 text-sm font-bold">{i + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Machine */}
        <section className="flex justify-center flex-1 items-center w-full overflow-hidden min-h-0 pt-16">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center transition-transform relative">
              <div
                className="glass-panel p-0.5 rounded-full shadow-[0_0_55px_-12px_rgba(59,130,246,0.25)] relative border border-white/5 bg-gray-900/40 z-0 overflow-visible flex items-center justify-center"
                style={{ width: `${visualSize}px`, height: `${visualSize}px` }}
              >
              <div className="absolute inset-0 animate-[spin_30s_linear_infinite] pointer-events-none">
                <span
                  className="absolute inset-0 bg-[url('/morbius/MorbiusLogo%20(3).png')] bg-center bg-no-repeat bg-[length:180px_180px] opacity-50"
                />
              </div>
              <PhysicsMachine
                width={clampedMachineSize}
                height={clampedMachineSize}
                ballCount={ballCount}
                isMixing={currentState === DrawState.MIXING || currentState === DrawState.DRAWING}
                drawnBallIds={drawnBallIds}
                onBallSelected={handleBallSelected}
                triggerDraw={triggerDraw}
                targetWinningNumber={currentTarget}
                isBackground={isBackground}
              />
              {/* Reflection Overlay */}
              <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none sphere-overlay z-10"></div>
              
              {/* MegaMorbius Orbital Particles */}
              {isMegaMorbius && (
                <>
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-0 pointer-events-none z-20"
                      style={{
                        animation: `orbit 4s linear infinite`,
                        animationDelay: `${i * 0.5}s`,
                      }}
                    >
                      <div
                        className="absolute top-0 left-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-gradient-to-br from-yellow-300 via-pink-400 to-purple-500 shadow-[0_0_12px_rgba(236,72,153,0.8)] animate-pulse"
                      />
                    </div>
                  ))}
                  {/* Holographic ring glow */}
                  <div className="absolute inset-0 rounded-full border-2 border-transparent bg-gradient-to-r from-yellow-400/30 via-pink-400/30 to-purple-500/30 bg-clip-padding pointer-events-none z-15 animate-[spin_8s_linear_infinite]" />
                </>
              )}
            </div>
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

