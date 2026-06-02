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
  { fx: 0.4704, fy: 0.1255 }, // 5 — top center
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

export type LayoutVariant = 'default' | 'portrait';

/**
 * Portrait (mobile, vertical-oval) seat anchors — authored PER seat count from the
 * `public/poker-mobile-lab.html` mockup (each count is hand-tuned, not derived from one ring).
 * Index 0 is the hero (bottom); 1..n-1 are opponents counter-clockwise from the hero.
 */
export const PORTRAIT_SEAT_ANCHORS: Record<number, SeatAnchor[]> = {
  2:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.5, fy: 0.12 } ],
  3:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.18, fy: 0.3 }, { fx: 0.82, fy: 0.3 } ],
  4:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.13, fy: 0.47 }, { fx: 0.5, fy: 0.13 }, { fx: 0.87, fy: 0.47 } ],
  5:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.14, fy: 0.58 }, { fx: 0.28, fy: 0.2 }, { fx: 0.72, fy: 0.2 }, { fx: 0.86, fy: 0.58 } ],
  6:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.16, fy: 0.549 }, { fx: 0.16, fy: 0.211 }, { fx: 0.5, fy: 0.107 }, { fx: 0.84, fy: 0.211 }, { fx: 0.84, fy: 0.549 } ],
  9:  [ { fx: 0.5, fy: 0.9 }, { fx: 0.192, fy: 0.704 }, { fx: 0.161, fy: 0.498 }, { fx: 0.192, fy: 0.296 }, { fx: 0.341, fy: 0.109 }, { fx: 0.659, fy: 0.109 }, { fx: 0.839, fy: 0.296 }, { fx: 0.873, fy: 0.498 }, { fx: 0.839, fy: 0.704 } ],
  10: [ { fx: 0.5, fy: 0.9 }, { fx: 0.186, fy: 0.751 }, { fx: 0.101, fy: 0.544 }, { fx: 0.101, fy: 0.339 }, { fx: 0.259, fy: 0.145 }, { fx: 0.5, fy: 0.1 }, { fx: 0.741, fy: 0.145 }, { fx: 0.87, fy: 0.339 }, { fx: 0.87, fy: 0.544 }, { fx: 0.814, fy: 0.751 } ],
};

/** Portrait seat anchors for any `seatCount` — exact authored table, else evenly sample the 10-max ring. */
function portraitSeatAnchors(seatCount: number): SeatAnchor[] {
  const exact = PORTRAIT_SEAT_ANCHORS[seatCount];
  if (exact) return exact.map((a) => ({ fx: a.fx, fy: a.fy }));
  const ring = PORTRAIT_SEAT_ANCHORS[POKER_TABLE_MAX_SEATS];
  return Array.from({ length: seatCount }, (_, slot) => {
    if (slot === 0) return { fx: ring[0].fx, fy: ring[0].fy };
    const ri = Math.max(1, Math.min(ring.length - 1, Math.round((slot * (ring.length - 1)) / (seatCount - 1))));
    return { fx: ring[ri].fx, fy: ring[ri].fy };
  });
}

/** Display-slot anchors for `seatCount` players (same logic as `PokerTable`). */
export function authoredSeatAnchors(seatCount: number, variant: LayoutVariant = 'default'): SeatAnchor[] {
  if (seatCount <= 0) return [];
  if (variant === 'portrait') return portraitSeatAnchors(seatCount);
  return Array.from({ length: seatCount }, (_, displaySlot) => {
    const ri = ringIndexForDisplaySlot(displaySlot, seatCount);
    const a = SEAT_ANCHOR_RING[ri];
    return { fx: a.fx, fy: a.fy };
  });
}

/**
 * In the portrait variant, the nameplate / bet chip / dealer button / cards are DERIVED from
 * each seat's (tunable) anchor + a directional offset — matching the mockup's relative model.
 * Tuning a seat in the editor moves everything attached to it. (Default variant keeps its own rings.)
 */
export type PortraitAnchorKind = 'tag' | 'bet' | 'card' | 'dealer' | 'winpot';

/** Pure: derive an attached element's anchor from a (possibly tuned) seat anchor. Shared by PokerTable + the editor. */
export function portraitDeriveAnchor(s: SeatAnchor, kind: PortraitAnchorKind): SeatAnchor {
  switch (kind) {
    case 'tag':    return { fx: s.fx, fy: Math.min(0.99, s.fy + 0.058) };          // nameplate just below avatar
    case 'bet':    return { fx: s.fx, fy: Math.max(0.01, s.fy - 0.05) };           // bet chip straddles top of avatar
    case 'card':   return { fx: s.fx, fy: s.fy };                                  // cards positioned relative in PokerSeat
    case 'winpot': return { fx: s.fx + (0.5 - s.fx) * 0.18, fy: s.fy + (0.5 - s.fy) * 0.18 };
    case 'dealer': {                                                               // hug avatar on the INWARD side (toward center)
      const dx = 0.5 - s.fx, dy = 0.5 - s.fy, len = Math.hypot(dx, dy) || 1, d = 0.062;
      return { fx: s.fx + (dx / len) * d, fy: s.fy + (dy / len) * d };
    }
    default:       return { fx: s.fx, fy: s.fy };
  }
}

