/**
 * Poker chip ledger boundary tests (cash tables).
 *
 * Cash join/leave/re-up use `player_poker_chips` only; `players.balance` is unchanged.
 * Rake accrues as whole chips on the rake wallet row.
 *
 * Requires: server/.env with DATABASE_URL
 * Run: cd server && npm test -- poker-chip-boundaries
 */

import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
  getTestBalance,
  getTestChipBalance,
} from '../setup';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';
import { PokerGameService } from '../../services/poker-game.service';
import { POKER_CHIP_WEI, getPokerRakeWallet } from '../../lib/poker-chip-scale';

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];

const SB_CHIPS = 1;
const BB_CHIPS = 2;

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
    try {
      await pokerGameService.deleteTable(id);
    } catch {
      // best effort
    }
  }
});

// ---------------------------------------------------------------------------
// 1. Cash buy-in: chip wallet debit, stack = chip int
// ---------------------------------------------------------------------------

describe('cash buy-in (chip wallet)', () => {
  it('debits player_poker_chips and stores stack as chip-int', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 100n;
    const morbiusBefore = await getTestBalance(PLAYER_1);
    const chipsBefore = await getTestChipBalance(PLAYER_1);

    await pokerGameService.joinTable(tableId, PLAYER_1, buyInChips.toString());

    const morbiusAfter = await getTestBalance(PLAYER_1);
    const chipsAfter = await getTestChipBalance(PLAYER_1);

    expect(morbiusAfter).toBe(morbiusBefore);
    expect(chipsBefore - chipsAfter).toBe(buyInChips);

    const seatRow = await testPool.query(
      'SELECT stack FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, PLAYER_1]
    );
    expect(seatRow.rows.length).toBe(1);
    expect(BigInt(seatRow.rows[0].stack)).toBe(buyInChips);
  });

  it('rejects non-whole-chip buy-in strings', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    await expect(pokerGameService.joinTable(tableId, PLAYER_1, '0')).rejects.toThrow();
    await expect(pokerGameService.joinTable(tableId, PLAYER_1, '12.5')).rejects.toThrow();
  });

  it('stores small_blind and big_blind as chip integers, not wei', async () => {
    const tableId = await pokerGameService.createTable(5, 10, 6);
    createdTableIds.push(tableId);

    const tableRow = await testPool.query(
      'SELECT small_blind, big_blind FROM poker_tables WHERE id = $1',
      [tableId]
    );
    expect(tableRow.rows.length).toBe(1);
    expect(BigInt(tableRow.rows[0].small_blind)).toBe(5n);
    expect(BigInt(tableRow.rows[0].big_blind)).toBe(10n);
  });
});

// ---------------------------------------------------------------------------
// 2. Cash leave: chip wallet credit
// ---------------------------------------------------------------------------

describe('cash leave (chip wallet)', () => {
  it('credits player_poker_chips by stack chips on leave', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 150n;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInChips.toString());

    const chipsAfterJoin = await getTestChipBalance(PLAYER_1);

    await pokerGameService.leaveTable(tableId, PLAYER_1);

    const chipsAfterLeave = await getTestChipBalance(PLAYER_1);

    expect(chipsAfterLeave - chipsAfterJoin).toBe(buyInChips);
  });
});

// ---------------------------------------------------------------------------
// 3. Rake: chip-int in DB; rake wallet credited in chips
// ---------------------------------------------------------------------------

