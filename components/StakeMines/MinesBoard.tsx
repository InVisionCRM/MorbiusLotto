'use client'

/**
 * MinesBoard — the 5×5 grid for chips Mines.
 *
 * Pure presentation: the server owns all round state, so each cell just
 * renders one of four states and reports taps upward. `pendingCell` marks the
 * single in-flight /pick (the game serializes picks — one await at a time).
 *
 * States:
 *   hidden     — unrevealed plate (tappable while the round is active)
 *   gem        — revealed safe cell (cyan diamond, pop-in)
 *   bomb       — the bomb the player hit (rose, shake)
 *   bomb-other — remaining bombs revealed after the round ends (dimmed)
 */

import { IconBomb, IconDiamond } from '@tabler/icons-react'
import { MINES_TOTAL_CELLS } from '@/lib/mines-client'

export type MinesCellState = 'hidden' | 'gem' | 'bomb' | 'bomb-other'

interface MinesBoardProps {
  cells: MinesCellState[]
  pendingCell: number | null
  /** True only while the round is active and no pick is in flight. */
  interactive: boolean
  onPick: (cell: number) => void
}

export function MinesBoard({ cells, pendingCell, interactive, onPick }: MinesBoardProps) {
  return (
    <div
      role="grid"
      aria-label="Mines board"
      className="mx-auto grid w-full max-w-[460px] grid-cols-5 gap-2 sm:gap-2.5"
    >
      {Array.from({ length: MINES_TOTAL_CELLS }, (_, i) => {
        const state = cells[i] ?? 'hidden'
        const pending = pendingCell === i
        const tappable = interactive && state === 'hidden' && !pending

        let cls = ''
        if (state === 'gem') {
          cls = 'bg-cyan-500/15 ring-1 ring-cyan-400/70 shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]'
        } else if (state === 'bomb') {
          cls = 'mine-shake bg-rose-500/15 ring-1 ring-rose-400/70 shadow-[0_0_18px_-4px_rgba(244,63,94,0.6)]'
        } else if (state === 'bomb-other') {
          cls = 'bg-rose-500/5 ring-1 ring-rose-900/60 opacity-75'
        } else if (pending) {
          cls = 'animate-pulse bg-[#0B2230] ring-1 ring-cyan-400/80'
        } else {
          cls = [
            'bg-[#0B2230] ring-1 ring-cyan-950',
            tappable ? 'hover:ring-cyan-500/60 hover:bg-[#0D2A3C]' : 'opacity-80',
          ].join(' ')
        }

        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            disabled={!tappable}
            onClick={() => onPick(i)}
            aria-label={`Cell ${i + 1}${state === 'hidden' ? '' : `: ${state}`}`}
            className={[
              'keno-tile relative flex aspect-square select-none items-center justify-center rounded-lg',
              'disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80',
              cls,
            ].join(' ')}
          >
            {state === 'gem' && (
              <IconDiamond size={26} className="keno-pop text-cyan-300" aria-hidden />
            )}
            {state === 'bomb' && (
              <IconBomb size={26} className="text-rose-300" aria-hidden />
            )}
            {state === 'bomb-other' && (
              <IconBomb size={22} className="text-rose-800" aria-hidden />
            )}
          </button>
        )
      })}
    </div>
  )
}
