/**
 * arcade-ultimate-holdem.ts — MORBIUS Arcade: Ultimate Texas Hold'em math.
 *
 * The real Shufflemaster game, not a variant. The player posts an Ante and an
 * equal Blind (plus an optional Trips side bet), then gets exactly one chance
 * to bet Play — and the earlier they take it, the bigger it can be:
 *
 *   pre-flop  Play = 4× or 3× Ante   (or check)
 *   flop      Play = 2× Ante         (or check)
 *   river     Play = 1× Ante         (or fold)
 *
 * That single escalating decision is the whole game. Checking costs nothing but
 * shrinks the bet you're allowed to make once you've seen more board.
 *
 * Card encoding matches the shared deck (provably-fair.service.ts
 * fisherYatesShuffle → indices 0..51):
 *   rank = (idx % 13) + 2  (2..14, Ace high),  suit = floor(idx / 13).
 * Deal order is fixed at /deal, behind the committed server-seed hash:
 *   hole      = deck[0,1]
 *   dealer    = deck[2,3]
 *   flop      = deck[4,5,6]
 *   turn      = deck[7]
 *   river     = deck[8]
 * Both players make their best 5-card hand out of their 2 hole cards + the 5
 * community cards, evaluated by the shared `bestHand()` (5-7 cards).
 *
 * Money math is integer chips. *_payout values are GROSS returns (the matching
 * stake is included) — every stake is debited when it is committed, so a settle
 * only ever credits these buckets.
 */

import { bestHand, compareHands, HandRank, type RankedHand } from './poker-hand-eval';
import { betLimits } from '../lib/game-limits';

/** Where a hand is in its single betting decision. */
export type UthStage = 'preflop' | 'flop' | 'river' | 'settled';

/** Everything the player can do. Which are legal depends on the stage. */
export type UthAction = 'bet4' | 'bet3' | 'check' | 'bet2' | 'bet1' | 'fold';

export type UthResult = 'win' | 'loss' | 'push' | 'fold';

/** Paytable category for the Blind and Trips bets. */
export type UthCategory =
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

export const UTH_CATEGORY_NAME: Record<UthCategory, string> = {
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

/**
 * Blind paytable — NET odds paid on the Blind when the player BEATS the dealer.
 * Anything under a straight pushes (the Blind is returned, no winnings), which
 * is what makes the Blind the bet you're happy to leave out there.
 *
 * Flush pays 3:2, so the Blind win is floored to whole chips. With the 100-chip
 * minimum a 3:2 payout is exact on any even stake; the floor only ever costs
 * half a chip on an odd one.
 */
export const UTH_BLIND_PAY: Record<UthCategory, number> = {
  royal_flush: 500,
  straight_flush: 50,
  four_of_a_kind: 10,
  full_house: 3,
  flush: 1.5,
  straight: 1,
  three_of_a_kind: 0,
  two_pair: 0,
  pair: 0,
  high_card: 0,
};

/**
 * Trips paytable — NET odds on the player's own final hand, win or lose against
 * the dealer. This is the standard 50/40/30/8/7/4/3 table (~1.90% house edge).
 */
export const UTH_TRIPS_PAY: Record<UthCategory, number> = {
  royal_flush: 50,
  straight_flush: 40,
  four_of_a_kind: 30,
  full_house: 8,
  flush: 7,
  straight: 4,
  three_of_a_kind: 3,
  two_pair: 0,
  pair: 0,
  high_card: 0,
};

/** Paying categories, highest first — for rendering a paytable. */
export const UTH_PAYING_ORDER: UthCategory[] = [
  'royal_flush',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
];

/**
 * House edge, documentation only. With these paytables Ultimate Texas Hold'em
 * runs ~2.19% of the Ante (~0.53% of total action) at optimal play, and the
 * Trips side bet ~1.90% — the published figures for the standard game.
 */
export const UTH_HOUSE_EDGE_ANTE_BP = 219;
export const UTH_HOUSE_EDGE_TRIPS_BP = 190;

/** Map an evaluated 5-card hand to its paytable category. */
export function uthCategorize(hand: RankedHand): UthCategory {
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
      return 'pair';
    default:
      return 'high_card';
  }
}

/**
 * The dealer qualifies to "open" on a pair or better. Unlike Three Card Poker,
 * qualification here only decides what happens to the ANTE — the Play and the
 * Blind resolve on the hand comparison either way.
 */
export function uthDealerQualifies(hand: RankedHand): boolean {
  return hand.rank >= HandRank.Pair;
}

/** Best 5-card hand from 2 hole cards + the 5 community cards. */
export function uthBest(hole: number[], board: number[]): RankedHand {
  return bestHand([...hole, ...board]);
}

/** Which actions are legal right now. */
export function uthLegalActions(stage: UthStage): UthAction[] {
  if (stage === 'preflop') return ['bet4', 'bet3', 'check'];
  if (stage === 'flop') return ['bet2', 'check'];
  if (stage === 'river') return ['bet1', 'fold'];
  return [];
}

/** The Play multiple an action commits, or 0 for a check/fold. */
export function uthPlayMultiple(action: UthAction): number {
  switch (action) {
    case 'bet4':
      return 4;
    case 'bet3':
      return 3;
    case 'bet2':
      return 2;
    case 'bet1':
      return 1;
    default:
      return 0;
  }
}

/** The stage a check moves the hand to. A bet or a fold always ends the hand. */
export function uthNextStage(stage: UthStage, action: UthAction): UthStage {
  if (uthPlayMultiple(action) > 0 || action === 'fold') return 'settled';
  if (stage === 'preflop') return 'flop';
  if (stage === 'flop') return 'river';
  return 'settled';
}

