'use client';

/**
 * MiniAppRecentWins — a "live wins" rail on the Mini App hub.
 *
 * Fetches the last few notable wins from the MORBIUS Arcade (Video Poker,
 * Limbo, Mines, Hi-Lo) via GET /api/telegram/miniapp/recent-wins and renders
 * them as a horizontally-scrolling row of cards. Auto-refreshes every 30
 * seconds while mounted so the rail feels alive without hammering the backend.
 *
 * Visual style is matched to the rest of the Mini App (Mitr brutalist
 * headings, cyan-on-navy palette) so it slots into the hub without re-tuning.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  IconCards,
  IconArrowsUpDown,
  IconBolt,
  IconBomb,
} from '@tabler/icons-react';

type GameKind = 'video_poker' | 'limbo' | 'mines' | 'hilo';

interface RecentWin {
  game: GameKind;
  roundId: string;
  walletShort: string;
  displayName: string | null;
  payout: string;
  bet: string;
  /** Video Poker category id (e.g. 'royal_flush'); null for other games. */
  detail: string | null;
  /** Cashout / result multiplier, when the game has one. */
  multiplier: number | null;
  resolvedAt: string;
}

interface RecentWinsResponse {
  ok: boolean;
  wins?: RecentWin[];
  error?: string;
}

const REFRESH_MS = 30_000;

const VP_CATEGORY_LABEL: Record<string, string> = {
  royal_flush: 'Royal Flush',
  straight_flush: 'Straight Flush',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
};

/** Per-game visual style so each pill is instantly recognizable. */
const GAME_STYLE: Record<
  GameKind,
  { tag: string; tagClass: string; icon: ReactNode }
> = {
  video_poker: {
    tag: 'Video Poker',
    tagClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    icon: <IconCards size={13} aria-hidden />,
  },
  limbo: {
    tag: 'Limbo',
    tagClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    icon: <IconBolt size={13} aria-hidden />,
  },
  mines: {
    tag: 'Mines',
    tagClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    icon: <IconBomb size={13} aria-hidden />,
  },
  hilo: {
    tag: 'Hi-Lo',
    tagClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    icon: <IconArrowsUpDown size={13} aria-hidden />,
  },
};

function formatChips(raw: string): string {
  const n = Number(raw || '0');
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return n.toLocaleString('en-US');
}

function shortAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function whoLabel(w: RecentWin): string {
  return w.displayName?.trim() || w.walletShort;
}

/** Compute the big-line headline shown on each win card. */
function headlineFor(w: RecentWin): string {
  if (w.game === 'video_poker') {
    return (w.detail && VP_CATEGORY_LABEL[w.detail]) || 'Big Win';
  }
  const x = (w.multiplier ?? 0).toFixed(2);
  if (w.game === 'limbo') return `${x}x Limbo`;
  if (w.game === 'mines') return `${x}x Mines`;
  return `${x}x Hi-Lo`;
}

/** Hero treatment lights up the biggest results — gold border + Jackpot tag. */
function isHeroWin(w: RecentWin): boolean {
  if (w.game === 'video_poker') {
    return w.detail === 'royal_flush' || w.detail === 'straight_flush';
  }
  return (w.multiplier ?? 0) >= 25;
}

function WinCard({ w }: { w: RecentWin }) {
  const style = GAME_STYLE[w.game];
  const headline = headlineFor(w);
  const hero = isHeroWin(w);

  return (
    <div
      className={`relative flex w-[170px] shrink-0 snap-start flex-col rounded-2xl border p-3 ${
        hero ? 'border-amber-400/40' : 'border-cyan-500/15'
      }`}
      style={{
        background: hero
          ? 'linear-gradient(160deg,#1a1a0c 0%,#0b1a2c 70%)'
          : '#0b1a2c',
      }}
    >
      {hero && (
        <span
          className="absolute -top-1.5 right-2 flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300"
          style={{ boxShadow: '0 0 8px rgba(251,191,36,0.35)' }}
        >
          <IconBolt size={9} aria-hidden />
          Jackpot
        </span>
      )}
      <span
        className={`flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${style.tagClass}`}
      >
        {style.icon}
        {style.tag}
      </span>
      <div
        className={`mitr-bold mt-2 truncate text-lg leading-tight ${
          hero ? 'text-amber-300' : 'text-white'
        }`}
        title={headline}
      >
        {headline}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="mitr-bold tabular-nums text-xl text-cyan-400">
          +{formatChips(w.payout)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          chips
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-slate-400">
        <span className="truncate font-mono">{whoLabel(w)}</span>
        <span className="shrink-0 tabular-nums text-slate-500">{shortAgo(w.resolvedAt)}</span>
      </div>
    </div>
  );
}

export default function MiniAppRecentWins() {
  const [wins, setWins] = useState<RecentWin[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/telegram/miniapp/recent-wins', { cache: 'no-store' });
        const data = (await res.json()) as RecentWinsResponse;
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setErrored(true);
          return;
        }
        setErrored(false);
        setWins(Array.isArray(data.wins) ? data.wins : []);
      } catch {
        if (!cancelled) setErrored(true);
      }
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Quietly hide on first-load error or empty feed — the hub stays clean and
  // the rail re-appears the next time it loads (every 30s) once data exists.
  if (errored && !wins) return null;
  if (wins && wins.length === 0) return null;

  return (
    <div className="mt-5 mb-1">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/60" aria-hidden />
            <span className="relative h-2 w-2 rounded-full bg-cyan-400" aria-hidden />
          </span>
          Live wins
        </div>
        <span className="text-[9.5px] uppercase tracking-wider text-slate-600">Last 24h</span>
      </div>
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {wins
          ? wins.map((w) => <WinCard key={`${w.game}:${w.roundId}`} w={w} />)
          : Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[110px] w-[170px] shrink-0 animate-pulse rounded-2xl border border-cyan-500/10 bg-[#0b1a2c]"
              />
            ))}
      </div>
    </div>
  );
}
