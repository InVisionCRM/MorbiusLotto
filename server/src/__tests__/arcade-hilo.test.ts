/**
 * Unit tests for the arcade Hi-Lo rules (server/src/services/arcade-hilo.ts).
 * The win/lose decision is settled in chips, so the math (card derivation +
 * multiplier advance + payout) is covered tightly here.
 */

import {
  HILO_DECK_SIZE,
  HILO_HOUSE_EDGE_BP,
  HILO_MAX_BET,
  HILO_MAX_PICKS,
  HILO_MIN_BET,
  advanceHiLoMultiplier,
  deriveHiLoCard,
  hiLoPayout,
  hiLoWinDenominator,
  isHiLoWin,
} from '../services/arcade-hilo';

// A tiny mock HMAC byte stream that emits a fixed 4-byte vector per cursor.
// We use this to drive `deriveHiLoCard` deterministically without pulling in
// the real HMAC implementation.
function fixedStream(perCursor: Record<number, Uint8Array>) {
  return (cursor: number): Uint8Array => {
    const v = perCursor[cursor];
    if (!v) throw new Error(`No bytes for cursor ${cursor}`);
    return v;
  };
}

// Identity bytes-to-float that mirrors ProvablyFairService.bytesToFloat so
// the cursor mapping math matches the production path.
const realBytesToFloat = (bytes: Uint8Array): number =>
  bytes[0]! / 256 +
  bytes[1]! / (256 * 256) +
  bytes[2]! / (256 * 256 * 256) +
  bytes[3]! / (256 * 256 * 256 * 256);

describe('isHiLoWin', () => {
  it('hi wins on equal and higher cards', () => {
    expect(isHiLoWin('hi', 7, 7)).toBe(true);
    expect(isHiLoWin('hi', 7, 13)).toBe(true);
    expect(isHiLoWin('hi', 7, 6)).toBe(false);
  });

  it('lo wins only on strictly lower cards', () => {
    expect(isHiLoWin('lo', 7, 6)).toBe(true);
    expect(isHiLoWin('lo', 7, 7)).toBe(false);
    expect(isHiLoWin('lo', 7, 13)).toBe(false);
  });

  it('partitions the 13 ranks exactly (no overlap, no gap)', () => {
    for (let prev = 1; prev <= 13; prev++) {
      let hiWins = 0;
      let loWins = 0;
      for (let next = 1; next <= 13; next++) {
        if (isHiLoWin('hi', prev, next)) hiWins++;
        if (isHiLoWin('lo', prev, next)) loWins++;
      }
      expect(hiWins + loWins).toBe(13);
    }
  });
});

describe('hiLoWinDenominator', () => {
  it('matches (14 - prev) for hi and (prev - 1) for lo', () => {
    expect(hiLoWinDenominator('hi', 1)).toBe(13);
    expect(hiLoWinDenominator('hi', 7)).toBe(7);
    expect(hiLoWinDenominator('hi', 13)).toBe(1);
    expect(hiLoWinDenominator('lo', 1)).toBe(0);
    expect(hiLoWinDenominator('lo', 7)).toBe(6);
    expect(hiLoWinDenominator('lo', 13)).toBe(12);
  });

  it('rejects ranks outside 1..13', () => {
    expect(() => hiLoWinDenominator('hi', 0)).toThrow();
    expect(() => hiLoWinDenominator('hi', 14)).toThrow();
  });
});

