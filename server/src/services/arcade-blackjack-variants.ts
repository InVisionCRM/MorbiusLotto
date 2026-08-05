/**
 * arcade-blackjack-variants.ts — the blackjack variants, one rules engine.
 *
 * Spanish 21, Double Exposure, Pontoon and Free Bet are all blackjack with the
 * knobs turned differently: which cards are in the deck, whether the dealer's
 * hole card is face up or the whole hand is face down, who wins a tie, what a
 * natural pays, whether the house buys your double. So this is one engine plus
 * a rules record per game, rather than four hand-written games that would drift
 * apart the first time one of them was fixed.
 *
 * DELIBERATELY SEPARATE from blackjack-game.service.ts. That service carries
 * the flagship game's single-player, multiplayer and tournament money paths;
 * threading variant branches through its split and dealer logic would put the
 * main game at risk to add side games. Nothing here touches it.
 *
 * SINGLE DECK. Every game on this site deals from one provably-fair shuffled
 * deck, and these do too. Real Spanish 21 and Free Bet are dealt from six or
 * eight decks, so the published house-edge figures do NOT transfer — the card
 * removal effect on one deck is large. The edges quoted below are the standard
 * multi-deck ones, kept only as a sanity reference, and the UI says the game is
 * single-deck rather than quoting a return it doesn't have. (It is also why
 * Spanish 21's Match the Dealer side bet is absent: a suited match needs a
 * duplicate card, which cannot exist in a single deck.)
 *
 * Card encoding is the shared deck (provably-fair.service.ts fisherYatesShuffle
 * → indices 0..51):
 *   rank = (idx % 13) + 1   (1 = Ace, 11 = J, 12 = Q, 13 = K)
 *   suit = floor(idx / 13)  (0 = ♥, 1 = ♦, 2 = ♣, 3 = ♠)
 *
 * Money math is integer chips. Payout values are GROSS returns (the stake is
 * included) — every stake is debited when committed, so a settle only credits.
 */

import { betLimits } from '../lib/game-limits';

export type BjVariant = 'spanish21' | 'double_exposure' | 'pontoon' | 'free_bet';

/** What the player can do with the hand in front of them. */
export type BjAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type BjHandOutcome =
  | 'win'
  | 'loss'
  | 'push'
  | 'blackjack'
  | 'bust'
  | 'surrender'
  | 'five_card_trick'
  | 'bonus_21';

// ── Rules ───────────────────────────────────────────────────────────────────

export interface BjBonusPay {
  /** Profit multiple for a 21 made with exactly 5 / 6 / 7+ cards. */
  fiveCard21: number;
  sixCard21: number;
  sevenCard21: number;
  /** 6-7-8 or 7-7-7, by how well the suits match. */
  sequenceMixed: number;
  sequenceSuited: number;
  sequenceSpades: number;
}

export interface BjRules {
  key: BjVariant;
  name: string;
  /** One line for the lobby — what makes this table different. */
  blurb: string;
  /** Ranks stripped from the 52-card deck. Spanish 21 removes all four 10s. */
  removedRanks: number[];
  /** Dealer draws on soft 17. */
  hitsSoft17: boolean;
  /** Dealer's second card is face up from the deal (Double Exposure). */
  dealerExposed: boolean;
  /** BOTH dealer cards stay down until the player is finished (Pontoon). */
  dealerFullyHidden: boolean;
  /** Profit multiple on a natural: 1.5 = 3:2, 1 = even money, 2 = 2:1. */
  naturalPays: number;
  /** The dealer takes every tie (Double Exposure, Pontoon). */
  dealerWinsTies: boolean;
  /** A player 21 beats a dealer 21, and a player natural beats a dealer one. */
  player21AlwaysWins: boolean;
  /** Dealer total that PUSHES live hands instead of losing (Free Bet: 22). */
  pushOnDealerTotal: number | null;
  /** Late surrender is on the table. */
  surrender: boolean;
  /** The player may not stand below this total (Pontoon: 15). */
  minStand: number;
  /** Hard totals a double is allowed on; null means any total. */
  doubleOn: number[] | null;
  /** Doubling is allowed on three or more cards (Spanish 21, Pontoon's buy). */
  doubleAnyCards: boolean;
  /** Hard totals the HOUSE pays the double on (Free Bet). */
  freeDoubleOn: number[];
  /** The house pays the split, except on 10-value pairs (Free Bet). */
  freeSplit: boolean;
  /** Five cards without busting pays this profit multiple and beats all but a natural. */
  fiveCardTrick: number | null;
  /** Bonus paytable for long 21s and 6-7-8 / 7-7-7 (Spanish 21). */
  bonuses: BjBonusPay | null;
  /** How many times a hand may be split. */
  maxSplits: number;
  /** Published multi-deck house edge in basis points — reference only, see the file header. */
  referenceEdgeBp: number;
  /** Player-facing rule list for the felt. */
  highlights: string[];
}

