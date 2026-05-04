/**
 * custom_token_buyin — createPokerTournament integration
 *
 * Verifies DB rows for PRC-20 buy-in tournaments: zero initial prize_pool, token metadata,
 * and escrow bytes32 derived from the generated tournament UUID.
 *
 * Run: cd server && npm test -- --testPathPattern=custom-token-buyin
 * Requires: server/.env with DATABASE_URL
 */

import { testPool, TEST_PLAYERS, resetTestBalances } from '../../setup';
import { PokerTournamentService } from '../../../services/poker-tournament.service';
import { TournamentService } from '../../../services/tournament.service';
import { PokerGameService } from '../../../services/poker-game.service';
import { DatabaseService } from '../../../services/database.service';
import { ProvablyFairService } from '../../../services/provably-fair.service';
import { tournamentIdToBytes32 } from '../../../utils/tournament-id-bytes32';

const PLAYER_1 = TEST_PLAYERS[0];

/** Valid ERC-20 checksum not required for DB storage; use fixed test hex. */
const SAMPLE_PRC20 = '0x1111111111111111111111111111111111111111';

function pokerTestScheduledStart(hoursFromNow = 2): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

let dbService: DatabaseService;
let pokerTournamentService: PokerTournamentService;
const createdTournamentIds: string[] = [];

beforeAll(async () => {
  dbService = new DatabaseService();
  await dbService.connect();
  const pf = new ProvablyFairService();
  const pokerGame = new PokerGameService(dbService, pf);
  const tournamentService = new TournamentService(testPool);
  pokerTournamentService = new PokerTournamentService(testPool, tournamentService, pokerGame);
});

afterAll(async () => {
  for (const id of createdTournamentIds) {
    try {
      await testPool.query('DELETE FROM tournaments WHERE id = $1', [id]);
    } catch {
      /* best effort */
    }
  }
  await dbService.disconnect?.();
});

beforeEach(async () => {
  await resetTestBalances();
});

describe('custom_token_buyin — createPokerTournament', () => {
  it('persists token metadata, prize_pool 0, escrow bytes32, null escrow tx', async () => {
    const buyWei = 1_000_000_000_000_000_000n; // 1e18
    const { tournamentId } = await pokerTournamentService.createPokerTournament({
      creatorAddress: PLAYER_1,
      name: 'PRC-20 buy-in test',
      buyInAmount: buyWei,
      guaranteedPrizePoolSource: 'custom_token_buyin',
      customTokenBuyIn: {
        tokenAddress: SAMPLE_PRC20,
        decimals: 18,
        symbol: 'TST',
        name: 'Test Token',
      },
      prizeDistributionType: 'winner_takes_all',
      config: {
        startingStack: 5000,
        minPlayers: 2,
        maxPlayers: 3,
        blindSchedule: [
          { level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 },
          { level: 2, smallBlind: 50, bigBlind: 100, handsPerLevel: 10 },
        ],
      },
      scheduledStartAt: pokerTestScheduledStart(),
    });
    createdTournamentIds.push(tournamentId);

    const row = await testPool.query(
      `SELECT buy_in_amount, prize_pool, prize_token_address, prize_token_decimals, prize_token_symbol, prize_token_name,
              escrow_tournament_id_bytes32, escrow_tx_hash, id
       FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    const t = row.rows[0];
    expect(t).toBeDefined();
    expect(String(t.buy_in_amount)).toBe(buyWei.toString());
    expect(String(t.prize_pool)).toBe('0');
    expect(String(t.prize_token_address).toLowerCase()).toBe(SAMPLE_PRC20.toLowerCase());
    expect(Number(t.prize_token_decimals)).toBe(18);
    expect(t.prize_token_symbol).toBe('TST');
    expect(t.prize_token_name).toBe('Test Token');
    expect(t.escrow_tx_hash).toBeNull();
    const bytes32 = tournamentIdToBytes32(tournamentId);
    expect(String(t.escrow_tournament_id_bytes32).toLowerCase()).toBe(bytes32.toLowerCase());
    expect(t.id).toBe(tournamentId);
  });

  it('rejects custom_token_buyin without customTokenBuyIn', async () => {
    await expect(
      pokerTournamentService.createPokerTournament({
        creatorAddress: PLAYER_1,
        name: 'Bad custom buy-in',
        buyInAmount: 1n,
        guaranteedPrizePoolSource: 'custom_token_buyin',
        prizeDistributionType: 'winner_takes_all',
        config: {
          startingStack: 5000,
          minPlayers: 2,
          maxPlayers: 3,
          blindSchedule: [{ level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 }],
        },
        scheduledStartAt: pokerTestScheduledStart(),
      }),
    ).rejects.toThrow(/customTokenBuyIn is required/);
  });
});
