/** Fraction coordinates 0–1 relative to the poker `PokerTable` root (`absolute inset-0` box). */
export type SeatAnchor = { fx: number; fy: number };

/** Full 10-seat ring — canonical layout; fewer seats sample via `authoredSeatAnchors`. */
export const SEAT_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.85 }, // 0 — bottom center (hero)
  { fx: 0.70, fy: 0.85 },
  { fx: 0.91, fy: 0.70 },
  { fx: 0.91, fy: 0.30 },
  { fx: 0.70, fy: 0.10 },
  { fx: 0.5, fy: 0.10 },
  { fx: 0.30, fy: 0.10 },
  { fx: 0.10, fy: 0.30 },
  { fx: 0.10, fy: 0.70 },
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
