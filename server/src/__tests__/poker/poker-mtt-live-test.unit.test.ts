/**
 * 100-player MTT live test — pure logic (no DB):
 *   - the 70-bot 'mtt' roster is deterministic and matches migration 203 exactly
 *   - the 'mtt' role is isolated from the daily ('tournament') and cash pools
 *   - balancing / table-breaking planner and next-big-blind selection
 *   - event config defaults (50,050 pool split in full) + the daily-freeroll overlap guard
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMttBotRoster,
  mttBotWallet,
  MTT_BOT_COUNT,
  MTT_BOT_NAMES,
} from '../../lib/poker-mtt-bot-roster';
import { listPokerBotAccounts, setPokerBotRegistryForTesting } from '../../lib/poker-bot-registry';
import { PokerTournamentService } from '../../services/poker-tournament.service';
import {
  buildMttLiveTestConfig,
  dailySlotConflicts,
  MTT_LIVE_TEST_DEFAULTS,
  mttLiveTestSlotKey,
} from '../../services/poker-mtt-event.service';
import { parseScheduleTimes, zonedToUtc } from '../../services/poker-bot-schedule.service';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/203_poker_mtt_live_test.sql'),
  'utf8',
);

/** Surnames / nicknames of well-known players — none may appear in an MTT bot name. */
const REAL_PLAYER_NAMES = [
  'brunson', 'hellmuth', 'negreanu', 'ivey', 'dwan', 'polk', 'selbst', 'chan', 'seidel', 'moneymaker',
  'esfandiari', 'mercier', 'hansen', 'ungar', 'mizrachi', 'ferguson', 'matusow', 'laak', 'lederer',
  'antonius', 'grospellier', 'holz', 'schemion', 'koon', 'bonomo', 'adelstein', 'jungleman', 'durrrr',
  'isildur', 'kidpoker', 'devilfish', 'texasdolly', 'pokerbrat', 'reese', 'cates', 'galfond', 'tilly',
];

