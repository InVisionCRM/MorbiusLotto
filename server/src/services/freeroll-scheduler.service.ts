import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { TournamentService } from './tournament.service';

export interface PendingScheduledEvent {
  id: string;
  tournament_id: string;
  event_type: string;
  scheduled_at: Date;
  metadata: Record<string, unknown> | null;
}

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_EVENTS_PER_POLL = 10;

/**
 * Polls for pending freeroll scheduled events and delegates execution to TournamentService.
 * Event types: 'start' | 'end' | 'reentry_close'
 */
export class FreerollSchedulerService {
  private pool: Pool;
  private tournamentService: TournamentService;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(pool: Pool, tournamentService: TournamentService) {
    this.pool = pool;
    this.tournamentService = tournamentService;
  }

  start(): void {
    if (this.intervalId != null) {
      logger.warn('FreerollSchedulerService already started');
      return;
    }
    logger.info('FreerollSchedulerService started (poll every %d ms)', POLL_INTERVAL_MS);
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Run once shortly after start
    setImmediate(() => this.poll());
  }

  stop(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('FreerollSchedulerService stopped');
    }
  }

  private async poll(): Promise<void> {
    try {
      const events = await this.getPendingEvents();
      for (const event of events) {
        try {
          await this.tournamentService.executeScheduledEvent(event);
        } catch (err) {
          logger.error('FreerollSchedulerService: failed to execute event %s: %s', event.id, err);
          // Optionally mark as cancelled or leave pending for retry
        }
      }
    } catch (err) {
      logger.error('FreerollSchedulerService: poll error: %s', err);
    }
  }

  private async getPendingEvents(): Promise<PendingScheduledEvent[]> {
    const result = await this.pool.query(
      'SELECT id, tournament_id, event_type, scheduled_at, metadata FROM get_pending_scheduled_events($1)',
      [MAX_EVENTS_PER_POLL]
    );
    return (result.rows || []).map((row: any) => ({
      id: row.id,
      tournament_id: row.tournament_id,
      event_type: row.event_type,
      scheduled_at: row.scheduled_at,
      metadata: row.metadata ?? null,
    }));
  }
}
