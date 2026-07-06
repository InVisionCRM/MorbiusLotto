'use client'

/**
 * CascadeHistory — the player's recent drops. Rendered inside CascadeInfoTabs'
 * "My drops" tab (the tab supplies panel chrome + label), and live-prepended by
 * the game as drops settle.
 */

import { Play } from 'lucide-react'
import {
  formatMultiplierX100,
  type CascadeHistoryRound,
  type CascadeVolatility,
} from '@/lib/cascade-client'

interface CascadeHistoryProps {
  rounds: CascadeHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
  /** When provided, each row gets a Replay button that re-shows that drop's final board. */
  onReplay?: (round: CascadeHistoryRound) => void
}

const VOL_LABEL: Record<CascadeVolatility, string> = {
  calm: 'Calm',
  standard: 'Standard',
  frenzy: 'Frenzy',
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function CascadeHistory({ rounds, loading, onVerify, onReplay }: CascadeHistoryProps) {
  return (
    <section aria-label="Recent drops">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No drops yet — pick a volatility and drop in.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const profit = r.payout - r.bet
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                  {VOL_LABEL[r.volatility] ?? r.volatility}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                  {r.clusters} chain{r.clusters === 1 ? '' : 's'}
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums font-semibold ${
                    r.won ? 'text-cyan-300' : 'text-rose-400'
                  }`}
                >
                  {r.won ? formatMultiplierX100(r.multiplierX100) : 'no win'}
                </span>
                <span
                  className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                    profit > 0 ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                </span>
                {onReplay && r.won && r.finalBoard && (
                  <button
                    type="button"
                    onClick={() => onReplay(r)}
                    title="Replay this drop on the board"
                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/15"
                  >
                    <Play size={11} className="fill-current" />
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