function portraitAnchorFor(seatCount: number, displaySlot: number, kind: PortraitAnchorKind): SeatAnchor {
  const seats = portraitSeatAnchors(seatCount);
  return portraitDeriveAnchor(seats[displaySlot] ?? POKER_POT_ANCHOR, kind);
}

/**
 * Player name/chip badge anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats.
 * Tweak these independently from avatar seats, cards, and chip stacks.
 */
export const PLAYER_TAG_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.549, fy: 0.9642 }, // 0 — hero
  { fx: 0.25, fy: 0.98 },
  { fx: 0.045, fy: 0.76 },
  { fx: 0.05, fy: 0.41 },
  { fx: 0.25, fy: 0.245 },
  { fx: 0.4691, fy: 0.2358 }, // 5 — top center
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

export function playerTagAnchorForDisplaySlot(seatCount: number, displaySlot: number, variant: LayoutVariant = 'default'): SeatAnchor {
  if (variant === 'portrait') return portraitAnchorFor(seatCount, displaySlot, 'tag');
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
  { fx: 0.4694, fy: 0.3088 },
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

export function betChipAnchorForDisplaySlot(seatCount: number, displaySlot: number, variant: LayoutVariant = 'default'): SeatAnchor {
  if (variant === 'portrait') return portraitAnchorFor(seatCount, displaySlot, 'bet');
  const chips = authoredChipAnchors(seatCount);
  return chips[displaySlot] ?? { ...POKER_POT_ANCHOR };
}

/**
 * Dealer-button disc anchors (**10** vertices) — per-seat authoring like {@link PLAYER_TAG_ANCHOR_RING}.
 * Values match the former seat→tag lerp at t=0.22 so existing tables do not jump.
 */
export const DEALER_BUTTON_RING: SeatAnchor[] = [
  { fx: 0.6006, fy: 0.7555 }, // 0 — hero
  { fx: 0.2117, fy: 0.7387 },
  { fx: 0.1244, fy: 0.5249 },
  { fx: 0.1077, fy: 0.4044 },
  { fx: 0.2521, fy: 0.3576 },
  { fx: 0.5317, fy: 0.2673 },
  { fx: 0.7517, fy: 0.3586 },
  { fx: 0.8493, fy: 0.4313 },
  { fx: 0.8522, fy: 0.5528 },
  { fx: 0.802, fy: 0.7542 },
];

/**
 * Non-hero hole-card anchors (**10** vertices). Same `ringIndexForDisplaySlot` mapping as seats / bet stacks.
 * Tweak these freely to place opponent cards wherever looks right relative to each seat.
 */
export const CARD_ANCHOR_RING: SeatAnchor[] = [
  { fx: 0.4649, fy: 0.8566 }, // 0 — hero (wired: positions the hero hand via heroCardOffset)
  { fx: 0.3315, fy: 0.8655 },
  { fx: 0.13, fy: 0.6369 },
  { fx: 0.1336, fy: 0.2975 },
  { fx: 0.3329, fy: 0.1106 },
  { fx: 0.5535, fy: 0.1099 }, // 5 — top center
  { fx: 0.6703, fy: 0.1081 },
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
  { fx: 0.1103, fy: 0.7356 },
  { fx: 0.1047, fy: 0.2181 },
  { fx: 0.2092, fy: 0.2131 },
  { fx: 0.4247, fy: 0.2051 }, // 5 — top center
  { fx: 0.8018, fy: 0.1981 },
  { fx: 0.9045, fy: 0.218 },
  { fx: 0.9084, fy: 0.5613 },
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

export function winningPotChipAnchorForDisplaySlot(seatCount: number, displaySlot: number, variant: LayoutVariant = 'default'): SeatAnchor {
  if (variant === 'portrait') return portraitAnchorFor(seatCount, displaySlot, 'winpot');
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

export function cardAnchorForDisplaySlot(seatCount: number, displaySlot: number, variant: LayoutVariant = 'default'): SeatAnchor {
  if (variant === 'portrait') return portraitAnchorFor(seatCount, displaySlot, 'card');
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

export function dealerButtonAnchorForDisplaySlot(seatCount: number, displaySlot: number, variant: LayoutVariant = 'default'): DealerButtonAnchor {
  if (variant === 'portrait') {
    const a = portraitAnchorFor(seatCount, displaySlot, 'dealer');
    return { x: a.fx, fx: a.fx, fy: a.fy };
  }
  const list = authoredDealerButtonAnchors(seatCount);
  return list[displaySlot] ?? { x: POKER_POT_ANCHOR.fx, ...POKER_POT_ANCHOR };
}
