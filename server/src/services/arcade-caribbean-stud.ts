/**
 * arcade-caribbean-stud.ts — MORBIUS Arcade: Caribbean Stud Poker math.
 *
 * The classic five-card stud game against the house. One decision, no draw:
 * the player sees their five cards and the dealer's single up card, then either
 * folds (forfeiting the Ante) or Calls for exactly 2× the Ante.
 *
 * What makes it Caribbean Stud rather than a coin flip is the dealer
 * qualification rule: the dealer needs Ace-King high or better to play. When
 * the dealer misses, the Ante pays 1:1 and the Call — the big bet — merely
 * pushes. So beating the dealer with a monster is worth far less than it looks
 * unless the dealer also has something.
 *
 * Card encoding matches the shared deck (provably-fair.service.ts
 * fisherYatesShuffle → indices 0..51):
 *   rank = (idx % 13) + 2  (2..14, Ace high),  suit = floor(idx / 13).
 * Deal order is fixed at /deal, behind the committed server-seed hash:
 *   player    = deck[0,1,2,3,4]
 *   dealer    = deck[5,6,7,8,9]   — deck[5] is the exposed up card
 * The dealer's four down cards never leave the server until the hand settles.
 *
 * Money math is integer chips. *_payout values are GROSS returns (the matching
 * stake is included) — every stake is debited when committed, so a settle only
 * ever credits these buckets.
 */

import { bestHand, compareHands, HandRank, type RankedHand } from './poker-hand-eval';
import { betLimits } from '../lib/game-limits';

export type CsResult = 'win' | 'loss' | 'push' | 'dealer_no_qualify' | 'fold';

export type CsCategory =
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

