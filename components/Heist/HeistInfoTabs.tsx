'use client';

/**
 * HeistInfoTabs — arcade2 info tabs for /heist (cyan Deep-Sea Neon skin):
 *   Recent      — latest rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history, live-prepended by the game (verify links)
 *   Odds        — per-difficulty ladder + clear chances
 *   Rules       — how the heist + multipliers work, from the server constants
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchHeistRecent,
  fetchHeistLeaderboard,
  formatMultiplier,
  HEIST_DIFFICULTY_ORDER,
  HEIST_DIFFICULTY_LABELS,
  type HeistInfo,
  type HeistRecentRound,
  type HeistLeaderboardEntry,
  type HeistHistoryRound,
} from '@/lib/heist-client';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { heistOdds } from './heistOdds';
import { heistFaqs } from './heistFaqs';

interface HeistInfoTabsProps {
  history: HeistHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
  /** Re-watch a past round on the board (no settlement). */
  onReplay?: (round: HeistHistoryRound) => void;
  info: HeistInfo | null;
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

function ResultBadge({ won }: { won: boolean }) {
  return (
    <span
      className={`arc-mono inline-flex h-6 items-center justify-center rounded px-1.5 text-[10px] font-bold uppercase ring-1 ${
        won ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40' : 'bg-rose-500/15 text-rose-400 ring-rose-500/40'
      }`}
    >
      {won ? 'Escaped' : 'Caught'}
    </span>
  );
}

export function HeistInfoTabs({ history, historyLoading, onVerify, onReplay, info }: HeistInfoTabsProps) {
  const [recent, setRecent] = useState<HeistRecentRound[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<HeistLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchHeistRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchHeistLeaderboard(10)
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
  const edgePct = ((info?.houseEdgeBp ?? 200) / 100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <section aria-label="Heist information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-6 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}><span className="sm:hidden">Leaders</span><span className="hidden sm:inline">Leaderboard</span></TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rounds</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="rules" className={TRIGGER_CLASS}>Rules</TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No jobs yet — pull the first.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">{shortAddr(h.wallet)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">rm {h.room}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">{formatMultiplier(h.multiplierX100)}</span>
                    <span className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${net > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
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
                    <span className={`arc-mono w-7 shrink-0 text-center font-bold tabular-nums ${i === 0 ? 'text-amber-300' : i < 3 ? 'text-cyan-300' : 'text-slate-500'}`}>
                      {i + 1}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-300">{shortAddr(p.wallet)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {p.rounds.toLocaleString()} job{p.rounds === 1 ? '' : 's'}
                    </span>
                    <span className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${net > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
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
            <Empty>No jobs yet — pick a target and break in.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {history.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">{HEIST_DIFFICULTY_LABELS[h.difficulty]} · rm {h.room}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">{formatMultiplier(h.multiplierX100)}</span>
                    <span className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${net > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                    {onReplay && (
                      <button
                        type="button"
                        onClick={() => onReplay(h)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
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
          <ArcadeOddsTab odds={heistOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              Break into a vault room by room. Each room shows several doors; one (or more) is wired
              to the alarm. Crack a safe door to advance and compound your multiplier (minus a{' '}
              {edgePct}% edge). Trip the alarm and the job&apos;s over. Escape with the loot after any
              cleared room; clear every room and it auto-settles at the top.
            </p>
            <ul className="divide-y divide-cyan-950/60 rounded-lg bg-[#081420]/70 px-3 ring-1 ring-cyan-950/70">
              {HEIST_DIFFICULTY_ORDER.map((d) => {
                const di = info?.difficulties[d];
                return (
                  <li key={d} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                    <span className="text-slate-300">
                      {HEIST_DIFFICULTY_LABELS[d]}
                      {di && (
                        <span className="ml-1.5 text-slate-500">
                          ({di.doors} doors · {di.alarms} alarm{di.alarms > 1 ? 's' : ''} · {di.rooms} rooms)
                        </span>
                      )}
                    </span>
                    {di && (
                      <span className="arc-mono shrink-0 text-cyan-300">
                        up to {formatMultiplier(di.ladder[di.rooms])}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p>
              More alarm doors means worse odds per room but a far steeper ladder. Bet{' '}
              {minBet.toLocaleString()}–{maxBet.toLocaleString()} MORBIUS. Every alarm is sealed from a
              server seed committed (hashed) before your bet — re-derive any finished round from its
              Verify button.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={heistFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
