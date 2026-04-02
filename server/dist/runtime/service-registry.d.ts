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
export declare function initializeRuntimeServices(server: HttpServer, port: string | number): Promise<RuntimeServices>;
//# sourceMappingURL=service-registry.d.ts.map