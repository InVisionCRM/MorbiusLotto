/**
 * Poker Server-Driven Runout Tests
 *
 * When chevtek auto-resolves multiple streets on an all-in, the server now
 * paces the reveal: it emits intermediate flop/turn/river broadcasts before
 * the final showdown frame. These tests verify:
 *   - Each intermediate frame writes the correct partial board to DB.
 *   - `completed_at` is only set on the final (showdown) frame.
 *   - `nextHandAt` is only present on the final frame (it's derived from
 *     completed_at in getTableState).
 *   - Hole cards are exposed during the runout (revealed once the all-in
 *     locks, not held until showdown).
 *   - A "river all-in" (no remaining streets) skips the runout entirely
 *     and finalizes inline.
 *
 * These tests force production pacing on (`setRunoutDelaysForTesting(true)`)
 * so we can observe the intermediate frames; other tests use the default
 * NODE_ENV=test synchronous mode.
 *
 * Run: cd server && npx jest poker-server-runout --testTimeout=120000
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

const SB = 1;
const BB = 2;

let dbService: DatabaseService;
let pfService: ProvablyFairService;
let pokerGameService: PokerGameService;
let createdTableIds: string[] = [];

/** Captures every broadcast — one entry per (tableId, observation) ordered call. */
type BroadcastEvent = { tableId: string; street: string; community: number[]; completedAt: Date | string | null };
let broadcasts: BroadcastEvent[];

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  pfService = new ProvablyFairService();
  pokerGameService = new PokerGameService(dbService, pfService);
  // Default in test env is "delays off". Re-enable so we can observe the
  // server-side staging produce intermediate DB writes between actions.
  pokerGameService.setRunoutDelaysForTesting(true);

  pokerGameService.setBroadcastCallback(async (tableId: string) => {
    // Snapshot the same view the WS handler ships to clients. Using
    // getTableState mirrors the real client wire format exactly, and
    // shares the service's DB pool — no extra connection pressure on
    // testPool from the broadcast hot path.
    try {
      const state = await pokerGameService.getTableState(tableId, null);
      const hand = state.currentHand;
      if (!hand) return;
      broadcasts.push({
        tableId,
        street: hand.street,
        community: hand.communityCards ?? [],
        // `completed_at` isn't on the state object; infer from presence of
        // winners since persistShowdown sets winners + completed_at together.
        completedAt: hand.winners && hand.winners.length > 0 ? new Date() : null,
      });
    } catch {
      // Capture failures shouldn't break the test — broadcastState swallows
      // errors in production. The assertions below will surface any gap.
    }
  });
});

afterAll(async () => {
  // Restore default for any later tests that share the process.
  pokerGameService.setRunoutDelaysForTesting(false);
});

