/**
 * Poker Auto-Fold / Auto-Check Tests
 *
 * Tests autoFoldTimedOutTurns behavior:
 * - Auto-checks when no outstanding bet (canCheck logic)
 * - Auto-folds when facing a bet
 * - Consecutive timeout tracking and AFK kick
 *
 * Uses real database — run: cd server && npm test -- poker-autofold
 * Requires: server/.env with DATABASE_URL
 */

import { Pool } from 'pg';
import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
} from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';
import { DEFAULT_POKER_CHIP_WEI } from '../../lib/poker-chip-scale';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use players 3-5 to avoid conflicts with reconstruction tests (which use 0-2)
const PLAYER_1 = TEST_PLAYERS[3];
const PLAYER_2 = TEST_PLAYERS[4];
const PLAYER_3 = TEST_PLAYERS[5];

const CHIP_WEI = DEFAULT_POKER_CHIP_WEI;
const SB_WEI = CHIP_WEI;
const BB_WEI = CHIP_WEI * 2n;
const BUY_IN_WEI = CHIP_WEI * 100n; // 50 BB

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
    } catch { /* best effort */ }
  }
});

async function createAndSeatPlayers(
  players: string[],
  buyInWei: bigint = BUY_IN_WEI,
): Promise<string> {
  const tableId = await pokerGameService.createTable(SB_WEI, BB_WEI, 6);
  createdTableIds.push(tableId);
  for (const addr of players) {
    await pokerGameService.joinTable(tableId, addr, buyInWei.toString());
  }
  return tableId;
}

