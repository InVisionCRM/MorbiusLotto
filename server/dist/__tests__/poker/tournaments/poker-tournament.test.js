"use strict";
/**
 * Poker Tournament Integration Tests
 *
 * Tests the full SNG poker tournament flow against a real database.
 * Each mutating test cleans up after itself (DELETE on specific IDs, or
 * relies on the tournament cascade deletes).
 *
 * Run: cd server && npm test
 * Requires: server/.env with DATABASE_URL
 */
Object.defineProperty(exports, "__esModule", { value: true });
const setup_1 = require("../../setup");
const poker_tournament_service_1 = require("../../../services/poker-tournament.service");
const tournament_service_1 = require("../../../services/tournament.service");
const poker_game_service_1 = require("../../../services/poker-game.service");
const database_service_1 = require("../../../services/database.service");
const provably_fair_service_1 = require("../../../services/provably-fair.service");
const safe_bigint_1 = require("../../../utils/safe-bigint");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PLAYER_1 = setup_1.TEST_PLAYERS[0];
const PLAYER_2 = setup_1.TEST_PLAYERS[1];
const PLAYER_3 = setup_1.TEST_PLAYERS[2];
/** 5,000 MORBIUS — typical guaranteed freeroll pool for tests */
const TEST_GUARANTEED_POOL = BigInt('5000000000000000000000');
const SMALL_CONFIG = {
    startingStack: 5000,
    minPlayers: 2,
    maxPlayers: 3,
    blindSchedule: [
        { level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 },
        { level: 2, smallBlind: 50, bigBlind: 100, handsPerLevel: 10 },
        { level: 3, smallBlind: 100, bigBlind: 200, handsPerLevel: 999 },
    ],
};
let dbService;
let pfService;
let pokerGameService;
let tournamentService;
let pokerTournamentService;
// Track created resources for cleanup
const createdTournamentIds = [];
const createdPokerTableIds = [];
async function cleanupTournament(tournamentId) {
    try {
        // Delete tournament (cascade handles entries, poker_tournament_seats)
        await setup_1.testPool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
    }
    catch { }
}
async function cleanupPokerTable(tableId) {
    try {
        await setup_1.testPool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
    }
    catch { }
}
// ---------------------------------------------------------------------------
// Service setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
    dbService = new database_service_1.DatabaseService();
    await dbService.connect();
    pfService = new provably_fair_service_1.ProvablyFairService();
    pokerGameService = new poker_game_service_1.PokerGameService(dbService, pfService);
    tournamentService = new tournament_service_1.TournamentService(setup_1.testPool);
    pokerTournamentService = new poker_tournament_service_1.PokerTournamentService(setup_1.testPool, tournamentService, pokerGameService);
});
afterAll(async () => {
    // Clean up all created tournaments
    for (const id of createdTournamentIds) {
        await cleanupTournament(id);
    }
    for (const id of createdPokerTableIds) {
        await cleanupPokerTable(id);
    }
    await dbService.disconnect?.();
});
beforeEach(async () => {
    await (0, setup_1.resetTestBalances)();
});
// ---------------------------------------------------------------------------
// normalizePokerTournamentPrizePercents
// ---------------------------------------------------------------------------
describe('0 - normalizePokerTournamentPrizePercents', () => {
    it('accepts valid rows that sum to 100', () => {
        expect((0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(3, [50, 30, 20])).toEqual([50, 30, 20]);
        expect((0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(6, [100, 0, 0, 0, 0, 0])).toEqual([100, 0, 0, 0, 0, 0]);
    });
    it('rejects wrong length', () => {
        expect(() => (0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(3, [50, 50])).toThrow(/3 entries/);
    });
    it('rejects sum not 100', () => {
        expect(() => (0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(3, [50, 30, 19])).toThrow(/100/);
    });
    it('rejects non-integers or out of range', () => {
        expect(() => (0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(2, [50.5, 49.5])).toThrow(/integer/);
        expect(() => (0, poker_tournament_service_1.normalizePokerTournamentPrizePercents)(2, [101, -1])).toThrow();
    });
});
// ---------------------------------------------------------------------------
// Helper to create a tournament and track it for cleanup
// ---------------------------------------------------------------------------
/** Future start time for tests (create rejects non-future dates). */
function pokerTestScheduledStart(hoursFromNow = 2) {
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}
/** Join listed players during registration, then run the scheduled-start path (like the real scheduler). */
async function joinThroughScheduledStart(tournamentId, players) {
    for (const p of players) {
        await pokerTournamentService.joinPokerTournament(tournamentId, p);
    }
    await pokerTournamentService.startScheduledPokerTournament(tournamentId);
    const r = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
    const id = r.rows[0]?.id;
    if (!id)
        throw new Error('expected tournament table after startScheduledPokerTournament');
    return id;
}
async function createTestTournament(overrides) {
    const config = { ...SMALL_CONFIG, ...(overrides ?? {}) };
    const { tournamentId } = await pokerTournamentService.createPokerTournament({
        creatorAddress: PLAYER_1,
        name: 'Test SNG',
        buyInAmount: setup_1.TEST_BUY_IN,
        prizeDistributionType: 'winner_takes_all',
        config,
        scheduledStartAt: pokerTestScheduledStart(),
    });
    createdTournamentIds.push(tournamentId);
    return tournamentId;
}
// ---------------------------------------------------------------------------
// Suite 1: createPokerTournament
// ---------------------------------------------------------------------------
describe('1 - createPokerTournament', () => {
    it('creates tournament with game_type=poker and status=registration', async () => {
        const tournamentId = await createTestTournament();
        const row = await setup_1.testPool.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
        expect(row.rows).toHaveLength(1);
        const t = row.rows[0];
        expect(t.game_type).toBe('poker');
        expect(t.status).toBe('registration');
    });
    it('stores poker_config with blind schedule and starting stack', async () => {
        const tournamentId = await createTestTournament();
        const row = await setup_1.testPool.query('SELECT poker_config, starting_chips FROM tournaments WHERE id = $1', [tournamentId]);
        const config = row.rows[0].poker_config;
        expect(Number(row.rows[0].starting_chips)).toBe(5000);
        expect(config.startingStack).toBe(5000);
        expect(config.blindSchedule).toHaveLength(3);
        expect(config.blindSchedule[0].level).toBe(1);
        expect(config.blindSchedule[0].smallBlind).toBe(25);
    });
    it('sets min_players and max_players from config', async () => {
        const tournamentId = await createTestTournament();
        const row = await setup_1.testPool.query('SELECT min_players, max_players FROM tournaments WHERE id = $1', [tournamentId]);
        expect(Number(row.rows[0].min_players)).toBe(2);
        expect(Number(row.rows[0].max_players)).toBe(3);
    });
    it('rejects create without scheduledStartAt', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'No schedule',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
        })).rejects.toThrow(/scheduledStartAt/);
    });
    it('rejects scheduledStartAt in the past', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Past start',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: new Date(Date.now() - 120_000),
        })).rejects.toThrow(/future/);
    });
    it('rejects empty blind schedule', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Bad SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, blindSchedule: [] },
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow('Blind schedule');
    });
    it('rejects minPlayers < 2', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Bad SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 1 },
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow('minPlayers');
    });
    it('custom: rejects when prizePercentages missing', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Custom SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'custom',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow(/prizePercentages/);
    });
    it('custom: rejects when percentages do not sum to 100', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Custom SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'custom',
            prizePercentages: [50, 30, 19],
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow(/100/);
    });
    it('custom: stores prize_percentages JSON matching creator rows', async () => {
        const pct = [50, 30, 20];
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Custom pct SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'custom',
            prizePercentages: pct,
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const row = await setup_1.testPool.query('SELECT prize_distribution_type, prize_percentages FROM tournaments WHERE id = $1', [tournamentId]);
        expect(row.rows[0].prize_distribution_type).toBe('custom');
        const stored = row.rows[0].prize_percentages;
        const arr = typeof stored === 'string' ? JSON.parse(stored) : stored;
        expect(arr).toEqual(pct);
    });
    it('freeroll: debits creator balance and sets prize_pool from guaranteedPrizePool', async () => {
        const balBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Free SNG',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const balAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(balBefore - balAfter).toBe(TEST_GUARANTEED_POOL);
        const row = await setup_1.testPool.query('SELECT buy_in_amount, prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(String(row.rows[0].buy_in_amount)).toBe('0');
        expect(BigInt(row.rows[0].prize_pool ?? '0')).toBe(TEST_GUARANTEED_POOL);
    });
    it('rejects freeroll without guaranteedPrizePool', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Bad free',
            buyInAmount: 0n,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow('guaranteedPrizePool');
    });
    it('rejects guaranteedPrizePool when buy-in > 0', async () => {
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Bad mix',
            buyInAmount: setup_1.TEST_BUY_IN,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow('only allowed when buy-in is 0');
    });
});
// platform_promo: admin creator only; debits the creator wallet (same as creator-funded freeroll)
describe('1c - platform promo guaranteed pool', () => {
    const prevAdmin = process.env.ADMIN_WALLETS;
    beforeAll(() => {
        process.env.ADMIN_WALLETS = PLAYER_1;
    });
    afterAll(() => {
        process.env.ADMIN_WALLETS = prevAdmin;
    });
    it('debits admin creator wallet and leaves guaranteed_prize_funder_address null', async () => {
        const creatorBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Promo free',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            guaranteedPrizePoolSource: 'platform_promo',
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const creatorAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(creatorBefore - creatorAfter).toBe(TEST_GUARANTEED_POOL);
        const row = await setup_1.testPool.query(`SELECT guaranteed_prize_funder_address, prize_pool, creator_address FROM tournaments WHERE id = $1`, [tournamentId]);
        expect(row.rows[0].guaranteed_prize_funder_address).toBeNull();
        expect(String(row.rows[0].creator_address).toLowerCase()).toBe(PLAYER_1.toLowerCase());
        expect(BigInt(row.rows[0].prize_pool ?? '0')).toBe(TEST_GUARANTEED_POOL);
    });
    it('cancel refunds prize pool to creator (admin)', async () => {
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Promo cancel',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            guaranteedPrizePoolSource: 'platform_promo',
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_3);
        const creatorBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        await pokerTournamentService.cancelPokerTournament(tournamentId, PLAYER_1);
        const creatorAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(creatorAfter - creatorBefore).toBe(TEST_GUARANTEED_POOL);
    });
    it('rejects platform_promo when caller is not admin', async () => {
        process.env.ADMIN_WALLETS = PLAYER_3;
        await expect(pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Hijack',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            guaranteedPrizePoolSource: 'platform_promo',
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        })).rejects.toThrow('admin');
        process.env.ADMIN_WALLETS = PLAYER_1;
    });
});
// ---------------------------------------------------------------------------
// Suite 2: joinPokerTournament — registration phase
// ---------------------------------------------------------------------------
describe('2 - joinPokerTournament', () => {
    let tournamentId;
    beforeEach(async () => {
        tournamentId = await createTestTournament();
    });
    it('deducts buy-in from player balance and creates entry', async () => {
        const balanceBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        const balanceAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(balanceBefore - balanceAfter).toBe(setup_1.TEST_BUY_IN);
        const entry = await setup_1.testPool.query(`SELECT chips_remaining, status FROM tournament_entries
       WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        expect(entry.rows).toHaveLength(1);
        expect(Number(entry.rows[0].chips_remaining)).toBe(5000);
        expect(entry.rows[0].status).toBe('playing');
    });
    it('increases prize pool by buy-in amount', async () => {
        const before = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        const poolBefore = BigInt(before.rows[0].prize_pool ?? '0');
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        const after = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        const poolAfter = BigInt(after.rows[0].prize_pool ?? '0');
        expect(poolAfter - poolBefore).toBe(setup_1.TEST_BUY_IN);
    });
    it('returns existing entry on duplicate join (idempotent for reconnect)', async () => {
        const first = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        const second = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        // Should succeed and return the same entryId
        expect(second.entryId).toBe(first.entryId);
        // Balance should only be deducted once
        const balance = await (0, setup_1.getTestBalance)(PLAYER_1);
        const expected = BigInt(setup_1.TEST_BALANCE) - setup_1.TEST_BUY_IN;
        expect(balance).toBe(expected);
    });
    it('rejects join when tournament is full', async () => {
        // Create a 2-max tournament, fill it, then try a 3rd join
        const { tournamentId: tightId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Tight SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 2 },
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tightId);
        await pokerTournamentService.joinPokerTournament(tightId, PLAYER_1);
        await pokerTournamentService.joinPokerTournament(tightId, PLAYER_2);
        // Third join should be rejected (tournament already active / full)
        await expect(pokerTournamentService.joinPokerTournament(tightId, PLAYER_3)).rejects.toThrow();
    });
    it('rejects join when tournament is not in registration status', async () => {
        // Force status to active
        await setup_1.testPool.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [tournamentId]);
        await expect(pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1)).rejects.toThrow('registration');
    });
    it('rejects join with insufficient balance', async () => {
        // Zero out balance
        await setup_1.testPool.query(`UPDATE players SET balance = 0 WHERE LOWER(wallet_address) = LOWER($1)`, [PLAYER_1]);
        await expect(pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1)).rejects.toThrow('balance');
    });
});
describe('2b - joinPokerTournament (freeroll)', () => {
    it('does not charge buy-in or change prize pool when buy_in is 0', async () => {
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Join free',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const poolRow = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        const poolBefore = BigInt(poolRow.rows[0].prize_pool ?? '0');
        const balanceBefore = await (0, setup_1.getTestBalance)(PLAYER_2);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        const poolAfter = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(BigInt(poolAfter.rows[0].prize_pool ?? '0')).toBe(poolBefore);
        expect(await (0, setup_1.getTestBalance)(PLAYER_2)).toBe(balanceBefore);
    });
});
// ---------------------------------------------------------------------------
// Suite 3: Auto-start when minPlayers reached
// ---------------------------------------------------------------------------
describe('3 - auto-start', () => {
    let tournamentId;
    beforeEach(async () => {
        tournamentId = await createTestTournament({ minPlayers: 2, maxPlayers: 6 });
    });
    it('does not auto-start on first join', async () => {
        const { autoStarted } = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        expect(autoStarted).toBe(false);
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('registration');
    });
    it('activates when startScheduledPokerTournament runs after min players registered', async () => {
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        const j2 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        expect(j2.autoStarted).toBe(false);
        expect(j2.tableId).toBeNull();
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const tbl = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1`, [tournamentId]);
        expect(tbl.rows.length).toBe(1);
        const tableId = tbl.rows[0].id;
        createdPokerTableIds.push(tableId);
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('active');
    });
    it('allows idempotent join while active for a player already registered (reconnect / table HUD)', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const again = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        expect(again.tableId).toBe(tableId);
        expect(again.autoStarted).toBe(true);
    });
    it('creates a poker table with tournament_mode=TRUE on auto-start', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const table = await setup_1.testPool.query('SELECT * FROM poker_tables WHERE id = $1', [tableId]);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0].tournament_mode).toBe(true);
        expect(table.rows[0].tournament_id).toBe(tournamentId);
    });
    it('does NOT appear in the cash game lobby', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const tables = await pokerGameService.listTables();
        const found = tables.find((t) => t.id === tableId);
        expect(found).toBeUndefined();
    });
    it('rejects cash poker joinTable on tournament tables', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await expect(pokerGameService.joinTable(tableId, PLAYER_3, setup_1.TEST_BUY_IN.toString())).rejects.toThrow(/poker_tournament_join/);
    });
    it('seats all players with starting chips in poker_seats', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const seats = await setup_1.testPool.query('SELECT player_address, stack FROM poker_seats WHERE table_id = $1', [tableId]);
        expect(seats.rows).toHaveLength(2);
        const CHIP_SCALE = BigInt('1000000000000000000');
        const totalStarting = BigInt(SMALL_CONFIG.startingStack) * BigInt(seats.rows.length) * CHIP_SCALE;
        for (const seat of seats.rows) {
            const stackChips = BigInt(seat.stack) / CHIP_SCALE;
            expect(stackChips).toBeGreaterThan(BigInt(0));
            expect(stackChips).toBeLessThanOrEqual(BigInt(SMALL_CONFIG.startingStack));
        }
        const totalActual = seats.rows.reduce((acc, s) => acc + BigInt(s.stack), BigInt(0));
        expect(totalActual).toBeLessThanOrEqual(totalStarting);
    });
    it('creates bridge rows in poker_tournament_seats', async () => {
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const pts = await setup_1.testPool.query('SELECT * FROM poker_tournament_seats WHERE tournament_id = $1', [tournamentId]);
        expect(pts.rows).toHaveLength(2);
    });
});
// ---------------------------------------------------------------------------
// Suite 4: computeBlindLevel (pure, no DB)
// ---------------------------------------------------------------------------
describe('4 - computeBlindLevel', () => {
    const schedule = [
        { level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 },
        { level: 2, smallBlind: 50, bigBlind: 100, handsPerLevel: 10 },
        { level: 3, smallBlind: 75, bigBlind: 150, handsPerLevel: 8 },
        { level: 8, smallBlind: 500, bigBlind: 1000, handsPerLevel: 999 },
    ];
    it('returns level 1 for hand 1', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 1).level).toBe(1);
    });
    it('returns level 1 for hand 10 (last in level)', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 10).level).toBe(1);
    });
    it('returns level 2 for hand 11 (first in level)', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 11).level).toBe(2);
    });
    it('returns level 2 for hand 20', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 20).level).toBe(2);
    });
    it('returns level 3 for hand 21', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 21).level).toBe(3);
    });
    it('returns last level for very high hand count', () => {
        expect(pokerTournamentService.computeBlindLevel(schedule, 9999).level).toBe(8);
        expect(pokerTournamentService.computeBlindLevel(schedule, 9999).smallBlind).toBe(500);
    });
    it('uses DEFAULT_BLIND_SCHEDULE correctly (8 levels)', () => {
        // Level 1: hands 1-10
        expect(pokerTournamentService.computeBlindLevel(poker_tournament_service_1.DEFAULT_BLIND_SCHEDULE, 5).level).toBe(1);
        // Level 2: hands 11-20
        expect(pokerTournamentService.computeBlindLevel(poker_tournament_service_1.DEFAULT_BLIND_SCHEDULE, 15).level).toBe(2);
        // Level 8: last level
        expect(pokerTournamentService.computeBlindLevel(poker_tournament_service_1.DEFAULT_BLIND_SCHEDULE, 999).level).toBe(8);
    });
});
// ---------------------------------------------------------------------------
// Suite 5: syncAfterHand — chip sync
// ---------------------------------------------------------------------------
describe('5 - syncAfterHand chip sync', () => {
    it('updates tournament_entries.chips_remaining from poker_seats.stack', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        // Manually set stacks to simulate a hand outcome (stacks stored in wei units)
        const CHIP_SCALE = BigInt('1000000000000000000');
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1, (BigInt(3000) * CHIP_SCALE).toString()]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2, (BigInt(7000) * CHIP_SCALE).toString()]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const e1 = await setup_1.testPool.query(`SELECT chips_remaining FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        const e2 = await setup_1.testPool.query(`SELECT chips_remaining FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_2]);
        expect(Number(e1.rows[0].chips_remaining)).toBe(3000);
        expect(Number(e2.rows[0].chips_remaining)).toBe(7000);
    });
    it('increments hands_played after sync', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const e = await setup_1.testPool.query(`SELECT hands_played FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        expect(Number(e.rows[0].hands_played)).toBeGreaterThan(0);
    });
});
// ---------------------------------------------------------------------------
// Suite 6: Player elimination at 0 chips
// ---------------------------------------------------------------------------
describe('6 - player elimination', () => {
    it('marks entry as busted and removes seat when stack hits 0', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        // Player 1 goes bust
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        // Complete any active hand to prevent FK issues
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 5);
        // Entry should be busted
        const entry = await setup_1.testPool.query(`SELECT status FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        expect(entry.rows[0].status).toBe('busted');
        // Seat should be removed
        const seat = await setup_1.testPool.query(`SELECT id FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        expect(seat.rows).toHaveLength(0);
    });
    it('assigns final_rank to eliminated player', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 5);
        const entry = await setup_1.testPool.query(`SELECT final_rank FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        // 1 player remaining + 1 = rank 2
        expect(Number(entry.rows[0].final_rank)).toBe(2);
    });
    it('doubles table blinds (chip units) once per elimination on that sync', async () => {
        // Three players so one elimination does not complete the tournament (table stays up).
        const tournamentId = await createTestTournament({ minPlayers: 3, maxPlayers: 3 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2, PLAYER_3]);
        createdPokerTableIds.push(tableId);
        const CHIP_SCALE = BigInt('1000000000000000000');
        const blindsBefore = await setup_1.testPool.query(`SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`, [tableId]);
        const sb0 = (0, safe_bigint_1.toBigIntSafe)(blindsBefore.rows[0].small_blind);
        const bb0 = (0, safe_bigint_1.toBigIntSafe)(blindsBefore.rows[0].big_blind);
        expect(sb0).toBe(BigInt(SMALL_CONFIG.blindSchedule[0].smallBlind) * CHIP_SCALE);
        expect(bb0).toBe(BigInt(SMALL_CONFIG.blindSchedule[0].bigBlind) * CHIP_SCALE);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_3]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const blindsAfter = await setup_1.testPool.query(`SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`, [tableId]);
        expect((0, safe_bigint_1.toBigIntSafe)(blindsAfter.rows[0].small_blind)).toBe(sb0 * 2n);
        expect((0, safe_bigint_1.toBigIntSafe)(blindsAfter.rows[0].big_blind)).toBe(bb0 * 2n);
    });
});
// ---------------------------------------------------------------------------
// Suite 7: Prize distribution
// ---------------------------------------------------------------------------
describe('7 - prize distribution', () => {
    it('custom 50/30/20 pays distributable pool by rank for three players', async () => {
        const cfg = {
            ...SMALL_CONFIG,
            minPlayers: 3,
            maxPlayers: 3,
        };
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Custom 3-way SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'custom',
            prizePercentages: [50, 30, 20],
            config: cfg,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2, PLAYER_3]);
        createdPokerTableIds.push(tableId);
        const poolRow = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        const totalPool = BigInt(String(poolRow.rows[0].prize_pool));
        const distributable = (totalPool * 95n) / 100n;
        const expectFirst = (distributable * 50n) / 100n;
        const expectSecond = (distributable * 30n) / 100n;
        const expectThird = (distributable * 20n) / 100n;
        const CHIP_SCALE = BigInt('1000000000000000000');
        const stackWei = (chips) => (BigInt(chips) * CHIP_SCALE).toString();
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1, stackWei(0)]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2, stackWei(4000)]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_3, stackWei(4000)]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2, stackWei(0)]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_3, stackWei(8000)]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 2);
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('completed');
        const entries = await setup_1.testPool.query(`SELECT final_rank, prize_won
       FROM tournament_entries WHERE tournament_id = $1 ORDER BY final_rank`, [tournamentId]);
        expect(entries.rows).toHaveLength(3);
        const prizeForRank = (rank) => BigInt(String(entries.rows.find((r) => Number(r.final_rank) === rank)?.prize_won ?? '0'));
        expect(prizeForRank(1)).toBe(expectFirst);
        expect(prizeForRank(2)).toBe(expectSecond);
        expect(prizeForRank(3)).toBe(expectThird);
    });
    it('credits winner balance after completeTournament (winner_takes_all)', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        const winnerBalanceBefore = await (0, setup_1.getTestBalance)(PLAYER_2);
        // Bust player 1
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        // syncAfterHand triggers completeTournament when ≤1 player remains
        await pokerTournamentService.syncAfterHand(tableId, 10);
        // Tournament should be completed
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('completed');
        // Winner should have received prize (buy-ins × 2, minus fees)
        const winnerBalanceAfter = await (0, setup_1.getTestBalance)(PLAYER_2);
        expect(winnerBalanceAfter).toBeGreaterThan(winnerBalanceBefore);
    });
});
// ---------------------------------------------------------------------------
// Suite 8: Full 2-player E2E flow
// ---------------------------------------------------------------------------
describe('8 - full 2-player E2E', () => {
    it('completes a full SNG: create → join × 2 → scheduled start → bust → prizes', async () => {
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'E2E Test SNG',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 2 },
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const join1 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        expect(join1.autoStarted).toBe(false);
        const join2 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        expect(join2.autoStarted).toBe(false);
        expect(join2.tableId).toBeNull();
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const tbl = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
        const tableId = tbl.rows[0].id;
        createdPokerTableIds.push(tableId);
        // 4. Verify tournament is active and table created
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('active');
        const tableRow = await setup_1.testPool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
        expect(tableRow.rows[0].tournament_mode).toBe(true);
        // 5. Simulate: player 1 loses all chips, player 2 wins everything
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        // 6. syncAfterHand triggers elimination + completion
        await pokerTournamentService.syncAfterHand(tableId, 1);
        // 7. Verify final state
        const finalT = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(finalT.rows[0].status).toBe('completed');
        const p1Entry = await setup_1.testPool.query(`SELECT status, final_rank FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_1]);
        expect(p1Entry.rows[0].status).toBe('busted');
        expect(Number(p1Entry.rows[0].final_rank)).toBe(2);
        const p2Entry = await setup_1.testPool.query(`SELECT status, final_rank, prize_won FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_2]);
        expect(p2Entry.rows[0].status).toBe('completed');
        expect(Number(p2Entry.rows[0].final_rank)).toBe(1);
        expect(BigInt(p2Entry.rows[0].prize_won ?? '0')).toBeGreaterThan(0n);
    });
    it('completes a freeroll SNG: guaranteed pool at create → join × 2 (no buy-in) → bust → winner paid from pool', async () => {
        const creatorBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'E2E Freeroll SNG',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 2 },
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        const creatorAfterCreate = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(creatorBefore - creatorAfterCreate).toBe(TEST_GUARANTEED_POOL);
        const poolAfterCreate = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(BigInt(poolAfterCreate.rows[0].prize_pool ?? '0')).toBe(TEST_GUARANTEED_POOL);
        const join1 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        expect(join1.autoStarted).toBe(false);
        const join2 = await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        expect(join2.autoStarted).toBe(false);
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const tbl = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
        const tableId = tbl.rows[0].id;
        createdPokerTableIds.push(tableId);
        const poolAfterJoins = await setup_1.testPool.query('SELECT prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(BigInt(poolAfterJoins.rows[0].prize_pool ?? '0')).toBe(TEST_GUARANTEED_POOL);
        const p2BalanceBeforeWin = await (0, setup_1.getTestBalance)(PLAYER_2);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 10000 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const finalT = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(finalT.rows[0].status).toBe('completed');
        const p2Entry = await setup_1.testPool.query(`SELECT status, final_rank, prize_won FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`, [tournamentId, PLAYER_2]);
        expect(p2Entry.rows[0].status).toBe('completed');
        expect(Number(p2Entry.rows[0].final_rank)).toBe(1);
        const prizeWon = BigInt(p2Entry.rows[0].prize_won ?? '0');
        expect(prizeWon).toBeGreaterThan(0n);
        expect(prizeWon).toBeLessThanOrEqual(TEST_GUARANTEED_POOL);
        const p2BalanceAfter = await (0, setup_1.getTestBalance)(PLAYER_2);
        expect(p2BalanceAfter - p2BalanceBeforeWin).toBe(prizeWon);
    });
});
// ---------------------------------------------------------------------------
// Suite 9: Scheduled start (min players, status active)
// ---------------------------------------------------------------------------
describe('9 - scheduled poker start', () => {
    it('cancels and refunds when below minPlayers at scheduled start', async () => {
        const start = new Date(Date.now() + 3_600_000);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Scheduled under-filled',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 6 },
            scheduledStartAt: start,
        });
        createdTournamentIds.push(tournamentId);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        const balBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const t = await setup_1.testPool.query('SELECT status, prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('cancelled');
        expect(String(t.rows[0].prize_pool)).toBe('0');
        const balAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        expect(balAfter).toBeGreaterThanOrEqual(balBefore);
    });
    it('scheduled freeroll under min: refunds guaranteed pool to creator, no entrant buy-in refunds', async () => {
        const start = new Date(Date.now() + 3_600_000);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Scheduled free under-filled',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 6 },
            scheduledStartAt: start,
        });
        createdTournamentIds.push(tournamentId);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        const creatorBalBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        const joinerBalBefore = await (0, setup_1.getTestBalance)(PLAYER_2);
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const t = await setup_1.testPool.query('SELECT status, prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('cancelled');
        expect(String(t.rows[0].prize_pool)).toBe('0');
        const creatorBalAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        const joinerBalAfter = await (0, setup_1.getTestBalance)(PLAYER_2);
        expect(creatorBalAfter - creatorBalBefore).toBe(TEST_GUARANTEED_POOL);
        expect(joinerBalAfter).toBe(joinerBalBefore);
    });
    it('activates tournament (status active) when minPlayers met at scheduled start', async () => {
        const start = new Date(Date.now() + 3_600_000);
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Scheduled full',
            buyInAmount: setup_1.TEST_BUY_IN,
            prizeDistributionType: 'winner_takes_all',
            config: { ...SMALL_CONFIG, minPlayers: 2, maxPlayers: 6 },
            scheduledStartAt: start,
        });
        createdTournamentIds.push(tournamentId);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        await pokerTournamentService.startScheduledPokerTournament(tournamentId);
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('active');
        const tbl = await setup_1.testPool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1`, [tournamentId]);
        expect(tbl.rows.length).toBe(1);
        createdPokerTableIds.push(tbl.rows[0].id);
    });
});
// ---------------------------------------------------------------------------
// Suite 11: Nominal blinds vs short stacks (chevtek all-in blind posts)
// ---------------------------------------------------------------------------
describe('11 - blinds vs short stacks', () => {
    const CHIP_SCALE = BigInt('1000000000000000000');
    it('startHand succeeds when nominal SB/BB exceed a player stack; stacks stay non-negative', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2, maxPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        const tiny = (100n * CHIP_SCALE).toString();
        const deep = (5000n * CHIP_SCALE).toString();
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, tiny, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, deep, PLAYER_2]);
        const hugeSB = (8000n * CHIP_SCALE).toString();
        const hugeBB = (10000n * CHIP_SCALE).toString();
        await setup_1.testPool.query(`UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`, [tableId, hugeSB, hugeBB]);
        await expect(pokerGameService.startHand(tableId)).resolves.toBeTruthy();
        const seats = await setup_1.testPool.query(`SELECT stack FROM poker_seats WHERE table_id = $1`, [tableId]);
        for (const row of seats.rows) {
            expect(BigInt(row.stack ?? '0')).toBeGreaterThanOrEqual(0n);
        }
        const activeHand = await setup_1.testPool.query(`SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        expect(activeHand.rows.length).toBe(1);
    });
    it('two short stacks: startHand still succeeds when both stacks are below nominal BB', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2, maxPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        const s = (40n * CHIP_SCALE).toString();
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, s, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, s, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`, [tableId, (8000n * CHIP_SCALE).toString(), (10000n * CHIP_SCALE).toString()]);
        await expect(pokerGameService.startHand(tableId)).resolves.toBeTruthy();
        const actions = await setup_1.testPool.query(`SELECT amount::text AS amount
       FROM poker_hand_actions pha
       JOIN poker_hands ph ON ph.id = pha.hand_id
       WHERE ph.table_id = $1 AND ph.completed_at IS NULL AND pha.action = 'blind'
       ORDER BY pha."order"`, [tableId]);
        expect(actions.rows.length).toBe(2);
        const a0 = BigInt(actions.rows[0].amount);
        const a1 = BigInt(actions.rows[1].amount);
        const nominalBb = 10000n * CHIP_SCALE;
        // At least one posted blind is an all-in for less than nominal BB; the other may also be short.
        expect(a0 < nominalBb || a1 < nominalBb).toBe(true);
    });
    it('syncAfterHand clamps stored blinds so BB ≤ smallest eligible stack (when min stack ≥ 2 chips)', async () => {
        // Level 1 must match table SB so the schedule step does not reset blinds before the clamp.
        const hugeSchedule = [{ level: 1, smallBlind: 8000, bigBlind: 10000, handsPerLevel: 999 }];
        const tournamentId = await createTestTournament({
            minPlayers: 2,
            maxPlayers: 2,
            blindSchedule: hugeSchedule,
        });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        createdPokerTableIds.push(tableId);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        const shortStack = 200n * CHIP_SCALE;
        const deepStack = 5000n * CHIP_SCALE;
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, shortStack.toString(), PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, deepStack.toString(), PLAYER_2]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const tbl = await setup_1.testPool.query(`SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`, [tableId]);
        const bbWei = (0, safe_bigint_1.toBigIntSafe)(tbl.rows[0].big_blind);
        const sbWei = (0, safe_bigint_1.toBigIntSafe)(tbl.rows[0].small_blind);
        expect(bbWei).toBeLessThanOrEqual(shortStack);
        expect(sbWei).toBeLessThan(bbWei);
        expect(sbWei).toBe((200n - 1n) * CHIP_SCALE);
        expect(bbWei).toBe(200n * CHIP_SCALE);
    });
});
// ---------------------------------------------------------------------------
// Suite 10: Regression — existing systems unaffected
// ---------------------------------------------------------------------------
describe('10 - regression', () => {
    it('blackjack createTournament still defaults to game_type=blackjack', async () => {
        const result = await tournamentService.createTournament({
            creatorAddress: PLAYER_1,
            name: 'BJ Regression Test',
            buyInAmount: setup_1.TEST_BUY_IN,
            startingChips: 5000,
            maxHands: 25,
            timeLimitMinutes: null,
            tableTheme: { kind: 'image', id: 'BigRich' },
            isPrivate: false,
            prizeDistributionType: 'winner_takes_all',
        });
        createdTournamentIds.push(result.id);
        const row = await setup_1.testPool.query('SELECT game_type FROM tournaments WHERE id = $1', [result.id]);
        expect(row.rows[0].game_type).toBe('blackjack');
    });
    it('cash game poker tables still appear in listTables (tournament_mode=FALSE)', async () => {
        // Create a normal cash game table
        const chipWei = 10n ** 15n;
        const tableId = await pokerGameService.createTable(chipWei * 25n, chipWei * 50n, 6);
        createdPokerTableIds.push(tableId);
        const tables = await pokerGameService.listTables();
        const found = tables.some((t) => t.id === tableId);
        expect(found).toBe(true);
        // Clean up immediately
        await pokerGameService.deleteTable(tableId);
    });
    it('poker_tournament_registrations view only shows game_type=poker', async () => {
        const tournamentId = await createTestTournament();
        const view = await setup_1.testPool.query(`SELECT tournament_id FROM poker_tournament_registrations WHERE tournament_id = $1`, [tournamentId]);
        expect(view.rows).toHaveLength(1);
        // A blackjack tournament should NOT appear in this view
        const bjResult = await tournamentService.createTournament({
            creatorAddress: PLAYER_1,
            name: 'BJ Exclusion Test',
            buyInAmount: setup_1.TEST_BUY_IN,
            startingChips: 5000,
            maxHands: 25,
            timeLimitMinutes: null,
            tableTheme: { kind: 'image', id: 'BigRich' },
            isPrivate: false,
            prizeDistributionType: 'winner_takes_all',
        });
        createdTournamentIds.push(bjResult.id);
        const bjView = await setup_1.testPool.query(`SELECT tournament_id FROM poker_tournament_registrations WHERE tournament_id = $1`, [bjResult.id]);
        expect(bjView.rows).toHaveLength(0);
    });
    it('cancelPokerTournament refunds all players and marks cancelled', async () => {
        const tournamentId = await createTestTournament();
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_1);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_3);
        const balanceBefore1 = await (0, setup_1.getTestBalance)(PLAYER_1);
        const balanceBefore3 = await (0, setup_1.getTestBalance)(PLAYER_3);
        // Force back to registration status so cancel works
        await setup_1.testPool.query(`UPDATE tournaments SET status = 'registration' WHERE id = $1`, [tournamentId]);
        await pokerTournamentService.cancelPokerTournament(tournamentId, PLAYER_1);
        const t = await setup_1.testPool.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('cancelled');
        const balanceAfter1 = await (0, setup_1.getTestBalance)(PLAYER_1);
        const balanceAfter3 = await (0, setup_1.getTestBalance)(PLAYER_3);
        expect(balanceAfter1).toBeGreaterThanOrEqual(balanceBefore1);
        expect(balanceAfter3).toBeGreaterThanOrEqual(balanceBefore3);
    });
    it('cancelPokerTournament returns freeroll guarantee to funder only; entrants get no balance credit', async () => {
        const { tournamentId } = await pokerTournamentService.createPokerTournament({
            creatorAddress: PLAYER_1,
            name: 'Cancel free',
            buyInAmount: 0n,
            guaranteedPrizePool: TEST_GUARANTEED_POOL,
            prizeDistributionType: 'winner_takes_all',
            config: SMALL_CONFIG,
            scheduledStartAt: pokerTestScheduledStart(),
        });
        createdTournamentIds.push(tournamentId);
        await pokerTournamentService.joinPokerTournament(tournamentId, PLAYER_2);
        const creatorBefore = await (0, setup_1.getTestBalance)(PLAYER_1);
        const joinerBefore = await (0, setup_1.getTestBalance)(PLAYER_2);
        await pokerTournamentService.cancelPokerTournament(tournamentId, PLAYER_1);
        const creatorAfter = await (0, setup_1.getTestBalance)(PLAYER_1);
        const joinerAfter = await (0, setup_1.getTestBalance)(PLAYER_2);
        expect(creatorAfter - creatorBefore).toBe(TEST_GUARANTEED_POOL);
        expect(joinerAfter).toBe(joinerBefore);
        const t = await setup_1.testPool.query('SELECT status, prize_pool FROM tournaments WHERE id = $1', [tournamentId]);
        expect(t.rows[0].status).toBe('cancelled');
        expect(String(t.rows[0].prize_pool)).toBe('0');
    });
});
// ---------------------------------------------------------------------------
// Suite 12: Hand history retained after SNG table cleanup
// ---------------------------------------------------------------------------
describe('12 - hand history retention', () => {
    it('keeps poker_hands with tournament_id after tournament table row is deleted', async () => {
        const tournamentId = await createTestTournament({ minPlayers: 2, maxPlayers: 2 });
        const tableId = await joinThroughScheduledStart(tournamentId, [PLAYER_1, PLAYER_2]);
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        await expect(pokerGameService.startHand(tableId)).resolves.toBeTruthy();
        const active = await setup_1.testPool.query(`SELECT id, tournament_id, table_id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL`, [tableId]);
        expect(active.rows.length).toBe(1);
        expect(active.rows[0].tournament_id).toBe(tournamentId);
        const handId = active.rows[0].id;
        await setup_1.testPool.query(`UPDATE poker_hands SET completed_at = NOW() WHERE id = $1`, [handId]);
        const CHIP_SCALE = BigInt('1000000000000000000');
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, PLAYER_1]);
        await setup_1.testPool.query(`UPDATE poker_seats SET stack = $2::NUMERIC WHERE table_id = $1 AND LOWER(player_address) = LOWER($3)`, [tableId, (5000n * CHIP_SCALE).toString(), PLAYER_2]);
        await pokerTournamentService.syncAfterHand(tableId, 1);
        const tblGone = await setup_1.testPool.query(`SELECT 1 FROM poker_tables WHERE id = $1`, [tableId]);
        expect(tblGone.rows.length).toBe(0);
        const handAfter = await setup_1.testPool.query(`SELECT id, tournament_id, table_id FROM poker_hands WHERE id = $1`, [handId]);
        expect(handAfter.rows.length).toBe(1);
        expect(handAfter.rows[0].tournament_id).toBe(tournamentId);
        expect(handAfter.rows[0].table_id).toBeNull();
    });
});
//# sourceMappingURL=poker-tournament.test.js.map