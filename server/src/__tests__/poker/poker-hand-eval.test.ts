/**
 * Poker Hand Evaluation Tests
 *
 * Tests bestHand, compareHands, winners from poker-hand-eval.ts.
 * Pure function tests — no database required.
 *
 * Card encoding: suit = floor(idx/13), rank = (idx % 13) + 1
 *   rank 1=Ace, 2=Two, ..., 10=Ten, 11=Jack, 12=Queen, 13=King
 *   suit 0=clubs, 1=diamonds, 2=hearts, 3=spades
 *
 * Run: cd server && npm test -- poker-hand-eval
 */

import { bestHand, compareHands, winners, handRankToName, HandRank, RankedHand } from '../../services/poker-hand-eval';

// ---------------------------------------------------------------------------
// Card builder helpers — matches game service encoding (cardToInt)
// ---------------------------------------------------------------------------

// rankIndex: 0=Two, 1=Three, ..., 8=Ten, 9=Jack, 10=Queen, 11=King, 12=Ace
// suit: 0=clubs, 1=diamonds, 2=hearts, 3=spades
// int = suitIndex * 13 + rankIndex

// Shorthand: "As" → Ace of spades, "Td" → Ten of diamonds
const RANK_INDEX: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
  '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12,
};
const SUIT_INDEX: Record<string, number> = { 'c': 0, 'd': 1, 'h': 2, 's': 3 };

function c(s: string): number {
  const rankIdx = RANK_INDEX[s[0]];
  const suitIdx = SUIT_INDEX[s[1]];
  if (rankIdx === undefined || suitIdx === undefined) throw new Error(`Bad card: ${s}`);
  return suitIdx * 13 + rankIdx;
}

