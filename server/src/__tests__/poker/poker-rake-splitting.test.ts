/**
 * Poker Rake & Pot Splitting Tests
 *
 * Tests the pure math functions used in pot distribution and rake calculation.
 * No database required.
 *
 * Run: cd server && npm test -- poker-rake-splitting
 */

import {
  splitBigIntEqually,
  weiToEngineChips,
  engineChipsToWeiRounded,
  enginePotChipsToPotWei,
  totalPotChips,
  assertCashChipMultiple,
  assertCashBlindsValid,
  DEFAULT_POKER_CHIP_WEI,
  MAX_ENGINE_CHIPS_BIGINT,
  getPokerChipWei,
} from '../../lib/poker-chip-scale';

const CHIP_WEI = DEFAULT_POKER_CHIP_WEI; // 10^15
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// ---------------------------------------------------------------------------
// splitBigIntEqually
// ---------------------------------------------------------------------------

describe('splitBigIntEqually', () => {
  it('splits evenly divisible amount', () => {
    const result = splitBigIntEqually(100n, 4);
    expect(result).toEqual([25n, 25n, 25n, 25n]);
  });

  it('distributes remainder to first players (1 remainder)', () => {
    const result = splitBigIntEqually(10n, 3);
    // 10 / 3 = 3 base, 1 remainder → first player gets 4, rest get 3
    expect(result).toEqual([4n, 3n, 3n]);
    expect(result.reduce((a, b) => a + b, 0n)).toBe(10n);
  });

  it('distributes remainder to first players (2 remainder)', () => {
    const result = splitBigIntEqually(11n, 3);
    // 11 / 3 = 3 base, 2 remainder → first 2 get 4, last gets 3
    expect(result).toEqual([4n, 4n, 3n]);
    expect(result.reduce((a, b) => a + b, 0n)).toBe(11n);
  });

  it('handles single player', () => {
    expect(splitBigIntEqually(100n, 1)).toEqual([100n]);
  });

  it('handles zero total', () => {
    expect(splitBigIntEqually(0n, 3)).toEqual([0n, 0n, 0n]);
  });

  it('handles zero players', () => {
    expect(splitBigIntEqually(100n, 0)).toEqual([]);
  });

  it('handles large pot with odd split', () => {
    const pot = 1000000000000000000n; // 1 MORBIUS in wei
    const result = splitBigIntEqually(pot, 3);
    const total = result.reduce((a, b) => a + b, 0n);
    expect(total).toBe(pot);
    // Max difference between any two shares should be 1
    const max = result.reduce((a, b) => a > b ? a : b, 0n);
    const min = result.reduce((a, b) => a < b ? a : b, pot);
    expect(max - min).toBeLessThanOrEqual(1n);
  });

  it('preserves total for prime-number splits', () => {
    const pot = 1000000000000000007n;
    for (const n of [2, 3, 5, 7, 11, 13]) {
      const result = splitBigIntEqually(pot, n);
      const total = result.reduce((a, b) => a + b, 0n);
      expect(total).toBe(pot);
    }
  });
});

// ---------------------------------------------------------------------------
// Wei ↔ Engine Chip conversion
// ---------------------------------------------------------------------------

describe('weiToEngineChips', () => {
  it('converts exact multiples', () => {
    expect(weiToEngineChips(CHIP_WEI)).toBe(1);
    expect(weiToEngineChips(CHIP_WEI * 100n)).toBe(100);
    expect(weiToEngineChips(CHIP_WEI * 5000n)).toBe(5000);
  });

  it('throws for non-multiples', () => {
    expect(() => weiToEngineChips(CHIP_WEI + 1n)).toThrow();
    expect(() => weiToEngineChips(CHIP_WEI - 1n)).toThrow();
    expect(() => weiToEngineChips(1n)).toThrow();
  });

  it('throws for zero', () => {
    expect(() => weiToEngineChips(0n)).toThrow();
  });

  it('throws for negative', () => {
    expect(() => weiToEngineChips(-CHIP_WEI)).toThrow();
  });
});

