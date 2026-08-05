/**
 * Unit tests for the Caribbean Stud rules
 * (server/src/services/arcade-caribbean-stud.ts).
 *
 * The game's whole character comes from one rule: when the dealer fails to
 * qualify, the Ante pays 1:1 and the Call — twice the size — merely pushes. A
 * royal flush against an unqualified dealer collects exactly one Ante. That is
 * counter-intuitive enough to be worth an explicit test.
 */

import {
  csBonusHand,
  csCategorize,
  csDealerQualifies,
  settleCaribbeanStud,
  validateCsDeal,
  CS_CALL_PAY,
  CS_BONUS_PAY,
} from '../services/arcade-caribbean-stud';
import { bestHand } from '../services/poker-hand-eval';

const H = 0;
const D = 1;
const C = 2;
const S = 3;

/** Build a card index (0-51) from a rank (2-14, 14 = Ace) and suit (0-3). */
function card(rank: number, suit: number): number {
  return suit * 13 + (rank - 2);
}

const FLUSH = [card(2, S), card(5, S), card(9, S), card(11, S), card(13, S)];
const AK_HIGH = [card(14, C), card(13, D), card(7, H), card(5, C), card(3, D)];
const Q_HIGH = [card(12, C), card(10, D), card(7, H), card(5, C), card(3, D)];
const ACES = [card(14, C), card(14, D), card(7, H), card(5, C), card(3, D)];

describe('dealer qualification — Ace-King high or better', () => {
  it('qualifies on Ace-King high', () => {
    expect(csDealerQualifies(bestHand(AK_HIGH))).toBe(true);
  });

  it('does NOT qualify on Ace-Queen high', () => {
    const aq = [card(14, S), card(12, D), card(7, C), card(5, H), card(3, S)];
    expect(csDealerQualifies(bestHand(aq))).toBe(false);
  });

  it('does NOT qualify on Queen high', () => {
    expect(csDealerQualifies(bestHand(Q_HIGH))).toBe(false);
  });

  it('qualifies on any pair, however small', () => {
    const deuces = [card(2, S), card(2, D), card(7, C), card(5, H), card(9, S)];
    expect(csDealerQualifies(bestHand(deuces))).toBe(true);
  });
});

describe('hand categorisation', () => {
  it('separates a royal flush from any other straight flush', () => {
    const royal = [card(10, H), card(11, H), card(12, H), card(13, H), card(14, H)];
    const steel = [card(9, H), card(10, H), card(11, H), card(12, H), card(13, H)];
    expect(csCategorize(bestHand(royal))).toBe('royal_flush');
    expect(csCategorize(bestHand(steel))).toBe('straight_flush');
  });
});

describe('settleCaribbeanStud — the dealer misses', () => {
  it('pays the ante 1:1 and only returns the call', () => {
    const s = settleCaribbeanStud(bestHand(FLUSH), bestHand(Q_HIGH), 100, 200, 0, false, null);
    expect(s.result).toBe('dealer_no_qualify');
    expect(s.dealerQualified).toBe(false);
    expect(s.antePayout).toBe(200);
    expect(s.callPayout).toBe(200); // pushed, not paid
  });

  it('collects only one ante even with a flush', () => {
    const s = settleCaribbeanStud(bestHand(FLUSH), bestHand(Q_HIGH), 100, 200, 0, false, null);
    expect(s.totalPayout).toBe(400);
    expect(s.committed).toBe(300);
    expect(s.totalPayout - s.committed).toBe(100);
  });

  it('pays the same whether the player would have won or lost the showdown', () => {
    const weak = [card(2, H), card(4, D), card(6, C), card(8, S), card(10, H)];
    const s = settleCaribbeanStud(bestHand(weak), bestHand(Q_HIGH), 100, 200, 0, false, null);
    expect(s.result).toBe('dealer_no_qualify');
    expect(s.totalPayout).toBe(400);
  });
});

