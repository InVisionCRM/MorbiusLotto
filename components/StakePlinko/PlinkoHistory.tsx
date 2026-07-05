'use client'

/**
 * PlinkoHistory — the player's recent balls, fed by /api/plinko/history (and
 * prepended live as balls settle so it never waits on a refetch).
 *
 * Each row: when, risk, bet, bucket, multiplier, profit (amber when the ball
 * paid more than the bet), a one-tap Verify that opens the fairness modal
 * pre-filled with the round id, and (when onReplay is supplied) a Replay that
 * re-drops the exact same ball on the board so the player can screen-record
 * and share the win.
 */

import { Play } from 'lucide-react'
import {
  formatMultiplier,
  PLINKO_RISK_LABELS,
  type PlinkoHistoryRound,
} from '@/lib/plinko-client'

interface PlinkoHistoryProps {
  rounds: PlinkoHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
  /** When provided, each row gets a Replay button that re-drops that ball. */
  onReplay?: (round: PlinkoHistoryRound) => void
}

const RISK_BADGE: Record<PlinkoHistoryRound['risk'], string> = {
  low: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  high: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function PlinkoHistory({ rounds, loading, onVerify, onReplay }: PlinkoHistoryProps) {
  // Rendered inside PlinkoInfoTabs' "My balls" tab — the tab supplies the
  // panel chrome and label, so this is just the list.
  return (
    <section aria-label="Recent balls">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No balls yet — set a bet and drop your first one.
        </p>
      ) : (
        <>
          {onReplay && (
            <p className="pb-2 text-center text-[11px] text-slate-500">
              Tap <span className="text-cyan-300">Replay</span> to re-drop a ball on the board —
              screen-record it to share your win.
            </p>
          )}
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
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${RISK_BADGE[r.risk]}`}
                >
                  {PLINKO_RISK_LABELS[r.risk]}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bucket {r.bucket}
                </span>
                <span
                  className={`arc-mono shrink-0 tabular-nums ${
                    r.multiplierX100 >= 100 ? 'text-cyan-300' : 'text-slate-600'
                  }`}
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
                {onReplay && (
                  <button
                    type="button"
                    onClick={() => onReplay(r)}
                    title="Replay this ball on the board"
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
        </>
      )}
    </section>
  )
}