describe('engineChipsToWeiRounded', () => {
  it('converts positive chips', () => {
    expect(engineChipsToWeiRounded(1)).toBe(CHIP_WEI);
    expect(engineChipsToWeiRounded(100)).toBe(CHIP_WEI * 100n);
  });

  it('rounds floating point chips', () => {
    // 1.5 chips → rounds to 2 chips
    expect(engineChipsToWeiRounded(1.5)).toBe(CHIP_WEI * 2n);
    // 1.4 → rounds to 1
    expect(engineChipsToWeiRounded(1.4)).toBe(CHIP_WEI * 1n);
  });

  it('returns 0 for zero or negative', () => {
    expect(engineChipsToWeiRounded(0)).toBe(0n);
    expect(engineChipsToWeiRounded(-5)).toBe(0n);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(engineChipsToWeiRounded(NaN)).toBe(0n);
    expect(engineChipsToWeiRounded(Infinity)).toBe(0n);
  });
});

describe('wei ↔ chips roundtrip', () => {
  it('roundtrips exact chip amounts', () => {
    for (const chips of [1, 10, 100, 1000, 5000]) {
      const wei = engineChipsToWeiRounded(chips);
      const back = weiToEngineChips(wei);
      expect(back).toBe(chips);
    }
  });
});

// ---------------------------------------------------------------------------
// enginePotChipsToPotWei
// ---------------------------------------------------------------------------

