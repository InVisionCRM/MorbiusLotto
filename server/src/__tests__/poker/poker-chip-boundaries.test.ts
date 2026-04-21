/**
 * Poker Chip/Wei Boundary Tests
 *
 * Verifies the conversion boundaries between MORBIUS (wei) and poker chips
 * are correctly enforced. All poker_* tables store chip integers; MORBIUS
 * (wei) only appears at: cash join buy-in, cash leave credit, rake credit.
 *
 * Requires: server/.env with DATABASE_URL
 * Run: cd server && npm test -- poker-chip-boundaries
 */

import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
  getTestBalance,
} from '../setup';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';
import { PokerGameService } from '../../services/poker-game.service';
import {
  POKER_CHIP_WEI,
  chipsToWei,
  getPokerRakeWallet,
} from '../../lib/poker-chip-scale';

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
// 1. Cash buy-in boundary: wei → chips
// ---------------------------------------------------------------------------

describe('cash buy-in boundary (wei → chips)', () => {
  it('converts wei buy-in to chip-int stack at the 1000-wei-per-chip rate', async () => {
    // SB=1, BB=2 → valid cash buy-in is 40–100 BB = 80–200 chips. Use 100.
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 100n;
    const buyInWei = POKER_CHIP_WEI * buyInChips;

    const balanceBefore = await getTestBalance(PLAYER_1);
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInWei.toString());
    const balanceAfter = await getTestBalance(PLAYER_1);

    // Balance debited by exactly the buy-in (in wei).
    expect(balanceBefore - balanceAfter).toBe(buyInWei);

    // Seat stack stored as chip integer, NOT wei.
    const seatRow = await testPool.query(
      'SELECT stack FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, PLAYER_1]
    );
    expect(seatRow.rows.length).toBe(1);
    expect(BigInt(seatRow.rows[0].stack)).toBe(buyInChips);
  });

  it('rejects buy-ins that are not an exact multiple of POKER_CHIP_WEI', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    // 1 chip + 1 wei → not an exact multiple
    const badBuyInWei = POKER_CHIP_WEI + 1n;

    await expect(
      pokerGameService.joinTable(tableId, PLAYER_1, badBuyInWei.toString())
    ).rejects.toThrow();
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
// 2. Cash leave boundary: chips → wei credit
// ---------------------------------------------------------------------------

describe('cash leave boundary (chips → wei credit)', () => {
  it('credits the player balance by stack × POKER_CHIP_WEI on leave', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    // SB=1, BB=2 → 40–100 BB = 80–200 chips.
    const buyInChips = 150n;
    const buyInWei = POKER_CHIP_WEI * buyInChips;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInWei.toString());

    const balanceAfterJoin = await getTestBalance(PLAYER_1);

    // Leave without playing any hands — stack should be intact.
    await pokerGameService.leaveTable(tableId, PLAYER_1);

    const balanceAfterLeave = await getTestBalance(PLAYER_1);

    // Exactly buyInWei was credited back.
    expect(balanceAfterLeave - balanceAfterJoin).toBe(buyInWei);
  });

  it('uses chipsToWei(stack) — no hidden scaling factor', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 137n; // deliberately an odd number
    await pokerGameService.joinTable(
      tableId,
      PLAYER_1,
      (POKER_CHIP_WEI * buyInChips).toString()
    );

    const before = await getTestBalance(PLAYER_1);
    await pokerGameService.leaveTable(tableId, PLAYER_1);
    const after = await getTestBalance(PLAYER_1);

    // Expected credit via public helper — must match exactly.
    expect(after - before).toBe(chipsToWei(Number(buyInChips)));
  });
});

// ---------------------------------------------------------------------------
// 3. Rake accumulation: DB value matches 5% chip-int floor per hand
// ---------------------------------------------------------------------------

