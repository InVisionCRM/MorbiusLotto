/**
 * Poker Post-Hand Recovery Tests
 *
 * Verifies that `recoverStuckPostHandTables()` unsticks any showdown whose
 * deferred post-hand work (eliminations + blind updates + next-hand schedule)
 * was lost — for example because the server crashed during the 15s
 * post-showdown window.
 *
 * Run: cd server && node node_modules/jest/bin/jest.js poker-post-hand-recovery --runInBand
 */

import { Pool } from 'pg';
import { testPool, TEST_PLAYERS, TEST_POKER_BUY_IN_CHIPS, resetTestBalances } from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { PokerTournamentService, PokerTournamentConfig } from '../../services/poker-tournament.service';
import { TournamentService } from '../../services/tournament.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];

let dbService: DatabaseService;
let pfService: ProvablyFairService;
let pokerGameService: PokerGameService;
let tournamentService: TournamentService;
let pokerTournamentService: PokerTournamentService;

const createdTournamentIds: string[] = [];
const createdPokerTableIds: string[] = [];

const SMALL_TOURNAMENT_CONFIG: PokerTournamentConfig = {
  startingStack: 100,
  minPlayers: 2,
  maxPlayers: 2,
  blindSchedule: [
    { level: 1, smallBlind: 10, bigBlind: 20, handsPerLevel: 999 },
  ],
};

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  pfService = new ProvablyFairService();
  pokerGameService = new PokerGameService(dbService, pfService);
  tournamentService = new TournamentService(testPool);
  pokerTournamentService = new PokerTournamentService(testPool, tournamentService, pokerGameService);
  pokerGameService.setPostHandCallback((tableId, handNumber) =>
    pokerTournamentService.syncAfterHand(tableId, handNumber),
  );
});

afterAll(async () => {
  for (const id of createdPokerTableIds) {
    try { await testPool.query('DELETE FROM poker_tables WHERE id = $1', [id]); } catch {}
  }
  for (const id of createdTournamentIds) {
    try { await testPool.query('DELETE FROM tournaments WHERE id = $1', [id]); } catch {}
  }
  await dbService.disconnect?.();
});

