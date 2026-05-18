'use client';

import React, { useMemo } from 'react';
import type { PokerHandListEntry } from '@/hooks/use-poker-stats';
import { formatChips } from '@/lib/format-poker-chips';

export interface PokerStreakChartProps {
  /** Most-recent-first list of hands from usePokerPlayerHands. */
  hands: PokerHandListEntry[];
  /** All-time net (used for the right-side anchor; falls back to current cumulative). */
  lifetimeNetChips?: bigint | null;
}

interface StreakComputed {
  /** Cumulative chip deltas in chronological order (oldest → newest). */
  points: number[];
  /** Peak cumulative value and its index in `points`. */
  peak: { value: number; index: number };
  /** Trough cumulative value after the peak (deepest drawdown) and its index. */
  trough: { value: number; index: number };
  /** Longest consecutive run of winning hands. */
  longestWinStreak: { count: number; net: number };
  /** Longest consecutive run of losing hands. */
  longestLossStreak: { count: number; net: number };
  /** Current run from the most recent hand backwards. */
  currentStreak: { kind: 'win' | 'loss' | 'none'; count: number; net: number };
  /** Cumulative net at the end of the series. */
  endingNet: number;
}

function computeStreaks(hands: PokerHandListEntry[]): StreakComputed {
  // `hands` arrives newest-first from the server. Reverse to chronological for cumulative math.
  const ordered = [...hands].reverse();

  const points: number[] = [];
  let cumulative = 0;
  let peak = { value: -Infinity, index: 0 };
  let trough = { value: 0, index: 0 };
  let postPeakTrough = { value: 0, index: 0 };

  let longestWin = { count: 0, net: 0 };
  let longestLoss = { count: 0, net: 0 };

  let runKind: 'win' | 'loss' | 'none' = 'none';
  let runCount = 0;
  let runNet = 0;

  const flushRun = () => {
    if (runKind === 'win' && runCount > longestWin.count) longestWin = { count: runCount, net: runNet };
    if (runKind === 'loss' && runCount > longestLoss.count) longestLoss = { count: runCount, net: runNet };
  };

  for (let i = 0; i < ordered.length; i++) {
    const h = ordered[i];
    let won = 0;
    let contributed = 0;
    try { won = Number(BigInt(h.myWon || '0')); } catch { /* ignore */ }
    try { contributed = Number(BigInt(h.myContributed || '0')); } catch { /* ignore */ }
    const delta = won - contributed;
    cumulative += delta;
    points.push(cumulative);

    if (cumulative > peak.value) {
      peak = { value: cumulative, index: i };
      postPeakTrough = { value: cumulative, index: i };
    } else if (cumulative < postPeakTrough.value) {
      postPeakTrough = { value: cumulative, index: i };
    }
    if (cumulative < trough.value) trough = { value: cumulative, index: i };

    const isWin = delta > 0;
    const isLoss = delta < 0;
    const kind: 'win' | 'loss' | 'none' = isWin ? 'win' : isLoss ? 'loss' : 'none';

    if (kind === 'none') {
      // Folded-pre / chopped pot — break the streak but don't start a new one.
      flushRun();
      runKind = 'none';
      runCount = 0;
      runNet = 0;
    } else if (kind === runKind) {
      runCount++;
      runNet += delta;
    } else {
      flushRun();
      runKind = kind;
      runCount = 1;
      runNet = delta;
    }
  }
  flushRun();

  if (peak.value === -Infinity) peak = { value: 0, index: 0 };
  return {
    points,
    peak,
    trough: postPeakTrough.value < 0 ? postPeakTrough : trough,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    currentStreak: { kind: runKind, count: runCount, net: runNet },
    endingNet: cumulative,
  };
}

/** Map a cumulative value to a y-coordinate in [0, 140], centered on a 0-line at y=70. */
function makeYMapper(points: number[]): (v: number) => number {
  if (points.length === 0) return () => 70;
  const max = Math.max(0, ...points);
  const min = Math.min(0, ...points);
  const range = Math.max(Math.abs(max), Math.abs(min)) || 1;
  // Render with 6px top/bottom padding inside the 140px viewBox so markers don't clip.
  return (v: number) => 70 - (v / range) * 64;
}