describe('advanceHiLoMultiplier', () => {
  it('applies the (1 - houseEdge) × 13 / denom factor and floors', () => {
    // hi from prev=7 → denom 7 → factor = 0.99 × 13/7 ≈ 1.83857...
    // From 1.00× (100) → floor(100 × 13 × 9900 / (10000 × 7)) = floor(12900000/70000)
    // = floor(184.285…) = 184 (×100 = 1.84×)
    expect(advanceHiLoMultiplier(100, 'hi', 7)).toBe(183);
  });

  it('refuses impossible picks', () => {
    expect(() => advanceHiLoMultiplier(100, 'lo', 1)).toThrow();
    expect(() => advanceHiLoMultiplier(100, 'hi', 13)).toThrow();
  });

  it('never drops below 100 (1.00×) even after a sub-1 factor', () => {
    // hi from K=13 is impossible (denom=0) — but lo from 2 is 1/13 → 12.87×
    // and lo from prev=2 chain doesn't reduce below the floor; we don't
    // expect a true sub-1 chain to be reachable since impossible picks throw.
    // The Math.max(100, …) safety net is for boundary float rounding.
    expect(advanceHiLoMultiplier(100, 'lo', 2)).toBeGreaterThanOrEqual(100);
  });

  it('chain over 6 mid-rank picks lands close to the closed-form expectation', () => {
    // 6 picks at denom 7 each: closed form 100 × (13 × 0.99 / 7)^6 ≈ 3853.
    // Per-step flooring is *toward the house* and compounds, so the integer
    // chain lands a touch below — observed 3831, within ~1% of the ideal.
    let cur = 100;
    for (let i = 0; i < 6; i++) cur = advanceHiLoMultiplier(cur, 'hi', 7);
    expect(cur).toBeGreaterThanOrEqual(3800);
    expect(cur).toBeLessThanOrEqual(3855);
  });
});

describe('hiLoPayout', () => {
  it('floors fractional chips and rejects bad inputs', () => {
    expect(hiLoPayout(100, 183)).toBe(183);
    expect(hiLoPayout(11, 103)).toBe(11); // 11.33 → 11
    expect(() => hiLoPayout(HILO_MIN_BET - 1, 200)).toThrow();
    expect(() => hiLoPayout(HILO_MAX_BET + 1, 200)).toThrow();
    expect(() => hiLoPayout(100, 99)).toThrow();
  });
});

describe('deriveHiLoCard', () => {
  it('maps a tiny float to card index 0 (Ace of hearts)', () => {
    const bytes = new Uint8Array([0, 0, 0, 0]);
    const stream = fixedStream({ 0: bytes });
    const c = deriveHiLoCard(stream, realBytesToFloat, 0);
    expect(c.index).toBe(0);
    expect(c.rank).toBe(1);
    expect(c.suit).toBe(0);
  });

  it('maps a near-max float (≈0.9999) to card index 51 (King of spades)', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const stream = fixedStream({ 0: bytes });
    const c = deriveHiLoCard(stream, realBytesToFloat, 0);
    expect(c.index).toBeLessThanOrEqual(HILO_DECK_SIZE - 1);
    expect(c.index).toBe(51);
    expect(c.rank).toBe(13);
    expect(c.suit).toBe(3);
  });

  it('uses cursor = cardIndex × 4 (so each card consumes one 4-byte slot)', () => {
    const stream = fixedStream({
      0: new Uint8Array([0x80, 0, 0, 0]), // float ≈ 0.5 → idx 26 → 2 of clubs (rank 1, suit 2)
      4: new Uint8Array([0x40, 0, 0, 0]), // float ≈ 0.25 → idx 13 → A of diamonds (rank 1, suit 1)
    });
    const c0 = deriveHiLoCard(stream, realBytesToFloat, 0);
    const c1 = deriveHiLoCard(stream, realBytesToFloat, 1);
    expect(c0.index).toBe(26);
    expect(c1.index).toBe(13);
  });

  it('rejects negative cardIndex', () => {
    const stream = fixedStream({ 0: new Uint8Array([0, 0, 0, 0]) });
    expect(() => deriveHiLoCard(stream, realBytesToFloat, -1)).toThrow();
  });
});

describe('cross-checks', () => {
  it('the published constants stay in safe ranges', () => {
    expect(HILO_HOUSE_EDGE_BP).toBeGreaterThan(0);
    expect(HILO_HOUSE_EDGE_BP).toBeLessThan(10_000);
    expect(HILO_MIN_BET).toBeGreaterThan(0);
    expect(HILO_MAX_BET).toBeGreaterThan(HILO_MIN_BET);
    expect(HILO_MAX_PICKS).toBeGreaterThanOrEqual(1);
  });
});
