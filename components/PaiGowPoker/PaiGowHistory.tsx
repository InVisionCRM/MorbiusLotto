'use client';

/**
 * PaiGowHistory — the player's recent hands, faithful to the lab's "My rounds"
 * rows: time · bet badge · H/L win marks · result · net · Verify. Rendered
 * inside PaiGowInfoTabs' "My rounds" tab and live-prepended by the game as hands
 * settle. The H/L marks are reconciled from the stored hands (win ✓, copy =,
 * loss ✗) via the client settlement mirror.
 */

import {
  reconcileSettlement,
  highHandName,
  type PaiGowHistoryRound,
} from '@/lib/pai-gow-poker-client';

interface PaiGowHistoryProps {
  rounds: PaiGowHistoryRound[];
  loading: boolean;
  onVerify: (roundId: string) => void;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mark(win: boolean, copy: boolean): string {
  return win ? '✓' : copy ? '=' : '✗';
}

export function PaiGowHistory({ rounds, loading, onVerify }: PaiGowHistoryProps) {
  return (
    <section aria-label="Recent hands">
      {loading && rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          No hands yet — post your bet and deal.
        </p>
      ) : (
        <ul className="divide-y divide-cyan-950/60">
          {rounds.map((r) => {
            const rec = reconcileSettlement(r.playerHigh, r.playerLow, r.dealerHigh, r.dealerLow, r.bet);
            const net = r.net ?? rec.net;
            const marks = `H ${mark(rec.winHigh, rec.copyHigh)} · L ${mark(rec.winLow, rec.copyLow)}`;
            const resultCell =
              r.result === 'win' ? (
                <span className="arc-mono shrink-0 tabular-nums text-cyan-300">
                  {highHandName(r.playerHigh)}
                </span>
              ) : r.result === 'push' ? (
                <span className="arc-mono shrink-0 tabular-nums text-slate-500">push</span>
              ) : (
                <span className="arc-mono shrink-0 tabular-nums font-semibold text-rose-400">loss</span>
              );
            return (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
              >
                <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                  {timeLabel(r.createdAt)}
                </span>
                <span className="shrink-0 rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                  bet {r.bet.toLocaleString()}
                </span>
                <span className="arc-mono shrink-0 tabular-nums text-slate-400">{marks}</span>
                {resultCell}
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
