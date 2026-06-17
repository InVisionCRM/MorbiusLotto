'use client'

/**
 * DragonTigerHistory — the player's recent rounds. Rendered inside
 * DragonTigerInfoTabs' "My rounds" tab (the tab supplies panel chrome + label),
 * and live-prepended by the game as rounds settle.
 */

import { cardRank, type DragonTigerHistoryRound } from '@/lib/dragon-tiger-client'

interface DragonTigerHistoryProps {
  rounds: DragonTigerHistoryRound[]
  loading: boolean
  onVerify: (roundId: string) => void
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** "dragon" / "tiger" / "tie" pill — capitalised, with a side accent. */
function ResultPill({ result }: { result: DragonTigerHistoryRound['result'] }) {
  const color =
    result === 'dragon' ? '#7be9fb' : result === 'tiger' ? '#fbd36b' : '#94a3b8'
  return (
    <span className="arc-mono shrink-0 capitalize tabular-nums" style={{ color }}>
      {result === 'tie' ? 'Tie' : result}
    </span>
  )
}

export function DragonTigerHistory({ rounds, loading, onVerify }: DragonTigerHistoryProps) {
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
            const profit = r.totalPayout - r.totalBet
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  D{cardRank(r.dragonCard) + 1} · T{cardRank(r.tigerCard) + 1}
                </span>
                <ResultPill result={r.result} />
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  bet {r.totalBet.toLocaleString()}
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
