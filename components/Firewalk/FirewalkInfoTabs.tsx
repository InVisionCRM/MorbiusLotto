'use client';

/**
 * FirewalkInfoTabs — arcade2 info tabs for /firewalk (cyan Deep-Sea Neon skin):
 *   Recent      — latest rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history, live-prepended by the game (verify links)
 *   Rules       — how the crossing + multipliers work, from the server constants
 *   FAQ         — shared arcade FAQ + Firewalk specifics
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { firewalkOdds } from './firewalkOdds';
import {
  fetchFirewalkRecent,
  fetchFirewalkLeaderboard,
  formatMultiplier,
  FIREWALK_HEAT_ORDER,
  FIREWALK_HEAT_LABELS,
  type FirewalkInfo,
  type FirewalkRecentRound,
  type FirewalkLeaderboardEntry,
  type FirewalkHistoryRound,
} from '@/lib/firewalk-client';
import { firewalkFaqs } from './firewalkFaqs';

interface FirewalkInfoTabsProps {
  history: FirewalkHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
  info: FirewalkInfo | null;
}

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 ' +
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
      {won ? 'Cashed' : 'Burned'}
    </span>
  );
}

export function FirewalkInfoTabs({ history, historyLoading, onVerify, info }: FirewalkInfoTabsProps) {
  const [recent, setRecent] = useState<FirewalkRecentRound[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<FirewalkLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFirewalkRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchFirewalkLeaderboard(10)
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
    <section aria-label="Firewalk information" className="arc-panel rounded-xl p-3 sm:p-4">
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
            <Empty>No walks yet — start the first.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">{shortAddr(h.wallet)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">{h.position} stones</span>
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
                      {p.rounds.toLocaleString()} round{p.rounds === 1 ? '' : 's'}
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
            <Empty>No walks yet — pick a heat and step on.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {history.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 capitalize tabular-nums text-slate-500">{h.heat} · {h.position} stones</span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">{formatMultiplier(h.multiplierX100)}</span>
                    <span className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${net > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
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
          <ArcadeOddsTab odds={firewalkOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              Cross a row of stones over the coals. Each step you choose a pace — hop one stone, leap
              two, or bound three — and every stone in that leap must be solid. Land safely to advance
              and compound your multiplier (minus a {edgePct}% edge); step onto a crumbling one and
              you fall. Cash out after any crossed stone; clear every stone and it auto-settles at the
              top.
            </p>
            <ul className="divide-y divide-cyan-950/60 rounded-lg bg-[#081420]/70 px-3 ring-1 ring-cyan-950/70">
              {FIREWALK_HEAT_ORDER.map((h) => {
                const hi = info?.heats[h];
                const pct = hi ? Math.round(((hi.outcomes - hi.safe) / hi.outcomes) * 100) : null;
                return (
                  <li key={h} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                    <span className="text-slate-300">
                      {FIREWALK_HEAT_LABELS[h]}
                      {hi && <span className="ml-1.5 text-slate-500">({hi.stones} stones · {pct}% crumble)</span>}
                    </span>
                    {hi && (
                      <span className="arc-mono shrink-0 text-cyan-300">up to {formatMultiplier(hi.ladder[hi.stones])}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p>
              Pace changes your variance, not the odds — every stone carries the same small edge, so
              leaping just bundles more risk into one move. Hotter coals mean worse odds per stone but
              a far steeper ladder. Bet {minBet.toLocaleString()}–{maxBet.toLocaleString()} MORBIUS.
              Every stone is sealed from a server seed committed (hashed) before your bet — re-derive
              any finished round from its Verify button.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={firewalkFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
