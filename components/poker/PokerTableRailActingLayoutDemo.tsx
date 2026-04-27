'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PokerTableEffectProvider, usePokerTableEffect, FELT_COLOR_PRESETS, RAIL_COLOR_PRESETS } from '@/hooks/use-poker-table-effect';
import { PokerTableRailShell } from '@/components/poker/PokerTableRailShell';
import { PokerRailActingHighlight } from '@/components/poker/PokerRailActingHighlight';
import {
  SEAT_ANCHOR_RING,
  POKER_POT_ANCHOR,
  authoredSeatAnchors,
  authoredWinningPotChipAnchors,
  betChipAnchorForDisplaySlot,
  ringIndexForDisplaySlot,
} from '@/lib/poker-seat-layout';

function FeltAndRailTweaks() {
  const { feltColor, setFeltColor, railColor, setRailColor } = usePokerTableEffect();
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm text-slate-300">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Felt (production gradient)</span>
        <select
          value={feltColor}
          onChange={(e) => setFeltColor(e.target.value)}
          className="rounded-lg border border-slate-600/60 bg-slate-900/80 px-2 py-1.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          {FELT_COLOR_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Rail (production CSS rings)</span>
        <select
          value={railColor}
          onChange={(e) => setRailColor(e.target.value)}
          className="rounded-lg border border-slate-600/60 bg-slate-900/80 px-2 py-1.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          {RAIL_COLOR_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function RailActingPreviewInner({
  seatCount,
  showFullRing,
  showBetChips,
  showWinningPotChips,
}: {
  seatCount: number;
  showFullRing: boolean;
  showBetChips: boolean;
  showWinningPotChips: boolean;
}) {
  const [showHighlight, setShowHighlight] = useState(true);
  const [mode, setMode] = useState<'ring' | 'displaySlot'>('ring');
  const [manualRing, setManualRing] = useState(2);
  const [pretendDisplaySlot, setPretendDisplaySlot] = useState(0);

  const anchors = useMemo(() => authoredSeatAnchors(seatCount), [seatCount]);
  const chipAnchors = useMemo(
    () =>
      Array.from({ length: seatCount }, (_, displaySlot) =>
        betChipAnchorForDisplaySlot(seatCount, displaySlot)
      ),
    [seatCount]
  );
  const winningPotAnchors = useMemo(() => authoredWinningPotChipAnchors(seatCount), [seatCount]);

  const maxSlot = Math.max(0, seatCount - 1);
  const slotClamped = Math.min(pretendDisplaySlot, maxSlot);

  useEffect(() => {
    setPretendDisplaySlot((s) => Math.min(s, maxSlot));
  }, [maxSlot]);
  const activeRingIndex = useMemo(() => {
    if (mode === 'ring') return manualRing;
    return ringIndexForDisplaySlot(slotClamped, seatCount);
  }, [mode, manualRing, slotClamped, seatCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <FeltAndRailTweaks />
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showHighlight}
            onChange={(e) => setShowHighlight(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/40"
          />
          Show acting sector
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">Map</span>
          {(['ring', 'displaySlot'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono ${
                mode === m
                  ? 'bg-cyan-600/30 text-cyan-100 border border-cyan-500/40'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-600/40'
              }`}
            >
              {m === 'ring' ? 'Ring index' : 'Display slot → ring'}
            </button>
          ))}
        </div>
        {mode === 'ring' ? (
          <label className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-500">r</span>
            <input
              type="range"
              min={0}
              max={9}
              value={manualRing}
              onChange={(e) => setManualRing(Number(e.target.value))}
              className="w-32 accent-cyan-500"
            />
            <span className="w-6 font-mono text-cyan-200">{manualRing}</span>
          </label>
        ) : (
          <label className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-500">S</span>
            <input
              type="range"
              min={0}
              max={maxSlot}
              value={slotClamped}
              onChange={(e) => setPretendDisplaySlot(Number(e.target.value))}
              className="w-32 accent-cyan-500"
            />
            <span className="w-6 font-mono text-cyan-200">{slotClamped}</span>
            <span className="text-slate-500 text-xs">→ r{activeRingIndex}</span>
          </label>
        )}
        <p className="w-full text-xs text-slate-500 font-mono">
          highlight ring = {activeRingIndex} (
          {mode === 'ring' ? 'direct' : `ringIndexForDisplaySlot(${slotClamped}, ${seatCount})`})
        </p>
      </div>

      <div
        className="relative w-full mx-auto overflow-hidden rounded-2xl border border-cyan-500/25 shadow-2xl"
        style={{
          aspectRatio: '1.15 / 1',
          maxHeight: 'min(72vh, 640px)',
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow:
            'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        }}
      >
        <PokerTableRailShell />
        <PokerRailActingHighlight visible={showHighlight} activeRingIndex={activeRingIndex} />

        <div
          className="absolute z-10 size-4 rounded-full border-2 border-amber-400/50 bg-amber-400/20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${POKER_POT_ANCHOR.fx * 100}%`, top: `${POKER_POT_ANCHOR.fy * 100}%` }}
          title="Pot"
        />

        {showBetChips &&
          chipAnchors.map((p, displaySlot) => (
            <div
              key={`p-chip-${displaySlot}`}
              className="absolute z-[15] flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
            >
              <div className="flex size-3.5 items-center justify-center rounded-sm border border-amber-300/90 bg-amber-500/85 shadow-md rotate-45" />
              <span className="mt-1.5 text-[9px] font-mono font-semibold text-amber-200/90">C{displaySlot}</span>
            </div>
          ))}

        {showWinningPotChips &&
          winningPotAnchors.map((p, displaySlot) => (
            <div
              key={`p-win-${displaySlot}`}
              className="absolute z-[16] flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
              title={`W${displaySlot} winning pot chip anchor`}
            >
              <div className="flex size-4 items-center justify-center rounded-full border-2 border-emerald-400/80 bg-emerald-500/35 shadow-md" />
              <span className="mt-1.5 text-[9px] font-mono font-semibold text-emerald-200/95">W{displaySlot}</span>
            </div>
          ))}

        {showFullRing &&
          SEAT_ANCHOR_RING.map((p, ringIdx) => (
            <div
              key={`p-ring-${ringIdx}`}
              className="absolute z-[1] size-2 rounded-full bg-white/10 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
            />
          ))}

        {anchors.map((p, displaySlot) => {
          const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
          return (
            <div
              key={`p-s-${displaySlot}`}
              className="absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
            >
              <div
                className="flex size-9 items-center justify-center rounded-full border-2 border-cyan-400/70 bg-cyan-500/25 text-xs font-bold text-cyan-50 shadow-lg"
                title={`S${displaySlot} → r${ri}`}
              >
                S{displaySlot}
              </div>
              <span className="mt-0.5 text-[10px] font-mono text-cyan-200/70">r{ri}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PokerTableRailActingLayoutDemo({
  seatCount,
  showFullRing,
  showBetChips,
  showWinningPotChips = true,
}: {
  seatCount: number;
  showFullRing: boolean;
  showBetChips: boolean;
  showWinningPotChips?: boolean;
}) {
  return (
    <PokerTableEffectProvider>
      <RailActingPreviewInner
        seatCount={seatCount}
        showFullRing={showFullRing}
        showBetChips={showBetChips}
        showWinningPotChips={showWinningPotChips}
      />
    </PokerTableEffectProvider>
  );
}
