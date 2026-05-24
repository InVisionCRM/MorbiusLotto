/**
 * Unit tests for the arcade Dice rules (server/src/services/arcade-dice.ts).
 * The win/lose decision is settled in chips, so the math (roll mapping,
 * multiplier, payout) is covered tightly. Mirrors arcade-limbo.test.ts.
 */

import {
  rollX100FromFloat,
  multiplierX100ForTarget,
  resolveDice,
  DICE_HOUSE_EDGE_BP,
  DICE_MIN_TARGET_X100,
  DICE_MAX_TARGET_X100,
} from '../services/arcade-dice';

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

describe('multiplierX100ForTarget', () => {
  it('matches the (1 - houseEdge) × 10000 / target formula', () => {
    // target 50.00 (x100 = 5000), edge 1% → floor(9900 * 100 / 5000) = 198 → 1.98x
    expect(multiplierX100ForTarget(5000, 100)).toBe(198);
    // target 2.00 (x100 = 200), edge 1% → floor(9900 * 100 / 200) = 4950 → 49.50x
    expect(multiplierX100ForTarget(200, 100)).toBe(4950);
    // target 98.00 (x100 = 9800), edge 1% → floor(9900 * 100 / 9800) = 101 → 1.01x
    expect(multiplierX100ForTarget(9800, 100)).toBe(101);
  });

  it('respects a custom house edge', () => {
    // edge 0% → multiplier = floor(10000 * 100 / 5000) = 200 → 2.00x
    expect(multiplierX100ForTarget(5000, 0)).toBe(200);
  });

  it('rejects non-positive targets', () => {
    expect(() => multiplierX100ForTarget(0)).toThrow();
    expect(() => multiplierX100ForTarget(-1)).toThrow();
  });
});

describe('resolveDice', () => {
  it('pays multiplier × bet when the roll lands under the target', () => {
    // r = 0.10 → roll = 1000 (= 10.00). Target 50.00 → 1000 < 5000 → win.
    // Payout = floor(100 * 198 / 100) = 198.
    const r = resolveDice(5000, 100, 0.1);
    expect(r.rollX100).toBe(1000);
    expect(r.multiplierX100).toBe(198);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(198);
  });

  it('zeroes the payout when the roll lands at or above the target', () => {
    // r = 0.5 → roll = 5000. Target 5000 → roll < target is false → loss.
    const r = resolveDice(5000, 100, 0.5);
    expect(r.rollX100).toBe(5000);
    expect(r.won).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('floors fractional chips on the payout', () => {
    // target 2.00 (200, mult 49.50x). Bet 11 → 11 * 4950 / 100 = 544.5 → 544.
    const r = resolveDice(200, 11, 0.001);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(544);
  });

  it('rejects targets outside the supported range', () => {
    expect(() => resolveDice(DICE_MIN_TARGET_X100 - 1, 100, 0.5)).toThrow();
    expect(() => resolveDice(DICE_MAX_TARGET_X100 + 1, 100, 0.5)).toThrow();
  });

  it('rejects bets outside the supported range', () => {
    expect(() => resolveDice(5000, 0, 0.5)).toThrow();
    expect(() => resolveDice(5000, 100_000, 0.5)).toThrow();
  });

  it('expected return matches 1 - houseEdge across uniform-random rolls', () => {
    // Monte-Carlo sanity check: with 1% house edge, the mean return on any
    // fixed target should converge to ~0.99 over many uniform r samples.
    const samples = 20_000;
    const target = 5000; // 50.00 — even-odds anchor
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
      total += resolveDice(target, bet, r).payout;
    }
    const expectedReturn = total / (samples * bet);
    const theoretical = 1 - DICE_HOUSE_EDGE_BP / 10_000;
    expect(Math.abs(expectedReturn - theoretical)).toBeLessThan(0.02);
  });

  it('expected return holds across different target thresholds', () => {
    // Sanity-check the constant-edge invariant: any target should converge
    // to the same ~0.99 expected return.
    const samples = 30_000;
    const bet = 100;
    for (const target of [500, 2500, 5000, 7500, 9500]) {
      let total = 0;
      let seed = 0xdeadbeef ^ target;
      for (let i = 0; i < samples; i++) {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        total += resolveDice(target, bet, r).payout;
      }
      const expectedReturn = total / (samples * bet);
      const theoretical = 1 - DICE_HOUSE_EDGE_BP / 10_000;
      expect(Math.abs(expectedReturn - theoretical)).toBeLessThan(0.03);
    }
  });
});
