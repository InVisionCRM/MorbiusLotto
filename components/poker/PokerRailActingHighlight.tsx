'use client';

import React, { useMemo } from 'react';
import { SEAT_ANCHOR_RING, POKER_TABLE_MAX_SEATS } from '@/lib/poker-seat-layout';

export interface PokerRailActingHighlightProps {
  /** 0..9 canonical ring index from `ringIndexForDisplaySlot`; null = hide */
  activeRingIndex: number | null;
  /** Shown only when a seat is to act and rail highlight should be visible */
  visible: boolean;
}

// Pixel insets that mirror `PokerTableRailShell` / `PokerTable`'s rail stack
// (shell padding 7 + outer-trim 8 + cushion 20 + inner-trim 6). The cushion
// band sits between insets 15px (outer trim's inner edge) and 35px (inner
// trim's outer edge) from the shell box. We position our band element at
// 15px and use a 20px-thick `box-shadow inset` to paint exactly the cushion.
const CUSHION_OUTER_INSET_PX = 7 + 8;     // 15
const CUSHION_THICKNESS_PX = 20;

// Angular half-width of the highlighted wedge (degrees).
const WEDGE_HALF_DEG = 18;

/**
 * Cyan glow on the cushion ring of the table rail, restricted to a wedge
 * pointing at the acting seat. Built from a stadium-shaped (`borderRadius:
 * 9999px`) div with a thick inset `box-shadow` so it follows the rail at any
 * size — the rail itself is a CSS stadium, not an ellipse, so SVG ellipse
 * sectors will never match.
 *
 * The visible wedge is carved out via a `clip-path` polygon that fans from
 * table center toward the acting seat.
 */
export function PokerRailActingHighlight({ activeRingIndex, visible }: PokerRailActingHighlightProps) {
  const wedgeClipPath = useMemo(() => {
    if (!visible || activeRingIndex == null || activeRingIndex < 0) return null;
    if (activeRingIndex >= POKER_TABLE_MAX_SEATS) return null;
    const seat = SEAT_ANCHOR_RING[activeRingIndex];
    if (!seat) return null;

    // Seat anchors are fractions of the *table root* (0–1). The highlight
    // element overlays the rail-shell box (left:3% top:5% width:94% height:88%
    // of the root), so we remap into shell-local fractions before computing
    // the wedge angle.
    const seatLocalFx = (seat.fx - 0.03) / 0.94;
    const seatLocalFy = (seat.fy - 0.05) / 0.88;
    const cx = 0.5;
    const cy = 0.5;
    const ang = Math.atan2(seatLocalFy - cy, seatLocalFx - cx);
    const halfRad = (WEDGE_HALF_DEG * Math.PI) / 180;
    // Reach well beyond the box edge so the polygon definitely covers the
    // outermost edge of the cushion ring at any angle.
    const REACH = 2;
    const pa = { x: cx + Math.cos(ang - halfRad) * REACH, y: cy + Math.sin(ang - halfRad) * REACH };
    const pb = { x: cx + Math.cos(ang) * REACH,           y: cy + Math.sin(ang) * REACH };
    const pc = { x: cx + Math.cos(ang + halfRad) * REACH, y: cy + Math.sin(ang + halfRad) * REACH };
    const fmt = (v: number) => `${(v * 100).toFixed(2)}%`;
    return `polygon(${fmt(cx)} ${fmt(cy)}, ${fmt(pa.x)} ${fmt(pa.y)}, ${fmt(pb.x)} ${fmt(pb.y)}, ${fmt(pc.x)} ${fmt(pc.y)})`;
  }, [activeRingIndex, visible]);

  if (!wedgeClipPath) return null;

  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        // Match the rail-shell box exactly so we share its coordinate space.
        left: '3%',
        top: '5%',
        width: '94%',
        height: '88%',
        zIndex: 2,
        clipPath: wedgeClipPath,
        WebkitClipPath: wedgeClipPath,
      }}
    >
      {/* Cushion band: a stadium-shaped div whose only paint comes from a
          thick inset box-shadow. The shadow naturally follows the stadium's
          rounded edges, giving us a perfect cushion-ring sector. */}
      <div
        className="absolute"
        style={{
          inset: `${CUSHION_OUTER_INSET_PX}px`,
          borderRadius: 9999,
          background: 'transparent',
          // Inset shadow paints inward from the stadium edge by exactly the
          // cushion thickness (20px), filling only the cushion band region.
          boxShadow: `inset 0 0 0 ${CUSHION_THICKNESS_PX}px rgba(34, 211, 238, 0.45)`,
          // Soft glow on the outside of the band.
          filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.55))',
          mixBlendMode: 'screen',
          transition: 'opacity 180ms ease',
        }}
      />
    </div>
  );
}
