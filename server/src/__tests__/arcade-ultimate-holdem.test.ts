/**
 * Unit tests for the Ultimate Texas Hold'em rules
 * (server/src/services/arcade-ultimate-holdem.ts).
 *
 * Real money depends on this, and UTH has two rules people routinely get
 * wrong — the Ante PUSHES when the dealer fails to qualify (it does not pay),
 * and the Trips side bet stays in action through a fold — so both are pinned
 * down here explicitly.
 */

import {
  settleUth,
  uthBest,
  uthCategorize,
  uthDealerQualifies,
  uthLegalActions,
  uthNextStage,
  uthPlayMultiple,
  validateUthDeal,
  UTH_BLIND_PAY,
  UTH_TRIPS_PAY,
} from '../services/arcade-ultimate-holdem';

const H = 0;
const D = 1;
const C = 2;
const S = 3;

/** Build a card index (0-51) from a rank (2-14, 14 = Ace) and suit (0-3). */
function card(rank: number, suit: number): number {
  return suit * 13 + (rank - 2);
}

describe('the betting stage machine', () => {
  it('offers 4x, 3x or a check pre-flop', () => {
    expect(uthLegalActions('preflop')).toEqual(['bet4', 'bet3', 'check']);
  });

  it('shrinks to 2x or a check on the flop', () => {
    expect(uthLegalActions('flop')).toEqual(['bet2', 'check']);
  });

  it('leaves only 1x or a fold at the river', () => {
    expect(uthLegalActions('river')).toEqual(['bet1', 'fold']);
  });

  it('offers nothing once the hand is settled', () => {
    expect(uthLegalActions('settled')).toEqual([]);
  });

  it('advances a street on a check', () => {
    expect(uthNextStage('preflop', 'check')).toBe('flop');
    expect(uthNextStage('flop', 'check')).toBe('river');
  });

  it('ends the hand on any bet, at any street', () => {
    expect(uthNextStage('preflop', 'bet4')).toBe('settled');
    expect(uthNextStage('preflop', 'bet3')).toBe('settled');
    expect(uthNextStage('flop', 'bet2')).toBe('settled');
    expect(uthNextStage('river', 'bet1')).toBe('settled');
  });

  it('ends the hand on a fold', () => {
    expect(uthNextStage('river', 'fold')).toBe('settled');
  });

  it('maps each action to the ante multiple it commits', () => {
    expect(uthPlayMultiple('bet4')).toBe(4);
    expect(uthPlayMultiple('bet3')).toBe(3);
    expect(uthPlayMultiple('bet2')).toBe(2);
    expect(uthPlayMultiple('bet1')).toBe(1);
    expect(uthPlayMultiple('check')).toBe(0);
    expect(uthPlayMultiple('fold')).toBe(0);
  });
});

describe('hand categorisation and dealer qualification', () => {
  it('separates a royal flush from any other straight flush', () => {
    const board = [card(10, H), card(11, H), card(12, H), card(13, H), card(3, S)];
    expect(uthCategorize(uthBest([card(14, H), card(2, S)], board))).toBe('royal_flush');
    expect(uthCategorize(uthBest([card(9, H), card(2, S)], board))).toBe('straight_flush');
  });

  it('qualifies the dealer on a pair or better', () => {
    const board = [card(2, D), card(5, C), card(9, H), card(11, S), card(3, D)];
    expect(uthDealerQualifies(uthBest([card(9, C), card(4, D)], board))).toBe(true);
    expect(uthDealerQualifies(uthBest([card(13, C), card(12, D)], board))).toBe(false);
  });
});

describe('settleUth — the ante only cares about qualification', () => {
  const board = [card(2, D), card(5, C), card(9, H), card(11, S), card(3, D)];
  const acesUp = [card(14, S), card(14, H)];
  const kingHigh = [card(13, C), card(12, D)];

  it('PUSHES the ante when the dealer misses, even on a player win', () => {
    const s = settleUth(uthBest(acesUp, board), uthBest(kingHigh, board), 100, 100, 0, 400, false);
    expect(s.result).toBe('win');
    expect(s.dealerQualified).toBe(false);
    // 1x the stake back, not 2x — this is the rule people expect to pay.
    expect(s.antePayout).toBe(100);
  });

  it('pays the ante 1:1 once the dealer qualifies', () => {
    const s = settleUth(
      uthBest(acesUp, board),
      uthBest([card(9, C), card(4, D)], board), // pair of nines
      100,
      100,
      0,
      100,
      false,
    );
    expect(s.dealerQualified).toBe(true);
    expect(s.antePayout).toBe(200);
  });

  it('still resolves the play bet against an unqualified dealer', () => {
    const s = settleUth(uthBest(acesUp, board), uthBest(kingHigh, board), 100, 100, 0, 400, false);
    expect(s.playPayout).toBe(800); // 4x ante, paid 1:1
    expect(s.totalPayout).toBe(1000);
    expect(s.committed).toBe(600);
    expect(s.won).toBe(true);
  });
});

