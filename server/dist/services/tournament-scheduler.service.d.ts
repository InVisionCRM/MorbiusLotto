import { Pool } from 'pg';
import { TournamentService } from './tournament.service';
/**
 * Handles:
 * 1. Time-expired buy-in tournaments: ends_at has passed → force complete
 * 2. Stuck tournaments: active > 48h with no games in last 24h → force complete
 */
export declare class TournamentSchedulerService {
    private pool;
    private tournamentService;
    private intervalId;
    constructor(pool: Pool, tournamentService: TournamentService);
    start(): void;
    stop(): void;
    private poll;
    /**
     * Buy-in tournaments where ends_at has passed. Force complete (rank by current chips).
     */
    private processTimeExpiredTournaments;
    /**
     * Tournaments active > 48h with no tournament_games in last 24h. Force complete.
     */
    private processStuckTournaments;
}
//# sourceMappingURL=tournament-scheduler.service.d.ts.map