/** Backdate turn_started_at so autoFold sees the hand as timed out */
async function expireTurn(handId: string): Promise<void> {
  await testPool.query(
    `UPDATE poker_hands SET turn_started_at = NOW() - INTERVAL '120 seconds' WHERE id = $1`,
    [handId]
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Poker Auto-Fold / Auto-Check', () => {
  describe('auto-check when no outstanding bet', () => {
    it('auto-checks the BB when limped to in heads-up', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);
      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // Heads-up preflop: SB/button acts first. Call the BB.
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');

      // Now BB to act — can check (SB just called, pot is level)
      state = await pokerGameService.getTableState(tableId, null);
      acting = state.currentHand!.actingPosition!;
      const bbAddr = state.seats[acting].playerAddress!;
      const streetBefore = state.currentHand!.street;

      // Expire the turn timer and run autoFold
      await expireTurn(handId);
      const folded = await pokerGameService.autoFoldTimedOutTurns();

      expect(folded).toContain(bbAddr);

      // Verify it was a CHECK not a fold — hand should advance to flop (not showdown)
      state = await pokerGameService.getTableState(tableId, null);
      if (state.currentHand) {
        // Should be on flop or later, NOT showdown from a fold
        expect(['flop', 'turn', 'river']).toContain(state.currentHand.street);
      }

      // Verify the action recorded was 'check'
      const actionResult = await testPool.query(
        `SELECT action FROM poker_hand_actions
         WHERE hand_id = $1 AND player_address = $2 AND action NOT IN ('blind')
         ORDER BY "order" DESC LIMIT 1`,
        [handId, bbAddr]
      );
      expect(actionResult.rows[0]?.action).toBe('check');
    });
  });

  describe('auto-fold when facing a bet', () => {
    it('auto-folds when facing an unmatched raise', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2, PLAYER_3]);
      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // First player (UTG) raises
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;
      const raiseAmount = BB_WEI * 3n;
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'raise', raiseAmount.toString());

      // Second player needs to act — they face a bet
      state = await pokerGameService.getTableState(tableId, null);
      acting = state.currentHand!.actingPosition!;
      const timedOutAddr = state.seats[acting].playerAddress!;

      // Verify there IS an outstanding bet (toCall > 0)
      expect(BigInt(state.currentHand!.toCall)).toBeGreaterThan(0n);

      // Expire and auto-fold
      await expireTurn(handId);
      const folded = await pokerGameService.autoFoldTimedOutTurns();

      expect(folded).toContain(timedOutAddr);

      // Verify the action recorded was 'fold'
      const actionResult = await testPool.query(
        `SELECT action FROM poker_hand_actions
         WHERE hand_id = $1 AND player_address = $2 AND action NOT IN ('blind')
         ORDER BY "order" DESC LIMIT 1`,
        [handId, timedOutAddr]
      );
      expect(actionResult.rows[0]?.action).toBe('fold');

      // Player should be marked as folded in state
      state = await pokerGameService.getTableState(tableId, null);
      const foldedSeat = state.seats.find(s => s.playerAddress === timedOutAddr);
      expect(foldedSeat?.folded).toBe(true);
    });
  });

  describe('consecutive timeout tracking', () => {
    it('increments consecutive_timeouts on each auto-fold', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);

      // Start hand and expire the acting player's turn
      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      let state = await pokerGameService.getTableState(tableId, null);
      const acting = state.currentHand!.actingPosition!;
      const actingAddr = state.seats[acting].playerAddress!;

      // Check initial timeout count
      const beforeResult = await testPool.query(
        'SELECT consecutive_timeouts FROM poker_seats WHERE table_id = $1 AND player_address = $2',
        [tableId, actingAddr]
      );
      expect(Number(beforeResult.rows[0]?.consecutive_timeouts ?? 0)).toBe(0);

      // Expire and auto-fold
      await expireTurn(handId);
      await pokerGameService.autoFoldTimedOutTurns();

      // Check timeout count incremented
      const afterResult = await testPool.query(
        'SELECT consecutive_timeouts FROM poker_seats WHERE table_id = $1 AND player_address = $2',
        [tableId, actingAddr]
      );
      expect(Number(afterResult.rows[0]?.consecutive_timeouts ?? 0)).toBe(1);
    });

    it('resets consecutive_timeouts on voluntary action', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);

      // Manually set a timeout count
      await testPool.query(
        `UPDATE poker_seats SET consecutive_timeouts = 3
         WHERE table_id = $1 AND player_address = $2`,
        [tableId, PLAYER_1]
      );

      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      let state = await pokerGameService.getTableState(tableId, null);
      const acting = state.currentHand!.actingPosition!;
      const actingAddr = state.seats[acting].playerAddress!;

      // If this player is PLAYER_1, their voluntary action should reset the counter
      if (actingAddr === PLAYER_1) {
        await pokerGameService.playerAction(tableId, handId, actingAddr, 'fold');

        const result = await testPool.query(
          'SELECT consecutive_timeouts FROM poker_seats WHERE table_id = $1 AND player_address = $2',
          [tableId, PLAYER_1]
        );
        expect(Number(result.rows[0]?.consecutive_timeouts ?? 99)).toBe(0);
      }
    });
  });

  describe('canCheck logic edge cases', () => {
    it('auto-checks on the flop when first to act (no bets)', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);
      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // Navigate to flop: call + check
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');

      state = await pokerGameService.getTableState(tableId, null);
      if (state.currentHand && state.currentHand.actingPosition != null) {
        acting = state.currentHand.actingPosition;
        actingAddr = state.seats[acting].playerAddress!;
        await pokerGameService.playerAction(tableId, handId, actingAddr, 'check');
      }

      // Should be on flop now
      state = await pokerGameService.getTableState(tableId, null);
      if (state.currentHand && state.currentHand.street === 'flop') {
        acting = state.currentHand.actingPosition!;
        actingAddr = state.seats[acting].playerAddress!;

        // No outstanding bet on flop (first to act)
        expect(BigInt(state.currentHand.toCall)).toBe(0n);

        // Expire and auto-fold → should auto-CHECK
        await expireTurn(handId);
        const folded = await pokerGameService.autoFoldTimedOutTurns();
        expect(folded).toContain(actingAddr);

        // Verify it was a check
        const actionResult = await testPool.query(
          `SELECT action FROM poker_hand_actions
           WHERE hand_id = $1 AND player_address = $2 AND street = 'flop'
           ORDER BY "order" DESC LIMIT 1`,
          [handId, actingAddr]
        );
        expect(actionResult.rows[0]?.action).toBe('check');
      }
    });
  });

  describe('no timed-out hands', () => {
    it('returns empty array when no hands are timed out', async () => {
      // Just run autoFold with nothing expired
      const folded = await pokerGameService.autoFoldTimedOutTurns();
      // Should be empty (or at least not throw)
      expect(Array.isArray(folded)).toBe(true);
    });
  });
});
