'use client';

import React from 'react';

// ── Legacy chip image (blackjack opts into this via `chipSrc`) ───────────────
const MORBIUS_CHIP_SRC = '/morbius/MorbiusChip.png';

// ── Denomination color tiers (classic casino palette, gold-accented) ─────────
// Bet size is read at a glance from the chip color. Poker passes `amount` so
// each chip/stack is tinted by magnitude; the top face carries the number.
export interface ChipTier {
  /** chip body / face color */ c: string;
  /** edge-spot color */ e: string;
  /** label text color (contrasts the face) */ t: string;
}

const CHIP_TIERS: { max: number; tier: ChipTier }[] = [
  { max: 25,     tier: { c: '#eef2f7', e: '#9aa7b4', t: '#1f2937' } }, // white
  { max: 100,    tier: { c: '#ef4444', e: '#7f1d1d', t: '#ffffff' } }, // red
  { max: 500,    tier: { c: '#22c55e', e: '#14532d', t: '#ffffff' } }, // green
  { max: 2500,   tier: { c: '#3b82f6', e: '#1e3a8a', t: '#ffffff' } }, // blue
  { max: 10000,  tier: { c: '#1f2937', e: '#0b1220', t: '#fbbf24' } }, // black/gold
  { max: 100000, tier: { c: '#8b5cf6', e: '#4c1d95', t: '#ffffff' } }, // purple
];
const TOP_TIER: ChipTier = { c: '#f59e0b', e: '#92400e', t: '#231600' }; // gold

export function chipTier(amount: number): ChipTier {
  const a = Math.abs(amount);
  for (const { max, tier } of CHIP_TIERS) if (a <= max) return tier;
  return TOP_TIER;
}

// ── Hex color helpers (SSR-safe; avoids runtime `color-mix` support gaps) ─────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(hex: string, withHex: string, amt: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * amt);
  return `rgb(${ch(a.r, b.r)}, ${ch(a.g, b.g)}, ${ch(a.b, b.b)})`;
}
const lighten = (hex: string, amt: number) => mix(hex, '#ffffff', amt);
const darken = (hex: string, amt: number) => mix(hex, '#000000', amt);

