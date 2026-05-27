/**
 * Poker AFK Behavior — Cash Auto-Sit-Out vs Tournament Bleed-Out
 *
 * Verifies the two key AFK-handling rules:
 *
 *  - CASH games: consecutive auto-timeouts increment a counter; on the second
 *    timeout (POKER_AFK_KICK_AFTER = 2) the player is flipped to
 *    `status = 'sitting_out'` and is excluded from the next hand's deal.
 *    The 15-minute kickStaleSitOuts sweep (covered elsewhere) then refunds
 *    their stack.
 *
 *  - TOURNAMENTS: there is no AFK refuge. `sitting_out` is ignored by the
 *    deal query, so AFK players keep getting cards, keep posting blinds, and
 *    eventually bust out naturally. The voluntary Sit Out RPC is rejected.
 *
 * Uses real database — run: cd server && npm test -- poker-afk-tournament
 * Requires: server/.env with DATABASE_URL (or TEST_DATABASE_URL).
 */

import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
} from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';

// Use players 6-8 to avoid colliding with autofold (3-5) and reconstruction (0-2) tests
const PLAYER_1 = TEST_PLAYERS[6];
const PLAYER_2 = TEST_PLAYERS[7];
const PLAYER_3 = TEST_PLAYERS[8];

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
  for (const id of createdTableIds) {
    try {
      await pokerGameService.deleteTable(id);
    } catch { /* best effort */ }
  }
});

async function createCashAndSeat(players: string[], buyInChips: bigint = BUY_IN_CHIPS): Promise<string> {
  const tableId = await pokerGameService.createTable(SB_CHIPS, BB_CHIPS, 6);
  createdTableIds.push(tableId);
  for (const addr of players) {
    await pokerGameService.joinTable(tableId, addr, buyInChips.toString());
  }
  return tableId;
}

/**
 * Flip a cash table to tournament mode AFTER seating, since `joinTable` rejects
 * tournament tables (they require `poker_tournament_join`). The flag is the only
 * thing the deal-query / setSitOut guard / consecutive-timeout flip key off of.
 */
async function makeTournament(tableId: string): Promise<void> {
  await testPool.query(`UPDATE poker_tables SET tournament_mode = TRUE WHERE id = $1`, [tableId]);
  // Invalidate the in-memory cache so subsequent isTournamentTable() reads see the flip.
  (pokerGameService as unknown as { invalidateTableScaling: (id: string) => void })
    .invalidateTableScaling(tableId);
}

async function expireTurn(handId: string): Promise<void> {
  await testPool.query(
    `UPDATE poker_hands SET turn_started_at = NOW() - INTERVAL '120 seconds' WHERE id = $1`,
    [handId]
  );
}

