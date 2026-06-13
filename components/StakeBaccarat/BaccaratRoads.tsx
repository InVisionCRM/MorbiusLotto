'use client'

/**
 * BaccaratRoads — the bead-road grid under the felt on /baccarat.
 *
 * Classic bead plate: results fill column-major (top→bottom, then the next
 * column), 6 rows × 12 columns (72 beads max — older results fall off the
 * left). Cyan bead = Player, amber = Banker, purple = Tie; tiny corner dots
 * mark pair hands (top-left cyan = player pair, bottom-right amber = banker
 * pair). Seeded from the public recent feed; the parent appends the caller's
 * hands as they settle.
 */

import type { BaccaratResult } from '@/lib/baccarat-client'

export interface RoadEntry {
  key: string
  result: BaccaratResult
  playerPair: boolean
  bankerPair: boolean
}

interface BaccaratRoadsProps {
  /** Oldest first; only the newest ROAD_CELLS entries render. */
  entries: RoadEntry[]
}

const ROWS = 6
const COLS = 12
export const ROAD_CELLS = ROWS * COLS

const BEAD_CLASS: Record<BaccaratResult, string> = {
  player: 'bg-cyan-500/20 text-cyan-300 ring-cyan-400/70',
  banker: 'bg-amber-500/20 text-amber-300 ring-amber-400/70',
  tie: 'bg-[#A78BFA]/20 text-[#A78BFA] ring-[#A78BFA]/70',
}

const BEAD_LETTER: Record<BaccaratResult, string> = {
  player: 'P',
  banker: 'B',
  tie: 'T',
}

function Bead({ entry }: { entry: RoadEntry | null }) {
  if (!entry) {
    return <div className="h-5 w-5 rounded-full ring-1 ring-cyan-950/60 sm:h-6 sm:w-6" />
  }
  return (
    <div
      className={`relative flex h-5 w-5 items-center justify-center rounded-full ring-1 sm:h-6 sm:w-6 ${BEAD_CLASS[entry.result]}`}
      title={`${BEAD_LETTER[entry.result]}${entry.playerPair ? ' · player pair' : ''}${entry.bankerPair ? ' · banker pair' : ''}`}
    >
      <span className="arc-mono text-[9px] font-bold leading-none sm:text-[10px]">
        {BEAD_LETTER[entry.result]}
      </span>
      {entry.playerPair && (
        <span className="absolute -left-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-cyan-400 ring-1 ring-[#050E16]" />
      )}
      {entry.bankerPair && (
        <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-[#050E16]" />
      )}
    </div>
  )
}

export function BaccaratRoads({ entries }: BaccaratRoadsProps) {
  const visible = entries.slice(-ROAD_CELLS)
  const cells: Array<RoadEntry | null> = Array.from(
    { length: ROAD_CELLS },
    (_, i) => visible[i] ?? null,
  )

  let players = 0
  let bankers = 0
  let ties = 0
  for (const e of visible) {
    if (e.result === 'player') players += 1
    else if (e.result === 'banker') bankers += 1
    else ties += 1
  }

  return (
    <section aria-label="Result road" className="arc-panel rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="arc-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          Road
        </h2>
        <div className="arc-mono flex gap-3 text-[11px] tabular-nums">
          <span className="text-cyan-300">P {players}</span>
          <span className="text-amber-300">B {bankers}</span>
          <span className="text-[#A78BFA]">T {ties}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* grid-flow-col + grid-rows-6 fills column-major like a real bead plate. */}
        <div className="grid w-max grid-flow-col grid-rows-6 gap-1 rounded-lg bg-[#081420]/70 p-2 ring-1 ring-cyan-950/70">
          {cells.map((entry, i) => (
            <Bead key={entry ? entry.key : `empty-${i}`} entry={entry} />
          ))}
        </div>
      </div>
    </section>
  )
}
