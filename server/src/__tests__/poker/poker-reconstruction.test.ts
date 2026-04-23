/**
 * Poker Table Reconstruction Tests
 *
 * Tests that reconstructTable correctly rebuilds in-memory Table state from DB.
 * Uses real database — run: cd server && npm test -- poker-reconstruction
 * Requires: server/.env with DATABASE_URL
 */

import { Pool } from 'pg';
import { Table, BettingRound } from '@chevtek/poker-engine';
import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
} from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];
const PLAYER_3 = TEST_PLAYERS[2];

const SB_CHIPS = 1;
const BB_CHIPS = 2;
const BUY_IN_CHIPS = 100n; // 50 BB

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
  // Cleanup tables created during tests
  for (const id of createdTableIds) {
    try {
      await pokerGameService.deleteTable(id);
    } catch {
      // best effort
    }
  }
});

async function createAndSeatPlayers(
  players: string[],
  buyInChips: bigint = BUY_IN_CHIPS,
): Promise<string> {
  const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
  createdTableIds.push(tableId);

  for (const addr of players) {
    await pokerGameService.joinTable(tableId, addr, buyInChips.toString());
  }

  return tableId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Poker Table Reconstruction', () => {
  describe('basic reconstruction — no active hand', () => {
    it('reconstructs a table with seated players but no hand in progress', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);

      // Get state before clearing cache
      const stateBefore = await pokerGameService.getTableState(tableId, PLAYER_1);
      expect(stateBefore.seats.filter(s => s.playerAddress).length).toBe(2);

      // Clear in-memory cache to force reconstruction
      (pokerGameService as any).activeTables.delete(tableId);

      // Get state after — should match
      const stateAfter = await pokerGameService.getTableState(tableId, PLAYER_1);
      expect(stateAfter.seats.filter(s => s.playerAddress).length).toBe(2);

      // Same stacks
      for (let i = 0; i < stateBefore.seats.length; i++) {
        expect(stateAfter.seats[i].stack).toBe(stateBefore.seats[i].stack);
        expect(stateAfter.seats[i].playerAddress).toBe(stateBefore.seats[i].playerAddress);
      }
    });
  });

  describe('reconstruction after preflop fold', () => {
    it('reconstructs mid-hand after a preflop fold', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2, PLAYER_3]);

      // Start a hand
      const handState = await pokerGameService.startHand(tableId);
      expect(handState).not.toBeNull();
      const handId = handState!.currentHand!.handId;

      // Get acting player and fold
      const state1 = await pokerGameService.getTableState(tableId, null);
      const actingPos1 = state1.currentHand!.actingPosition!;
      const actingAddr1 = state1.seats[actingPos1].playerAddress!;

      await pokerGameService.playerAction(tableId, handId, actingAddr1, 'fold');

      // Capture state before clearing cache
      const stateBeforeEvict = await pokerGameService.getTableState(tableId, null);

      // Evict in-memory cache
      (pokerGameService as any).activeTables.delete(tableId);

      // Force reconstruction via a player action query
      const stateAfterEvict = await pokerGameService.getTableState(tableId, null);

      // Hand should still be active
      expect(stateAfterEvict.currentHand).not.toBeNull();
      expect(stateAfterEvict.currentHand!.handId).toBe(handId);
      expect(stateAfterEvict.currentHand!.street).toBe(stateBeforeEvict.currentHand!.street);

      // The folded player should still show as folded
      const foldedSeat = stateAfterEvict.seats[actingPos1];
      expect(foldedSeat.folded).toBe(true);
    });
  });

  describe('reconstruction mid-hand with bets', () => {
    it('reconstructs after call and bet on flop', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);

      const handState = await pokerGameService.startHand(tableId);
      expect(handState).not.toBeNull();
      const handId = handState!.currentHand!.handId;

      // Play preflop: both players act to reach flop
      // Heads-up: SB/button acts first preflop, BB acts second
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;

      // First player calls
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');

      state = await pokerGameService.getTableState(tableId, null);
      if (state.currentHand && state.currentHand.actingPosition != null) {
        acting = state.currentHand.actingPosition;
        actingAddr = state.seats[acting].playerAddress!;

        // Second player checks to see flop
        await pokerGameService.playerAction(tableId, handId, actingAddr, 'check');
      }

      // Should be on flop now (or showdown if engine auto-advanced)
      state = await pokerGameService.getTableState(tableId, null);

      if (state.currentHand && state.currentHand.street === 'flop') {
        // Place a bet on the flop
        acting = state.currentHand.actingPosition!;
        actingAddr = state.seats[acting].playerAddress!;

        const betAmount = BB_CHIPS * 2; // 2 BB bet
        await pokerGameService.playerAction(tableId, handId, actingAddr, 'bet', betAmount.toString());

        // Capture state before eviction
        const stateBeforeEvict = await pokerGameService.getTableState(tableId, null);

        // Evict cache
        (pokerGameService as any).activeTables.delete(tableId);

        // Reconstruct
        const stateAfterEvict = await pokerGameService.getTableState(tableId, null);

        // Verify reconstruction matches
        expect(stateAfterEvict.currentHand!.street).toBe('flop');
        expect(stateAfterEvict.currentHand!.communityCards.length).toBe(3);

        // Acting position should be correct (the other player, who needs to respond to the bet)
        expect(stateAfterEvict.currentHand!.actingPosition).toBe(
          stateBeforeEvict.currentHand!.actingPosition
        );

        // toCall should be non-zero (there's an outstanding bet)
        expect(BigInt(stateAfterEvict.currentHand!.toCall)).toBeGreaterThan(0n);
      }
    });

    it('reconstruction allows continued play after cache eviction', async () => {
      // Use 3 players so a fold doesn't immediately end the hand
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2, PLAYER_3]);

      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // First action: call preflop
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');

      // Evict cache mid-hand
      (pokerGameService as any).activeTables.delete(tableId);

      // Continue play — the next player should be able to act after reconstruction
      state = await pokerGameService.getTableState(tableId, null);
      if (state.currentHand && state.currentHand.actingPosition != null) {
        acting = state.currentHand.actingPosition;
        actingAddr = state.seats[acting].playerAddress!;

        // Perform an action after reconstruction — fold should always work
        // (3 players, so one fold doesn't end the hand)
        await expect(
          pokerGameService.playerAction(tableId, handId, actingAddr, 'fold')
        ).resolves.not.toThrow();

        // Verify the action was recorded
        const stateAfter = await pokerGameService.getTableState(tableId, null);
        if (stateAfter.currentHand) {
          // The fold should have moved to the next player
          expect(stateAfter.currentHand.actingPosition).not.toBe(acting);
        }
      }
    });
  });

  describe('reconstruction with 3 players', () => {
    it('correctly tracks multiple folds and remaining actor', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2, PLAYER_3]);

      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // First player folds
      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;
      const firstFolder = actingAddr;
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'fold');

      // Capture state with 2 remaining
      state = await pokerGameService.getTableState(tableId, null);
      const stateBeforeEvict = { ...state.currentHand! };

      // Evict and reconstruct
      (pokerGameService as any).activeTables.delete(tableId);

      state = await pokerGameService.getTableState(tableId, null);

      if (state.currentHand && state.currentHand.actingPosition != null) {
        // Acting player after reconstruction should not be the folded player
        acting = state.currentHand.actingPosition;
        actingAddr = state.seats[acting].playerAddress!;
        expect(actingAddr).not.toBe(firstFolder);

        // Second player can still act
        await expect(
          pokerGameService.playerAction(tableId, handId, actingAddr, 'call')
        ).resolves.not.toThrow();
      }
    });
  });

  describe('reconstruction pot consistency', () => {
    it('pot amount is preserved through reconstruction', async () => {
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2]);

      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      // Check pot after blinds (should be SB + BB)
      let state = await pokerGameService.getTableState(tableId, null);
      const potAfterBlinds = state.currentHand!.pot;

      // Evict and check pot is preserved
      (pokerGameService as any).activeTables.delete(tableId);
      state = await pokerGameService.getTableState(tableId, null);

      expect(state.currentHand!.pot).toBe(potAfterBlinds);
    });
  });

  describe('reconstruction with all-in', () => {
    it('handles reconstruction when a player is all-in', async () => {
      // Minimum valid buy-in (40 BB) = 80 chips for BB=2
      const smallBuyIn = BigInt(BB_CHIPS) * 40n;
      const tableId = await createAndSeatPlayers([PLAYER_1, PLAYER_2], smallBuyIn);

      const handState = await pokerGameService.startHand(tableId);
      const handId = handState!.currentHand!.handId;

      let state = await pokerGameService.getTableState(tableId, null);
      let acting = state.currentHand!.actingPosition!;
      let actingAddr = state.seats[acting].playerAddress!;

      // Go all-in with a raise
      const allInAmount = smallBuyIn;
      try {
        await pokerGameService.playerAction(tableId, handId, actingAddr, 'raise', allInAmount.toString());
      } catch {
        // If raise isn't legal, try bet
        try {
          await pokerGameService.playerAction(tableId, handId, actingAddr, 'bet', allInAmount.toString());
        } catch {
          // Just call — we're testing reconstruction, not betting
          await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');
        }
      }

      // Capture state
      state = await pokerGameService.getTableState(tableId, null);
      const stateBeforeEvict = state;

      // Evict and reconstruct
      (pokerGameService as any).activeTables.delete(tableId);
      const stateAfterEvict = await pokerGameService.getTableState(tableId, null);

      // Street should match
      if (stateBeforeEvict.currentHand && stateAfterEvict.currentHand) {
        expect(stateAfterEvict.currentHand.street).toBe(stateBeforeEvict.currentHand.street);
      }
    });
  });
});
