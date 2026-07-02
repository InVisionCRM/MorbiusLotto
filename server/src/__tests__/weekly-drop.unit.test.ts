/**
 * Pure unit tests for The Weekly Drop fairness helpers (WEEKLY_DROP_SPEC.md).
 *
 * No DB required. Covers selectWinners determinism, without-replacement
 * semantics, weighted-distribution sanity, commitment reproducibility, the
 * Sunday-20:00-UTC close computation and the 60/25/15 prize split.
 *
 * Run: cd server && npm test -- --selectProjects unit --testPathPattern weekly-drop
 */

import {
  selectWinners,
  canonicalEntryListJSON,
  entryListHash,
  computeCommitment,
  nextSundayCloseUTC,
  splitPrizes,
  type DropEntrySnapshot,
} from '../services/weekly-drop.service';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

describe('selectWinners — seeded deterministic weighted sampling', () => {
  const entries: DropEntrySnapshot[] = [
    { address: addr(1), entries: 10 },
    { address: addr(2), entries: 40 },
    { address: addr(3), entries: 1 },
    { address: addr(4), entries: 25 },
    { address: addr(5), entries: 24 },
  ];

  it('is fully deterministic for a fixed seed + entry list', () => {
    const seed = 'a'.repeat(64);
    const first = selectWinners(seed, entries, 3);
    for (let i = 0; i < 50; i++) {
      expect(selectWinners(seed, entries, 3)).toEqual(first);
    }
    // Input order must not matter (canonical sort inside).
    const shuffled = [...entries].reverse();
    expect(selectWinners(seed, shuffled, 3)).toEqual(first);
  });

  it('different seeds produce different outcomes (overwhelmingly)', () => {
    const a = selectWinners('a'.repeat(64), entries, 3);
    const b = selectWinners('b'.repeat(64), entries, 3);
    expect(a).not.toEqual(b);
  });

  it('never picks the same player twice (without replacement per player)', () => {
    for (let s = 0; s < 200; s++) {
      const winners = selectWinners(`seed-${s}`, entries, 3);
      expect(new Set(winners).size).toBe(winners.length);
      expect(winners).toHaveLength(3);
    }
  });

  it('handles fewer players than requested winners / empty lists', () => {
    expect(selectWinners('x', [], 3)).toEqual([]);
    expect(selectWinners('x', [{ address: addr(9), entries: 5 }], 3)).toEqual([addr(9)]);
    // zero-entry players are excluded entirely
    expect(selectWinners('x', [{ address: addr(9), entries: 0 }], 3)).toEqual([]);
  });

  it('distribution sanity: rank-1 win rate tracks entry weight', () => {
    const trials = 2000;
    const rank1Counts = new Map<string, number>();
    for (let s = 0; s < trials; s++) {
      const [w] = selectWinners(`dist-seed-${s}`, entries, 3);
      rank1Counts.set(w, (rank1Counts.get(w) ?? 0) + 1);
    }
    const total = 10 + 40 + 1 + 25 + 24;
    // 40%-weight player should win rank 1 ~40% of the time (loose bounds).
    const heavy = (rank1Counts.get(addr(2)) ?? 0) / trials;
    expect(heavy).toBeGreaterThan(0.4 * 0.75);
    expect(heavy).toBeLessThan(0.4 * 1.25);
    // 1%-weight player should almost never take rank 1.
    const light = (rank1Counts.get(addr(3)) ?? 0) / trials;
    expect(light).toBeLessThan(0.05);
    // Every rank-1 winner must be a real participant.
    for (const w of rank1Counts.keys()) {
      expect(entries.some((e) => e.address === w)).toBe(true);
    }
    expect(total).toBe(100);
  });
});

describe('commit-reveal helpers', () => {
  it('canonical JSON is order-independent and filters zero-entry rows', () => {
    const a: DropEntrySnapshot[] = [
      { address: addr(2), entries: 3 },
      { address: addr(1), entries: 1 },
      { address: addr(3), entries: 0 },
    ];
    const b: DropEntrySnapshot[] = [
      { address: addr(1), entries: 1 },
      { address: addr(2), entries: 3 },
    ];
    expect(canonicalEntryListJSON(a)).toBe(canonicalEntryListJSON(b));
    expect(entryListHash(a)).toBe(entryListHash(b));
  });

  it('commitment is reproducible from seed + entry list (verify recipe)', () => {
    const list: DropEntrySnapshot[] = [{ address: addr(1), entries: 7 }];
    const seed = 'f00d'.repeat(16);
    const c1 = computeCommitment(seed, entryListHash(list));
    const c2 = computeCommitment(seed, entryListHash(list));
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCommitment('e'.repeat(64), entryListHash(list))).not.toBe(c1);
  });
});

describe('nextSundayCloseUTC', () => {
  it('rolls to the coming Sunday 20:00 UTC', () => {
    // Wed 2026-07-01 → Sun 2026-07-05 20:00 UTC
    const d = nextSundayCloseUTC(new Date('2026-07-01T12:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-05T20:00:00.000Z');
  });

  it('same Sunday qualifies if before 20:00 UTC; otherwise next week', () => {
    expect(nextSundayCloseUTC(new Date('2026-07-05T19:59:59Z')).toISOString())
      .toBe('2026-07-05T20:00:00.000Z');
    expect(nextSundayCloseUTC(new Date('2026-07-05T20:00:00Z')).toISOString())
      .toBe('2026-07-12T20:00:00.000Z');
  });
});

describe('splitPrizes — 60/25/15 with dust to rank 1', () => {
  it('sums exactly to the pot', () => {
    for (const pot of [25000n, 25001n, 3n, 999999999999999999n]) {
      const shares = splitPrizes(pot);
      expect(shares).toHaveLength(3);
      expect(shares.reduce((s, x) => s + x, 0n)).toBe(pot);
      expect(shares[0] >= shares[1] && shares[1] >= shares[2]).toBe(true);
    }
  });

  it('matches the spec split on a clean pot', () => {
    expect(splitPrizes(25000n)).toEqual([15000n, 6250n, 3750n]);
  });
});
