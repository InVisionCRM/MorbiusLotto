/**
 * Unit tests for the arcade Mines rules (server/src/services/arcade-mines.ts).
 *
 * Covers:
 *   • The multiplier ladder against the closed-form C(25,k)/C(25-m,k) ratio.
 *   • The house-edge target (1%) for the first-pick multiplier across all bomb
 *     counts — easiest case to reason about analytically.
 *   • Bomb derivation determinism and uniqueness from the HMAC stream.
 *   • Payout flooring and bet/bomb bounds enforcement.
 */

import {
  MINES_HOUSE_EDGE_BP,
  MINES_MAX_BOMBS,
  MINES_MIN_BOMBS,
  MINES_TOTAL_CELLS,
  deriveBombGrid,
  minesMultiplierLadder,
  minesMultiplierX100,
  minesPayout,
} from '../services/arcade-mines';
import { ProvablyFairService } from '../services/provably-fair.service';

function combo(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

describe('minesMultiplierX100', () => {
  it('returns 1.00x at zero picks for any bomb count', () => {
    for (let bombs = MINES_MIN_BOMBS; bombs <= MINES_MAX_BOMBS; bombs++) {
      expect(minesMultiplierX100(bombs, 0)).toBe(100);
    }
  });

  it('matches (1 - houseEdge) × C(25,k) / C(25-m,k) within rounding', () => {
    const house = 1 - MINES_HOUSE_EDGE_BP / 10_000;
    for (let bombs = 1; bombs <= 5; bombs++) {
      const safe = MINES_TOTAL_CELLS - bombs;
      for (let k = 1; k <= safe; k++) {
        const theoreticalX100 = Math.max(
          100,
          Math.floor(house * (combo(MINES_TOTAL_CELLS, k) / combo(safe, k)) * 100),
        );
        expect(minesMultiplierX100(bombs, k)).toBe(theoreticalX100);
      }
    }
  });

  it('bakes a ~1% house edge into the single-pick multiplier', () => {
    // After one safe reveal, EV/bet = (safe/total) × multiplier.
    // For an honest 1% house edge this product should be ≈ 0.99 for any bombs.
    for (let bombs = 1; bombs <= MINES_MAX_BOMBS - 1; bombs++) {
      const m = minesMultiplierX100(bombs, 1) / 100;
      const safe = MINES_TOTAL_CELLS - bombs;
      const ev = (safe / MINES_TOTAL_CELLS) * m;
      // Allow a small slack — minesMultiplierX100 floors to integer ×100, so a
      // truncation of up to 0.005 per multiplier is expected, and EV scales it
      // by ~safe/25 ≤ 1.
      expect(Math.abs(ev - 0.99)).toBeLessThan(0.01);
    }
  });

  it('rejects out-of-range bombs and picks', () => {
    expect(() => minesMultiplierX100(0, 1)).toThrow();
    expect(() => minesMultiplierX100(25, 1)).toThrow();
    expect(() => minesMultiplierX100(5, -1)).toThrow();
    // Picking more cells than are safe is illegal.
    expect(() => minesMultiplierX100(5, MINES_TOTAL_CELLS - 5 + 1)).toThrow();
  });
});

describe('minesMultiplierLadder', () => {
  it('has the right length and starts at 100', () => {
    const l = minesMultiplierLadder(3);
    expect(l).toHaveLength(MINES_TOTAL_CELLS - 3 + 1);
    expect(l[0]).toBe(100);
    expect(l[l.length - 1]).toBeGreaterThan(100);
  });

  it('is strictly non-decreasing', () => {
    for (let bombs = 1; bombs <= MINES_MAX_BOMBS; bombs++) {
      const l = minesMultiplierLadder(bombs);
      for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThanOrEqual(l[i - 1]);
    }
  });
});

describe('minesPayout', () => {
  it('returns the floored bet × multiplier', () => {
    // bombs=3, picks=1 → multiplier ≈ 0.99 × 25/22 ≈ 1.1250 → x100=112
    const m = minesMultiplierX100(3, 1);
    expect(minesPayout(100, 3, 1)).toBe(Math.floor((100 * m) / 100));
  });

  it('rejects bets outside the supported range', () => {
    expect(() => minesPayout(0, 3, 1)).toThrow();
    expect(() => minesPayout(100_000, 3, 1)).toThrow();
  });
});

describe('deriveBombGrid', () => {
  const pf = new ProvablyFairService();
  const serverSeed = '00'.repeat(32); // deterministic test seed
  const clientSeed = 'test-client';

  const stream = (cursor: number) => pf.hmacByteStream(serverSeed, clientSeed, 0, cursor);
  const bts = (b: Buffer | Uint8Array) => pf.bytesToFloat(b);

  it('returns the requested number of unique cells, all in [0,25)', () => {
    for (let bombs = 1; bombs <= MINES_MAX_BOMBS; bombs++) {
      const g = deriveBombGrid(stream, bts, bombs);
      expect(g).toHaveLength(bombs);
      expect(new Set(g).size).toBe(bombs);
      for (const i of g) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(MINES_TOTAL_CELLS);
      }
    }
  });

  it('returns a sorted grid for a canonical representation', () => {
    const g = deriveBombGrid(stream, bts, 5);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeGreaterThan(g[i - 1]);
  });

  it('is deterministic for the same seeds and bombs count', () => {
    const a = deriveBombGrid(stream, bts, 7);
    const b = deriveBombGrid(stream, bts, 7);
    expect(a).toEqual(b);
  });

  it('changes the grid when the client seed changes', () => {
    const a = deriveBombGrid(stream, bts, 7);
    const altStream = (cursor: number) => pf.hmacByteStream(serverSeed, 'different', 0, cursor);
    const b = deriveBombGrid(altStream, bts, 7);
    expect(a).not.toEqual(b);
  });
});
