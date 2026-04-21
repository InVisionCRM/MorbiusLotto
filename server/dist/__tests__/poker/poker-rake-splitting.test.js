"use strict";
/**
 * Poker Rake & Pot Splitting Tests
 *
 * Tests the pure math functions used in pot distribution and rake calculation.
 * No database required.
 *
 * Run: cd server && npm test -- poker-rake-splitting
 */
Object.defineProperty(exports, "__esModule", { value: true });
const poker_chip_scale_1 = require("../../lib/poker-chip-scale");
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
// ---------------------------------------------------------------------------
// splitBigIntEqually
// ---------------------------------------------------------------------------
describe('splitBigIntEqually', () => {
    it('splits evenly divisible amount', () => {
        const result = (0, poker_chip_scale_1.splitBigIntEqually)(100n, 4);
        expect(result).toEqual([25n, 25n, 25n, 25n]);
    });
    it('distributes remainder to first players (1 remainder)', () => {
        const result = (0, poker_chip_scale_1.splitBigIntEqually)(10n, 3);
        expect(result).toEqual([4n, 3n, 3n]);
        expect(result.reduce((a, b) => a + b, 0n)).toBe(10n);
    });
    it('distributes remainder to first players (2 remainder)', () => {
        const result = (0, poker_chip_scale_1.splitBigIntEqually)(11n, 3);
        expect(result).toEqual([4n, 4n, 3n]);
        expect(result.reduce((a, b) => a + b, 0n)).toBe(11n);
    });
    it('handles single player', () => {
        expect((0, poker_chip_scale_1.splitBigIntEqually)(100n, 1)).toEqual([100n]);
    });
    it('handles zero total', () => {
        expect((0, poker_chip_scale_1.splitBigIntEqually)(0n, 3)).toEqual([0n, 0n, 0n]);
    });
    it('handles zero players', () => {
        expect((0, poker_chip_scale_1.splitBigIntEqually)(100n, 0)).toEqual([]);
    });
    it('handles large pot with odd split', () => {
        const pot = 1000000000000000000n;
        const result = (0, poker_chip_scale_1.splitBigIntEqually)(pot, 3);
        const total = result.reduce((a, b) => a + b, 0n);
        expect(total).toBe(pot);
        const max = result.reduce((a, b) => a > b ? a : b, 0n);
        const min = result.reduce((a, b) => a < b ? a : b, pot);
        expect(max - min).toBeLessThanOrEqual(1n);
    });
    it('preserves total for prime-number splits', () => {
        const pot = 1000000000000000007n;
        for (const n of [2, 3, 5, 7, 11, 13]) {
            const result = (0, poker_chip_scale_1.splitBigIntEqually)(pot, n);
            const total = result.reduce((a, b) => a + b, 0n);
            expect(total).toBe(pot);
        }
    });
});
// ---------------------------------------------------------------------------
// weiToChips / chipsToWei
// ---------------------------------------------------------------------------
describe('weiToChips', () => {
    it('converts exact multiples', () => {
        expect((0, poker_chip_scale_1.weiToChips)(poker_chip_scale_1.POKER_CHIP_WEI)).toBe(1);
        expect((0, poker_chip_scale_1.weiToChips)(poker_chip_scale_1.POKER_CHIP_WEI * 100n)).toBe(100);
        expect((0, poker_chip_scale_1.weiToChips)(poker_chip_scale_1.POKER_CHIP_WEI * 5000n)).toBe(5000);
    });
    it('accepts zero', () => {
        expect((0, poker_chip_scale_1.weiToChips)(0n)).toBe(0);
    });
    it('throws for non-multiples', () => {
        expect(() => (0, poker_chip_scale_1.weiToChips)(poker_chip_scale_1.POKER_CHIP_WEI + 1n)).toThrow();
        expect(() => (0, poker_chip_scale_1.weiToChips)(poker_chip_scale_1.POKER_CHIP_WEI - 1n)).toThrow();
        expect(() => (0, poker_chip_scale_1.weiToChips)(1n)).toThrow();
    });
    it('throws for negative', () => {
        expect(() => (0, poker_chip_scale_1.weiToChips)(-poker_chip_scale_1.POKER_CHIP_WEI)).toThrow();
    });
});
describe('chipsToWei', () => {
    it('converts positive chips', () => {
        expect((0, poker_chip_scale_1.chipsToWei)(1)).toBe(poker_chip_scale_1.POKER_CHIP_WEI);
        expect((0, poker_chip_scale_1.chipsToWei)(100)).toBe(poker_chip_scale_1.POKER_CHIP_WEI * 100n);
    });
    it('rounds floating point chips', () => {
        expect((0, poker_chip_scale_1.chipsToWei)(1.5)).toBe(poker_chip_scale_1.POKER_CHIP_WEI * 2n);
        expect((0, poker_chip_scale_1.chipsToWei)(1.4)).toBe(poker_chip_scale_1.POKER_CHIP_WEI * 1n);
    });
    it('returns 0 for zero', () => {
        expect((0, poker_chip_scale_1.chipsToWei)(0)).toBe(0n);
    });
    it('throws for negative', () => {
        expect(() => (0, poker_chip_scale_1.chipsToWei)(-5)).toThrow();
    });
});
describe('wei ↔ chips roundtrip', () => {
    it('roundtrips exact chip amounts', () => {
        for (const chips of [1, 10, 100, 1000, 5000]) {
            const wei = (0, poker_chip_scale_1.chipsToWei)(chips);
            const back = (0, poker_chip_scale_1.weiToChips)(wei);
            expect(back).toBe(chips);
        }
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
        expect((0, poker_chip_scale_1.totalPotChips)(table)).toBe(180);
    });
    it('handles empty pots', () => {
        const table = {
            pots: [],
            players: [{ bet: 10 }],
        };
        expect((0, poker_chip_scale_1.totalPotChips)(table)).toBe(10);
    });
    it('handles all null players', () => {
        const table = {
            pots: [{ amount: 200 }],
            players: [null, null, null],
        };
        expect((0, poker_chip_scale_1.totalPotChips)(table)).toBe(200);
    });
});
// ---------------------------------------------------------------------------
// MAX_SAFE_INTEGER boundary
// ---------------------------------------------------------------------------
describe('MAX_SAFE_INTEGER boundary', () => {
    it('MAX_ENGINE_CHIPS_BIGINT equals Number.MAX_SAFE_INTEGER as bigint', () => {
        expect(poker_chip_scale_1.MAX_ENGINE_CHIPS_BIGINT).toBe(BigInt(MAX_SAFE));
    });
    it('weiToChips accepts MAX_SAFE_INTEGER chips', () => {
        const maxWei = BigInt(MAX_SAFE) * poker_chip_scale_1.POKER_CHIP_WEI;
        expect((0, poker_chip_scale_1.weiToChips)(maxWei)).toBe(MAX_SAFE);
    });
    it('chipsToWei rejects above MAX_SAFE_INTEGER', () => {
        expect(() => (0, poker_chip_scale_1.chipsToWei)(MAX_SAFE + 1)).toThrow();
    });
    it('chipsToWei handles MAX_SAFE_INTEGER exactly', () => {
        const result = (0, poker_chip_scale_1.chipsToWei)(MAX_SAFE);
        expect(result).toBe(BigInt(MAX_SAFE) * poker_chip_scale_1.POKER_CHIP_WEI);
    });
});
// ---------------------------------------------------------------------------
// Rake calculation logic (replicates persistShowdown math)
// ---------------------------------------------------------------------------
describe('Rake calculation (persistShowdown logic)', () => {
    const RAKE_PERCENT = 5;
    /**
     * Chip-only rake: rake is computed in chips, then the total is converted to wei
     * once at the boundary for crediting the rake wallet. Winners are credited
     * net chips directly.
     */
    function calculateRake(winnerChips, isTournament) {
        let totalRakeChips = 0n;
        const netChipsByAddr = new Map();
        const rakeByAddr = new Map();
        if (isTournament) {
            for (const [addr, ch] of winnerChips) {
                netChipsByAddr.set(addr, ch);
            }
        }
        else {
            const pct = BigInt(RAKE_PERCENT);
            for (const [addr, ch] of winnerChips) {
                const rakeChips = (ch * pct) / 100n;
                const netChips = ch - rakeChips;
                netChipsByAddr.set(addr, netChips);
                rakeByAddr.set(addr, rakeChips);
                totalRakeChips += rakeChips;
            }
        }
        return { totalRakeChips, netChipsByAddr, rakeByAddr };
    }
    it('single winner gets 95% of pot (cash game)', () => {
        const winners = new Map([['player1', 100n]]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
        expect(totalRakeChips).toBe(5n);
        expect(netChipsByAddr.get('player1')).toBe(95n);
    });
    it('two-way split, even pot', () => {
        const winners = new Map([
            ['player1', 50n],
            ['player2', 50n],
        ]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
        expect(netChipsByAddr.get('player1')).toBe(48n);
        expect(netChipsByAddr.get('player2')).toBe(48n);
        expect(totalRakeChips).toBe(4n);
    });
    it('three-way split with remainder', () => {
        const potChips = 100n;
        const shares = (0, poker_chip_scale_1.splitBigIntEqually)(potChips, 3);
        const winners = new Map([
            ['player1', shares[0]],
            ['player2', shares[1]],
            ['player3', shares[2]],
        ]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
        expect(netChipsByAddr.get('player1')).toBe(33n);
        expect(netChipsByAddr.get('player2')).toBe(32n);
        expect(netChipsByAddr.get('player3')).toBe(32n);
        expect(totalRakeChips).toBe(3n);
        const totalDistributed = Array.from(netChipsByAddr.values()).reduce((a, b) => a + b, 0n);
        expect(totalDistributed + totalRakeChips).toBe(potChips);
    });
    it('tournament mode has zero rake', () => {
        const winners = new Map([
            ['player1', 100n],
            ['player2', 50n],
        ]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, true);
        expect(totalRakeChips).toBe(0n);
        expect(netChipsByAddr.get('player1')).toBe(100n);
        expect(netChipsByAddr.get('player2')).toBe(50n);
    });
    it('very small pot rake rounds to zero', () => {
        const winners = new Map([['player1', 1n]]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
        expect(totalRakeChips).toBe(0n);
        expect(netChipsByAddr.get('player1')).toBe(1n);
    });
    it('large pot rake is exact', () => {
        const bigPot = 1000000n;
        const winners = new Map([['player1', bigPot]]);
        const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
        expect(totalRakeChips).toBe(50000n);
        expect(netChipsByAddr.get('player1')).toBe(950000n);
    });
    it('rake + net always equals gross for any pot size', () => {
        for (const pot of [1n, 7n, 13n, 99n, 100n, 333n, 1000n, 9999n]) {
            for (const numWinners of [1, 2, 3, 4, 5]) {
                const shares = (0, poker_chip_scale_1.splitBigIntEqually)(pot, numWinners);
                const winners = new Map();
                for (let i = 0; i < numWinners; i++) {
                    winners.set(`p${i}`, shares[i]);
                }
                const { totalRakeChips, netChipsByAddr } = calculateRake(winners, false);
                const totalNet = Array.from(netChipsByAddr.values()).reduce((a, b) => a + b, 0n);
                expect(totalNet + totalRakeChips).toBe(pot);
            }
        }
    });
});
// ---------------------------------------------------------------------------
// Side pot distribution (replicates persistShowdown pot iteration)
// ---------------------------------------------------------------------------
describe('Side pot distribution', () => {
    function accumulateWinnerChips(pots) {
        const winnerChips = new Map();
        for (const pot of pots) {
            if (!pot.winners || pot.winners.length === 0)
                continue;
            const nonFoldedWinners = pot.winners.filter(w => !w.folded);
            if (nonFoldedWinners.length === 0)
                continue;
            const potChips = BigInt(Math.max(0, Math.round(pot.amount)));
            const ids = nonFoldedWinners.map(w => w.id);
            const shares = (0, poker_chip_scale_1.splitBigIntEqually)(potChips, ids.length);
            for (let i = 0; i < ids.length; i++) {
                winnerChips.set(ids[i], (winnerChips.get(ids[i]) ?? 0n) + shares[i]);
            }
        }
        return winnerChips;
    }
    it('single pot, single winner', () => {
        const pots = [{ amount: 100, winners: [{ id: 'alice', folded: false }] }];
        const result = accumulateWinnerChips(pots);
        expect(result.get('alice')).toBe(100n);
    });
    it('single pot, two-way tie', () => {
        const pots = [
            { amount: 100, winners: [
                    { id: 'alice', folded: false },
                    { id: 'bob', folded: false },
                ] },
        ];
        const result = accumulateWinnerChips(pots);
        expect(result.get('alice')).toBe(50n);
        expect(result.get('bob')).toBe(50n);
    });
    it('main pot + side pot with different winners', () => {
        const pots = [
            { amount: 150, winners: [{ id: 'A', folded: false }] },
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
        const pots = [
            { amount: 100, winners: [
                    { id: 'A', folded: true },
                    { id: 'B', folded: false },
                ] },
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
                ] },
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
                ] },
        ];
        const result = accumulateWinnerChips(pots);
        const total = Array.from(result.values()).reduce((a, b) => a + b, 0n);
        expect(total).toBe(100n);
        const values = Array.from(result.values()).sort((a, b) => Number(b - a));
        expect(values[0]).toBe(34n);
        expect(values[1]).toBe(33n);
        expect(values[2]).toBe(33n);
    });
    it('multiple side pots accumulate for same winner', () => {
        const pots = [
            { amount: 60, winners: [
                    { id: 'A', folded: false },
                    { id: 'B', folded: false },
                ] },
            { amount: 40, winners: [{ id: 'A', folded: false }] },
        ];
        const result = accumulateWinnerChips(pots);
        expect(result.get('A')).toBe(70n);
        expect(result.get('B')).toBe(30n);
    });
    it('empty winners array is handled', () => {
        const pots = [{ amount: 100, winners: [] }];
        const result = accumulateWinnerChips(pots);
        expect(result.size).toBe(0);
    });
});
//# sourceMappingURL=poker-rake-splitting.test.js.map