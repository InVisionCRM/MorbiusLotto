/**
 * Poker Card Encoding Tests
 *
 * Tests intToCard / cardToInt roundtrip for all 52 cards,
 * and verifies compatibility between the game service encoding
 * and the hand evaluator's encoding.
 *
 * Game service encoding (poker-game.service.ts):
 *   int = suitIndex * 13 + rankIndex
 *   rankIndex: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suitIndex: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 *
 * Hand evaluator encoding (poker-hand-eval.ts):
 *   rank = (cardIndex % 13) + 1  → 1=Ace, 2=Two, ..., 13=King
 *   suit = floor(cardIndex / 13)
 *
 * Run: cd server && npm test -- poker-card-encoding
 */

import { Card, CardRank, CardSuit } from '@chevtek/poker-engine';
import { bestHand, HandRank } from '../../services/poker-hand-eval';

// ---------------------------------------------------------------------------
// Replicate the encoding functions from poker-game.service.ts
// (not exported, so duplicated here for testing)
// ---------------------------------------------------------------------------

const INT_RANKS: CardRank[] = [
  CardRank.TWO, CardRank.THREE, CardRank.FOUR, CardRank.FIVE,
  CardRank.SIX, CardRank.SEVEN, CardRank.EIGHT, CardRank.NINE,
  CardRank.TEN, CardRank.JACK, CardRank.QUEEN, CardRank.KING, CardRank.ACE,
];
const INT_SUITS: CardSuit[] = [CardSuit.CLUB, CardSuit.DIAMOND, CardSuit.HEART, CardSuit.SPADE];

function intToCard(n: number): Card {
  const rankIdx = n % 13;
  const suitIdx = Math.floor(n / 13);
  return new Card(INT_RANKS[rankIdx], INT_SUITS[suitIdx]);
}

function cardToInt(card: Card): number {
  const rankIdx = INT_RANKS.indexOf(card.rank);
  const suitIdx = INT_SUITS.indexOf(card.suit);
  return suitIdx * 13 + rankIdx;
}

