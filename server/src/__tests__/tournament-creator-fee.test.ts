/**
 * Tournament Creator Fee — Pure-Math Tests
 *
 * Covers:
 *   - clampCreatorFeePercent: edge cases at 0 / 2 / 15 boundaries + invalid inputs
 *   - computeNetPrizePoolWei: integer math at min / default / max creator fees
 *
 * Mirrors the payout math at server/src/services/tournament.service.ts:1083 so a regression
 * in either the helper or the payout would surface immediately.
 *
 * Run: cd server && npm test -- tournament-creator-fee
 */

import {
  clampCreatorFeePercent,
  computeNetPrizePoolWei,
  CREATOR_FEE_MIN,
  CREATOR_FEE_MAX,
  CREATOR_FEE_DEFAULT,
  PLATFORM_FEE_BUYIN_PERCENT,
} from '../../../lib/tournament-types';

describe('clampCreatorFeePercent', () => {
  it('passes through valid integer percents', () => {
    for (let n = CREATOR_FEE_MIN; n <= CREATOR_FEE_MAX; n++) {
      expect(clampCreatorFeePercent(n)).toBe(n);
    }
  });

  it('clamps below the minimum to MIN (0)', () => {
    expect(clampCreatorFeePercent(-1)).toBe(CREATOR_FEE_MIN);
    expect(clampCreatorFeePercent(-100)).toBe(CREATOR_FEE_MIN);
  });

  it('clamps above the maximum to MAX (15)', () => {
    expect(clampCreatorFeePercent(16)).toBe(CREATOR_FEE_MAX);
    expect(clampCreatorFeePercent(100)).toBe(CREATOR_FEE_MAX);
    expect(clampCreatorFeePercent(1_000_000)).toBe(CREATOR_FEE_MAX);
  });

  it('rounds fractional inputs to the nearest integer (no half-percents allowed)', () => {
    expect(clampCreatorFeePercent(2.4)).toBe(2);
    expect(clampCreatorFeePercent(2.5)).toBe(3);
    expect(clampCreatorFeePercent(2.6)).toBe(3);
  });

  it('falls back to DEFAULT (2) for invalid inputs', () => {
    expect(clampCreatorFeePercent('not a number')).toBe(CREATOR_FEE_DEFAULT);
    expect(clampCreatorFeePercent(undefined)).toBe(CREATOR_FEE_DEFAULT);
    expect(clampCreatorFeePercent(null)).toBe(CREATOR_FEE_DEFAULT);
    expect(clampCreatorFeePercent(NaN)).toBe(CREATOR_FEE_DEFAULT);
    expect(clampCreatorFeePercent(Infinity)).toBe(CREATOR_FEE_DEFAULT);
  });

  it('parses numeric strings (slider may emit strings via input.value)', () => {
    expect(clampCreatorFeePercent('0')).toBe(0);
    expect(clampCreatorFeePercent('7')).toBe(7);
    expect(clampCreatorFeePercent('15')).toBe(15);
    expect(clampCreatorFeePercent('99')).toBe(15);
  });
});

describe('computeNetPrizePoolWei (buy-in tournament)', () => {
  // 100 MORBIUS gross pool — easy mental math.
  const grossPoolWei = 100_000_000_000_000_000_000n; // 100 * 10^18

  it('at creator fee 0 → 3% platform, 97% to winners', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 0, isFreeroll: false });
    expect(r.creatorFeeWei).toBe(0n);
    expect(r.platformFeeWei).toBe((grossPoolWei * 3n) / 100n);
    expect(r.netWei).toBe(grossPoolWei - r.platformFeeWei);
  });

  it('at creator fee 2 (default) → 2% + 3% = 95% to winners', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 2, isFreeroll: false });
    expect(r.creatorFeeWei).toBe((grossPoolWei * 2n) / 100n);
    expect(r.platformFeeWei).toBe((grossPoolWei * 3n) / 100n);
    expect(r.netWei).toBe((grossPoolWei * 95n) / 100n);
  });

  it('at creator fee 15 (max) → 15% + 3% = 82% to winners', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 15, isFreeroll: false });
    expect(r.creatorFeeWei).toBe((grossPoolWei * 15n) / 100n);
    expect(r.platformFeeWei).toBe((grossPoolWei * 3n) / 100n);
    expect(r.netWei).toBe((grossPoolWei * 82n) / 100n);
  });

  it('clamps out-of-range creator fee (20 → 15)', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 20, isFreeroll: false });
    expect(r.creatorFeeWei).toBe((grossPoolWei * 15n) / 100n);
  });

  it('handles odd amounts without losing wei beyond integer truncation', () => {
    // 99 wei → 15% = 14 wei (integer truncation), 3% = 2 wei → 83 wei to winners
    const tinyGross = 99n;
    const r = computeNetPrizePoolWei({ grossPoolWei: tinyGross, creatorFeePercent: 15, isFreeroll: false });
    expect(r.creatorFeeWei).toBe(14n);
    expect(r.platformFeeWei).toBe(2n);
    expect(r.netWei).toBe(83n);
    // Total deductions never exceed gross.
    expect(r.creatorFeeWei + r.platformFeeWei + r.netWei).toBe(tinyGross);
  });

  it('fees + net always equal gross (invariant across the full creator-fee range)', () => {
    for (let pct = CREATOR_FEE_MIN; pct <= CREATOR_FEE_MAX; pct++) {
      const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: pct, isFreeroll: false });
      expect(r.creatorFeeWei + r.platformFeeWei + r.netWei).toBe(grossPoolWei);
    }
  });

  it('uses the documented platform fee constant (3% for buy-ins)', () => {
    expect(PLATFORM_FEE_BUYIN_PERCENT).toBe(3);
  });
});

describe('computeNetPrizePoolWei (freeroll override)', () => {
  const grossPoolWei = 100_000_000_000_000_000_000n;

  it('zeros out the creator fee even if the row stored a non-zero value', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 10, isFreeroll: true });
    expect(r.creatorFeeWei).toBe(0n);
  });

  it('applies the 5% freeroll platform fee (matches tournament.service.ts:1089)', () => {
    const r = computeNetPrizePoolWei({ grossPoolWei, creatorFeePercent: 10, isFreeroll: true });
    expect(r.platformFeeWei).toBe((grossPoolWei * 5n) / 100n);
    expect(r.netWei).toBe((grossPoolWei * 95n) / 100n);
  });
});
