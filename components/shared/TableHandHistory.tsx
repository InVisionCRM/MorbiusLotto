'use client';

/**
 * TableHandHistory — the settled-hands list for the house-banked poker games.
 *
 * Deliberately plain: one row per hand showing what went in, what came back,
 * and a link to verify it. Every row is independently checkable, which is the
 * whole point of keeping the hand id visible rather than tucking it away.
 */

import { Card } from '@/components/ui/card';

export interface TableHistoryRow {
  roundId: string;
  when: string;
  /** Everything the player put up across the hand. */
  committed: number;
  /** Everything returned (stakes included). */
  payout: number;
  /** Short outcome label, e.g. "You win" / "Folded". */
  label: string;
  /** Optional secondary line, e.g. the player's hand name. */
  detail?: string | null;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TableHandHistory({
  rows,
  loading,
  onVerify,
  emptyCopy,
}: {
  rows: TableHistoryRow[];
  loading: boolean;
  onVerify: (roundId: string) => void;
  emptyCopy: string;
}) {
  return (
    <Card className="border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Your hands</p>
        {loading && <span className="text-[11px] text-slate-600">loading…</span>}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-600">{loading ? '' : emptyCopy}</p>
      ) : (
        <div className="divide-y divide-cyan-950/60">
          {rows.map((r) => {
            const net = r.payout - r.committed;
            return (
              <div key={r.roundId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-slate-300">
                    {r.label}
                    {r.detail && <span className="text-slate-500"> · {r.detail}</span>}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {timeAgo(r.when)} · wagered {r.committed.toLocaleString()}
                  </div>
                </div>
                <div
                  className={`arc-mono shrink-0 text-sm font-semibold tabular-nums ${
                    net > 0 ? 'text-amber-300' : net < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {net > 0 ? `+${net.toLocaleString()}` : net < 0 ? `−${Math.abs(net).toLocaleString()}` : '±0'}
                </div>
                <button
                  type="button"
                  onClick={() => onVerify(r.roundId)}
                  className="shrink-0 rounded border border-cyan-950 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  Verify
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
