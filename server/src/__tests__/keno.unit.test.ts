/**
 * Unit tests for server-side Stake-style Keno.
 *   • Draw (ProvablyFairService.drawKenoNumbers): distinct, in-range, deterministic.
 *   • Scoring (resolveKeno): hit counting + integer chip payout.
 *   • Paytables: every published table returns < 100% (house always has an edge)
 *     and the headline 10/10 multiplier is 1000x across the risk modes.
 */

import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolveKeno,
  normalizeKenoPicks,
  kenoMultiplierX100,
  kenoMultiplierRowX100,
  kenoRtp,
  kenoHitProbability,
  KENO_RISKS,
  KENO_DRAW_COUNT,
  KENO_TOTAL_TILES,
  KENO_MAX_BET,
  type KenoRisk,
} from '../services/keno';

const pf = new ProvablyFairService();

describe('drawKenoNumbers', () => {
  it('draws exactly 10 distinct numbers in 1..40', () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      const drawn = pf.drawKenoNumbers('server-seed-abc', 'client-seed-xyz', nonce);
      expect(drawn).toHaveLength(KENO_DRAW_COUNT);
      expect(new Set(drawn).size).toBe(KENO_DRAW_COUNT);
      for (const n of drawn) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(KENO_TOTAL_TILES);
      }
    }
  });

  it('is deterministic for the same seeds + nonce', () => {
    const a = pf.drawKenoNumbers('s', 'c', 7);
    const b = pf.drawKenoNumbers('s', 'c', 7);
    expect(a).toEqual(b);
  });

  it('changes when the nonce changes', () => {
    const a = pf.drawKenoNumbers('s', 'c', 0);
    const b = pf.drawKenoNumbers('s', 'c', 1);
    expect(a).not.toEqual(b);
  });

  it('is uniform-ish: every tile 1..40 appears across many draws', () => {
    const seen = new Set<number>();
    for (let nonce = 0; nonce < 500; nonce++) {
      for (const n of pf.drawKenoNumbers('uniform', 'seed', nonce)) seen.add(n);
    }
    expect(seen.size).toBe(KENO_TOTAL_TILES);
  });
});

describe('normalizeKenoPicks', () => {
  it('dedupes-checks, range-checks and sorts', () => {
    expect(normalizeKenoPicks([5, 1, 40])).toEqual([1, 5, 40]);
  });
  it('rejects out-of-range, duplicate, empty and >10 selections', () => {
    expect(() => normalizeKenoPicks([0])).toThrow();
    expect(() => normalizeKenoPicks([41])).toThrow();
    expect(() => normalizeKenoPicks([3, 3])).toThrow();
    expect(() => normalizeKenoPicks([])).toThrow();
    expect(() => normalizeKenoPicks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toThrow();
  });
});

describe('resolveKeno', () => {
  it('counts hits and pays bet × multiplier (floored)', () => {
    // classic 1-pick, 1 hit → 3.96x. bet 100 → 396.
    const r = resolveKeno([7], [7, 1, 2, 3, 4, 5, 6, 8, 9, 10], 'classic', 100);
    expect(r.hits).toBe(1);
    expect(r.multiplierX100).toBe(396);
    expect(r.payout).toBe(396);
  });

  it('floors fractional chip payouts', () => {
    // classic 1-pick, 1 hit → 3.96x. bet 11 → floor(11 * 396 / 100) = floor(43.56) = 43.
    const r = resolveKeno([7], [7, 1, 2, 3, 4, 5, 6, 8, 9, 10], 'classic', 11);
    expect(r.payout).toBe(43);
  });

  it('pays nothing on an empty cell', () => {
    // high 10-pick, 3 hits → 0x.
    const picks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const drawn = [1, 2, 3, 31, 32, 33, 34, 35, 36, 37]; // 3 hits
    const r = resolveKeno(picks, drawn, 'high', 500);
    expect(r.hits).toBe(3);
    expect(r.multiplierX100).toBe(0);
    expect(r.payout).toBe(0);
  });

  it('rejects out-of-range bets', () => {
    expect(() => resolveKeno([1], [1], 'classic', 0)).toThrow();
    expect(() => resolveKeno([1], [1], 'classic', KENO_MAX_BET + 1)).toThrow();
    expect(() => resolveKeno([1], [2], 'classic', KENO_MAX_BET)).not.toThrow();
  });
});

describe('paytables', () => {
  it('Low/Medium/High pay 1000x on a perfect 10/10; Classic caps at 100x', () => {
    expect(kenoMultiplierX100('classic', 10, 10)).toBe(10_000); // 100x
    for (const risk of ['low', 'medium', 'high'] as const) {
      expect(kenoMultiplierX100(risk, 10, 10)).toBe(100_000); // 1000x
    }
  });

  it('exposes a full multiplier row per pick count', () => {
    // classic 2-pick → [0x, 1.9x, 4.5x]
    expect(kenoMultiplierRowX100('classic', 2)).toEqual([0, 190, 450]);
  });

  it('every published (risk, picks) table has a house edge (RTP < 1.0)', () => {
    const report: Record<string, Record<number, string>> = {};
    for (const risk of KENO_RISKS) {
      report[risk] = {};
      for (let picks = 1; picks <= 10; picks++) {
        const rtp = kenoRtp(risk as KenoRisk, picks);
        report[risk][picks] = (rtp * 100).toFixed(2) + '%';
        // House must never be at a disadvantage on any cell.
        expect(rtp).toBeLessThanOrEqual(1.0);
        // And the table shouldn't be absurdly stingy — sanity floor.
        expect(rtp).toBeGreaterThan(0.8);
      }
    }
    // Printed so the exact per-cell RTP is visible in the test output.
    // eslint-disable-next-line no-console
    console.log('Keno RTP by risk × picks:\n' + JSON.stringify(report, null, 2));
  });

  it('hit probabilities for each pick count sum to 1', () => {
    for (let picks = 1; picks <= 10; picks++) {
      let sum = 0;
      for (let hits = 0; hits <= picks; hits++) {
        sum += kenoHitProbability(picks, hits);
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('empirical hit distribution matches the hypergeometric model', () => {
    // Draw many times, pick a fixed 5 tiles, and confirm the observed hit
    // frequencies track kenoHitProbability — ties the PF draw to the math
    // that prices the paytable.
    const picks = [1, 2, 3, 4, 5];
    const counts = [0, 0, 0, 0, 0, 0];
    const trials = 20_000;
    for (let nonce = 0; nonce < trials; nonce++) {
      const drawn = new Set(pf.drawKenoNumbers('dist-test', 'seed', nonce));
      let hits = 0;
      for (const p of picks) if (drawn.has(p)) hits++;
      counts[hits]++;
    }
    for (let hits = 0; hits <= 5; hits++) {
      const observed = counts[hits] / trials;
      const expected = kenoHitProbability(5, hits);
      expect(Math.abs(observed - expected)).toBeLessThan(0.02);
    }
  });
});