const SPANISH21: BjRules = {
  key: 'spanish21',
  name: 'Spanish 21',
  blurb: 'Every 10 is gone — and the house hands the advantage back in bonuses.',
  removedRanks: [10],
  hitsSoft17: true,
  dealerExposed: false,
  dealerFullyHidden: false,
  naturalPays: 1.5,
  dealerWinsTies: false,
  // The rule that makes the missing 10s survivable: your 21 always wins.
  player21AlwaysWins: true,
  pushOnDealerTotal: null,
  surrender: true,
  minStand: 0,
  doubleOn: null,
  doubleAnyCards: true,
  freeDoubleOn: [],
  freeSplit: false,
  fiveCardTrick: null,
  bonuses: {
    fiveCard21: 1.5,
    sixCard21: 2,
    sevenCard21: 3,
    sequenceMixed: 1.5,
    sequenceSuited: 2,
    sequenceSpades: 3,
  },
  maxSplits: 3,
  referenceEdgeBp: 76,
  highlights: [
    'All four 10s are out — Jacks, Queens and Kings stay',
    'Your 21 always wins, and your blackjack always beats the dealer’s',
    'Blackjack pays 3:2',
    'Double on any number of cards; late surrender allowed',
    'Bonuses for 5+ card 21s and for 6-7-8 or 7-7-7',
  ],
};

const DOUBLE_EXPOSURE: BjRules = {
  key: 'double_exposure',
  name: 'Double Exposure',
  blurb: 'You see both dealer cards. You pay for it on every tie.',
  removedRanks: [],
  hitsSoft17: true,
  dealerExposed: true,
  dealerFullyHidden: false,
  // Seeing the dealer's hand is worth a fortune, so the natural pays even money
  // and every tie goes to the house. Those two rules are the whole price.
  naturalPays: 1,
  dealerWinsTies: true,
  player21AlwaysWins: false,
  pushOnDealerTotal: null,
  surrender: false,
  minStand: 0,
  doubleOn: [9, 10, 11],
  doubleAnyCards: false,
  freeDoubleOn: [],
  freeSplit: false,
  fiveCardTrick: null,
  bonuses: null,
  maxSplits: 1,
  referenceEdgeBp: 69,
  highlights: [
    'Both dealer cards are face up from the deal',
    'Blackjack pays even money, not 3:2',
    'The dealer wins every tie — except your blackjack beats theirs',
    'Double on hard 9, 10 or 11 only',
  ],
};

const PONTOON: BjRules = {
  key: 'pontoon',
  name: 'Pontoon',
  blurb: 'Both dealer cards face down. Five cards under 22 beats almost anything.',
  removedRanks: [],
  hitsSoft17: true,
  dealerExposed: false,
  dealerFullyHidden: true,
  naturalPays: 2,
  dealerWinsTies: true,
  player21AlwaysWins: false,
  pushOnDealerTotal: null,
  surrender: false,
  // You cannot stick below 15 — the game forces you to keep twisting into it.
  minStand: 15,
  doubleOn: null,
  doubleAnyCards: true,
  freeDoubleOn: [],
  freeSplit: false,
  fiveCardTrick: 2,
  bonuses: null,
  maxSplits: 1,
  referenceEdgeBp: 34,
  highlights: [
    'Both dealer cards stay face down until you’re done',
    'A Pontoon (ace + ten-value) pays 2:1',
    'Five cards without busting pays 2:1 and beats everything but a Pontoon',
    'You can’t stick below 15',
    'The dealer wins every tie',
  ],
};