describe('settleUth — the blind paytable', () => {
  it('pushes the blind on anything under a straight', () => {
    const board = [card(2, D), card(5, C), card(9, H), card(11, S), card(3, D)];
    const s = settleUth(
      uthBest([card(14, S), card(14, H)], board),
      uthBest([card(13, C), card(12, D)], board),
      100,
      100,
      0,
      100,
      false,
    );
    expect(s.playerCategory).toBe('pair');
    expect(UTH_BLIND_PAY.pair).toBe(0);
    expect(s.blindPayout).toBe(100);
  });

  it('pays a straight 1:1', () => {
    const board = [card(5, D), card(6, C), card(7, H), card(2, S), card(9, D)];
    const s = settleUth(
      uthBest([card(8, C), card(4, S)], board),
      uthBest([card(13, C), card(13, D)], board),
      100,
      100,
      0,
      100,
      false,
    );
    expect(s.playerCategory).toBe('straight');
    expect(s.blindPayout).toBe(200);
  });

  it('pays a flush 3:2', () => {
    const board = [card(2, S), card(5, S), card(9, S), card(11, D), card(3, H)];
    const s = settleUth(
      uthBest([card(13, S), card(7, S)], board),
      uthBest([card(12, C), card(4, D)], board),
      200,
      200,
      0,
      200,
      false,
    );
    expect(s.playerCategory).toBe('flush');
    expect(s.blindPayout).toBe(500); // 200 stake + 300 winnings
  });

  it('never pays the blind on a loss', () => {
    const board = [card(5, D), card(6, C), card(7, H), card(2, S), card(9, D)];
    const s = settleUth(
      uthBest([card(8, C), card(4, S)], board), // straight, but…
      uthBest([card(10, C), card(8, D)], board), // …a bigger straight
      100,
      100,
      0,
      100,
      false,
    );
    expect(s.result).toBe('loss');
    expect(s.blindPayout).toBe(0);
    expect(s.totalPayout).toBe(0);
  });
});

describe('settleUth — folding', () => {
  const board = [card(9, H), card(9, D), card(9, C), card(2, S), card(4, D)];
  const hole = [card(13, S), card(7, H)];
  const dealer = [card(14, C), card(14, D)];

  it('forfeits the ante and the blind', () => {
    const s = settleUth(uthBest(hole, board), uthBest(dealer, board), 100, 100, 0, 0, true);
    expect(s.result).toBe('fold');
    expect(s.antePayout).toBe(0);
    expect(s.blindPayout).toBe(0);
    expect(s.playPayout).toBe(0);
  });

  it('keeps the trips side bet in action', () => {
    const s = settleUth(uthBest(hole, board), uthBest(dealer, board), 100, 100, 100, 0, true);
    expect(UTH_TRIPS_PAY.three_of_a_kind).toBe(3);
    expect(s.tripsPayout).toBe(400); // 100 stake + 300 winnings
    expect(s.totalPayout).toBe(400);
    expect(s.committed).toBe(300);
    expect(s.won).toBe(true);
  });
});

describe('settleUth — ties', () => {
  it('pushes every bucket when the board plays', () => {
    const board = [card(14, H), card(13, D), card(12, C), card(11, S), card(10, D)];
    const s = settleUth(
      uthBest([card(2, S), card(3, H)], board),
      uthBest([card(4, C), card(5, D)], board),
      100,
      100,
      0,
      100,
      false,
    );
    expect(s.result).toBe('push');
    expect(s.antePayout).toBe(100);
    expect(s.blindPayout).toBe(100);
    expect(s.playPayout).toBe(100);
    expect(s.winSide).toBeNull();
    expect(s.totalPayout).toBe(s.committed);
  });
});

describe('validateUthDeal', () => {
  it('rejects an ante under the table minimum', () => {
    expect(validateUthDeal(1, false).ok).toBe(false);
  });

  it('rejects an ante over the table maximum', () => {
    expect(validateUthDeal(10_000_000, false).ok).toBe(false);
  });

  it('accepts an ante inside the limits', () => {
    const v = validateUthDeal(100, false);
    expect(v.ok).toBe(true);
    expect(v.ante).toBe(100);
    expect(v.trips).toBe(0);
  });

  it('sizes a boolean trips bet to the ante', () => {
    expect(validateUthDeal(500, true).trips).toBe(500);
  });

  it('accepts an independently sized trips bet', () => {
    expect(validateUthDeal(500, 100).trips).toBe(100);
  });

  it('rejects a trips bet below the table minimum', () => {
    expect(validateUthDeal(500, 5).ok).toBe(false);
  });

  it('rejects a negative trips bet', () => {
    expect(validateUthDeal(500, -100).ok).toBe(false);
  });
});
