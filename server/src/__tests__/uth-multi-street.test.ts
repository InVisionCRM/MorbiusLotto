/**
 * The one rule multiplayer Ultimate Hold'em actually adds.
 *
 * Settlement is the solo game's settleUth, called once per seat, and is already
 * covered by arcade-ultimate-holdem.test.ts. The seat plumbing is shared with
 * craps. What exists only here is "when does a street end" — and getting it
 * wrong either strands a table waiting on somebody who has nothing left to
 * decide, or advances the board out from under a player who does.
 */

import {
  uthSeatOwesDecision,
  uthStreetComplete,
} from '../services/uth-multi-game.service';
import { UTH_TRIPS_PAY, settleUth, uthBest } from '../services/arcade-ultimate-holdem';

type Seat = { folded: boolean; play: number; actedStage: string | null };

const fresh = (): Seat => ({ folded: false, play: 0, actedStage: null });
const checked = (stage: string): Seat => ({ folded: false, play: 0, actedStage: stage });
const committed = (): Seat => ({ folded: false, play: 400, actedStage: 'preflop' });
const folded = (): Seat => ({ folded: true, play: 0, actedStage: 'river' });

describe('a seat owes a decision until it has nothing left to decide', () => {
  it('owes one when it has not acted this street', () => {
    expect(uthSeatOwesDecision(fresh(), 'preflop')).toBe(true);
  });

  it('does not owe one after checking this street', () => {
    expect(uthSeatOwesDecision(checked('preflop'), 'preflop')).toBe(false);
  });

  it('owes one again on the NEXT street after checking', () => {
    // Checking buys one street, not the hand — this is the rule that makes
    // Ultimate Hold'em a sequence of decisions rather than a single one.
    expect(uthSeatOwesDecision(checked('preflop'), 'flop')).toBe(true);
  });

  it('never owes another once Play is committed', () => {
    // Play is a once-per-hand bet. A seat that has bet it is done deciding for
    // the rest of the hand, on every remaining street.
    for (const stage of ['preflop', 'flop', 'river'] as const) {
      expect(uthSeatOwesDecision(committed(), stage)).toBe(false);
    }
  });

  it('never owes another once folded', () => {
    for (const stage of ['preflop', 'flop', 'river'] as const) {
      expect(uthSeatOwesDecision(folded(), stage)).toBe(false);
    }
  });
});

describe('a street ends only when every seat still choosing has chosen', () => {
  it('waits for a seat that has not acted', () => {
    expect(uthStreetComplete([checked('preflop'), fresh()], 'preflop')).toBe(false);
  });

  it('advances once the last one acts', () => {
    expect(uthStreetComplete([checked('preflop'), checked('preflop')], 'preflop')).toBe(true);
  });

  it('does not wait for committed or folded seats', () => {
    // The trap: a table of five where three have committed Play and one has
    // folded must advance the moment the fifth acts — not sit waiting on four
    // players who have no decision left.
    const table = [committed(), committed(), committed(), folded(), checked('flop')];
    expect(uthStreetComplete(table, 'flop')).toBe(true);
  });

  it('is complete when every seat has committed or folded', () => {
    expect(uthStreetComplete([committed(), folded()], 'river')).toBe(true);
  });

  it('is trivially complete with no seats', () => {
    // A table that empties mid-round must not hang.
    expect(uthStreetComplete([], 'flop')).toBe(true);
  });

  it('a fresh street is incomplete for everyone who is still live', () => {
    const table = [fresh(), fresh(), committed(), folded()];
    expect(uthStreetComplete(table, 'flop')).toBe(false);
  });
});

describe('every seat is settled against the same board, independently', () => {
  // The multiplayer promise: your result depends on your cards, the shared
  // board and the dealer — never on what anyone else did.
  const board = [0, 14, 28, 41, 7];
  const dealer = [3, 17];

  it('settles a rail of different hands against one shared dealer', () => {
    // Five distinct seats, one board, one dealer. Each seat's outcome must
    // follow from its OWN cards, while the facts that belong to the table —
    // the dealer's hand and whether it qualified — are identical for everyone.
    const dealerHand = uthBest(dealer, board);
    const rail = [[12, 25], [1, 2], [33, 46], [9, 22], [5, 38]];

    const settled = rail.map((hole) =>
      settleUth(uthBest(hole, board), dealerHand, 100, 100, 0, 200, false),
    );

    const qualifications = new Set(settled.map((r) => r.dealerQualified));
    expect(qualifications.size).toBe(1);
    for (const r of settled) {
      expect(['win', 'loss', 'push'].includes(r.result)).toBe(true);
      expect(r.dealerCategory).toBe(settled[0].dealerCategory);
    }

    // A seat that beat the dealer must be paid more than one that lost to it on
    // identical stakes, or the seats aren't really being judged on their cards.
    const winners = settled.filter((r) => r.result === 'win');
    const losers = settled.filter((r) => r.result === 'loss');
    if (winners.length && losers.length) {
      expect(Math.min(...winners.map((r) => r.totalPayout)))
        .toBeGreaterThan(Math.max(...losers.map((r) => r.totalPayout)));
    }
  });

  it('does not let the size of a stake change the outcome', () => {
    // The real independence claim: same cards, same board, same dealer — only
    // the amounts scale, never the result.
    const dealerHand = uthBest(dealer, board);
    const hole = [12, 25];
    const small = settleUth(uthBest(hole, board), dealerHand, 100, 100, 0, 200, false);
    const large = settleUth(uthBest(hole, board), dealerHand, 900, 900, 0, 1800, false);
    expect(large.result).toBe(small.result);
    expect(large.dealerQualified).toBe(small.dealerQualified);
    expect(large.totalPayout).toBe(small.totalPayout * 9);
  });

  it('keeps Trips alive through a fold, exactly as the solo game does', () => {
    // A folded seat forfeits Ante and Blind but Trips still scores, because all
    // five board cards were dealt up front. This is the rule most often got
    // wrong, so it is pinned here as well as in the solo suite.
    const dealerHand = uthBest(dealer, board);
    const r = settleUth(uthBest([12, 25], board), dealerHand, 100, 100, 50, 0, true);
    expect(r.result).toBe('fold');
    expect(r.antePayout).toBe(0);
    expect(r.blindPayout).toBe(0);
    // Trips pays iff the final hand reaches a paying category.
    const paying = UTH_TRIPS_PAY[r.playerCategory] > 0;
    expect(r.tripsPayout > 0).toBe(paying);
  });
});
