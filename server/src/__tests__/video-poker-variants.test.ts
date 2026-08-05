/**
 * Unit tests for the video poker variant engine
 * (server/src/services/video-poker-variants.ts).
 *
 * Six paytables share one evaluator, so a bug here misprices every game at
 * once. The wild-card games get the most attention: five of a kind and wild
 * royals only exist because a wild can stand for a card that is already in the
 * hand, and that is exactly the case a naive evaluator gets wrong.
 */

import {
  evaluateVpHand,
  isWild,
  resolveVpHand,
  vpSpec,
  JOKER_INDEX,
  VP_VARIANTS,
  VP_VARIANT_KEYS,
} from '../services/video-poker-variants';

const H = 0;
const D = 1;
const C = 2;
const S = 3;

/** Build a card index (0-51) from a rank (2-14, 14 = Ace) and suit (0-3). */
function card(rank: number, suit: number): number {
  return suit * 13 + (rank - 2);
}

const JOB = VP_VARIANTS.jacks_or_better;
const BONUS = VP_VARIANTS.bonus_poker;
const DBL = VP_VARIANTS.double_bonus;
const DDB = VP_VARIANTS.double_double_bonus;
const DEUCES = VP_VARIANTS.deuces_wild;
const JOKER = VP_VARIANTS.joker_poker;

const ROYAL_SPADES = [card(10, S), card(11, S), card(12, S), card(13, S), card(14, S)];
const FOUR_ACES = [card(14, S), card(14, H), card(14, D), card(14, C)];

describe('every variant is well formed', () => {
  it('prices every category it ranks', () => {
    for (const k of VP_VARIANT_KEYS) {
      const spec = VP_VARIANTS[k];
      for (const cat of spec.order) {
        expect(typeof spec.paytable[cat]).toBe('number');
      }
    }
  });

  // `order` is the evaluation order (first match wins), NOT a pay ranking —
  // real bonus paytables aren't monotonic (four aces beats a straight flush on
  // money but not on poker rank). What has to hold is narrower: wherever one
  // category is a special case of another, the special case must come first and
  // must never pay less, or a qualifying hand would be settled at the cheaper
  // tier.
  const SPECIALISATIONS: Array<[string, string]> = [
    ['four_aces_with_kicker', 'four_aces'],
    ['four_2_4_with_kicker', 'four_2_4'],
    ['four_aces', 'four_of_a_kind'],
    ['four_2_4', 'four_of_a_kind'],
    ['four_5_K', 'four_of_a_kind'],
    ['royal_flush', 'straight_flush'],
    ['wild_royal_flush', 'straight_flush'],
    ['five_of_a_kind', 'four_of_a_kind'],
    ['full_house', 'three_of_a_kind'],
    ['two_pair', 'jacks_or_better'],
    ['two_pair', 'kings_or_better'],
  ];

  it('puts every special case ahead of the category it refines', () => {
    for (const k of VP_VARIANT_KEYS) {
      const spec = VP_VARIANTS[k];
      for (const [special, general] of SPECIALISATIONS) {
        const si = spec.order.indexOf(special as never);
        const gi = spec.order.indexOf(general as never);
        if (si === -1 || gi === -1) continue;
        expect(si < gi).toBe(true);
        const sp = spec.paytable[special as never] as number;
        const gp = spec.paytable[general as never] as number;
        expect(sp >= gp).toBe(true);
      }
    }
  });

  it('keeps every paytable under a 100% return', () => {
    // A player-advantage paytable (full-pay Deuces, 10/7 Double Bonus) is a
    // game the house loses. None of these should ever slip over the line.
    for (const k of VP_VARIANT_KEYS) {
      expect(VP_VARIANTS[k].rtpBp < 10_000).toBe(true);
    }
  });

  it('falls back to jacks or better for an unknown variant', () => {
    expect(vpSpec('not_a_game').key).toBe('jacks_or_better');
    expect(vpSpec(undefined).key).toBe('jacks_or_better');
    expect(vpSpec('deuces_wild').key).toBe('deuces_wild');
  });
});

describe('wild-card identification', () => {
  it('treats every 2 as wild in deuces wild only', () => {
    expect(isWild(card(2, S), DEUCES)).toBe(true);
    expect(isWild(card(2, S), JOB)).toBe(false);
    expect(isWild(card(3, S), DEUCES)).toBe(false);
  });

  it('treats only the joker as wild in joker poker', () => {
    expect(isWild(JOKER_INDEX, JOKER)).toBe(true);
    expect(isWild(card(2, S), JOKER)).toBe(false);
  });
});

