/**
 * Unit tests for server-side chips Plinko.
 *   • Path (ProvablyFairService.drawPlinkoPath): 16 binary steps, deterministic.
 *   • Scoring (resolvePlinko): bucket = rights count + integer chip payout.
 *   • Tables: contract-verbatim, symmetric, and every risk keeps a house edge.
 *   • Empirical bucket distribution matches the binomial model that prices the
 *     tables — ties the PF draw to the math.
 */

import { ProvablyFairService } from '../services/provably-fair.service';
import {
  resolvePlinko,
  plinkoBucketFromPath,
  plinkoMultiplierX100,
  plinkoBucketProbability,
  plinkoRtp,
  PLINKO_RISKS,
  PLINKO_ROWS,
  PLINKO_BUCKETS,
  PLINKO_MAX_BET,
  PLINKO_MULTIPLIERS_X100,
} from '../services/plinko-chips';

const pf = new ProvablyFairService();

describe('drawPlinkoPath', () => {
  it('draws exactly 16 binary steps', () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      const path = pf.drawPlinkoPath('server-seed-abc', 'client-seed-xyz', nonce);
      expect(path).toHaveLength(PLINKO_ROWS);
      for (const step of path) {
        expect(step === 0 || step === 1).toBe(true);
      }
    }
  });

  it('is deterministic for the same seeds + nonce', () => {
    const a = pf.drawPlinkoPath('s', 'c', 7);
    const b = pf.drawPlinkoPath('s', 'c', 7);
    expect(a).toEqual(b);
  });

  it('changes when the nonce changes', () => {
    const a = pf.drawPlinkoPath('s', 'c', 0);
    const b = pf.drawPlinkoPath('s', 'c', 1);
    expect(a).not.toEqual(b);
  });
});

describe('plinkoBucketFromPath / resolvePlinko', () => {
  it('bucket = count of rights', () => {
    expect(plinkoBucketFromPath(new Array(16).fill(0))).toBe(0);
    expect(plinkoBucketFromPath(new Array(16).fill(1))).toBe(16);
    expect(plinkoBucketFromPath([1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(4);
  });

  it('rejects malformed paths', () => {
    expect(() => plinkoBucketFromPath([0, 1])).toThrow();
    expect(() => plinkoBucketFromPath(new Array(16).fill(2))).toThrow();
  });

  it('pays bet × multiplier (floored)', () => {
    // low risk, all-left → bucket 0 → 16x. bet 100 → 1600.
    const r = resolvePlinko('low', 100, new Array(16).fill(0));
    expect(r.bucket).toBe(0);
    expect(r.multiplierX100).toBe(1600);
    expect(r.payout).toBe(1600);
  });

  it('floors fractional chip payouts', () => {
    // medium centre bucket (8) → 0.2x. bet 13 → floor(13 × 20 / 100) = 2.
    const path = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    const r = resolvePlinko('medium', 13, path);
    expect(r.bucket).toBe(8);
    expect(r.multiplierX100).toBe(20);
    expect(r.payout).toBe(2);
  });

  it('rejects out-of-range bets', () => {
    const path = new Array(16).fill(0);
    expect(() => resolvePlinko('low', 0, path)).toThrow();
    expect(() => resolvePlinko('low', PLINKO_MAX_BET + 1, path)).toThrow();
    expect(() => resolvePlinko('low', PLINKO_MAX_BET, path)).not.toThrow();
  });
});

describe('multiplier tables', () => {
  it('are symmetric around the centre bucket', () => {
    for (const risk of PLINKO_RISKS) {
      const t = PLINKO_MULTIPLIERS_X100[risk];
      expect(t).toHaveLength(PLINKO_BUCKETS);
      for (let b = 0; b < PLINKO_BUCKETS; b++) {
        expect(t[b]).toBe(t[PLINKO_BUCKETS - 1 - b]);
      }
    }
  });

  it('edge jackpots match the contract: 16x / 110x / 200x', () => {
    expect(plinkoMultiplierX100('low', 0)).toBe(1600);
    expect(plinkoMultiplierX100('medium', 0)).toBe(11000);
    expect(plinkoMultiplierX100('high', 0)).toBe(20000);
  });

  it('every risk table has a house edge (RTP < 1.0)', () => {
    const report: Record<string, string> = {};
    for (const risk of PLINKO_RISKS) {
      const rtp = plinkoRtp(risk);
      report[risk] = (rtp * 100).toFixed(2) + '%';
      expect(rtp).toBeLessThan(1.0);
      expect(rtp).toBeGreaterThan(0.9);
    }
    // eslint-disable-next-line no-console
    console.log('Plinko RTP by risk:\n' + JSON.stringify(report, null, 2));
  });

  it('bucket probabilities sum to 1', () => {
    let sum = 0;
    for (let b = 0; b < PLINKO_BUCKETS; b++) sum += plinkoBucketProbability(b);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});

describe('empirical distribution', () => {
  it('PF paths land in buckets per the binomial model', () => {
    const counts = new Array(PLINKO_BUCKETS).fill(0);
    const trials = 20_000;
    for (let nonce = 0; nonce < trials; nonce++) {
      const path = pf.drawPlinkoPath('dist-test', 'seed', nonce);
      counts[plinkoBucketFromPath(path)]++;
    }
    for (let b = 0; b < PLINKO_BUCKETS; b++) {
      const observed = counts[b] / trials;
      const expected = plinkoBucketProbability(b);
      expect(Math.abs(observed - expected)).toBeLessThan(0.015);
    }
  });
});
