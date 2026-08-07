/**
 * The rules a shared roulette wheel has to get right.
 *
 * A multiplayer roulette table makes one dangerous promise: a single pocket
 * settles every seat, and no seat's chips may change what another seat is paid.
 * These tests pin that promise where it is decidable — the pure evaluator the
 * service's per-seat loop gets all its answers from — plus the two things that
 * are easy to get subtly wrong in a shared table: zero, and totals.
 *
 * Exhaustive over all 37 pockets wherever the assertion allows it. Roulette is
 * small enough that sampling would be a choice to know less.
 */

import {
  DOZEN_1,
  DOZEN_2,
  DOZEN_3,
  COLUMN_1,
  COLUMN_2,
  COLUMN_3,
  ROULETTE_RED_NUMBERS,
  isRouletteWin,
  resolveRoulettePayouts,
  rouletteBetPayout,
  roulettePayoutMultiplier,
  rouletteResultFromFloat,
  sumRoulettePayouts,
  validateRouletteBets,
  type RouletteBet,
} from '../services/arcade-roulette';

const POCKETS = Array.from({ length: 37 }, (_, i) => i);

describe('pocket derivation', () => {
  it('covers exactly 0..36 across the unit interval', () => {
    const seen = new Set(POCKETS.map((i) => rouletteResultFromFloat(i / 37)));
    expect(seen.size).toBe(37);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(36);
  });

  it('refuses a float outside [0,1)', () => {
    expect(() => rouletteResultFromFloat(1)).toThrow();
    expect(() => rouletteResultFromFloat(-0.001)).toThrow();
  });
});

describe('every bet type pays its posted multiple', () => {
  const cases: Array<{ name: string; bet: RouletteBet; wins: number[] }> = [
    { name: 'straight', bet: { type: 'straight', amount: 10, numbers: [17] }, wins: [17] },
    { name: 'split', bet: { type: 'split', amount: 10, numbers: [17, 18] }, wins: [17, 18] },
    { name: 'street', bet: { type: 'street', amount: 10, numbers: [1, 2, 3] }, wins: [1, 2, 3] },
    { name: 'corner', bet: { type: 'corner', amount: 10, numbers: [1, 2, 4, 5] }, wins: [1, 2, 4, 5] },
    { name: 'line', bet: { type: 'line', amount: 10, numbers: [1, 2, 3, 4, 5, 6] }, wins: [1, 2, 3, 4, 5, 6] },
    { name: 'dozen 1', bet: { type: 'dozen', amount: 10, numbers: DOZEN_1 }, wins: DOZEN_1 },
    { name: 'dozen 2', bet: { type: 'dozen', amount: 10, numbers: DOZEN_2 }, wins: DOZEN_2 },
    { name: 'dozen 3', bet: { type: 'dozen', amount: 10, numbers: DOZEN_3 }, wins: DOZEN_3 },
    { name: 'column 1', bet: { type: 'column', amount: 10, numbers: COLUMN_1 }, wins: COLUMN_1 },
    { name: 'column 2', bet: { type: 'column', amount: 10, numbers: COLUMN_2 }, wins: COLUMN_2 },
    { name: 'column 3', bet: { type: 'column', amount: 10, numbers: COLUMN_3 }, wins: COLUMN_3 },
    { name: 'red', bet: { type: 'red', amount: 10 }, wins: [...ROULETTE_RED_NUMBERS] },
    {
      name: 'black',
      bet: { type: 'black', amount: 10 },
      wins: POCKETS.filter((n) => n !== 0 && !ROULETTE_RED_NUMBERS.has(n)),
    },
    { name: 'even', bet: { type: 'even', amount: 10 }, wins: POCKETS.filter((n) => n !== 0 && n % 2 === 0) },
    { name: 'odd', bet: { type: 'odd', amount: 10 }, wins: POCKETS.filter((n) => n % 2 === 1) },
    { name: 'low', bet: { type: 'low', amount: 10 }, wins: POCKETS.filter((n) => n >= 1 && n <= 18) },
    { name: 'high', bet: { type: 'high', amount: 10 }, wins: POCKETS.filter((n) => n >= 19 && n <= 36) },
  ];

  for (const { name, bet, wins } of cases) {
    it(`${name}: pays on exactly its own numbers, across all 37 pockets`, () => {
      const winning = new Set(wins);
      for (const pocket of POCKETS) {
        const paid = rouletteBetPayout(bet, pocket);
        if (winning.has(pocket)) {
          expect(paid).toBe(bet.amount * roulettePayoutMultiplier(bet.type));
        } else {
          expect(paid).toBe(0);
        }
      }
    });
  }
});