export function PokerStreakChart({ hands, lifetimeNetChips }: PokerStreakChartProps) {
  const computed = useMemo(() => computeStreaks(hands), [hands]);
  const { points, peak, trough, longestWinStreak, longestLossStreak, currentStreak, endingNet } = computed;

  const yMap = useMemo(() => makeYMapper(points), [points]);

  const n = points.length;
  const xFor = (i: number) => (n <= 1 ? 200 : (i / (n - 1)) * 400);

  // Build path strings: the main poly-line and the two area fills (above/below zero).
  const linePath = useMemo(() => {
    if (n === 0) return '';
    return points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yMap(v).toFixed(1)}`)
      .join(' ');
  }, [points, yMap, n]);

  const areaWinPath = useMemo(() => {
    if (n === 0) return '';
    const inner = points
      .map((v, i) => `L ${xFor(i).toFixed(1)} ${yMap(v).toFixed(1)}`)
      .join(' ');
    return `M 0 70 ${inner} L ${xFor(n - 1).toFixed(1)} 70 Z`;
  }, [points, yMap, n]);

  const areaLossPath = areaWinPath; // same outline; both gradients are clipped above/below the zero line.

  const displayNet = lifetimeNetChips != null ? lifetimeNetChips : BigInt(Math.round(endingNet));
  const isNetWin = (typeof displayNet === 'bigint' ? displayNet : 0n) >= 0n;

  const peakChips = BigInt(Math.round(peak.value));
  const troughChips = BigInt(Math.round(trough.value));

  const showPeakMarker = peak.value > 0 && n > 1;
  const showTroughMarker = trough.value < 0 && n > 1;
  const showNowDot = n > 0;

  return (
    <div className="flex flex-col h-full min-h-[240px]">
      <div className="flex justify-between items-end mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
            Win / loss line
          </div>
          <div className="mt-1.5 font-medium text-white text-[15px]" style={{ fontFamily: 'Mitr, sans-serif', letterSpacing: '-0.01em' }}>
            Last {n} hands
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-500 tracking-wider">
            Each step = 1 hand
          </div>
        </div>
        <div className="text-right">
          <div
            className={`leading-none ${isNetWin ? 'text-emerald-300' : 'text-rose-300'}`}
            style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em' }}
          >
            {isNetWin ? '+' : '−'}{formatChips(displayNet < 0n ? -displayNet : displayNet)}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
            Lifetime net
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-[140px]">
        {n === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600 font-mono">
            Play your first hand to start the line.
          </div>
        ) : (
          <svg viewBox="0 0 400 140" preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="streakGradWin" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="streakGradLoss" x1="0" x2="0" y1="1" y2="0">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
              </linearGradient>
              <clipPath id="streakClipWin">
                <rect x="0" y="0" width="400" height="70" />
              </clipPath>
              <clipPath id="streakClipLoss">
                <rect x="0" y="70" width="400" height="70" />
              </clipPath>
            </defs>

            <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(148,163,184,0.18)" strokeWidth="1" strokeDasharray="2 4" />

            <path d={areaWinPath} clipPath="url(#streakClipWin)" fill="url(#streakGradWin)" />
            <path d={areaLossPath} clipPath="url(#streakClipLoss)" fill="url(#streakGradLoss)" />

            <path
              d={linePath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1.8"
              style={{ filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.4))' }}
            />

            {showPeakMarker && (
              <circle cx={xFor(peak.index)} cy={yMap(peak.value)} r="4" fill="#67e8f9" stroke="#0c1929" strokeWidth="1.5" />
            )}
            {showTroughMarker && (
              <circle cx={xFor(trough.index)} cy={yMap(trough.value)} r="4" fill="#f87171" stroke="#0c1929" strokeWidth="1.5" />
            )}
            {showNowDot && (
              <circle
                cx={xFor(n - 1)}
                cy={yMap(points[n - 1])}
                r="5"
                fill="#06b6d4"
                stroke="white"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.8))' }}
              />
            )}
          </svg>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[9px] font-mono text-slate-500 tracking-wider">
        <span>{n > 0 ? `${n} hand${n === 1 ? '' : 's'} ago` : 'Empty'}</span>
        <span className="text-cyan-400 font-semibold">NOW</span>
      </div>

      <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3 gap-0">
        <StreakStat
          label="Hot streak"
          tone="win"
          value={longestWinStreak.count > 0 ? `${longestWinStreak.count} ${longestWinStreak.count === 1 ? 'hand' : 'hands'}` : '—'}
          sub={longestWinStreak.count > 0 ? `+${formatChips(BigInt(Math.round(longestWinStreak.net)))}` : 'no streak yet'}
          divider={false}
        />
        <StreakStat
          label="Cold streak"
          tone="loss"
          value={longestLossStreak.count > 0 ? `${longestLossStreak.count} ${longestLossStreak.count === 1 ? 'hand' : 'hands'}` : '—'}
          sub={longestLossStreak.count > 0 ? `−${formatChips(BigInt(Math.round(-longestLossStreak.net)))}` : 'no streak yet'}
        />
        <StreakStat
          label="Right now"
          tone={currentStreak.kind === 'win' ? 'win' : currentStreak.kind === 'loss' ? 'loss' : 'neutral'}
          value={
            currentStreak.kind === 'none' || currentStreak.count === 0
              ? '—'
              : currentStreak.kind === 'win'
                ? `🔥 ${currentStreak.count}W`
                : `${currentStreak.count}L`
          }
          sub={
            currentStreak.count === 0
              ? 'idle'
              : currentStreak.kind === 'win'
                ? `+${formatChips(BigInt(Math.round(currentStreak.net)))}`
                : `−${formatChips(BigInt(Math.round(-currentStreak.net)))}`
          }
        />
      </div>

      {(showPeakMarker || showTroughMarker) && (
        <div className="mt-2 flex justify-between text-[9px] font-mono">
          {showPeakMarker ? (
            <span className="text-cyan-300">▲ peak +{formatChips(peakChips)}</span>
          ) : <span />}
          {showTroughMarker ? (
            <span className="text-rose-300">▼ drawdown −{formatChips(troughChips < 0n ? -troughChips : troughChips)}</span>
          ) : <span />}
        </div>
      )}
    </div>
  );
}

function StreakStat({
  label,
  tone,
  value,
  sub,
  divider = true,
}: {
  label: string;
  tone: 'win' | 'loss' | 'neutral';
  value: string;
  sub: string;
  divider?: boolean;
}) {
  const toneClass = tone === 'win' ? 'text-emerald-300' : tone === 'loss' ? 'text-rose-300' : 'text-white';
  return (
    <div className={`px-3 first:pl-0 last:pr-0 relative ${divider ? '' : ''}`}>
      {divider && (
        <span className="absolute left-0 top-[15%] bottom-[15%] w-px bg-white/[0.08]" aria-hidden />
      )}
      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`mt-1.5 leading-none ${toneClass}`} style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] font-mono text-slate-500 tracking-wider">{sub}</div>
    </div>
  );
}
