"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreerollSchedulerService = void 0;
const logger_1 = require("../utils/logger");
const POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_EVENTS_PER_POLL = 10;
/**
 * Polls for pending freeroll scheduled events and delegates execution to TournamentService.
 * Event types: 'start' | 'end' | 'reentry_close'
 */
class FreerollSchedulerService {
    pool;
    tournamentService;
    pokerTournamentService = null;
    intervalId = null;
    constructor(pool, tournamentService) {
        this.pool = pool;
        this.tournamentService = tournamentService;
    }
    /**
     * Wire in the poker tournament service so the scheduler can advance time-based
     * blinds (`blindIncreaseMode === 'by_time'`) on every poll. Optional — if not
     * set, time-based tournaments will not advance blinds, but other handlers still run.
     */
    setPokerTournamentService(svc) {
        this.pokerTournamentService = svc;
    }
    start() {
        if (this.intervalId != null) {
            logger_1.logger.warn('FreerollSchedulerService already started');
            return;
        }
        logger_1.logger.info('FreerollSchedulerService started (poll every %d ms)', POLL_INTERVAL_MS);
        this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        // Run once shortly after start
        setImmediate(() => this.poll());
    }
    stop() {
        if (this.intervalId != null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger_1.logger.info('FreerollSchedulerService stopped');
        }
    }
    async poll() {
        try {
            const events = await this.getPendingEvents();
            for (const event of events) {
                try {
                    await this.tournamentService.executeScheduledEvent(event);
                }
                catch (err) {
                    logger_1.logger.error('FreerollSchedulerService: failed to execute event %s: %s', event.id, err);
                    // Optionally mark as cancelled or leave pending for retry
                }
            }
        }
        catch (err) {
            logger_1.logger.error('FreerollSchedulerService: poll error: %s', err);
        }
        // Time-based blind advances for active poker tournaments running in `by_time` mode.
        // Errors are swallowed inside the tick; this just guards against a thrown rejection.
        if (this.pokerTournamentService) {
            try {
                await this.pokerTournamentService.tickTimeBasedBlindAdvances();
            }
            catch (err) {
                logger_1.logger.error('FreerollSchedulerService: poker by_time tick error: %s', err);
            }
        }
    }
    async getPendingEvents() {
        const result = await this.pool.query('SELECT id, tournament_id, event_type, scheduled_at, metadata FROM get_pending_scheduled_events($1)', [MAX_EVENTS_PER_POLL]);
        return (result.rows || []).map((row) => ({
            id: row.id,
            tournament_id: row.tournament_id,
            event_type: row.event_type,
            scheduled_at: row.scheduled_at,
            metadata: row.metadata ?? null,
        }));
    }
}
exports.FreerollSchedulerService = FreerollSchedulerService;
//# sourceMappingURL=freeroll-scheduler.service.js.map