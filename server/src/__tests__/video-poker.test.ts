/**
 * Unit tests for the video poker rules (server/src/services/video-poker.ts).
 * Money depends on this logic, so every paytable category and the draw
 * (hold-mask) logic are covered.
 */

import {
  resolveVideoPokerHand,
  applyHolds,
  VIDEO_POKER_PAYTABLE,
} from '../services/video-poker';

const H = 0;
const D = 1;
const C = 2;
const S = 3;

/** Build a card index (0-51) from a rank (2-14) and suit (0-3). */
function card(rank: number, suit: number): number {
  return suit * 13 + (rank - 2);
}

describe('resolveVideoPokerHand — categories', () => {
  it('royal flush', () => {
    const hand = [card(10, H), card(11, H), card(12, H), card(13, H), card(14, H)];
    const r = resolveVideoPokerHand(hand, 100);
    expect(r.category).toBe('royal_flush');
    expect(r.multiplier).toBe(800);
  });

  it('straight flush (king-high)', () => {
    const hand = [card(9, H), card(10, H), card(11, H), card(12, H), card(13, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('straight_flush');
  });

  it('straight flush (ace-low wheel) is not a royal', () => {
    const hand = [card(14, H), card(2, H), card(3, H), card(4, H), card(5, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('straight_flush');
  });

  it('four of a kind', () => {
    const hand = [card(14, H), card(14, D), card(14, C), card(14, S), card(2, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('four_of_a_kind');
  });

  it('full house', () => {
    const hand = [card(13, H), card(13, D), card(13, C), card(2, H), card(2, D)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('full_house');
  });

  it('flush', () => {
    const hand = [card(2, H), card(4, H), card(7, H), card(9, H), card(13, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('flush');
  });

  it('straight (mixed suits)', () => {
    const hand = [card(5, H), card(6, D), card(7, C), card(8, S), card(9, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('straight');
  });

  it('straight (ace-low wheel, mixed suits)', () => {
    const hand = [card(14, H), card(2, D), card(3, C), card(4, S), card(5, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('straight');
  });

  it('three of a kind', () => {
    const hand = [card(12, H), card(12, D), card(12, C), card(2, H), card(5, D)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('three_of_a_kind');
  });

  it('two pair', () => {
    const hand = [card(13, H), card(13, D), card(12, H), card(12, D), card(2, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('two_pair');
  });

  it('jacks or better — pair of jacks pays', () => {
    const hand = [card(11, H), card(11, D), card(2, H), card(5, D), card(8, C)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('jacks_or_better');
  });

  it('jacks or better — pair of aces pays', () => {
    const hand = [card(14, H), card(14, D), card(2, H), card(5, D), card(8, C)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('jacks_or_better');
  });

  it('low pair (tens) does NOT pay', () => {
    const hand = [card(10, H), card(10, D), card(2, H), card(5, D), card(8, C)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('nothing');
  });

  it('low pair (fives) does NOT pay', () => {
    const hand = [card(5, H), card(5, D), card(2, H), card(8, D), card(13, C)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('nothing');
  });

  it('high card does NOT pay', () => {
    const hand = [card(2, H), card(5, D), card(8, C), card(11, S), card(13, H)];
    expect(resolveVideoPokerHand(hand, 100).category).toBe('nothing');
  });
});

describe('resolveVideoPokerHand — payouts', () => {
  it('pays bet * multiplier', () => {
    const flush = [card(2, H), card(4, H), card(7, H), card(9, H), card(13, H)];
    expect(resolveVideoPokerHand(flush, 200).payout).toBe(1200);
  });

  it('jacks or better returns the bet (push)', () => {
    const jacks = [card(11, H), card(11, D), card(2, H), card(5, D), card(8, C)];
    expect(resolveVideoPokerHand(jacks, 150).payout).toBe(150);
  });

  it('a losing hand pays nothing', () => {
    const nothing = [card(2, H), card(5, D), card(8, C), card(11, S), card(13, H)];
    expect(resolveVideoPokerHand(nothing, 100).payout).toBe(0);
  });

  it('royal flush pays the jackpot multiple', () => {
    const royal = [card(10, S), card(11, S), card(12, S), card(13, S), card(14, S)];
    expect(resolveVideoPokerHand(royal, 100).payout).toBe(100 * VIDEO_POKER_PAYTABLE.royal_flush);
  });

  it('rejects a hand that is not 5 cards', () => {
    expect(() => resolveVideoPokerHand([0, 1, 2, 3], 100)).toThrow();
  });

  it('rejects a hand with duplicate cards', () => {
    expect(() => resolveVideoPokerHand([0, 0, 1, 2, 3], 100)).toThrow();
  });
});

describe('applyHolds — draw logic', () => {
  const deck = Array.from({ length: 52 }, (_, i) => i);

  it('holding all 5 keeps the dealt hand', () => {
    expect(applyHolds(deck, [true, true, true, true, true])).toEqual([0, 1, 2, 3, 4]);
  });

  it('holding none draws the next 5 deck cards', () => {
    expect(applyHolds(deck, [false, false, false, false, false])).toEqual([5, 6, 7, 8, 9]);
  });

  it('replaces only the discarded positions, in deck order', () => {
    expect(applyHolds(deck, [true, false, true, false, true])).toEqual([0, 5, 2, 6, 4]);
  });

  it('rejects a hold mask that is not 5 long', () => {
    expect(() => applyHolds(deck, [true, false])).toThrow();
  });

  it('rejects a deck too small to draw from', () => {
    expect(() => applyHolds([0, 1, 2, 3, 4], [false, false, false, false, false])).toThrow();
  });
});

describe('integration — deal then draw', () => {
  it('an ordered deck, discarding everything, resolves correctly', () => {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const final = applyHolds(deck, [false, false, false, false, false]);
    const result = resolveVideoPokerHand(final, 100);
    expect(final).toHaveLength(5);
    expect(result.multiplier).toBe(VIDEO_POKER_PAYTABLE[result.category]);
  });
});
