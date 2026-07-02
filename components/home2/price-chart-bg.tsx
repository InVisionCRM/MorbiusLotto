'use client';

/**
 * PriceChartBg — ambient 90-day MORBIUS price chart rendered behind the hero.
 *
 * A glowing, trend-colored area chart (emerald up / rose down) stretched
 * edge-to-edge under the hero content (preserveAspectRatio="none"). Sits
 * between the ember canvas and .hero-inner (which carries z-index:2), with
 * pointer-events disabled and low opacity so it reads as texture, not UI.
 * Renders nothing until candle data arrives.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { useMorbiusChart } from '@/hooks/use-morbius-chart';

const VW = 100;
const VH = 40;

export function PriceChartBg() {
  const { data } = useMorbiusChart();
  const rawId = useId();
  const uid = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ''), [rawId]);

  /* draw-in: stroke starts fully dashed-out, transitions to 0 after mount */
  const [drawn, setDrawn] = useState(false);
  const hasData = !!data && data.length >= 2;
  useEffect(() => {
    if (!hasData) return;
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [hasData]);

  const chart = useMemo(() => {
    if (!data || data.length < 2) return null;
    const closes = data.map((d) => d.c);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const up = last >= first;
    const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;

    /* min-max normalize with 10% vertical padding */
    let min = Math.min(...closes);
    let max = Math.max(...closes);
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
    min -= pad;
    max += pad;
    const span = max - min || 1;
    const pts: Array<[number, number]> = closes.map((c, i) => [
      +((i / (closes.length - 1)) * VW).toFixed(2),
      +((VH - ((c - min) / span) * VH)).toFixed(2),
    ]);

    /* smooth path — quadratic curves through segment midpoints */
    let line = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = +((pts[i][0] + pts[i + 1][0]) / 2).toFixed(2);
      const yc = +((pts[i][1] + pts[i + 1][1]) / 2).toFixed(2);
      line += ` Q ${pts[i][0]} ${pts[i][1]} ${xc} ${yc}`;
    }
    const lastPt = pts[pts.length - 1];
    line += ` L ${lastPt[0]} ${lastPt[1]}`;
    const area = `${line} L ${VW} ${VH} L 0 ${VH} Z`;

    return { line, area, up, pctChange };
  }, [data]);

  if (!chart) return null;

  const color = chart.up ? '#34d399' : '#fb7185';
  const gradId = `h2pcg-grad-${uid}`;
  const glowId = `h2pcg-glow-${uid}`;

  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.16, display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor={color} floodOpacity="0.9" />
          </filter>
        </defs>
        <path d={chart.area} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={chart.line}
          fill="none"
          stroke={color}
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: drawn ? 0 : 1,
            transition: 'stroke-dashoffset 1.8s ease-out',
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          right: 10,
          bottom: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          opacity: 0.5,
          color: '#94a3b8',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        MORBIUS · 90D{' '}
        <span style={{ color }}>
          {chart.pctChange >= 0 ? '+' : ''}
          {chart.pctChange.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
