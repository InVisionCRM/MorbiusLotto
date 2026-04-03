'use client';

import React from 'react';

// ── Chip image ──────────────────────────────────────────────────────────────
const MORBIUS_CHIP_SRC = '/morbius/MorbiusChip.png';

function getChipSrc(_amount: number): string {
  return MORBIUS_CHIP_SRC;
}

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
  /** Override chip image instead of using amount-based color */
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
 * Single poker-chip with a centered bet label.
 * Use this everywhere a bet amount needs to be shown on a chip.
 * The parent controls positioning; this component only controls its own size.
 */
export function BetChip({
  label,
  amount = 0,
  chipSrc,
  size = 48,
  className = '',
  style,
}: BetChipProps) {
  const src = chipSrc ?? getChipSrc(amount);
  const cssSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: cssSize,
        height: cssSize,
        flexShrink: 0,
        containerType: 'size',
        ...style,
      }}
    >
      { }
      <img
        src={src}
        alt=""
        aria-hidden
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: '30cqmin',
          fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
