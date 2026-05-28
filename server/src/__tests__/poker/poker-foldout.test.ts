/**
 * Poker Fold-Out Tests
 *
 * When all-but-one player folds, the sole survivor must win the pot — no
 * matter how many players were in the hand. The chevtek engine had a latent
 * bug here: its `gatherBets` early-return branch (≤1 bettor with an uncalled
 * bet) skips the line that strips folded players from each pot's eligible
 * set. On fold-out paths that branch is what fires, so pokersolver's
 * `findWinners(eligiblePlayers)` then evaluates the folders' hands alongside
 * the survivor's and frequently awards the pot to a folder.
 *
 * The bug manifests probabilistically: only when *any* folder makes a better
 * 5-card hand than the survivor. With more players the probability the
 * survivor wins by chance drops, so multi-player fold-outs catch the bug
 * more reliably. We loop hands at table sizes 2/3/6 and assert the survivor
 * always wins the full pot. Pre-fix this should fail many iterations;
 * post-fix every iteration must pass.
 *
 * Run: cd server && npx jest poker-foldout --testTimeout=180000
 */

import {
  testPool,
  TEST_PLAYERS,
  resetTestBalances,
} from '../setup';
import { PokerGameService } from '../../services/poker-game.service';
import { DatabaseService } from '../../services/database.service';
import { ProvablyFairService } from '../../services/provably-fair.service';

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

async function createTable(players: string[], buyIn: bigint, maxSeats: number): Promise<string> {
  const tableId = await pokerGameService.createTable(SB, BB, maxSeats);
  createdTableIds.push(tableId);
  for (const addr of players) {
    await pokerGameService.joinTable(tableId, addr, buyIn.toString());
  }
  return tableId;
}

function getActing(state: any): { pos: number; addr: string } | null {
  if (!state.currentHand || state.currentHand.actingPosition == null) return null;
  const pos = state.currentHand.actingPosition;
  return { pos, addr: state.seats[pos].playerAddress! };
}

/**
 * Play one fold-out hand at a table of any size. Strategy:
 *  - Preflop: everyone calls the BB; one designated "aggressor" raises and
 *    the rest call. This guarantees every seated player contributes equal
 *    chips to the preflop pot.
 *  - Flop: the aggressor bets; everyone else folds.
 *
 * Returns the hand id, the survivor (aggressor) address, and the set of
 * folder addresses.
 */
async function playFoldOutHand(tableId: string): Promise<{
  handId: string;
  survivor: string;
  folders: string[];
}> {
  const started = await pokerGameService.startHand(tableId);
  const handId = started!.currentHand!.handId;

  // Preflop: first actor raises, everyone else calls.
  let state = await pokerGameService.getTableState(tableId, null);
  let acting = getActing(state)!;
  const survivor = acting.addr;
  const raiseTo = (BB * 3).toString();
  await pokerGameService.playerAction(tableId, handId, survivor, 'raise', raiseTo);

  // Each remaining preflop actor calls until preflop ends.
  for (let safety = 0; safety < 20; safety++) {
    state = await pokerGameService.getTableState(tableId, null);
    if (!state.currentHand || state.currentHand.street !== 'preflop') break;
    acting = getActing(state)!;
    await pokerGameService.playerAction(tableId, handId, acting.addr, 'call');
  }

  state = await pokerGameService.getTableState(tableId, null);
  if (!state.currentHand || state.currentHand.street !== 'flop') {
    throw new Error(`Expected flop, got ${state.currentHand?.street ?? '(no hand)'}`);
  }

  // Flop: walk action around. If it's the survivor's turn they bet;
  // otherwise the actor folds.
  const folders: string[] = [];
  for (let safety = 0; safety < 20; safety++) {
    state = await pokerGameService.getTableState(tableId, null);
    if (!state.currentHand || state.currentHand.actingPosition == null) break;
    if (state.currentHand.street !== 'flop') break;
    acting = getActing(state)!;
    if (acting.addr === survivor) {
      await pokerGameService.playerAction(tableId, handId, survivor, 'bet', (BB * 2).toString());
    } else {
      await pokerGameService.playerAction(tableId, handId, acting.addr, 'fold');
      folders.push(acting.addr);
    }
  }

  return { handId, survivor, folders };
}