describe('MTT bot roster (migration 203)', () => {
  const roster = buildMttBotRoster();

  it('has 70 bots with unique names and wallets 0x…b100–0x…b169', () => {
    expect(roster).toHaveLength(MTT_BOT_COUNT);
    expect(MTT_BOT_NAMES.length).toBeGreaterThanOrEqual(MTT_BOT_COUNT);
    expect(new Set(roster.map((b) => b.displayName.toLowerCase())).size).toBe(70);
    expect(new Set(roster.map((b) => b.walletAddress)).size).toBe(70);
    expect(roster[0].walletAddress).toBe('0x000000000000000000000000000000000000b100');
    expect(roster[69].walletAddress).toBe('0x000000000000000000000000000000000000b169');
    for (const b of roster) expect(b.walletAddress).toMatch(/^0x0{36}b1[0-6][0-9]$/);
  });

  it('never collides with the daily (b071–b077) or cash (b081–b087) bots', () => {
    const taken = new Set([...'1234567'].flatMap((d) => [`b07${d}`, `b08${d}`]).map((s) => `0x${'0'.repeat(36)}${s}`));
    for (const b of roster) expect(taken.has(b.walletAddress)).toBe(false);
  });

  it('uses made-up names: no "_bot" suffix, no real players, seat-tag sized', () => {
    for (const b of roster) {
      expect(b.displayName).not.toMatch(/_bot$/i);
      expect(b.displayName.length).toBeLessThanOrEqual(16);
      expect(b.displayName).toMatch(/^[A-Za-z]+$/);
      for (const real of REAL_PLAYER_NAMES) expect(b.displayName.toLowerCase()).not.toContain(real);
      expect(b.displayName).not.toMatch(/beat\s*the\s*bots/i);
    }
  });

  it('is deterministic and spans varied archetypes within the AI dial ranges', () => {
    expect(buildMttBotRoster()).toEqual(roster);
    const archetypes = new Set(roster.map((b) => b.archetype));
    expect(archetypes).toEqual(new Set(['rock', 'tag', 'lag', 'station', 'maniac']));
    for (const b of roster) {
      const p = b.personality;
      for (const v of [p.tightness, p.aggression]) expect(v).toBeGreaterThanOrEqual(0.05);
      expect(p.bluff).toBeGreaterThanOrEqual(0);
      expect(p.bluff).toBeLessThanOrEqual(0.25);
    }
    // the spread is real, not 70 copies of one profile
    const tight = roster.map((b) => b.personality.tightness);
    expect(Math.max(...tight) - Math.min(...tight)).toBeGreaterThan(0.5);
  });

  it('migration 203 inserts exactly the generated roster as role mtt', () => {
    const rows = [...MIGRATION.matchAll(/\('(0x[0-9a-f]{40})', '([^']+)', '(\{[^']+\})', 'mtt'\)/g)];
    expect(rows).toHaveLength(70);
    rows.forEach((m, i) => {
      expect(m[1]).toBe(roster[i].walletAddress);
      expect(m[2]).toBe(roster[i].displayName);
      expect(JSON.parse(m[3])).toEqual(roster[i].personality);
    });
  });

  it('migration 203 widens the role check, adds fees_waived and a fee-aware prize function', () => {
    expect(MIGRATION).toMatch(/CHECK \(role IN \('tournament', 'cash', 'mtt'\)\)/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS fees_waived BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(MIGRATION).toMatch(/IF waived THEN\s+total_fee := 0;/);
  });

  it('mttBotWallet rejects out-of-range indices', () => {
    expect(() => mttBotWallet(-1)).toThrow();
    expect(() => mttBotWallet(100)).toThrow();
  });
});

describe('poker bot registry: mtt role isolation', () => {
  afterEach(() => setPokerBotRegistryForTesting(null));

  it("keeps 'mtt' bots out of the daily ('tournament') and cash pools", () => {
    setPokerBotRegistryForTesting([
      { walletAddress: '0x000000000000000000000000000000000000b071', displayName: 'A', personality: {}, role: 'tournament' },
      { walletAddress: '0x000000000000000000000000000000000000b081', displayName: 'B', personality: {}, role: 'cash' },
      { walletAddress: '0x000000000000000000000000000000000000b100', displayName: 'C', personality: {}, role: 'mtt' },
    ]);
    expect(listPokerBotAccounts('tournament').map((b) => b.displayName)).toEqual(['A']);
    expect(listPokerBotAccounts('cash').map((b) => b.displayName)).toEqual(['B']);
    expect(listPokerBotAccounts('mtt').map((b) => b.displayName)).toEqual(['C']);
    expect(listPokerBotAccounts()).toHaveLength(3);
  });
});

describe('PokerTournamentService.nextBigBlindPosition', () => {
  const nbb = PokerTournamentService.nextBigBlindPosition;
  it('is two occupied seats after the next button', () => {
    // button was 0 → next button 2, SB 5, BB 7
    expect(nbb(0, [0, 2, 5, 7, 9], 10)).toBe(7);
    // wraps around the table
    expect(nbb(7, [0, 2, 5, 7, 9], 10)).toBe(2);
  });
  it('heads-up: the non-button seat is the big blind', () => {
    expect(nbb(3, [3, 6], 10)).toBe(3);
  });
  it('handles empty / single seat', () => {
    expect(nbb(0, [], 10)).toBeNull();
    expect(nbb(0, [4], 10)).toBe(4);
  });
});

describe('PokerTournamentService.planMttBalance', () => {
  const plan = PokerTournamentService.planMttBalance;
  const opts = { seatsPerTable: 10, finalTableSize: 9 };
  const t = (id: string, count: number, seq: number) => ({ id, seq, count, maxSeats: 10 });

  it('does nothing when tables are within one of each other', () => {
    expect(plan([t('a', 10, 1), t('b', 9, 2), t('c', 9, 3)], 'a', opts)).toEqual({ kind: 'none' });
  });

  it('moves from the biggest (source) table to the smallest when 2+ apart, one at a time', () => {
    const r = plan([t('a', 10, 1), t('b', 8, 2), t('c', 10, 3)], 'a', opts);
    expect(r).toEqual({ kind: 'balance', moves: [{ toTableId: 'b' }] });
  });

  it('does not move from a source that is not the biggest unless the shortest is below 3', () => {
    expect(plan([t('a', 9, 1), t('b', 7, 2), t('c', 10, 3)], 'a', opts)).toEqual({ kind: 'none' });
    const r = plan([t('a', 9, 1), t('b', 2, 2), t('c', 10, 3)], 'a', opts);
    expect(r.kind).toBe('balance');
  });

  it('breaks the source when the field fits on one fewer table and the source is shortest', () => {
    // 10 tables, 89 players → fits on 9
    const tables = [t('s', 8, 10), ...Array.from({ length: 9 }, (_, i) => t(`x${i}`, 9, i + 1))];
    expect(plan(tables, 's', opts)).toEqual({ kind: 'break', tableId: 's' });
  });

  it('breaks an idle shortest table from another table’s pass (lone survivor)', () => {
    const tables = [t('a', 9, 1), t('b', 9, 2), t('c', 1, 3)];
    expect(plan(tables, 'a', { ...opts, idleIds: new Set(['c']) })).toEqual({ kind: 'break', tableId: 'c' });
    // not idle (dealing) → top it up to 3 instead; then the source (7) is no longer the biggest
    expect(plan(tables, 'a', opts)).toEqual({ kind: 'balance', moves: [{ toTableId: 'c' }, { toTableId: 'c' }] });
  });

  it('leaves the last two-table → one-table merge to the final-table collapse', () => {
    // 2 tables, 10 players: fits on one 10-max table but only consolidation (<= 9) merges
    expect(plan([t('a', 6, 1), t('b', 4, 2)], 'b', opts)).toEqual({ kind: 'none' });
    expect(plan([t('a', 7, 1), t('b', 4, 2)], 'a', opts)).toEqual({ kind: 'balance', moves: [{ toTableId: 'b' }] });
    // at or below the final-table size the planner is a no-op
    expect(plan([t('a', 5, 1), t('b', 4, 2)], 'a', opts)).toEqual({ kind: 'none' });
  });

  it('never moves into a full table and ignores empty tables', () => {
    const r = plan([t('a', 10, 1), t('b', 10, 2), t('e', 0, 3)], 'a', opts);
    expect(r).toEqual({ kind: 'none' });
  });

  it('caps the moves made in one pass', () => {
    const r = plan([t('a', 10, 1), t('b', 1, 2)], 'a', { ...opts, maxMovesPerPass: 2 });
    expect(r).toEqual({ kind: 'balance', moves: [{ toTableId: 'b' }, { toTableId: 'b' }] });
  });
});

describe('MTT live test config', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');

  it('defaults: 100 seats / 10 per table, 70 × 715 = 50,050 pool paid in full to the top 10', () => {
    const cfg = buildMttLiveTestConfig({ startAt: '2026-11-21T15:00:00Z' }, now);
    expect(cfg.name).toBe('The Morbius 100-Player Freeroll');
    expect(cfg.maxPlayers).toBe(100);
    expect(cfg.seatsPerTable).toBe(10);
    expect(cfg.bots).toBe(70);
    expect(cfg.startingStack).toBe(5000);
    expect(cfg.blindMinutes).toBe(5);
    expect(cfg.actionSeconds).toBe(15);
    expect(cfg.lateRegMinutes).toBe(45);
    const pool = cfg.buyIn * BigInt(cfg.bots);
    expect(pool).toBe(50_050n);
    expect(cfg.prizePercentages).toHaveLength(10);
    expect(cfg.prizePercentages.reduce((a, b) => a + b, 0)).toBe(100);
    // integer split with no remainder → the full pool is paid
    const paid = cfg.prizePercentages.map((p) => (pool * BigInt(p)) / 100n);
    expect(paid.reduce((a, b) => a + b, 0n)).toBe(pool);
    expect(paid[0]).toBe(15_015n);
  });

  it('validates input', () => {
    expect(() => buildMttLiveTestConfig({}, now)).toThrow(/startAt is required/);
    expect(() => buildMttLiveTestConfig({ startAt: 'nope' }, now)).toThrow(/valid/);
    expect(() => buildMttLiveTestConfig({ startAt: '2026-11-15T12:01:00Z' }, now)).toThrow(/future/);
    expect(() => buildMttLiveTestConfig({ startAt: '2026-11-21T15:00:00Z', name: 'Beat the Bots 100' }, now)).toThrow(/Beat the Bots/);
    expect(() => buildMttLiveTestConfig({ startAt: '2026-11-21T15:00:00Z', prizePercentages: [50, 50] }, now)).toThrow();
    expect(() => buildMttLiveTestConfig({ startAt: '2026-11-21T15:00:00Z', lateRegMinutes: 500 }, now)).toThrow(/lateRegMinutes/);
    const custom = buildMttLiveTestConfig(
      { startAt: '2026-11-21T15:00:00Z', name: ' Test MTT ', lateRegMinutes: 0, allowDailyOverlap: true },
      now,
    );
    expect(custom.name).toBe('Test MTT');
    expect(custom.lateRegMinutes).toBe(0);
    expect(custom.allowDailyOverlap).toBe(true);
    expect(MTT_LIVE_TEST_DEFAULTS.allowDailyOverlap).toBe(false);
  });

  it('slot key is distinct from the daily "YYYY-MM-DD HH:MM tz" keys', () => {
    expect(mttLiveTestSlotKey(new Date('2026-11-21T15:00:00Z'))).toBe('mtt-live-test 2026-11-21T15:00:00.000Z');
  });
});

describe('dailySlotConflicts (1 / 5 / 9 PM America/New_York)', () => {
  const sched = { times: parseScheduleTimes('13:00,17:00,21:00'), timeZone: 'America/New_York' };
  const et = (d: number, hh: number, mm = 0) => zonedToUtc(2026, 11, d, hh, mm, 'America/New_York');

  it('flags a start too close to a daily game', () => {
    expect(dailySlotConflicts(et(21, 13, 30), sched).map((d) => d.getTime())).toEqual([et(21, 13).getTime()]);
    expect(dailySlotConflicts(et(21, 15), sched).map((d) => d.getTime())).toEqual([et(21, 17).getTime()]);
    expect(dailySlotConflicts(et(21, 20), sched)).toHaveLength(1);
  });

  it('allows the gaps (2:00–2:30 PM, 10 PM–10:30 AM)', () => {
    expect(dailySlotConflicts(et(21, 14), sched)).toEqual([]);
    expect(dailySlotConflicts(et(21, 14, 30), sched)).toEqual([]);
    expect(dailySlotConflicts(et(21, 10), sched)).toEqual([]);
    expect(dailySlotConflicts(et(21, 22), sched)).toEqual([]);
  });
});