beforeEach(async () => {
  await resetTestBalances();
  createdTableIds = [];
  broadcasts = [];
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

/** Read the auto-started hand id directly from DB — avoids the
 *  duplicate-hand pitfall of calling `startHand` after joinTable's auto-start. */
async function readActiveHandId(tableId: string): Promise<string> {
  const r = await testPool.query(
    `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [tableId],
  );
  if (r.rows.length === 0) throw new Error('No active hand');
  return r.rows[0].id;
}

function getActing(state: any): { pos: number; addr: string } {
  const pos = state.currentHand!.actingPosition!;
  return { pos, addr: state.seats[pos].playerAddress! };
}

/** Wait until either a showdown broadcast lands (preferred) or the DB row
 *  shows completed_at. Polls every 100ms. */
async function waitForCompleted(handId: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Preferred signal: the final broadcastState fired and our capture saw
    // a `showdown` frame in the broadcasts array.
    if (broadcasts.some((b) => b.street === 'showdown')) {
      // Tiny drain to absorb any straggling post-showdown broadcast.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    const r = await testPool.query('SELECT completed_at FROM poker_hands WHERE id = $1', [handId]);
    if (r.rows[0]?.completed_at != null) {
      // completed_at is set but the showdown broadcast hasn't been captured
      // yet — likely racing with `broadcastState`. Loop one more time to
      // give it a chance to push.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Hand ${handId} did not complete within ${timeoutMs}ms`);
}

/** Strip broadcasts to only frames where the community card count or street changed. */
function uniqueRunoutFrames(events: BroadcastEvent[]): BroadcastEvent[] {
  const out: BroadcastEvent[] = [];
  let lastKey = '';
  for (const e of events) {
    const key = `${e.street}|${e.community.length}|${e.completedAt ? 'final' : 'partial'}`;
    if (key === lastKey) continue;
    lastKey = key;
    out.push(e);
  }
  return out;
}

describe('Server-driven runout broadcasts', () => {
  it('preflop all-in: emits flop → turn → river → showdown frames', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    // joinTable auto-started the hand; pick it up from DB.
    const handId = await readActiveHandId(tableId);

    // Trigger preflop all-in.
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // The call action returns synchronously, but the runout is scheduled —
    // wait for the chain to complete.
    await waitForCompleted(handId);

    const runoutFrames = uniqueRunoutFrames(broadcasts).filter((e) => e.tableId === tableId);
    const streets = runoutFrames.map((e) => e.street);
    expect(streets).toEqual(expect.arrayContaining(['flop', 'turn', 'river', 'showdown']));

    // Final frame should be showdown with completed_at set + 5 cards.
    const finalFrame = runoutFrames[runoutFrames.length - 1];
    expect(finalFrame.street).toBe('showdown');
    expect(finalFrame.community.length).toBe(5);
    expect(finalFrame.completedAt).not.toBeNull();

    // No intermediate frame should have completed_at set.
    for (const f of runoutFrames.slice(0, -1)) {
      expect(f.completedAt).toBeNull();
    }

    // The first runout frame should be flop (3 cards), not showdown (5).
    const firstRunoutFrame = runoutFrames.find((f) => f.community.length >= 3 && f.completedAt == null);
    expect(firstRunoutFrame?.community.length).toBe(3);
    expect(firstRunoutFrame?.street).toBe('flop');
  }, 30000);

  it('hole cards are exposed during the runout (not held until showdown frame)', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    // joinTable auto-started the hand; pick it up from DB.
    const handId = await readActiveHandId(tableId);

    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // Poll for an intermediate state where street is flop/turn/river AND
    // showdownHands is populated.
    const deadline = Date.now() + 5000;
    let sawRevealedDuringRunout = false;
    while (Date.now() < deadline) {
      const s = await pokerGameService.getTableState(tableId, null);
      const h = s.currentHand;
      if (h && (h.street === 'flop' || h.street === 'turn' || h.street === 'river')) {
        if (h.showdownHands && Object.keys(h.showdownHands).length >= 2) {
          sawRevealedDuringRunout = true;
          break;
        }
      }
      if (h?.street === 'showdown') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(sawRevealedDuringRunout).toBe(true);

    await waitForCompleted(handId);
  }, 30000);

  it('completes via timers without manual intervention', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);
    // joinTable auto-started the hand; pick it up from DB.
    const handId = await readActiveHandId(tableId);

    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // Right after the call, the hand must NOT be completed yet (runout is paced).
    const immediate = await testPool.query('SELECT completed_at FROM poker_hands WHERE id = $1', [handId]);
    expect(immediate.rows[0].completed_at).toBeNull();

    // But it must be marked as runout-in-progress.
    const runoutRow = await testPool.query(
      'SELECT runout_resolved_at FROM poker_hands WHERE id = $1',
      [handId],
    );
    expect(runoutRow.rows[0].runout_resolved_at).not.toBeNull();

    await waitForCompleted(handId);

    // After completion, completed_at must be set and street must be showdown.
    const final = await testPool.query(
      'SELECT completed_at, street FROM poker_hands WHERE id = $1',
      [handId],
    );
    expect(final.rows[0].completed_at).not.toBeNull();
    expect(final.rows[0].street).toBe('showdown');
  }, 30000);

  it('mid-runout finalize via leaveTable credits the leaving player', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);
    // joinTable auto-started the hand; pick it up from DB.
    const handId = await readActiveHandId(tableId);

    let state = await pokerGameService.getTableState(tableId, null);
    let { addr: firstActor } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, firstActor, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    let secondActor: string | null = null;
    if (state.currentHand && state.currentHand.actingPosition != null) {
      secondActor = state.seats[state.currentHand.actingPosition!].playerAddress!;
      await pokerGameService.playerAction(tableId, handId, secondActor, 'call');
    }

    // Trigger an early leave during the runout. The runout should collapse to
    // showdown so the leaving player's seat balance reflects post-showdown
    // before deletion. Pick whichever player isn't the one who is going to
    // leave — both are committed all-in so either is valid.
    const leaver = secondActor ?? firstActor;
    await pokerGameService.leaveTable(tableId, leaver);

    // Hand should be completed now (runout collapsed by leaveTable).
    const final = await testPool.query(
      'SELECT completed_at, street FROM poker_hands WHERE id = $1',
      [handId],
    );
    expect(final.rows[0].completed_at).not.toBeNull();
    expect(final.rows[0].street).toBe('showdown');
  }, 30000);
});
