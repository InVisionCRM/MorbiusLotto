'use client';

/**
 * CrashInfoTabs — info tabs below the /crash game, prototype palette:
 *   Recent      — latest settled rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history with verify links
 *   How to play — rules, the curve, and the provably-fair scheme
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchCrashRecent,
  fetchCrashLeaderboard,
  formatCrashMultiplier,
  type CrashRecentRound,
  type CrashLeaderboardEntry,
  type CrashHistoryRound,
} from '@/lib/crash-client';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { crashFaqs } from './crashFaqs';
import { crashOdds } from './crashOdds';

interface CrashInfoTabsProps {
  history: CrashHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
  /** Bump to refetch the public tabs (a round just settled). */
  refreshKey: number;
}

const TRIGGER_CLASS =
  'rounded-md px-2 py-1.5 text-xs font-bold uppercase tracking-widest text-[#848ca1] ' +
  'transition-colors hover:text-white data-[state=active]:bg-[#00ffa3]/10 ' +
  'data-[state=active]:text-[#00ffa3] data-[state=active]:ring-1 data-[state=active]:ring-[#00ffa3]/50';

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function crashTone(crashX100: number): string {
  if (crashX100 >= 1000) return 'text-[#7000ff]';
  if (crashX100 >= 200) return 'text-[#ff9d00]';
  return 'text-[#848ca1]';
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[#848ca1]">{children}</p>;
}

export function CrashInfoTabs({ history, historyLoading, onVerify, refreshKey }: CrashInfoTabsProps) {
  const [recent, setRecent] = useState<CrashRecentRound[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<CrashLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCrashRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {
        /* empty state covers it */
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchCrashLeaderboard(10)
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
  }, [refreshKey]);

  return (
    <section
      aria-label="Crash information"
      className="rounded-xl border border-white/5 bg-[#0a0c14] p-3 sm:p-4"
    >
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-6 gap-1 rounded-lg bg-[#10121a] p-1 ring-1 ring-white/5">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>
            Recent
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>
            <span className="sm:hidden">Leaders</span><span className="hidden sm:inline">Leaderboard</span>
          </TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>
            My rounds
          </TabsTrigger>
          <TabsTrigger value="how" className={TRIGGER_CLASS}>
            How to play
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
            <Empty>No rounds yet — be the first to launch.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.map((r) => {
                const profit = r.payout - r.bet;
                return (
                  <li
                    key={r.roundId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="w-12 shrink-0 font-mono tabular-nums text-[#848ca1]">
                      {timeLabel(r.createdAt)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {shortAddr(r.wallet)}
                    </span>
                    <span
                      className={`shrink-0 font-mono font-semibold tabular-nums ${crashTone(r.crashX100)}`}
                    >
                      💥 {formatCrashMultiplier(r.crashX100)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {r.cashoutX100 != null
                        ? `@ ${formatCrashMultiplier(r.cashoutX100)}`
                        : 'no cashout'}
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        profit > 0 ? 'text-[#00ffa3]' : 'text-[#848ca1]'
                      }`}
                    >
                      {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
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
            <ul className="divide-y divide-white/5">
              {leaders.map((p, i) => {
                const net = Number(p.net);
                return (
                  <li
                    key={p.wallet}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span
                      className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${
                        i === 0 ? 'text-[#ff9d00]' : i < 3 ? 'text-[#00ffa3]' : 'text-[#848ca1]'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-300">
                      {shortAddr(p.wallet)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[#848ca1]">
                      {p.rounds.toLocaleString()} round{p.rounds === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        net > 0 ? 'text-[#00ffa3]' : 'text-[#848ca1]'
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
          {historyLoading ? (
            <Empty>Loading…</Empty>
          ) : history.length === 0 ? (
            <Empty>No rounds yet. Connect your wallet and place a bet.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {history.map((r) => {
                const profit = r.payout - r.bet;
                return (
                  <li
                    key={r.roundId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="w-12 shrink-0 font-mono tabular-nums text-[#848ca1]">
                      {timeLabel(r.createdAt)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {r.bet.toLocaleString()} MORBIUS
                    </span>
                    <span
                      className={`shrink-0 font-mono font-semibold tabular-nums ${crashTone(r.crashX100)}`}
                    >
                      💥 {formatCrashMultiplier(r.crashX100)}
                    </span>
                    <span
                      className={`shrink-0 font-mono tabular-nums ${
                        r.won ? 'text-[#00ffa3]' : 'text-[#ff3e3e]'
                      }`}
                    >
                      {r.cashoutX100 != null
                        ? `cashed @ ${formatCrashMultiplier(r.cashoutX100)}`
                        : 'busted'}
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        profit > 0 ? 'text-[#00ffa3]' : 'text-[#848ca1]'
                      }`}
                    >
                      {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onVerify(r.roundId)}
                      className="shrink-0 rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#848ca1] transition-colors hover:border-[#00ffa3]/50 hover:text-[#00ffa3]"
                    >
                      Verify
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="how" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              Place a bet and the rocket launches. The multiplier climbs from 1.00x along the same
              curve for everyone — slowly at first, then accelerating. Cash out any time while the
              rocket is flying to lock in <span className="text-[#00ffa3]">bet × multiplier</span>.
              If the rocket crashes before you cash out, the bet is lost.
            </p>
            <p>
              <span className="font-bold text-white">Auto cashout</span> fires for you the instant
              the curve reaches your target — it also protects you if you disconnect mid-flight:
              the server settles your round at the target on its own. Maximum cashout is{' '}
              <span className="font-mono text-[#ff9d00]">100.00x</span>; if the rocket flies past
              it with no cashout, your win is banked at 100.00x automatically.
            </p>
            <p>
              <span className="font-bold text-white">Provably fair:</span> the crash point is
              derived from a hashed server seed (committed before your bet), your client seed, and
              a nonce — <span className="font-mono">crash = 0.99 / r</span>, so 99% of value is
              returned to players over time (1% house edge). Every settled round can be
              independently re-derived in your browser from the Verify button.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={crashOdds} accent="#00ffa3" />
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={crashFaqs} accent="#00ffa3" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
