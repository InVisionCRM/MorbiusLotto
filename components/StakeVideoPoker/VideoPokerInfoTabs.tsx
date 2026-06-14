'use client';

/**
 * VideoPokerInfoTabs — info tabs for /video-poker (cyan Deep-Sea Neon skin):
 *   Paytable — the live 9/6 Jacks-or-Better table; the round's winning row
 *              highlights on a result
 *   My hands — this session's hands (the backend keeps no history), verify links
 *   Rules    — how deal/hold/draw + the paytable work
 */

import { type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  vpRankLabel,
  vpSuitGlyph,
  vpCardIsRed,
  type VideoPokerCategory,
  type VideoPokerPaytable,
} from '@/lib/video-poker-client';
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab';
import { videoPokerOdds } from './videoPokerOdds';

export interface VideoPokerSessionHand {
  handId: string;
  bet: number;
  categoryName: string;
  payout: number;
  finalHand: number[];
}

interface VideoPokerInfoTabsProps {
  info: VideoPokerPaytable | null;
  hands: VideoPokerSessionHand[];
  onVerify: (handId: string) => void;
  currentCategory: VideoPokerCategory | null;
}

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 ' +
  'transition-colors hover:text-slate-300 data-[state=active]:bg-cyan-500/15 ' +
  'data-[state=active]:text-cyan-300 data-[state=active]:ring-1 data-[state=active]:ring-cyan-500/50';

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

function HandChips({ cards }: { cards: number[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {cards.map((c, i) => (
        <span
          key={i}
          className={`arc-mono rounded bg-slate-100 px-1 text-[11px] font-bold ${vpCardIsRed(c) ? 'text-red-600' : 'text-slate-900'}`}
        >
          {vpRankLabel(c)}
          {vpSuitGlyph(c)}
        </span>
      ))}
    </span>
  );
}

export function VideoPokerInfoTabs({ info, hands, onVerify, currentCategory }: VideoPokerInfoTabsProps) {
  const order = info?.order ?? [];

  return (
    <section aria-label="Video poker information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="paytable">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="paytable" className={TRIGGER_CLASS}>Paytable</TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My hands</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="rules" className={TRIGGER_CLASS}>Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="paytable" className="mt-3 focus-visible:outline-none">
          {info == null ? (
            <Empty>Loading…</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {order.map((cat) => {
                const active = cat === currentCategory;
                return (
                  <li
                    key={cat}
                    className={`flex items-center justify-between gap-3 rounded px-2 py-2 text-xs sm:text-sm ${
                      active ? 'bg-cyan-500/15 ring-1 ring-cyan-500/40' : ''
                    }`}
                  >
                    <span className={active ? 'font-semibold text-cyan-300' : 'text-slate-300'}>
                      {info.names[cat]}
                    </span>
                    <span className={`arc-mono shrink-0 tabular-nums ${active ? 'text-cyan-300' : 'text-amber-300'}`}>
                      ×{info.paytable[cat].toLocaleString()}
                    </span>
                  </li>
                );
              })}
              <li className="px-2 pt-2 text-[11px] text-slate-500">
                Pays per 1 staked, {info.minBet.toLocaleString()}–{info.maxBet.toLocaleString()} chips. 9/6 Jacks or
                Better — ~99.5% return at optimal play.
              </li>
            </ul>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-3 focus-visible:outline-none">
          {hands.length === 0 ? (
            <Empty>No hands yet — deal one in.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {hands.map((h, i) => {
                const net = h.payout - h.bet;
                return (
                  <li key={`${h.handId}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
                    <HandChips cards={h.finalHand} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">{h.categoryName}</span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        net > 0 ? 'text-amber-300' : net === 0 ? 'text-slate-400' : 'text-rose-400'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onVerify(h.handId)}
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
          <ArcadeOddsTab odds={videoPokerOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <p>
              You&apos;re dealt five cards. Tap any you want to <span className="text-cyan-300">hold</span>, then draw
              — the rest are replaced. The hand pays per the table for a pair of Jacks or better; the whole deck is
              fixed at deal time, so the draw is locked before you choose what to keep.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400 sm:text-sm">
              <li>Jacks or Better returns your stake (even money); everything above pays more.</li>
              <li>A Royal Flush pays ×800 — the jackpot of the table.</li>
              <li>This is a 9/6 table (Full House ×9, Flush ×6) — about 99.5% return at optimal play.</li>
            </ul>
            <p>
              Every deck is shuffled from a server seed committed (hashed) before your bet — re-derive any finished
              hand in your browser from its Verify button.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
