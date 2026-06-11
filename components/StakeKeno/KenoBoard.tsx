'use client'

/**
 * KenoBoard — the 40-tile grid (8 columns × 5 rows), Stake layout + reveal.
 *
 * Tile states, in priority order:
 *   • hit            — your pick that was drawn  → accent fill, pop + glow (the wins)
 *   • drawnOnly      — drawn, you didn't pick it → muted tile with a centre dot
 *   • pickPending    — your pick, draw not settled yet → stays lit (don't pre-dim)
 *   • pickMiss       — your pick, draw settled, not drawn → dimmed (the near miss)
 *   • idle           — untouched
 *
 * The fix that matters: while the 10 numbers reveal one-by-one, a selected tile
 * that hasn't been drawn *yet* must stay highlighted — it only dims once the
 * whole draw has settled. `settled` carries that. Animations are pure CSS
 * (globals.css: keno-pop / keno-hit-glow / keno-dot) so 40 tiles stay cheap and
 * respect prefers-reduced-motion.
 */

import { KENO_TOTAL_TILES } from '@/lib/keno-client'

const TILES = Array.from({ length: KENO_TOTAL_TILES }, (_, i) => i + 1)

interface KenoBoardProps {
  selected: Set<number>
  /** Numbers revealed so far (grows during the staged reveal); null when idle. */
  drawn: Set<number> | null
  /** True once the full draw has finished revealing — gates the miss-dimming. */
  settled: boolean
  disabled: boolean
  onToggle: (n: number) => void
}

export function KenoBoard({ selected, drawn, settled, disabled, onToggle }: KenoBoardProps) {
  const drawing = drawn !== null

  return (
    <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
      {TILES.map((n) => {
        const isSelected = selected.has(n)
        const isDrawn = drawn?.has(n) ?? false
        const isHit = isSelected && isDrawn
        const isDrawnOnly = isDrawn && !isSelected
        const isPickMiss = isSelected && !isDrawn && settled

        let cls =
          'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/60'
        let extra = ''
        if (isHit) {
          cls =
            'bg-cyan-500 text-slate-950 border border-cyan-300 ring-2 ring-cyan-400/60'
          extra = 'keno-pop keno-hit-glow'
        } else if (isDrawnOnly) {
          cls = 'bg-slate-800/60 text-slate-500 border border-slate-700/50'
        } else if (isSelected) {
          // pickPending (lit) until settled, then pickMiss (dim).
          cls = isPickMiss
            ? 'bg-slate-800/40 text-slate-600 border border-slate-700/40'
            : 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/70 shadow-[0_0_14px_-4px] shadow-cyan-500/50'
        } else if (drawing && settled) {
          cls = 'bg-slate-800/40 text-slate-600 border border-slate-800'
        }

        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(n)}
            aria-pressed={isSelected}
            className={[
              'relative aspect-square rounded-lg font-semibold tabular-nums',
              'text-sm sm:text-base transition-colors duration-150',
              'disabled:cursor-not-allowed select-none',
              cls,
              extra,
            ].join(' ')}
          >
            {n}
            {isDrawnOnly && (
              <span
                aria-hidden
                className="keno-dot pointer-events-none absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-400/70"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