describe('jacks or better — unchanged 9/6', () => {
  const cases: Array<[string, number[], string, number]> = [
    ['royal flush', ROYAL_SPADES, 'royal_flush', 800],
    [
      'straight flush',
      [card(9, H), card(10, H), card(11, H), card(12, H), card(13, H)],
      'straight_flush',
      50,
    ],
    ['four of a kind', [...FOUR_ACES, card(9, S)], 'four_of_a_kind', 25],
    [
      'full house',
      [card(9, S), card(9, H), card(9, D), card(4, C), card(4, S)],
      'full_house',
      9,
    ],
    ['flush', [card(2, S), card(5, S), card(9, S), card(11, S), card(13, S)], 'flush', 6],
    ['straight', [card(5, S), card(6, H), card(7, D), card(8, C), card(9, S)], 'straight', 4],
    [
      'three of a kind',
      [card(9, S), card(9, H), card(9, D), card(4, C), card(2, S)],
      'three_of_a_kind',
      3,
    ],
    ['two pair', [card(9, S), card(9, H), card(4, D), card(4, C), card(2, S)], 'two_pair', 2],
    [
      'jacks or better',
      [card(11, S), card(11, H), card(4, D), card(7, C), card(2, S)],
      'jacks_or_better',
      1,
    ],
  ];

  for (const [name, hand, cat, mult] of cases) {
    it(name, () => {
      const r = evaluateVpHand(hand, JOB);
      expect(r.category).toBe(cat);
      expect(r.multiplier).toBe(mult);
    });
  }

  it('pays nothing for a pair of tens', () => {
    const r = evaluateVpHand([card(10, S), card(10, H), card(4, D), card(7, C), card(2, S)], JOB);
    expect(r.category).toBe('nothing');
    expect(r.multiplier).toBe(0);
  });

  it('scores the wheel as a straight', () => {
    const r = evaluateVpHand([card(14, S), card(2, H), card(3, D), card(4, C), card(5, S)], JOB);
    expect(r.category).toBe('straight');
  });
});

describe('bonus poker — quads pay by rank', () => {
  it('pays four aces 80', () => {
    expect(evaluateVpHand([...FOUR_ACES, card(9, S)], BONUS).multiplier).toBe(80);
  });

  it('pays four low cards 40', () => {
    const hand = [card(3, S), card(3, H), card(3, D), card(3, C), card(9, S)];
    const r = evaluateVpHand(hand, BONUS);
    expect(r.category).toBe('four_2_4');
    expect(r.multiplier).toBe(40);
  });

  it('pays four mid cards 25', () => {
    const hand = [card(9, S), card(9, H), card(9, D), card(9, C), card(3, S)];
    const r = evaluateVpHand(hand, BONUS);
    expect(r.category).toBe('four_5_K');
    expect(r.multiplier).toBe(25);
  });
});

describe('double bonus — 9/7, and it takes the money back on two pair', () => {
  it('pays four aces 160', () => {
    expect(evaluateVpHand([...FOUR_ACES, card(9, S)], DBL).multiplier).toBe(160);
  });

  it('pays a straight 5', () => {
    const hand = [card(5, S), card(6, H), card(7, D), card(8, C), card(9, S)];
    expect(evaluateVpHand(hand, DBL).multiplier).toBe(5);
  });

  it('flattens two pair to a push', () => {
    const hand = [card(9, S), card(9, H), card(4, D), card(4, C), card(2, S)];
    const r = evaluateVpHand(hand, DBL);
    expect(r.category).toBe('two_pair');
    expect(r.multiplier).toBe(1);
  });
});

describe('double double bonus — the kicker tiers', () => {
  it('pays four aces with a low kicker 400', () => {
    const r = evaluateVpHand([...FOUR_ACES, card(3, S)], DDB);
    expect(r.category).toBe('four_aces_with_kicker');
    expect(r.multiplier).toBe(400);
  });

  it('drops to 160 when the kicker is wrong', () => {
    const r = evaluateVpHand([...FOUR_ACES, card(9, S)], DDB);
    expect(r.category).toBe('four_aces');
    expect(r.multiplier).toBe(160);
  });

  it('pays four low cards with an ace kicker 160', () => {
    const hand = [card(3, S), card(3, H), card(3, D), card(3, C), card(14, S)];
    const r = evaluateVpHand(hand, DDB);
    expect(r.category).toBe('four_2_4_with_kicker');
    expect(r.multiplier).toBe(160);
  });

  it('drops to 80 when the kicker is wrong', () => {
    const hand = [card(3, S), card(3, H), card(3, D), card(3, C), card(9, S)];
    const r = evaluateVpHand(hand, DDB);
    expect(r.category).toBe('four_2_4');
    expect(r.multiplier).toBe(80);
  });

  it('pays four mid cards 50 with no kicker tier', () => {
    const hand = [card(9, S), card(9, H), card(9, D), card(9, C), card(14, S)];
    const r = evaluateVpHand(hand, DDB);
    expect(r.category).toBe('four_5_K');
    expect(r.multiplier).toBe(50);
  });
});

