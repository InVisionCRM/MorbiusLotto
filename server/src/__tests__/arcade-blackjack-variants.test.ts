/**
 * Unit tests for the blackjack variant engine
 * (server/src/services/arcade-blackjack-variants.ts).
 *
 * Four games share one settlement function, so a mistake here misprices all of
 * them at once. The tests are organised around the rules that actually differ,
 * because those are the ones an implementation gets wrong:
 *
 *   Spanish 21      — your 21 always wins; bonuses die on a double or a split
 *   Double Exposure — the dealer takes every tie; a natural pays even money
 *   Pontoon         — five cards under 22 outranks a dealer 21; can't stick <15
 *   Free Bet        — the house's chips win but are never returned as stake,
 *                     and a dealer 22 pushes instead of losing
 */

import {
  BJ_SUPER_MATCH_PAY,
  BJ_VARIANTS,
  BJ_VARIANT_KEYS,
  bjBonusMultiplier,
  bjDealerDraws,
  bjDeckFor,
  bjDoubleIsFree,
  bjHandTotal,
  bjIsFiveCardTrick,
  bjIsNatural,
  bjIsPair,
  bjIsTenPair,
  bjLegalActions,
  bjNewHand,
  bjPlayDealer,
  bjRules,
  bjSettleHand,
  bjSettleRound,
  bjSplitIsFree,
  bjStakeUnit,
  bjSuperMatch,
  bjSuperMatchPayout,
  bjSwitchHands,
  validateBjBet,
  type BjHand,
} from '../services/arcade-blackjack-variants';

const H = 0;
const D = 1;
const C = 2;
const S = 3;

/** Card index 0-51 from rank (1=A, 11/12/13=J/Q/K) and suit. */
function card(rank: number, suit: number): number {
  return suit * 13 + (rank - 1);
}

const SPANISH = BJ_VARIANTS.spanish21;
const EXPOSURE = BJ_VARIANTS.double_exposure;
const PONTOON = BJ_VARIANTS.pontoon;
const FREEBET = BJ_VARIANTS.free_bet;
const SWITCH = BJ_VARIANTS.switch;

/** A finished player hand, ready to settle. */
function hand(cards: number[], bet = 100, extra: Partial<BjHand> = {}): BjHand {
  return { ...bjNewHand(cards, bet), done: true, ...extra };
}

const ACE = (s: number) => card(1, s);
const KING = (s: number) => card(13, s);

describe('card values and totals', () => {
  it('counts an ace as 11 until the hand would bust', () => {
    expect(bjHandTotal([ACE(H), card(6, D)])).toEqual({ total: 17, soft: true });
    expect(bjHandTotal([ACE(H), card(6, D), KING(C)])).toEqual({ total: 17, soft: false });
  });

  it('demotes only as many aces as it has to', () => {
    expect(bjHandTotal([ACE(H), ACE(D)])).toEqual({ total: 12, soft: true });
    expect(bjHandTotal([ACE(H), ACE(D), card(9, C)])).toEqual({ total: 21, soft: true });
  });

  it('counts every face card as ten', () => {
    expect(bjHandTotal([card(11, H), card(12, D)]).total).toBe(20);
    expect(bjHandTotal([card(13, H), card(10, D)]).total).toBe(20);
  });

  it('recognises a natural only on exactly two cards', () => {
    expect(bjIsNatural([ACE(H), KING(D)])).toBe(true);
    expect(bjIsNatural([card(7, H), card(7, D), card(7, C)])).toBe(false);
  });

  it('treats any two ten-value cards as a splittable pair', () => {
    expect(bjIsPair([KING(H), card(12, D)])).toBe(true);
    expect(bjIsTenPair([KING(H), card(12, D)])).toBe(true);
    expect(bjIsPair([card(9, H), card(9, D)])).toBe(true);
    expect(bjIsTenPair([card(9, H), card(9, D)])).toBe(false);
    expect(bjIsPair([card(9, H), card(8, D)])).toBe(false);
  });
});

