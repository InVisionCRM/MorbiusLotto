'use client'

/**
 * KenoRecentWins — global feed of recent Keno wins (any player), for the
 * "Recent wins" tab. Read-only; fed by /api/keno/recent.
 */

import { formatMultiplier, type KenoRecentWin } from '@/lib/keno-client'

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function KenoRecentWins({ wins, loading }: { wins: KenoRecentWin[]; loading: boolean }) {
  return (
    <section aria-label="Recent Keno wins" className="arc-panel rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="arc-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          Recent wins
        </h2>
        <span className="text-[11px] text-slate-500">global · live</span>
      </div>

      {loading && wins.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : wins.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No wins yet — be the first.</p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {wins.map((w) => (
            <li
              key={w.roundId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
            >
              <span className="truncate font-medium text-slate-300" style={{ maxWidth: '11rem' }}>
                {w.username || shortAddr(w.address)}
              </span>
              <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                {w.hits} hit{w.hits === 1 ? '' : 's'}
              </span>
              <span className="arc-mono shrink-0 tabular-nums text-cyan-300">
                {formatMultiplier(w.multiplierX100)}
              </span>
              <span className="arc-mono ml-auto shrink-0 font-semibold tabular-nums text-amber-300">
                +{w.payout.toLocaleString()}
              </span>
              <span className="arc-mono w-16 shrink-0 text-right tabular-nums text-slate-600">
                {relTime(w.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
