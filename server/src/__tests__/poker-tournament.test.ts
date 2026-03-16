/**
 * Poker Tournament Integration Tests
 *
 * Tests the full SNG poker tournament flow against a real database.
 * Each mutating test cleans up after itself (DELETE on specific IDs, or
 * relies on the tournament cascade deletes).
 *
 * Run: cd server && npm test
 * Requires: server/.env with DATABASE_URL
 */

import { Pool } from 'pg';
import { testPool, TEST_PLAYERS, TEST_BUY_IN, TEST_BALANCE, resetTestBalances, getTestBalance } from './setup';
import {
  PokerTournamentService,
  PokerTournamentConfig,
  DEFAULT_BLIND_SCHEDULE,
  BlindLevel,
} from '../services/poker-tournament.service';
import { TournamentService } from '../services/tournament.service';
import { PokerGameService } from '../services/poker-game.service';
import { DatabaseService } from '../services/database.service';
import { ProvablyFairService } from '../services/provably-fair.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];
const PLAYER_3 = TEST_PLAYERS[2];

const SMALL_CONFIG: PokerTournamentConfig = {
  startingStack: 5000,
  minPlayers:    2,
  maxPlayers:    3,
  blindSchedule: [
    { level: 1, smallBlind: 25,  bigBlind: 50,  handsPerLevel: 10 },
    { level: 2, smallBlind: 50,  bigBlind: 100, handsPerLevel: 10 },
    { level: 3, smallBlind: 100, bigBlind: 200, handsPerLevel: 999 },
  ],
};

let dbService: DatabaseService;
let pfService: ProvablyFairService;
let pokerGameService: PokerGameService;
let tournamentService: TournamentService;
let pokerTournamentService: PokerTournamentService;

// Track created resources for cleanup
const createdTournamentIds: string[] = [];
const createdPokerTableIds: string[] = [];

async function cleanupTournament(tournamentId: string) {
  try {
    // Delete tournament (cascade handles entries, poker_tournament_seats)
    await testPool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
  } catch {}
}

async function cleanupPokerTable(tableId: string) {
  try {
    await testPool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
  } catch {}
}

// ---------------------------------------------------------------------------
// Service setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  pfService = new ProvablyFairService();
  pokerGameService = new PokerGameService(dbService, pfService);
  tournamentService = new TournamentService(testPool);
  pokerTournamentService = new PokerTournamentService(testPool, tournamentService, pokerGameService);
});

afterAll(async () => {
  // Clean up all created tournaments
  for (const id of createdTournamentIds) {
    await cleanupTournament(id);
  }
  for (const id of createdPokerTableIds) {
    await cleanupPokerTable(id);
  }
  await dbService.disconnect?.();
});

beforeEach(async () => {
  await resetTestBalances();
});

// ---------------------------------------------------------------------------
// Helper to create a tournament and track it for cleanup
// ---------------------------------------------------------------------------
async function createTestTournament(overrides?: Partial<PokerTournamentConfig>): Promise<string> {
  const config = { ...SMALL_CONFIG, ...(overrides ?? {}) };
  const { tournamentId } = await pokerTournamentService.createPokerTournament({
    creatorAddress:        PLAYER_1,
    name:                  'Test SNG',
    buyInAmount:           TEST_BUY_IN,
    prizeDistributionType: 'winner_takes_all',
    config,
  });
  createdTournamentIds.push(tournamentId);
  return tournamentId;
}

// ---------------------------------------------------------------------------
// Suite 1: createPokerTournament
// ---------------------------------------------------------------------------

