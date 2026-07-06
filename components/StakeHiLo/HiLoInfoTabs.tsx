'use client';

/**
 * HiLoInfoTabs — arcade2 info tabs for /hilo (cyan Deep-Sea Neon skin):
 *   Recent      — latest rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history, live-prepended by the game (verify links)
 *   Rules       — how the ladder + payouts work, from the server constants
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchHiLoRecent,
  fetchHiLoLeaderboard,
  formatMultiplier,
  type HiLoInfo,
  type HiLoRecentRound,
  type HiLoLeaderboardEntry,
  type HiLoHistoryRound,
} from '@/lib/hilo-client';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { hiloOdds } from './hiloOdds';

interface HiLoInfoTabsProps {
  history: HiLoHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
  /** Re-watch a past cashout on the board (no wager) — cashed-out rounds only. */
  onReplay?: (round: HiLoHistoryRound) => void;
  info: HiLoInfo | null;
}

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 ' +
  'transition-colors hover:text-slate-300 data-[state=active]:bg-cyan-500/15 ' +
  'data-[state=active]:text-cyan-300 data-[state=active]:ring-1 data-[state=active]:ring-cyan-500/50';

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

function StatusBadge({ status }: { status: 'busted' | 'cashed_out' }) {
  const cashed = status === 'cashed_out';
  return (
    <span
      className={`arc-mono inline-flex h-6 items-center justify-center rounded px-1.5 text-[10px] font-bold uppercase ring-1 ${
        cashed
          ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
          : 'bg-rose-500/15 text-rose-400 ring-rose-500/40'
      }`}
    >
      {cashed ? 'Cash' : 'Bust'}
    </span>
  );
}

export function HiLoInfoTabs({ history, historyLoading, onVerify, onReplay, info }: HiLoInfoTabsProps) {
  const [recent, setRecent] = useState<HiLoRecentRound[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<HiLoLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchHiLoRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchHiLoLeaderboard(10)
      .then((rows) => {
        if (!cancelled) setLeaders(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLeadersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const minBet = info?.minBet ?? 10;
  const maxBet = info?.maxBet ?? 2000;
  const maxPicks = info?.maxPicks ?? 10;
  const edgePct = ((info?.houseEdgeBp ?? 100) / 100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <section aria-label="Hi-Lo information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}><span className="sm:hidden">Leaders</span><span className="hidden sm:inline">Leaderboard</span></TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rounds</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="rules" className={TRIGGER_CLASS}>Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No rounds yet — deal the first card.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">{shortAddr(h.wallet)}</span>
                    <StatusBadge status={h.status} />
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">{formatMultiplier(h.multiplierX100)}</span>
                    <span className="arc-mono ml-auto shrink-0 tabular-nums font-semibold text-slate-400">
                      <span className={net > 0 ? 'text-amber-300' : 'text-slate-500'}>
                        {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-3 focus-visible:outline-none">
          {leadersLoading ? (
            <Empty>Loading…</Empty>
          ) : leaders.length === 0 ? (
            <Empty>No players on the board yet.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {leaders.map((p, i) => {
                const net = Number(p.net);
                return (
                  <li key={p.wallet} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span
                      className={`arc-mono w-7 shrink-0 text-center font-bold tabular-nums ${
                        i === 0 ? 'text-amber-300' : i < 3 ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-300">{shortAddr(p.wallet)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {p.rounds.toLocaleString()} round{p.rounds === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        net > 0 ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-3 focus-visible:outline-none">
          {historyLoading && history.length === 0 ? (
            <Empty>Loading…</Empty>
          ) : history.length === 0 ? (
            <Empty>No rounds yet — deal a card and climb.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {history.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <StatusBadge status={h.status} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {h.wins}/{h.picks} ✓
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">{formatMultiplier(h.multiplierX100)}</span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        net > 0 ? 'text-amber-300' : 'text-rose-400'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                    {onReplay && h.status === 'cashed_out' && h.cards.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onReplay(h)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-400/80 transition-colors hover:bg-amber-500/10 hover:text-amber-300"
                      >
                        Replay
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onVerify(h.roundId)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                    >
                      Verify
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={hiloOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              A base card is dealt, then you call whether the next card is{' '}
              <span className="text-cyan-300">higher or the same</span> or{' '}
              <span className="text-amber-300">lower</span>. Ties pay as higher. Each correct call
              compounds your multiplier by the inverse of its odds (minus a {edgePct}% edge); one
              wrong call busts the round.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400 sm:text-sm">
              <li>The shorter the odds, the smaller the bump — and vice-versa.</li>
              <li>Cash out any time after your first correct call to bank floor(bet × multiplier).</li>
              <li>Up to {maxPicks} picks per round; bet {minBet.toLocaleString()}–{maxBet.toLocaleString()} MORBIUS.</li>
              <li>Lower is impossible from an Ace; higher-or-same is always available.</li>
            </ul>
            <p>
              Every card comes from a 52-card deck shuffled from a server seed committed (hashed)
              before your bet — re-derive any finished round in your browser from its Verify button.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