const FREE_BET: BjRules = {
  key: 'free_bet',
  name: 'Free Bet Blackjack',
  blurb: 'The house pays your doubles and splits. The house also pushes on 22.',
  removedRanks: [],
  hitsSoft17: true,
  dealerExposed: false,
  dealerFullyHidden: false,
  naturalPays: 1.5,
  dealerWinsTies: false,
  player21AlwaysWins: false,
  // What pays for all those free bets: a dealer 22 doesn't lose, it pushes.
  pushOnDealerTotal: 22,
  surrender: false,
  minStand: 0,
  doubleOn: null,
  doubleAnyCards: false,
  freeDoubleOn: [9, 10, 11],
  freeSplit: true,
  fiveCardTrick: null,
  bonuses: null,
  maxSplits: 3,
  referenceEdgeBp: 104,
  highlights: [
    'The house puts up your double on hard 9, 10 or 11',
    'The house puts up your split on any pair except tens',
    'A dealer 22 pushes against every live hand',
    'Blackjack pays 3:2',
  ],
};

export const BJ_VARIANTS: Record<BjVariant, BjRules> = {
  spanish21: SPANISH21,
  double_exposure: DOUBLE_EXPOSURE,
  pontoon: PONTOON,
  free_bet: FREE_BET,
};

export const BJ_VARIANT_KEYS: BjVariant[] = [
  'spanish21',
  'double_exposure',
  'pontoon',
  'free_bet',
];

export function isBjVariant(v: unknown): v is BjVariant {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BJ_VARIANTS, v);
}

/** Resolve a variant key. Unknown values are rejected rather than defaulted —
 *  silently settling a hand on the wrong paytable is the one thing to avoid. */
export function bjRules(v: unknown): BjRules | null {
  return isBjVariant(v) ? BJ_VARIANTS[v] : null;
}

// ── Cards ───────────────────────────────────────────────────────────────────

/** Card index 0..51 → rank 1..13 (1 = Ace, 11/12/13 = J/Q/K). */
export function bjRank(idx: number): number {
  return (idx % 13) + 1;
}

/** Card index 0..51 → suit 0..3 (0=♥, 1=♦, 2=♣, 3=♠). */
export function bjSuit(idx: number): number {
  return Math.floor(idx / 13);
}

/** Blackjack point value. Aces count 11 here and are demoted by handTotal. */
export function bjCardValue(idx: number): number {
  const r = bjRank(idx);
  if (r === 1) return 11;
  if (r >= 10) return 10;
  return r;
}

export interface BjTotal {
  total: number;
  /** True when an ace is still being counted as 11. */
  soft: boolean;
}

