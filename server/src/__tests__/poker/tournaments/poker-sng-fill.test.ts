/**
 * Fill-based Sit & Go ("startMode: fill") + unregister-with-refund tests.
 *
 * Covers the behavior added alongside the original scheduled tournaments:
 *  - creating a fill-mode tournament (no scheduledStartAt)
 *  - the table filling -> a 60s countdown + poker_start event (no instant deal)
 *  - unregistering with a MORBIUS-chip refund
 *  - unregister being blocked once a Sit & Go has filled and locked in
 *
 * Like the sibling poker-tournament.test.ts, this runs against a real database.
 * Run: cd server && npm test
 * Requires: server/.env with DATABASE_URL
 */

import {
  testPool,
  TEST_PLAYERS,
  TEST_POKER_BUY_IN_CHIPS,
  resetTestBalances,
  getTestChipBalance,
} from '../../setup';
import {
  PokerTournamentService,
  PokerTournamentConfig,
} from '../../../services/poker-tournament.service';
import { TournamentService } from '../../../services/tournament.service';
import { PokerGameService } from '../../../services/poker-game.service';
import { DatabaseService } from '../../../services/database.service';
import { ProvablyFairService } from '../../../services/provably-fair.service';

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];
const PLAYER_3 = TEST_PLAYERS[2];

// 3-seat table so it fills after 3 joins.
const FILL_CONFIG: PokerTournamentConfig = {
  startingStack: 5000,
  minPlayers:    2,
  maxPlayers:    3,
  blindSchedule: [
    { level: 1, smallBlind: 25,  bigBlind: 50,  handsPerLevel: 10 },
    { level: 2, smallBlind: 50,  bigBlind: 100, handsPerLevel: 999 },
  ],
  startMode: 'fill',
};

let dbService: DatabaseService;
let pfService: ProvablyFairService;
let pokerGameService: PokerGameService;
let tournamentService: TournamentService;
let pokerTournamentService: PokerTournamentService;

const createdTournamentIds: string[] = [];

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  pfService = new ProvablyFairService();
  pokerGameService = new PokerGameService(dbService, pfService);
  tournamentService = new TournamentService(testPool);
  pokerTournamentService = new PokerTournamentService(testPool, tournamentService, pokerGameService);
});

afterAll(async () => {
  for (const id of createdTournamentIds) {
    try {
      await testPool.query('DELETE FROM poker_tables WHERE tournament_id = $1', [id]);
      await testPool.query('DELETE FROM tournaments WHERE id = $1', [id]);
    } catch {
      /* best-effort cleanup */
    }
  }
  await dbService.disconnect?.();
});

beforeEach(async () => {
  await resetTestBalances();
});

/** Create a fill-mode Sit & Go and track it for cleanup. */
async function createFillTournament(
  overrides?: Partial<PokerTournamentConfig>,
): Promise<string> {
  const { tournamentId } = await pokerTournamentService.createPokerTournament({
    creatorAddress:        PLAYER_1,
    name:                  'Test Sit & Go',
    buyInAmount:           TEST_POKER_BUY_IN_CHIPS,
    prizeDistributionType: 'winner_takes_all',
    config:                { ...FILL_CONFIG, ...(overrides ?? {}) },
    // No scheduledStartAt — a Sit & Go has no clock.
  });
  createdTournamentIds.push(tournamentId);
  return tournamentId;
}

// ---------------------------------------------------------------------------

describe('SNG fill mode - create', () => {
  it('creates a fill-mode tournament with no scheduled start', async () => {
    const tournamentId = await createFillTournament();
    const row = await testPool.query(
      'SELECT status, scheduled_start_at, poker_config, min_players, max_players FROM tournaments WHERE id = $1',
      [tournamentId],
    );
    expect(row.rows).toHaveLength(1);
    const t = row.rows[0];
    expect(t.status).toBe('registration');
    expect(t.scheduled_start_at).toBeNull();
    expect(t.poker_config.startMode).toBe('fill');
    // A Sit & Go has a fixed seat count: minPlayers is forced equal to maxPlayers.
    expect(Number(t.min_players)).toBe(Number(t.max_players));
    expect(Number(t.max_players)).toBe(3);
  });

  it('creates NO poker_start event for a fill-mode tournament', async () => {
    const tournamentId = await createFillTournament();
    const events = await testPool.query(
      `SELECT 1 FROM tournament_scheduled_events
        WHERE tournament_id = $1 AND event_type = 'poker_start'`,
      [tournamentId],
    );
    expect(events.rows).toHaveLength(0);
  });
});

describe('SNG fill mode - the fill trigger', () => {
  it('does NOT start a countdown while the table is below capacity', async () => {
    const tournamentId = await createFillTournament();
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);

    const row = await testPool.query(
      'SELECT status, scheduled_start_at FROM tournaments WHERE id = $1',
      [tournamentId],
    );
    expect(row.rows[0].status).toBe('registration');
    expect(row.rows[0].scheduled_start_at).toBeNull();

    const events = await testPool.query(
      `SELECT 1 FROM tournament_scheduled_events
        WHERE tournament_id = $1 AND event_type = 'poker_start'`,
      [tournamentId],
    );
    expect(events.rows).toHaveLength(0);
  });

  it('filling the last seat locks in a ~60s countdown + poker_start event', async () => {
    const tournamentId = await createFillTournament();
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_3);

    const row = await testPool.query(
      'SELECT status, scheduled_start_at FROM tournaments WHERE id = $1',
      [tournamentId],
    );
    // Still 'registration' — activation happens later via the scheduler, not inline.
    expect(row.rows[0].status).toBe('registration');
    const startAt = row.rows[0].scheduled_start_at
      ? new Date(row.rows[0].scheduled_start_at).getTime()
      : null;
    expect(startAt).not.toBeNull();
    expect(startAt!).toBeGreaterThan(Date.now());
    expect(startAt!).toBeLessThan(Date.now() + 90_000);

    const events = await testPool.query(
      `SELECT status FROM tournament_scheduled_events
        WHERE tournament_id = $1 AND event_type = 'poker_start'`,
      [tournamentId],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].status).toBe('pending');

    // No table dealt yet — the countdown has not elapsed.
    const tables = await testPool.query(
      'SELECT id FROM poker_tables WHERE tournament_id = $1',
      [tournamentId],
    );
    expect(tables.rows).toHaveLength(0);
  });
});

describe('SNG unregister + chip refund', () => {
  it('refunds the MORBIUS-chip buy-in when a player unregisters before the table fills', async () => {
    const tournamentId = await createFillTournament();

    const balanceBefore = await getTestChipBalance(PLAYER_2);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    const balanceJoined = await getTestChipBalance(PLAYER_2);
    expect(balanceBefore - balanceJoined).toBe(TEST_POKER_BUY_IN_CHIPS);

    await pokerTournamentService.leavePokerTournamentRegistration(tournamentId, PLAYER_2);
    const balanceLeft = await getTestChipBalance(PLAYER_2);
    expect(balanceLeft).toBe(balanceBefore);

    // The entry is no longer an active registration.
    const active = await testPool.query(
      `SELECT 1 FROM tournament_entries
        WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
          AND status NOT IN ('busted', 'completed')`,
      [tournamentId, PLAYER_2],
    );
    expect(active.rows).toHaveLength(0);
  });

  it('blocks unregistering once a Sit & Go has filled and locked in', async () => {
    const tournamentId = await createFillTournament();
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
    await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_3);

    await expect(
      pokerTournamentService.leavePokerTournamentRegistration(tournamentId, PLAYER_1),
    ).rejects.toThrow(/starting/i);
  });
});
