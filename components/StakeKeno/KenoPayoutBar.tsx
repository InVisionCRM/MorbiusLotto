'use client'

/**
 * KenoPayoutBar — Stake's bottom multiplier strip.
 *
 * Shows one cell per reachable hit count (0..picksCount) for the current risk,
 * each with its multiplier and the hit count beneath. Cells that pay nothing are
 * muted. After a round resolves, the achieved-hits cell is highlighted.
 *
 * With no tiles selected there's nothing to price, so it renders a hint instead.
 */

import { formatMultiplier, type KenoMultipliers, type KenoRisk } from '@/lib/keno-client'

interface KenoPayoutBarProps {
  multipliers: KenoMultipliers | null
  risk: KenoRisk
  picksCount: number
  /** Achieved hits from the last resolved round, or null when idle / mid-pick. */
  resultHits: number | null
}

export function KenoPayoutBar({ multipliers, risk, picksCount, resultHits }: KenoPayoutBarProps) {
  if (picksCount === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center text-sm text-slate-500">
        Pick 1–10 tiles to see the payout table.
      </div>
    )
  }

  const row = multipliers?.[risk]?.[picksCount] ?? {}
  const cells = Array.from({ length: picksCount + 1 }, (_, hits) => ({
    hits,
    x100: row[hits] ?? 0,
  }))

  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map(({ hits, x100 }) => {
        const pays = x100 > 0
        const isResult = resultHits === hits
        return (
          <div
            key={hits}
            className={[
              'flex flex-col items-center justify-center rounded-lg px-1 py-2 text-center transition-colors',
              isResult
                ? 'keno-cell-flash bg-cyan-500/20 ring-1 ring-cyan-400/70'
                : 'bg-slate-900/60 ring-1 ring-slate-800',
            ].join(' ')}
          >
            <span
              className={[
                'text-xs font-semibold tabular-nums sm:text-sm',
                pays ? 'text-cyan-200' : 'text-slate-600',
              ].join(' ')}
            >
              {formatMultiplier(x100)}
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
              {hits} hit{hits === 1 ? '' : 's'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
