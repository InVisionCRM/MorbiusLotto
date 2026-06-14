/**
 * Unit tests for the arcade Dice x2 (range-band) rules
 * (server/src/services/arcade-dicex2.ts). The win/lose decision is settled in
 * chips, so the math (roll mapping, width multiplier, payout) is covered
 * tightly. Mirrors arcade-dice.test.ts.
 */

import {
  rollX100FromFloat,
  multiplierX100ForWidth,
  resolveDiceX2,
  DICEX2_HOUSE_EDGE_BP,
  DICEX2_MIN_WIDTH_X100,
  DICEX2_MAX_WIDTH_X100,
  DICEX2_SCALE_MAX_X100,
} from '../services/arcade-dicex2';

describe('rollX100FromFloat', () => {
  it('maps the boundary 0 → 0', () => {
    expect(rollX100FromFloat(0)).toBe(0);
  });

  it('floors r * 10000 across the range', () => {
    expect(rollX100FromFloat(0.5)).toBe(5000); // 50.00
    expect(rollX100FromFloat(0.1234)).toBe(1234);
    expect(rollX100FromFloat(0.99989)).toBe(9998);
  });

  it('caps the result at 9999 for r near 1', () => {
    expect(rollX100FromFloat(0.99999999)).toBeLessThanOrEqual(9999);
  });

  it('rejects out-of-range floats', () => {
    expect(() => rollX100FromFloat(-0.1)).toThrow();
    expect(() => rollX100FromFloat(1)).toThrow();
    expect(() => rollX100FromFloat(Number.NaN)).toThrow();
  });
});

describe('multiplierX100ForWidth', () => {
  it('matches the (1 - houseEdge) × 10000 / width formula', () => {
    // width 50.00 (x100 = 5000), edge 1% → floor(9900 * 100 / 5000) = 198 → 1.98x
    expect(multiplierX100ForWidth(5000, 100)).toBe(198);
    // width 2.00 (x100 = 200), edge 1% → floor(9900 * 100 / 200) = 4950 → 49.50x
    expect(multiplierX100ForWidth(200, 100)).toBe(4950);
    // width 98.00 (x100 = 9800), edge 1% → floor(9900 * 100 / 9800) = 101 → 1.01x
    expect(multiplierX100ForWidth(9800, 100)).toBe(101);
  });

  it('respects a custom house edge', () => {
    // edge 0% → multiplier = floor(10000 * 100 / 5000) = 200 → 2.00x
    expect(multiplierX100ForWidth(5000, 0)).toBe(200);
  });

  it('depends only on width, not on band position', () => {
    // The same width gives the same multiplier wherever the band sits.
    const a = resolveDiceX2(0, 5000, 100, 0.1); // band [0, 50)
    const b = resolveDiceX2(2500, 7500, 100, 0.6); // band [25, 75), same width
    expect(a.multiplierX100).toBe(b.multiplierX100);
  });

  it('rejects non-positive widths', () => {
    expect(() => multiplierX100ForWidth(0)).toThrow();
    expect(() => multiplierX100ForWidth(-1)).toThrow();
  });
});