describe('the Spanish deck', () => {
  it('strips all four tens and leaves the faces alone', () => {
    const full = Array.from({ length: 52 }, (_, i) => i);
    const spanish = bjDeckFor(SPANISH, full);
    expect(spanish).toHaveLength(48);
    expect(spanish.some((c) => (c % 13) + 1 === 10)).toBe(false);
    expect(spanish.filter((c) => (c % 13) + 1 === 13)).toHaveLength(4);
  });

  it('leaves every other variant on the full 52', () => {
    const full = Array.from({ length: 52 }, (_, i) => i);
    expect(bjDeckFor(EXPOSURE, full)).toHaveLength(52);
    expect(bjDeckFor(PONTOON, full)).toHaveLength(52);
    expect(bjDeckFor(FREEBET, full)).toHaveLength(52);
  });
});

describe('the dealer', () => {
  it('draws on soft 17 in every one of these games', () => {
    for (const k of BJ_VARIANT_KEYS) {
      expect(bjDealerDraws(BJ_VARIANTS[k], [ACE(H), card(6, D)])).toBe(true);
    }
  });

  it('stands on hard 17', () => {
    expect(bjDealerDraws(SPANISH, [KING(H), card(7, D)])).toBe(false);
  });

  it('draws to 17 and stops', () => {
    // Deck feeds a 5 then a 9; the dealer takes the 5 to reach 17 and stands.
    const deck = [card(5, C), card(9, S)];
    const out = bjPlayDealer(SPANISH, [card(6, H), card(6, D)], deck, 0);
    expect(bjHandTotal(out.cards).total).toBe(17);
    expect(out.cursor).toBe(1);
  });
});

describe('legal actions', () => {
  it('offers the full menu on a fresh Spanish 21 pair', () => {
    const h = bjNewHand([card(8, H), card(8, D)], 100);
    expect(bjLegalActions(SPANISH, h, 0).sort()).toEqual(
      ['double', 'hit', 'split', 'stand', 'surrender'].sort(),
    );
  });

  it('lets Spanish 21 double on a third card, and Double Exposure not', () => {
    const three = bjNewHand([card(4, H), card(3, D), card(2, C)], 100);
    expect(bjLegalActions(SPANISH, three, 0)).toContain('double');
    expect(bjLegalActions(EXPOSURE, three, 0)).not.toContain('double');
  });

  it('restricts Double Exposure doubles to hard 9, 10 and 11', () => {
    const nine = bjNewHand([card(4, H), card(5, D)], 100);
    const twelve = bjNewHand([card(5, H), card(7, D)], 100);
    const softSixteen = bjNewHand([ACE(H), card(5, D)], 100);
    expect(bjLegalActions(EXPOSURE, nine, 0)).toContain('double');
    expect(bjLegalActions(EXPOSURE, twelve, 0)).not.toContain('double');
    expect(bjLegalActions(EXPOSURE, softSixteen, 0)).not.toContain('double');
  });

  it('will not let a Pontoon player stick below 15', () => {
    const low = bjNewHand([card(6, H), card(8, D)], 100); // 14
    const ok = bjNewHand([card(7, H), card(8, D)], 100); // 15
    expect(bjLegalActions(PONTOON, low, 0)).not.toContain('stand');
    expect(bjLegalActions(PONTOON, ok, 0)).toContain('stand');
  });

  it('offers surrender only in Spanish 21, and only on the first decision', () => {
    const fresh = bjNewHand([card(9, H), card(7, D)], 100);
    expect(bjLegalActions(SPANISH, fresh, 0)).toContain('surrender');
    expect(bjLegalActions(EXPOSURE, fresh, 0)).not.toContain('surrender');
    expect(bjLegalActions(PONTOON, fresh, 0)).not.toContain('surrender');
    expect(bjLegalActions(FREEBET, fresh, 0)).not.toContain('surrender');

    const drawn = bjNewHand([card(9, H), card(4, D), card(3, C)], 100);
    expect(bjLegalActions(SPANISH, drawn, 0)).not.toContain('surrender');
  });

  it('stops offering a split once the cap is reached', () => {
    const pair = bjNewHand([card(8, H), card(8, D)], 100);
    expect(bjLegalActions(EXPOSURE, pair, 0)).toContain('split');
    expect(bjLegalActions(EXPOSURE, pair, 1)).not.toContain('split');
  });

  it('gives a finished or busted hand nothing to do', () => {
    expect(bjLegalActions(SPANISH, hand([KING(H), card(9, D)]), 0)).toEqual([]);
    const bust = bjNewHand([KING(H), card(9, D), card(5, C)], 100);
    expect(bjLegalActions(SPANISH, bust, 0)).toEqual([]);
  });

  it('gives a 21 nothing to do', () => {
    expect(bjLegalActions(SPANISH, bjNewHand([ACE(H), KING(D)], 100), 0)).toEqual([]);
  });
});

