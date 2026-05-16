'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Trophy, Medal, Award } from 'lucide-react';
import { PokerStatsModal } from '@/components/poker/PokerStatsModal';

type Category = 'net_chips' | 'biggest_pot' | 'hands_played';

type Row = {
  rank: number;
  address: string;
  display_name: string | null;
  profile_image_url: string | null;
  net_chips: string;
  biggest_pot: string;
  hands_played: number;
  hands_won: number;
  vpip_hands: number;
  showdowns: number;
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

function displayLabel(r: Row): string {
  const name = (r.display_name ?? '').trim();
  if (name.length > 0) return name;
  return shortenHex(r.address);
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

function pct(num: number, den: number): string {
  if (!den || den <= 0) return '—';
  const v = Math.round((num / den) * 100);
  return `${v}%`;
}

function winRateColor(num: number, den: number): string {
  if (!den) return 'text-slate-400';
  const v = num / den;
  if (v >= 0.5) return 'text-emerald-400';
  if (v < 0.3) return 'text-rose-400';
  return 'text-slate-200';
}

function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 80% 65%), hsl(${hue2} 75% 45%))`;
}

function avatarInitials(r: Row): string {
  const name = (r.display_name ?? '').trim();
  if (name.length > 0) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (r.address || '').slice(2, 4).toUpperCase();
}

function rankClass(rank: number): string {
  if (rank === 1) return 'text-amber-200';
  if (rank === 2) return 'text-slate-200';
  if (rank === 3) return 'text-orange-300';
  return 'text-slate-400';
}

/**
 * Headline metric for the leaderboard — the actively-sorted category. Lives
 * on every row (podium tile + compact list) so the sort order is legible at
 * a glance.
 */
function HeadlineValue({ row, category }: { row: Row; category: Category }) {
  if (category === 'hands_played') {
    return (
      <span className="tabular-nums font-black text-2xl sm:text-3xl text-cyan-200">
        {row.hands_played.toLocaleString('en-US')}
      </span>
    );
  }
  if (category === 'biggest_pot') {
    return (
      <span className="tabular-nums font-black text-2xl sm:text-3xl text-amber-200">
        {formatCompactChips(row.biggest_pot)}
      </span>
    );
  }
  const sig = formatSigned(row.net_chips);
  const color = sig.positive == null ? 'text-slate-300' : sig.positive ? 'text-emerald-400' : 'text-rose-400';
  return <span className={`tabular-nums font-black text-2xl sm:text-3xl ${color}`}>{sig.text}</span>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Podium tile (used for ranks 1–3). #1 gets the largest tile, a crown overlay,
 * and a richer gold gradient + shimmer. #2 silver, #3 bronze, both smaller.
 * Tile order in the rendered grid is #2 / #1 / #3 on sm+ so #1 visually sits
 * highest in the middle, like an Olympic podium. On mobile we stack #1, #2,
 * #3 top-to-bottom so the winner stays at the top.
 * ──────────────────────────────────────────────────────────────────────────── */

interface PodiumProps {
  row: Row;
  category: Category;
  isYou: boolean;
  onSelect: (addr: string) => void;
}

function PodiumTile({ row, category, isYou, onSelect }: PodiumProps) {
  const isFirst = row.rank === 1;
  const isSecond = row.rank === 2;
  const isThird = row.rank === 3;

  // Gold / silver / bronze color tokens for the border ring, badge background,
  // and ambient glow. The actual tile body stays slate so the trophy hue pops.
  const palette = isFirst
    ? {
        ring: 'ring-amber-300/70',
        border: 'border-amber-300/60',
        badgeBg: 'from-amber-200 via-amber-400 to-amber-600',
        badgeText: 'text-amber-950',
        glow: '0 0 60px rgba(251, 191, 36, 0.35), 0 0 32px rgba(251, 191, 36, 0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
        topStripe: 'from-transparent via-amber-300/80 to-transparent',
        crown: 'text-amber-300',
        label: 'Champion',
      }
    : isSecond
    ? {
        ring: 'ring-slate-300/55',
        border: 'border-slate-300/40',
        badgeBg: 'from-slate-200 via-slate-300 to-slate-500',
        badgeText: 'text-slate-900',
        glow: '0 0 32px rgba(203, 213, 225, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
        topStripe: 'from-transparent via-slate-200/60 to-transparent',
        crown: 'text-slate-200',
        label: 'Runner-up',
      }
    : {
        ring: 'ring-orange-400/55',
        border: 'border-orange-400/40',
        badgeBg: 'from-orange-300 via-orange-500 to-orange-700',
        badgeText: 'text-orange-950',
        glow: '0 0 32px rgba(251, 146, 60, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
        topStripe: 'from-transparent via-orange-400/60 to-transparent',
        crown: 'text-orange-300',
        label: 'Bronze',
      };

  const TrophyIcon = isFirst ? Trophy : isSecond ? Medal : Award;

  // Visual hierarchy: #1 sits taller and a hair wider; #2/#3 are compact.
  const sizeClasses = isFirst
    ? 'sm:scale-[1.06] sm:-translate-y-2 sm:py-7 py-6'
    : 'sm:py-5 py-5';

  const avatarSize = isFirst ? 'w-20 h-20 sm:w-24 sm:h-24 text-2xl' : 'w-16 h-16 sm:w-[68px] sm:h-[68px] text-lg';

  return (
    <button
      type="button"
      onClick={() => onSelect(row.address)}
      title={`View ${displayLabel(row)}'s poker stats`}
      className={`
        group relative w-full text-left rounded-2xl border-2 ${palette.border} ${sizeClasses}
        px-4 ring-1 ${palette.ring}
        focus:outline-none focus:ring-2 focus:ring-cyan-400/70
        transition-transform duration-200 hover:-translate-y-0.5
        ${isYou ? 'outline outline-2 outline-cyan-400/70 -outline-offset-2' : ''}
      `}
      style={{
        background:
          'linear-gradient(160deg, rgba(20,28,40,0.95) 0%, rgba(13,19,28,0.95) 100%)',
        boxShadow: palette.glow,
      }}
    >
      {/* Top stripe — a thin colored band that runs across the top of the
          tile to underline its tier. */}
      <div
        className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r ${palette.topStripe}`}
        aria-hidden
      />

      {/* Animated shimmer on #1 only — kept subtle so it reads as a sheen
          rather than a strobe. Pointer-events-none so it never blocks click. */}
      {isFirst && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl opacity-60"
          aria-hidden
        >
          <div
            className="absolute -inset-y-2 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-amber-100/15 to-transparent skew-x-[-18deg] animate-poker-shimmer"
          />
        </div>
      )}

      {/* Crown overlay — only on #1, drifts slightly above the badge. */}
      {isFirst && (
        <Crown
          className={`absolute -top-3 right-3 w-6 h-6 ${palette.crown} drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]`}
          aria-hidden
        />
      )}

      {/* Rank badge — gold/silver/bronze gradient pill with the rank number. */}
      <div
        className={`
          absolute -top-3 left-4 flex items-center gap-1.5 rounded-full px-2.5 py-0.5
          bg-gradient-to-br ${palette.badgeBg} ${palette.badgeText}
          text-[11px] font-black uppercase tracking-wider
          shadow-[0_2px_6px_rgba(0,0,0,0.5)]
        `}
      >
        <TrophyIcon className="w-3.5 h-3.5" aria-hidden />
        #{row.rank}
      </div>

      {/* Tile body */}
      <div className="flex flex-col items-center gap-2 mt-3">
        <div
          className={`relative shrink-0 ${avatarSize} rounded-full flex items-center justify-center font-black text-slate-900 border-2 border-white/30`}
          style={{ background: avatarGradient(displayLabel(row)) }}
        >
          {row.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.profile_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover rounded-full"
            />
          ) : null}
          <span className="relative">{avatarInitials(row)}</span>
        </div>

        <div className="text-center min-w-0 w-full">
          <div
            className={`truncate font-black ${isFirst ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} ${isYou ? 'text-cyan-300' : 'text-white'}`}
            title={displayLabel(row)}
          >
            {isYou ? 'you' : displayLabel(row)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            {palette.label}
          </div>
        </div>

        <div className="mt-1">
          <HeadlineValue row={row} category={category} />
        </div>

        {/* Sub-stats — kept tight so podium stays scannable. */}
        <div className="w-full grid grid-cols-3 gap-1 mt-2 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Hands</div>
            <div className="text-xs font-bold text-slate-200 tabular-nums">{row.hands_played.toLocaleString('en-US')}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Win</div>
            <div className={`text-xs font-bold tabular-nums ${winRateColor(row.hands_won, row.hands_played)}`}>
              {pct(row.hands_won, row.hands_played)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">VPIP</div>
            <div className="text-xs font-bold text-slate-200 tabular-nums">{pct(row.vpip_hands, row.hands_played)}</div>
          </div>
        </div>
      </div>
    </button>
  );
}

interface Props {
  myAddress?: string | null;
}

export function PokerTopPlayers({ myAddress }: Props) {
  const [category, setCategory] = useState<Category>('net_chips');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  // Address of the player whose stats modal is currently open. Lives here
  // (not on a parent) so any row in this section — including the podium —
  // can pop the same modal without prop-drilling.
  const [viewingAddress, setViewingAddress] = useState<string | null>(null);

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

  // Split: top 3 → podium, ranks 4–10 → compact table.
  const podiumRows = rows.slice(0, 3);
  const tableRows = rows.slice(3);

  const requesterAlreadyInTopN =
    requesterLower != null && rows.some((r) => r.address === requesterLower);

  const valueHeader =
    category === 'hands_played' ? 'Hands' : category === 'biggest_pot' ? 'Biggest Pot' : 'Net Chips';

  const renderValueCell = (r: Row) => {
    if (category === 'hands_played') {
      return <span className="tabular-nums text-sm font-bold text-cyan-200">{r.hands_played.toLocaleString('en-US')}</span>;
    }
    if (category === 'biggest_pot') {
      return <span className="tabular-nums text-sm font-bold text-amber-200">{formatCompactChips(r.biggest_pot)}</span>;
    }
    const sig = formatSigned(r.net_chips);
    const color = sig.positive == null ? 'text-slate-300' : sig.positive ? 'text-emerald-400' : 'text-rose-400';
    return <span className={`tabular-nums text-sm font-bold ${color}`}>{sig.text}</span>;
  };

  const renderRow = (r: Row, isYou: boolean) => (
    <tr
      key={r.address}
      className={isYou ? 'bg-cyan-400/[0.06] outline outline-1 outline-cyan-400/30 -outline-offset-2' : ''}
    >
      <td className={`py-2.5 px-3 tabular-nums font-black text-base ${rankClass(r.rank)} ${isYou ? '!text-cyan-300' : ''}`}>
        {r.rank}
      </td>
      <td className="py-2.5 px-3">
        <button
          type="button"
          onClick={() => setViewingAddress(r.address)}
          title={`View ${displayLabel(r)}'s poker stats`}
          className="flex items-center gap-2 min-w-0 text-left -mx-1 px-1 py-0.5 rounded hover:bg-white/[0.04] focus:outline-none focus:bg-cyan-400/10 transition-colors"
        >
          <span
            className="relative shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900 border border-white/20"
            style={{ background: avatarGradient(displayLabel(r)) }}
          >
            {r.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.profile_image_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover rounded-full"
              />
            ) : null}
            <span className="relative">{avatarInitials(r)}</span>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate group-hover:text-cyan-200">
              {isYou ? 'you' : displayLabel(r)}
            </div>
            {(isYou || !!(r.display_name ?? '').trim()) && (
              <div className="text-[10px] text-slate-500 truncate">{shortenHex(r.address)}</div>
            )}
          </div>
        </button>
      </td>
      <td className="py-2.5 px-3 text-right hidden sm:table-cell">
        <span className="tabular-nums text-xs text-slate-300">{r.hands_played.toLocaleString('en-US')}</span>
      </td>
      <td className="py-2.5 px-3 text-right hidden sm:table-cell">
        <span className={`tabular-nums text-xs ${winRateColor(r.hands_won, r.hands_played)}`}>
          {pct(r.hands_won, r.hands_played)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right hidden md:table-cell">
        <span className="tabular-nums text-xs text-slate-400">{pct(r.vpip_hands, r.hands_played)}</span>
      </td>
      <td className="py-2.5 px-3 text-right">{renderValueCell(r)}</td>
    </tr>
  );

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

        {/* Loading / error / empty states — kept at the top so they replace
            both podium and table cleanly. */}
        {loading && !data && (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        )}
        {!loading && errored && (
          <div className="py-10 text-center text-sm text-rose-300/80">
            Couldn&apos;t load the leaderboard. Check the browser console for details and try again in a moment.
          </div>
        )}
        {!loading && !errored && !hasRows && (
          <div className="py-10 text-center text-sm text-slate-500">
            No hands played yet. Be the first to make the board.
          </div>
        )}

        {/* Podium — top 3. On mobile we stack #1/#2/#3 vertically (winner on
            top). On sm+ we use a 3-col grid in #2 / #1 / #3 order so #1 sits
            in the middle and slightly above the others like an Olympic
            podium. The empty middle column on missing-rank cases still keeps
            the grid centered. */}
        {!loading && !errored && podiumRows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:items-end">
            <div className="sm:order-2 order-1">
              {podiumRows[0] && (
                <PodiumTile
                  row={podiumRows[0]}
                  category={category}
                  isYou={requesterLower === podiumRows[0].address}
                  onSelect={setViewingAddress}
                />
              )}
            </div>
            <div className="sm:order-1 order-2">
              {podiumRows[1] && (
                <PodiumTile
                  row={podiumRows[1]}
                  category={category}
                  isYou={requesterLower === podiumRows[1].address}
                  onSelect={setViewingAddress}
                />
              )}
            </div>
            <div className="sm:order-3 order-3">
              {podiumRows[2] && (
                <PodiumTile
                  row={podiumRows[2]}
                  category={category}
                  isYou={requesterLower === podiumRows[2].address}
                  onSelect={setViewingAddress}
                />
              )}
            </div>
          </div>
        )}

        {/* Ranks 4–10 (and any "you" pin) in a compact table. */}
        {!loading && !errored && (tableRows.length > 0 || (requester && !requesterAlreadyInTopN)) && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm text-slate-200 min-w-0">
              <thead>
                <tr className="border-b border-slate-600/50">
                  <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-12">#</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Player</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">Hands</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">Win %</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">VPIP</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">{valueHeader}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableRows.map((r) => renderRow(r, requesterLower === r.address))}
                {requester && !requesterAlreadyInTopN && renderRow(requester, true)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shared stats modal — opens for whichever row is clicked. Reused
          from the page-level "My Stats" button (component accepts any
          address; not limited to the current user). */}
      <PokerStatsModal
        isOpen={!!viewingAddress}
        onClose={() => setViewingAddress(null)}
        playerAddress={viewingAddress}
      />
    </section>
  );
}
