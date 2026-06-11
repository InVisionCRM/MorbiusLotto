'use client'

/**
 * KenoHistory — the player's recent rounds, fed by /api/keno/history (and
 * prepended live as new rounds settle so it never waits on a refetch).
 *
 * Each row: when, risk, bet, hits/picks, multiplier, profit (amber when the
 * round paid, muted when it didn't) and a one-tap Verify that opens the
 * fairness modal pre-filled with the round id.
 */

import { formatMultiplier, KENO_RISK_LABELS, type KenoHistoryRound } from '@/lib/keno-client'

interface KenoHistoryProps {
  rounds: KenoHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
}

const RISK_BADGE: Record<KenoHistoryRound['risk'], string> = {
  classic: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30',
  low: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  high: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function KenoHistory({ rounds, loading, onVerify }: KenoHistoryProps) {
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
          No rounds yet — pick some tiles and place your first bet.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const profit = r.payout - r.bet
            const paid = r.payout > 0
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${RISK_BADGE[r.risk]}`}
                >
                  {KENO_RISK_LABELS[r.risk]}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  {r.hits}/{r.picks.length} hits
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums ${paid ? 'text-cyan-300' : 'text-slate-600'}`}
                >
                  {formatMultiplier(r.multiplierX100)}
                </span>
                <span
                  className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                    profit > 0 ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                </span>
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