async function getSeat(tableId: string, addr: string): Promise<{ status: string; consecutive_timeouts: number; stack: string; sit_out_since: Date | null }> {
  const r = await testPool.query(
    `SELECT status, consecutive_timeouts, stack, sit_out_since FROM poker_seats
     WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
    [tableId, addr]
  );
  return r.rows[0];
}

/** Play a hand to completion by having every still-acting player time out (auto-fold/check). */
async function timeOutWholeHand(tableId: string, handId: string): Promise<void> {
  // A hand can have multiple action turns (per street); keep expiring and auto-folding
  // until completed_at is set or there's nothing left to do. Cap iterations to be safe.
  for (let i = 0; i < 20; i++) {
    const r = await testPool.query(
      `SELECT completed_at FROM poker_hands WHERE id = $1`, [handId]
    );
    if (r.rows[0]?.completed_at) return;
    await expireTurn(handId);
    const folded = await pokerGameService.autoFoldTimedOutTurns();
    if (folded.length === 0) return;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Poker AFK — Cash Auto-Sit-Out', () => {
  it('does NOT flip status after a single timeout', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;

    await expireTurn(handId);
    await pokerGameService.autoFoldTimedOutTurns();

    const seat = await getSeat(tableId, actingAddr);
    expect(Number(seat.consecutive_timeouts)).toBe(1);
    expect(seat.status).toBe('active'); // not yet at threshold (2)
    expect(seat.sit_out_since).toBeNull();
  });

  it('flips to sitting_out after the second consecutive timeout', async () => {
    // Heads-up: time out hand 1, then hand 2 starts and we time out the same player again.
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);

    // --- Hand 1 ---
    const h1 = await pokerGameService.startHand(tableId);
    const h1Id = h1!.currentHand!.handId;
    const acting1 = (await pokerGameService.getTableState(tableId, null)).currentHand!.actingPosition!;
    const afkAddr = (await pokerGameService.getTableState(tableId, null)).seats[acting1].playerAddress!;
    await timeOutWholeHand(tableId, h1Id);

    // Counter is 1, status still active
    let seat = await getSeat(tableId, afkAddr);
    expect(Number(seat.consecutive_timeouts)).toBeGreaterThanOrEqual(1);
    expect(seat.status).toBe('active');

    // --- Hand 2: same player ends up timing out again ---
    // After hand 1 the button rotates. Heads-up, the previous BB becomes the button/SB
    // and acts first preflop. We just keep timing out until the AFK player times out again.
    // Force a second timeout for `afkAddr` specifically by playing until they're to act.
    const h2 = await pokerGameService.startHand(tableId);
    if (!h2 || !h2.currentHand) {
      throw new Error('Hand 2 failed to start (expected both players still have stack)');
    }
    const h2Id = h2.currentHand.handId;

    // Drive the hand: if it's afkAddr's turn, time them out; if it's the other player's
    // turn, have them act (call/check) so action returns to afkAddr.
    for (let i = 0; i < 12; i++) {
      const st = await pokerGameService.getTableState(tableId, null);
      if (!st.currentHand || st.currentHand.actingPosition == null) break;
      const seatNow = st.seats[st.currentHand.actingPosition];
      const addrNow = seatNow.playerAddress!;
      if (addrNow.toLowerCase() === afkAddr.toLowerCase()) {
        await expireTurn(h2Id);
        await pokerGameService.autoFoldTimedOutTurns();
        break; // we got the second timeout — that's all we needed
      } else {
        const toCall = BigInt(st.currentHand.toCall);
        if (toCall > 0n) {
          await pokerGameService.playerAction(tableId, h2Id, addrNow, 'call');
        } else {
          await pokerGameService.playerAction(tableId, h2Id, addrNow, 'check');
        }
      }
    }

    seat = await getSeat(tableId, afkAddr);
    expect(Number(seat.consecutive_timeouts)).toBeGreaterThanOrEqual(2);
    expect(seat.status).toBe('sitting_out');
    expect(seat.sit_out_since).not.toBeNull();
  });

  it('excludes the auto-sat-out player from the next hand deal', async () => {
    // Set up: player A is already at sitting_out with 2 timeouts. Start a new hand
    // with only A and B at the table — should return null (only 1 active seat).
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    await testPool.query(
      `UPDATE poker_seats SET status = 'sitting_out', sit_out_since = NOW(), consecutive_timeouts = 2
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );

    const next = await pokerGameService.startHand(tableId);
    expect(next).toBeNull(); // P1 is dealt out → only P2 left → cannot start
  });

  it('resets counter to 0 on voluntary action', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    // Pre-seed counter to 1
    await testPool.query(
      `UPDATE poker_seats SET consecutive_timeouts = 1
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );

    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;
    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;
    const toCall = BigInt(state.currentHand!.toCall);
    if (toCall > 0n) {
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');
    } else {
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'check');
    }

    const seat = await getSeat(tableId, actingAddr);
    expect(Number(seat.consecutive_timeouts)).toBe(0);
    expect(seat.status).toBe('active');
  });
});

describe('Poker AFK — Tournament Behavior', () => {
  it('continues to deal in sitting_out players in tournaments (no refuge)', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    await makeTournament(tableId);

    // Simulate "AFK flag exists" (e.g. carried over from cash, or set by some future
    // tournament UI). The deal query must IGNORE this in tournaments.
    await testPool.query(
      `UPDATE poker_seats SET status = 'sitting_out', sit_out_since = NOW()
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, PLAYER_1]
    );

    const handState = await pokerGameService.startHand(tableId);
    expect(handState).not.toBeNull();
    expect(handState!.currentHand).not.toBeNull();

    // Both seats should be in the hand (toCall > 0 on someone's first action implies blinds posted)
    const seatedAddrs = handState!.seats
      .filter(s => s.playerAddress)
      .map(s => s.playerAddress!.toLowerCase());
    expect(seatedAddrs).toContain(PLAYER_1.toLowerCase());
    expect(seatedAddrs).toContain(PLAYER_2.toLowerCase());

    // Verify blinds were actually posted by the supposedly-sitting-out player.
    // Check the poker_hand_actions table for a 'blind' entry from PLAYER_1.
    const blindRow = await testPool.query(
      `SELECT amount FROM poker_hand_actions
       WHERE hand_id = $1 AND LOWER(player_address) = LOWER($2) AND action = 'blind'`,
      [handState!.currentHand!.handId, PLAYER_1]
    );
    expect(blindRow.rows.length).toBeGreaterThan(0);
    expect(Number(blindRow.rows[0].amount)).toBeGreaterThan(0);
  });

  it('does NOT flip status to sitting_out in tournaments even after many timeouts', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2, PLAYER_3]);
    await makeTournament(tableId);

    const h = await pokerGameService.startHand(tableId);
    const handId = h!.currentHand!.handId;

    // Pre-seed counter to 5 so we're well above POKER_AFK_KICK_AFTER (2)
    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;
    await testPool.query(
      `UPDATE poker_seats SET consecutive_timeouts = 5
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, actingAddr]
    );

    await expireTurn(handId);
    await pokerGameService.autoFoldTimedOutTurns();

    const seat = await getSeat(tableId, actingAddr);
    // Counter increments for telemetry...
    expect(Number(seat.consecutive_timeouts)).toBe(6);
    // ...but status stays active (no tournament refuge)
    expect(seat.status).toBe('active');
    expect(seat.sit_out_since).toBeNull();
  });

  it('rejects voluntary setSitOut on tournament tables', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    await makeTournament(tableId);

    await expect(pokerGameService.setSitOut(tableId, PLAYER_1)).rejects.toThrow(/tournament/i);

    // And the seat should NOT have been flipped
    const seat = await getSeat(tableId, PLAYER_1);
    expect(seat.status).toBe('active');
  });
});

describe('Poker AFK — Disconnect Timer Extension', () => {
  /** Backdate turn_started_at by an arbitrary number of seconds for clock tests. */
  async function backdateTurn(handId: string, seconds: number): Promise<void> {
    await testPool.query(
      `UPDATE poker_hands SET turn_started_at = NOW() - ($2 || ' seconds')::INTERVAL WHERE id = $1`,
      [handId, String(seconds)]
    );
  }

  async function getDisconnectedAt(tableId: string, addr: string): Promise<Date | null> {
    const r = await testPool.query(
      `SELECT disconnected_at FROM poker_seats
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, addr]
    );
    return r.rows[0]?.disconnected_at ?? null;
  }

  it('does NOT auto-fold a disconnected seat after only 60s (uses 90s threshold)', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;

    // Mark the acting player as disconnected
    await pokerGameService.markSeatDisconnected(tableId, actingAddr);
    expect(await getDisconnectedAt(tableId, actingAddr)).not.toBeNull();

    // Backdate by 75 seconds — past the 60s connected threshold, but BEFORE the 90s disconnected threshold
    await backdateTurn(handId, 75);
    const folded = await pokerGameService.autoFoldTimedOutTurns();
    expect(folded).not.toContain(actingAddr);
  });

  it('auto-folds a disconnected seat past 90s', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;

    await pokerGameService.markSeatDisconnected(tableId, actingAddr);
    // 100s > 90s threshold
    await backdateTurn(handId, 100);

    const folded = await pokerGameService.autoFoldTimedOutTurns();
    expect(folded).toContain(actingAddr);
  });

  it('still uses the 60s threshold for connected seats', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;

    // No disconnect mark — connected seat. 75s > 60s → should auto-fold.
    expect(await getDisconnectedAt(tableId, actingAddr)).toBeNull();
    await backdateTurn(handId, 75);

    const folded = await pokerGameService.autoFoldTimedOutTurns();
    expect(folded).toContain(actingAddr);
  });

  it('markSeatConnected clears disconnected_at', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    await pokerGameService.markSeatDisconnected(tableId, PLAYER_1);
    expect(await getDisconnectedAt(tableId, PLAYER_1)).not.toBeNull();

    await pokerGameService.markSeatConnected(tableId, PLAYER_1);
    expect(await getDisconnectedAt(tableId, PLAYER_1)).toBeNull();
  });

  it('voluntary action clears disconnected_at', async () => {
    const tableId = await createCashAndSeat([PLAYER_1, PLAYER_2]);
    const handState = await pokerGameService.startHand(tableId);
    const handId = handState!.currentHand!.handId;

    const state = await pokerGameService.getTableState(tableId, null);
    const actingAddr = state.seats[state.currentHand!.actingPosition!].playerAddress!;

    await pokerGameService.markSeatDisconnected(tableId, actingAddr);
    expect(await getDisconnectedAt(tableId, actingAddr)).not.toBeNull();

    // Player takes any voluntary action — should clear the disconnect stamp
    const toCall = BigInt(state.currentHand!.toCall);
    if (toCall > 0n) {
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'call');
    } else {
      await pokerGameService.playerAction(tableId, handId, actingAddr, 'check');
    }
    expect(await getDisconnectedAt(tableId, actingAddr)).toBeNull();
  });
});