function cards(...strs: string[]): number[] {
  return strs.map(c);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hand Evaluation', () => {
  describe('5-card hand ranking', () => {
    it('detects royal flush (ace-high straight flush)', () => {
      const hand = bestHand(cards('As', 'Ks', 'Qs', 'Js', 'Ts'));
      expect(hand.rank).toBe(HandRank.StraightFlush);
      expect(hand.values[0]).toBe(14); // Ace high
    });

    it('detects straight flush (non-royal)', () => {
      const hand = bestHand(cards('9h', '8h', '7h', '6h', '5h'));
      expect(hand.rank).toBe(HandRank.StraightFlush);
      expect(hand.values[0]).toBe(9);
    });

    it('detects ace-low straight flush (A-2-3-4-5)', () => {
      const hand = bestHand(cards('Ac', '2c', '3c', '4c', '5c'));
      expect(hand.rank).toBe(HandRank.StraightFlush);
      expect(hand.values[0]).toBe(5); // 5-high
    });

    it('detects four of a kind', () => {
      const hand = bestHand(cards('7c', '7d', '7h', '7s', 'Kd'));
      expect(hand.rank).toBe(HandRank.Quads);
      expect(hand.values[0]).toBe(7);
    });

    it('detects full house', () => {
      const hand = bestHand(cards('Jc', 'Jd', 'Jh', '4s', '4c'));
      expect(hand.rank).toBe(HandRank.FullHouse);
      expect(hand.values[0]).toBe(11); // Jacks full
      expect(hand.values[1]).toBe(4);  // of fours
    });

    it('detects flush', () => {
      const hand = bestHand(cards('Ad', 'Td', '7d', '4d', '2d'));
      expect(hand.rank).toBe(HandRank.Flush);
    });

    it('detects straight', () => {
      const hand = bestHand(cards('9c', '8d', '7h', '6s', '5c'));
      expect(hand.rank).toBe(HandRank.Straight);
      expect(hand.values[0]).toBe(9);
    });

    it('detects ace-low straight (wheel: A-2-3-4-5)', () => {
      const hand = bestHand(cards('Ac', '2d', '3h', '4s', '5c'));
      expect(hand.rank).toBe(HandRank.Straight);
      expect(hand.values[0]).toBe(5); // 5-high straight
    });

    it('detects ace-high straight (T-J-Q-K-A)', () => {
      const hand = bestHand(cards('Tc', 'Jd', 'Qh', 'Ks', 'Ac'));
      expect(hand.rank).toBe(HandRank.Straight);
      expect(hand.values[0]).toBe(14); // Ace-high
    });

    it('detects three of a kind', () => {
      const hand = bestHand(cards('9c', '9d', '9h', 'Ks', '3c'));
      expect(hand.rank).toBe(HandRank.Trips);
      expect(hand.values[0]).toBe(9);
    });

    it('detects two pair', () => {
      const hand = bestHand(cards('Kc', 'Kd', '5h', '5s', 'Ac'));
      expect(hand.rank).toBe(HandRank.TwoPair);
      expect(hand.values[0]).toBe(13); // Kings
      expect(hand.values[1]).toBe(5);  // Fives
    });

    it('detects pair', () => {
      const hand = bestHand(cards('Qc', 'Qd', 'Ah', '7s', '3c'));
      expect(hand.rank).toBe(HandRank.Pair);
      expect(hand.values[0]).toBe(12); // Queens
    });

    it('detects high card', () => {
      const hand = bestHand(cards('Ac', 'Kd', 'Jh', '8s', '3c'));
      expect(hand.rank).toBe(HandRank.HighCard);
      expect(hand.values[0]).toBe(14); // Ace high
    });
  });

  describe('7-card hand picking best 5', () => {
    it('finds flush hidden in 7 cards', () => {
      // 5 hearts among 7 cards
      const hand = bestHand(cards('Ah', 'Kh', '9h', '6h', '3h', 'Qc', '2d'));
      expect(hand.rank).toBe(HandRank.Flush);
    });

    it('finds straight hidden among pairs', () => {
      // Has a pair of 8s but also a straight 5-6-7-8-9
      const hand = bestHand(cards('5c', '6d', '7h', '8s', '8c', '9d', '2h'));
      expect(hand.rank).toBe(HandRank.Straight);
      expect(hand.values[0]).toBe(9);
    });

    it('picks full house over flush when both present', () => {
      // 5 diamonds but also three Ks + pair of 4s
      const hand = bestHand(cards('Kd', 'Kh', 'Ks', '4d', '4h', '7d', '2d'));
      expect(hand.rank).toBe(HandRank.FullHouse);
      expect(hand.values[0]).toBe(13);
    });

    it('finds best two pair with correct kicker from 7 cards', () => {
      const hand = bestHand(cards('Ac', 'Kc', 'Kd', '5h', '5s', '3c', '2d'));
      expect(hand.rank).toBe(HandRank.TwoPair);
      expect(hand.values[0]).toBe(13); // Kings
      expect(hand.values[1]).toBe(5);  // Fives
      expect(hand.values[2]).toBe(14); // Ace kicker
    });

    it('picks quads from 7 cards', () => {
      const hand = bestHand(cards('Tc', 'Td', 'Th', 'Ts', 'Ac', 'Kd', '2h'));
      expect(hand.rank).toBe(HandRank.Quads);
      expect(hand.values[0]).toBe(10);
      expect(hand.values[1]).toBe(14); // Ace kicker
    });
  });

  describe('compareHands', () => {
    it('flush beats straight', () => {
      const flush = bestHand(cards('Ad', 'Td', '7d', '4d', '2d'));
      const straight = bestHand(cards('9c', '8d', '7h', '6s', '5c'));
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it('higher pair beats lower pair', () => {
      const pairK = bestHand(cards('Kc', 'Kd', 'Ah', '7s', '3c'));
      const pairQ = bestHand(cards('Qc', 'Qd', 'Ah', '7s', '3c'));
      expect(compareHands(pairK, pairQ)).toBeGreaterThan(0);
    });

    it('same pair, better kicker wins', () => {
      const pairKA = bestHand(cards('Kc', 'Kd', 'Ah', '7s', '3c'));
      const pairKQ = bestHand(cards('Kh', 'Ks', 'Qh', '7c', '3d'));
      expect(compareHands(pairKA, pairKQ)).toBeGreaterThan(0);
    });

    it('identical hands tie', () => {
      // Same ranks, different suits — should be 0
      const h1 = bestHand(cards('Ac', 'Kc', 'Jc', '8c', '3d'));
      const h2 = bestHand(cards('Ad', 'Kd', 'Jd', '8d', '3c'));
      expect(compareHands(h1, h2)).toBe(0);
    });

    it('ace-low straight loses to 6-high straight', () => {
      const wheel = bestHand(cards('Ac', '2d', '3h', '4s', '5c'));
      const six_high = bestHand(cards('2c', '3d', '4h', '5s', '6c'));
      expect(compareHands(six_high, wheel)).toBeGreaterThan(0);
    });
  });

  describe('winners (multi-player showdown)', () => {
    it('single winner', () => {
      const hands = [
        cards('Ac', 'Kc', 'Qc', 'Jc', 'Tc'), // royal flush (clubs)
        cards('9h', '8h', '7h', '6h', '5h'),    // straight flush 9-high
      ];
      const w = winners(hands);
      expect(w).toEqual([0]);
    });

    it('tie between two identical-rank hands', () => {
      const hands = [
        cards('Ac', 'Kc', 'Jc', '8c', '3d'), // high card A-K-J-8-3
        cards('Ad', 'Kd', 'Jd', '8d', '3c'), // same ranks, different suits
      ];
      const w = winners(hands);
      expect(w).toEqual([0, 1]);
    });

    it('three players, middle one wins', () => {
      const hands = [
        cards('2c', '3d', '7h', '8s', 'Tc'),         // high card
        cards('Ac', 'Ad', 'Kh', 'Qs', 'Jc'),          // pair of aces
        cards('5c', '5d', '3h', '3s', '9c'),           // two pair
      ];
      const w = winners(hands);
      expect(w).toEqual([2]); // two pair beats pair
    });

    it('empty hands returns empty', () => {
      expect(winners([])).toEqual([]);
    });
  });

  describe('handRankToName', () => {
    it('returns correct names', () => {
      expect(handRankToName(HandRank.HighCard)).toBe('High Card');
      expect(handRankToName(HandRank.Pair)).toBe('Pair');
      expect(handRankToName(HandRank.TwoPair)).toBe('Two Pair');
      expect(handRankToName(HandRank.Trips)).toBe('Three of a Kind');
      expect(handRankToName(HandRank.Straight)).toBe('Straight');
      expect(handRankToName(HandRank.Flush)).toBe('Flush');
      expect(handRankToName(HandRank.FullHouse)).toBe('Full House');
      expect(handRankToName(HandRank.Quads)).toBe('Four of a Kind');
      expect(handRankToName(HandRank.StraightFlush)).toBe('Straight Flush');
    });
  });

  describe('edge cases', () => {
    it('throws for fewer than 5 cards', () => {
      expect(() => bestHand(cards('Ac', 'Kd', '3h', '7s'))).toThrow('Need 5-7 cards');
    });

    it('throws for more than 7 cards', () => {
      expect(() => bestHand(cards('Ac', 'Kd', '3h', '7s', '2c', 'Jd', 'Th', '9s'))).toThrow('Need 5-7 cards');
    });

    it('handles 6-card input', () => {
      const hand = bestHand(cards('Ac', 'Ad', 'Kh', 'Qs', 'Jc', '3d'));
      expect(hand.rank).toBe(HandRank.Pair);
      expect(hand.values[0]).toBe(14); // Aces
    });

    it('king-high straight is not confused with ace-low', () => {
      // 9-T-J-Q-K — should be K-high straight, not confused with ace wrapping
      const hand = bestHand(cards('9c', 'Td', 'Jh', 'Qs', 'Kc'));
      expect(hand.rank).toBe(HandRank.Straight);
      expect(hand.values[0]).toBe(13);
    });

    it('Q-K-A-2-3 is NOT a straight (no wrap-around)', () => {
      const hand = bestHand(cards('Qc', 'Kd', 'Ah', '2s', '3c'));
      expect(hand.rank).toBe(HandRank.HighCard);
    });
  });
});
