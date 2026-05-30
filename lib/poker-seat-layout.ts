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
  { fx: 0.5492, fy: 0.8495 }, // 0 — hero
  { fx: 0.25, fy: 0.85 },
  { fx: 0.05, fy: 0.64 },
  { fx: 0.05, fy: 0.29 },
  { fx: 0.25, fy: 0.125 },
  { fx: 0.5, fy: 0.125 }, // 5 — top center
  { fx: 0.75, fy: 0.125 },
  { fx: 0.95, fy: 0.29 },
  { fx: 0.95, fy: 0.64 },
  { fx: 0.75, fy: 0.85 },
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
  { fx: 0.4666, fy: 0.9464 }, // 0 — hero
  { fx: 0.25, fy: 0.98 },
  { fx: 0.045, fy: 0.76 },
  { fx: 0.05, fy: 0.41 },
  { fx: 0.25, fy: 0.245 },
  { fx: 0.5, fy: 0.245 }, // 5 — top center
  { fx: 0.75, fy: 0.245 },
  { fx: 0.95, fy: 0.41 },
  { fx: 0.95, fy: 0.76 },
  { fx: 0.75, fy: 0.975 },
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
  { fx: 0.5, fy: 0.65 }, // 0 — hero
  { fx: 0.305, fy: 0.65 },
  { fx: 0.185, fy: 0.565 },
  { fx: 0.19, fy: 0.39 },
  { fx: 0.31, fy: 0.35 },
  { fx: 0.5, fy: 0.32 },
  { fx: 0.7, fy: 0.33 },
  { fx: 0.82, fy: 0.4 },
  { fx: 0.82, fy: 0.565 },
  { fx: 0.7, fy: 0.65 },
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
  { fx: 0.558, fy: 0.7037 }, // 0 — hero
  { fx: 0.2497, fy: 0.6903 },
  { fx: 0.0702, fy: 0.5265 },
  { fx: 0.1077, fy: 0.4044 },
  { fx: 0.2513, fy: 0.3125 },
  { fx: 0.445, fy: 0.235 },
  { fx: 0.7506, fy: 0.3166 },
  { fx: 0.8964, fy: 0.4082 },
  { fx: 0.912, fy: 0.5205 },
  { fx: 0.7479, fy: 0.6915 },
];

/**
 * Non-hero hole-card anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats / bet stacks.
 * Tweak these freely to place opponent cards wherever looks right relative to each seat.
 */
export const CARD_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.4669, fy: 0.83 }, // 0 — hero (wired: positions the hero hand via heroCardOffset)
  { fx: 0.3315, fy: 0.8655 },
  { fx: 0.13, fy: 0.6369 },
  { fx: 0.1336, fy: 0.2975 },
  { fx: 0.3356, fy: 0.1271 },
  { fx: 0.5876, fy: 0.127 }, // 5 — top center
  { fx: 0.829, fy: 0.127 },
  { fx: 0.8656, fy: 0.3039 },
  { fx: 0.8695, fy: 0.6394 },
  { fx: 0.6711, fy: 0.8562 },
];

/**
 * Showdown: where the animated main pot chip stack lands (fractions 0–1), **10** ring vertices.
 * Tweak each vertex independently to place the winning stack cleanly per seat, mapped like C#/S#.
 */
export const WINNING_POT_CHIP_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.525, fy: 0.72 }, // 0 — hero
  { fx: 0.27, fy: 0.725 },
  { fx: 0.135, fy: 0.73 },
  { fx: 0.09, fy: 0.45 },
  { fx: 0.235, fy: 0.31 },
  { fx: 0.45, fy: 0.2 }, // 5 — top center
  { fx: 0.75, fy: 0.32 },
  { fx: 0.905, fy: 0.475 },
  { fx: 0.885, fy: 0.57 },
  { fx: 0.745, fy: 0.715 },
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
