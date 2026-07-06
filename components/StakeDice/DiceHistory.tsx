'use client'

/**
 * DiceHistory — the player's recent rolls. Rendered inside DiceInfoTabs'
 * "My rolls" tab (the tab supplies panel chrome + label), and live-prepended
 * by the game as rolls settle.
 */

import { Play } from 'lucide-react'
import { formatMultiplier, formatX100, type DiceHistoryRound } from '@/lib/dice-client'

interface DiceHistoryProps {
  rounds: DiceHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
  /** When provided, each row gets a Replay button that re-shows the roll. */
  onReplay?: (round: DiceHistoryRound) => void
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function DiceHistory({ rounds, loading, onVerify, onReplay }: DiceHistoryProps) {
  return (
    <section aria-label="Recent rolls">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No rolls yet — set a target and fire the first one.
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
                  &lt; {formatX100(r.targetX100)}
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums font-semibold ${
                    r.won ? 'text-cyan-300' : 'text-rose-400'
                  }`}
                >
                  {formatX100(r.rollX100)}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                  {formatMultiplier(r.multiplierX100)}
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
                    title="Replay this roll on the board"
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
