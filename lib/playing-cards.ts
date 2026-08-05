/**
 * playing-cards.ts — the shared 0..51 card encoding, for any felt game that
 * deals from `pf.fisherYatesShuffle`.
 *
 *   rank = (idx % 13) + 2   → 2..14, where 14 = Ace (HIGH)
 *   suit = floor(idx / 13)  → 0 = ♥, 1 = ♦, 2 = ♣, 3 = ♠
 *
 * This matches provably-fair.service.ts exactly, so a card index shown in the
 * UI is the same number the verify endpoint publishes.
 *
 * (Three Card Poker and Pai Gow ship their own copies of these helpers inside
 * their client modules, alongside 3-card evaluators that don't generalise.
 * New games use this one.)
 */

const RANK_LABEL: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: '10',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

const SUIT_GLYPH = ['♥', '♦', '♣', '♠'];

/**
 * The two card encodings in this repo, and why there are two.
 *
 * The poker family reads rank = (idx % 13) + 2, so index 0 is a Two and an Ace
 * is 14 — high, the way poker wants it. The blackjack family reads
 * rank = (idx % 13) + 1, so index 0 is an ACE. Both are legitimate readings of
 * the same uniformly shuffled deck and each game family is internally
 * consistent, but they disagree about what any given index *is* — so anything
 * that renders a card has to be told which reading applies, or it will happily
 * label an Ace as a Two.
 */
export type CardEncoding = 'poker' | 'blackjack';

/** Card index 0..51 → rank 2..14 (14 = Ace, high). Poker encoding. */
export function cardRank(cardIdx: number): number {
  return (cardIdx % 13) + 2;
}

/** Card index 0..51 → suit 0..3 (0=♥, 1=♦, 2=♣, 3=♠). */
export function cardSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** Card index 0..51 → display rank label (A, K, Q, J, 10, 9..2). */
export function cardRankLabel(cardIdx: number, encoding: CardEncoding = 'poker'): string {
  if (encoding === 'blackjack') {
    // 1 = Ace … 11/12/13 = J/Q/K, matching provably-fair.service.ts.
    const r = (cardIdx % 13) + 1;
    const BJ: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    return BJ[r] ?? String(r);
  }
  return RANK_LABEL[cardRank(cardIdx)] ?? '?';
}

/** Card index 0..51 → suit glyph. */
export function cardSuitGlyph(cardIdx: number): string {
  return SUIT_GLYPH[cardSuit(cardIdx)] ?? '?';
}

/** Is the card a red suit (hearts/diamonds)? */
export function cardIsRed(cardIdx: number): boolean {
  const s = cardSuit(cardIdx);
  return s === 0 || s === 1;
}

/** "A♠" — compact label for history rows and copy. */
export function cardLabel(cardIdx: number): string {
  return `${cardRankLabel(cardIdx)}${cardSuitGlyph(cardIdx)}`;
}

/**
 * Paytable categories shared by the house-banked poker games. The server sends
 * these exact strings, so the UI can key straight off them.
 */
export type PokerCategory =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'pair'
  | 'high_card';

export const POKER_CATEGORY_NAME: Record<PokerCategory, string> = {
  royal_flush: 'Royal Flush',
  straight_flush: 'Straight Flush',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_of_a_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  pair: 'Pair',
  high_card: 'High Card',
};

/** Friendly name for a category string the server sent (unknown → em dash). */
export function categoryName(cat: string | null | undefined): string {
  if (!cat) return '—';
  return POKER_CATEGORY_NAME[cat as PokerCategory] ?? cat;
}

/** "40:1" style label for a net-odds multiplier, handling the 3:2 case. */
export function oddsLabel(mult: number): string {
  if (mult === 0) return 'push';
  if (Number.isInteger(mult)) return `${mult}:1`;
  // The only fractional entry in play is 1.5 (a flush on the UTH Blind).
  const den = 2;
  return `${Math.round(mult * den)}:${den}`;
}
