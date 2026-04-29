import { Pool } from 'pg';
import { TournamentService } from './tournament.service';
import type { PokerTournamentService } from './poker-tournament.service';
export interface PendingScheduledEvent {
    id: string;
    tournament_id: string;
    event_type: string;
    scheduled_at: Date;
    metadata: Record<string, unknown> | null;
}
/**
 * Polls for pending freeroll scheduled events and delegates execution to TournamentService.
 * Event types: 'start' | 'end' | 'reentry_close'
 */
export declare class FreerollSchedulerService {
    private pool;
    private tournamentService;
    private pokerTournamentService;
    private intervalId;
    constructor(pool: Pool, tournamentService: TournamentService);
    /**
     * Wire in the poker tournament service so the scheduler can advance time-based
     * blinds (`blindIncreaseMode === 'by_time'`) on every poll. Optional — if not
     * set, time-based tournaments will not advance blinds, but other handlers still run.
     */
    setPokerTournamentService(svc: PokerTournamentService): void;
    start(): void;
    stop(): void;
    private poll;
    private getPendingEvents;
}
//# sourceMappingURL=freeroll-scheduler.service.d.ts.map