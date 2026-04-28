'use client';

import React, { useMemo } from 'react';
import { getActingRingSectorPathD, POKER_RAIL_VIEWBOX, type RailSectorRadii } from '@/lib/poker-rail-acting-sector';

export interface PokerRailActingHighlightProps {
  /** 0..9 canonical ring index from `ringIndexForDisplaySlot`; null = hide */
  activeRingIndex: number | null;
  /** Shown only when a seat is to act and rail highlight should be visible */
  visible: boolean;
  /** Optional radii tune; defaults to cushion-band radii computed from `tableDims`. */
  radii?: RailSectorRadii;
  /**
   * Actual CSS pixel size of the PokerTable root (`dims.w`/`dims.h`). Used to
   * convert the rail-shell's pixel paddings (7/8/20/6) into viewBox units so
   * the highlighted annulus lands exactly on the cushion band at any size.
   */
  tableDims?: { w: number; h: number };
}

// Rail shell ring paddings in CSS pixels, mirroring `PokerTableRailShell` /
// `PokerTable`'s nested padding stack from box-edge inward.
const SHELL_PAD_PX = 7;
const OUTER_RING_PAD_PX = 8;
const CUSHION_PAD_PX = 20;
// Inset (px) from the shell box edge to each cushion edge.
const CUSHION_OUTER_INSET_PX = SHELL_PAD_PX + OUTER_RING_PAD_PX;             // 15
const CUSHION_INNER_INSET_PX = CUSHION_OUTER_INSET_PX + CUSHION_PAD_PX;      // 35

function computeRadiiFromDims(dims: { w: number; h: number }): RailSectorRadii {
  // SVG covers `94%` width × `88%` height of the table root and uses
  // `preserveAspectRatio="none"`, so 1 CSS px = `100/dims.w` viewBox-x and
  // `100/dims.h` viewBox-y. Box half-extent in viewBox units is 47 / 44.
  const safeW = Math.max(1, dims.w);
  const safeH = Math.max(1, dims.h);
  const vxPerPx = 100 / safeW;
  const vyPerPx = 100 / safeH;
  return {
    rxOuter: Math.max(1, POKER_RAIL_VIEWBOX.w / 2 - CUSHION_OUTER_INSET_PX * vxPerPx),
    ryOuter: Math.max(1, POKER_RAIL_VIEWBOX.h / 2 - CUSHION_OUTER_INSET_PX * vyPerPx),
    rxInner: Math.max(1, POKER_RAIL_VIEWBOX.w / 2 - CUSHION_INNER_INSET_PX * vxPerPx),
    ryInner: Math.max(1, POKER_RAIL_VIEWBOX.h / 2 - CUSHION_INNER_INSET_PX * vyPerPx),
  };
}

/**
 * Cyan **annulus** sector on the table rail, aligned with the 10 canonical `SEAT_ANCHOR_RING` stations.
 * Sits in the same box as the CSS rail (`3%` / `5%` / `94%` / `88%`); `pointer-events: none`.
 */
export function PokerRailActingHighlight({ activeRingIndex, visible, radii, tableDims }: PokerRailActingHighlightProps) {
  const effectiveRadii = useMemo<RailSectorRadii | undefined>(
    () => radii ?? (tableDims ? computeRadiiFromDims(tableDims) : undefined),
    [radii, tableDims?.w, tableDims?.h]
  );
  const d = useMemo(
    () =>
      visible && activeRingIndex != null && activeRingIndex >= 0
        ? getActingRingSectorPathD(activeRingIndex, effectiveRadii)
        : '',
    [activeRingIndex, visible, effectiveRadii]
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
