'use client'

import { useMemo } from 'react'
import { useRouletteResults } from '@/hooks/use-roulette-results'
import {
  getPocketColor,
  ROULETTE_BLACK_HEX,
  ROULETTE_GREEN_HEX,
  ROULETTE_RED_HEX,
} from './roulette-constants'
import { cn } from '@/lib/utils'

/** Hard cap for on-chain fetch + UI columns (grid-cols-20). */
export const ROULETTE_RECENT_HISTORY_CAP = 20

function PocketDot({ n }: { n: number }) {
  const color = getPocketColor(n)
  const surface =
    color === 'red'
      ? { backgroundColor: ROULETTE_RED_HEX, borderColor: 'rgba(255,255,255,0.32)' }
      : color === 'black'
        ? { backgroundColor: ROULETTE_BLACK_HEX, borderColor: 'rgba(255,255,255,0.22)' }
        : { backgroundColor: ROULETTE_GREEN_HEX, borderColor: 'rgba(255,255,255,0.28)' }
  return (
    <span
      className={cn(
        'flex h-full min-h-0 min-w-0 w-full items-center justify-center border text-[9px] font-black tabular-nums text-white sm:text-[10px]',
        color === 'green' && 'shadow-[0_0_10px_rgba(0,128,0,0.45)]'
      )}
      style={surface}
    >
      {n}
    </span>
  )
}

export function RouletteRecentNumbersStrip() {
  const { results } = useRouletteResults({ limit: ROULETTE_RECENT_HISTORY_CAP })
  const shown = useMemo(
    () => results.slice(0, ROULETTE_RECENT_HISTORY_CAP),
    [results]
  )

  return (
    <div className="mb-2 flex w-full min-w-0 justify-center">
      <div
        className="grid h-11 w-full min-w-0 max-w-full grid-cols-20 gap-0.5 border border-[rgba(60,60,60,0.5)] px-1 py-0.5 sm:gap-1"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.55))',
          boxShadow:
            'inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 5px rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.45)',
        }}
      >
        {shown.length === 0 ? (
          <div className="col-span-20 flex min-w-0 items-center justify-center px-1 text-center text-[10px] text-white/40 sm:text-xs">
            No spins yet
          </div>
        ) : (
          shown.map((r) => <PocketDot key={String(r.spinId)} n={r.result} />)
        )}
      </div>
    </div>
  )
}
