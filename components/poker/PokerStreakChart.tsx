'use client';

import React, { useMemo } from 'react';
import type { PokerHandListEntry } from '@/hooks/use-poker-stats';
import { formatChips } from '@/lib/format-poker-chips';

export interface PokerStreakChartProps {
  /** Most-recent-first list of hands from usePokerPlayerHands. */
  hands: PokerHandListEntry[];
  /** All-time net (used for the right-side anchor; falls back to current cumulative). */
  lifetimeNetChips?: bigint | null;
  /** Showdown win rate, 0-100. Rendered in the footer as the skill metric. */
  showdownWinRate?: number | null;
  /** Average chip profit per hand (career). */
  profitPerHand?: bigint | null;
  /** Big blinds per 100 hands. */
  bbPer100?: number | null;
}

interface ChartComputed {
  /** Cumulative chip deltas in chronological order (oldest → newest). */
  points: number[];
  /** Peak cumulative value and its index in `points`. */
  peak: { value: number; index: number };
  /** Trough cumulative value after the peak (deepest drawdown) and its index. */
  trough: { value: number; index: number };
  /** Cumulative net at the end of the series. */
  endingNet: number;
}

function computeChart(hands: PokerHandListEntry[]): ChartComputed {
  // `hands` arrives newest-first from the server. Reverse to chronological for cumulative math.
  const ordered = [...hands].reverse();

  const points: number[] = [];
  let cumulative = 0;
  let peak = { value: -Infinity, index: 0 };
  let trough = { value: 0, index: 0 };
  let postPeakTrough = { value: 0, index: 0 };

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
  }

  if (peak.value === -Infinity) peak = { value: 0, index: 0 };
  return {
    points,
    peak,
    // Prefer the post-peak drawdown if there is one; otherwise the absolute low.
    trough: postPeakTrough.value < 0 ? postPeakTrough : trough,
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

export function PokerStreakChart({
  hands,
  lifetimeNetChips,
  showdownWinRate,
  profitPerHand,
  bbPer100,
}: PokerStreakChartProps) {
  const computed = useMemo(() => computeChart(hands), [hands]);
  const { points, peak, trough, endingNet } = computed;

  const yMap = useMemo(() => makeYMapper(points), [points]);

  const n = points.length;
  const xFor = (i: number) => (n <= 1 ? 200 : (i / (n - 1)) * 400);

  const linePath = useMemo(() => {
    if (n === 0) return '';
    return points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yMap(v).toFixed(1)}`)
      .join(' ');
  }, [points, yMap, n]);

  const areaPath = useMemo(() => {
    if (n === 0) return '';
    const inner = points
      .map((v, i) => `L ${xFor(i).toFixed(1)} ${yMap(v).toFixed(1)}`)
      .join(' ');
    return `M 0 70 ${inner} L ${xFor(n - 1).toFixed(1)} 70 Z`;
  }, [points, yMap, n]);

  const displayNet = lifetimeNetChips != null ? lifetimeNetChips : BigInt(Math.round(endingNet));
  const isNetWin = (typeof displayNet === 'bigint' ? displayNet : 0n) >= 0n;

  const peakChips = BigInt(Math.round(peak.value));
  const troughChips = BigInt(Math.round(trough.value));

  const showPeakMarker = peak.value > 0 && n > 1;
  const showTroughMarker = trough.value < 0 && n > 1;
  const showNowDot = n > 0;

  const showdownWrText =
    showdownWinRate != null && Number.isFinite(showdownWinRate)
      ? `${showdownWinRate.toFixed(0)}%`
      : '—';

  const profitPerHandText = useMemo(() => {
    if (profitPerHand == null) return '—';
    const sign = profitPerHand >= 0n ? '+' : '−';
    const abs = profitPerHand < 0n ? -profitPerHand : profitPerHand;
    return `${sign}${formatChips(abs)}`;
  }, [profitPerHand]);

  const bbPer100Text =
    bbPer100 != null && Number.isFinite(bbPer100)
      ? bbPer100 >= 0
        ? `+${bbPer100.toFixed(1)}`
        : `−${Math.abs(bbPer100).toFixed(1)}`
      : '—';

  return (
    <div className="flex flex-col h-full min-h-[240px]">
      <div className="flex justify-between items-end mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
            Profit / loss
          </div>
          <div className="mt-1.5 font-medium text-white text-[15px]" style={{ fontFamily: 'Mitr, sans-serif', letterSpacing: '-0.01em' }}>
            Last {n} hands
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-500 tracking-wider">
            Cumulative · 1 step = 1 hand
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

            <path d={areaPath} clipPath="url(#streakClipWin)" fill="url(#streakGradWin)" />
            <path d={areaPath} clipPath="url(#streakClipLoss)" fill="url(#streakGradLoss)" />

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

      {/* Career stats footer — replaces the old hot/cold/right-now streak tiles. */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3">
        <CareerStat
          label="Showdown WR"
          value={showdownWrText}
          sub="won at showdown"
          divider={false}
        />
        <CareerStat
          label="Profit / hand"
          value={profitPerHandText}
          sub="career avg"
          tone={profitPerHand != null && profitPerHand < 0n ? 'loss' : 'win'}
        />
        <CareerStat
          label="BB / 100"
          value={bbPer100Text}
          sub="skill metric"
          tone={bbPer100 != null && bbPer100 < 0 ? 'loss' : 'win'}
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

function CareerStat({
  label,
  value,
  sub,
  tone = 'neutral',
  divider = true,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'win' | 'loss' | 'neutral';
  divider?: boolean;
}) {
  const toneClass =
    tone === 'win' ? 'text-emerald-300'
      : tone === 'loss' ? 'text-rose-300'
        : 'text-white';
  return (
    <div className={`px-3 first:pl-0 last:pr-0 relative`}>
      {divider && (
        <span className="absolute left-0 top-[15%] bottom-[15%] w-px bg-white/[0.08]" aria-hidden />
      )}
      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className={`mt-1.5 leading-none ${toneClass} tabular-nums`}
        style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[9px] font-mono text-slate-500 tracking-wider">{sub}</div>
    </div>
  );
}