describe('rake accumulation', () => {
  it('stores rake_amount per hand as a chip integer (5% floor of pot)', async () => {
    const tableId = await pokerGameService.createTable(20, 40, 6);
    createdTableIds.push(tableId);

    await pokerGameService.joinTable(tableId, PLAYER_1, '2000');
    await pokerGameService.joinTable(tableId, PLAYER_2, '2000');

    const HANDS = 3;
    for (let i = 0; i < HANDS; i++) {
      const handState = await pokerGameService.startHand(tableId);
      expect(handState).not.toBeNull();
      const handId = handState!.currentHand!.handId;

      const state = await pokerGameService.getTableState(tableId, null);
      const actingPos = state.currentHand!.actingPosition!;
      const actingAddr = state.seats[actingPos].playerAddress!;

      await pokerGameService.playerAction(tableId, handId, actingAddr, 'fold');
    }

    const rakeRows = await testPool.query(
      `SELECT rake_amount::TEXT AS rake_amount, pot_amount::TEXT AS pot_amount
       FROM poker_hands
       WHERE table_id = $1 AND completed_at IS NOT NULL
       ORDER BY hand_number ASC`,
      [tableId]
    );
    expect(rakeRows.rows.length).toBe(HANDS);

    for (const row of rakeRows.rows) {
      const pot = BigInt(row.pot_amount);
      const rake = BigInt(row.rake_amount);

      expect(rake).toBeLessThanOrEqual(pot);
      expect(rake).toBeLessThan(POKER_CHIP_WEI);
      expect(rake).toBe((pot * 5n) / 100n);
    }
  });

  it('credits the rake wallet in whole chips when rake accrues', async () => {
    const tableId = await pokerGameService.createTable(20, 40, 6);
    createdTableIds.push(tableId);

    await pokerGameService.joinTable(tableId, PLAYER_1, '2500');
    await pokerGameService.joinTable(tableId, PLAYER_2, '2500');

    const rakeWallet = getPokerRakeWallet();
    const rakeBefore = await getTestChipBalance(rakeWallet);

    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingPos = state.currentHand!.actingPosition!;
    const actingAddr = state.seats[actingPos].playerAddress!;
    await pokerGameService.playerAction(tableId, handId, actingAddr, 'fold');

    const rakeRow = await testPool.query(
      'SELECT rake_amount::TEXT AS rake_amount FROM poker_hands WHERE id = $1',
      [handId]
    );
    const rakeChips = BigInt(rakeRow.rows[0].rake_amount);

    const rakeAfter = await getTestChipBalance(rakeWallet);

    expect(rakeAfter - rakeBefore).toBe(rakeChips);
  });
});

// ---------------------------------------------------------------------------
// 4. Reconstructed blinds integrity
// ---------------------------------------------------------------------------

describe('reconstructed blinds integrity', () => {
  it('smallBlind/bigBlind on reconstructed state match DB chip values exactly', async () => {
    const sb = 25;
    const bb = 50;
    const tableId = await pokerGameService.createTable(sb, bb, 6);
    createdTableIds.push(tableId);

    await pokerGameService.joinTable(tableId, PLAYER_1, '3000');
    await pokerGameService.joinTable(tableId, PLAYER_2, '3000');

    const stateBefore = await pokerGameService.getTableState(tableId, null);
    expect(BigInt(stateBefore.smallBlind)).toBe(BigInt(sb));
    expect(BigInt(stateBefore.bigBlind)).toBe(BigInt(bb));

    (pokerGameService as any).activeTables.delete(tableId);

    const stateAfter = await pokerGameService.getTableState(tableId, null);
    expect(BigInt(stateAfter.smallBlind)).toBe(BigInt(sb));
    expect(BigInt(stateAfter.bigBlind)).toBe(BigInt(bb));

    expect(BigInt(stateAfter.smallBlind)).toBeLessThan(POKER_CHIP_WEI);
    expect(BigInt(stateAfter.bigBlind)).toBeLessThan(POKER_CHIP_WEI);
  });

  it('reconstructed seat stacks remain chip integers', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 200n;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInChips.toString());

    (pokerGameService as any).activeTables.delete(tableId);

    const state = await pokerGameService.getTableState(tableId, null);
    const occupied = state.seats.find((s) => s.playerAddress === PLAYER_1);
    expect(occupied).toBeDefined();
    expect(BigInt(occupied!.stack)).toBe(buyInChips);
    expect(BigInt(occupied!.stack)).toBeLessThan(POKER_CHIP_WEI);
  });
});