/** Format a number to max 4 characters: 500, 1k, 23.4k, 1.5M, etc. */
export function formatChipLabel(n: number): string {
  if (n < 0) return formatChipLabel(-n);
  if (n < 10000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    // If it fits in 4 chars as whole number: "10k", "999k"
    if (k >= 100) return `${Math.floor(k)}k`;
    if (k >= 10) return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(2).replace(/0$/, '')}k`;
  }
  const m = n / 1_000_000;
  if (m >= 100) return `${Math.floor(m)}M`;
  if (m >= 10) return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  return Number.isInteger(m) ? `${m}M` : `${m.toFixed(2).replace(/0$/, '')}M`;
}

export interface BetChipProps {
  /** Display label (already formatted, e.g. "1,500" or "10K") */
  label: string;
  /** Numeric amount used to pick chip color (ether value, not wei). Falls back to blue chip if 0. */
  amount?: number;
  /** Explicit colour tier override — bypasses amount-based tiering (craps uses
   *  this for per-denomination chip colours). */
  tier?: ChipTier;
  /**
   * @deprecated Legacy image override. When set (blackjack tables), renders the
   * Morbius PNG instead of the CSS chip so their look/layout is untouched.
   * Poker passes nothing → the lightweight CSS chip.
   */
  chipSrc?: string;
  /**
   * Chip diameter. Pass a number for fixed px, or a string for responsive CSS
   * (e.g. "clamp(40px, 10vw, 80px)"). Default: 48.
   */
  size?: number | string;
  /** CSS class name forwarded to the outer wrapper (for positioning / animation) */
  className?: string;
  /** Inline style forwarded to the outer wrapper */
  style?: React.CSSProperties;
}

/**
 * Single poker chip with a centered bet label.
 *
 * CSS-rendered (no image weight): a denomination-tinted face ringed by edge
 * spots. The footprint is a `size`×`size` circle — identical to the legacy PNG,
 * so this is a drop-in everywhere it was used.
 *
 * The legacy 4.6MB Morbius PNG is only rendered when a caller explicitly passes
 * `chipSrc` (the blackjack tables), keeping those screens pixel-for-pixel the
 * same. Poker uses the CSS chip.
 */
export function BetChip({
  label,
  amount = 0,
  tier: tierProp,
  chipSrc,
  size = 48,
  className = '',
  style,
}: BetChipProps) {
  const cssSize = typeof size === 'number' ? `${size}px` : size;
  const labelFont = typeof size === 'number' ? Math.max(7, Math.min(12, Math.round(size * 0.24))) : 10;

  // Only the CSS chip when we have a real amount (or an explicit tier) and no
  // legacy override; this keeps every existing image caller (blackjack) on the
  // exact same PNG.
  const useCss = !chipSrc && (amount > 0 || tierProp != null);
  const tier = tierProp ?? chipTier(amount);

  const labelSpan = (
    <span
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: useCss ? tier.t : '#ffffff',
        fontSize: labelFont,
        fontWeight: 900,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        textShadow: useCss
          ? '0 1px 1px rgba(0,0,0,0.35)'
          : '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)',
        zIndex: 2,
      }}
    >
      {label}
    </span>
  );

  if (!useCss) {
    // Legacy image path (blackjack) — unchanged.
    return (
      <div
        className={className}
        style={{ position: 'relative', width: cssSize, height: cssSize, flexShrink: 0, ...style }}
      >
        <img
          src={chipSrc ?? MORBIUS_CHIP_SRC}
          alt=""
          aria-hidden
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />
        {labelSpan}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: cssSize,
        height: cssSize,
        flexShrink: 0,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
        ...style,
      }}
    >
      {/* Edge-spot rim: alternating wedges around the full circle */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `repeating-conic-gradient(${tier.e} 0deg 15deg, ${lighten(tier.e, 0.32)} 15deg 30deg)`,
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.12)',
        }}
      />
      {/* Center face — covers the rim's inner area, leaving spots only on the rim */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '19%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 36%, ${lighten(tier.c, 0.30)} 0%, ${tier.c} 56%, ${darken(tier.c, 0.30)} 100%)`,
          border: `1.5px dashed ${lighten(tier.c, 0.36)}`,
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.28), inset 0 -2px 4px rgba(0,0,0,0.3)',
        }}
      />
      {labelSpan}
    </div>
  );
}

/**
 * Side-view chip disc (a thin cylinder seen at a slight angle) — the atom for
 * stacked piles and the showdown chip burst. No label. `width` is the chip
 * diameter in px; the visual band height is ~a third of that, with the top
 * face floating just above so a column of these reads as a real stack.
 */
export function ChipDisc({
  amount = 0,
  width = 40,
  className,
  style,
}: {
  amount?: number;
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tier = chipTier(amount);
  const h = Math.round(width * 0.34);
  const stripe = Math.max(4, Math.round(width * 0.1));
  return (
    <div className={className} style={{ width, height: h, position: 'relative', ...style }}>
      {/* cylinder edge band with vertical edge spots */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `repeating-linear-gradient(90deg, ${tier.e} 0 ${stripe}px, ${lighten(tier.e, 0.34)} ${stripe}px ${stripe * 2}px)`,
          boxShadow:
            'inset 0 -3px 4px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.18), 0 1px 1px rgba(0,0,0,0.4)',
        }}
      />
      {/* top face */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '6%',
          right: '6%',
          top: -Math.round(h * 0.42),
          height: Math.round(h * 0.92),
          borderRadius: '50%',
          background: `radial-gradient(ellipse at 50% 34%, ${lighten(tier.c, 0.30)} 0%, ${tier.c} 55%, ${darken(tier.c, 0.32)} 100%)`,
          border: `1.5px dashed ${lighten(tier.c, 0.34)}`,
          boxShadow: '0 -2px 3px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.25)',
        }}
      />
    </div>
  );
}
