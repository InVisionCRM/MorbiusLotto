import type { Server as HttpServer } from 'http';
import { DatabaseService } from '../services/database.service';
import { ProvablyFairService } from '../services/provably-fair.service';
import { BlackjackGameService } from '../services/blackjack-game.service';
import { TournamentService } from '../services/tournament.service';
import { FreerollSchedulerService } from '../services/freeroll-scheduler.service';
import { TournamentSchedulerService } from '../services/tournament-scheduler.service';
import { WebSocketService } from '../services/websocket.service';
import { PokerGameService } from '../services/poker-game.service';
import { PokerTournamentService } from '../services/poker-tournament.service';
import { BlackjackMultiGameService } from '../services/blackjack-multi-game.service';
import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { InstantLotteryService } from '../services/instant-lottery.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { CosmeticsService } from '../services/cosmetics.service';
import { logger } from '../utils/logger';

export interface RuntimeServices {
  dbService: DatabaseService;
  pfService: ProvablyFairService;
  gameService: BlackjackGameService;
  tournamentService: TournamentService;
  pokerGameService: PokerGameService;
  bjMultiService: BlackjackMultiGameService;
  wsService: WebSocketService;
  pokerTournamentService: PokerTournamentService;
  freerollScheduler: FreerollSchedulerService;
  tournamentScheduler: TournamentSchedulerService;
  chainAnalytics: ChainAnalyticsService;
  instantLotteryService: InstantLotteryService;
  merkleDropsService: MerkleDropsService;
  merkleDropsLPService: MerkleDropsLPService;
  cosmeticsService: CosmeticsService;
}

async function recoverPokerRuntimeState(dbService: DatabaseService, pokerGameService: PokerGameService): Promise<void> {
  const existingTables = await pokerGameService.listTables();
  if (existingTables.length === 0) {
    await pokerGameService.createTable(10, 20, 10);
    logger.info('Poker: created default table (10/20 chips, 6 seats)');
  }

  try {
    const pool = dbService.getPool();
    // Force-complete any in-progress hand AND mark its post-hand work
    // already processed — these are not real showdowns (no winners, no
    // chip distribution), so the recovery sweep should not run
    // `syncAfterHand` against them.
    const staleResult = await pool.query(
      `UPDATE poker_hands
          SET completed_at = NOW(),
              acting_position = NULL,
              post_hand_processed_at = NOW()
        WHERE completed_at IS NULL
        RETURNING id, table_id`
    );

    if (staleResult.rows.length > 0) {
      logger.info(`Poker: cleared ${staleResult.rows.length} stale hand(s) from previous session`);
      await pool.query(`UPDATE poker_tables SET status = 'waiting' WHERE status = 'playing'`);
    }
  } catch (err: any) {
    logger.warn(`Poker: failed to clear stale hands on startup: ${err.message}`);
  }
}

export async function initializeRuntimeServices(server: HttpServer, port: string | number): Promise<RuntimeServices> {
  server.listen(port, () => {
    logger.info(`Blackjack server running on port ${port}`);
  });

  const dbService = new DatabaseService();
  await dbService.connect();

  const pfService = new ProvablyFairService();
  const gameService = new BlackjackGameService(dbService, pfService);
  const tournamentService = new TournamentService(dbService.getPool());
  gameService.setTournamentService(tournamentService);

  const pokerGameService = new PokerGameService(dbService, pfService);
  await recoverPokerRuntimeState(dbService, pokerGameService);

  const bjMultiService = new BlackjackMultiGameService(dbService, pfService);
  const wsService = new WebSocketService(server, gameService, dbService, tournamentService, pokerGameService, bjMultiService);

  pokerGameService.setBroadcastCallback((tableId) => wsService.broadcastPokerTableState(tableId));
  pokerGameService.setNotifyCallback((room, type, payload) => wsService.broadcastToRoom(room, { type, payload }));

  const pokerTournamentService = new PokerTournamentService(dbService.getPool(), tournamentService, pokerGameService);
  wsService.setPokerTournamentService(pokerTournamentService);
  tournamentService.setPokerTournamentService(pokerTournamentService);
  pokerTournamentService.setBroadcastCallback((room, msg) => wsService.broadcastToRoom(room, msg as any));
  pokerGameService.setPostHandCallback((tableId, handNumber) => pokerTournamentService.syncAfterHand(tableId, handNumber));
  pokerGameService.setTournamentUnderfilledRecovery((tableId) =>
    pokerTournamentService.recoverTournamentTableIfUnderTwoStackedSeats(tableId));
  bjMultiService.setBroadcastCallback((tableId) => wsService.broadcastBJMultiTableState(tableId));

  // Run the post-hand recovery sweep once at startup so any showdown that
  // was mid-window when the previous process exited gets unstuck without
  // waiting for the 5s periodic interval. Fire-and-forget — the periodic
  // interval will retry anything we miss.
  pokerGameService
    .recoverStuckPostHandTables()
    .catch((err) => logger.error('Startup poker post-hand recovery failed', { err }));

  // Kick players who have been sitting out for >= 15 minutes (cash games only)
  setInterval(() => {
    pokerGameService.kickStaleSitOuts().catch((err) =>
      logger.warn('Sit-out timeout cron error', { error: err })
    );
  }, 60_000); // check every minute

  const freerollScheduler = new FreerollSchedulerService(dbService.getPool(), tournamentService);
  freerollScheduler.setPokerTournamentService(pokerTournamentService);
  freerollScheduler.start();

  const tournamentScheduler = new TournamentSchedulerService(dbService.getPool(), tournamentService);
  tournamentScheduler.start();

  const chainAnalytics = new ChainAnalyticsService(dbService);
  const instantLotteryService = new InstantLotteryService(dbService, pfService);

  const merkleDropsService = new MerkleDropsService(dbService.getPool());
  if (process.env.MERKLE_DROP_CRON_ENABLED === 'true') {
    merkleDropsService.startCron();
  }

  const merkleDropsLPService = new MerkleDropsLPService(dbService.getPool());
  if (process.env.MERKLE_LP_DROP_CRON_ENABLED === 'true') {
    merkleDropsLPService.startCron();
  }

  const cosmeticsService = new CosmeticsService(dbService.getPool());

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
