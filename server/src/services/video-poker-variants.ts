/**
 * video-poker-variants.ts — the six video poker games, one engine.
 *
 * Video poker players don't play "video poker", they play a *paytable*. The
 * whole point of the machine is that Bonus Poker, Double Double Bonus and
 * Deuces Wild reward completely different draws, so the strategy changes even
 * though the cards don't. This module is the shared evaluator plus one spec per
 * variant; adding another paytable means adding a spec, not writing a game.
 *
 * Card encoding is the shared deck (provably-fair.service.ts):
 *   rank = (idx % 13) + 2   (2..14, 14 = Ace),  suit = floor(idx / 13)
 * Joker Poker deals from a 53-card deck where index 52 is the Joker.
 *
 * WILD CARDS. Deuces Wild treats every 2 as any card; Joker Poker treats the
 * single Joker the same way. A wild is resolved by brute force: try every card
 * it could stand for, score the resulting five, keep the best by the variant's
 * own ranking. That is slower than a hand-tuned lookup and completely immune to
 * the "clever" bugs that lookup tables attract — with at most three wilds to
 * resolve (four deuces short-circuits to its own category) it is ~25k cheap
 * evaluations, which is nothing next to the database round trip either side.
 *
 * Payouts are "for 1": the bet is taken at deal time and `bet * multiplier` is
 * returned at draw, so a multiplier of 1 is a push.
 */

export type VpVariant =
  | 'jacks_or_better'
  | 'bonus_poker'
  | 'double_bonus'
  | 'double_double_bonus'
  | 'deuces_wild'
  | 'joker_poker';

export type VpCategory =
  /** A royal with no wild card in it. Just "Royal Flush" in the non-wild games. */
  | 'royal_flush'
  | 'four_deuces'
  | 'five_of_a_kind'
  | 'wild_royal_flush'
  | 'straight_flush'
  | 'four_aces_with_kicker'
  | 'four_2_4_with_kicker'
  | 'four_aces'
  | 'four_2_4'
  | 'four_5_K'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'jacks_or_better'
  | 'kings_or_better'
  | 'nothing';

/** The Joker's card index in a 53-card deck. */
export const JOKER_INDEX = 52;

const BASE_CATEGORY_NAME: Record<VpCategory, string> = {
  royal_flush: 'Royal Flush',
  four_deuces: 'Four Deuces',
  five_of_a_kind: 'Five of a Kind',
  wild_royal_flush: 'Wild Royal Flush',
  straight_flush: 'Straight Flush',
  four_aces_with_kicker: 'Four Aces + 2/3/4',
  four_2_4_with_kicker: 'Four 2/3/4 + A/2/3/4',
  four_aces: 'Four Aces',
  four_2_4: 'Four 2s, 3s or 4s',
  four_5_K: 'Four 5s through Kings',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_of_a_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  jacks_or_better: 'Jacks or Better',
  kings_or_better: 'Kings or Better',
  nothing: 'No Win',
};

export interface VpVariantSpec {
  key: VpVariant;
  name: string;
  /** One line for the picker — what makes this paytable worth choosing. */
  blurb: string;
  /** 52, or 53 when a Joker is in play. */
  deckSize: 52 | 53;
  wild: 'none' | 'deuces' | 'joker';
  /**
   * Ranked best → worst. Doubles as the evaluation order (first match wins)
   * and the paytable render order, so the two can never drift apart.
   */
  order: VpCategory[];
  /** Category → coins returned per coin bet. */
  paytable: Partial<Record<VpCategory, number>>;
  /** Display-name overrides (e.g. "Natural Royal Flush" in the wild games). */
  names?: Partial<Record<VpCategory, string>>;
  /** Return to player in basis points, at optimal play. Documentation only. */
  rtpBp: number;
}

// ── The paytables ───────────────────────────────────────────────────────────
// Every one of these is a real, deployed casino paytable, and every one is
// under 100% return. Full-pay Deuces Wild (100.76%) and 10/7 Double Bonus
// (100.17%) are deliberately NOT used: they are player-advantage games.

