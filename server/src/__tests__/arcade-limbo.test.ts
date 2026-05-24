/**
 * Unit tests for the arcade Limbo rules (server/src/services/arcade-limbo.ts).
 * The win/lose decision is settled in chips, so the math (crash-point formula
 * + payout) is covered tightly.
 */

import {
  crashPointFromFloat,
  resolveLimbo,
  LIMBO_HOUSE_EDGE_BP,
  LIMBO_MIN_TARGET_X100,
  LIMBO_MAX_TARGET_X100,
} from '../services/arcade-limbo';

describe('crashPointFromFloat', () => {
  it('clamps the boundary at 1.00x for r ≈ 0', () => {
    expect(crashPointFromFloat(0)).toBe(100);
    expect(crashPointFromFloat(0.0000001)).toBe(100);
  });

  it('matches the (1 - houseEdge)/(1 - r) formula', () => {
    // r = 0.5 → (0.99 / 0.5) = 1.98 → ×100 = 198
    expect(crashPointFromFloat(0.5)).toBe(198);
    // r = 0.75 → 0.99 / 0.25 = 3.96 → ×100 = 396
    expect(crashPointFromFloat(0.75)).toBe(396);
  });

  it('caps the result at the display cap', () => {
    // r very close to 1 explodes the multiplier; ensure we clamp.
    const v = crashPointFromFloat(1 - 1e-13);
    expect(v).toBeLessThanOrEqual(100_000_000);
  });
});

describe('resolveLimbo', () => {
  it('pays target × bet when the crash point clears the target', () => {
    // r = 0.5 → 1.98x. Target 1.50x → win → payout = 100 * 1.50 = 150
    const r = resolveLimbo(150, 100, 0.5);
    expect(r.resultX100).toBe(198);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(150);
  });

  it('zeroes the payout when the crash point misses the target', () => {
    // r = 0.5 → 1.98x. Target 2.00x → miss → payout = 0
    const r = resolveLimbo(200, 100, 0.5);
    expect(r.won).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('floors fractional chips on the payout', () => {
    // target 1.03x × bet 11 = 11.33 → floor → 11
    const r = resolveLimbo(103, 11, 0.95);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(11);
  });

  it('rejects targets outside the supported range', () => {
    expect(() => resolveLimbo(LIMBO_MIN_TARGET_X100 - 1, 100, 0.5)).toThrow();
    expect(() => resolveLimbo(LIMBO_MAX_TARGET_X100 + 1, 100, 0.5)).toThrow();
  });

  it('rejects bets outside the supported range', () => {
    expect(() => resolveLimbo(200, 0, 0.5)).toThrow();
    expect(() => resolveLimbo(200, 100_000, 0.5)).toThrow();
  });

  it('expected return matches 1 - houseEdge across uniform-random targets', () => {
    // Monte-Carlo sanity check: with 1% house edge, the mean return on a fixed
    // target should converge to ~0.99 over many uniform r samples. A loose
    // ±2% bound keeps the test deterministic at this sample count.
    const samples = 20_000;
    const target = 200; // 2.00x
    const bet = 100;
    let total = 0;
    let seed = 0x12345678;
    for (let i = 0; i < samples; i++) {
      // Mulberry32 — deterministic, uniform enough for this sanity check.
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      total += resolveLimbo(target, bet, r).payout;
    }
    const expectedReturn = total / (samples * bet);
    const theoretical = 1 - LIMBO_HOUSE_EDGE_BP / 10_000;
    expect(Math.abs(expectedReturn - theoretical)).toBeLessThan(0.02);
  });
});
