import { Pool } from 'pg';
import { TournamentService } from './tournament.service';
export interface PendingScheduledEvent {
    id: string;
    tournament_id: string;
    event_type: string;
    scheduled_at: Date;
    metadata: Record<string, unknown> | null;
}
/**
 * Polls for pending freeroll scheduled events and delegates execution to TournamentService.
 * Event types: 'start' | 'elimination_round' | 'end' | 'reentry_close'
 */
export declare class FreerollSchedulerService {
    private pool;
    private tournamentService;
    private intervalId;
    constructor(pool: Pool, tournamentService: TournamentService);
    start(): void;
    stop(): void;
    private poll;
    private getPendingEvents;
}
//# sourceMappingURL=freeroll-scheduler.service.d.ts.map