const JACKS_OR_BETTER: VpVariantSpec = {
  key: 'jacks_or_better',
  name: 'Jacks or Better',
  blurb: 'The 9/6 original. Any pair of jacks up gets your money back.',
  deckSize: 52,
  wild: 'none',
  order: [
    'royal_flush',
    'straight_flush',
    'four_of_a_kind',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
    'two_pair',
    'jacks_or_better',
  ],
  paytable: {
    royal_flush: 800,
    straight_flush: 50,
    four_of_a_kind: 25,
    full_house: 9,
    flush: 6,
    straight: 4,
    three_of_a_kind: 3,
    two_pair: 2,
    jacks_or_better: 1,
  },
  rtpBp: 9954,
};

const BONUS_POKER: VpVariantSpec = {
  key: 'bonus_poker',
  name: 'Bonus Poker',
  blurb: 'Quads pay by rank — four aces are worth 80 for 1.',
  deckSize: 52,
  wild: 'none',
  order: [
    'royal_flush',
    'straight_flush',
    'four_aces',
    'four_2_4',
    'four_5_K',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
    'two_pair',
    'jacks_or_better',
  ],
  paytable: {
    royal_flush: 800,
    straight_flush: 50,
    four_aces: 80,
    four_2_4: 40,
    four_5_K: 25,
    full_house: 8,
    flush: 5,
    straight: 4,
    three_of_a_kind: 3,
    two_pair: 2,
    jacks_or_better: 1,
  },
  rtpBp: 9917,
};

const DOUBLE_BONUS: VpVariantSpec = {
  key: 'double_bonus',
  name: 'Double Bonus',
  blurb: 'Bigger quads and a 5-for-1 straight — paid for by a flat two pair.',
  deckSize: 52,
  wild: 'none',
  order: [
    'royal_flush',
    'straight_flush',
    'four_aces',
    'four_2_4',
    'four_5_K',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
    'two_pair',
    'jacks_or_better',
  ],
  // 9/7 Double Bonus. The 10/7 version returns 100.17% at optimal play, which
  // is a game the house loses — this is the standard casino step down.
  paytable: {
    royal_flush: 800,
    straight_flush: 50,
    four_aces: 160,
    four_2_4: 80,
    four_5_K: 50,
    full_house: 9,
    flush: 7,
    straight: 5,
    three_of_a_kind: 3,
    two_pair: 1,
    jacks_or_better: 1,
  },
  rtpBp: 9911,
};

const DOUBLE_DOUBLE_BONUS: VpVariantSpec = {
  key: 'double_double_bonus',
  name: 'Double Double Bonus',
  blurb: 'Four aces with the right kicker pay 400 for 1. The volatile one.',
  deckSize: 52,
  wild: 'none',
  order: [
    'royal_flush',
    'straight_flush',
    'four_aces_with_kicker',
    'four_2_4_with_kicker',
    'four_aces',
    'four_2_4',
    'four_5_K',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
    'two_pair',
    'jacks_or_better',
  ],
  paytable: {
    royal_flush: 800,
    straight_flush: 50,
    four_aces_with_kicker: 400,
    four_2_4_with_kicker: 160,
    four_aces: 160,
    four_2_4: 80,
    four_5_K: 50,
    full_house: 9,
    flush: 6,
    straight: 4,
    three_of_a_kind: 3,
    two_pair: 1,
    jacks_or_better: 1,
  },
  rtpBp: 9898,
};

const DEUCES_WILD: VpVariantSpec = {
  key: 'deuces_wild',
  name: 'Deuces Wild',
  blurb: 'Every 2 is any card. Nothing under three of a kind pays.',
  deckSize: 52,
  wild: 'deuces',
  order: [
    'royal_flush',
    'four_deuces',
    'wild_royal_flush',
    'five_of_a_kind',
    'straight_flush',
    'four_of_a_kind',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
  ],
  // "Illinois Deuces" — 98.91%. Full-pay Deuces (25/15/9/5/3/2/2) returns
  // 100.76%, so it is not on offer here.
  paytable: {
    royal_flush: 800,
    four_deuces: 200,
    wild_royal_flush: 25,
    five_of_a_kind: 12,
    straight_flush: 9,
    four_of_a_kind: 4,
    full_house: 4,
    flush: 3,
    straight: 2,
    three_of_a_kind: 1,
  },
  names: { royal_flush: 'Natural Royal Flush' },
  rtpBp: 9891,
};

