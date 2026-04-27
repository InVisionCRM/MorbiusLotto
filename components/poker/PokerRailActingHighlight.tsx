'use client';

import React, { useMemo } from 'react';
import { getActingRingSectorPathD, POKER_RAIL_VIEWBOX, type RailSectorRadii } from '@/lib/poker-rail-acting-sector';

export interface PokerRailActingHighlightProps {
  /** 0..9 canonical ring index from `ringIndexForDisplaySlot`; null = hide */
  activeRingIndex: number | null;
  /** Shown only when a seat is to act and rail highlight should be visible */
  visible: boolean;
  /** Optional radii tune; defaults match the table shell in production */
  radii?: RailSectorRadii;
}

/**
 * Cyan **annulus** sector on the table rail, aligned with the 10 canonical `SEAT_ANCHOR_RING` stations.
 * Sits in the same box as the CSS rail (`3%` / `5%` / `94%` / `88%`); `pointer-events: none`.
 */
export function PokerRailActingHighlight({ activeRingIndex, visible, radii }: PokerRailActingHighlightProps) {
  const d = useMemo(
    () =>
      visible && activeRingIndex != null && activeRingIndex >= 0
        ? getActingRingSectorPathD(activeRingIndex, radii)
        : '',
    [activeRingIndex, visible, radii]
  );

  if (!d) return null;

  return (
    <svg
      className="absolute pointer-events-none"
      width="100%"
      height="100%"
      viewBox={`0 0 ${POKER_RAIL_VIEWBOX.w} ${POKER_RAIL_VIEWBOX.h}`}
      preserveAspectRatio="none"
      aria-hidden={true}
      style={{
        left: '3%',
        top: '5%',
        width: '94%',
        height: '88%',
        zIndex: 2,
        mixBlendMode: 'screen',
        filter: 'drop-shadow(0 0 4px rgba(34, 211, 238, 0.5))',
      }}
    >
      <path
        d={d}
        fill="rgba(34, 211, 238, 0.32)"
        stroke="rgba(34, 211, 238, 0.45)"
        strokeWidth={0.35}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