describe('rake accumulation', () => {
  it('stores rake_amount per hand as a chip integer (5% floor of winner share)', async () => {
    // SB=20/BB=40 keeps pots large enough to produce nonzero rake (floor(5%) of pot).
    // Valid buy-in = 40–100 BB = 1600–4000 chips; 2000 comfortably survives many fold hands.
    const tableId = await pokerGameService.createTable(20, 40, 6);
    createdTableIds.push(tableId);

    const buyInWei = POKER_CHIP_WEI * 2000n;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInWei.toString());
    await pokerGameService.joinTable(tableId, PLAYER_2, buyInWei.toString());

    // Play 3 preflop-fold hands — blinds only, predictable pot size.
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

      // Rake is floor(5%) of pot in chips; DB must hold the chip-int value,
      // not a wei-scaled value. Pot here is SB+BB=3 chips, so rake floor = 0.
      // Sanity bound: rake must never exceed the pot itself, and must be well
      // below 1e15 (otherwise we've accidentally stored wei).
      expect(rake).toBeLessThanOrEqual(pot);
      expect(rake).toBeLessThan(POKER_CHIP_WEI);
      expect(rake).toBe((pot * 5n) / 100n);
    }
  });

  it('credits the rake wallet by totalRakeChips × POKER_CHIP_WEI when rake accrues', async () => {
    const tableId = await pokerGameService.createTable(20, 40, 6);
    createdTableIds.push(tableId);

    // 40–100 BB = 1600–4000 chips. Use 2500.
    const buyInWei = POKER_CHIP_WEI * 2500n;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInWei.toString());
    await pokerGameService.joinTable(tableId, PLAYER_2, buyInWei.toString());

    const rakeWallet = getPokerRakeWallet();
    const rakeBefore = await getTestBalance(rakeWallet);

    // Play one fold hand at SB=20/BB=40: pot = 60 chips, rake floor = 3 chips.
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

    const rakeAfter = await getTestBalance(rakeWallet);
    const expectedWeiDelta = rakeChips * POKER_CHIP_WEI;

    expect(rakeAfter - rakeBefore).toBe(expectedWeiDelta);
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

    // 40–100 BB = 2000–5000 chips.
    const buyInWei = POKER_CHIP_WEI * 3000n;
    await pokerGameService.joinTable(tableId, PLAYER_1, buyInWei.toString());
    await pokerGameService.joinTable(tableId, PLAYER_2, buyInWei.toString());

    // Seed an in-memory table, then evict to force reconstructTable().
    const stateBefore = await pokerGameService.getTableState(tableId, null);
    expect(BigInt(stateBefore.smallBlind)).toBe(BigInt(sb));
    expect(BigInt(stateBefore.bigBlind)).toBe(BigInt(bb));

    (pokerGameService as any).activeTables.delete(tableId);

    const stateAfter = await pokerGameService.getTableState(tableId, null);
    expect(BigInt(stateAfter.smallBlind)).toBe(BigInt(sb));
    expect(BigInt(stateAfter.bigBlind)).toBe(BigInt(bb));

    // Guard against a wei-leak: if anywhere in the read path we accidentally
    // multiplied by POKER_CHIP_WEI, the surfaced blinds would be >= 1e15.
    expect(BigInt(stateAfter.smallBlind)).toBeLessThan(POKER_CHIP_WEI);
    expect(BigInt(stateAfter.bigBlind)).toBeLessThan(POKER_CHIP_WEI);
  });

  it('reconstructed seat stacks remain chip integers', async () => {
    const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
    createdTableIds.push(tableId);

    const buyInChips = 200n;
    await pokerGameService.joinTable(
      tableId,
      PLAYER_1,
      (POKER_CHIP_WEI * buyInChips).toString()
    );

    (pokerGameService as any).activeTables.delete(tableId);

    const state = await pokerGameService.getTableState(tableId, null);
    const occupied = state.seats.find((s) => s.playerAddress === PLAYER_1);
    expect(occupied).toBeDefined();
    expect(BigInt(occupied!.stack)).toBe(buyInChips);
    expect(BigInt(occupied!.stack)).toBeLessThan(POKER_CHIP_WEI);
  });
});