beforeEach(async () => {
  await resetTestBalances();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pokerTestScheduledStart(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

async function createTournament(): Promise<string> {
  const { tournamentId } = await pokerTournamentService.createPokerTournament({
    creatorAddress: PLAYER_1,
    name: 'Recovery Test SNG',
    buyInAmount: TEST_POKER_BUY_IN_CHIPS,
    prizeDistributionType: 'winner_takes_all',
    config: SMALL_TOURNAMENT_CONFIG,
    scheduledStartAt: pokerTestScheduledStart(),
  });
  createdTournamentIds.push(tournamentId);
  return tournamentId;
}

async function startTournamentAndGetTableId(tournamentId: string, players: string[]): Promise<string> {
  for (const p of players) {
    await pokerTournamentService.joinPokerTournament(tournamentId, p);
  }
  await pokerTournamentService.startScheduledPokerTournament(tournamentId);
  const r = await testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
  const id = r.rows[0]?.id as string | undefined;
  if (!id) throw new Error('expected tournament table after start');
  createdPokerTableIds.push(id);
  return id;
}

function getActing(state: any): { pos: number; addr: string } {
  const pos = state.currentHand!.actingPosition!;
  return { pos, addr: state.seats[pos].playerAddress! };
}

/**
 * Drives a 2-player table to showdown with both players all-in. Returns the
 * handId of the completed hand. Designed so that ONE player ends with stack=0
 * (busted) regardless of who wins — we manually set unequal stacks first so
 * the all-in always produces an elimination.
 */
async function playAllInToShowdown(tableId: string): Promise<string> {
  const started = await pokerGameService.startHand(tableId);
  if (!started || !started.currentHand) throw new Error('startHand failed');
  const handId = started.currentHand.handId;

  let state = await pokerGameService.getTableState(tableId, null);
  if (state.currentHand?.actingPosition != null) {
    const { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', '100');
  }

  state = await pokerGameService.getTableState(tableId, null);
  if (state.currentHand && state.currentHand.actingPosition != null) {
    const { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'call');
  }

  return handId;
}

/**
 * Simulate the in-memory timers + cache being lost across a server restart,
 * AND make the hand look ≥ 25 seconds old so the 20s recovery threshold
 * accepts it. Also forcibly NULL `post_hand_processed_at` (in case the
 * happy-path timer beat us to it) and roll back any tournament-side state
 * that the happy-path may have already applied.
 *
 * The optional `bustAddress` lets the caller stipulate which player should
 * end the hand at 0 chips. The all-in driver only puts ~85% of starting
 * stacks at risk after rake, so we force the loser to 0 here — the real
 * scenario being tested is "recovery picks up a completed hand whose
 * post-hand work was lost", not the chip math of any specific hand.
 */
async function simulateRestartMidPostHandWindow(
  tableId: string,
  handId: string,
  tournamentId: string,
  bustAddress: string,
): Promise<void> {
  const svc = pokerGameService as unknown as {
    nextHandTimers: Map<string, NodeJS.Timeout>;
    pendingPostHandHandNumbers: Map<string, number>;
  };
  const t = svc.nextHandTimers.get(tableId);
  if (t) clearTimeout(t);
  svc.nextHandTimers.delete(tableId);
  svc.pendingPostHandHandNumbers.delete(tableId);

  await testPool.query(
    `UPDATE poker_hands
        SET completed_at = NOW() - INTERVAL '25 seconds',
            post_hand_processed_at = NULL
      WHERE id = $1`,
    [handId],
  );

  // Force the bust we want recovery to process.
  await testPool.query(
    `UPDATE poker_seats SET stack = 0
      WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
    [tableId, bustAddress],
  );

  // Roll back any eliminations the happy-path timer may have applied while
  // the test was racing it, so the recovery has work to actually do.
  await testPool.query(
    `UPDATE tournament_entries
        SET status = 'playing', finished_at = NULL, final_rank = NULL
      WHERE tournament_id = $1 AND status = 'busted'`,
    [tournamentId],
  );
  await testPool.query(
    `UPDATE poker_tournament_seats
        SET eliminated_at = NULL, final_rank = NULL
      WHERE tournament_id = $1`,
    [tournamentId],
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Poker post-hand recovery', () => {
  it('marker stamping: happy-path timer body sets post_hand_processed_at', async () => {
    const tournamentId = await createTournament();
    const tableId = await startTournamentAndGetTableId(tournamentId, [PLAYER_1, PLAYER_2]);
    const handId = await playAllInToShowdown(tableId);

    // Wait out the 15s SHOWDOWN_DELAY_MS so the happy-path timer fires.
    await new Promise((resolve) => setTimeout(resolve, 17_000));

    const r = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(r.rows[0].post_hand_processed_at).not.toBeNull();
  }, 60_000);

  it('recoverStuckPostHandTables unsticks a hand whose timer was lost mid-window', async () => {
    const tournamentId = await createTournament();
    const tableId = await startTournamentAndGetTableId(tournamentId, [PLAYER_1, PLAYER_2]);
    const handId = await playAllInToShowdown(tableId);

    await simulateRestartMidPostHandWindow(tableId, handId, tournamentId, PLAYER_1);

    const before = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(before.rows[0].post_hand_processed_at).toBeNull();

    await pokerGameService.recoverStuckPostHandTables();

    const after = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(after.rows[0].post_hand_processed_at).not.toBeNull();

    const entries = await testPool.query(
      `SELECT LOWER(player_address) AS addr, status, final_rank, chips_remaining
         FROM tournament_entries
        WHERE tournament_id = $1
        ORDER BY player_address`,
      [tournamentId],
    );
    // Heads-up + a forced bust always lands at exactly one busted entry.
    // The winner may already be 'completed' (the recovery's syncAfterHand
    // also runs the tournament-end check) so we don't constrain status.
    expect(entries.rows.length).toBe(2);
    const busted = entries.rows.filter((r: any) => r.status === 'busted');
    expect(busted.length).toBe(1);
    expect(busted[0].addr).toBe(PLAYER_1.toLowerCase());
    expect(Number(busted[0].chips_remaining)).toBe(0);
    expect(Number(busted[0].final_rank)).toBe(2);
  }, 60_000);

  it('is idempotent: calling recoverStuckPostHandTables a second time is a no-op', async () => {
    const tournamentId = await createTournament();
    const tableId = await startTournamentAndGetTableId(tournamentId, [PLAYER_1, PLAYER_2]);
    const handId = await playAllInToShowdown(tableId);

    await simulateRestartMidPostHandWindow(tableId, handId, tournamentId, PLAYER_1);
    await pokerGameService.recoverStuckPostHandTables();

    const firstRunMarker = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    const firstRunStamp = firstRunMarker.rows[0].post_hand_processed_at;
    expect(firstRunStamp).not.toBeNull();

    const firstRunBusted = await testPool.query(
      `SELECT COUNT(*)::int AS n FROM tournament_entries
        WHERE tournament_id = $1 AND status = 'busted'`,
      [tournamentId],
    );
    expect(firstRunBusted.rows[0].n).toBe(1);

    // Second sweep — the hand's marker is set, so the row is filtered out
    // by the WHERE clause and nothing should mutate.
    await pokerGameService.recoverStuckPostHandTables();

    const secondRunMarker = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(secondRunMarker.rows[0].post_hand_processed_at).toEqual(firstRunStamp);

    const secondRunBusted = await testPool.query(
      `SELECT COUNT(*)::int AS n FROM tournament_entries
        WHERE tournament_id = $1 AND status = 'busted'`,
      [tournamentId],
    );
    expect(secondRunBusted.rows[0].n).toBe(1);
  }, 60_000);

  it('skips hands whose completed_at is too recent (within the 20s threshold)', async () => {
    const tournamentId = await createTournament();
    const tableId = await startTournamentAndGetTableId(tournamentId, [PLAYER_1, PLAYER_2]);
    const handId = await playAllInToShowdown(tableId);

    // Cancel the happy-path timer + null the marker, but leave completed_at
    // fresh. The sweep MUST NOT touch this row — the threshold protects the
    // happy path.
    const svc = pokerGameService as unknown as {
      nextHandTimers: Map<string, NodeJS.Timeout>;
      pendingPostHandHandNumbers: Map<string, number>;
    };
    const t = svc.nextHandTimers.get(tableId);
    if (t) clearTimeout(t);
    svc.nextHandTimers.delete(tableId);
    svc.pendingPostHandHandNumbers.delete(tableId);
    await testPool.query(
      `UPDATE poker_hands
          SET completed_at = NOW(),
              post_hand_processed_at = NULL
        WHERE id = $1`,
      [handId],
    );

    await pokerGameService.recoverStuckPostHandTables();

    const r = await testPool.query(
      `SELECT post_hand_processed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(r.rows[0].post_hand_processed_at).toBeNull();
  }, 60_000);
});