describe('resolveDiceX2', () => {
  it('pays multiplier × bet when the roll lands inside the band', () => {
    // r = 0.30 → roll = 3000 (= 30.00). Band [25.00, 75.00) → 2500 ≤ 3000 < 7500 → win.
    // width 5000 → mult 198. Payout = floor(100 * 198 / 100) = 198.
    const r = resolveDiceX2(2500, 7500, 100, 0.3);
    expect(r.rollX100).toBe(3000);
    expect(r.widthX100).toBe(5000);
    expect(r.multiplierX100).toBe(198);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(198);
  });

  it('loses when the roll lands below the band', () => {
    // r = 0.10 → roll = 1000. Band [25.00, 75.00) → 1000 < 2500 → loss.
    const r = resolveDiceX2(2500, 7500, 100, 0.1);
    expect(r.rollX100).toBe(1000);
    expect(r.won).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('loses when the roll lands above the band', () => {
    // r = 0.80 → roll = 8000. Band [25.00, 75.00) → 8000 ≥ 7500 → loss.
    const r = resolveDiceX2(2500, 7500, 100, 0.8);
    expect(r.rollX100).toBe(8000);
    expect(r.won).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('treats low as inclusive and high as exclusive', () => {
    // roll exactly at low → win; roll exactly at high → loss.
    expect(resolveDiceX2(2500, 7500, 100, 0.25).rollX100).toBe(2500);
    expect(resolveDiceX2(2500, 7500, 100, 0.25).won).toBe(true); // 2500 ≥ 2500
    expect(resolveDiceX2(2500, 7500, 100, 0.75).rollX100).toBe(7500);
    expect(resolveDiceX2(2500, 7500, 100, 0.75).won).toBe(false); // 7500 not < 7500
  });

  it('allows a band that reaches the top of the scale', () => {
    // Band [5000, 10000): width 5000. roll 9999 (r just under 1) wins.
    const r = resolveDiceX2(5000, DICEX2_SCALE_MAX_X100, 100, 0.99999);
    expect(r.rollX100).toBe(9999);
    expect(r.won).toBe(true);
  });

  it('floors fractional chips on the payout', () => {
    // width 2.00 (200, mult 49.50x). Bet 11 → 11 * 4950 / 100 = 544.5 → 544.
    const r = resolveDiceX2(0, 200, 11, 0.001);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(544);
  });

  it('rejects malformed or out-of-scale bands', () => {
    expect(() => resolveDiceX2(7500, 2500, 100, 0.5)).toThrow(); // low ≥ high
    expect(() => resolveDiceX2(-1, 5000, 100, 0.5)).toThrow(); // low < 0
    expect(() => resolveDiceX2(5000, 10001, 100, 0.5)).toThrow(); // high > scale
  });

  it('rejects band widths outside the supported range', () => {
    // width MIN-1 (199) and MAX+1 (9801)
    expect(() => resolveDiceX2(0, DICEX2_MIN_WIDTH_X100 - 1, 100, 0.5)).toThrow();
    expect(() => resolveDiceX2(0, DICEX2_MAX_WIDTH_X100 + 1, 100, 0.5)).toThrow();
  });

  it('rejects bets outside the supported range', () => {
    expect(() => resolveDiceX2(2500, 7500, 0, 0.5)).toThrow();
    expect(() => resolveDiceX2(2500, 7500, 100_000, 0.5)).toThrow();
  });

  it('expected return matches 1 - houseEdge across uniform-random rolls', () => {
    // Monte-Carlo sanity check: with 1% house edge, the mean return on any
    // fixed band should converge to ~0.99 over many uniform r samples.
    const samples = 20_000;
    const [low, high] = [2500, 7500]; // 50.00-wide band
    const bet = 100;
    let total = 0;
    let seed = 0x12345678;
    for (let i = 0; i < samples; i++) {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      total += resolveDiceX2(low, high, bet, r).payout;
    }
    const expectedReturn = total / (samples * bet);
    const theoretical = 1 - DICEX2_HOUSE_EDGE_BP / 10_000;
    expect(Math.abs(expectedReturn - theoretical)).toBeLessThan(0.02);
  });

  it('expected return holds across widths and positions', () => {
    // Any band width converges to the same ~0.99 expected return, regardless of
    // where the window sits on the scale.
    const samples = 30_000;
    const bet = 100;
    const bands: Array<[number, number]> = [
      [0, 500], // narrow, at the floor
      [1000, 3500], // 25-wide, offset
      [2500, 7500], // 50-wide, centered
      [500, 8000], // 75-wide, offset
      [5000, DICEX2_SCALE_MAX_X100], // 50-wide, at the ceiling
    ];
    for (const [low, high] of bands) {
      let total = 0;
      let seed = 0xdeadbeef ^ low ^ (high << 1);
      for (let i = 0; i < samples; i++) {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        total += resolveDiceX2(low, high, bet, r).payout;
      }
      const expectedReturn = total / (samples * bet);
      const theoretical = 1 - DICEX2_HOUSE_EDGE_BP / 10_000;
      expect(Math.abs(expectedReturn - theoretical)).toBeLessThan(0.03);
    }
  });
});
