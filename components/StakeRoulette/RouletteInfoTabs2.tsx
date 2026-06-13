'use client';

/**
 * RouletteInfoTabs2 — info tabs below /roulette2 (Midnight Emerald):
 * Recent · Leaderboard · My spins (verify links) · Payouts & rules.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchRoulette2Recent,
  fetchRoulette2Leaderboard,
  pocketColor,
  type Roulette2RecentSpin,
  type Roulette2LeaderboardEntry,
  type Roulette2HistorySpin,
} from '@/lib/roulette2-client';

interface RouletteInfoTabs2Props {
  history: Roulette2HistorySpin[];
  historyLoading: boolean;
  onVerify: (spinId: string) => void;
  refreshKey: number;
}

const TRIGGER_CLASS =
  'rounded-md px-2 py-1.5 text-xs font-bold uppercase tracking-widest text-[#5E8273] ' +
  'transition-colors hover:text-slate-200 data-[state=active]:bg-[#34D399]/10 ' +
  'data-[state=active]:text-[#6EE7B7] data-[state=active]:ring-1 data-[state=active]:ring-[#34D399]/50';

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function PocketBadge({ n }: { n: number }) {
  const c = pocketColor(n);
  return (
    <span
      className={`inline-flex h-6 w-7 items-center justify-center rounded font-mono text-xs font-bold text-white ${
        c === 'green' ? 'bg-[#15803D]' : c === 'red' ? 'bg-[#B91C1C]' : 'bg-[#27272A]'
      }`}
    >
      {n}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[#5E8273]">{children}</p>;
}

const PAYOUT_ROWS: Array<[string, string, string]> = [
  ['Straight (one number)', '35:1', '36×'],
  ['Split (two numbers)', '17:1', '18×'],
  ['Street (row of three)', '11:1', '12×'],
  ['Corner (four numbers)', '8:1', '9×'],
  ['Six line (two rows)', '5:1', '6×'],
  ['Dozen / Column', '2:1', '3×'],
  ['Red / Black / Even / Odd / 1–18 / 19–36', '1:1', '2×'],
];

export function RouletteInfoTabs2({
  history,
  historyLoading,
  onVerify,
  refreshKey,
}: RouletteInfoTabs2Props) {
  const [recent, setRecent] = useState<Roulette2RecentSpin[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<Roulette2LeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRoulette2Recent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchRoulette2Leaderboard(10)
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
  }, [refreshKey]);

  return (
    <section
      aria-label="Roulette information"
      className="rounded-xl bg-[#07271A] p-3 ring-1 ring-inset ring-[#0E3B28] sm:p-4"
    >
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-lg bg-[#0A2018] p-1 ring-1 ring-[#0E3B28]">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>
            Recent
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>
            My spins
          </TabsTrigger>
          <TabsTrigger value="payouts" className={TRIGGER_CLASS}>
            Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No spins yet — the felt is fresh.</Empty>
          ) : (
            <ul className="divide-y divide-[#0E3B28]">
              {recent.map((r) => {
                const net = r.totalPayout - r.totalBet;
                return (
                  <li
                    key={r.spinId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="w-12 shrink-0 font-mono tabular-nums text-[#5E8273]">
                      {timeLabel(r.createdAt)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {shortAddr(r.wallet)}
                    </span>
                    <PocketBadge n={r.result} />
                    <span className="shrink-0 font-mono tabular-nums text-[#5E8273]">
                      bet {r.totalBet.toLocaleString()}
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        net > 0 ? 'text-[#FBBF24]' : 'text-[#5E8273]'
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
            <ul className="divide-y divide-[#0E3B28]">
              {leaders.map((p, i) => {
                const net = Number(p.net);
                return (
                  <li
                    key={p.wallet}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span
                      className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${
                        i === 0 ? 'text-[#FBBF24]' : i < 3 ? 'text-[#6EE7B7]' : 'text-[#5E8273]'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-300">
                      {shortAddr(p.wallet)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[#5E8273]">
                      {p.spins.toLocaleString()} spin{p.spins === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        net > 0 ? 'text-[#FBBF24]' : 'text-[#5E8273]'
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
            <Empty>No spins yet. Connect your wallet and place a bet.</Empty>
          ) : (
            <ul className="divide-y divide-[#0E3B28]">
              {history.map((r) => {
                const net = r.totalPayout - r.totalBet;
                return (
                  <li
                    key={r.spinId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="w-12 shrink-0 font-mono tabular-nums text-[#5E8273]">
                      {timeLabel(r.createdAt)}
                    </span>
                    <PocketBadge n={r.result} />
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {r.bets.length} zone{r.bets.length === 1 ? '' : 's'} ·{' '}
                      {r.totalBet.toLocaleString()} chips
                    </span>
                    <span
                      className={`ml-auto shrink-0 font-mono font-semibold tabular-nums ${
                        net > 0 ? 'text-[#FBBF24]' : net === 0 ? 'text-slate-400' : 'text-rose-400'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onVerify(r.spinId)}
                      className="shrink-0 rounded border border-[#0E3B28] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#5E8273] transition-colors hover:border-[#34D399]/50 hover:text-[#6EE7B7]"
                    >
                      Verify
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="payouts" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <ul className="divide-y divide-[#0E3B28] rounded-lg bg-[#0A2018] px-3 ring-1 ring-[#0E3B28]">
              {PAYOUT_ROWS.map(([label, odds, gross]) => (
                <li key={label} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className="shrink-0 font-mono text-[#5E8273]">
                    {odds} <span className="text-[#6EE7B7]">({gross} returned)</span>
                  </span>
                </li>
              ))}
            </ul>
            <p>
              European single-zero rules: one green <span className="font-mono text-[#6EE7B7]">0</span>,
              pockets 0–36, house edge 2.70% on every bet. Zero loses all outside bets — only a
              straight bet on 0 covers it. Place up to 20 zones per spin; the winning pocket is
              drawn from the committed server seed the moment you spin and every payout can be
              re-derived in your browser from the Verify button.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
