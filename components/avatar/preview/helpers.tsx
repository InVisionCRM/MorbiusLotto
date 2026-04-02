import React from 'react';
import type { GradientDef } from '@/lib/gradient-utils';

export type HairRgb = { r: number; g: number; b: number };

export function parseHexRgb(hex: string): HairRgb | null {
  let s = hex.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixRgb(a: HairRgb, b: HairRgb, t: number): HairRgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function rgbaCss(c: HairRgb, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/** Mid-tone RGB for hair depth passes (solid hex or blend of gradient endpoints). */
export function hairShadeBaseRgb(hairColorRaw: string, gradientDef: GradientDef | null): HairRgb {
  if (gradientDef?.stops?.length) {
    const a = parseHexRgb(gradientDef.stops[0].color);
    const b = parseHexRgb(gradientDef.stops[gradientDef.stops.length - 1].color);
    if (a && b) return mixRgb(a, b, 0.5);
    if (a) return a;
    if (b) return b;
  }
  const c = parseHexRgb(hairColorRaw);
  return c ?? { r: 72, g: 52, b: 40 };
}

/** Split each lock rect into twin strands + part shadow — uses the 48x56 grid for real detail. */
export function hairTwinLocks(
  hairFill: string,
  locks: [number, number, number, number][],
  rxScale = 1,
  lockShadow = 'rgba(0,0,0,0.11)',
): React.ReactNode[] {
  return locks.map(([x, y, w, h], i) => {
    const lw = Math.max(0.82, w * 0.36);
    const gap = Math.max(0.16, w - 2 * lw);
    const inset = (w - 2 * lw - gap) / 2;
    const rxv = Math.min(1.12 * rxScale, lw * 0.5);
    const shH = Math.max(1.1, h * 0.33);
    const shY = y + Math.max(0.45, h * 0.06);
    return (
      <g key={i}>
        <rect x={x + inset} y={y} width={lw} height={h} rx={rxv} fill={hairFill} />
        <rect x={x + inset + lw + gap} y={y} width={lw} height={h} rx={rxv} fill={hairFill} />
        <rect x={x + inset + lw * 0.1} y={shY} width={0.42} height={shH} rx={0.1} fill={lockShadow} />
      </g>
    );
  });
}

/**
 * Sits at the neck base / top of torso (neck rect y=34-40, shirt starts y=40), not mid-neck.
 * Short L legs from the lower front corners into the cubic drape.
 */
export const NECKLACE_DRAPE = {
  /** Full stroke: corner -> drape -> corner */
  d: 'M 20 39.75 L 20.08 39.92 C 20.08 49.35 27.92 49.35 27.92 39.92 L 28 39.75',
  /** Cubic segment only (bead samples skip the tiny L legs). */
  p0: [20.08, 39.92],
  p1: [20.08, 49.35],
  p2: [27.92, 49.35],
  p3: [27.92, 39.92],
} as const;

export function sampleNecklaceDrape(t: number): [number, number] {
  const [x0, y0] = NECKLACE_DRAPE.p0;
  const [x1, y1] = NECKLACE_DRAPE.p1;
  const [x2, y2] = NECKLACE_DRAPE.p2;
  const [x3, y3] = NECKLACE_DRAPE.p3;
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

export const NECKLACE_CHAIN_TS = [0.06, 0.18, 0.32, 0.5, 0.68, 0.82, 0.94] as const;

/**
 * SVG `<image href>` needs a bare URL or path - not CSS `url("...")`.
 * Trims whitespace from stored profile JSON.
 */
export function normalizeAvatarRasterUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  if (/^url\s*\(/i.test(s) && s.endsWith(')')) {
    s = s.slice(s.indexOf('(') + 1, -1).trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
}