export const CS_CATEGORY_NAME: Record<CsCategory, string> = {
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
 * Call-bet paytable — NET odds paid on the Call when the player beats a
 * QUALIFIED dealer. The standard table; anything at a pair or below is even
 * money, which is why the game lives or dies on the qualification rule.
 */
export const CS_CALL_PAY: Record<CsCategory, number> = {
  royal_flush: 100,
  straight_flush: 50,
  four_of_a_kind: 20,
  full_house: 7,
  flush: 5,
  straight: 4,
  three_of_a_kind: 3,
  two_pair: 2,
  pair: 1,
  high_card: 1,
};

/**
 * 5+1 Bonus side bet — NET odds on the best 6-card hand made from the player's
 * five cards plus the DEALER'S UP CARD. It resolves on its own, whether the
 * player calls or folds and whether or not the dealer qualifies.
 */
export const CS_BONUS_PAY: Record<CsCategory, number> = {
  royal_flush: 1000,
  straight_flush: 200,
  four_of_a_kind: 100,
  full_house: 20,
  flush: 15,
  straight: 10,
  three_of_a_kind: 7,
  two_pair: 0,
  pair: 0,
  high_card: 0,
};

/** Paying categories, highest first — for rendering a paytable. */
export const CS_PAYING_ORDER: CsCategory[] = [
  'royal_flush',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
  'two_pair',
  'pair',
  'high_card',
];

export const CS_BONUS_PAYING_ORDER: CsCategory[] = [
  'royal_flush',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
];

/**
 * House edge, documentation only. Caribbean Stud runs ~5.22% of the Ante at
 * optimal play with this paytable, and the 5+1 Bonus ~7.4% — the published
 * figures for the standard game.
 */
export const CS_HOUSE_EDGE_ANTE_BP = 522;
export const CS_HOUSE_EDGE_BONUS_BP = 740;

/** Map an evaluated hand to its paytable category. */
export function csCategorize(hand: RankedHand): CsCategory {
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
 * The dealer qualifies on Ace-King high or better: any made hand (a pair or
 * up), or a high-card hand whose top two cards are exactly an Ace and a King.
 * `values` for a high-card hand is the five ranks in descending order.
 */
export function csDealerQualifies(hand: RankedHand): boolean {
  if (hand.rank >= HandRank.Pair) return true;
  return hand.values[0] === 14 && hand.values[1] === 13;
}

export interface CsSettlement {
  result: CsResult;
  playerCategory: CsCategory;
  dealerCategory: CsCategory;
  dealerQualified: boolean;
  /** GROSS chips returned per bucket (stake included). */
  antePayout: number;
  callPayout: number;
  bonusPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  winSide: 'player' | 'dealer' | null;
}

/**
 * Settle a hand.
 *
 *  BONUS (5+1) resolves on the player's five cards plus the dealer's up card,
 *  independently of everything else — including a fold. It is scored by the
 *  caller and passed in as `bonusHand` so this stays a pure function over
 *  already-evaluated hands.
 *
 *  FOLD forfeits the Ante. No Call was ever committed.
 *
 *  Otherwise:
 *   • dealer does NOT qualify → Ante pays 1:1, Call pushes. The player's own
 *     hand is irrelevant: a royal flush against an unqualified dealer collects
 *     exactly one Ante.
 *   • dealer qualifies, player's hand higher → Ante 1:1, Call pays CS_CALL_PAY.
 *   • tie → Ante and Call both push.
 *   • dealer's hand higher → both lost.
 *
 * @param ante      Ante stake, already debited.
 * @param call      Call stake (= 2× Ante, or 0 on a fold), already debited.
 * @param bonus     5+1 Bonus stake (0 if off), already debited.
 * @param folded    true when the player folded.
 * @param bonusHand Best 6-card hand from the player's 5 + the dealer's up card,
 *                  or null when the Bonus side bet is off.
 */
export function settleCaribbeanStud(
  playerHand: RankedHand,
  dealerHand: RankedHand,
  ante: number,
  call: number,
  bonus: number,
  folded: boolean,
  bonusHand: RankedHand | null,
): CsSettlement {
  const playerCategory = csCategorize(playerHand);
  const dealerCategory = csCategorize(dealerHand);
  const dealerQualified = csDealerQualifies(dealerHand);

  let bonusPayout = 0;
  if (bonus > 0 && bonusHand) {
    const mult = CS_BONUS_PAY[csCategorize(bonusHand)];
    if (mult > 0) bonusPayout = bonus + bonus * mult;
  }

  const committed = ante + call + bonus;

  if (folded) {
    const totalPayout = bonusPayout;
    return {
      result: 'fold',
      playerCategory,
      dealerCategory,
      dealerQualified,
      antePayout: 0,
      callPayout: 0,
      bonusPayout,
      totalPayout,
      committed,
      won: totalPayout > committed,
      winSide: 'dealer',
    };
  }

  let antePayout: number;
  let callPayout: number;
  let result: CsResult;
  let winSide: 'player' | 'dealer' | null;

  if (!dealerQualified) {
    // Ante pays even money; the Call — twice the size — only comes back.
    antePayout = ante * 2;
    callPayout = call;
    result = 'dealer_no_qualify';
    winSide = 'player';
  } else {
    const cmp = compareHands(playerHand, dealerHand);
    if (cmp > 0) {
      antePayout = ante * 2;
      callPayout = call + call * CS_CALL_PAY[playerCategory];
      result = 'win';
      winSide = 'player';
    } else if (cmp === 0) {
      antePayout = ante;
      callPayout = call;
      result = 'push';
      winSide = null;
    } else {
      antePayout = 0;
      callPayout = 0;
      result = 'loss';
      winSide = 'dealer';
    }
  }

  const totalPayout = antePayout + callPayout + bonusPayout;
  return {
    result,
    playerCategory,
    dealerCategory,
    dealerQualified,
    antePayout,
    callPayout,
    bonusPayout,
    totalPayout,
    committed,
    won: totalPayout > committed,
    winSide,
  };
}

/** Best 6-card hand for the 5+1 Bonus: the player's five plus the dealer's up card. */
export function csBonusHand(playerCards: number[], dealerUpCard: number): RankedHand {
  return bestHand([...playerCards, dealerUpCard]);
}

export interface CsValidation {
  ok: boolean;
  ante: number;
  bonus: number;
  error: string | null;
}

/**
 * Validate a /deal payload. The Ante must sit inside the table limits; the Call
 * is always exactly 2× the Ante and is committed later, so the effective
 * maximum exposure on the main game is 3× the posted Ante. The 5+1 Bonus is
 * optional: `true` plays it at the Ante amount, or pass a number to size it.
 */
export function validateCsDeal(rawAnte: unknown, rawBonus: unknown): CsValidation {
  const l = betLimits('caribbean_stud');
  const ante = Math.floor(Number(rawAnte));
  if (!Number.isFinite(ante) || ante < l.min || ante > l.max) {
    return {
      ok: false,
      ante: 0,
      bonus: 0,
      error: `Ante must be between ${l.min.toLocaleString()} and ${l.max.toLocaleString()} chips.`,
    };
  }

  let bonus = 0;
  if (typeof rawBonus === 'boolean') {
    bonus = rawBonus ? ante : 0;
  } else if (rawBonus != null && rawBonus !== '') {
    const b = Math.floor(Number(rawBonus));
    if (!Number.isFinite(b) || b < 0) {
      return { ok: false, ante: 0, bonus: 0, error: 'Invalid Bonus bet.' };
    }
    if (b > 0 && (b < l.min || b > l.max)) {
      return {
        ok: false,
        ante: 0,
        bonus: 0,
        error: `Bonus must be between ${l.min.toLocaleString()} and ${l.max.toLocaleString()} chips.`,
      };
    }
    bonus = b;
  }

  return { ok: true, ante, bonus, error: null };
}