const JOKER_POKER: VpVariantSpec = {
  key: 'joker_poker',
  name: 'Joker Poker',
  blurb: 'A 53-card deck with one wild Joker. Needs kings up to pay.',
  deckSize: 53,
  wild: 'joker',
  order: [
    'royal_flush',
    'five_of_a_kind',
    'wild_royal_flush',
    'straight_flush',
    'four_of_a_kind',
    'full_house',
    'flush',
    'straight',
    'three_of_a_kind',
    'two_pair',
    'kings_or_better',
  ],
  paytable: {
    royal_flush: 800,
    five_of_a_kind: 200,
    wild_royal_flush: 100,
    straight_flush: 50,
    four_of_a_kind: 20,
    full_house: 7,
    flush: 5,
    straight: 3,
    three_of_a_kind: 2,
    two_pair: 1,
    kings_or_better: 1,
  },
  names: { royal_flush: 'Natural Royal Flush' },
  rtpBp: 9860,
};

export const VP_VARIANTS: Record<VpVariant, VpVariantSpec> = {
  jacks_or_better: JACKS_OR_BETTER,
  bonus_poker: BONUS_POKER,
  double_bonus: DOUBLE_BONUS,
  double_double_bonus: DOUBLE_DOUBLE_BONUS,
  deuces_wild: DEUCES_WILD,
  joker_poker: JOKER_POKER,
};

/** Picker order — the familiar games first, the wild ones after. */
export const VP_VARIANT_KEYS: VpVariant[] = [
  'jacks_or_better',
  'bonus_poker',
  'double_bonus',
  'double_double_bonus',
  'deuces_wild',
  'joker_poker',
];

export function isVpVariant(v: unknown): v is VpVariant {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VP_VARIANTS, v);
}

/** Resolve a variant key, falling back to the original game. */
export function vpSpec(v: unknown): VpVariantSpec {
  return isVpVariant(v) ? VP_VARIANTS[v] : JACKS_OR_BETTER;
}

/** Display name for a category under a given variant. */
export function vpCategoryName(spec: VpVariantSpec, cat: VpCategory): string {
  return spec.names?.[cat] ?? BASE_CATEGORY_NAME[cat];
}

/** Every category name a variant can show, for the client's paytable. */
export function vpCategoryNames(spec: VpVariantSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of spec.order) out[c] = vpCategoryName(spec, c);
  out.nothing = BASE_CATEGORY_NAME.nothing;
  return out;
}

// ── Hand analysis ───────────────────────────────────────────────────────────

function rankOf(idx: number): number {
  return (idx % 13) + 2;
}

function suitOf(idx: number): number {
  return Math.floor(idx / 13);
}

/** Is this card wild under the variant's rule? */
export function isWild(idx: number, spec: VpVariantSpec): boolean {
  if (spec.wild === 'deuces') return idx !== JOKER_INDEX && rankOf(idx) === 2;
  if (spec.wild === 'joker') return idx === JOKER_INDEX;
  return false;
}

interface Made {
  isFlush: boolean;
  isStraight: boolean;
  isRoyal: boolean;
  /** Rank multiplicities, descending: [4,1] for quads, [3,2] for a boat. */
  shape: number[];
  quadRank: number | null;
  /** The odd card alongside quads — the kicker the Double Double tiers need. */
  quadKicker: number | null;
  tripRank: number | null;
  pairRanks: number[];
  fiveOfAKind: boolean;
}

