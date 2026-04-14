'use client'

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  DEFAULT_ROULETTE_ROOM_BG,
  getRouletteWheelRim,
  type RouletteRoomBgId,
} from '@/lib/roulette-room-backgrounds'
import {
  getPocketColor,
  ROULETTE_BLACK_HEX,
  ROULETTE_GREEN_HEX,
  ROULETTE_RED_HEX,
} from './roulette-constants'
import { cn } from '@/lib/utils'
import 'react-casino-roulette/dist/index.css'
import './roulette-wheel-overrides.css'

// SSR-safe import — the library uses browser APIs
const CasinoRouletteWheel = dynamic(
  () => import('react-casino-roulette').then((m) => m.RouletteWheel),
  { ssr: false }
)

interface RouletteWheelProps {
  spinning: boolean
  result: number | null   // 0–36; null = idle
  onSpinComplete?: () => void
  /** Room preset — wheel rim tint follows this */
  roomBgId?: RouletteRoomBgId
}

/** Tuning for `react-casino-roulette`: longer duration + more laps = slower, more “full” spin before settle. */
const ROULETTE_SPIN_DURATION_SEC = 9
const ROULETTE_SPIN_LAPS = 9

export function RouletteWheel({
  spinning,
  result,
  onSpinComplete,
  roomBgId = DEFAULT_ROULETTE_ROOM_BG,
}: RouletteWheelProps) {
  /** Shown only after the library fires `onSpinningEnd` (ball settled); cleared when a new spin starts. */
  const [landedCenter, setLandedCenter] = useState<number | null>(null)

  useEffect(() => {
    if (spinning) setLandedCenter(null)
  }, [spinning])

  const handleLibrarySpinEnd = useCallback(
    (winningBet: string) => {
      const n = Number(winningBet)
      if (winningBet !== '' && winningBet !== '-1' && Number.isInteger(n) && n >= 0 && n <= 36) {
        setLandedCenter(n)
      }
      onSpinComplete?.()
    },
    [onSpinComplete]
  )

  // Library expects a string like '0'–'36', or '-1' when not yet spinning
  const winningBet = result !== null ? String(result) : '-1'
  const rim = getRouletteWheelRim(roomBgId)
  const rimStyle = {
    '--morb-wheel-rim-outer': rim.outer,
    '--morb-wheel-rim-inner': rim.inner,
    '--morb-wheel-rim-glow': rim.glow,
  } as CSSProperties

  const pocket = landedCenter !== null ? getPocketColor(landedCenter) : null
  const centerBg =
    pocket === 'red'
      ? ROULETTE_RED_HEX
      : pocket === 'black'
        ? ROULETTE_BLACK_HEX
        : pocket === 'green'
          ? ROULETTE_GREEN_HEX
          : undefined

  return (
    <div
      className="morb-roulette-wheel-wrap relative flex justify-center"
      style={rimStyle}
    >
      <CasinoRouletteWheel
        start={spinning}
        winningBet={winningBet as any}
        onSpinningEnd={handleLibrarySpinEnd as any}
        layoutType="european"
        spinLaps={ROULETTE_SPIN_LAPS}
        spinDuration={ROULETTE_SPIN_DURATION_SEC}
      />
      {landedCenter !== null && (
        <div
          className="morb-roulette-wheel-center-slot pointer-events-none"
          aria-live="polite"
          aria-label={`Winning number ${landedCenter}`}
        >
          <span
            className={cn(
              'morb-roulette-wheel-center-result flex h-full w-full items-center justify-center rounded-full border font-black tabular-nums text-white',
              pocket === 'green' && 'shadow-[0_0_14px_rgba(0,128,0,0.55)]'
            )}
            style={{
              backgroundColor: centerBg,
              borderColor:
                pocket === 'red'
                  ? 'rgba(255,255,255,0.32)'
                  : pocket === 'black'
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(255,255,255,0.28)',
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            }}
          >
            {landedCenter}
          </span>
        </div>
      )}
    </div>
  )
}