describe('enginePotChipsToPotWei', () => {
  it('converts integer chips to wei', () => {
    expect(enginePotChipsToPotWei(100, CHIP_WEI)).toBe(CHIP_WEI * 100n);
  });

  it('rounds float chips before conversion', () => {
    // 100.7 → rounds to 101
    expect(enginePotChipsToPotWei(100.7, CHIP_WEI)).toBe(CHIP_WEI * 101n);
  });

  it('returns 0 for zero/negative/NaN', () => {
    expect(enginePotChipsToPotWei(0, CHIP_WEI)).toBe(0n);
    expect(enginePotChipsToPotWei(-5, CHIP_WEI)).toBe(0n);
    expect(enginePotChipsToPotWei(NaN, CHIP_WEI)).toBe(0n);
    expect(enginePotChipsToPotWei(Infinity, CHIP_WEI)).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// totalPotChips
// ---------------------------------------------------------------------------

describe('totalPotChips', () => {
  it('sums pots and outstanding bets', () => {
    const table = {
      pots: [{ amount: 100 }, { amount: 50 }],
      players: [
        { bet: 10 },
        { bet: 20 },
        null,
        { bet: 0 },
      ],
    };
    // 100 + 50 + 10 + 20 + 0 = 180
    expect(totalPotChips(table)).toBe(180);
  });

  it('handles empty pots', () => {
    const table = {
      pots: [],
      players: [{ bet: 10 }],
    };
    expect(totalPotChips(table)).toBe(10);
  });

  it('handles all null players', () => {
    const table = {
      pots: [{ amount: 200 }],
      players: [null, null, null],
    };
    expect(totalPotChips(table)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// assertCashBlindsValid
// ---------------------------------------------------------------------------

describe('assertCashBlindsValid', () => {
  it('accepts valid blinds', () => {
    expect(() => assertCashBlindsValid(CHIP_WEI, CHIP_WEI * 2n)).not.toThrow();
  });

  it('accepts equal blinds', () => {
    expect(() => assertCashBlindsValid(CHIP_WEI, CHIP_WEI)).not.toThrow();
  });

  it('rejects zero blinds', () => {
    expect(() => assertCashBlindsValid(0n, CHIP_WEI)).toThrow();
    expect(() => assertCashBlindsValid(CHIP_WEI, 0n)).toThrow();
  });

  it('rejects non-chip-multiple blinds', () => {
    expect(() => assertCashBlindsValid(CHIP_WEI + 1n, CHIP_WEI * 2n)).toThrow();
  });

  it('rejects big blind less than small blind', () => {
    expect(() => assertCashBlindsValid(CHIP_WEI * 3n, CHIP_WEI * 2n)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertCashChipMultiple
// ---------------------------------------------------------------------------

describe('assertCashChipMultiple', () => {
  it('accepts exact multiples', () => {
    expect(() => assertCashChipMultiple(CHIP_WEI, 'Test')).not.toThrow();
    expect(() => assertCashChipMultiple(CHIP_WEI * 1000n, 'Test')).not.toThrow();
  });

  it('rejects non-multiples', () => {
    expect(() => assertCashChipMultiple(CHIP_WEI + 1n, 'Test')).toThrow();
  });

  it('rejects zero', () => {
    expect(() => assertCashChipMultiple(0n, 'Test')).toThrow();
  });

  it('rejects negative', () => {
    expect(() => assertCashChipMultiple(-CHIP_WEI, 'Test')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rake calculation logic (replicates persistShowdown math)
// ---------------------------------------------------------------------------

describe('Rake calculation (persistShowdown logic)', () => {
  const RAKE_PERCENT = 5;

  function calculateRake(winnerChips: Map<string, bigint>, isTournament: boolean) {
    let totalRake = 0n;
    const rakedAmounts = new Map<string, bigint>();
    const rakeByAddr = new Map<string, bigint>();

    if (isTournament) {
      for (const [addr, ch] of winnerChips) {
        rakedAmounts.set(addr, ch);
      }
    } else {
      const pct = BigInt(RAKE_PERCENT);
      for (const [addr, ch] of winnerChips) {
        const rakeChips = (ch * pct) / 100n;
        const rakeWei = rakeChips * CHIP_WEI;
        const netChips = ch - rakeChips;
        rakedAmounts.set(addr, netChips * CHIP_WEI);
        rakeByAddr.set(addr, rakeWei);
        totalRake += rakeWei;
      }
    }

    return { totalRake, rakedAmounts, rakeByAddr };
  }

  it('single winner gets 95% of pot (cash game)', () => {
    const winners = new Map([['player1', 100n]]);
    const { totalRake, rakedAmounts } = calculateRake(winners, false);

    expect(totalRake).toBe(5n * CHIP_WEI); // 5% of 100 chips
    expect(rakedAmounts.get('player1')).toBe(95n * CHIP_WEI);
  });

  it('two-way split, even pot', () => {
    const winners = new Map([
      ['player1', 50n],
      ['player2', 50n],
    ]);
    const { totalRake, rakedAmounts } = calculateRake(winners, false);

    // Each: 50 * 5% = 2 (truncated) → net = 48 chips each
    expect(rakedAmounts.get('player1')).toBe(48n * CHIP_WEI);
    expect(rakedAmounts.get('player2')).toBe(48n * CHIP_WEI);
    expect(totalRake).toBe(4n * CHIP_WEI); // 2+2 = 4 chips total rake
  });

  it('three-way split with remainder', () => {
    // 100 chip pot split 3 ways via splitBigIntEqually:
    // [34, 33, 33] chips
    const potChips = 100n;
    const shares = splitBigIntEqually(potChips, 3);
    const winners = new Map([
      ['player1', shares[0]],
      ['player2', shares[1]],
      ['player3', shares[2]],
    ]);

    const { totalRake, rakedAmounts } = calculateRake(winners, false);

    // Each player's rake: floor(share * 5 / 100)
    // player1: floor(34 * 5 / 100) = floor(1.7) = 1 chip rake → net 33
    // player2: floor(33 * 5 / 100) = floor(1.65) = 1 chip rake → net 32
    // player3: floor(33 * 5 / 100) = floor(1.65) = 1 chip rake → net 32
    expect(rakedAmounts.get('player1')).toBe(33n * CHIP_WEI);
    expect(rakedAmounts.get('player2')).toBe(32n * CHIP_WEI);
    expect(rakedAmounts.get('player3')).toBe(32n * CHIP_WEI);
    expect(totalRake).toBe(3n * CHIP_WEI);

    // Total distributed + rake should equal original pot
    const totalDistributed = Array.from(rakedAmounts.values()).reduce((a, b) => a + b, 0n);
    expect(totalDistributed + totalRake).toBe(potChips * CHIP_WEI);
  });

  it('tournament mode has zero rake', () => {
    const winners = new Map([
      ['player1', 100n],
      ['player2', 50n],
    ]);
    const { totalRake, rakedAmounts } = calculateRake(winners, true);

    expect(totalRake).toBe(0n);
    expect(rakedAmounts.get('player1')).toBe(100n); // raw chips, no wei conversion
    expect(rakedAmounts.get('player2')).toBe(50n);
  });

  it('very small pot rake rounds to zero', () => {
    // 1 chip: 5% = 0 (integer division)
    const winners = new Map([['player1', 1n]]);
    const { totalRake, rakedAmounts } = calculateRake(winners, false);

    expect(totalRake).toBe(0n);
    expect(rakedAmounts.get('player1')).toBe(1n * CHIP_WEI);
  });

  it('large pot rake is exact', () => {
    const bigPot = 1000000n; // 1M chips
    const winners = new Map([['player1', bigPot]]);
    const { totalRake, rakedAmounts } = calculateRake(winners, false);

    expect(totalRake).toBe(50000n * CHIP_WEI); // exactly 5%
    expect(rakedAmounts.get('player1')).toBe(950000n * CHIP_WEI); // exactly 95%
  });

  it('rake + net always equals gross for any pot size', () => {
    // Property test with various pot sizes
    for (const pot of [1n, 7n, 13n, 99n, 100n, 333n, 1000n, 9999n]) {
      for (const numWinners of [1, 2, 3, 4, 5]) {
        const shares = splitBigIntEqually(pot, numWinners);
        const winners = new Map<string, bigint>();
        for (let i = 0; i < numWinners; i++) {
          winners.set(`p${i}`, shares[i]);
        }

        const { totalRake, rakedAmounts } = calculateRake(winners, false);

        // Sum of net amounts + total rake = original pot in wei
        const totalNet = Array.from(rakedAmounts.values()).reduce((a, b) => a + b, 0n);
        expect(totalNet + totalRake).toBe(pot * CHIP_WEI);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// MAX_SAFE_INTEGER boundary
// ---------------------------------------------------------------------------

describe('MAX_SAFE_INTEGER boundary', () => {
  it('MAX_ENGINE_CHIPS_BIGINT equals Number.MAX_SAFE_INTEGER as bigint', () => {
    expect(MAX_ENGINE_CHIPS_BIGINT).toBe(BigInt(MAX_SAFE));
  });

  it('weiToEngineChips accepts MAX_SAFE_INTEGER chips', () => {
    const maxWei = BigInt(MAX_SAFE) * CHIP_WEI;
    expect(weiToEngineChips(maxWei)).toBe(MAX_SAFE);
  });

  it('assertCashChipMultiple rejects above MAX_SAFE_INTEGER', () => {
    const tooMuch = (BigInt(MAX_SAFE) + 1n) * CHIP_WEI;
    expect(() => assertCashChipMultiple(tooMuch, 'Test')).toThrow('too large');
  });

  it('engineChipsToWeiRounded rejects above MAX_SAFE_INTEGER', () => {
    expect(() => engineChipsToWeiRounded(MAX_SAFE + 1)).toThrow('Stack overflow');
  });

  it('engineChipsToWeiRounded handles MAX_SAFE_INTEGER exactly', () => {
    const result = engineChipsToWeiRounded(MAX_SAFE);
    expect(result).toBe(BigInt(MAX_SAFE) * CHIP_WEI);
  });
});

// ---------------------------------------------------------------------------
// Float drift in chip conversion
// ---------------------------------------------------------------------------

describe('float drift in chip conversion', () => {
  it('engineChipsToWeiRounded handles 0.1 + 0.2 drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
    const drifted = 0.1 + 0.2;
    expect(drifted).not.toBe(0.3);
    // Should round to 0 chips (rounds to nearest int: 0)
    const result = engineChipsToWeiRounded(drifted);
    expect(result).toBe(0n); // rounds to 0, which is <= 0 → returns 0n
  });

  it('engineChipsToWeiRounded rounds 99.99999999 to 100', () => {
    const result = engineChipsToWeiRounded(99.99999999);
    expect(result).toBe(CHIP_WEI * 100n);
  });

  it('engineChipsToWeiRounded rounds 100.00000001 to 100', () => {
    const result = engineChipsToWeiRounded(100.00000001);
    expect(result).toBe(CHIP_WEI * 100n);
  });

  it('enginePotChipsToPotWei handles float sum of 3-way pot', () => {
    // Simulates chevtek engine: 100 / 3 = 33.333...
    const thirdPot = 100 / 3;
    // Three pot amounts that don't sum to exactly 100
    const sum = thirdPot + thirdPot + thirdPot;
    // Each third rounds to 33 chips → 33 * 3 = 99 (loses 1 chip)
    const result1 = enginePotChipsToPotWei(thirdPot, CHIP_WEI);
    expect(result1).toBe(CHIP_WEI * 33n);
    // The total pot should be calculated from the raw float, not per-share
    const totalResult = enginePotChipsToPotWei(sum, CHIP_WEI);
    expect(totalResult).toBe(CHIP_WEI * 100n);
  });

  it('engineChipsToWeiRounded handles very small positive float', () => {
    expect(engineChipsToWeiRounded(0.4)).toBe(0n); // rounds to 0, <=0 → 0n
    expect(engineChipsToWeiRounded(0.5)).toBe(CHIP_WEI); // rounds to 1
    expect(engineChipsToWeiRounded(0.6)).toBe(CHIP_WEI); // rounds to 1
  });
});

// ---------------------------------------------------------------------------
// Side pot distribution (replicates persistShowdown pot iteration)
// ---------------------------------------------------------------------------

describe('Side pot distribution', () => {
  const RAKE_PERCENT = 5;

  // Replicate the persistShowdown winnerChips accumulation logic
  function accumulateWinnerChips(
    pots: { amount: number; winners: { id: string; folded: boolean }[] }[]
  ): Map<string, bigint> {
    const winnerChips = new Map<string, bigint>();
    for (const pot of pots) {
      if (!pot.winners || pot.winners.length === 0) continue;
      const nonFoldedWinners = pot.winners.filter(w => !w.folded);
      if (nonFoldedWinners.length === 0) continue;
      const potChips = BigInt(Math.max(0, Math.round(pot.amount)));
      const ids = nonFoldedWinners.map(w => w.id);
      const shares = splitBigIntEqually(potChips, ids.length);
      for (let i = 0; i < ids.length; i++) {
        winnerChips.set(ids[i], (winnerChips.get(ids[i]) ?? 0n) + shares[i]);
      }
    }
    return winnerChips;
  }

  it('single pot, single winner', () => {
    const pots = [
      { amount: 100, winners: [{ id: 'alice', folded: false }] },
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.get('alice')).toBe(100n);
  });

  it('single pot, two-way tie', () => {
    const pots = [
      { amount: 100, winners: [
        { id: 'alice', folded: false },
        { id: 'bob', folded: false },
      ]},
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.get('alice')).toBe(50n);
    expect(result.get('bob')).toBe(50n);
  });

  it('main pot + side pot with different winners', () => {
    // Player A (short stack) goes all-in, wins main pot
    // Player B wins side pot (only B and C contested it)
    const pots = [
      // Main pot: all three contributed
      { amount: 150, winners: [{ id: 'A', folded: false }] },
      // Side pot: only B and C (A was all-in)
      { amount: 100, winners: [{ id: 'B', folded: false }] },
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.get('A')).toBe(150n);
    expect(result.get('B')).toBe(100n);
    expect(result.has('C')).toBe(false);
  });

  it('main pot + side pot, same winner takes both', () => {
    const pots = [
      { amount: 150, winners: [{ id: 'A', folded: false }] },
      { amount: 100, winners: [{ id: 'A', folded: false }] },
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.get('A')).toBe(250n);
  });

  it('three pots: short stack, medium stack, deep stack', () => {
    // Short all-in 30, medium all-in 60, deep has rest
    // Main pot: 30*3 = 90 (all three)
    // Side pot 1: (60-30)*2 = 60 (medium + deep)
    // Side pot 2: remaining from deep
    const pots = [
      { amount: 90, winners: [{ id: 'short', folded: false }] },
      { amount: 60, winners: [{ id: 'medium', folded: false }] },
      { amount: 20, winners: [{ id: 'deep', folded: false }] },
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.get('short')).toBe(90n);
    expect(result.get('medium')).toBe(60n);
    expect(result.get('deep')).toBe(20n);
  });

  it('folded winners are excluded from pot distribution', () => {
    // chevtek may include folded players in winners array
    const pots = [
      { amount: 100, winners: [
        { id: 'A', folded: true },
        { id: 'B', folded: false },
      ]},
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.has('A')).toBe(false);
    expect(result.get('B')).toBe(100n);
  });

  it('all winners folded — pot goes nowhere', () => {
    const pots = [
      { amount: 100, winners: [
        { id: 'A', folded: true },
        { id: 'B', folded: true },
      ]},
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.size).toBe(0);
  });

  it('odd side pot split across 3 winners preserves total', () => {
    const pots = [
      { amount: 100, winners: [
        { id: 'A', folded: false },
        { id: 'B', folded: false },
        { id: 'C', folded: false },
      ]},
    ];
    const result = accumulateWinnerChips(pots);
    const total = Array.from(result.values()).reduce((a, b) => a + b, 0n);
    expect(total).toBe(100n);
    // One player gets the extra chip
    const values = Array.from(result.values()).sort((a, b) => Number(b - a));
    expect(values[0]).toBe(34n);
    expect(values[1]).toBe(33n);
    expect(values[2]).toBe(33n);
  });

  it('multiple side pots accumulate for same winner', () => {
    // Player wins main pot AND side pot
    const pots = [
      { amount: 60, winners: [
        { id: 'A', folded: false },
        { id: 'B', folded: false },
      ]},
      { amount: 40, winners: [{ id: 'A', folded: false }] },
    ];
    const result = accumulateWinnerChips(pots);
    // A gets 30 from main pot split + 40 from side pot = 70
    expect(result.get('A')).toBe(70n);
    expect(result.get('B')).toBe(30n);
  });

  it('empty winners array is handled', () => {
    const pots = [
      { amount: 100, winners: [] },
    ];
    const result = accumulateWinnerChips(pots);
    expect(result.size).toBe(0);
  });

  it('side pot rake preserves total (gross = net + rake)', () => {
    // Multiple pots, then apply rake to accumulated winnings
    const pots = [
      { amount: 150, winners: [{ id: 'A', folded: false }] },
      { amount: 100, winners: [
        { id: 'B', folded: false },
        { id: 'C', folded: false },
      ]},
    ];
    const winnerChips = accumulateWinnerChips(pots);

    // Apply rake (replicating persistShowdown)
    const pct = BigInt(RAKE_PERCENT);
    let totalRake = 0n;
    const rakedAmounts = new Map<string, bigint>();
    for (const [addr, ch] of winnerChips) {
      const rakeChips = (ch * pct) / 100n;
      const rakeWei = rakeChips * CHIP_WEI;
      const netChips = ch - rakeChips;
      rakedAmounts.set(addr, netChips * CHIP_WEI);
      totalRake += rakeWei;
    }

    const totalNet = Array.from(rakedAmounts.values()).reduce((a, b) => a + b, 0n);
    const totalGross = Array.from(winnerChips.values()).reduce((a, b) => a + b, 0n);
    expect(totalNet + totalRake).toBe(totalGross * CHIP_WEI);
  });
});