describe('Free Bet — what the house buys', () => {
  it('buys the double on hard 9, 10 and 11 only', () => {
    expect(bjDoubleIsFree(FREEBET, bjNewHand([card(4, H), card(5, D)], 100))).toBe(true);
    expect(bjDoubleIsFree(FREEBET, bjNewHand([card(6, H), card(5, D)], 100))).toBe(true);
    expect(bjDoubleIsFree(FREEBET, bjNewHand([card(9, H), card(3, D)], 100))).toBe(false);
    // Soft 11 (A + nothing useful) is not a free double.
    expect(bjDoubleIsFree(FREEBET, bjNewHand([ACE(H), card(9, D)], 100))).toBe(false);
  });

  it('buys any split except tens', () => {
    expect(bjSplitIsFree(FREEBET, bjNewHand([card(8, H), card(8, D)], 100))).toBe(true);
    expect(bjSplitIsFree(FREEBET, bjNewHand([ACE(H), ACE(D)], 100))).toBe(true);
    expect(bjSplitIsFree(FREEBET, bjNewHand([KING(H), card(12, D)], 100))).toBe(false);
  });

  it('buys nothing in the other three games', () => {
    const nine = bjNewHand([card(4, H), card(5, D)], 100);
    const pair = bjNewHand([card(8, H), card(8, D)], 100);
    for (const rules of [SPANISH, EXPOSURE, PONTOON]) {
      expect(bjDoubleIsFree(rules, nine)).toBe(false);
      expect(bjSplitIsFree(rules, pair)).toBe(false);
    }
  });
});

describe('settlement — the basics, on Spanish 21', () => {
  const dealer20 = [KING(C), card(12, S)];

  it('pays a natural 3:2', () => {
    const s = bjSettleHand(SPANISH, hand([ACE(H), KING(D)]), dealer20);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(250); // 100 back + 150 profit
  });

  it('takes everything on a bust', () => {
    const s = bjSettleHand(SPANISH, hand([KING(H), card(9, D), card(5, C)]), dealer20);
    expect(s.outcome).toBe('bust');
    expect(s.payout).toBe(0);
  });

  it('pays even money on a plain win', () => {
    // A drawn 21, not a natural — so it wins at 1:1, not 3:2.
    const s = bjSettleHand(SPANISH, hand([card(7, H), card(5, D), card(9, C)]), dealer20);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });

  it('returns half the stake on a surrender', () => {
    const s = bjSettleHand(SPANISH, hand([card(9, H), card(7, D)], 100, { surrendered: true }), dealer20);
    expect(s.outcome).toBe('surrender');
    expect(s.payout).toBe(50);
  });

  it('pushes a straight tie', () => {
    const s = bjSettleHand(SPANISH, hand([KING(H), card(12, D)]), dealer20);
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });

  it('pays when the dealer busts', () => {
    const s = bjSettleHand(SPANISH, hand([card(9, H), card(7, D)]), [KING(C), card(9, S), card(5, H)]);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });
});

