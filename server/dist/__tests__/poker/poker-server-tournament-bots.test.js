"use strict";
/**
 * Server-side tournament bot ticks (integration).
 *
 * Run: cd server && npm test -- poker-server-tournament-bots.test
 * Unit-only (no DB): npm test -- poker-server-tournament-bots.unit
 * Requires: server/.env with reachable DATABASE_URL
 */
Object.defineProperty(exports, "__esModule", { value: true });
const setup_1 = require("../setup");
const poker_game_service_1 = require("../../services/poker-game.service");
const database_service_1 = require("../../services/database.service");
const provably_fair_service_1 = require("../../services/provably-fair.service");
const poker_tournament_service_1 = require("../../services/poker-tournament.service");
const tournament_service_1 = require("../../services/tournament.service");
const PLAYER_1 = setup_1.TEST_PLAYERS[0];
const PLAYER_2 = setup_1.TEST_PLAYERS[1];
const SMALL_CONFIG = {
    startingStack: 5000,
    minPlayers: 2,
    maxPlayers: 3,
    blindSchedule: [
        { level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 },
        { level: 2, smallBlind: 50, bigBlind: 100, handsPerLevel: 10 },
    ],
};
let dbService;
let pfService;
let pokerGameService;
let tournamentService;
let pokerTournamentService;
const createdTournamentIds = [];
const createdPokerTableIds = [];
function pokerTestScheduledStart(hoursFromNow = 2) {
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}
async function createTestTournament() {
    const { tournamentId } = await pokerTournamentService.createPokerTournament({
        creatorAddress: PLAYER_1,
        name: 'Bot tick test SNG',
        buyInAmount: setup_1.TEST_BUY_IN,
        prizeDistributionType: 'winner_takes_all',
        config: SMALL_CONFIG,
        scheduledStartAt: pokerTestScheduledStart(),
    });
    createdTournamentIds.push(tournamentId);
    return tournamentId;
}
async function joinThroughScheduledStart(tournamentId, players) {
    for (const p of players) {
        await pokerTournamentService.joinPokerTournament(tournamentId, p);
    }
    await pokerTournamentService.startScheduledPokerTournament(tournamentId);
    const r = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
    const id = r.rows[0]?.id;
    if (!id)
        throw new Error('expected tournament table');
    return id;
}
async function advanceUntilActorIs(tableId, targetLower, maxSteps) {
    for (let i = 0; i < maxSteps; i++) {
        const state = await pokerGameService.getTableState(tableId, null);
        const hand = state.currentHand;
        if (!hand?.handId || hand.actingPosition == null) {
            throw new Error('no active hand / actor');
        }
        const pos = hand.actingPosition;
        const addr = state.seats[pos].playerAddress;
        const lower = addr?.toLowerCase() ?? '';
        if (lower === targetLower) {
            return { handId: hand.handId, actingPosition: pos };
        }
        const toCall = BigInt(hand.toCall || '0');
        const action = toCall === 0n ? 'check' : 'call';
        await pokerGameService.playerAction(tableId, hand.handId, addr, action);
    }
    throw new Error(`could not reach actor ${targetLower} in ${maxSteps} steps`);
}
let prevBotEnv;
let prevThinkEnv;
let prevServerBotsEnv;
beforeAll(async () => {
    dbService = new database_service_1.DatabaseService();
    await dbService.connect();
    pfService = new provably_fair_service_1.ProvablyFairService();
    pokerGameService = new poker_game_service_1.PokerGameService(dbService, pfService);
    tournamentService = new tournament_service_1.TournamentService(setup_1.testPool);
    pokerTournamentService = new poker_tournament_service_1.PokerTournamentService(setup_1.testPool, tournamentService, pokerGameService);
});
afterAll(async () => {
    for (const id of createdTournamentIds) {
        await setup_1.testPool.query('DELETE FROM tournaments WHERE id = $1', [id]).catch(() => { });
    }
    for (const id of createdPokerTableIds) {
        await setup_1.testPool.query('DELETE FROM poker_tables WHERE id = $1', [id]).catch(() => { });
    }
    await dbService.disconnect?.();
});
beforeEach(async () => {
    await (0, setup_1.resetTestBalances)();
    prevBotEnv = process.env.POKER_BOT_ADDRESSES;
    prevThinkEnv = process.env.POKER_SERVER_BOT_THINK_MS;
    prevServerBotsEnv = process.env.POKER_SERVER_TOURNAMENT_BOTS;
});
afterEach(() => {
    if (prevBotEnv === undefined)
        delete process.env.POKER_BOT_ADDRESSES;
    else
        process.env.POKER_BOT_ADDRESSES = prevBotEnv;
    if (prevThinkEnv === undefined)
        delete process.env.POKER_SERVER_BOT_THINK_MS;
    else
        process.env.POKER_SERVER_BOT_THINK_MS = prevThinkEnv;
    if (prevServerBotsEnv === undefined)
        delete process.env.POKER_SERVER_TOURNAMENT_BOTS;
    else
        process.env.POKER_SERVER_TOURNAMENT_BOTS = prevServerBotsEnv;
});
describe('tickServerTournamentBots (integration)', () => {
    it('acts in-process when the current actor is in POKER_BOT_ADDRESSES (tournament table)', async () => {
        process.env.POKER_BOT_ADDRESSES = PLAYER_2.toLowerCase();
        process.env.POKER_SERVER_BOT_THINK_MS = '200';
        delete process.env.POKER_SERVER_TOURNAMENT_BOTS;
        const tournamentId = await createTestTournament();
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const { handId } = await advanceUntilActorIs(tableId, PLAYER_2.toLowerCase(), 24);
        await setup_1.testPool.query(`UPDATE poker_hands SET turn_started_at = NOW() - INTERVAL '30 seconds' WHERE id = $1`, [handId]);
        const actionsBefore = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nBefore = actionsBefore.rows[0].c;
        await pokerGameService.tickServerTournamentBots();
        const actionsAfter = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nAfter = actionsAfter.rows[0].c;
        expect(nAfter).toBeGreaterThan(nBefore);
        const last = await setup_1.testPool.query(`SELECT LOWER(player_address::text) AS a, action FROM poker_hand_actions
       WHERE hand_id = $1 AND action NOT IN ('blind') ORDER BY "order" DESC LIMIT 1`, [handId]);
        expect(last.rows[0]?.a).toBe(PLAYER_2.toLowerCase());
        expect(['call', 'raise', 'bet', 'check', 'fold']).toContain(last.rows[0]?.action);
    });
    it('no-ops when POKER_BOT_ADDRESSES is empty', async () => {
        delete process.env.POKER_BOT_ADDRESSES;
        const tournamentId = await createTestTournament();
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const { handId } = await advanceUntilActorIs(tableId, PLAYER_2.toLowerCase(), 24);
        await setup_1.testPool.query(`UPDATE poker_hands SET turn_started_at = NOW() - INTERVAL '30 seconds' WHERE id = $1`, [handId]);
        const actionsBefore = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nBefore = actionsBefore.rows[0].c;
        await pokerGameService.tickServerTournamentBots();
        const actionsAfter = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nAfter = actionsAfter.rows[0].c;
        expect(nAfter).toBe(nBefore);
    });
    it('no-ops when POKER_SERVER_TOURNAMENT_BOTS=false', async () => {
        process.env.POKER_BOT_ADDRESSES = PLAYER_2.toLowerCase();
        process.env.POKER_SERVER_BOT_THINK_MS = '200';
        process.env.POKER_SERVER_TOURNAMENT_BOTS = 'false';
        const tournamentId = await createTestTournament();
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const { handId } = await advanceUntilActorIs(tableId, PLAYER_2.toLowerCase(), 24);
        await setup_1.testPool.query(`UPDATE poker_hands SET turn_started_at = NOW() - INTERVAL '30 seconds' WHERE id = $1`, [handId]);
        const actionsBefore = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nBefore = actionsBefore.rows[0].c;
        await pokerGameService.tickServerTournamentBots();
        const actionsAfter = await setup_1.testPool.query(`SELECT COUNT(*)::int AS c FROM poker_hand_actions WHERE hand_id = $1`, [handId]);
        const nAfter = actionsAfter.rows[0].c;
        expect(nAfter).toBe(nBefore);
    });
});
//# sourceMappingURL=poker-server-tournament-bots.test.js.map