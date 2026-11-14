/**
 * One-shot 100-player MTT live test ("The Morbius 100-Player Freeroll").
 *
 * Creates a scheduled, multi-table poker tournament on the existing MTT engine and seats the
 * 70 dedicated 'mtt' house bots (migration 203). Humans join free (one seat per wallet); the
 * bots' buy-ins fund the pool (70 × 715 = 50,050 chips), paid in full to the top 10 — fees
 * waived (`tournaments.fees_waived`). Runs even if no human registers (minPlayers = 2).
 *
 * Reuses:
 *   - PokerTournamentService.createPokerTournament (scheduled start → FreerollScheduler activates it)
 *   - PokerBotScheduleService.seatBots (ledgered bot top-up + join), with the 'mtt' bankroll budget
 *   - poker_bot_scheduled_games as the idempotency claim — which also lets the bot scheduler's
 *     stalled-table resume (post-deploy re-deal) and the stream endpoints cover this event.
 *
 * Deliberately NOT a scheduler: nothing here runs on a timer. The daily 1 / 5 / 9 PM freerolls
 * are untouched; creation refuses a start time that would overlap one unless explicitly allowed.
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  DEFAULT_BLIND_SCHEDULE,
  normalizePokerTournamentPrizePercents,
  type PokerTournamentService,
} from './poker-tournament.service';
import { readBotScheduleConfig, zonedToUtc, type BotScheduleConfig, type PokerBotScheduleService } from './poker-bot-schedule.service';
import { listPokerBotAccounts } from '../lib/poker-bot-registry';
import { getPokerMttBotDailyFundCap } from '../lib/poker-bot-bankroll';

/** Slot-key prefix in poker_bot_scheduled_games (daily slots are "YYYY-MM-DD HH:MM tz"). */
export const MTT_LIVE_TEST_SLOT_PREFIX = 'mtt-live-test';

export interface MttLiveTestConfig {
  name: string;
  startAt: Date;
  /** Chips each bot pays; humans pay 0. */
  buyIn: bigint;
  bots: number;
  maxPlayers: number;
  seatsPerTable: number;
  startingStack: number;
  blindMinutes: number;
  lateRegMinutes: number;
  actionSeconds: number;
  /** Top-10 payout curve (index 0 = 1st), sums to 100. */
  prizePercentages: number[];
  /** Skip the "no overlap with a daily freeroll" guard. */
  allowDailyOverlap: boolean;
}

/**
 * Defaults (Kyle, Nov 2026): 100 seats on 10 tables of 10, 70 bots × 715 = 50,050 pool, top 10
 * paid in full, 5,000 stack (100 BB at 25/50), default schedule on 5-minute levels with the
 * daily game's fast end game, 45 min late reg, 15 s turn clock.
 *
 * The payout curve uses only even percentages so 50,050 splits with zero rounding loss:
 * 15,015 / 10,010 / 7,007 / 5,005 / 4,004 / 3,003 / 2,002 / 2,002 / 1,001 / 1,001.
 */
export const MTT_LIVE_TEST_DEFAULTS: Omit<MttLiveTestConfig, 'startAt'> = {
  name: 'The Morbius 100-Player Freeroll',
  buyIn: 715n,
  bots: 70,
  maxPlayers: 100,
  seatsPerTable: 10,
  startingStack: 5000,
  blindMinutes: 5,
  lateRegMinutes: 45,
  actionSeconds: 15,
  prizePercentages: [30, 20, 14, 10, 8, 6, 4, 4, 2, 2],
  allowDailyOverlap: false,
};

/** Daily-freeroll slots within this window around the MTT start are a conflict. */
export const MTT_DAILY_GUARD_BEFORE_MIN = 60;
export const MTT_DAILY_GUARD_AFTER_MIN = 150;
/** Bots need time to fund + register before the start (70 sequential joins). */
export const MTT_MIN_LEAD_MS = 3 * 60_000;

export interface MttLiveTestInput {
  startAt?: unknown;
  name?: unknown;
  lateRegMinutes?: unknown;
  allowDailyOverlap?: unknown;
  prizePercentages?: unknown;
}

