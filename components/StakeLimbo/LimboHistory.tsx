'use client'

/**
 * LimboHistory — the player's recent rounds. Rendered inside LimboInfoTabs'
 * "My rounds" tab (the tab supplies panel chrome + label), and live-prepended
 * by the game as rounds settle.
 */

import { Play } from 'lucide-react'
import { formatMultiplier, type LimboHistoryRound } from '@/lib/limbo-client'

interface LimboHistoryProps {
  rounds: LimboHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
  /** When provided, each row gets a Replay button that re-shows the result. */
  onReplay?: (round: LimboHistoryRound) => void
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function LimboHistory({ rounds, loading, onVerify, onReplay }: LimboHistoryProps) {
  return (
    <section aria-label="Recent rounds">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No rounds yet — set a target and send it.
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
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  ≥ {formatMultiplier(r.targetX100)}
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums font-semibold ${
                    r.won ? 'text-cyan-300' : 'text-rose-400'
                  }`}
                >
                  {formatMultiplier(r.resultX100)}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span
                  className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                    profit > 0 ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                </span>
                {onReplay && (
                  <button
                    type="button"
                    onClick={() => onReplay(r)}
                    title="Replay this result on the board"
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
