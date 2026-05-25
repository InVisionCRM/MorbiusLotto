/** Fraction coordinates 0–1 relative to the poker `PokerTable` root (`absolute inset-0` box). */
export type SeatAnchor = { fx: number; fy: number };
export type DealerButtonAnchor = SeatAnchor & { x: number };

/** Canonical **10-max** ring (one vertex per seat at full tables). */
export const POKER_TABLE_MAX_SEATS = 10;

/** Pot center (fractions) — keep in sync with `PokerTable` felt / `PokerBoard` region. */
export const POKER_POT_ANCHOR: SeatAnchor = { fx: 0.5, fy: 0.51 };

/**
 * Seat positions on the felt for all **10** vertices (avatar ring). With fewer players,
 * `ringIndexForDisplaySlot` maps each display slot to a subset of these indices so spacing stays even.
 */
export const SEAT_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.89 }, // 0 — bottom center (hero)
  { fx: 0.25, fy: 0.89 }, // 1 — hero's left (next to act, clockwise)
  { fx: 0.05, fy: 0.64 }, // 2 — S2
  { fx: 0.05, fy: 0.29 },
  { fx: 0.25, fy: 0.14 },
  { fx: 0.45, fy: 0.14 }, // 5 — top center
  { fx: 0.75, fy: 0.14 },
  { fx: 0.95, fy: 0.29 },
  { fx: 0.95, fy: 0.64 },
  { fx: 0.75, fy: 0.89 },
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
  { fx: 0.45, fy: 0.85 },  // 0 — bottom center (hero)
  { fx: 0.20, fy: 0.85 }, // 1 — S1
  { fx: 0.10, fy: 0.60 },
  { fx: 0.10, fy: 0.25 },
  { fx: 0.30, fy: 0.10 },
  { fx: 0.50, fy: 0.10 },  // 5 — top center
  { fx: 0.70, fy: 0.10 },
  { fx: 0.90, fy: 0.25 },
  { fx: 0.90, fy: 0.60 },
  { fx: 0.70, fy: 0.85 },
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

/**
 * Bet-stack anchors (**10** vertices) — tweak per seat independently (like {@link PLAYER_TAG_ANCHOR_RING}).
 * Initialized to match the former seat-co-located chip ring; change here without moving avatars.
 */
export const BET_CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.5, fy: 0.65 },
  { fx: 0.25, fy: 0.65 },
  { fx: 0.15, fy: 0.55 },
  { fx: 0.15, fy: 0.30 },
  { fx: 0.30, fy: 0.25 },
  { fx: 0.50, fy: 0.23 },
  { fx: 0.70, fy: 0.25 },
  { fx: 0.82, fy: 0.30 },
  { fx: 0.82, fy: 0.45 },
  { fx: 0.70, fy: 0.65 },
];

/** @deprecated Use {@link BET_CHIP_ANCHOR_RING}; kept for grep / external refs. */
export const CHIP_ANCHOR_RING: SeatAnchor[] = BET_CHIP_ANCHOR_RING;

/** Display-slot bet-chip anchors for `seatCount` (mirrors `authoredSeatAnchors`). */
export function authoredChipAnchors(seatCount: number): SeatAnchor[] {
  if (seatCount <= 0) return [];
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = BET_CHIP_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

export function betChipAnchorForDisplaySlot(seatCount: number, displaySlot: number): SeatAnchor {
  const chips = authoredChipAnchors(seatCount);
  return chips[displaySlot] ?? { ...POKER_POT_ANCHOR };
}

/**
 * Dealer-button disc anchors (**10** vertices) — per-seat authoring like {@link PLAYER_TAG_ANCHOR_RING}.
 * Values match the former seat→tag lerp at t=0.22 so existing tables do not jump.
 */
export const DEALER_BUTTON_RING: SeatAnchor[] = [
  { fx: 0.40, fy: 0.80 },
  { fx: 0.28, fy: 0.75 },
  { fx: 0.17, fy: 0.50 },
  { fx: 0.17, fy: 0.35 },
  { fx: 0.25, fy: 0.20 },
  { fx: 0.45, fy: 0.20 },
  { fx: 0.65, fy: 0.20 },
  { fx: 0.83, fy: 0.25 },
  { fx: 0.83, fy: 0.60 },
  { fx: 0.78, fy: 0.75 },
];

/**
 * Non-hero hole-card anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats / bet stacks.
 * Tweak these freely to place opponent cards wherever looks right relative to each seat.
 */
export const CARD_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.50, fy: 0.80 },  // 0 — hero (unused for opponent cards; hero's cards live on avatar)
  { fx: 0.18, fy: 0.81 }, // 1 — S1
  { fx: 0.11, fy: 0.55 },
  { fx: 0.11, fy: 0.20 },
  { fx: 0.31, fy: 0.06 },
  { fx: 0.51, fy: 0.06 },  // 5 — top center
  { fx: 0.68, fy: 0.06 },
  { fx: 0.87, fy: 0.20 },
  { fx: 0.87, fy: 0.55 },
  { fx: 0.68, fy: 0.80 },
];

/**
 * Showdown: where the animated main pot chip stack lands (fractions 0–1), **10** ring vertices.
 * Tweak each vertex independently to place the winning stack cleanly per seat, mapped like C#/S#.
 */
export const WINNING_POT_CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.43, fy: 0.80 },
  { fx: 0.28, fy: 0.75 },
  { fx: 0.17, fy: 0.50 },
  { fx: 0.17, fy: 0.35 },
  { fx: 0.25, fy: 0.20 },
  { fx: 0.45, fy: 0.20 },
  { fx: 0.65, fy: 0.20 },
  { fx: 0.83, fy: 0.25 },
  { fx: 0.83, fy: 0.60 },
  { fx: 0.78, fy: 0.75 },
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
 * Dealer-button anchors (**10** vertices). `x` duplicates `fx` for legacy {@link DealerButtonAnchor} shape.
 */
export const DEALER_BUTTON_ANCHOR_RING: DealerButtonAnchor[] = DEALER_BUTTON_RING.map((a) => ({
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
