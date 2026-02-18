import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { TournamentService } from './tournament.service';

const POLL_INTERVAL_MS = 60_000; // 1 minute
const STUCK_THRESHOLD_HOURS = 48;
const STUCK_INACTIVITY_HOURS = 24;

/**
 * Handles:
 * 1. Time-expired buy-in tournaments: ends_at has passed → force complete
 * 2. Stuck tournaments: active > 48h with no games in last 24h → force complete
 */
export class TournamentSchedulerService {
  private pool: Pool;
  private tournamentService: TournamentService;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(pool: Pool, tournamentService: TournamentService) {
    this.pool = pool;
    this.tournamentService = tournamentService;
  }

  start(): void {
    if (this.intervalId != null) {
      logger.warn('TournamentSchedulerService already started');
      return;
    }
    logger.info('TournamentSchedulerService started (poll every %d ms)', POLL_INTERVAL_MS);
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    setImmediate(() => this.poll());
  }

  stop(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('TournamentSchedulerService stopped');
    }
  }

  private async poll(): Promise<void> {
    try {
      await this.processTimeExpiredTournaments();
      await this.processStuckTournaments();
    } catch (err) {
      logger.error('TournamentSchedulerService poll error: %s', err);
    }
  }

  /**
   * Buy-in tournaments where ends_at has passed. Force complete (rank by current chips).
   */
  private async processTimeExpiredTournaments(): Promise<void> {
    const result = await this.pool.query(
      `SELECT id, name, ends_at FROM tournaments
       WHERE status = 'active'
         AND (tournament_type IS NULL OR tournament_type != 'freeroll')
         AND ends_at IS NOT NULL
         AND ends_at <= NOW()`
    );

    for (const row of result.rows || []) {
      try {
        logger.info('TournamentScheduler: time limit reached, completing tournament', {
          tournamentId: row.id,
          name: row.name,
          endsAt: row.ends_at,
        });
        await this.tournamentService.handleTimeExpiredTournament(row.id);
      } catch (err) {
        logger.error('TournamentScheduler: failed to complete time-expired tournament %s: %s', row.id, err);
      }
    }
  }

  /**
   * Tournaments active > 48h with no tournament_games in last 24h. Force complete.
   */
  private async processStuckTournaments(): Promise<void> {
    const result = await this.pool.query(
      `SELECT t.id, t.name, t.created_at
       FROM tournaments t
       WHERE t.status = 'active'
         AND t.created_at < NOW() - INTERVAL '1 hour' * $1
         AND NOT EXISTS (
           SELECT 1 FROM tournament_games tg
           WHERE tg.tournament_id = t.id
             AND tg.created_at > NOW() - INTERVAL '1 hour' * $2
         )`,
      [STUCK_THRESHOLD_HOURS, STUCK_INACTIVITY_HOURS]
    );

    for (const row of result.rows || []) {
      try {
        logger.info('TournamentScheduler: stuck tournament detected, force completing', {
          tournamentId: row.id,
          name: row.name,
          createdAt: row.created_at,
        });
        await this.tournamentService.handleTimeExpiredTournament(row.id);
      } catch (err) {
        logger.error('TournamentScheduler: failed to complete stuck tournament %s: %s', row.id, err);
      }
    }
  }
}
