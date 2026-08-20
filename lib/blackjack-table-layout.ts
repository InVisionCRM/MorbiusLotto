/**
 * Blackjack table layout — the presentation contract for a table.
 *
 * Everything here describes how a table *looks*: where seats sit, how cards are
 * sized and stacked, how they fly in and get collected. Nothing here touches
 * game logic. Card values, shuffling, payouts and turn order are decided by the
 * server and are deliberately not expressible in this shape, so a custom table
 * theme can never change the outcome of a hand — only its presentation.
 *
 * `DEFAULT_BLACKJACK_TABLE_LAYOUT` holds the exact values the table shipped
 * with, so rendering through this config produces the same pixels as the
 * hardcoded constants it replaced.
 */

/** Card render sizes, in CSS px. */
export type CardSizeName = 'large' | 'medium' | 'normal' | 'small';

export interface CardSize {
  w: number;
  h: number;
}

export interface SeatPlacement {
  /** Horizontal centre of the seat, in canvas px. */
  cx: number;
  /**
   * Y of the name tag's bottom edge, in canvas px, measured from the top of
   * the canvas (same axis as CSS `top`).
   */
  floorY: number;
  /** Rotation of the seat column in degrees; positive is clockwise. The name
   *  tag counter-rotates by the same amount so text stays upright. */
  angle: number;
}

/** A card flying in from the shoe. Offsets are in CSS px from its resting spot. */
export interface DealInMotion {
  fromX: number;
  fromY: number;
  /** Rotation at the start of the flight, in degrees. 0 = flat slide. */
  fromRot: number;
  /** Scale at the start of the flight. 1 = full size the whole way. */
  fromScale: number;
  durationMs: number;
  easing: string;
  /** Extra delay per card index, in ms, so a hand deals out in sequence. */
  staggerMs: number;
}

/** Cards being collected at the end of a round. */
export interface ClearOutMotion {
  toX: number;
  toY: number;
  scale: number;
  durationMs: number;
  easing: string;
  /** Per-card-index delay, in ms. Dealer and player can stagger independently. */
  dealerStaggerMs: number;
  playerStaggerMs: number;
}

/** How far cards overlap when stacked, in CSS px. Negative pulls them together. */
export interface CardOverlap {
  dealer: number;
  player: number;
}

export interface BlackjackTableLayout {
  /**
   * Logical drawing surface. Seat coordinates are expressed in this space and
   * scale with the rendered table, so a layout stays correct at any size.
   */
  canvas: { width: number; height: number };

  /**
   * The table's artwork — the image the whole board is built around. Drawn
   * cover-fitted across the full canvas, exactly like the live table draws its
   * branded backgrounds. An empty string means "use the table's configured
   * branded background" (the pre-theme behaviour).
   */
  table: {
    image: string;
  };

  /** One entry per seat, left to right. */
  seats: SeatPlacement[];

  /** Where the dealer's hand sits on the canvas. */
  dealer: {
    /** Horizontal centre of the dealer's hand, in canvas px. */
    cx: number;
    /** Top edge of the dealer's hand, in canvas px. */
    top: number;
  };

  emotes: {
    /** How far above the seat's floorY an emote bubble pops, in canvas px. */
    raise: number;
    /** Extra height of the arc when an emote flies between two seats. */
    arcApex: number;
  };

  cards: {
    sizes: Record<CardSizeName, CardSize>;
    /** Card size used on viewports at or below `mobileBreakpointPx`. */
    mobileSize: CardSize;
    mobileBreakpointPx: number;
    overlap: CardOverlap;
    mobileOverlap: CardOverlap;
    /**
     * 3D lean of each hand, in degrees; 0 = flat against the screen. Table art
     * is often drawn in perspective rather than straight top-down, so tilting
     * the card stacks to match keeps them looking like they lie ON the table.
     */
    pitch: { dealer: number; player: number };
    restShadow: string;
    hoverShadow: string;
    /**
     * Mark centred on a face-down card. Sized to sit inside the back's
     * border rather than being stretched over the whole card — the table's
     * logo is a badge on the back, not the back itself.
     */
    backImage: string;
    /**
     * Which patterned field the mark sits on; an id from TABLE_CARD_BACKS.
     * Unknown or missing ids fall back to that module's default.
     */
    backDesign?: string;
    /** Directory holding the card face PNGs, named like `AS.png`, `10H.png`. */
    faceDir: string;
    /** Corner rounding, as a CSS length. */
    radius: string;
    mobileRadius: string;
  };

  motion: {
    dealIn: DealInMotion;
    clearOut: ClearOutMotion;
  };
}