/** Best total for a hand, demoting aces from 11 to 1 only as needed. */
export function bjHandTotal(cards: number[]): BjTotal {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += bjCardValue(c);
    if (bjRank(c) === 1) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

/** A natural: exactly two cards totalling 21. */
export function bjIsNatural(cards: number[]): boolean {
  return cards.length === 2 && bjHandTotal(cards).total === 21;
}

/**
 * The ordered deck for a variant. Spanish 21 strips all four 10s, leaving 48
 * cards; every other variant plays the full 52. The shuffle itself is done by
 * the provably-fair service over a full deck — this filters the RESULT, so the
 * committed shuffle stays verifiable against the standard 52-card recipe and a
 * verifier only has to know which ranks were removed.
 */
export function bjDeckFor(rules: BjRules, shuffled: number[]): number[] {
  if (rules.removedRanks.length === 0) return shuffled;
  const removed = new Set(rules.removedRanks);
  return shuffled.filter((c) => !removed.has(bjRank(c)));
}

// ── Hand state ──────────────────────────────────────────────────────────────

export interface BjHand {
  cards: number[];
  /** Chips the player actually put up on this hand. */
  bet: number;
  /** Chips the HOUSE put up (Free Bet doubles and splits). Not at risk. */
  freeBet: number;
  /** The hand has been doubled (no more cards after one draw). */
  doubled: boolean;
  /** This hand came out of a split. */
  fromSplit: boolean;
  /** The player is finished with this hand. */
  done: boolean;
  surrendered: boolean;
  busted: boolean;
}

export function bjNewHand(cards: number[], bet: number, fromSplit = false): BjHand {
  return {
    cards,
    bet,
    freeBet: 0,
    doubled: false,
    fromSplit,
    done: false,
    surrendered: false,
    busted: false,
  };
}

/** Both cards are the same rank — or, for splitting, the same ten-value. */
export function bjIsPair(cards: number[]): boolean {
  if (cards.length !== 2) return false;
  const a = bjRank(cards[0]);
  const b = bjRank(cards[1]);
  if (a === b) return true;
  // Ten-value cards split against each other, the way they do at a real table.
  return a >= 10 && b >= 10;
}

/** A pair of ten-value cards — the one pair Free Bet won't split for free. */
export function bjIsTenPair(cards: number[]): boolean {
  return (
    cards.length === 2 && bjRank(cards[0]) >= 10 && bjRank(cards[1]) >= 10
  );
}

/**
 * Which actions are legal on a hand right now.
 *
 * `handCount` and `splitCount` are the current number of hands and how many
 * splits have already happened, so the split cap is enforced here rather than
 * being re-derived by every caller.
 */
export function bjLegalActions(
  rules: BjRules,
  hand: BjHand,
  splitCount: number,
): BjAction[] {
  if (hand.done || hand.busted || hand.surrendered) return [];
  const t = bjHandTotal(hand.cards);
  if (t.total >= 21) return [];

  const out: BjAction[] = ['hit'];

  // Pontoon forces you to keep twisting until you can stick.
  if (t.total >= rules.minStand) out.push('stand');

  const isFirstDecision = hand.cards.length === 2;
  const doubleAllowedByCount = rules.doubleAnyCards || isFirstDecision;
  const doubleAllowedByTotal =
    rules.doubleOn === null || (!t.soft && rules.doubleOn.includes(t.total));
  if (doubleAllowedByCount && doubleAllowedByTotal) out.push('double');

  if (
    isFirstDecision &&
    bjIsPair(hand.cards) &&
    splitCount < rules.maxSplits &&
    // Split aces get one card each and are then done, so they never re-split.
    !(hand.fromSplit && bjRank(hand.cards[0]) === 1)
  ) {
    out.push('split');
  }

  // Surrender is a first-decision-only, un-split-only option.
  if (rules.surrender && isFirstDecision && !hand.fromSplit) out.push('surrender');

  return out;
}

/** True when the house buys this double instead of the player (Free Bet). */
export function bjDoubleIsFree(rules: BjRules, hand: BjHand): boolean {
  if (rules.freeDoubleOn.length === 0) return false;
  if (hand.cards.length !== 2) return false;
  const t = bjHandTotal(hand.cards);
  return !t.soft && rules.freeDoubleOn.includes(t.total);
}

/** True when the house buys this split instead of the player (Free Bet). */
export function bjSplitIsFree(rules: BjRules, hand: BjHand): boolean {
  if (!rules.freeSplit) return false;
  // Tens are the one pair the house won't buy — splitting a 20 is a bad play
  // and the free-bet game deliberately won't subsidise it.
  return !bjIsTenPair(hand.cards);
}

// ── Dealer ──────────────────────────────────────────────────────────────────

/** Should the dealer take another card on this hand? */
export function bjDealerDraws(rules: BjRules, cards: number[]): boolean {
  const t = bjHandTotal(cards);
  if (t.total < 17) return true;
  if (t.total === 17 && t.soft && rules.hitsSoft17) return true;
  return false;
}

/**
 * Play the dealer out from a starting hand, drawing off the front of `deck`.
 * Returns the finished hand and how many cards were consumed, so the caller
 * can keep its own deck cursor honest.
 */
export function bjPlayDealer(
  rules: BjRules,
  dealerCards: number[],
  deck: number[],
  cursor: number,
): { cards: number[]; cursor: number } {
  const cards = [...dealerCards];
  let i = cursor;
  while (bjDealerDraws(rules, cards) && i < deck.length) {
    cards.push(deck[i++]);
  }
  return { cards, cursor: i };
}

// ── Spanish 21 bonuses ──────────────────────────────────────────────────────

/**
 * The bonus a completed hand earns on its own, before it is compared with the
 * dealer. Returns the PROFIT multiple on the hand's bet, or 0.
 *
 * Bonuses are void on a doubled or split hand — that is the standard rule, and
 * it is what stops the paytable from being farmed.
 */
export function bjBonusMultiplier(rules: BjRules, hand: BjHand): number {
  const b = rules.bonuses;
  if (!b) return 0;
  if (hand.doubled || hand.fromSplit) return 0;
  const t = bjHandTotal(hand.cards);
  if (t.total !== 21) return 0;

  const ranks = hand.cards.map(bjRank);
  const suits = hand.cards.map(bjSuit);

  // 6-7-8 and 7-7-7 pay by how well the suits line up. Both are three cards,
  // so they are checked before the long-21 ladder.
  if (hand.cards.length === 3) {
    const sorted = [...ranks].sort((x, y) => x - y);
    const is678 = sorted[0] === 6 && sorted[1] === 7 && sorted[2] === 8;
    const is777 = sorted[0] === 7 && sorted[1] === 7 && sorted[2] === 7;
    if (is678 || is777) {
      const allSame = suits[0] === suits[1] && suits[1] === suits[2];
      if (allSame && suits[0] === 3) return b.sequenceSpades;
      if (allSame) return b.sequenceSuited;
      return b.sequenceMixed;
    }
  }

  if (hand.cards.length >= 7) return b.sevenCard21;
  if (hand.cards.length === 6) return b.sixCard21;
  if (hand.cards.length === 5) return b.fiveCard21;
  return 0;
}

/** A five-card hand under 22 — Pontoon's second-best hand. */
export function bjIsFiveCardTrick(rules: BjRules, hand: BjHand): boolean {
  return (
    rules.fiveCardTrick !== null &&
    hand.cards.length >= 5 &&
    bjHandTotal(hand.cards).total <= 21
  );
}

// ── Settlement ──────────────────────────────────────────────────────────────

export interface BjHandSettlement {
  outcome: BjHandOutcome;
  /** Player's own stake on this hand (bet + any doubled amount they paid). */
  staked: number;
  /** Chips the house put up on this hand and that it settles alongside. */
  freeStaked: number;
  /** GROSS chips returned on this hand (the player's stake included). */
  payout: number;
  /** Profit multiple applied, for the UI to explain the number. */
  multiplier: number;
  total: number;
  /** Bonus profit paid on top, if the variant has one. */
  bonus: number;
}

/**
 * Settle one finished player hand against the finished dealer hand.
 *
 * The order matters and encodes each variant's character:
 *
 *  1. A surrender gives back half the stake and stops.
 *  2. A bust loses, always — no push, no dealer-22 rescue.
 *  3. A natural is paid at the variant's rate. Whether it survives a dealer
 *     natural depends on `player21AlwaysWins` (Spanish 21) or falls to the
 *     normal tie rule.
 *  4. A five-card trick (Pontoon) beats everything except a natural.
 *  5. `pushOnDealerTotal` (Free Bet's dealer 22) rescues every live hand.
 *  6. Otherwise compare totals, with `player21AlwaysWins` and `dealerWinsTies`
 *     deciding the edges.
 *
 * The house's own free-bet chips are returned to the house, never to the
 * player: a won free double pays the player the WINNINGS on it, not the stake.
 * That is why `payout` adds `freeStaked * multiplier` but never `freeStaked`.
 */
export function bjSettleHand(
  rules: BjRules,
  hand: BjHand,
  dealerCards: number[],
): BjHandSettlement {
  const staked = hand.bet;
  const freeStaked = hand.freeBet;
  const t = bjHandTotal(hand.cards);
  const dealer = bjHandTotal(dealerCards);
  const playerNatural = bjIsNatural(hand.cards) && !hand.fromSplit;
  const dealerNatural = bjIsNatural(dealerCards);

  const settle = (
    outcome: BjHandOutcome,
    multiplier: number,
    bonus = 0,
  ): BjHandSettlement => ({
    outcome,
    staked,
    freeStaked,
    // Gross to the player: their own stake back (unless they lost it), plus
    // winnings on both their stake and the house's free chips, plus bonuses.
    payout:
      multiplier < 0
        ? 0
        : Math.floor(staked + staked * multiplier + freeStaked * multiplier + bonus),
    multiplier,
    total: t.total,
    bonus: Math.floor(bonus),
  });

  if (hand.surrendered) {
    return {
      outcome: 'surrender',
      staked,
      freeStaked,
      payout: Math.floor(staked / 2),
      multiplier: -0.5,
      total: t.total,
      bonus: 0,
    };
  }

  if (t.total > 21) return settle('bust', -1);

  const bonusMult = bjBonusMultiplier(rules, hand);
  const bonus = bonusMult * staked;

  if (playerNatural) {
    if (dealerNatural && !rules.player21AlwaysWins) {
      return rules.dealerWinsTies ? settle('loss', -1) : settle('push', 0);
    }
    return settle('blackjack', rules.naturalPays);
  }

  // Pontoon's five-card trick outranks any ordinary total, including a dealer
  // 21 — but it still loses to a dealer Pontoon.
  if (bjIsFiveCardTrick(rules, hand)) {
    if (dealerNatural) return settle('loss', -1);
    return settle('five_card_trick', rules.fiveCardTrick as number, bonus);
  }

  if (dealerNatural) return settle('loss', -1);

  // Free Bet: the dealer busting on exactly 22 pushes instead of paying.
  if (rules.pushOnDealerTotal !== null && dealer.total === rules.pushOnDealerTotal) {
    return settle('push', 0, bonus);
  }

  if (dealer.total > 21) {
    return settle(bonusMult > 0 ? 'bonus_21' : 'win', 1, bonus);
  }

  // Spanish 21: your 21 wins even when the dealer has one too.
  if (rules.player21AlwaysWins && t.total === 21 && dealer.total === 21) {
    return settle(bonusMult > 0 ? 'bonus_21' : 'win', 1, bonus);
  }

  if (t.total > dealer.total) {
    return settle(bonusMult > 0 ? 'bonus_21' : 'win', 1, bonus);
  }
  if (t.total < dealer.total) return settle('loss', -1);
  return rules.dealerWinsTies ? settle('loss', -1) : settle('push', 0, bonus);
}

export interface BjRoundSettlement {
  hands: BjHandSettlement[];
  /** Everything the PLAYER put up across the round. */
  committed: number;
  /** Everything returned to the player. */
  totalPayout: number;
  won: boolean;
  dealerTotal: number;
  dealerBusted: boolean;
}

/** Settle every hand in a round against the finished dealer. */
export function bjSettleRound(
  rules: BjRules,
  hands: BjHand[],
  dealerCards: number[],
  sideBetsCommitted = 0,
  sideBetsPayout = 0,
): BjRoundSettlement {
  const settled = hands.map((h) => bjSettleHand(rules, h, dealerCards));
  const committed = settled.reduce((s, h) => s + h.staked, 0) + sideBetsCommitted;
  const totalPayout = settled.reduce((s, h) => s + h.payout, 0) + sideBetsPayout;
  const dealer = bjHandTotal(dealerCards);
  return {
    hands: settled,
    committed,
    totalPayout,
    won: totalPayout > committed,
    dealerTotal: dealer.total,
    dealerBusted: dealer.total > 21,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface BjValidation {
  ok: boolean;
  bet: number;
  error: string | null;
}

export function validateBjBet(rawBet: unknown): BjValidation {
  const l = betLimits('blackjack_variants');
  const bet = Math.floor(Number(rawBet));
  if (!Number.isFinite(bet) || bet < l.min || bet > l.max) {
    return {
      ok: false,
      bet: 0,
      error: `Bet must be between ${l.min.toLocaleString()} and ${l.max.toLocaleString()} chips.`,
    };
  }
  return { ok: true, bet, error: null };
}

/** The public shape of a variant, for the client's felt and rules panel. */
export function bjVariantInfo(rules: BjRules) {
  return {
    key: rules.key,
    name: rules.name,
    blurb: rules.blurb,
    deckSize: 52 - rules.removedRanks.length * 4,
    removedRanks: rules.removedRanks,
    hitsSoft17: rules.hitsSoft17,
    dealerExposed: rules.dealerExposed,
    dealerFullyHidden: rules.dealerFullyHidden,
    naturalPays: rules.naturalPays,
    dealerWinsTies: rules.dealerWinsTies,
    player21AlwaysWins: rules.player21AlwaysWins,
    pushOnDealerTotal: rules.pushOnDealerTotal,
    surrender: rules.surrender,
    minStand: rules.minStand,
    doubleOn: rules.doubleOn,
    doubleAnyCards: rules.doubleAnyCards,
    freeDoubleOn: rules.freeDoubleOn,
    freeSplit: rules.freeSplit,
    fiveCardTrick: rules.fiveCardTrick,
    bonuses: rules.bonuses,
    maxSplits: rules.maxSplits,
    highlights: rules.highlights,
  };
}