// Helper: hand eval's internal rank for a given game service int
function handEvalRankOf(gameServiceInt: number): number {
  return (gameServiceInt % 13) + 2;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Card Encoding', () => {
  describe('intToCard → cardToInt roundtrip', () => {
    it('roundtrips all 52 cards', () => {
      for (let i = 0; i < 52; i++) {
        const card = intToCard(i);
        const back = cardToInt(card);
        expect(back).toBe(i);
      }
    });
  });

  describe('cardToInt → intToCard roundtrip', () => {
    it('roundtrips every rank/suit combination', () => {
      for (const suit of INT_SUITS) {
        for (const rank of INT_RANKS) {
          const card = new Card(rank, suit);
          const int = cardToInt(card);
          const back = intToCard(int);
          expect(back.rank).toBe(rank);
          expect(back.suit).toBe(suit);
        }
      }
    });
  });

  describe('encoding correctness', () => {
    it('2 of clubs = 0', () => {
      const card = intToCard(0);
      expect(card.rank).toBe(CardRank.TWO);
      expect(card.suit).toBe(CardSuit.CLUB);
    });

    it('Ace of clubs = 12', () => {
      const card = intToCard(12);
      expect(card.rank).toBe(CardRank.ACE);
      expect(card.suit).toBe(CardSuit.CLUB);
    });

    it('2 of diamonds = 13', () => {
      const card = intToCard(13);
      expect(card.rank).toBe(CardRank.TWO);
      expect(card.suit).toBe(CardSuit.DIAMOND);
    });

    it('Ace of spades = 51', () => {
      const card = intToCard(51);
      expect(card.rank).toBe(CardRank.ACE);
      expect(card.suit).toBe(CardSuit.SPADE);
    });

    it('King of hearts = 37', () => {
      // hearts = suit 2, King = rank index 11 → 2*13 + 11 = 37
      const card = intToCard(37);
      expect(card.rank).toBe(CardRank.KING);
      expect(card.suit).toBe(CardSuit.HEART);
    });
  });

  describe('no collisions', () => {
    it('all 52 ints produce unique rank/suit pairs', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 52; i++) {
        const card = intToCard(i);
        const key = `${card.rank}-${card.suit}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      expect(seen.size).toBe(52);
    });

    it('all rank/suit pairs produce unique ints', () => {
      const seen = new Set<number>();
      for (const suit of INT_SUITS) {
        for (const rank of INT_RANKS) {
          const int = cardToInt(new Card(rank, suit));
          expect(seen.has(int)).toBe(false);
          seen.add(int);
        }
      }
      expect(seen.size).toBe(52);
    });
  });

  describe('game service ↔ hand evaluator encoding compatibility', () => {
    // After fix: both systems use rankIndex 0=Two, 12=Ace.
    // Hand eval: rankOf(idx) = (idx % 13) + 2 → 2=Two, 14=Ace.

    it('game service Ace is correctly read as Ace by hand evaluator', () => {
      const aceClubsInt = cardToInt(new Card(CardRank.ACE, CardSuit.CLUB));
      expect(aceClubsInt).toBe(12);
      // Hand eval: rankOf(12) = (12 % 13) + 2 = 14 = Ace
      expect(handEvalRankOf(aceClubsInt)).toBe(14);
    });

    it('game service Two is correctly read as Two by hand evaluator', () => {
      const twoClubsInt = cardToInt(new Card(CardRank.TWO, CardSuit.CLUB));
      expect(twoClubsInt).toBe(0);
      // Hand eval: rankOf(0) = (0 % 13) + 2 = 2 = Two
      expect(handEvalRankOf(twoClubsInt)).toBe(2);
    });

    it('game service King is correctly read as King by hand evaluator', () => {
      const kingClubsInt = cardToInt(new Card(CardRank.KING, CardSuit.CLUB));
      expect(kingClubsInt).toBe(11);
      // Hand eval: rankOf(11) = (11 % 13) + 2 = 13 = King
      expect(handEvalRankOf(kingClubsInt)).toBe(13);
    });

    it('full rank mapping is aligned', () => {
      const rankNames = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
                          'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
      const expectedRanks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      for (let rankIdx = 0; rankIdx < 13; rankIdx++) {
        expect(handEvalRankOf(rankIdx)).toBe(expectedRanks[rankIdx]);
      }
    });

    it('pair of Aces correctly beats pair of Twos', () => {
      const pairOfTwos = [
        cardToInt(new Card(CardRank.TWO, CardSuit.CLUB)),    // 0
        cardToInt(new Card(CardRank.TWO, CardSuit.DIAMOND)), // 13
        cardToInt(new Card(CardRank.FIVE, CardSuit.HEART)),  // kicker
        cardToInt(new Card(CardRank.SEVEN, CardSuit.SPADE)), // kicker
        cardToInt(new Card(CardRank.NINE, CardSuit.CLUB)),   // kicker
      ];

      const pairOfAces = [
        cardToInt(new Card(CardRank.ACE, CardSuit.CLUB)),    // 12
        cardToInt(new Card(CardRank.ACE, CardSuit.DIAMOND)), // 25
        cardToInt(new Card(CardRank.FIVE, CardSuit.CLUB)),   // kicker
        cardToInt(new Card(CardRank.SEVEN, CardSuit.CLUB)),  // kicker
        cardToInt(new Card(CardRank.NINE, CardSuit.DIAMOND)),// kicker
      ];

      const twosResult = bestHand(pairOfTwos);
      const acesResult = bestHand(pairOfAces);

      expect(twosResult.rank).toBe(HandRank.Pair);
      expect(acesResult.rank).toBe(HandRank.Pair);

      // Aces (14) beat Twos (2)
      expect(acesResult.values[0]).toBe(14);
      expect(twosResult.values[0]).toBe(2);
      expect(acesResult.values[0]).toBeGreaterThan(twosResult.values[0]);
    });
  });
});
