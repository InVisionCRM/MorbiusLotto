/** Fraction coordinates 0–1 relative to the poker `PokerTable` root (`absolute inset-0` box). */
export type SeatAnchor = { fx: number; fy: number };

/** Canonical **10-max** ring (one vertex per seat at full tables). */
export const POKER_TABLE_MAX_SEATS = 10;

/**
 * Seat positions on the felt for all **10** vertices. With fewer players, `ringIndexForDisplaySlot` maps
 * each display slot to a subset of these indices so spacing stays even (edits to an unused vertex for
 * your current `seatCount` have no visible effect until you add seats toward 10).
 */
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

/** Map display slot → ring index `0..POKER_TABLE_MAX_SEATS-1`. At full **10** seats, slot === ring index. */
export function ringIndexForDisplaySlot(displaySlot: number, seatCount: number): number {
  if (seatCount <= 1) return 0;
  if (seatCount === POKER_TABLE_MAX_SEATS) return Math.max(0, Math.min(POKER_TABLE_MAX_SEATS - 1, displaySlot));
  const idx = Math.round((displaySlot * (POKER_TABLE_MAX_SEATS - 1)) / (seatCount - 1));
  return Math.max(0, Math.min(POKER_TABLE_MAX_SEATS - 1, idx));
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
 * Bet-stack anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats.
 * `PokerTable` uses `authoredChipAnchors` / `betChipAnchorForDisplaySlot` — not `SEAT_ANCHOR_RING`.
 */
export const CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.65 }, // 0 — bottom center (hero)
  { fx: 0.70, fy: 0.65 },
  { fx: 0.90, fy: 0.65 },
  { fx: 0.91, fy: 0.35 },
  { fx: 0.70, fy: 0.35 },
  { fx: 0.5, fy: 0.35 },
  { fx: 0.30, fy: 0.35 },
  { fx: 0.10, fy: 0.35 },
  { fx: 0.10, fy: 0.65 },
  { fx: 0.30, fy: 0.65 },
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
