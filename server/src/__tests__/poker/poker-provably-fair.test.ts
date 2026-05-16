/**
 * Poker Provably-Fair Tests
 *
 * Verifies that:
 *   - During a live hand, `poker_hands.server_seed` is NULL and a row exists
 *     in `poker_hand_pending_seeds`.
 *   - After showdown, the plaintext seed is moved into `poker_hands.server_seed`
 *     and the pending row is deleted.
 *   - SHA256(revealedSeed) === stored serverSeedHash.
 *   - fisherYatesShuffle(serverSeed, clientSeed, 0) reproduces the exact deck
 *     order: every dealt hole card + the community cards must be a contiguous
 *     suffix of the shuffled deck when popped from the end.
 *
 * Run: cd server && npx jest poker-provably-fair --testTimeout=120000
 */

import { testPool, TEST_PLAYERS, resetTestBalances } from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';
import crypto from 'crypto';

const PLAYER_1 = TEST_PLAYERS[0];
const PLAYER_2 = TEST_PLAYERS[1];
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

describe('Provably-fair poker', () => {
  it('hides the plaintext seed mid-hand and reveals it after showdown', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    // joinTable auto-started the hand
    const handRow = await testPool.query(
      `SELECT id, server_seed, server_seed_hash, client_seed
         FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    );
    expect(handRow.rows.length).toBe(1);
    const { id: handId, server_seed_hash, client_seed } = handRow.rows[0];
    // KEY INVARIANT 1: live row must not expose plaintext.
    expect(handRow.rows[0].server_seed).toBeNull();

    // KEY INVARIANT 2: pending row holds the plaintext.
    const pendingRow = await testPool.query(
      `SELECT server_seed FROM poker_hand_pending_seeds WHERE hand_id = $1`,
      [handId],
    );
    expect(pendingRow.rows.length).toBe(1);
    const pendingSeed = pendingRow.rows[0].server_seed;
    expect(typeof pendingSeed).toBe('string');
    expect(pendingSeed.length).toBeGreaterThanOrEqual(32);

    // Drive the hand to showdown via all-in.
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    // KEY INVARIANT 3: after showdown, the plaintext is in poker_hands and
    // the pending row is gone.
    const completed = await testPool.query(
      `SELECT server_seed, server_seed_hash, completed_at FROM poker_hands WHERE id = $1`,
      [handId],
    );
    expect(completed.rows[0].completed_at).not.toBeNull();
    const revealedSeed = completed.rows[0].server_seed;
    expect(typeof revealedSeed).toBe('string');
    expect(revealedSeed).toBe(pendingSeed);

    const pendingAfter = await testPool.query(
      `SELECT 1 FROM poker_hand_pending_seeds WHERE hand_id = $1`,
      [handId],
    );
    expect(pendingAfter.rows.length).toBe(0);

    // KEY INVARIANT 4: hash matches.
    const recomputedHash = crypto.createHash('sha256').update(revealedSeed).digest('hex');
    expect(recomputedHash).toBe(server_seed_hash);

    // KEY INVARIANT 5: deck order reproducible. Every dealt card (hole +
    // community) must appear in the shuffle output, with no duplicates.
    const deckIndices = pfService.fisherYatesShuffle(revealedSeed, client_seed, 0);
    expect(deckIndices.length).toBe(52);
    expect(new Set(deckIndices).size).toBe(52);

    const holeRows = await testPool.query(
      `SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1`,
      [handId],
    );
    const allDealtCards: number[] = [];
    for (const r of holeRows.rows) {
      const cards = Array.isArray(r.cards) ? r.cards : JSON.parse(r.cards ?? '[]');
      allDealtCards.push(...cards);
    }
    const community = Array.isArray(completed.rows[0].community_cards ?? null)
      ? (await testPool.query(`SELECT community_cards FROM poker_hands WHERE id = $1`, [handId])).rows[0].community_cards
      : (await testPool.query(`SELECT community_cards FROM poker_hands WHERE id = $1`, [handId])).rows[0].community_cards;
    const communityCards: number[] = Array.isArray(community) ? community : JSON.parse(community ?? '[]');
    allDealtCards.push(...communityCards);

    // Every dealt card must be in the shuffled deck.
    const deckSet = new Set(deckIndices);
    for (const c of allDealtCards) {
      expect(deckSet.has(c)).toBe(true);
    }
    // And no duplicate cards were dealt (sanity).
    expect(new Set(allDealtCards).size).toBe(allDealtCards.length);
  }, 30_000);

  it('deal order: hole cards + community match the deck-pop sequence', async () => {
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2], buyIn);

    const handRow = await testPool.query(
      `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    );
    const handId = handRow.rows[0].id;

    // All-in to showdown.
    let state = await pokerGameService.getTableState(tableId, null);
    let { addr } = getActing(state);
    await pokerGameService.playerAction(tableId, handId, addr, 'raise', buyIn.toString());
    state = await pokerGameService.getTableState(tableId, null);
    if (state.currentHand && state.currentHand.actingPosition != null) {
      ({ addr } = getActing(state));
      await pokerGameService.playerAction(tableId, handId, addr, 'call');
    }

    const final = await testPool.query(
      `SELECT server_seed, client_seed, button_position, community_cards
         FROM poker_hands WHERE id = $1`,
      [handId],
    );
    const { server_seed, client_seed } = final.rows[0];
    const communityCards: number[] = Array.isArray(final.rows[0].community_cards)
      ? final.rows[0].community_cards
      : JSON.parse(final.rows[0].community_cards ?? '[]');

    const deckIndices = pfService.fisherYatesShuffle(server_seed, client_seed, 0);
    // Pop order: the end of the deck array is dealt first.
    const popOrder = deckIndices.slice().reverse();

    // Chevtek deals hole cards in a single pass: for each seated player in
    // table.players order, push deck.pop() twice. With 2 players, that's
    // 4 cards: P0[card0], P0[card1], P1[card2], P1[card3]. Then flop/turn/river
    // pop 5 more.
    const seatsRow = await testPool.query(
      `SELECT player_address FROM poker_seats WHERE table_id = $1 ORDER BY position ASC`,
      [tableId],
    );
    const seatedAddrs: string[] = seatsRow.rows.map((r: any) => r.player_address);

    const holeRows = await testPool.query(
      `SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1`,
      [handId],
    );
    const holeByAddr = new Map<string, number[]>();
    for (const r of holeRows.rows) {
      const cards = Array.isArray(r.cards) ? r.cards : JSON.parse(r.cards ?? '[]');
      holeByAddr.set(r.player_address, cards);
    }

    // Reconstruct the expected deal sequence from popOrder and check it
    // matches what the engine actually wrote.
    const expectedHole: number[] = [];
    for (const addr of seatedAddrs) {
      expectedHole.push(...(holeByAddr.get(addr) ?? []));
    }
    const expectedDealt = [...expectedHole, ...communityCards];

    // The first `expectedDealt.length` entries of popOrder must match the
    // dealt sequence card-for-card.
    expect(popOrder.slice(0, expectedDealt.length)).toEqual(expectedDealt);
  }, 30_000);

  it('verifier deal-order survives a player leaving after the hand', async () => {
    // Regression: the verify endpoint used to LEFT JOIN `poker_seats` for
    // seat positions. When a player left after a hand, their `poker_seats`
    // row was deleted and the join yielded a NULL position, dropping them
    // to the end of the expected deal order — causing 6+ phantom mismatches
    // even though the deck and hole-card data were perfectly intact. The
    // fix sources seat positions from `poker_hand_players` (per-hand
    // snapshot frozen at showdown).
    const PLAYER_3 = TEST_PLAYERS[2];
    const buyIn = BigInt(BB) * 40n;
    const tableId = await createTable([PLAYER_1, PLAYER_2, PLAYER_3], buyIn);

    const handRow = await testPool.query(
      `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    );
    const handId = handRow.rows[0].id;

    // Fold around to BB so the hand completes cleanly with all 3 players
    // still seated and unbusted — no all-ins, no side pots, no removals.
    for (let i = 0; i < 6; i++) {
      const state = await pokerGameService.getTableState(tableId, null);
      if (!state.currentHand || state.currentHand.actingPosition == null) break;
      const { addr } = getActing(state);
      await pokerGameService.playerAction(tableId, handId, addr, 'fold');
    }

    // Wait for completed_at + server_seed AND populateHandPlayers to land.
    // populateHandPlayers runs *after* the transaction that sets completed_at,
    // so polling on completed_at alone races the per-hand snapshot insert.
    let final: any;
    let expectedSeatRows: any;
    for (let i = 0; i < 40; i++) {
      final = (await testPool.query(
        `SELECT server_seed, client_seed, community_cards, completed_at
           FROM poker_hands WHERE id = $1`,
        [handId],
      )).rows[0];
      expectedSeatRows = await testPool.query(
        `SELECT hp.player_address, hp.seat_position, hc.cards
           FROM poker_hand_players hp
           JOIN poker_hand_hole_cards hc
                ON hc.hand_id = hp.hand_id AND hc.player_address = hp.player_address
          WHERE hp.hand_id = $1
          ORDER BY hp.seat_position ASC`,
        [handId],
      );
      if (final?.server_seed && final.completed_at && expectedSeatRows.rows.length === 3) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(final.server_seed).toBeTruthy();

    if (expectedSeatRows.rows.length !== 3) {
      const allHole = await testPool.query(
        `SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1`,
        [handId],
      );
      const allHp = await testPool.query(
        `SELECT player_address, seat_position, folded FROM poker_hand_players WHERE hand_id = $1 ORDER BY seat_position`,
        [handId],
      );
      const seats = await testPool.query(
        `SELECT player_address, position FROM poker_seats WHERE table_id = $1 ORDER BY position`,
        [tableId],
      );
      // eslint-disable-next-line no-console
      console.log('DEBUG hole_cards:', allHole.rows, 'hand_players:', allHp.rows, 'live seats:', seats.rows);
    }
    expect(expectedSeatRows.rows.length).toBe(3);

    // The player whose departure used to corrupt the verifier — pick a
    // middle-seat player so their absence shifts every later player's slot.
    const departing = expectedSeatRows.rows[1].player_address;
    await pokerGameService.leaveTable(tableId, departing);

    // Confirm `poker_seats` no longer has the departed player (LEFT JOIN on
    // poker_seats would now yield NULL — the old bug's trigger).
    const liveSeats = await testPool.query(
      `SELECT player_address FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [tableId, departing],
    );
    expect(liveSeats.rows.length).toBe(0);

    // Run the verifier's query (the one in `server.ts` GET /api/poker/verify).
    // If this regresses to joining only on poker_seats, the departed player
    // sorts last and the expected deal order is wrong.
    const verifierRows = await testPool.query(
      `SELECT hc.player_address, hc.cards,
              COALESCE(hp.seat_position, ps.position) AS position
         FROM poker_hand_hole_cards hc
         LEFT JOIN poker_hand_players hp
                ON hp.hand_id = hc.hand_id
               AND hp.player_address = hc.player_address
         LEFT JOIN poker_seats ps
                ON ps.table_id = $2
               AND ps.player_address = hc.player_address
        WHERE hc.hand_id = $1
        ORDER BY COALESCE(hp.seat_position, ps.position) ASC NULLS LAST,
                 hc.player_address ASC`,
      [handId, tableId],
    );

    const communityCards: number[] = Array.isArray(final.community_cards)
      ? final.community_cards
      : JSON.parse(final.community_cards ?? '[]');
    const deckIndices = pfService.fisherYatesShuffle(final.server_seed, final.client_seed, 0);
    const popOrder = deckIndices.slice().reverse();

    const expectedDealt: number[] = [];
    for (const r of verifierRows.rows) {
      const cards = Array.isArray(r.cards) ? r.cards : JSON.parse(r.cards ?? '[]');
      expectedDealt.push(...cards);
    }
    expectedDealt.push(...communityCards);

    expect(popOrder.slice(0, expectedDealt.length)).toEqual(expectedDealt);
  }, 30_000);
});
