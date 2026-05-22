/**
 * video-poker.ts — Jacks or Better video poker rules.
 *
 * The 5-card hand strength itself is evaluated by the shared poker-hand-eval
 * `bestHand()`. This file only adds the video-poker layer on top: mapping an
 * evaluated hand to a video-poker category (Royal Flush, Jacks-or-Better, …),
 * the paytable, and applying the player's hold mask to a committed deck.
 *
 * Card indices are 0-51, the same encoding `bestHand()` uses:
 *   rank = (idx % 13) + 2   (2 = Two … 14 = Ace)
 *   suit = floor(idx / 13)  (0 = hearts, 1 = diamonds, 2 = clubs, 3 = spades)
 */

import { bestHand, HandRank, type RankedHand } from './poker-hand-eval';

export type VideoPokerCategory =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'jacks_or_better'
  | 'nothing';

/**
 * 9/6 Jacks or Better paytable — the payout MULTIPLE of the bet, "for 1":
 * the bet is taken at deal time, and `bet * multiplier` is the total returned
 * at draw. ~99.5% return at optimal play.
 *
 * HOUSE EDGE IS TUNED HERE. To raise the edge, lower these numbers — e.g.
 * full_house 9 -> 7 and flush 6 -> 5 is the well-known higher-edge "7/5" table
 * (~96% return). Nothing else in the codebase needs to change.
 */
export const VIDEO_POKER_PAYTABLE: Record<VideoPokerCategory, number> = {
  royal_flush: 800,
  straight_flush: 50,
  four_of_a_kind: 25,
  full_house: 9,
  flush: 6,
  straight: 4,
  three_of_a_kind: 3,
  two_pair: 2,
  jacks_or_better: 1,
  nothing: 0,
};

/** Display names for each category, ordered high → low for paytable UIs. */
export const VIDEO_POKER_CATEGORY_NAME: Record<VideoPokerCategory, string> = {
  royal_flush: 'Royal Flush',
  straight_flush: 'Straight Flush',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_of_a_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  jacks_or_better: 'Jacks or Better',
  nothing: 'No Win',
};

/** Paying categories, highest first — handy for rendering a paytable. */
export const VIDEO_POKER_PAYING_ORDER: VideoPokerCategory[] = [
  'royal_flush',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
  'two_pair',
  'jacks_or_better',
];

/** Map an evaluated 5-card hand to its video-poker category. */
export function categorize(hand: RankedHand): VideoPokerCategory {
  switch (hand.rank) {
    case HandRank.StraightFlush:
      // values[0] is the straight's high card; 14 (Ten-to-Ace) means a royal.
      return hand.values[0] === 14 ? 'royal_flush' : 'straight_flush';
    case HandRank.Quads:
      return 'four_of_a_kind';
    case HandRank.FullHouse:
      return 'full_house';
    case HandRank.Flush:
      return 'flush';
    case HandRank.Straight:
      return 'straight';
    case HandRank.Trips:
      return 'three_of_a_kind';
    case HandRank.TwoPair:
      return 'two_pair';
    case HandRank.Pair:
      // Only a pair of Jacks (11) or better pays in Jacks or Better.
      return hand.values[0] >= 11 ? 'jacks_or_better' : 'nothing';
    default:
      return 'nothing';
  }
}

export interface VideoPokerResult {
  category: VideoPokerCategory;
  categoryName: string;
  /** Paytable multiple of the bet (0 for a losing hand). */
  multiplier: number;
  /** Total chips returned to the player: bet * multiplier (0 on a loss). */
  payout: number;
}

/**
 * Resolve a final 5-card video poker hand to a payout.
 * @param finalHand exactly 5 card indices (0-51)
 * @param bet the chip amount staked on the hand
 */
export function resolveVideoPokerHand(finalHand: number[], bet: number): VideoPokerResult {
  if (finalHand.length !== 5) {
    throw new Error('Video poker hand must be exactly 5 cards');
  }
  if (new Set(finalHand).size !== 5) {
    throw new Error('Video poker hand has duplicate cards');
  }
  const ranked = bestHand(finalHand);
  const category = categorize(ranked);
  const multiplier = VIDEO_POKER_PAYTABLE[category];
  return {
    category,
    categoryName: VIDEO_POKER_CATEGORY_NAME[category],
    multiplier,
    payout: Math.round(bet * multiplier),
  };
}

/**
 * Apply the player's hold mask to a committed, provably-fair shuffled deck.
 *
 * Positions 0-4 of the deck are the dealt hand; positions 5-9 are the draw
 * replacements, consumed in order for each discarded card. Because the whole
 * deck is fixed at deal time, the draw outcome is locked before the player
 * ever chooses what to hold — there is nothing to game.
 *
 * @param deck the full 52-card provably-fair deck (indices 0-51)
 * @param holds 5 booleans — true = keep the dealt card in that position
 */
export function applyHolds(deck: number[], holds: boolean[]): number[] {
  if (deck.length < 10) throw new Error('Deck too small for a video poker hand');
  if (holds.length !== 5) throw new Error('Holds must be exactly 5 booleans');
  const dealt = deck.slice(0, 5);
  let nextDraw = 5;
  return dealt.map((card, i) => (holds[i] ? card : deck[nextDraw++]!));
}
