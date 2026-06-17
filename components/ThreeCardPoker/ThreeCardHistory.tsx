'use client';

/**
 * ThreeCardHistory — the player's recent hands. Rendered inside
 * ThreeCardInfoTabs' "My hands" tab (the tab supplies panel chrome + label) and
 * live-prepended by the game as hands settle.
 */

import { resultLabel, type ThreeCardHistoryRound } from '@/lib/three-card-poker-client';

interface ThreeCardHistoryProps {
  rounds: ThreeCardHistoryRound[];
  loading: boolean;
  onVerify: (roundId: string) => void;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ThreeCardHistory({ rounds, loading, onVerify }: ThreeCardHistoryProps) {
  return (
    <section aria-label="Recent hands">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No hands yet — set your ante and deal.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const committed = r.ante + r.play + r.pairPlus;
            const net = r.totalPayout - committed;
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="shrink-0 rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                  ante {r.ante.toLocaleString()}
                </span>
                {r.pairPlus > 0 && (
                  <span className="arc-mono shrink-0 tabular-nums text-slate-500">+PP</span>
                )}
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                  {resultLabel(r.result)}
                </span>
                <span
                  className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                    net > 0 ? 'text-amber-300' : net === 0 ? 'text-slate-500' : 'text-rose-400'
                  }`}
                >
                  {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => onVerify(r.roundId)}
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                >
                  Verify
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
