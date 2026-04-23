/** Fraction coordinates 0–1 relative to the poker `PokerTable` root (`absolute inset-0` box). */
export type SeatAnchor = { fx: number; fy: number };

/** Full 10-seat ring — canonical layout; fewer seats sample via `authoredSeatAnchors`. */
export const SEAT_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.85 }, // 0 — bottom center (hero)
  { fx: 0.70, fy: 0.85 },
  { fx: 0.90, fy: 0.65 },
  { fx: 0.91, fy: 0.35 },
  { fx: 0.70, fy: 0.15 },
  { fx: 0.5, fy: 0.15 },
  { fx: 0.30, fy: 0.15 },
  { fx: 0.10, fy: 0.35 },
  { fx: 0.10, fy: 0.65 },
  { fx: 0.30, fy: 0.85 },
];

/** Map display slot → ring index 0..9. Identity when seatCount === 10 (full ring). */
export function ringIndexForDisplaySlot(displaySlot: number, seatCount: number): number {
  if (seatCount <= 1) return 0;
  if (seatCount === 10) return Math.max(0, Math.min(9, displaySlot));
  const idx = Math.round((displaySlot * 9) / (seatCount - 1));
  return Math.max(0, Math.min(9, idx));
}

/** Display-slot anchors for `seatCount` players (same logic as `PokerTable`). */
export function authoredSeatAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = SEAT_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

/** Pot center (fractions) — keep in sync with `PokerTable` felt / `PokerBoard` region. */
export const POKER_POT_ANCHOR: SeatAnchor = { fx: 0.5, fy: 0.51 };

/**
 * Full 10 bet-stack anchors (canonical ring). Same display-slot → ring index mapping as
 * `SEAT_ANCHOR_RING` via `ringIndexForDisplaySlot` / `authoredChipAnchors`.
 * Initial values matched the former seat→pot lerp at t=0.38 so existing tables did not jump;
 * edit these coordinates directly to tune stack placement.
 */
export const CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.65 }, // 0 — bottom center (hero)
  { fx: 0.65, fy: 0.65 },
  { fx: 0.70, fy: 0.55 },
  { fx: 0.70, fy: 0.45 },
  { fx: 0.65, fy: 0.35 },
  { fx: 0.5, fy: 0.35 },
  { fx: 0.35, fy: 0.35 },
  { fx: 0.30, fy: 0.45 },
  { fx: 0.30, fy: 0.55 },
  { fx: 0.35, fy: 0.65 },
];

/** Display-slot chip anchors for `seatCount` (mirrors `authoredSeatAnchors`). */
export function authoredChipAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = CHIP_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function betChipAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const chips = authoredChipAnchors(seatCount);
  return chips[displaySlot] ?? { ...POKER_POT_ANCHOR };
}