describe('Spanish 21 — your 21 always wins', () => {
  it('beats a dealer 21 with a drawn 21', () => {
    const s = bjSettleHand(SPANISH, hand([card(7, H), card(7, D), card(7, C)]), [
      card(7, S),
      card(5, H),
      card(9, D),
    ]);
    expect(s.payout).toBeGreaterThan(100);
    expect(s.outcome).not.toBe('push');
  });

  it('beats a dealer natural with a player natural', () => {
    const s = bjSettleHand(SPANISH, hand([ACE(H), KING(D)]), [ACE(C), card(12, S)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(250);
  });

  it('does NOT give the always-wins rule to the other games', () => {
    // Free Bet has no such rule, so blackjack vs blackjack is an ordinary push.
    const push = bjSettleHand(FREEBET, hand([ACE(H), KING(D)]), [ACE(C), card(12, S)]);
    expect(push.outcome).toBe('push');

    // A drawn 21 against a dealer's drawn 21 pushes rather than winning.
    const drawn = bjSettleHand(FREEBET, hand([card(7, H), card(7, D), card(7, C)]), [
      card(7, S),
      card(5, H),
      card(9, D),
    ]);
    expect(drawn.outcome).toBe('push');
  });
});

describe('Spanish 21 — the bonus paytable', () => {
  const dealer20 = [KING(C), card(12, S)];

  it('pays a five-card 21 at 3:2 on top of the win', () => {
    const cards = [card(5, H), card(4, D), card(3, C), card(2, S), card(7, H)]; // 21
    const s = bjSettleHand(SPANISH, hand(cards), dealer20);
    expect(bjBonusMultiplier(SPANISH, hand(cards))).toBe(1.5);
    expect(s.bonus).toBe(150);
    expect(s.payout).toBe(350); // 100 stake + 100 win + 150 bonus
  });

  it('climbs for six and seven card 21s', () => {
    const six = [card(4, H), card(4, D), card(3, C), card(3, S), card(3, H), card(4, C)]; // 21
    const seven = [card(3, H), card(3, D), card(3, C), card(3, S), card(4, H), card(2, D), card(3, S)];
    expect(bjBonusMultiplier(SPANISH, hand(six))).toBe(2);
    expect(bjHandTotal(seven).total).toBe(21);
    expect(bjBonusMultiplier(SPANISH, hand(seven))).toBe(3);
  });

  it('pays 6-7-8 by how well the suits line up', () => {
    const mixed = [card(6, H), card(7, D), card(8, C)];
    const suited = [card(6, D), card(7, D), card(8, D)];
    const spaded = [card(6, S), card(7, S), card(8, S)];
    expect(bjBonusMultiplier(SPANISH, hand(mixed))).toBe(1.5);
    expect(bjBonusMultiplier(SPANISH, hand(suited))).toBe(2);
    expect(bjBonusMultiplier(SPANISH, hand(spaded))).toBe(3);
  });

  it('pays 7-7-7 the same way', () => {
    expect(bjBonusMultiplier(SPANISH, hand([card(7, H), card(7, D), card(7, C)]))).toBe(1.5);
    expect(bjBonusMultiplier(SPANISH, hand([card(7, S), card(7, S), card(7, S)]))).toBe(3);
  });

  it('voids the bonus on a doubled hand', () => {
    const cards = [card(6, S), card(7, S), card(8, S)];
    expect(bjBonusMultiplier(SPANISH, hand(cards, 100, { doubled: true }))).toBe(0);
  });

  it('voids the bonus on a split hand', () => {
    const cards = [card(6, S), card(7, S), card(8, S)];
    expect(bjBonusMultiplier(SPANISH, hand(cards, 100, { fromSplit: true }))).toBe(0);
  });

  it('pays no bonus on a total that isn’t 21', () => {
    expect(bjBonusMultiplier(SPANISH, hand([card(5, H), card(4, D), card(3, C), card(2, S)]))).toBe(0);
  });

  it('gives the other games no bonuses at all', () => {
    const cards = [card(6, S), card(7, S), card(8, S)];
    for (const rules of [EXPOSURE, PONTOON, FREEBET]) {
      expect(bjBonusMultiplier(rules, hand(cards))).toBe(0);
    }
  });
});

describe('Double Exposure — you pay for the view', () => {
  it('pays a natural even money, not 3:2', () => {
    const s = bjSettleHand(EXPOSURE, hand([ACE(H), KING(D)]), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(200); // 100 back + 100, where Spanish would pay 250
  });

  it('gives the dealer every ordinary tie', () => {
    const s = bjSettleHand(EXPOSURE, hand([KING(H), card(9, D)]), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('loss');
    expect(s.payout).toBe(0);
  });

  it('still pays a straight win', () => {
    const s = bjSettleHand(EXPOSURE, hand([KING(H), card(10, D)]), [KING(C), card(9, S)]);
    expect(s.payout).toBe(200);
  });

  it('makes blackjack the one tie the dealer does not take', () => {
    // The standard exception, and it is worth real money — the dealer takes
    // every other push, but blackjack against blackjack pays the player.
    const s = bjSettleHand(EXPOSURE, hand([ACE(H), KING(D)]), [ACE(C), card(12, S)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(200);
  });
});

describe('Pontoon — the dealer really does take everything', () => {
  it('beats a player Pontoon with a dealer Pontoon', () => {
    const s = bjSettleHand(PONTOON, hand([ACE(H), KING(D)]), [ACE(C), card(12, S)]);
    expect(s.outcome).toBe('loss');
    expect(s.payout).toBe(0);
  });
});

describe('Pontoon', () => {
  it('pays a Pontoon 2:1', () => {
    const s = bjSettleHand(PONTOON, hand([ACE(H), KING(D)]), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(300); // 100 back + 200
  });

  it('pays a five-card trick 2:1', () => {
    const cards = [card(2, H), card(3, D), card(4, C), card(5, S), card(2, D)]; // 16
    expect(bjIsFiveCardTrick(PONTOON, hand(cards))).toBe(true);
    const s = bjSettleHand(PONTOON, hand(cards), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('five_card_trick');
    expect(s.payout).toBe(300);
  });

  it('lets a five-card trick beat a dealer 21', () => {
    const cards = [card(2, H), card(3, D), card(4, C), card(5, S), card(2, D)];
    const s = bjSettleHand(PONTOON, hand(cards), [card(7, C), card(7, S), card(7, H)]);
    expect(s.outcome).toBe('five_card_trick');
  });

  it('loses a five-card trick to a dealer Pontoon', () => {
    const cards = [card(2, H), card(3, D), card(4, C), card(5, S), card(2, D)];
    const s = bjSettleHand(PONTOON, hand(cards), [ACE(C), KING(S)]);
    expect(s.outcome).toBe('loss');
  });

  it('gives the dealer every tie', () => {
    const s = bjSettleHand(PONTOON, hand([KING(H), card(9, D)]), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('loss');
  });

  it('gives the other games no five-card trick', () => {
    const cards = [card(2, H), card(3, D), card(4, C), card(5, S), card(2, D)];
    for (const rules of [SPANISH, EXPOSURE, FREEBET]) {
      expect(bjIsFiveCardTrick(rules, hand(cards))).toBe(false);
    }
  });
});

describe('Free Bet — the dealer 22 push', () => {
  it('pushes a live hand against a dealer 22', () => {
    const s = bjSettleHand(FREEBET, hand([KING(H), card(9, D)]), [KING(C), card(5, S), card(7, H)]);
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });

  it('still pays when the dealer busts on anything else', () => {
    const s = bjSettleHand(FREEBET, hand([KING(H), card(9, D)]), [KING(C), card(6, S), card(7, H)]);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });

  it('does NOT rescue a busted player hand', () => {
    const s = bjSettleHand(FREEBET, hand([KING(H), card(9, D), card(5, C)]), [
      KING(C),
      card(5, S),
      card(7, H),
    ]);
    expect(s.outcome).toBe('bust');
    expect(s.payout).toBe(0);
  });

  it('does NOT rescue a natural — that has already been paid', () => {
    const s = bjSettleHand(FREEBET, hand([ACE(H), KING(D)]), [KING(C), card(5, S), card(7, H)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(250);
  });

  it('applies to no other variant', () => {
    const dealer22 = [KING(C), card(5, S), card(7, H)];
    for (const rules of [SPANISH, EXPOSURE, PONTOON]) {
      const s = bjSettleHand(rules, hand([KING(H), card(9, D)]), dealer22);
      expect(s.outcome).toBe('win');
    }
  });
});

describe('Free Bet — the house’s chips are the house’s', () => {
  // Hard 9 (4+5) is a free double, so the house adds 100 and the player draws
  // one card — a 9, for 18. The dealer's 17 loses to it.
  const freeDoubled = (): BjHand =>
    hand([card(4, H), card(5, D), card(9, C)], 100, { freeBet: 100, doubled: true });

  it('pays winnings on the free chips but never hands them over', () => {
    const s = bjSettleHand(FREEBET, freeDoubled(), [KING(C), card(7, S)]);
    // 100 own stake back + 100 won on it + 100 won on the house's 100.
    // The house's 100 itself goes back to the house, not the player.
    expect(s.payout).toBe(300);
    expect(s.staked).toBe(100);
    expect(s.freeStaked).toBe(100);
  });

  it('costs the player only their own stake on a loss', () => {
    const s = bjSettleHand(FREEBET, freeDoubled(), [KING(C), card(10, S)]);
    expect(s.payout).toBe(0);
    expect(s.staked).toBe(100);
  });

  it('returns only the player’s own stake on a push', () => {
    const s = bjSettleHand(FREEBET, freeDoubled(), [KING(C), card(7, S), card(5, H)]);
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });
});


describe('Free Bet — a free split hand is the house\'s money, not the player\'s', () => {
  // Regression: the split hand used to be created with BOTH a player stake and
  // the house's free stake, so settlement returned chips the player had never
  // put up — paying out the house's own side of the bet on every win and push.
  const freeSplitHand = (extra: Partial<BjHand> = {}) =>
    hand([card(8, C), card(9, S)], 0, { freeBet: 100, fromSplit: true, ...extra });

  it('carries no player stake at all', () => {
    const h = freeSplitHand();
    expect(h.bet).toBe(0);
    expect(h.freeBet).toBe(100);
  });

  it('pays one stake in winnings and returns nothing else', () => {
    const s = bjSettleHand(FREEBET, freeSplitHand(), [KING(C), card(6, S)]); // 16
    expect(s.outcome).toBe('win');
    // The player risked nothing on this hand, so they collect the winnings on
    // the house's chips and NOT the house's chips themselves.
    expect(s.payout).toBe(100);
    expect(s.staked).toBe(0);
  });

  it('returns nothing on a push, because nothing was put up', () => {
    const s = bjSettleHand(FREEBET, freeSplitHand(), [KING(C), card(7, S)]); // 17
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(0);
  });

  it('costs the player nothing on a loss', () => {
    const s = bjSettleHand(FREEBET, freeSplitHand(), [KING(C), card(10, S)]); // 20
    expect(s.outcome).toBe('loss');
    expect(s.payout).toBe(0);
    expect(s.staked).toBe(0);
  });

  it('keeps a free split out of the round\'s committed total', () => {
    const dealer = [KING(C), card(7, S)]; // 17
    const r = bjSettleRound(FREEBET, [
      hand([card(8, H), KING(D)], 100), // the original, paid hand — 18, wins
      freeSplitHand(),
    ], dealer);
    // Only the player's own 100 was ever at risk.
    expect(r.committed).toBe(100);
  });
});

describe('bjStakeUnit — sizing a decision on a hand with no player stake', () => {
  it('uses the player stake when there is one', () => {
    expect(bjStakeUnit(hand([card(8, H), card(9, D)], 250))).toBe(250);
  });

  it('falls back to the house stake on a free split hand', () => {
    // Without this, doubling a free-split hand would be sized at zero — a
    // second free bet handed out by accident, and a paid double costing the
    // player nothing.
    expect(bjStakeUnit(hand([card(8, H), card(9, D)], 0, { freeBet: 250 }))).toBe(250);
  });

  it('is zero only when the hand carries nothing at all', () => {
    expect(bjStakeUnit(hand([card(8, H), card(9, D)], 0))).toBe(0);
  });
});

describe('bjSettleRound', () => {
  it('adds up a split round and counts only the player’s money as committed', () => {
    const dealer = [KING(C), card(7, S)]; // 17
    const hands: BjHand[] = [
      hand([card(8, H), KING(D)], 100), // 18 — wins
      hand([card(8, D), card(5, C)], 100, { fromSplit: true }), // 13 — loses
    ];
    const r = bjSettleRound(FREEBET, hands, dealer);
    expect(r.committed).toBe(200);
    expect(r.totalPayout).toBe(200); // 200 on the winner, 0 on the loser
    expect(r.won).toBe(false); // broke even, not ahead
    expect(r.dealerTotal).toBe(17);
    expect(r.dealerBusted).toBe(false);
  });

  it('keeps the house’s free chips out of the committed total', () => {
    const dealer = [KING(C), card(7, S)];
    const hands: BjHand[] = [
      hand([card(4, H), card(5, D), KING(C)], 100, { freeBet: 100, doubled: true }),
    ];
    const r = bjSettleRound(FREEBET, hands, dealer);
    expect(r.committed).toBe(100);
    expect(r.totalPayout).toBe(300);
    expect(r.won).toBe(true);
  });

  it('folds side bets into the totals', () => {
    const dealer = [KING(C), card(7, S)];
    const hands: BjHand[] = [hand([KING(H), card(9, D)], 100)];
    const r = bjSettleRound(SPANISH, hands, dealer, 50, 0);
    expect(r.committed).toBe(150);
    expect(r.totalPayout).toBe(200);
  });

  it('reports a dealer bust', () => {
    const r = bjSettleRound(SPANISH, [hand([KING(H), card(9, D)], 100)], [
      KING(C),
      card(6, S),
      card(9, H),
    ]);
    expect(r.dealerBusted).toBe(true);
    expect(r.dealerTotal).toBe(25);
  });
});


describe('Blackjack Switch — the swap', () => {
  const twoHands = () => [
    bjNewHand([card(1, H), card(6, D)], 100), // A♥ 6♦
    bjNewHand([card(13, C), card(5, S)], 100), // K♣ 5♠
  ];

  it('trades the second card of each hand', () => {
    const hs = twoHands();
    bjSwitchHands(hs);
    expect(hs[0].cards).toEqual([card(1, H), card(5, S)]);
    expect(hs[1].cards).toEqual([card(13, C), card(6, D)]);
  });

  it('marks both hands as switched', () => {
    const hs = twoHands();
    bjSwitchHands(hs);
    expect(hs[0].switched).toBe(true);
    expect(hs[1].switched).toBe(true);
  });


  it('frees a hand that a swap turns OUT of 21', () => {
    // Regression: a hand dealt a two-card 21 was marked done at the deal. If a
    // swap then took it down to 16, the stale flag froze it and sent a live
    // hand straight to the dealer with no decision. Recomputing after the swap
    // is what keeps that from happening.
    const hs = [
      bjNewHand([ACE(H), KING(D)], 100), // 21 at the deal
      bjNewHand([card(5, C), card(6, S)], 100), // 11
    ];
    for (const h of hs) if (bjHandTotal(h.cards).total === 21) h.done = true;
    expect(hs[0].done).toBe(true);

    bjSwitchHands(hs);
    // A♥ + 6♠ = 17, and 5♣ + K♦ = 15 — neither is 21 any more.
    for (const h of hs) h.done = bjHandTotal(h.cards).total === 21;
    expect(hs[0].done).toBe(false);
    expect(hs[1].done).toBe(false);
    expect(bjLegalActions(SWITCH, hs[0], 0)).toContain('stand');
  });

  it('refuses to swap after a hand has drawn', () => {
    const hs = twoHands();
    hs[0].cards.push(card(4, C));
    expect(() => bjSwitchHands(hs)).toThrow();
  });

  it('refuses to swap anything but two hands', () => {
    expect(() => bjSwitchHands([bjNewHand([card(1, H), card(6, D)], 100)])).toThrow();
  });
});

describe('Blackjack Switch — a switched 21 is not a blackjack', () => {
  it('pays a dealt natural even money', () => {
    const s = bjSettleHand(SWITCH, hand([ACE(H), KING(D)]), [KING(C), card(9, S)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(200); // even money, not 3:2
  });

  it('pays a SWITCHED 21 as an ordinary win', () => {
    // The rule that stops the swap from manufacturing blackjacks.
    const s = bjSettleHand(
      SWITCH,
      hand([ACE(H), KING(D)], 100, { switched: true }),
      [KING(C), card(9, S)],
    );
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });

  it('lets a switched 21 lose to a dealer natural', () => {
    const s = bjSettleHand(
      SWITCH,
      hand([ACE(H), KING(D)], 100, { switched: true }),
      [ACE(C), card(12, S)],
    );
    expect(s.outcome).toBe('loss');
  });
});

describe('Blackjack Switch — the dealer 22 push', () => {
  it('pushes a live hand', () => {
    const s = bjSettleHand(SWITCH, hand([KING(H), card(9, D)]), [KING(C), card(5, S), card(7, H)]);
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });

  it('does not rescue a bust', () => {
    const s = bjSettleHand(SWITCH, hand([KING(H), card(9, D), card(5, C)]), [
      KING(C), card(5, S), card(7, H),
    ]);
    expect(s.outcome).toBe('bust');
  });

  it('still pays a dealt natural against a dealer 22', () => {
    const s = bjSettleHand(SWITCH, hand([ACE(H), KING(D)]), [KING(C), card(5, S), card(7, H)]);
    expect(s.outcome).toBe('blackjack');
    expect(s.payout).toBe(200);
  });
});

describe('Super Match', () => {
  it('scores the four opening cards', () => {
    expect(bjSuperMatch([card(8, H), card(8, D), card(3, C), card(9, S)])).toBe('pair');
    expect(bjSuperMatch([card(8, H), card(8, D), card(3, C), card(3, S)])).toBe('two_pair');
    expect(bjSuperMatch([card(8, H), card(8, D), card(8, C), card(9, S)])).toBe('three_of_a_kind');
    expect(bjSuperMatch([card(8, H), card(8, D), card(8, C), card(8, S)])).toBe('four_of_a_kind');
    expect(bjSuperMatch([card(2, H), card(5, D), card(9, C), card(12, S)])).toBe('none');
  });

  it('pays the posted odds, stake included', () => {
    expect(BJ_SUPER_MATCH_PAY.four_of_a_kind).toBe(40);
    expect(bjSuperMatchPayout(100, 'four_of_a_kind')).toBe(4100);
    expect(bjSuperMatchPayout(100, 'two_pair')).toBe(900);
    expect(bjSuperMatchPayout(100, 'pair')).toBe(200);
    expect(bjSuperMatchPayout(100, 'none')).toBe(0);
    expect(bjSuperMatchPayout(0, 'four_of_a_kind')).toBe(0);
  });

  it('needs exactly four cards', () => {
    expect(bjSuperMatch([card(8, H), card(8, D), card(8, C)])).toBe('none');
  });
});

describe('variant lookup and bet validation', () => {
  it('resolves known variants and refuses unknown ones', () => {
    expect(bjRules('spanish21')?.key).toBe('spanish21');
    expect(bjRules('pontoon')?.key).toBe('pontoon');
    expect(bjRules('switch')?.key).toBe('switch');
    // No silent default — settling on the wrong paytable is the failure to avoid.
    expect(bjRules('not_a_game')).toBeNull();
    expect(bjRules(undefined)).toBeNull();
  });

  it('rejects a bet outside the table limits', () => {
    expect(validateBjBet(1).ok).toBe(false);
    expect(validateBjBet(10_000_000).ok).toBe(false);
    expect(validateBjBet(100).bet).toBe(100);
  });

  it('gives every variant a name, a blurb and rule highlights', () => {
    for (const k of BJ_VARIANT_KEYS) {
      const r = BJ_VARIANTS[k];
      expect(r.name.length > 0).toBe(true);
      expect(r.blurb.length > 0).toBe(true);
      expect(r.highlights.length > 0).toBe(true);
    }
  });
});