function intIn(raw: unknown, dflt: number, min: number, max: number, label: string): number {
  if (raw == null || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return n;
}

/** Validate an admin request into a full config (throws with a readable message). */
export function buildMttLiveTestConfig(input: MttLiveTestInput, nowMs = Date.now()): MttLiveTestConfig {
  const startRaw = input.startAt;
  if (typeof startRaw !== 'string' && !(startRaw instanceof Date)) {
    throw new Error('startAt is required (ISO-8601 timestamp with offset, e.g. 2026-11-21T19:00:00-05:00)');
  }
  const startAt = new Date(startRaw as string);
  if (Number.isNaN(startAt.getTime())) throw new Error('startAt is not a valid timestamp');
  if (startAt.getTime() - nowMs < MTT_MIN_LEAD_MS) {
    throw new Error(`startAt must be at least ${MTT_MIN_LEAD_MS / 60_000} minutes in the future`);
  }

  let name = MTT_LIVE_TEST_DEFAULTS.name;
  if (input.name != null && input.name !== '') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) {
      throw new Error('name must be a non-empty string of at most 80 characters');
    }
    name = input.name.trim();
  }
  if (/beat\s*the\s*bots/i.test(name)) throw new Error('name must not use the "Beat the Bots" branding');

  const lateRegMinutes = intIn(input.lateRegMinutes, MTT_LIVE_TEST_DEFAULTS.lateRegMinutes, 0, 120, 'lateRegMinutes');

  let prizePercentages = MTT_LIVE_TEST_DEFAULTS.prizePercentages;
  if (input.prizePercentages != null) {
    prizePercentages = normalizePokerTournamentPrizePercents(MTT_LIVE_TEST_DEFAULTS.maxPlayers, input.prizePercentages);
  }

  return {
    ...MTT_LIVE_TEST_DEFAULTS,
    name,
    startAt,
    lateRegMinutes,
    prizePercentages,
    allowDailyOverlap: input.allowDailyOverlap === true,
  };
}

/**
 * Daily-freeroll slot instants (from the bot-schedule config, DST-aware) falling inside
 * (startAt − before, startAt + after). Empty = no collision.
 */