/** Classify five CONCRETE cards (wilds already resolved to real cards). */
function analyse(cards: number[]): Made {
  const ranks = cards.map(rankOf);
  const suits = cards.map(suitOf);

  const byRank = new Map<number, number>();
  for (const r of ranks) byRank.set(r, (byRank.get(r) ?? 0) + 1);
  const shape = [...byRank.values()].sort((a, b) => b - a);

  let quadRank: number | null = null;
  let tripRank: number | null = null;
  const pairRanks: number[] = [];
  let fiveOfAKind = false;
  for (const [r, n] of byRank) {
    if (n >= 5) fiveOfAKind = true;
    else if (n === 4) quadRank = r;
    else if (n === 3) tripRank = r;
    else if (n === 2) pairRanks.push(r);
  }
  pairRanks.sort((a, b) => b - a);

  let quadKicker: number | null = null;
  if (quadRank !== null) {
    const odd = ranks.find((r) => r !== quadRank);
    quadKicker = odd ?? null;
  }

  const isFlush = suits.every((s) => s === suits[0]);

  // Straights: five distinct ranks in sequence, with the wheel (A-2-3-4-5)
  // scored as five-high.
  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  let isStraight = false;
  let isRoyal = false;
  if (distinct.length === 5) {
    const run = distinct[4] - distinct[0] === 4;
    const wheel =
      distinct[0] === 2 && distinct[1] === 3 && distinct[2] === 4 && distinct[3] === 5 && distinct[4] === 14;
    isStraight = run || wheel;
    isRoyal = isFlush && run && distinct[0] === 10;
  }

  return {
    isFlush,
    isStraight,
    isRoyal,
    shape,
    quadRank,
    quadKicker,
    tripRank,
    pairRanks,
    fiveOfAKind,
  };
}

const LOW_QUADS = new Set([2, 3, 4]);
const DDB_ACE_KICKERS = new Set([2, 3, 4]);
const DDB_LOW_KICKERS = new Set([14, 2, 3, 4]);

/** Does a concrete five-card hand satisfy this category? */
function matches(cat: VpCategory, m: Made, usedWild: boolean): boolean {
  switch (cat) {
    case 'royal_flush':
      return m.isRoyal && !usedWild;
    case 'wild_royal_flush':
      return m.isRoyal && usedWild;
    case 'five_of_a_kind':
      return m.fiveOfAKind;
    case 'straight_flush':
      return m.isStraight && m.isFlush && !m.isRoyal;
    case 'four_aces_with_kicker':
      return m.quadRank === 14 && m.quadKicker !== null && DDB_ACE_KICKERS.has(m.quadKicker);
    case 'four_2_4_with_kicker':
      return (
        m.quadRank !== null &&
        LOW_QUADS.has(m.quadRank) &&
        m.quadKicker !== null &&
        DDB_LOW_KICKERS.has(m.quadKicker)
      );
    case 'four_aces':
      return m.quadRank === 14;
    case 'four_2_4':
      return m.quadRank !== null && LOW_QUADS.has(m.quadRank);
    case 'four_5_K':
      return m.quadRank !== null && m.quadRank >= 5 && m.quadRank <= 13;
    case 'four_of_a_kind':
      return m.quadRank !== null;
    case 'full_house':
      return m.tripRank !== null && m.pairRanks.length === 1;
    case 'flush':
      return m.isFlush;
    case 'straight':
      return m.isStraight;
    case 'three_of_a_kind':
      return m.tripRank !== null;
    case 'two_pair':
      return m.pairRanks.length === 2;
    case 'jacks_or_better':
      return m.pairRanks.length === 1 && m.pairRanks[0] >= 11;
    case 'kings_or_better':
      return m.pairRanks.length === 1 && m.pairRanks[0] >= 13;
    case 'four_deuces':
      // Handled before wilds are resolved — a resolved hand has no deuces left
      // to count, so this can never match here.
      return false;
    default:
      return false;
  }
}