describe('deuces wild', () => {
  it('pays a natural royal 800 and marks it as wild-free', () => {
    const r = evaluateVpHand(ROYAL_SPADES, DEUCES);
    expect(r.category).toBe('royal_flush');
    expect(r.multiplier).toBe(800);
    expect(r.usedWild).toBe(false);
  });

  it('pays four deuces 200 whatever the fifth card is', () => {
    const hand = [card(2, S), card(2, H), card(2, D), card(2, C), card(9, S)];
    const r = evaluateVpHand(hand, DEUCES);
    expect(r.category).toBe('four_deuces');
    expect(r.multiplier).toBe(200);
  });

  it('completes a wild royal for 25', () => {
    const hand = [card(2, H), card(11, S), card(12, S), card(13, S), card(14, S)];
    const r = evaluateVpHand(hand, DEUCES);
    expect(r.category).toBe('wild_royal_flush');
    expect(r.multiplier).toBe(25);
    expect(r.usedWild).toBe(true);
  });

  it('makes five of a kind from four naturals plus a deuce', () => {
    const r = evaluateVpHand([...FOUR_ACES, card(2, S)], DEUCES);
    expect(r.category).toBe('five_of_a_kind');
    expect(r.multiplier).toBe(12);
  });

  it('makes five of a kind from a pair plus three deuces', () => {
    // Three wilds is the deepest search the engine ever runs.
    const hand = [card(2, S), card(2, H), card(2, D), card(13, S), card(13, C)];
    const r = evaluateVpHand(hand, DEUCES);
    expect(r.category).toBe('five_of_a_kind');
  });

  it('completes a straight flush', () => {
    const hand = [card(2, H), card(3, S), card(4, S), card(5, S), card(6, S)];
    const r = evaluateVpHand(hand, DEUCES);
    expect(r.category).toBe('straight_flush');
    expect(r.multiplier).toBe(9);
  });

  it('turns a pair plus a deuce into three of a kind', () => {
    const hand = [card(2, H), card(13, S), card(13, D), card(7, C), card(4, S)];
    const r = evaluateVpHand(hand, DEUCES);
    expect(r.category).toBe('three_of_a_kind');
    expect(r.multiplier).toBe(1);
  });

  it('pays nothing for a bare pair', () => {
    const hand = [card(14, S), card(14, H), card(7, D), card(9, C), card(11, S)];
    expect(evaluateVpHand(hand, DEUCES).multiplier).toBe(0);
  });

  it('pays nothing for junk', () => {
    const hand = [card(3, S), card(5, D), card(7, C), card(9, H), card(11, S)];
    expect(evaluateVpHand(hand, DEUCES).category).toBe('nothing');
  });
});

describe('joker poker', () => {
  it('pays a natural royal 800', () => {
    const r = evaluateVpHand(ROYAL_SPADES, JOKER);
    expect(r.category).toBe('royal_flush');
    expect(r.multiplier).toBe(800);
  });

  it('makes five of a kind with the joker', () => {
    const hand = [JOKER_INDEX, card(13, S), card(13, H), card(13, D), card(13, C)];
    const r = evaluateVpHand(hand, JOKER);
    expect(r.category).toBe('five_of_a_kind');
    expect(r.multiplier).toBe(200);
  });

  it('completes a wild royal for 100', () => {
    const hand = [JOKER_INDEX, card(11, S), card(12, S), card(13, S), card(14, S)];
    const r = evaluateVpHand(hand, JOKER);
    expect(r.category).toBe('wild_royal_flush');
    expect(r.multiplier).toBe(100);
  });

  it('needs kings up to pay a pair', () => {
    const kings = [card(13, S), card(13, H), card(4, D), card(7, C), card(9, S)];
    const queens = [card(12, S), card(12, H), card(4, D), card(7, C), card(9, S)];
    expect(evaluateVpHand(kings, JOKER).category).toBe('kings_or_better');
    expect(evaluateVpHand(queens, JOKER).multiplier).toBe(0);
  });

  it('pays two pair', () => {
    const hand = [card(13, S), card(13, H), card(3, D), card(3, C), card(9, S)];
    expect(evaluateVpHand(hand, JOKER).category).toBe('two_pair');
  });

  it('turns a pair plus the joker into three of a kind', () => {
    const hand = [JOKER_INDEX, card(12, S), card(12, H), card(3, D), card(7, C)];
    const r = evaluateVpHand(hand, JOKER);
    expect(r.category).toBe('three_of_a_kind');
    expect(r.multiplier).toBe(2);
  });
});

describe('resolveVpHand prices the bet', () => {
  it('multiplies the stake by the paytable', () => {
    expect(resolveVpHand(ROYAL_SPADES, 100, JOB).payout).toBe(80_000);
    expect(resolveVpHand([...FOUR_ACES, card(3, S)], 50, DDB).payout).toBe(20_000);
  });

  it('pays zero on a losing hand', () => {
    const junk = [card(3, S), card(5, D), card(7, C), card(9, H), card(12, S)];
    expect(resolveVpHand(junk, 100, JOB).payout).toBe(0);
  });

  it('rejects a malformed hand', () => {
    expect(() => evaluateVpHand([1, 2, 3], JOB)).toThrow();
    expect(() => evaluateVpHand([1, 1, 2, 3, 4], JOB)).toThrow();
  });
});