export function dailySlotConflicts(
  startAt: Date,
  sched: Pick<BotScheduleConfig, 'times' | 'timeZone'>,
  beforeMin = MTT_DAILY_GUARD_BEFORE_MIN,
  afterMin = MTT_DAILY_GUARD_AFTER_MIN,
): Date[] {
  const lo = startAt.getTime() - beforeMin * 60_000;
  const hi = startAt.getTime() + afterMin * 60_000;
  const out: Date[] = [];
  for (const dayOffset of [-1, 0, 1]) {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(startAt.getTime() + dayOffset * 86_400_000));
    const [y, m, d] = ymd.split('-').map(Number);
    for (const t of sched.times) {
      const at = zonedToUtc(y, m, d, t.hh, t.mm, sched.timeZone);
      if (at.getTime() > lo && at.getTime() < hi && !out.some((o) => o.getTime() === at.getTime())) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function mttLiveTestSlotKey(startAt: Date): string {
  return `${MTT_LIVE_TEST_SLOT_PREFIX} ${startAt.toISOString()}`;
}

export interface MttLiveTestResult {
  tournamentId: string;
  slotKey: string;
  startsAt: string;
  botsSeated: number;
  botsRequested: number;
  prizePool: string;
  config: Omit<MttLiveTestConfig, 'startAt' | 'buyIn'> & { buyIn: string };
}

export class PokerMttEventService {
  constructor(
    private readonly pool: Pool,
    private readonly tournaments: PokerTournamentService,
    private readonly botSchedule: Pick<PokerBotScheduleService, 'seatBots'>,
  ) {}

  /**
   * Create the live-test MTT and seat the bots. Idempotent per start time: a second call with
   * the same `startAt` returns 409-style `null` from the claim (see the route).
   */
  async createLiveTest(
    input: MttLiveTestInput,
    nowMs = Date.now(),
  ): Promise<MttLiveTestResult | { conflict: 'slot_exists'; slotKey: string }> {
    const cfg = buildMttLiveTestConfig(input, nowMs);

    if (!cfg.allowDailyOverlap) {
      const sched = readBotScheduleConfig();
      const clashes = dailySlotConflicts(cfg.startAt, sched);
      if (clashes.length > 0) {
        throw new Error(
          `startAt overlaps the daily freeroll at ${clashes.map((c) => c.toISOString()).join(', ')} ` +
            `(no daily slot may fall within ${MTT_DAILY_GUARD_BEFORE_MIN} min before / ${MTT_DAILY_GUARD_AFTER_MIN} min after the start). ` +
            'Pick another time or pass allowDailyOverlap: true.',
        );
      }
    }

    const bots = listPokerBotAccounts('mtt').map((b) => b.walletAddress).sort();
    if (bots.length < cfg.bots) {
      throw new Error(`Need ${cfg.bots} 'mtt' bots in poker_bot_accounts, found ${bots.length} — run migration 203`);
    }
    const needed = cfg.buyIn * BigInt(cfg.bots);
    const cap = getPokerMttBotDailyFundCap();
    if (cap != null && needed > cap) {
      throw new Error(`Seating ${cfg.bots} bots needs up to ${needed} chips but POKER_MTT_BOT_DAILY_FUND_CAP is ${cap}`);
    }

    const slotKey = mttLiveTestSlotKey(cfg.startAt);
    const claim = await this.pool.query(
      `INSERT INTO poker_bot_scheduled_games (slot_key, scheduled_at) VALUES ($1, $2)
       ON CONFLICT (slot_key) DO NOTHING RETURNING slot_key`,
      [slotKey, cfg.startAt.toISOString()],
    );
    if (claim.rows.length === 0) return { conflict: 'slot_exists', slotKey };

    let tournamentId: string | null = null;
    try {
      const created = await this.tournaments.createPokerTournament({
        creatorAddress: bots[0],
        name: cfg.name,
        buyInAmount: cfg.buyIn,
        prizeDistributionType: 'custom',
        prizePercentages: cfg.prizePercentages,
        config: {
          startingStack: cfg.startingStack,
          minPlayers: 2,
          maxPlayers: cfg.maxPlayers,
          seatsPerTable: cfg.seatsPerTable,
          blindSchedule: DEFAULT_BLIND_SCHEDULE,
          blindIncreaseMode: 'by_time',
          blindIntervalMinutes: cfg.blindMinutes,
          startMode: 'time',
          lateRegMinutes: cfg.lateRegMinutes,
        },
        internalHumanFreeEntry: true,
        internalFastEndgame: true,
        internalFeesWaived: true,
        isPrivate: false,
        scheduledStartAt: cfg.startAt,
        creatorFeePercent: 0,
        actionTimerSeconds: cfg.actionSeconds,
      });
      tournamentId = created.tournamentId;
      await this.markSlot(slotKey, tournamentId, 'created', null);

      const seated = await this.botSchedule.seatBots(tournamentId, bots.slice(0, cfg.bots), cfg.buyIn);
      await this.markSlot(
        slotKey,
        tournamentId,
        seated > 0 ? 'seated' : 'created',
        seated === cfg.bots ? null : `${seated}/${cfg.bots} bots joined`,
      );
      const pool = await this.pool.query<{ p: string }>(`SELECT prize_pool::TEXT AS p FROM tournaments WHERE id = $1`, [
        tournamentId,
      ]);
      logger.info('[mtt-live-test] event created', {
        tournamentId,
        slotKey,
        startsAt: cfg.startAt.toISOString(),
        botsSeated: seated,
        prizePool: pool.rows[0]?.p,
      });
      const { startAt: _s, buyIn, ...rest } = cfg;
      return {
        tournamentId,
        slotKey,
        startsAt: cfg.startAt.toISOString(),
        botsSeated: seated,
        botsRequested: cfg.bots,
        prizePool: String(pool.rows[0]?.p ?? '0').split('.')[0],
        config: { ...rest, buyIn: buyIn.toString() },
      };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      logger.error('[mtt-live-test] creation failed', { slotKey, tournamentId, error: msg });
      await this.markSlot(slotKey, tournamentId, 'error', msg.slice(0, 500));
      throw err;
    }
  }

  private async markSlot(slotKey: string, tournamentId: string | null, status: string, error: string | null) {
    await this.pool
      .query(
        `UPDATE poker_bot_scheduled_games
            SET tournament_id = COALESCE($2::UUID, tournament_id), status = $3, error = $4, updated_at = NOW()
          WHERE slot_key = $1`,
        [slotKey, tournamentId, status, error],
      )
      .catch((err) => logger.warn('[mtt-live-test] markSlot failed', { slotKey, error: (err as Error)?.message }));
  }
}
