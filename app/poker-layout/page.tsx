'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PokerActions } from '@/components/poker/PokerActions';
import {
  SEAT_ANCHOR_RING,
  authoredSeatAnchors,
  authoredWinningPotChipAnchors,
  betChipAnchorForDisplaySlot,
  POKER_POT_ANCHOR,
  ringIndexForDisplaySlot,
} from '@/lib/poker-seat-layout';
import { PokerTableRailActingLayoutDemo } from '@/components/poker/PokerTableRailActingLayoutDemo';

export default function PokerLayoutReferencePage() {
  const [seatCount, setSeatCount] = useState(10);
  const [showFullRing, setShowFullRing] = useState(true);
  const [showBetChips, setShowBetChips] = useState(true);
  const [showWinningPotChips, setShowWinningPotChips] = useState(true);

  const anchors = useMemo(() => authoredSeatAnchors(seatCount), [seatCount]);
  const chipAnchors = useMemo(
    () =>
      Array.from({ length: seatCount }, (_, displaySlot) =>
        betChipAnchorForDisplaySlot(seatCount, displaySlot),
      ),
    [seatCount],
  );
  const winningPotAnchors = useMemo(() => authoredWinningPotChipAnchors(seatCount), [seatCount]);

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-8"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
      }}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="relative max-w-3xl mx-auto space-y-6">
        <header className="space-y-2 border-b border-cyan-500/20 pb-4">
          <p className="text-xs uppercase tracking-widest text-cyan-400/80">Reference</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Poker layout</h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Dots use the same <code className="text-cyan-300/90">fx</code> /{' '}
            <code className="text-cyan-300/90">fy</code> as production (
            <code className="text-cyan-300/90">lib/poker-seat-layout.ts</code> →{' '}
            <code className="text-cyan-300/90">PokerTable</code>). The green pill matches the table root
            proportions (3% / 5% / 94% / 88%). Terminology: display slots{' '}
            <strong className="text-slate-200">S0</strong> = hero (bottom center),{' '}
            <strong className="text-slate-200">S1…</strong> clockwise.
          </p>
          <Link
            href="/poker"
            className="inline-block text-sm text-cyan-400 hover:text-cyan-300 underline-offset-4 hover:underline"
          >
            ← Back to poker
          </Link>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-400">Seats in play</span>
          <div className="flex flex-wrap gap-2">
            {([2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeatCount(n)}
                className={`min-w-[2.25rem] rounded-lg px-2 py-1 text-sm font-mono transition-colors ${
                  seatCount === n
                    ? 'bg-cyan-600/30 text-cyan-100 border border-cyan-500/40'
                    : 'bg-slate-800/60 text-slate-300 border border-slate-600/40 hover:border-cyan-500/25'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFullRing}
              onChange={(e) => setShowFullRing(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/40"
            />
            Show all 10 ring points (faint)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBetChips}
              onChange={(e) => setShowBetChips(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
            />
            Show bet chip anchors (C0…)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWinningPotChips}
              onChange={(e) => setShowWinningPotChips(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-emerald-400 focus:ring-emerald-500/40"
            />
            Show showdown pot chip anchors (W0…)
          </label>
        </div>

        <section className="space-y-3 pt-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-cyan-400/80">Production (interactive)</p>
            <h2 className="text-lg font-semibold text-slate-100">Rail + acting sector</h2>
            <p className="text-sm text-slate-400 max-w-2xl">
              Same <code className="text-cyan-300/90">PokerTableRailShell</code> +{' '}
              <code className="text-cyan-300/90">PokerRailActingHighlight</code> as the live table (wrapped in{' '}
              <code className="text-cyan-300/90">PokerTableEffectProvider</code> for felt/rail from settings).
              Tweak the cyan sector without a game. Uses <strong className="text-slate-200">Seats in play</strong> and
              the two checkboxes above for reference overlays.
            </p>
          </div>
          <PokerTableRailActingLayoutDemo
            seatCount={seatCount}
            showFullRing={showFullRing}
            showBetChips={showBetChips}
            showWinningPotChips={showWinningPotChips}
          />
        </section>

        {/* Table root — same conceptual box as PokerTable `absolute inset-0` (lightweight coordinate map) */}
        <div
          className="relative w-full mx-auto rounded-2xl border border-cyan-500/25 overflow-hidden shadow-2xl"
          style={{
            aspectRatio: '1.15 / 1',
            maxHeight: 'min(72vh, 640px)',
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Felt pill — mirrors PokerTable outer felt box */}
          <div
            className="absolute pointer-events-none rounded-[9999px]"
            style={{
              left: '3%',
              top: '5%',
              width: '94%',
              height: '88%',
              background: 'linear-gradient(325deg, rgb(22, 80, 42), rgb(12, 52, 26))',
              boxShadow: 'inset 0 4px 24px rgba(0,0,0,0.45)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          />

          {/* Pot */}
          <div
            className="absolute z-10 size-4 rounded-full border-2 border-amber-400/50 bg-amber-400/20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${POKER_POT_ANCHOR.fx * 100}%`, top: `${POKER_POT_ANCHOR.fy * 100}%` }}
            title="Pot anchor (POKER_POT_ANCHOR)"
          />

          {/* Bet stacks — same as PokerTable (`CHIP_ANCHOR_RING` via betChipAnchorForDisplaySlot) */}
          {showBetChips &&
            chipAnchors.map((p, displaySlot) => (
              <div
                key={`chip-${displaySlot}`}
                className="absolute z-[15] flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
                title={`Bet stack display slot ${displaySlot} (betChipAnchorForDisplaySlot)`}
              >
                <div className="flex size-3.5 items-center justify-center rounded-sm border border-amber-300/90 bg-amber-500/85 shadow-md rotate-45">
                  <span className="sr-only">Chip {displaySlot}</span>
                </div>
                <span className="mt-1.5 text-[9px] font-mono font-semibold text-amber-200/90">C{displaySlot}</span>
                <span className="text-[8px] font-mono text-slate-500 tabular-nums">
                  {p.fx.toFixed(2)},{p.fy.toFixed(2)}
                </span>
              </div>
            ))}

          {showWinningPotChips &&
            winningPotAnchors.map((p, displaySlot) => (
              <div
                key={`win-pot-${displaySlot}`}
                className="absolute z-[16] flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
                title={`Showdown main pot stack → display slot ${displaySlot} (winningPotChipAnchorForDisplaySlot)`}
              >
                <div className="flex size-4 items-center justify-center rounded-full border-2 border-emerald-400/80 bg-emerald-500/35 shadow-md" />
                <span className="mt-1.5 text-[9px] font-mono font-semibold text-emerald-200/95">W{displaySlot}</span>
                <span className="text-[8px] font-mono text-slate-500 tabular-nums">
                  {p.fx.toFixed(2)},{p.fy.toFixed(2)}
                </span>
              </div>
            ))}

          {/* Full ring (optional) */}
          {showFullRing &&
            SEAT_ANCHOR_RING.map((p, ringIdx) => (
              <div
                key={`ring-${ringIdx}`}
                className="absolute z-[1] size-2 rounded-full bg-white/10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
                title={`Ring ${ringIdx}`}
              />
            ))}

          {/* Active seats for seatCount */}
          {anchors.map((p, displaySlot) => {
            const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
            return (
              <div
                key={`s-${displaySlot}`}
                className="absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
              >
                <div
                  className="flex size-9 items-center justify-center rounded-full border-2 border-cyan-400/70 bg-cyan-500/25 text-xs font-bold text-cyan-50 shadow-lg"
                  title={`Display S${displaySlot} → ring ${ri}`}
                >
                  S{displaySlot}
                </div>
                <span className="mt-0.5 text-[10px] font-mono text-cyan-200/70">r{ri}</span>
                <span className="text-[9px] font-mono text-slate-500 tabular-nums">
                  {p.fx.toFixed(2)},{p.fy.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        <section
          className="rounded-xl border border-cyan-500/20 p-4 text-sm text-slate-400 space-y-2"
          style={{
            background: 'linear-gradient(to-r, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.85))',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <p>
            <strong className="text-slate-200">S#</strong> = display slot (hero is always{' '}
            <strong className="text-slate-200">S0</strong> on your client).{' '}
            <strong className="text-slate-200">r#</strong> = ring index into{' '}
            <code className="text-cyan-300/80">SEAT_ANCHOR_RING</code> (0–9).
          </p>
          <p>
            <strong className="text-amber-200">C#</strong> = bet stack anchor for that display slot (
            <code className="text-amber-200/90">betChipAnchorForDisplaySlot</code>
            ), sampled from the hand-authored{' '}
            <code className="text-amber-200/90">CHIP_ANCHOR_RING</code> (0–9) with the same{' '}
            <code className="text-amber-200/90">ringIndexForDisplaySlot</code> mapping as seats.
          </p>
          <p>
            <strong className="text-emerald-300">W#</strong> = showdown main pot chip destination (
            <code className="text-emerald-200/90">winningPotChipAnchorForDisplaySlot</code>
            ), from <code className="text-emerald-200/90">WINNING_POT_CHIP_ANCHOR_RING</code> (or tweak{' '}
            <code className="text-emerald-200/90">WINNING_POT_CHIP_SEAT_TO_CARD_T</code> to shift all seats between{' '}
            <code className="text-slate-400">SEAT_</code> and <code className="text-slate-400">CARD_ANCHOR_RING</code>
            ).
          </p>
          <p>
            Edit coordinates in <code className="text-cyan-300/80">lib/poker-seat-layout.ts</code>; reload this
            page and the live table to compare.
          </p>
        </section>
      </div>

      {/* Full page width so the embedded bar’s 75% tracks the viewport (not the max-w-3xl column). */}
      <section
        className="relative mt-12 w-full border-t border-cyan-500/20 px-4 pb-16 pt-10 md:px-8"
        aria-label="Betting panel preview"
      >
        <div className="mx-auto mb-5 max-w-3xl space-y-1">
          <p className="text-xs uppercase tracking-widest text-cyan-400/80">UI</p>
          <h2 className="text-lg font-semibold text-slate-100">Betting panel (live component)</h2>
          <p className="text-sm text-slate-400">
            Same <code className="text-cyan-300/90">PokerActions</code> as the live table (full width of this
            strip — on <code className="text-cyan-300/90">/poker/[tableId]</code> the bar sits in the center column
            between rails). Sample last-action line + mock chips; tweak props to preview other states.
          </p>
        </div>
        <PokerActions
          canAct
          canCheck
          preAction={null}
          minRaise="100"
          stack="10000"
          callAmount="200"
          pot="500"
          lastActionLine="Alex raised to 1,200"
          onPreActionChange={() => {}}
          onFold={() => {}}
          onCheck={() => {}}
          onCall={() => {}}
          onBet={() => {}}
          onRaise={() => {}}
        />
      </section>
    </div>
  );
}