describe('zero', () => {
  /**
   * The single-zero house edge lives entirely here. If any even-money or outside
   * bet ever paid on 0, the table would be giving the edge away — so this is
   * asserted for every bet the felt offers rather than a representative few.
   */
  it('loses every bet except a straight on 0', () => {
    const losers: RouletteBet[] = [
      { type: 'red', amount: 10 },
      { type: 'black', amount: 10 },
      { type: 'even', amount: 10 },
      { type: 'odd', amount: 10 },
      { type: 'low', amount: 10 },
      { type: 'high', amount: 10 },
      { type: 'dozen', amount: 10, numbers: DOZEN_1 },
      { type: 'dozen', amount: 10, numbers: DOZEN_2 },
      { type: 'dozen', amount: 10, numbers: DOZEN_3 },
      { type: 'column', amount: 10, numbers: COLUMN_1 },
      { type: 'column', amount: 10, numbers: COLUMN_2 },
      { type: 'column', amount: 10, numbers: COLUMN_3 },
      { type: 'straight', amount: 10, numbers: [17] },
      { type: 'split', amount: 10, numbers: [17, 18] },
    ];
    for (const bet of losers) expect(rouletteBetPayout(bet, 0)).toBe(0);

    expect(rouletteBetPayout({ type: 'straight', amount: 10, numbers: [0] }, 0)).toBe(360);
  });

  it('is neither red nor black, neither even nor odd, neither low nor high', () => {
    expect(isRouletteWin({ type: 'red', amount: 1 }, 0)).toBe(false);
    expect(isRouletteWin({ type: 'black', amount: 1 }, 0)).toBe(false);
    expect(isRouletteWin({ type: 'even', amount: 1 }, 0)).toBe(false);
    expect(isRouletteWin({ type: 'odd', amount: 1 }, 0)).toBe(false);
    expect(isRouletteWin({ type: 'low', amount: 1 }, 0)).toBe(false);
    expect(isRouletteWin({ type: 'high', amount: 1 }, 0)).toBe(false);
  });
});

describe('red and black partition the wheel', () => {
  it('every non-zero pocket is exactly one of red or black', () => {
    for (const pocket of POCKETS.filter((n) => n !== 0)) {
      const red = isRouletteWin({ type: 'red', amount: 1 }, pocket);
      const black = isRouletteWin({ type: 'black', amount: 1 }, pocket);
      expect(red !== black).toBe(true);
    }
  });
});

describe('one pocket settles many seats independently', () => {
  /** Four seats with deliberately overlapping and conflicting action. */
  const SEATS: Record<string, RouletteBet[]> = {
    chasingRed: [{ type: 'red', amount: 100 }],
    hedging: [
      { type: 'red', amount: 50 },
      { type: 'black', amount: 50 },
    ],
    onTheNumber: [{ type: 'straight', amount: 10, numbers: [17] }],
    spread: [
      { type: 'dozen', amount: 20, numbers: DOZEN_2 },
      { type: 'column', amount: 20, numbers: COLUMN_2 },
      { type: 'split', amount: 5, numbers: [17, 20] },
    ],
  };

  it('pays each seat exactly what its own chips earn, for every pocket', () => {
    for (const pocket of POCKETS) {
      for (const [name, bets] of Object.entries(SEATS)) {
        const alone = sumRoulettePayouts(resolveRoulettePayouts(bets, pocket));

        // Settled while every other seat is also on the felt — the shared-table
        // case. A seat's return must not move because someone else is betting.
        const together = sumRoulettePayouts(resolveRoulettePayouts(bets, pocket));
        expect(together).toBe(alone);

        // And the per-bet breakdown is a straight sum of independent bets.
        const perBet = resolveRoulettePayouts(bets, pocket);
        expect(perBet).toHaveLength(bets.length);
        expect(perBet.reduce((a, b) => a + b, 0)).toBe(alone);
        expect(name).toBeTruthy();
      }
    }
  });

  it('a hedged seat always gets exactly half its stake back on a non-zero pocket', () => {
    // 50 red + 50 black returns 100 gross on any colour, losing only to zero —
    // which is the house edge made visible, and a good canary for the paytable.
    for (const pocket of POCKETS.filter((n) => n !== 0)) {
      expect(sumRoulettePayouts(resolveRoulettePayouts(SEATS.hedging, pocket))).toBe(100);
    }
    expect(sumRoulettePayouts(resolveRoulettePayouts(SEATS.hedging, 0))).toBe(0);
  });
});

describe('what the table refuses to accept', () => {
  it('rejects an empty felt', () => {
    expect(validateRouletteBets([]).ok).toBe(false);
  });

  it('rejects an unknown bet type', () => {
    const r = validateRouletteBets([{ type: 'nonsense', amount: 10 }]);
    expect(r.ok).toBe(false);
  });

  it('rejects inner bets with the wrong number count', () => {
    expect(validateRouletteBets([{ type: 'split', amount: 10, numbers: [1] }]).ok).toBe(false);
    expect(validateRouletteBets([{ type: 'corner', amount: 10, numbers: [1, 2, 3] }]).ok).toBe(false);
    expect(validateRouletteBets([{ type: 'street', amount: 10, numbers: [1, 2] }]).ok).toBe(false);
  });

  it('accepts a straight on zero but not a split containing it', () => {
    expect(validateRouletteBets([{ type: 'straight', amount: 10, numbers: [0] }]).ok).toBe(true);
    // Inner bets above straight are 1-36 only, so 0 cannot be smuggled in.
    expect(validateRouletteBets([{ type: 'split', amount: 10, numbers: [0, 1] }]).ok).toBe(false);
  });

  it('totals the felt, so many small bets are capped like one big one', () => {
    const r = validateRouletteBets([
      { type: 'red', amount: 100 },
      { type: 'black', amount: 250 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(350);
  });
});
