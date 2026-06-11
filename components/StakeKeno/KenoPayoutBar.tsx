'use client'

/**
 * KenoPayoutBar — Stake's bottom multiplier strip.
 *
 * Shows one cell per reachable hit count (0..picksCount) for the current risk,
 * each with its multiplier and the hit count beneath. Cells that pay nothing are
 * muted. After a round resolves, the achieved-hits cell is highlighted — amber
 * when it paid, slate when it didn't.
 *
 * With no tiles selected there's nothing to price, so it renders a hint. If the
 * paytable fetch failed it says so and offers a retry instead of lying with 0×.
 */

import { formatMultiplier, type KenoMultipliers, type KenoRisk } from '@/lib/keno-client'

interface KenoPayoutBarProps {
  multipliers: KenoMultipliers | null
  /** True when the paytable fetch failed — renders the retry state. */
  loadFailed: boolean
  onRetry: () => void
  risk: KenoRisk
  picksCount: number
  /** Achieved hits from the last resolved round, or null when idle / mid-pick. */
  resultHits: number | null
}

export function KenoPayoutBar({
  multipliers,
  loadFailed,
  onRetry,
  risk,
  picksCount,
  resultHits,
}: KenoPayoutBarProps) {
  if (loadFailed) {
    return (
      <div className="arc-panel rounded-xl px-4 py-5 text-center text-sm text-slate-400">
        Couldn&apos;t load the payout table.{' '}
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-cyan-400 underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (picksCount === 0) {
    return (
      <div className="arc-panel rounded-xl px-4 py-5 text-center text-sm text-slate-500">
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
        const resultPaid = isResult && pays
        return (
          <div
            key={hits}
            className={[
              'flex flex-col items-center justify-center rounded-lg px-1 py-2 text-center transition-colors',
              resultPaid
                ? 'keno-cell-flash bg-amber-500/15 ring-1 ring-amber-400/70'
                : isResult
                  ? 'keno-cell-flash bg-slate-700/30 ring-1 ring-slate-500/60'
                  : 'bg-[#081420]/70 ring-1 ring-cyan-950/70',
            ].join(' ')}
          >
            <span
              className={[
                'arc-mono text-xs font-semibold tabular-nums sm:text-sm',
                resultPaid ? 'text-amber-300' : pays ? 'text-cyan-200' : 'text-slate-600',
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
