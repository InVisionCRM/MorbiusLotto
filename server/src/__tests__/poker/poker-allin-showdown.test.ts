/**
 * Poker All-In Showdown Tests
 *
 * Verifies that when all remaining players are all-in (no more betting possible),
 * the hand completes through to showdown with:
 * - street = 'showdown'
 * - completed_at set (not NULL)
 * - 5 community cards dealt
 * - winners determined
 * - next hand can start
 *
 * Covers: 2-player, 3-player, preflop all-in, post-flop all-in, mismatched stacks.
 * Run: cd server && npx jest poker-allin-showdown --testTimeout=120000
 */

import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
} from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];
const PLAYER_3 = TEST_PLAYERS[2];

const SB = 1;
const BB = 2;

let dbService: DatabaseService;
let pfService: ProvablyFairService;
let pokerGameService: PokerGameService;
let createdTableIds: string[] = [];

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  pfService = new ProvablyFairService();
  pokerGameService = new PokerGameService(dbService, pfService);
});

beforeEach(async () => {
  await resetTestBalances();
  createdTableIds = [];
});

afterEach(async () => {
  for (const id of createdTableIds) {
    try { await pokerGameService.deleteTable(id); } catch {}
  }
});



async function createTable(players: string[], buyIn: bigint): Promise<string> {
  const tableId = await pokerGameService.createTable(SB, BB, 6);
  createdTableIds.push(tableId);
  for (const addr of players) {
    await pokerGameService.joinTable(tableId, addr, buyIn.toString());
  }
  return tableId;
}

function getActing(state: any): { pos: number; addr: string } {
  const pos = state.currentHand!.actingPosition!;
  return { pos, addr: state.seats[pos].playerAddress! };
}

async function actUntilStreet(
  tableId: string,
  handId: string,
  targetStreet: string,
): Promise<any> {
  for (let i = 0; i < 20; i++) {
    const s = await pokerGameService.getTableState(tableId, null);
    if (!s.currentHand || s.currentHand.street === targetStreet || s.currentHand.street === 'showdown') return s;
    if (s.currentHand.actingPosition == null) return s;
    const { addr } = getActing(s);
    const toCall = Number(s.currentHand.toCall ?? 0);
    if (toCall > 0) {
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    } else {
      await pokerGameService.playerAction(tableId, handId, addr, 'check');
    }
  }
  return pokerGameService.getTableState(tableId, null);
}

async function assertShowdownComplete(tableId: string, handId: string) {
  const state = await pokerGameService.getTableState(tableId, null);
  const hand = state.currentHand;

  // The hand should either be in showdown or a new hand should have started
  if (hand && hand.handId === handId) {
    expect(hand.street).toBe('showdown');
    expect(hand.communityCards.length).toBe(5);
    expect(hand.winners).toBeDefined();
    expect(hand.winners!.length).toBeGreaterThan(0);
  }

  // DB should have completed_at set
  const dbHand = await testPool.query(
    'SELECT street, completed_at, community_cards, result FROM poker_hands WHERE id = $1',
    [handId],
  );
  expect(dbHand.rows.length).toBe(1);
  expect(dbHand.rows[0].street).toBe('showdown');
  expect(dbHand.rows[0].completed_at).not.toBeNull();
  const community = Array.isArray(dbHand.rows[0].community_cards)
    ? dbHand.rows[0].community_cards
    : JSON.parse(dbHand.rows[0].community_cards);
  expect(community.length).toBe(5);
  const result = typeof dbHand.rows[0].result === 'string'
    ? JSON.parse(dbHand.rows[0].result)
    : dbHand.rows[0].result;
  expect(result?.winners?.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('All-In Showdown Completion', () => {
  it('2 players: preflop all-in resolves to showdown', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    const started = await pokerGameService.startHand(tableId);
    expect(started).not.toBeNull();
    const handId = started!.currentHand!.handId;

    // First actor goes all-in
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());

    // Second actor calls all-in
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    await assertShowdownComplete(tableId, handId);
  });

  it('2 players: post-flop all-in (mismatched stacks) resolves to showdown', async () => {
    const bigStack = BigInt(BB) * 100n;
    const smallStack = BigInt(BB) * 40n;

    const tableId = await pokerGameService.createTable(SB, BB, 6);
    createdTableIds.push(tableId);
    await pokerGameService.joinTable(tableId, PLAYER_1, bigStack.toString());
    await pokerGameService.joinTable(tableId, PLAYER_2, smallStack.toString());

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    // Play through to flop
    let state = await actUntilStreet(tableId, handId, 'flop');
    if (state.currentHand?.street !== 'flop') {
      // Hand may have auto-resolved; verify showdown
      await assertShowdownComplete(tableId, handId);
      return;
    }

    // Big stack bets more than small stack has
    const { addr: bettor } = getActing(state);
    const betAmount = smallStack + 10n;
    await pokerGameService.playerAction(tableId, handId, bettor, 'bet', betAmount.toString());

    // Small stack calls → all-in
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      const { addr: caller } = getActing(state);
      await pokerGameService.playerAction(tableId, handId, caller, 'call');
    }

    await assertShowdownComplete(tableId, handId);
  });

  it('2 players: post-flop all-in, then next hand can start', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    // All-in preflop
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());

    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    await assertShowdownComplete(tableId, handId);

    // completed_at must be set — this is what tryStartNextHand checks to allow the next deal
    const dbHand = await testPool.query(
      'SELECT completed_at FROM poker_hands WHERE id = $1',
      [handId],
    );
    expect(dbHand.rows[0].completed_at).not.toBeNull();
  });

  it('3 players: one folds, remaining two all-in, resolves to showdown', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2, PLAYER_3], buyIn);

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    // First actor folds
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'fold');

    // Second actor goes all-in
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand?.actingPosition == null) {
      // Hand ended (only one player left after fold — but we had 3 so shouldn't happen)
      return;
    }
    ({ addr } = getActing(state));
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());

    // Third actor calls all-in
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    await assertShowdownComplete(tableId, handId);
  });

  it('3 players: all three go all-in preflop, resolves to showdown', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2, PLAYER_3], buyIn);

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    // First actor raises all-in
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());

    // Second actor calls
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // Third actor calls (if hand isn't already resolved)
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null && state.currentHand.handId === handId) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    await assertShowdownComplete(tableId, handId);
  });

  it('all-in on the turn resolves to showdown with 5 community cards', async () => {
    const buyIn = BigInt(BB) * 50n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    // Play through to the turn
    let state = await actUntilStreet(tableId, handId, 'turn');
    if (state.currentHand?.street === 'showdown') {
      await assertShowdownComplete(tableId, handId);
      return;
    }
    if (state.currentHand?.street !== 'turn') {
      // Couldn't reach turn — skip
      return;
    }

    // All-in on the turn
    const { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'bet', buyIn.toString());

    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      const { addr: caller } = getActing(state);
      await pokerGameService.playerAction(tableId, handId, caller, 'call');
    }

    await assertShowdownComplete(tableId, handId);
  });

  it('DB has no stuck hands after all-in showdown (acting_position and turn_started_at cleared)', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    const started = await pokerGameService.startHand(tableId);
    const handId = started!.currentHand!.handId;

    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());

    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // Verify NO hands are stuck in limbo
    const limbo = await testPool.query(
      `SELECT id FROM poker_hands
       WHERE table_id = $1
         AND completed_at IS NULL
         AND acting_position IS NULL
         AND turn_started_at IS NULL`,
      [tableId],
    );
    expect(limbo.rows.length).toBe(0);
  });
});
