/**
 * Pure unit tests for HolderChipRewardsService.allocateChips().
 *
 * No DB required. Covers proportional split, remainder distribution,
 * sub-chip dust, sub-basis dust, input validation, single-holder, empty input,
 * realistic 1000-holder scale.
 *
 * Run: cd server && npm test -- holder-chip-allocation
 */

import { allocateChips } from '../services/holder-chip-rewards.service';
import { POKER_CHIP_WEI } from '../lib/poker-chip-scale';

const E18 = POKER_CHIP_WEI; // 10^18

describe('allocateChips — proportional chip distribution', () => {
  it('splits a clean 60/30/10 pool with no remainder', () => {
    const holders = [
      { id: 1, wallet: 'a', basisWei: 600n * E18 },
      { id: 2, wallet: 'b', basisWei: 300n * E18 },
      { id: 3, wallet: 'c', basisWei: 100n * E18 },
    ];
    const out = allocateChips(holders, 1000n * E18, 1000n * E18);
    expect(out.map((o) => o.chips)).toEqual([600n, 300n, 100n]);
    expect(out.reduce((s, a) => s + a.chips, 0n)).toBe(1000n);
  });

  it('distributes remainder one chip at a time starting at the first slot', () => {
    // 3 holders, pool of 10 chips, equal split would give 3 each + 1 remainder
    const holders = [
      { id: 1, wallet: 'a', basisWei: 333n * E18 },
      { id: 2, wallet: 'b', basisWei: 333n * E18 },
      { id: 3, wallet: 'c', basisWei: 334n * E18 },
    ];
    const out = allocateChips(holders, 10n * E18, 1000n * E18);
    expect(out.reduce((s, a) => s + a.chips, 0n)).toBe(10n);
    // 'c' floored to 3 (334*10/1000=3.34 → 3), 'a' & 'b' similarly. Remainder=1 goes to allocs[0].
    expect(out[0].chips).toBe(4n);
    expect(out[1].chips).toBe(3n);
    expect(out[2].chips).toBe(3n);
  });

  it('returns all zeros when pool is less than 1 chip', () => {
    const holders = [
      { id: 1, wallet: 'a', basisWei: 100n * E18 },
      { id: 2, wallet: 'b', basisWei: 100n * E18 },
    ];
    const out = allocateChips(holders, E18 - 1n, 200n * E18);
    expect(out.every((o) => o.chips === 0n)).toBe(true);
  });

  it('handles dust holder (sub-basis) — gets 0 chips, pool still fully allocated', () => {
    const holders = [
      { id: 1, wallet: 'whale', basisWei: 10_000n * E18 },
      { id: 2, wallet: 'dust', basisWei: 1n }, // 1 wei
    ];
    const out = allocateChips(holders, 100n * E18, 10_000n * E18 + 1n);
    const dust = out.find((o) => o.wallet === 'dust')!;
    const whale = out.find((o) => o.wallet === 'whale')!;
    expect(dust.chips).toBe(0n);
    expect(whale.chips).toBe(100n);
  });

  it('throws when totalBasisWei is 0', () => {
    expect(() =>
      allocateChips([{ id: 1, wallet: 'a', basisWei: 1n }], 100n, 0n),
    ).toThrow('totalBasisWei must be > 0');
  });

  it('throws when poolWei is negative', () => {
    expect(() =>
      allocateChips([{ id: 1, wallet: 'a', basisWei: 1n }], -1n, 1n),
    ).toThrow('poolWei must be ≥ 0');
  });

  it('returns empty array for empty holders', () => {
    expect(allocateChips([], 100n * E18, 1n)).toEqual([]);
  });

  it('gives single holder the entire pool', () => {
    const out = allocateChips(
      [{ id: 1, wallet: 'solo', basisWei: 42n * E18 }],
      250n * E18,
      42n * E18,
    );
    expect(out).toEqual([{ id: 1, wallet: 'solo', chips: 250n }]);
  });

  it('exactly conserves pool chips at 1000-holder realistic scale', () => {
    const holders = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      wallet: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      basisWei: BigInt(1000 + i) * E18,
    }));
    const totalBasis = holders.reduce((s, h) => s + h.basisWei, 0n);
    const pool = 50_000n * E18;
    const out = allocateChips(holders, pool, totalBasis);
    const sum = out.reduce((s, a) => s + a.chips, 0n);
    expect(sum).toBe(50_000n);
    expect(out.every((a) => a.chips >= 0n)).toBe(true);
  });

  it('preserves the holder id and wallet on every output row', () => {
    const holders = [
      { id: 7, wallet: '0xabc', basisWei: 10n * E18 },
      { id: 9, wallet: '0xdef', basisWei: 10n * E18 },
    ];
    const out = allocateChips(holders, 4n * E18, 20n * E18);
    expect(out.map((o) => o.id).sort()).toEqual([7, 9]);
    expect(out.map((o) => o.wallet).sort()).toEqual(['0xabc', '0xdef']);
  });

  it('rounds dust down — sub-chip pool wei never becomes a chip', () => {
    // 1.5 chips worth of pool, two equal holders → 0.75 each → both floor to 0,
    // then remainder = 1 chip (since poolChips floored to 1), goes to allocs[0].
    const holders = [
      { id: 1, wallet: 'a', basisWei: 1n * E18 },
      { id: 2, wallet: 'b', basisWei: 1n * E18 },
    ];
    const out = allocateChips(holders, (3n * E18) / 2n, 2n * E18);
    const sum = out.reduce((s, a) => s + a.chips, 0n);
    expect(sum).toBe(1n);
    expect(out[0].chips).toBe(1n);
    expect(out[1].chips).toBe(0n);
  });

  it('handles extremely lopsided basis without overflow or sign flip', () => {
    const holders = [
      { id: 1, wallet: 'whale', basisWei: 10n ** 30n }, // 10^30 wei
      { id: 2, wallet: 'minnow', basisWei: 1n * E18 },
    ];
    const totalBasis = holders.reduce((s, h) => s + h.basisWei, 0n);
    const out = allocateChips(holders, 1_000_000n * E18, totalBasis);
    expect(out.find((o) => o.wallet === 'whale')!.chips).toBeGreaterThan(0n);
    expect(out.find((o) => o.wallet === 'minnow')!.chips).toBeGreaterThanOrEqual(0n);
    const sum = out.reduce((s, a) => s + a.chips, 0n);
    expect(sum).toBe(1_000_000n);
  });
});