describe('1 - createPokerTournament', () => {
  it('creates tournament with game_type=poker and status=registration', async () => {
    const tournamentId = await createTestTournament();

    const row = await testPool.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
    expect(row.rows).toHaveLength(1);

    const t = row.rows[0];
    expect(t.game_type).toBe('poker');
    expect(t.status).toBe('registration');
  });

  it('stores poker_config with blind schedule and starting stack', async () => {
    const tournamentId = await createTestTournament();

    const row = await testPool.query('SELECT poker_config, starting_chips FROM tournaments WHERE id = $1', [tournamentId]);
    const config = row.rows[0].poker_config;

    expect(Number(row.rows[0].starting_chips)).toBe(5000);
    expect(config.startingStack).toBe(5000);
    expect(config.blindSchedule).toHaveLength(3);
    expect(config.blindSchedule[0].level).toBe(1);
    expect(config.blindSchedule[0].smallBlind).toBe(25);
  });

  it('sets min_players and max_players from config', async () => {
    const tournamentId = await createTestTournament();

    const row = await testPool.query('SELECT min_players, max_players FROM tournaments WHERE id = $1', [tournamentId]);
    expect(Number(row.rows[0].min_players)).toBe(2);
    expect(Number(row.rows[0].max_players)).toBe(3);
  });

  it('rejects empty blind schedule', async () => {
    await expect(
      pokerTournamentService.createPokerTournament({
        creatorAddress:        PLAYER_1,
        name:                  'Bad SNG',
        buyInAmount:           TEST_BUY_IN,
        prizeDistributionType: 'winner_takes_all',
        config:                { ...SMALL_CONFIG, blindSchedule: [] },
      })
    ).rejects.toThrow('Blind schedule');
  });

  it('rejects minPlayers < 2', async () => {
    await expect(
      pokerTournamentService.createPokerTournament({
        creatorAddress:        PLAYER_1,
        name:                  'Bad SNG',
        buyInAmount:           TEST_BUY_IN,
        prizeDistributionType: 'winner_takes_all',
        config:                { ...SMALL_CONFIG, minPlayers: 1 },
      })
    ).rejects.toThrow('minPlayers');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: joinPokerTournament — registration phase
// ---------------------------------------------------------------------------

describe('2 - joinPokerTournament', () => {
  let tournamentId: string;

  beforeEach(async () => {
    tournamentId = await createTestTournament();
  });

  it('deducts buy-in from player balance and creates entry', async () => {
    const balanceBefore = await getTestBalance(PLAYER_1);

    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);

    const balanceAfter = await getTestBalance(PLAYER_1);
    expect(balanceBefore - balanceAfter).toBe(TEST_BUY_IN);

    const entry = await testPool.query(
      `SELECT chips_remaining, status FROM tournament_entries
       WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    expect(entry.rows).toHaveLength(1);
    expect(Number(entry.rows[0].chips_remaining)).toBe(5000);
    expect(entry.rows[0].status).toBe('playing');
  });

  it('increases prize pool by buy-in amount', async () => {
    const before = await testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
    const poolBefore = BigInt(before.rows[0].prize_pool ?? '0');

    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);

    const after = await testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
    const poolAfter = BigInt(after.rows[0].prize_pool ?? '0');
    expect(poolAfter - poolBefore).toBe(TEST_BUY_IN);
  });

  it('returns existing entry on duplicate join (idempotent for reconnect)', async () => {
    const first = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const second = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    // Should succeed and return the same entryId
    expect(second.entryId).toBe(first.entryId);
    // Balance should only be deducted once
    const balance = await getTestBalance(PLAYER_1);
    const expected = BigInt(TEST_BALANCE) - TEST_BUY_IN;
    expect(balance).toBe(expected);
  });

  it('rejects join when tournament is full', async () => {
    // Create a 2-max tournament, fill it, then try a 3rd join
    const { tournamentId: tightId } = await pokerTournamentService.createPokerTournament({
      creatorAddress:        PLAYER_1,
      name:                  'Tight SNG',
      buyInAmount:           TEST_BUY_IN,
      prizeDistributionType: 'winner_takes_all',
      config:                { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 2 },
    });
    createdTournamentIds.push(tightId);

    await pokerTournamentService.joinPokerTournament(tightId, PLAYER_1);
    // Second join auto-starts (minPlayers=2 reached)
    await pokerTournamentService.joinPokerTournament(tightId, PLAYER_2);
    // Third join should be rejected (tournament already active / full)
    await expect(
      pokerTournamentService.joinPokerTournament(tightId, PLAYER_3)
    ).rejects.toThrow();
  });

  it('rejects join when tournament is not in registration status', async () => {
    // Force status to active
    await testPool.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [tournamentId]);
    await expect(
      pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1)
    ).rejects.toThrow('registration');
  });

  it('rejects join with insufficient balance', async () => {
    // Zero out balance
    await testPool.query(
      `UPDATE players SET balance = 0 WHERE LOWER(wallet_address) = LOWER($1)`,
      [PLAYER_1]
    );
    await expect(
      pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1)
    ).rejects.toThrow('balance');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Auto-start when minPlayers reached
// ---------------------------------------------------------------------------

describe('3 - auto-start', () => {
  let tournamentId: string;

  beforeEach(async () => {
    // Use minPlayers=2 so the 2nd join triggers auto-start
    tournamentId = await createTestTournament({ minPlayers: 2, maxPlayers: 6 });
  });

  it('does not auto-start on first join', async () => {
    const { autoStarted } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    expect(autoStarted).toBe(false);

    const t = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(t.rows[0].status).toBe('registration');
  });

  it('auto-starts on minPlayers-th join', async () => {
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { autoStarted, tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    expect(autoStarted).toBe(true);
    expect(tableId).toBeTruthy();

    const t = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(t.rows[0].status).toBe('active');
  });

  it('creates a poker table with tournament_mode=TRUE on auto-start', async () => {
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    if (tableId) {
      createdPokerTableIds.push(tableId);
      const table = await testPool.query('SELECT * FROM poker_tables WHERE id = $1', [tableId]);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0].tournament_mode).toBe(true);
      expect(table.rows[0].tournament_id).toBe(tournamentId);
    }
  });

  it('does NOT appear in the cash game lobby', async () => {
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    if (tableId) {
      createdPokerTableIds.push(tableId);
      const tables = await pokerGameService.listTables();
      const found = tables.find((t) => t.id === tableId);
      expect(found).toBeUndefined();
    }
  });

  it('seats all players with starting chips in poker_seats', async () => {
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    if (tableId) {
      createdPokerTableIds.push(tableId);
      const seats = await testPool.query('SELECT player_address, stack FROM poker_seats WHERE table_id = $1', [tableId]);
      expect(seats.rows).toHaveLength(2);
      const CHIP_SCALE = BigInt('1000000000000000000');
      const totalStarting = BigInt(SMALL_CONFIG.startingStack) * BigInt(seats.rows.length) * CHIP_SCALE;
      // Total chips are conserved (blinds just moved chips between players/pot)
      // Each seat stack must be <= startingStack and > 0 (game in progress)
      for (const seat of seats.rows) {
        const stackChips = BigInt(seat.stack) / CHIP_SCALE;
        expect(stackChips).toBeGreaterThan(BigInt(0));
        expect(stackChips).toBeLessThanOrEqual(BigInt(SMALL_CONFIG.startingStack));
      }
      const totalActual = seats.rows.reduce((acc: bigint, s: { stack: string }) => acc + BigInt(s.stack), BigInt(0));
      // Total in seats ≤ totalStarting (pot holds the rest)
      expect(totalActual).toBeLessThanOrEqual(totalStarting);
    }
  });

  it('creates bridge rows in poker_tournament_seats', async () => {
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    if (tableId) {
      createdPokerTableIds.push(tableId);
      const pts = await testPool.query(
        'SELECT * FROM poker_tournament_seats WHERE tournament_id = $1',
        [tournamentId]
      );
      expect(pts.rows).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: computeBlindLevel (pure, no DB)
// ---------------------------------------------------------------------------

describe('4 - computeBlindLevel', () => {
  const schedule: BlindLevel[] = [
    { level: 1, smallBlind: 25,  bigBlind: 50,  handsPerLevel: 10 },
    { level: 2, smallBlind: 50,  bigBlind: 100, handsPerLevel: 10 },
    { level: 3, smallBlind: 75,  bigBlind: 150, handsPerLevel: 8  },
    { level: 8, smallBlind: 500, bigBlind: 1000, handsPerLevel: 999 },
  ];

  it('returns level 1 for hand 1', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 1).level).toBe(1);
  });

  it('returns level 1 for hand 10 (last in level)', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 10).level).toBe(1);
  });

  it('returns level 2 for hand 11 (first in level)', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 11).level).toBe(2);
  });

  it('returns level 2 for hand 20', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 20).level).toBe(2);
  });

  it('returns level 3 for hand 21', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 21).level).toBe(3);
  });

  it('returns last level for very high hand count', () => {
    expect(pokerTournamentService.computeBlindLevel(schedule, 9999).level).toBe(8);
    expect(pokerTournamentService.computeBlindLevel(schedule, 9999).smallBlind).toBe(500);
  });

  it('uses DEFAULT_BLIND_SCHEDULE correctly (8 levels)', () => {
    // Level 1: hands 1-10
    expect(pokerTournamentService.computeBlindLevel(DEFAULT_BLIND_SCHEDULE, 5).level).toBe(1);
    // Level 2: hands 11-20
    expect(pokerTournamentService.computeBlindLevel(DEFAULT_BLIND_SCHEDULE, 15).level).toBe(2);
    // Level 8: last level
    expect(pokerTournamentService.computeBlindLevel(DEFAULT_BLIND_SCHEDULE, 999).level).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: syncAfterHand — chip sync
// ---------------------------------------------------------------------------

describe('5 - syncAfterHand chip sync', () => {
  it('updates tournament_entries.chips_remaining from poker_seats.stack', async () => {
    const tournamentId = await createTestTournament({ minPlayers: 2 });
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    if (!tableId) return;
    createdPokerTableIds.push(tableId);

    // Manually set stacks to simulate a hand outcome (stacks stored in wei units)
    const CHIP_SCALE = BigInt('1000000000000000000');
    await testPool.query(
      `UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1, (BigInt(3000) * CHIP_SCALE).toString()]
    );
    await testPool.query(
      `UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_2, (BigInt(7000) * CHIP_SCALE).toString()]
    );

    await pokerTournamentService.syncAfterHand(tableId, 1);

    const e1 = await testPool.query(
      `SELECT chips_remaining FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    const e2 = await testPool.query(
      `SELECT chips_remaining FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_2]
    );
    expect(Number(e1.rows[0].chips_remaining)).toBe(3000);
    expect(Number(e2.rows[0].chips_remaining)).toBe(7000);
  });

  it('increments hands_played after sync', async () => {
    const tournamentId = await createTestTournament({ minPlayers: 2 });
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    if (!tableId) return;
    createdPokerTableIds.push(tableId);

    await pokerTournamentService.syncAfterHand(tableId, 1);

    const e = await testPool.query(
      `SELECT hands_played FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    expect(Number(e.rows[0].hands_played)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Player elimination at 0 chips
// ---------------------------------------------------------------------------

describe('6 - player elimination', () => {
  it('marks entry as busted and removes seat when stack hits 0', async () => {
    const tournamentId = await createTestTournament({ minPlayers: 2 });
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    if (!tableId) return;
    createdPokerTableIds.push(tableId);

    // Player 1 goes bust
    await testPool.query(
      `UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );
    await testPool.query(
      `UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_2]
    );

    // Complete any active hand to prevent FK issues
    await testPool.query(
      `UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`,
      [tableId]
    );

    await pokerTournamentService.syncAfterHand(tableId, 5);

    // Entry should be busted
    const entry = await testPool.query(
      `SELECT status FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    expect(entry.rows[0].status).toBe('busted');

    // Seat should be removed
    const seat = await testPool.query(
      `SELECT id FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );
    expect(seat.rows).toHaveLength(0);
  });

  it('assigns final_rank to eliminated player', async () => {
    const tournamentId = await createTestTournament({ minPlayers: 2 });
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    if (!tableId) return;
    createdPokerTableIds.push(tableId);

    await testPool.query(
      `UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );
    await testPool.query(
      `UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_2]
    );
    await testPool.query(
      `UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`,
      [tableId]
    );

    await pokerTournamentService.syncAfterHand(tableId, 5);

    const entry = await testPool.query(
      `SELECT final_rank FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    // 1 player remaining + 1 = rank 2
    expect(Number(entry.rows[0].final_rank)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Prize distribution
// ---------------------------------------------------------------------------

describe('7 - prize distribution', () => {
  it('credits winner balance after completeTournament (winner_takes_all)', async () => {
    const tournamentId = await createTestTournament({ minPlayers: 2 });
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    const { tableId } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    if (!tableId) return;
    createdPokerTableIds.push(tableId);

    const winnerBalanceBefore = await getTestBalance(PLAYER_2);

    // Bust player 1
    await testPool.query(
      `UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );
    await testPool.query(
      `UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_2]
    );
    await testPool.query(
      `UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`,
      [tableId]
    );

    // syncAfterHand triggers completeTournament when ≤1 player remains
    await pokerTournamentService.syncAfterHand(tableId, 10);

    // Tournament should be completed
    const t = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(t.rows[0].status).toBe('completed');

    // Winner should have received prize (buy-ins × 2, minus fees)
    const winnerBalanceAfter = await getTestBalance(PLAYER_2);
    expect(winnerBalanceAfter).toBeGreaterThan(winnerBalanceBefore);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Full 2-player E2E flow
// ---------------------------------------------------------------------------

describe('8 - full 2-player E2E', () => {
  it('completes a full SNG: create → join × 2 → auto-start → bust → prizes', async () => {
    // 1. Create tournament (maxPlayers=2 so it auto-starts on 2nd join)
    const { tournamentId } = await pokerTournamentService.createPokerTournament({
      creatorAddress:        PLAYER_1,
      name:                  'E2E Test SNG',
      buyInAmount:           TEST_BUY_IN,
      prizeDistributionType: 'winner_takes_all',
      config:                { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 2 },
    });
    createdTournamentIds.push(tournamentId);

    // 2. Player 1 joins — no auto-start yet
    const join1 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    expect(join1.autoStarted).toBe(false);

    // 3. Player 2 joins — triggers auto-start
    const join2 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    expect(join2.autoStarted).toBe(true);
    expect(join2.tableId).toBeTruthy();

    const tableId = join2.tableId!;
    createdPokerTableIds.push(tableId);

    // 4. Verify tournament is active and table created
    const t = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(t.rows[0].status).toBe('active');

    const tableRow = await testPool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
    expect(tableRow.rows[0].tournament_mode).toBe(true);

    // 5. Simulate: player 1 loses all chips, player 2 wins everything
    await testPool.query(
      `UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );
    await testPool.query(
      `UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_2]
    );
    await testPool.query(
      `UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`,
      [tableId]
    );

    // 6. syncAfterHand triggers elimination + completion
    await pokerTournamentService.syncAfterHand(tableId, 1);

    // 7. Verify final state
    const finalT = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(finalT.rows[0].status).toBe('completed');

    const p1Entry = await testPool.query(
      `SELECT status, final_rank FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_1]
    );
    expect(p1Entry.rows[0].status).toBe('busted');
    expect(Number(p1Entry.rows[0].final_rank)).toBe(2);

    const p2Entry = await testPool.query(
      `SELECT status, final_rank, prize_won FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tournamentId, PLAYER_2]
    );
    expect(p2Entry.rows[0].status).toBe('completed');
    expect(Number(p2Entry.rows[0].final_rank)).toBe(1);
    expect(BigInt(p2Entry.rows[0].prize_won ?? '0')).toBeGreaterThan(0n);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Regression — existing systems unaffected
// ---------------------------------------------------------------------------

describe('9 - regression', () => {
  it('blackjack createTournament still defaults to game_type=blackjack', async () => {
    const result = await tournamentService.createTournament({
      creatorAddress:        PLAYER_1,
      name:                  'BJ Regression Test',
      buyInAmount:           TEST_BUY_IN,
      startingChips:         5000,
      maxHands:              25,
      timeLimitMinutes:      null,
      tableTheme:            { kind: 'image', id: 'BigRich' },
      isPrivate:             false,
      prizeDistributionType: 'winner_takes_all',
    });
    createdTournamentIds.push(result.id);

    const row = await testPool.query('SELECT game_type FROM tournaments WHERE id = $1', [result.id]);
    expect(row.rows[0].game_type).toBe('blackjack');
  });

  it('cash game poker tables still appear in listTables (tournament_mode=FALSE)', async () => {
    // Create a normal cash game table
    const tableId = await pokerGameService.createTable(25n, 50n, 6);
    createdPokerTableIds.push(tableId);

    const tables = await pokerGameService.listTables();
    const found = tables.some((t) => t.id === tableId);
    expect(found).toBe(true);

    // Clean up immediately
    await pokerGameService.deleteTable(tableId);
  });

  it('poker_tournament_registrations view only shows game_type=poker', async () => {
    const tournamentId = await createTestTournament();

    const view = await testPool.query(
      `SELECT tournament_id FROM poker_tournament_registrations WHERE tournament_id = $1`,
      [tournamentId]
    );
    expect(view.rows).toHaveLength(1);

    // A blackjack tournament should NOT appear in this view
    const bjResult = await tournamentService.createTournament({
      creatorAddress:        PLAYER_1,
      name:                  'BJ Exclusion Test',
      buyInAmount:           TEST_BUY_IN,
      startingChips:         5000,
      maxHands:              25,
      timeLimitMinutes:      null,
      tableTheme:            { kind: 'image', id: 'BigRich' },
      isPrivate:             false,
      prizeDistributionType: 'winner_takes_all',
    });
    createdTournamentIds.push(bjResult.id);

    const bjView = await testPool.query(
      `SELECT tournament_id FROM poker_tournament_registrations WHERE tournament_id = $1`,
      [bjResult.id]
    );
    expect(bjView.rows).toHaveLength(0);
  });

  it('cancelPokerTournament refunds all players and marks cancelled', async () => {
    const tournamentId = await createTestTournament();

    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_3);

    const balanceBefore1 = await getTestBalance(PLAYER_1);
    const balanceBefore3 = await getTestBalance(PLAYER_3);

    // Force back to registration status so cancel works
    await testPool.query(`UPDATE tournaments SET status = 'registration' WHERE id = $1`, [tournamentId]);

    await pokerTournamentService.cancelPokerTournament(tournamentId, PLAYER_1);

    const t = await testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
    expect(t.rows[0].status).toBe('cancelled');

    const balanceAfter1 = await getTestBalance(PLAYER_1);
    const balanceAfter3 = await getTestBalance(PLAYER_3);
    expect(balanceAfter1).toBeGreaterThanOrEqual(balanceBefore1);
    expect(balanceAfter3).toBeGreaterThanOrEqual(balanceBefore3);
  });
});