describe('settleCaribbeanStud — the dealer qualifies', () => {
  it('pays the call off the paytable on a win', () => {
    const s = settleCaribbeanStud(bestHand(FLUSH), bestHand(AK_HIGH), 100, 200, 0, false, null);
    expect(s.result).toBe('win');
    expect(s.playerCategory).toBe('flush');
    expect(CS_CALL_PAY.flush).toBe(5);
    expect(s.antePayout).toBe(200);
    expect(s.callPayout).toBe(1200); // 200 stake + 1000 winnings
    expect(s.totalPayout).toBe(1400);
  });

  it('pays a bare high-card win even money on the call', () => {
    const player = [card(14, S), card(13, H), card(9, C), card(6, D), card(4, S)];
    const dealer = [card(14, C), card(13, D), card(9, H), card(6, C), card(3, D)];
    const s = settleCaribbeanStud(bestHand(player), bestHand(dealer), 100, 200, 0, false, null);
    expect(s.result).toBe('win');
    expect(s.playerCategory).toBe('high_card');
    expect(s.callPayout).toBe(400); // 200 stake + 200 winnings
  });

  it('takes both bets on a loss', () => {
    const weak = [card(2, S), card(5, D), card(9, C), card(11, H), card(13, S)];
    const s = settleCaribbeanStud(bestHand(weak), bestHand(ACES), 100, 200, 0, false, null);
    expect(s.result).toBe('loss');
    expect(s.totalPayout).toBe(0);
    expect(s.winSide).toBe('dealer');
  });

  it('pushes both bets on a tie', () => {
    const a = [card(14, S), card(13, D), card(9, C), card(5, H), card(3, S)];
    const b = [card(14, H), card(13, C), card(9, D), card(5, S), card(3, H)];
    const s = settleCaribbeanStud(bestHand(a), bestHand(b), 100, 200, 0, false, null);
    expect(s.result).toBe('push');
    expect(s.antePayout).toBe(100);
    expect(s.callPayout).toBe(200);
    expect(s.winSide).toBeNull();
    expect(s.totalPayout).toBe(s.committed);
  });
});

describe('settleCaribbeanStud — folding', () => {
  const trips = [card(9, S), card(9, D), card(9, C), card(2, H), card(4, S)];

  it('forfeits the ante and commits no call', () => {
    const s = settleCaribbeanStud(bestHand(trips), bestHand(ACES), 100, 0, 0, true, null);
    expect(s.result).toBe('fold');
    expect(s.antePayout).toBe(0);
    expect(s.callPayout).toBe(0);
    expect(s.totalPayout).toBe(0);
  });

  it('still resolves the 5+1 bonus', () => {
    const bonus = csBonusHand(trips, ACES[0]);
    const s = settleCaribbeanStud(bestHand(trips), bestHand(ACES), 100, 0, 100, true, bonus);
    expect(CS_BONUS_PAY.three_of_a_kind).toBe(7);
    expect(s.bonusPayout).toBe(800); // 100 stake + 700 winnings
    expect(s.committed).toBe(200);
  });
});

describe('the 5+1 bonus really uses the dealer up card', () => {
  it('turns four-to-a-flush plus a matching up card into a paying flush', () => {
    const player = [card(2, S), card(5, S), card(9, S), card(11, S), card(13, D)];
    const up = card(7, S); // the fifth spade comes from the dealer
    const dealer = [up, card(14, C), card(13, C), card(4, H), card(6, D)];
    const s = settleCaribbeanStud(
      bestHand(player),
      bestHand(dealer),
      100,
      200,
      100,
      false,
      csBonusHand(player, up),
    );
    expect(CS_BONUS_PAY.flush).toBe(15);
    expect(s.bonusPayout).toBe(1600); // 100 stake + 1500 winnings
  });

  it('pays nothing on a six-card hand under trips', () => {
    const player = [card(2, S), card(5, D), card(9, C), card(11, H), card(13, S)];
    const up = card(7, D);
    const s = settleCaribbeanStud(
      bestHand(player),
      bestHand([up, card(14, C), card(13, C), card(4, H), card(6, D)]),
      100,
      200,
      100,
      false,
      csBonusHand(player, up),
    );
    expect(s.bonusPayout).toBe(0);
  });
});

describe('validateCsDeal', () => {
  it('rejects an ante under the table minimum', () => {
    expect(validateCsDeal(1, false).ok).toBe(false);
  });

  it('rejects an ante over the table maximum', () => {
    expect(validateCsDeal(10_000_000, false).ok).toBe(false);
  });

  it('accepts an ante inside the limits', () => {
    const v = validateCsDeal(100, false);
    expect(v.ok).toBe(true);
    expect(v.ante).toBe(100);
    expect(v.bonus).toBe(0);
  });

  it('sizes a boolean bonus to the ante', () => {
    expect(validateCsDeal(500, true).bonus).toBe(500);
  });

  it('rejects a bonus below the table minimum', () => {
    expect(validateCsDeal(500, 5).ok).toBe(false);
  });
});
