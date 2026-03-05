'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import PhysicsMachine from './PhysicsMachine'
import BallResult from './BallResult'
import { DrawState } from './types'

const getPhysicsMachineSize = () => {
  if (typeof window === 'undefined') return { width: 280, height: 280 }
  const maxSize = Math.min(window.innerWidth, window.innerHeight) * 0.55
  return { width: Math.min(maxSize, 320), height: Math.min(maxSize, 320) }
}

const DRAW_COUNT = 6

export interface InstantBallDrawProps {
  /** When set (length 6), run the draw animation once. When null/empty, show idle bouncing. */
  winningNumbers: number[] | null
  /** Unique key for the latest result (e.g. txHash-blockNumber). When it changes, we replay the draw. */
  resultKey?: string | null
  /** Callback when draw sequence completes */
  onComplete?: () => void
  /** Ball count in the machine (default 15) */
  ballCount?: number
  /** Compact layout (smaller title/slots) */
  compact?: boolean
}

/**
 * Slimmed-down ball draw for instant lottery: always visible.
 * - No winning numbers / new result: idle (bouncing balls).
 * - New result (winningNumbers + resultKey): run mix → draw → reveal 6 numbers.
 */
const InstantBallDraw: React.FC<InstantBallDrawProps> = ({
  winningNumbers,
  resultKey = null,
  onComplete,
  ballCount = 15,
  compact = false,
}) => {
  const [currentState, setCurrentState] = useState<DrawState>(DrawState.IDLE)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([])
  const [drawnBallIds, setDrawnBallIds] = useState<number[]>([])
  const [triggerDraw, setTriggerDraw] = useState(false)
  const [currentTarget, setCurrentTarget] = useState<number | null>(null)
  const [machineSize, setMachineSize] = useState(getPhysicsMachineSize())
  const lastResultKeyRef = useRef<string | null>(null)
  const completedRef = useRef(false)

  const hasValidNumbers = Array.isArray(winningNumbers) && winningNumbers.length === DRAW_COUNT && winningNumbers.every((n) => n >= 1 && n <= 55)

  useEffect(() => {
    const handleResize = () => setMachineSize(getPhysicsMachineSize())
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const resetDraw = useCallback(() => {
    setDrawnNumbers([])
    setDrawnBallIds([])
    setCurrentTarget(null)
    setTriggerDraw(false)
  }, [])

  // When we have a new result (resultKey changed) and valid winning numbers, start the draw
  useEffect(() => {
    if (!hasValidNumbers || !resultKey) {
      if (!hasValidNumbers) {
        setCurrentState(DrawState.IDLE)
        resetDraw()
      }
      return
    }
    if (resultKey === lastResultKeyRef.current) return
    lastResultKeyRef.current = resultKey
    completedRef.current = false
    resetDraw()
    setCurrentState(DrawState.MIXING)
  }, [hasValidNumbers, resultKey, resetDraw])

  // Orchestrator: MIXING → DRAWING → reveal next ball → COMPLETED
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    if (currentState === DrawState.MIXING) {
      timeout = setTimeout(() => setCurrentState(DrawState.DRAWING), 2200)
    }

    if (currentState === DrawState.DRAWING && hasValidNumbers) {
      if (drawnNumbers.length < DRAW_COUNT) {
        const next = winningNumbers![drawnNumbers.length]
        setCurrentTarget(next)
        timeout = setTimeout(() => setTriggerDraw(true), 1800)
      } else {
        setCurrentState(DrawState.COMPLETED)
        if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
        }
      }
    }

    return () => clearTimeout(timeout)
  }, [currentState, drawnNumbers.length, hasValidNumbers, winningNumbers, onComplete])

  const handleBallSelected = useCallback((ballId: number, winningNumber: number) => {
    setDrawnNumbers((prev) => [...prev, winningNumber])
    setDrawnBallIds((prev) => [...prev, ballId])
    setTriggerDraw(false)
    setCurrentTarget(null)
  }, [])

  const clampedSize = Math.min(machineSize.width, 312)
  const visualSize = clampedSize

  const panelStyle = {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
  }

  return (
    <div
      className="relative w-full min-h-[420px] sm:min-h-[500px] flex flex-col items-center justify-center rounded-2xl overflow-hidden text-white"
      style={panelStyle}
    >
      <div className={`absolute left-0 right-0 z-10 ${compact ? 'top-2' : 'top-3'}`}>
        <p className={`text-center font-semibold text-white/80 ${compact ? 'text-xs' : 'text-sm'} uppercase tracking-wide`}>
          Winning numbers
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center pt-8 pb-2 px-2">
        {Array.from({ length: DRAW_COUNT }).map((_, i) => (
          <div key={i} className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-full flex-shrink-0">
            {drawnNumbers[i] != null ? (
              <BallResult number={drawnNumbers[i]} type="white" animate />
            ) : (
              <div
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(60, 60, 60, 0.5)',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center w-full min-h-0 py-2">
        <div
          className="relative rounded-full border border-white/10 bg-gray-900/40 flex items-center justify-center overflow-visible"
          style={{
            width: visualSize,
            height: visualSize,
            boxShadow: '0 0 40px -8px rgba(34, 211, 238, 0.2)',
          }}
        >
          <div className="absolute inset-0 animate-[spin_30s_linear_infinite] pointer-events-none opacity-40">
            <span
              className="absolute inset-0 bg-[url('/MORBIUS/MORBIUSLogo%20(3).png')] bg-center bg-no-repeat bg-[length:140px_140px]"
              style={{ backgroundSize: `${Math.min(clampedSize * 0.5, 140)}px` }}
            />
          </div>
          <PhysicsMachine
            width={clampedSize}
            height={clampedSize}
            ballCount={ballCount}
            isMixing={currentState === DrawState.MIXING || currentState === DrawState.DRAWING || (currentState === DrawState.IDLE && !hasValidNumbers)}
            drawnBallIds={drawnBallIds}
            onBallSelected={handleBallSelected}
            triggerDraw={triggerDraw}
            targetWinningNumber={currentTarget}
            isBackground
          />
          <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none z-10" />
        </div>
      </div>
    </div>
  )
}

export default InstantBallDraw
