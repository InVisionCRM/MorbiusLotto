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
  { fx: 0.5, fy: 0.85 },  // 0 — bottom center (hero)
  { fx: 0.30, fy: 0.85 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.10, fy: 0.70 },
  { fx: 0.10, fy: 0.30 },
  { fx: 0.30, fy: 0.15 },
  { fx: 0.5, fy: 0.15 },  // 5 — top center
  { fx: 0.70, fy: 0.15 },
  { fx: 0.91, fy: 0.30 },
  { fx: 0.90, fy: 0.70 },
  { fx: 0.70, fy: 0.85 },
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
  { fx: 0.5, fy: 0.65 },  // 0 — bottom center (hero)
  { fx: 0.35, fy: 0.65 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.20, fy: 0.60 },
  { fx: 0.20, fy: 0.40 },
  { fx: 0.35, fy: 0.35 },
  { fx: 0.5, fy: 0.35 },  // 5 — top center
  { fx: 0.70, fy: 0.35 },
  { fx: 0.80, fy: 0.40 },
  { fx: 0.80, fy: 0.60 },
  { fx: 0.70, fy: 0.65 },
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

/**
 * Non-hero hole-card anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats/chips.
 * Tweak these freely to place opponent cards wherever looks right relative to each seat.
 */
export const CARD_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.75 },  // 0 — hero (unused for opponent cards; hero's cards live on avatar)
  { fx: 0.30, fy: 0.70 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.10, fy: 0.56 },
  { fx: 0.10, fy: 0.17 },
  { fx: 0.30, fy: 0.03 },
  { fx: 0.5, fy: 0.03 },  // 5 — top center
  { fx: 0.70, fy: 0.03 },
  { fx: 0.91, fy: 0.17 },
  { fx: 0.91, fy: 0.56 },
  { fx: 0.70, fy: 0.70 },
];

/**
 * Showdown: where the animated main pot chip stack lands (fractions 0–1), **10** ring vertices.
 * Blended from seat → hole-card anchor so stacks sit between avatar and cards; tune per vertex in
 * `WINNING_POT_CHIP_ANCHOR_RING` or adjust `WINNING_POT_CHIP_SEAT_TO_CARD_T`. Mapped like C#/S#.
 */
export const WINNING_POT_CHIP_SEAT_TO_CARD_T = 0.48;

export const WINNING_POT_CHIP_ANCHOR_RING: SeatAnchor[] = SEAT_ANCHOR_RING.map((seat, i) => {
  const card = CARD_ANCHOR_RING[i];
  const t = WINNING_POT_CHIP_SEAT_TO_CARD_T;
  return {
    fx: seat.fx + (card.fx - seat.fx) * t,
    fy: seat.fy + (card.fy - seat.fy) * t,
  };
});

/** Display-slot anchors for winning pot chips (hero-centered), mirroring `authoredChipAnchors`. */
export function authoredWinningPotChipAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = WINNING_POT_CHIP_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function winningPotChipAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const list = authoredWinningPotChipAnchors(seatCount);
  return list[displaySlot] ?? { ...POKER_POT_ANCHOR };
}

export function authoredCardAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = CARD_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function cardAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const cards = authoredCardAnchors(seatCount);
  return cards[displaySlot] ?? { ...POKER_POT_ANCHOR };
}