export const DEFAULT_BLACKJACK_TABLE_LAYOUT: BlackjackTableLayout = {
  canvas: { width: 800, height: 450 },

  table: { image: '' },

  seats: [
    { cx: 140, floorY: 415, angle: 18 },
    // Nudged lower than its neighbours so the centre seat reads as closer.
    { cx: 400, floorY: 428, angle: 0 },
    { cx: 660, floorY: 415, angle: -18 },
  ],

  dealer: { cx: 400, top: 50 },

  emotes: {
    raise: 175,
    arcApex: 70,
  },

  cards: {
    sizes: {
      large: { w: 112, h: 160 },
      medium: { w: 108, h: 152 },
      normal: { w: 80, h: 112 },
      small: { w: 56, h: 80 },
    },
    mobileSize: { w: 56, h: 80 },
    mobileBreakpointPx: 640,
    overlap: { dealer: -15, player: -25 },
    mobileOverlap: { dealer: -12, player: -18 },
    pitch: { dealer: 0, player: 0 },
    restShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    hoverShadow: '0 6px 12px rgba(0, 0, 0, 0.4)',
    backImage: '/Pulse Branding/Logo/ball.png',
    backDesign: 'lattice',
    faceDir: '/BlackJack/Cards/PNG',
    radius: '0.5rem',
    mobileRadius: '0.125rem',
  },

  motion: {
    dealIn: {
      fromX: 100,
      fromY: -80,
      fromRot: 0,
      fromScale: 1,
      durationMs: 600,
      easing: 'ease-out',
      staggerMs: 250,
    },
    clearOut: {
      toX: -80,
      toY: -120,
      scale: 0.6,
      durationMs: 450,
      easing: 'ease-in',
      dealerStaggerMs: 120,
      playerStaggerMs: 120,
    },
  },
};

/**
 * Flattens a layout into the CSS custom properties consumed by
 * `blackjack-cards.css`.
 *
 * Card stacking and deal animations stay in a real stylesheet rather than
 * inline styles: they need media queries and keyframes, and keeping them in CSS
 * means the browser animates them off the main thread. Routing the numbers
 * through custom properties keeps them editable without giving that up.
 */
export function layoutToCssVars(layout: BlackjackTableLayout): Record<string, string> {
  const { cards, motion } = layout;
  return {
    '--bj-card-overlap-dealer': `${cards.overlap.dealer}px`,
    '--bj-card-overlap-player': `${cards.overlap.player}px`,
    '--bj-card-overlap-dealer-mobile': `${cards.mobileOverlap.dealer}px`,
    '--bj-card-overlap-player-mobile': `${cards.mobileOverlap.player}px`,

    '--bj-card-pitch-dealer': `${cards.pitch.dealer}deg`,
    '--bj-card-pitch-player': `${cards.pitch.player}deg`,

    '--bj-card-mobile-w': `${cards.mobileSize.w}px`,
    '--bj-card-mobile-h': `${cards.mobileSize.h}px`,
    '--bj-card-radius': cards.radius,
    '--bj-card-radius-mobile': cards.mobileRadius,
    '--bj-card-shadow': cards.restShadow,
    '--bj-card-shadow-hover': cards.hoverShadow,

    '--bj-deal-from-x': `${motion.dealIn.fromX}px`,
    '--bj-deal-from-y': `${motion.dealIn.fromY}px`,
    '--bj-deal-from-rot': `${motion.dealIn.fromRot}deg`,
    '--bj-deal-from-scale': String(motion.dealIn.fromScale),
    '--bj-deal-duration': `${motion.dealIn.durationMs}ms`,
    '--bj-deal-easing': motion.dealIn.easing,

    '--bj-clear-to-x': `${motion.clearOut.toX}px`,
    '--bj-clear-to-y': `${motion.clearOut.toY}px`,
    '--bj-clear-scale': String(motion.clearOut.scale),
    '--bj-clear-duration': `${motion.clearOut.durationMs}ms`,
    '--bj-clear-easing': motion.clearOut.easing,
  };
}

/** Builds the image path for a card face, e.g. `AS` → `/BlackJack/Cards/PNG/AS.png`. */
export function cardFacePath(layout: BlackjackTableLayout, faceCode: string): string {
  return `${layout.cards.faceDir}/${faceCode}.png`;
}

/**
 * Deep-merges a partial override onto a base layout. Table themes only need to
 * carry what they change, so a saved theme stays small and picks up any later
 * changes to the defaults it did not override.
 */
export function mergeTableLayout(
  base: BlackjackTableLayout,
  override?: DeepPartial<BlackjackTableLayout> | null
): BlackjackTableLayout {
  if (!override) return base;
  return {
    canvas: { ...base.canvas, ...override.canvas },
    table: { ...base.table, ...override.table },
    seats: (override.seats as SeatPlacement[] | undefined) ?? base.seats,
    dealer: { ...base.dealer, ...override.dealer },
    emotes: { ...base.emotes, ...override.emotes },
    cards: {
      ...base.cards,
      ...override.cards,
      sizes: { ...base.cards.sizes, ...override.cards?.sizes } as Record<CardSizeName, CardSize>,
      mobileSize: { ...base.cards.mobileSize, ...override.cards?.mobileSize },
      overlap: { ...base.cards.overlap, ...override.cards?.overlap },
      mobileOverlap: { ...base.cards.mobileOverlap, ...override.cards?.mobileOverlap },
      pitch: { ...base.cards.pitch, ...override.cards?.pitch },
    },
    motion: {
      dealIn: { ...base.motion.dealIn, ...override.motion?.dealIn },
      clearOut: { ...base.motion.clearOut, ...override.motion?.clearOut },
    },
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