/** Best category for a concrete five, by this variant's own ranking. */
function bestOf(cards: number[], spec: VpVariantSpec, usedWild: boolean): number {
  const m = analyse(cards);
  for (let i = 0; i < spec.order.length; i++) {
    if (matches(spec.order[i], m, usedWild)) return i;
  }
  return spec.order.length; // "nothing"
}

/**
 * Every combination-with-repetition of `k` cards from the standard 52. Wilds
 * may stand for a card already in the hand — that is what makes five of a kind
 * reachable — so repetition is allowed and the Joker is never a substitute.
 */
function wildSubstitutions(k: number): number[][] {
  // Three is the real ceiling: Joker Poker has one wild, and a four-deuce hand
  // never reaches here. The guard exists so a future variant with five wilds
  // fails loudly instead of quietly hanging on 3.5M combinations.
  if (k > 3) throw new Error(`Too many wilds to resolve (${k})`);
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (start: number, left: number) => {
    if (left === 0) {
      out.push(cur.slice());
      return;
    }
    for (let c = start; c < 52; c++) {
      cur.push(c);
      walk(c, left - 1);
      cur.pop();
    }
  };
  walk(0, k);
  return out;
}

export interface VpEvaluation {
  category: VpCategory;
  categoryName: string;
  /** Coins returned per coin bet (0 for a losing hand). */
  multiplier: number;
  /** True when a wild card was needed to make the hand. */
  usedWild: boolean;
}

/**
 * Score a final five-card hand under a variant.
 *
 * @param finalHand exactly 5 card indices (0-51, or 52 for the Joker)
 */
export function evaluateVpHand(finalHand: number[], spec: VpVariantSpec): VpEvaluation {
  if (finalHand.length !== 5) {
    throw new Error('A video poker hand must be exactly 5 cards');
  }
  if (new Set(finalHand).size !== 5) {
    throw new Error('Video poker hand has duplicate cards');
  }

  const wildIdx: number[] = [];
  const naturals: number[] = [];
  for (const c of finalHand) {
    if (isWild(c, spec)) wildIdx.push(c);
    else naturals.push(c);
  }

  const settle = (cat: VpCategory): VpEvaluation => ({
    category: cat,
    categoryName: vpCategoryName(spec, cat),
    multiplier: spec.paytable[cat] ?? 0,
    usedWild: wildIdx.length > 0,
  });

  // Four deuces is its own top-tier category and the fifth card is irrelevant,
  // so it short-circuits before any substitution work.
  if (spec.wild === 'deuces' && wildIdx.length === 4 && spec.order.includes('four_deuces')) {
    return settle('four_deuces');
  }

  if (wildIdx.length === 0) {
    const idx = bestOf(finalHand, spec, false);
    return settle(idx < spec.order.length ? spec.order[idx] : 'nothing');
  }

  let bestIdx = spec.order.length;
  for (const sub of wildSubstitutions(wildIdx.length)) {
    const idx = bestOf([...naturals, ...sub], spec, true);
    if (idx < bestIdx) {
      bestIdx = idx;
      if (bestIdx === 0) break; // can't do better than the top category
    }
  }
  return settle(bestIdx < spec.order.length ? spec.order[bestIdx] : 'nothing');
}

export interface VpResult {
  category: VpCategory;
  categoryName: string;
  multiplier: number;
  /** Total chips returned to the player: bet * multiplier (0 on a loss). */
  payout: number;
  usedWild: boolean;
}

/** Score a hand and price it. */
export function resolveVpHand(finalHand: number[], bet: number, spec: VpVariantSpec): VpResult {
  const e = evaluateVpHand(finalHand, spec);
  return { ...e, payout: Math.round(bet * e.multiplier) };
}

/** The public shape of a variant, for the client's picker and paytable. */
export function vpVariantInfo(spec: VpVariantSpec) {
  return {
    key: spec.key,
    name: spec.name,
    blurb: spec.blurb,
    deckSize: spec.deckSize,
    wild: spec.wild,
    order: spec.order,
    paytable: spec.paytable,
    names: vpCategoryNames(spec),
    rtpBp: spec.rtpBp,
  };
}
