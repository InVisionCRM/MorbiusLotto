/** Fraction coordinates 0–1 relative to the poker `PokerTable` root (`absolute inset-0` box). */
export type SeatAnchor = { fx: number; fy: number };
export type DealerButtonAnchor = SeatAnchor & { x: number };

/** Canonical **10-max** ring (one vertex per seat at full tables). */
export const POKER_TABLE_MAX_SEATS = 10;

/**
 * Seat positions on the felt for all **10** vertices — same fractions as {@link CHIP_ANCHOR_RING}
 * (one anchor per seat on the inner ring). With fewer players, `ringIndexForDisplaySlot` maps each
 * display slot to a subset of these indices so spacing stays even.
 */
export const SEAT_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.85 }, // 0 — bottom center (hero)
  { fx: 0.33, fy: 0.85 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.10, fy: 0.65 }, // 2 — S2
  { fx: 0.10, fy: 0.30 },
  { fx: 0.33, fy: 0.15 },
  { fx: 0.50, fy: 0.15 }, // 5 — top center
  { fx: 0.67, fy: 0.15 },
  { fx: 0.95, fy: 0.30 },
  { fx: 0.95, fy: 0.65 },
  { fx: 0.67, fy: 0.85 },
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

/**
 * Player name/chip badge anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats.
 * Tweak these independently from avatar seats, cards, and chip stacks.
 */
export const PLAYER_TAG_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.43, fy: 0.83 },  // 0 — bottom center (hero)
  { fx: 0.23, fy: 0.82 }, // 1 — S1
  { fx: 0.14, fy: 0.65 },
  { fx: 0.14, fy: 0.30 },
  { fx: 0.22, fy: 0.02 },
  { fx: 0.43, fy: 0.02 },  // 5 — top center
  { fx: 0.68, fy: 0.02 },
  { fx: 0.90, fy: 0.30 },
  { fx: 0.90, fy: 0.65 },
  { fx: 0.58, fy: 0.82 },
];

/** Display-slot player tag anchors for `seatCount` (mirrors `authoredSeatAnchors`). */
export function authoredPlayerTagAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = PLAYER_TAG_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function playerTagAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const tags = authoredPlayerTagAnchors(seatCount);
  return tags[displaySlot] ?? { ...POKER_POT_ANCHOR };
}

/** Pot center (fractions) — keep in sync with `PokerTable` felt / `PokerBoard` region. */
export const POKER_POT_ANCHOR: SeatAnchor = { fx: 0.5, fy: 0.51 };

/**
 * Bet-stack anchors (**10** vertices). Same coordinates as {@link SEAT_ANCHOR_RING}; same
 * `ringIndexForDisplaySlot` mapping. `PokerTable` uses `authoredChipAnchors` / `betChipAnchorForDisplaySlot`.
 */
export const CHIP_ANCHOR_RING: SeatAnchor[] = SEAT_ANCHOR_RING;

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
 * 0 = {@link POKER_POT_ANCHOR}, 1 = {@link SEAT_ANCHOR_RING} vertex. Radial from pot → seat so the
 * dealer disc tracks the oval (no single global x/y nudge that fails on left vs right).
 */
export const DEALER_BUTTON_POT_TO_SEAT_T = 0.88;

/**
 * Dealer-chip anchors (**10** vertices): between pot and each seat along the same line — distinct
 * from {@link CHIP_ANCHOR_RING} (stacks) and consistent around the full ring.
 */
export const DEALER_CHIP_ANCHOR_RING: SeatAnchor[] = SEAT_ANCHOR_RING.map((seat) => {
  const t = DEALER_BUTTON_POT_TO_SEAT_T;
  const p = POKER_POT_ANCHOR;
  return {
    fx: p.fx + (seat.fx - p.fx) * t,
    fy: p.fy + (seat.fy - p.fy) * t,
  };
});

/** Display-slot dealer-chip anchors for `seatCount` (mirrors `authoredChipAnchors`). */
export function authoredDealerChipAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = DEALER_CHIP_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function dealerChipAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const list = authoredDealerChipAnchors(seatCount);
  return list[displaySlot] ?? { ...POKER_POT_ANCHOR };
}

/**
 * Non-hero hole-card anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats/chips.
 * Tweak these freely to place opponent cards wherever looks right relative to each seat.
 */
export const CARD_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.50, fy: 0.80 },  // 0 — hero (unused for opponent cards; hero's cards live on avatar)
  { fx: 0.23, fy: 0.80 }, // 1 — S1
  { fx: 0.19, fy: 0.60 },
  { fx: 0.19, fy: 0.25 },
  { fx: 0.22, fy: 0.02 },
  { fx: 0.50, fy: 0.02 },  // 5 — top center
  { fx: 0.68, fy: 0.02 },
  { fx: 0.87, fy: 0.25 },
  { fx: 0.87, fy: 0.60 },
  { fx: 0.68, fy: 0.80 },
];

/**
 * Showdown: where the animated main pot chip stack lands (fractions 0–1), **10** ring vertices.
 * Tweak each vertex independently to place the winning stack cleanly per seat, mapped like C#/S#.
 */
export const WINNING_POT_CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.59, fy: 0.80 }, // 0 — bottom center (hero)
  { fx: 0.39, fy: 0.80 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.32, fy: 0.63 },
  { fx: 0.27, fy: 0.24 },
  { fx: 0.43, fy: 0.18 },
  { fx: 0.54, fy: 0.18 }, // 5 — top center
  { fx: 0.79, fy: 0.18 },
  { fx: 0.80, fy: 0.24 },
  { fx: 0.80, fy: 0.63 },
  { fx: 0.79, fy: 0.80 },
];

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

/**
 * Dealer-button anchors: same fractional positions as {@link DEALER_CHIP_ANCHOR_RING}.
 * `x` duplicates `fx` for legacy {@link DealerButtonAnchor} shape.
 */
export const DEALER_BUTTON_ANCHOR_RING: DealerButtonAnchor[] = DEALER_CHIP_ANCHOR_RING.map((a) => ({
  x: a.fx,
  fx: a.fx,
  fy: a.fy,
}));

export function authoredDealerButtonAnchors(seatCount: number): DealerButtonAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = DEALER_BUTTON_ANCHOR_RING[ri];
    return { x: a.x, fx: a.fx, fy: a.fy };
  });
}

export function dealerButtonAnchorForDisplaySlot(seatCount: number, displaySlot: number): DealerButtonAnchor {
  const list = authoredDealerButtonAnchors(seatCount);
  return list[displaySlot] ?? { x: POKER_POT_ANCHOR.fx, ...POKER_POT_ANCHOR };
}
