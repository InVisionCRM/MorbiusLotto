'use client'

/**
 * AndarBaharHistory — the player's recent rounds. Rendered inside
 * AndarBaharInfoTabs' "My rounds" tab (the tab supplies panel chrome + label),
 * and live-prepended by the game as rounds settle. Mirrors the prototype's
 * My-rounds list (time · side badge · bet · joker rank + card count · winner · net).
 */

import {
  cardRankLabel,
  sideLabel,
  type AndarBaharHistoryRound,
} from '@/lib/andar-bahar-client'

interface AndarBaharHistoryProps {
  rounds: AndarBaharHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AndarBaharHistory({ rounds, loading, onVerify }: AndarBaharHistoryProps) {
  return (
    <section aria-label="Recent rounds">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No rounds yet — pick a side and deal.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const profit = r.payout - r.bet
            const cards = r.andarCards.length + r.baharCards.length
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                  {sideLabel(r.side)}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  {cardRankLabel(r.joker)} · {cards} card{cards === 1 ? '' : 's'}
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums font-semibold ${
                    profit > 0 ? 'text-cyan-300' : 'text-rose-400'
                  }`}
                >
                  {sideLabel(r.winningSide)}
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