export interface UthSettlement {
  result: UthResult;
  /** Player's paytable category (for the Blind/Trips payout and the UI). */
  playerCategory: UthCategory;
  dealerCategory: UthCategory;
  dealerQualified: boolean;
  /** GROSS chips returned per bucket (stake included). */
  antePayout: number;
  blindPayout: number;
  playPayout: number;
  tripsPayout: number;
  totalPayout: number;
  /** Everything the player put up across the hand. */
  committed: number;
  /** Player came out ahead over everything committed. */
  won: boolean;
  winSide: 'player' | 'dealer' | null;
}

/**
 * Settle a hand.
 *
 *  TRIPS resolves on the player's own final hand and stays in action even on a
 *  fold — all five community cards are dealt at /deal, so there is always a
 *  final hand to score. That is the standard rule, and it is the reason a fold
 *  is not automatically a total loss.
 *
 *  FOLD forfeits the Ante and the Blind. No Play was ever committed.
 *
 *  Otherwise, comparing the two 7-card hands:
 *   • ANTE  — pushes whenever the dealer fails to qualify (pair or better),
 *             regardless of who won. If the dealer qualified: 1:1 on a win,
 *             push on a tie, lost on a loss.
 *   • PLAY  — resolves on the comparison alone, qualification irrelevant:
 *             1:1 win, push tie, lost on a loss.
 *   • BLIND — only pays on a WIN, and only from a straight up (UTH_BLIND_PAY).
 *             Under a straight it pushes. Push on a tie, lost on a loss.
 *
 * @param ante   Ante stake, already debited.
 * @param blind  Blind stake (= Ante), already debited.
 * @param trips  Trips side bet (0 if off), already debited.
 * @param play   Play stake actually committed (0 on a check-through-to-fold).
 * @param folded true when the player folded at the river.
 */
export function settleUth(
  playerHand: RankedHand,
  dealerHand: RankedHand,
  ante: number,
  blind: number,
  trips: number,
  play: number,
  folded: boolean,
): UthSettlement {
  const playerCategory = uthCategorize(playerHand);
  const dealerCategory = uthCategorize(dealerHand);
  const dealerQualified = uthDealerQualifies(dealerHand);

  // Trips is scored the same way whatever happened on the main bets.
  let tripsPayout = 0;
  if (trips > 0) {
    const mult = UTH_TRIPS_PAY[playerCategory];
    if (mult > 0) tripsPayout = trips + Math.floor(trips * mult);
  }

  const committed = ante + blind + trips + play;

  if (folded) {
    const totalPayout = tripsPayout;
    return {
      result: 'fold',
      playerCategory,
      dealerCategory,
      dealerQualified,
      antePayout: 0,
      blindPayout: 0,
      playPayout: 0,
      tripsPayout,
      totalPayout,
      committed,
      won: totalPayout > committed,
      winSide: 'dealer',
    };
  }

  const cmp = compareHands(playerHand, dealerHand);

  // ANTE — the only bucket the dealer's qualification touches.
  let antePayout: number;
  if (!dealerQualified) antePayout = ante;
  else if (cmp > 0) antePayout = ante * 2;
  else if (cmp === 0) antePayout = ante;
  else antePayout = 0;

  // PLAY — pure hand comparison.
  let playPayout: number;
  if (cmp > 0) playPayout = play * 2;
  else if (cmp === 0) playPayout = play;
  else playPayout = 0;

  // BLIND — pays the paytable on a win, pushes under a straight.
  let blindPayout: number;
  if (cmp > 0) {
    const mult = UTH_BLIND_PAY[playerCategory];
    blindPayout = blind + Math.floor(blind * mult);
  } else if (cmp === 0) {
    blindPayout = blind;
  } else {
    blindPayout = 0;
  }

  const totalPayout = antePayout + blindPayout + playPayout + tripsPayout;
  const result: UthResult = cmp > 0 ? 'win' : cmp === 0 ? 'push' : 'loss';
  return {
    result,
    playerCategory,
    dealerCategory,
    dealerQualified,
    antePayout,
    blindPayout,
    playPayout,
    tripsPayout,
    totalPayout,
    committed,
    won: totalPayout > committed,
    winSide: cmp > 0 ? 'player' : cmp < 0 ? 'dealer' : null,
  };
}

export interface UthValidation {
  ok: boolean;
  ante: number;
  trips: number;
  error: string | null;
}

/**
 * Validate a /deal payload. The Ante must sit inside the table limits and the
 * Blind always matches it, so the player commits 2× Ante before seeing a card.
 * Trips is optional: pass `true` to play it at the Ante amount, or a number to
 * size it yourself (still inside the table limits).
 */
export function validateUthDeal(rawAnte: unknown, rawTrips: unknown): UthValidation {
  const l = betLimits('ultimate_holdem');
  const ante = Math.floor(Number(rawAnte));
  if (!Number.isFinite(ante) || ante < l.min || ante > l.max) {
    return {
      ok: false,
      ante: 0,
      trips: 0,
      error: `Ante must be between ${l.min.toLocaleString()} and ${l.max.toLocaleString()} chips.`,
    };
  }

  let trips = 0;
  if (typeof rawTrips === 'boolean') {
    trips = rawTrips ? ante : 0;
  } else if (rawTrips != null && rawTrips !== '') {
    const t = Math.floor(Number(rawTrips));
    if (!Number.isFinite(t) || t < 0) {
      return { ok: false, ante: 0, trips: 0, error: 'Invalid Trips bet.' };
    }
    if (t > 0 && (t < l.min || t > l.max)) {
      return {
        ok: false,
        ante: 0,
        trips: 0,
        error: `Trips must be between ${l.min.toLocaleString()} and ${l.max.toLocaleString()} chips.`,
      };
    }
    trips = t;
  }

  return { ok: true, ante, trips, error: null };
}
