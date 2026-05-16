'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Crown } from 'lucide-react';

type Category = 'net_chips' | 'biggest_pot' | 'hands_played';

type Row = {
  rank: number;
  address: string;
  net_chips: string;
  biggest_pot: string;
  hands_played: number;
};

type ApiResponse = {
  category: Category;
  rows: Row[];
  requester: Row | null;
};

const CATEGORIES: Array<{ key: Category; label: string }> = [
  { key: 'net_chips', label: 'Net Chips Won' },
  { key: 'biggest_pot', label: 'Biggest Pot' },
  { key: 'hands_played', label: 'Hands Played' },
];

function shortenHex(addr: string): string {
  if (!addr || addr.length < 12) return addr || '—';
  const a = addr.toLowerCase();
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatCompactChips(value: string): string {
  let n: bigint;
  let negative = false;
  try {
    n = BigInt(value || '0');
  } catch {
    return '0';
  }
  if (n < 0n) {
    negative = true;
    n = -n;
  }
  const num = Number(n);
  let body: string;
  if (num >= 1_000_000) body = `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 1 : 2)}M`;
  else if (num >= 1_000) body = `${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}K`;
  else body = num.toLocaleString('en-US');
  return negative ? `−${body}` : body;
}

function formatSigned(value: string): { text: string; positive: boolean | null } {
  let n: bigint;
  try {
    n = BigInt(value || '0');
  } catch {
    return { text: '0', positive: null };
  }
  if (n === 0n) return { text: '0', positive: null };
  const body = formatCompactChips(n < 0n ? String(n) : String(n));
  return n > 0n ? { text: `+${body}`, positive: true } : { text: body, positive: false };
}

function avatarGradient(addr: string): string {
  let h = 0;
  for (let i = 2; i < addr.length; i += 1) h = (h * 31 + addr.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 80% 65%), hsl(${hue2} 75% 45%))`;
}

function avatarInitials(addr: string): string {
  return (addr || '').slice(2, 4).toUpperCase();
}

function rankClass(rank: number): string {
  if (rank === 1) return 'text-amber-200';
  if (rank === 2) return 'text-slate-200';
  if (rank === 3) return 'text-orange-300';
  return 'text-slate-400';
}

interface Props {
  myAddress?: string | null;
}

export function PokerTopPlayers({ myAddress }: Props) {
  const [category, setCategory] = useState<Category>('net_chips');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const requesterLower = useMemo(() => (myAddress ? myAddress.toLowerCase() : null), [myAddress]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrored(false);
    const qs = new URLSearchParams({ category, limit: '10' });
    if (requesterLower) qs.set('address', requesterLower);
    const url = `/api/poker/top-players?${qs.toString()}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status} ${r.statusText} :: ${body.slice(0, 200)}`);
        }
        return r.json();
      })
      .then((d: ApiResponse) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        // Surface the failure to the console so we can diagnose; render a
        // visible error state below instead of silently hiding the section.
        console.error('[PokerTopPlayers] fetch failed:', url, err);
        if (alive) {
          setErrored(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [category, requesterLower]);

  const rows = data?.rows ?? [];
  const requester = data?.requester ?? null;
  const hasRows = rows.length > 0;

  const renderValueCell = (r: Row) => {
    if (category === 'hands_played') {
      return <span className="tabular-nums text-sm text-slate-100">{r.hands_played.toLocaleString('en-US')}</span>;
    }
    if (category === 'biggest_pot') {
      return <span className="tabular-nums text-sm font-bold text-amber-200">{formatCompactChips(r.biggest_pot)}</span>;
    }
    const sig = formatSigned(r.net_chips);
    const color = sig.positive == null ? 'text-slate-300' : sig.positive ? 'text-emerald-400' : 'text-rose-400';
    return <span className={`tabular-nums text-sm font-bold ${color}`}>{sig.text}</span>;
  };

  const valueHeader =
    category === 'hands_played' ? 'Hands' : category === 'biggest_pot' ? 'Biggest Pot' : 'Net Chips';

  const renderRow = (r: Row, isYou: boolean) => (
    <tr
      key={r.address}
      className={isYou ? 'bg-cyan-400/[0.06] outline outline-1 outline-cyan-400/30 -outline-offset-2' : ''}
    >
      <td className={`py-2.5 px-3 tabular-nums font-black text-base ${rankClass(r.rank)} ${isYou ? '!text-cyan-300' : ''}`}>
        {r.rank}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900"
            style={{ background: avatarGradient(r.address) }}
          >
            {avatarInitials(r.address)}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {isYou ? 'you' : shortenHex(r.address)}
            </div>
            {isYou && (
              <div className="text-[10px] text-cyan-300/80 truncate">{shortenHex(r.address)}</div>
            )}
          </div>
        </div>
      </td>
      {category !== 'hands_played' && (
        <td className="py-2.5 px-3 text-right hidden sm:table-cell">
          <span className="tabular-nums text-sm text-slate-300">{r.hands_played.toLocaleString('en-US')}</span>
        </td>
      )}
      <td className="py-2.5 px-3 text-right">{renderValueCell(r)}</td>
    </tr>
  );

  const requesterAlreadyInTopN =
    requesterLower != null && rows.some((r) => r.address === requesterLower);

  return (
    <section className="surface-splash-panel overflow-hidden border-2 !border-[rgba(255,255,255,0.1)] mt-6 sm:mt-8">
      <div className="surface-splash-panel-glow" aria-hidden />
      <div className="relative h-1 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden />
      <div className="relative z-10 px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border border-white/30"
              style={{
                background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), 0 0 20px rgba(34,211,238,0.12)',
              }}
            >
              <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">Top Players</h2>
              <p className="text-xs text-slate-500 mt-0.5">All-time leaderboard</p>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto sm:overflow-x-visible -mx-1 px-1">
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-colors border ${
                    active
                      ? 'border-cyan-400/55 bg-cyan-400/10 text-cyan-300'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:text-white'
                  }`}
                  aria-pressed={active}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm text-slate-200 min-w-0">
            <thead>
              <tr className="border-b border-slate-600/50">
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-12">
                  #
                </th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Player
                </th>
                {category !== 'hands_played' && (
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">
                    Hands
                  </th>
                )}
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && !data && (
                <tr>
                  <td colSpan={category === 'hands_played' ? 3 : 4} className="py-6 text-center text-sm text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && errored && (
                <tr>
                  <td colSpan={category === 'hands_played' ? 3 : 4} className="py-6 text-center text-sm text-rose-300/80">
                    Couldn&apos;t load the leaderboard. Check the browser console for details and try again in a moment.
                  </td>
                </tr>
              )}
              {!loading && !errored && !hasRows && (
                <tr>
                  <td colSpan={category === 'hands_played' ? 3 : 4} className="py-6 text-center text-sm text-slate-500">
                    No hands played yet. Be the first to make the board.
                  </td>
                </tr>
              )}
              {rows.map((r) => renderRow(r, requesterLower === r.address))}
              {requester && !requesterAlreadyInTopN && renderRow(requester, true)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
