'use client'

/**
 * MinesHistory — the player's recent finalized rounds, fed by
 * /api/arcade/mines/history (and prepended live as rounds settle so it never
 * waits on a refetch).
 *
 * Each row: when, mines count, bet, gems revealed, multiplier (or BUST),
 * profit (amber on a win) and a one-tap Verify that opens the fairness modal
 * pre-filled with the round id.
 */

import { formatMultiplier, type MinesHistoryRound } from '@/lib/mines-client'

interface MinesHistoryProps {
  rounds: MinesHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
  /** Re-watch a past cashout on the board (no wager) — cashed-out rounds only. */
  onReplay?: (round: MinesHistoryRound) => void
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MinesHistory({ rounds, loading, onVerify, onReplay }: MinesHistoryProps) {
  return (
    <section aria-label="Recent rounds" className="arc-panel rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="arc-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          Recent rounds
        </h2>
        <span className="text-[11px] text-slate-500">last {rounds.length || '—'}</span>
      </div>

      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No rounds yet — set your mines and dig for the first gem.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const profit = r.payout - r.bet
            const busted = r.status === 'busted'
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300 ring-1 ring-rose-500/30">
                  {r.bombs} mine{r.bombs === 1 ? '' : 's'}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  {r.gems} gem{r.gems === 1 ? '' : 's'}
                </span>
                {busted ? (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-rose-400">
                    bust
                  </span>
                ) : (
                  <span className="arc-mono shrink-0 tabular-nums text-cyan-300">
                    {formatMultiplier(r.multiplierX100)}
                  </span>
                )}
                <span
                  className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                    profit > 0 ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                </span>
                {onReplay && !busted && (
                  <button
                    type="button"
                    onClick={() => onReplay(r)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-400/80 transition-colors hover:bg-amber-500/10 hover:text-amber-300"
                  >
                    Replay
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onVerify(r.roundId)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                >
                  Verify
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