async function assertFoldOutCorrect(
  handId: string,
  survivor: string,
  folders: string[],
): Promise<string[]> {
  const handRow = await testPool.query(
    'SELECT pot_amount, rake_amount, result FROM poker_hands WHERE id = $1',
    [handId],
  );
  const result = typeof handRow.rows[0].result === 'string'
    ? JSON.parse(handRow.rows[0].result)
    : handRow.rows[0].result;
  const pot = BigInt(handRow.rows[0].pot_amount?.toString() ?? '0');
  const rake = BigInt(handRow.rows[0].rake_amount?.toString() ?? '0');

  const playerRows = await testPool.query(
    `SELECT player_address, starting_stack, ending_stack, won_amount, won, folded
     FROM poker_hand_players WHERE hand_id = $1`,
    [handId],
  );
  const byAddr = new Map<string, any>();
  for (const r of playerRows.rows) byAddr.set(r.player_address.toLowerCase(), r);

  const winners: any[] = Array.isArray(result?.winners) ? result.winners : [];
  const winnerAddrs = winners.map((w: any) => (w.address || '').toLowerCase());
  const sumPaid = winners.reduce(
    (acc: bigint, w: any) => acc + BigInt(w.amount?.toString() ?? '0'),
    0n,
  );

  const problems: string[] = [];

  // Core invariants the bug violated.
  if (winners.length === 0) problems.push('result.winners empty');
  if (!winnerAddrs.includes(survivor.toLowerCase())) {
    problems.push(`survivor ${survivor.slice(0, 8)} not in winners (got ${winnerAddrs.map(a => a.slice(0, 8)).join(',') || '(empty)'})`);
  }
  for (const f of folders) {
    if (winnerAddrs.includes(f.toLowerCase())) {
      problems.push(`folder ${f.slice(0, 8)} appears in winners`);
    }
    const fr = byAddr.get(f.toLowerCase());
    if (!fr) continue;
    if (BigInt(fr.won_amount) !== 0n) {
      problems.push(`folder ${f.slice(0, 8)} won_amount=${fr.won_amount} should be 0`);
    }
    // Folder must lose chips this hand — they contributed something and got nothing back.
    const delta = BigInt(fr.ending_stack) - BigInt(fr.starting_stack);
    if (delta >= 0n) {
      problems.push(`folder ${f.slice(0, 8)} stack delta ${delta} >= 0 (didn't lose chips this hand)`);
    }
  }

  // Survivor must gain chips this hand.
  const sr = byAddr.get(survivor.toLowerCase());
  if (sr) {
    const survivorDelta = BigInt(sr.ending_stack) - BigInt(sr.starting_stack);
    if (survivorDelta <= 0n) {
      problems.push(`survivor ${survivor.slice(0, 8)} stack delta ${survivorDelta} <= 0 (didn't gain chips)`);
    }
  }

  // Money conservation: paid winners + rake = pot.
  if (sumPaid + rake !== pot) {
    problems.push(`paid ${sumPaid} + rake ${rake} != pot_amount ${pot}`);
  }

  return problems;
}

describe('Fold-out: survivor always wins the pot', () => {
  const ITERATIONS = 10;
  const buyIn = BigInt(BB) * 100n;

  it.each([
    ['2 players (heads-up)', 2],
    ['3 players', 3],
    ['6 players', 6],
  ])('%s: survivor wins, folders get nothing across %s fold-out hands', async (_label, numPlayers) => {
    const players = TEST_PLAYERS.slice(0, numPlayers as number);
    const tableId = await createTable(players, buyIn, numPlayers as number);

    const failures: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const { handId, survivor, folders } = await playFoldOutHand(tableId);
      const problems = await assertFoldOutCorrect(handId, survivor, folders);
      if (problems.length > 0) {
        failures.push(`iter ${i + 1} (hand ${handId.slice(0, 8)}): ${problems.join('; ')}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length}/${ITERATIONS} fold-out hands were resolved incorrectly:\n${failures.join('\n')}`);
    }
  });
});
