'use client';

/**
 * GreedDiceInfoTabs — arcade2 info tabs for /greed-dice (cyan Deep-Sea Neon):
 *   Recent      — latest rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history, live-prepended by the game (verify links)
 *   Rules       — the scoring table + volatility configs, from the server
 *   FAQ         — shared arcade FAQ + Greed Dice specifics
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { greedDiceOdds } from './greedDiceOdds';
import {
  fetchGreedDiceRecent,
  fetchGreedDiceLeaderboard,
  formatMultiplier,
  GREED_DICE_VOLATILITY_ORDER,
  GREED_DICE_VOLATILITY_LABELS,
  GREED_DICE_VOLATILITY_META,
  type GreedDiceInfo,
  type GreedDiceRecentRound,
  type GreedDiceLeaderboardEntry,
  type GreedDiceHistoryRound,
} from '@/lib/greed-dice-client';
import { greedDiceFaqs } from './greedDiceFaqs';

interface GreedDiceInfoTabsProps {
  history: GreedDiceHistoryRound[];
  historyLoading: boolean;
  onVerify: (roundId: string) => void;
  info: GreedDiceInfo | null;
}

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 ' +
  'transition-colors hover:text-slate-300 data-[state=active]:bg-cyan-500/15 ' +
  'data-[state=active]:text-cyan-300 data-[state=active]:ring-1 data-[state=active]:ring-cyan-500/50';

const SCORING_ROWS: [string, string, boolean][] = [
  ['Single 1', '100', false],
  ['Single 5', '50', false],
  ['Three 1s', '1000', false],
  ['Three of a kind', 'face ×100', false],
  ['Four / five / six of a kind', '×2 / ×4 / ×8', false],
  ['All dice score', 'hot dice ↻', true],
];

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
      {won ? 'Bank' : 'Farkle'}
    </span>
  );
}

export function GreedDiceInfoTabs({ history, historyLoading, onVerify, info }: GreedDiceInfoTabsProps) {
  const [recent, setRecent] = useState<GreedDiceRecentRound[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [leaders, setLeaders] = useState<GreedDiceLeaderboardEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchGreedDiceRecent(25)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    fetchGreedDiceLeaderboard(10)
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

  const minBet = info?.minBet ?? 100;
  const maxBet = info?.maxBet ?? 100000;

  return (
    <section aria-label="Greed Dice information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-6 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>Leaderboard</TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rounds</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="rules" className={TRIGGER_CLASS}>Rules</TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No rolls yet — roll the first.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">{shortAddr(h.wallet)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">{h.diceCount}d</span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">
                      {h.won ? formatMultiplier(h.multiplierX100) : '—'}
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
            <Empty>No rolls yet — set your dice and roll in.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {history.map((h) => {
                const net = h.payout - h.bet;
                return (
                  <li key={h.roundId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">{timeLabel(h.createdAt)}</span>
                    <ResultBadge won={h.won} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {h.diceCount}d · {h.rolls} roll{h.rolls === 1 ? '' : 's'}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-cyan-300">
                      {h.won ? formatMultiplier(h.multiplierX100) : '—'}
                    </span>
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
          <ArcadeOddsTab odds={greedDiceOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              Roll the dice — every <span className="text-cyan-300">scoring die</span> banks
              automatically and your points grow. After each roll, bank the points for a multiplier on
              your bet, or reroll the leftovers for more. Roll nothing and you{' '}
              <span className="text-rose-400">farkle</span> — the whole turn is lost. Clear every die
              and it&apos;s <span className="text-cyan-300">hot dice</span>: reroll the full set, points
              intact.
            </p>
            <ul className="divide-y divide-cyan-950/60 rounded-lg bg-[#081420]/70 px-3 ring-1 ring-cyan-950/70">
              {SCORING_ROWS.map(([label, value, hl]) => (
                <li key={label} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className={`arc-mono shrink-0 ${hl ? 'text-cyan-300' : 'text-slate-400'}`}>{value}</span>
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-cyan-950/60 rounded-lg bg-[#081420]/70 px-3 ring-1 ring-cyan-950/70">
              {GREED_DICE_VOLATILITY_ORDER.map((v) => (
                <li key={v} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                  <span className="text-slate-300">
                    {GREED_DICE_VOLATILITY_LABELS[v]}
                    <span className="ml-1.5 text-slate-500">({GREED_DICE_VOLATILITY_META[v]})</span>
                  </span>
                  {info && (
                    <span className="arc-mono shrink-0 text-slate-500">scale {info.volatilities[v].scale}</span>
                  )}
                </li>
              ))}
            </ul>
            <p>
              Fewer dice farkle more often (higher variance) but the scale is tuned per variant so the
              long-run return is the same across all three — and even optimal bank/push play sits just
              under your stake. Bet {minBet.toLocaleString()}–{maxBet.toLocaleString()} chips. Every die
              is sealed from a server seed committed (hashed) before your bet — re-derive any finished
              turn from its Verify button.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={greedDiceFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
