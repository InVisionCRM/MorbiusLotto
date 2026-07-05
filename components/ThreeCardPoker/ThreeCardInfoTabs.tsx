'use client';

/**
 * ThreeCardInfoTabs — arcade2 info tabs for /three-card-poker:
 *   Recent      — latest settled hands across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My hands    — the caller's history, live-prepended by the game
 *   Odds        — Pair Plus + Ante bonus paytables
 *   FAQ         — provably-fair + game-specific answers
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThreeCardHistory } from './ThreeCardHistory';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { threeCardFaqs } from './threeCardFaqs';
import { threeCardOdds } from './threeCardOdds';
import {
  fetchThreeCardRecent,
  fetchThreeCardLeaderboard,
  resultLabel,
  type ThreeCardRecentHand,
  type ThreeCardLeaderboardEntry,
  type ThreeCardHistoryRound,
} from '@/lib/three-card-poker-client';

interface ThreeCardInfoTabsProps {
  history: ThreeCardHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
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

export function ThreeCardInfoTabs({ history, historyLoading, onVerify }: ThreeCardInfoTabsProps) {
  const [recent, setRecent] = useState<ThreeCardRecentHand[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<ThreeCardLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchThreeCardRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {
        /* empty state covers it */
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchThreeCardLeaderboard(10)
      .then((rows) => {
        if (!cancelled) setLeaders(rows);
      })
      .catch(() => {
        /* empty state covers it */
      })
      .finally(() => {
        if (!cancelled) setLeadersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Three Card Poker information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>
            Recent
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>
            <span className="sm:hidden">Leaders</span><span className="hidden sm:inline">Leaderboard</span>
          </TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>
            My hands
          </TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>
            Odds
          </TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>
            FAQ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No hands yet — be the first.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((r) => {
                const net = r.totalPayout - r.committed;
                return (
                  <li
                    key={r.roundId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                      {timeLabel(r.createdAt)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      {shortAddr(r.wallet)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      ante {r.ante.toLocaleString()}
                      {r.pairPlus > 0 ? ' +PP' : ''}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      {resultLabel(r.result)}
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
                  <li
                    key={p.wallet}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span
                      className={`arc-mono w-7 shrink-0 text-center font-bold tabular-nums ${
                        i === 0 ? 'text-amber-300' : i < 3 ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-300">
                      {shortAddr(p.wallet)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {p.hands.toLocaleString()} hand{p.hands === 1 ? '' : 's'}
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
          <ThreeCardHistory rounds={history} loading={historyLoading} onVerify={onVerify} />
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={threeCardOdds} />
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={threeCardFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
