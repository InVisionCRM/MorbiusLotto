"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRuntimeServices = initializeRuntimeServices;
const database_service_1 = require("../services/database.service");
const provably_fair_service_1 = require("../services/provably-fair.service");
const blackjack_game_service_1 = require("../services/blackjack-game.service");
const tournament_service_1 = require("../services/tournament.service");
const freeroll_scheduler_service_1 = require("../services/freeroll-scheduler.service");
const tournament_scheduler_service_1 = require("../services/tournament-scheduler.service");
const websocket_service_1 = require("../services/websocket.service");
const poker_game_service_1 = require("../services/poker-game.service");
const poker_tournament_service_1 = require("../services/poker-tournament.service");
const blackjack_multi_game_service_1 = require("../services/blackjack-multi-game.service");
const chain_analytics_service_1 = require("../services/chain-analytics.service");
const instant_lottery_service_1 = require("../services/instant-lottery.service");
const merkle_drops_service_1 = require("../services/merkle-drops.service");
const merkle_lp_drops_service_1 = require("../services/merkle-lp-drops.service");
const cosmetics_service_1 = require("../services/cosmetics.service");
const logger_1 = require("../utils/logger");
async function recoverPokerRuntimeState(dbService, pokerGameService) {
    const existingTables = await pokerGameService.listTables();
    if (existingTables.length === 0) {
        await pokerGameService.createTable(10, 20, 10);
        logger_1.logger.info('Poker: created default table (10/20 chips, 6 seats)');
    }
    try {
        const pool = dbService.getPool();
        // Force-complete any in-progress hand AND mark its post-hand work
        // already processed — these are not real showdowns (no winners, no
        // chip distribution), so the recovery sweep should not run
        // `syncAfterHand` against them.
        const staleResult = await pool.query(`UPDATE poker_hands
          SET completed_at = NOW(),
              acting_position = NULL,
              post_hand_processed_at = NOW()
        WHERE completed_at IS NULL
        RETURNING id, table_id`);
        if (staleResult.rows.length > 0) {
            logger_1.logger.info(`Poker: cleared ${staleResult.rows.length} stale hand(s) from previous session`);
            await pool.query(`UPDATE poker_tables SET status = 'waiting' WHERE status = 'playing'`);
        }
    }
    catch (err) {
        logger_1.logger.warn(`Poker: failed to clear stale hands on startup: ${err.message}`);
    }
}
async function initializeRuntimeServices(server, port) {
    // ── Production WS auth advisory ───────────────────────────────────────────
    // The WS layer trusts whatever address a client sends as `?address=0x...` in
    // the connection URL UNLESS `REQUIRE_WS_AUTH=true` is set. In production
    // that's an impersonation hole (act as any seated player). This was a hard
    // boot-stop, but a strict gate proved too fragile during launch ops: any env
    // mishap took the whole site down. Now it logs a loud warning at startup so
    // the operator sees it in deployment logs without blocking boot. Track in
    // the audit follow-up: fix the client-side message-vs-auth race condition,
    // then re-enable the hard gate.
    if (process.env.NODE_ENV === 'production') {
        if (process.env.REQUIRE_WS_AUTH !== 'true') {
            logger_1.logger.warn('[SECURITY] REQUIRE_WS_AUTH is not "true" in production. The WS layer ' +
                'will trust unauthenticated `?address=` query params, allowing player ' +
                'impersonation. Set REQUIRE_WS_AUTH=true once the client-side auth ' +
                'race condition is fixed.');
        }
        if (process.env.DISABLE_WS_AUTH === 'true') {
            logger_1.logger.warn('[SECURITY] DISABLE_WS_AUTH=true is set in production. EIP-712 ' +
                'signature verification is bypassed on the WebSocket handshake. ' +
                'Unset this flag as soon as possible.');
        }
    }
    server.listen(port, () => {
        logger_1.logger.info(`Blackjack server running on port ${port}`);
    });
    const dbService = new database_service_1.DatabaseService();
    await dbService.connect();
    const pfService = new provably_fair_service_1.ProvablyFairService();
    const gameService = new blackjack_game_service_1.BlackjackGameService(dbService, pfService);
    const tournamentService = new tournament_service_1.TournamentService(dbService.getPool());
    gameService.setTournamentService(tournamentService);
    const pokerGameService = new poker_game_service_1.PokerGameService(dbService, pfService);
    await recoverPokerRuntimeState(dbService, pokerGameService);
    const bjMultiService = new blackjack_multi_game_service_1.BlackjackMultiGameService(dbService, pfService);
    const wsService = new websocket_service_1.WebSocketService(server, gameService, dbService, tournamentService, pokerGameService, bjMultiService);
    pokerGameService.setBroadcastCallback((tableId) => wsService.broadcastPokerTableState(tableId));
    pokerGameService.setNotifyCallback((room, type, payload) => wsService.broadcastToRoom(room, { type, payload }));
    const pokerTournamentService = new poker_tournament_service_1.PokerTournamentService(dbService.getPool(), tournamentService, pokerGameService);
    wsService.setPokerTournamentService(pokerTournamentService);
    tournamentService.setPokerTournamentService(pokerTournamentService);
    pokerTournamentService.setBroadcastCallback((room, msg) => wsService.broadcastToRoom(room, msg));
    pokerGameService.setPostHandCallback((tableId, handNumber) => pokerTournamentService.syncAfterHand(tableId, handNumber));
    pokerGameService.setTournamentUnderfilledRecovery((tableId) => pokerTournamentService.recoverTournamentTableIfUnderTwoStackedSeats(tableId));
    bjMultiService.setBroadcastCallback((tableId) => wsService.broadcastBJMultiTableState(tableId));
    // Run the post-hand recovery sweep once at startup so any showdown that
    // was mid-window when the previous process exited gets unstuck without
    // waiting for the 5s periodic interval. Fire-and-forget — the periodic
    // interval will retry anything we miss.
    pokerGameService
        .recoverStuckPostHandTables()
        .catch((err) => logger_1.logger.error('Startup poker post-hand recovery failed', { err }));
    // Kick players who have been sitting out for >= 15 minutes (cash games only)
    setInterval(() => {
        pokerGameService.kickStaleSitOuts().catch((err) => logger_1.logger.warn('Sit-out timeout cron error', { error: err }));
    }, 60_000); // check every minute
    const freerollScheduler = new freeroll_scheduler_service_1.FreerollSchedulerService(dbService.getPool(), tournamentService);
    freerollScheduler.setPokerTournamentService(pokerTournamentService);
    freerollScheduler.start();
    const tournamentScheduler = new tournament_scheduler_service_1.TournamentSchedulerService(dbService.getPool(), tournamentService);
    tournamentScheduler.start();
    const chainAnalytics = new chain_analytics_service_1.ChainAnalyticsService(dbService);
    const instantLotteryService = new instant_lottery_service_1.InstantLotteryService(dbService, pfService);
    const merkleDropsService = new merkle_drops_service_1.MerkleDropsService(dbService.getPool());
    if (process.env.MERKLE_DROP_CRON_ENABLED === 'true') {
        merkleDropsService.startCron();
    }
    const merkleDropsLPService = new merkle_lp_drops_service_1.MerkleDropsLPService(dbService.getPool());
    if (process.env.MERKLE_LP_DROP_CRON_ENABLED === 'true') {
        merkleDropsLPService.startCron();
    }
    const cosmeticsService = new cosmetics_service_1.CosmeticsService(dbService.getPool());
    return {
        dbService,
        pfService,
        gameService,
        tournamentService,
        pokerGameService,
        bjMultiService,
        wsService,
        pokerTournamentService,
        freerollScheduler,
        tournamentScheduler,
        chainAnalytics,
        instantLotteryService,
        merkleDropsService,
        merkleDropsLPService,
        cosmeticsService,
    };
}
//# sourceMappingURL=service-registry.js.map