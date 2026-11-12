/**
 * Scheduled "Beat the Bots" poker games.
 *
 * Creates a paid Sit-&-Go style poker tournament at fixed local times every day
 * (default 13:00, 17:00, 21:00 America/New_York), seats N in-house bots (default 7
 * of 10 seats) with each bot's buy-in topped up through the ledger
 * (lib/poker-bot-bankroll.ts), and leaves the remaining seats open for real players.
 * The tournament starts itself at the slot time through the existing scheduled-start
 * path (FreerollSchedulerService → startScheduledPokerTournament).
 *
 * Idempotent across restarts and multiple instances: each slot is claimed once in
 * `poker_bot_scheduled_games` (migration 200) with INSERT … ON CONFLICT DO NOTHING.
 *
 * Env (all optional except the enable flag):
 *   POKER_BOT_SCHEDULE_ENABLED=true        turn the scheduler on (default off)
 *   POKER_BOT_SCHEDULE_TIMES=13:00,17:00,21:00
 *   POKER_BOT_SCHEDULE_TZ=America/New_York
 *   POKER_BOT_SCHEDULE_LEAD_MINUTES=30     create/open registration this long before start (max 1440;
 *                                          e.g. 900 = next day's 1 PM game opens at 10 PM the night before)
 *   POKER_BOT_SCHEDULE_BOTS=7              bots seated per game
 *   POKER_BOT_SCHEDULE_SEATS=10            table size (maxPlayers)
 *   POKER_BOT_SCHEDULE_BUY_IN=500          buy-in in chips (same for bots and humans)
 *   POKER_BOT_SCHEDULE_STARTING_STACK=5000 tournament chips
 *   POKER_BOT_SCHEDULE_BLIND_MINUTES=5     by_time blind level length
 *   POKER_BOT_SCHEDULE_ACTION_SECONDS=30   per-turn clock
 *   POKER_BOT_SCHEDULE_PRIZE=top_3         prize distribution type
 *   POKER_BOT_SCHEDULE_CREATOR=0x…         creator wallet (default: first bot). Never a rake/fee wallet.
 *   POKER_BOT_SCHEDULE_CREATOR_FEE=0       creator fee percent
 *   POKER_BOT_SCHEDULE_NAME=Beat the Bots
 *   POKER_BOT_SCHEDULE_LATE_REG_MINUTES=30 humans can still join this long after the start
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import { DEFAULT_BLIND_SCHEDULE, type PokerTournamentService } from './poker-tournament.service';
import { listPokerBotAccounts } from '../lib/poker-bot-registry';
import { fundPokerBotToBalance } from '../lib/poker-bot-bankroll';

const POLL_MS = 30_000;

export interface BotScheduleConfig {
  enabled: boolean;
  times: { hh: number; mm: number; label: string }[];
  timeZone: string;
  leadMinutes: number;
  bots: number;
  seats: number;
  buyIn: bigint;
  startingStack: number;
  blindMinutes: number;
  actionSeconds: number;
  lateRegMinutes: number;
  /** Promo: humans join free, the bots' buy-ins fund the pool (POKER_BOT_SCHEDULE_FREE_ENTRY, default on). */
  freeEntry: boolean;
  prize: string;
  creator: string | null;
  creatorFee: number;
  name: string;
}

function intEnv(name: string, dflt: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return dflt;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

export function parseScheduleTimes(raw: string | undefined): { hh: number; mm: number; label: string }[] {
  const src = raw && raw.trim() ? raw : '13:00,17:00,21:00';
  const out: { hh: number; mm: number; label: string }[] = [];
  for (const part of src.split(/[,\s]+/)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) continue;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) continue;
    out.push({ hh, mm, label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` });
  }
  return out;
}

export function readBotScheduleConfig(): BotScheduleConfig {
  const flag = String(process.env.POKER_BOT_SCHEDULE_ENABLED ?? '').toLowerCase();
  const creatorRaw = process.env.POKER_BOT_SCHEDULE_CREATOR?.trim();
  let buyIn = 500n;
  try {
    if (process.env.POKER_BOT_SCHEDULE_BUY_IN?.trim()) buyIn = BigInt(process.env.POKER_BOT_SCHEDULE_BUY_IN.trim());
  } catch {
    /* keep default */
  }
  const seats = intEnv('POKER_BOT_SCHEDULE_SEATS', 10, 2, 10);
  return {
    enabled: flag === 'true' || flag === '1' || flag === 'yes',
    times: parseScheduleTimes(process.env.POKER_BOT_SCHEDULE_TIMES),
    timeZone: process.env.POKER_BOT_SCHEDULE_TZ?.trim() || 'America/New_York',
    leadMinutes: intEnv('POKER_BOT_SCHEDULE_LEAD_MINUTES', 30, 2, 1440),
    bots: Math.min(intEnv('POKER_BOT_SCHEDULE_BOTS', 7, 1, 10), seats),
    seats,
    buyIn: buyIn > 0n ? buyIn : 500n,
    startingStack: intEnv('POKER_BOT_SCHEDULE_STARTING_STACK', 5000, 100, 10_000_000),
    blindMinutes: intEnv('POKER_BOT_SCHEDULE_BLIND_MINUTES', 5, 1, 60),
    actionSeconds: intEnv('POKER_BOT_SCHEDULE_ACTION_SECONDS', 30, 10, 120),
    // Humans may still buy in this long after the start (a seat must be free).
    lateRegMinutes: intEnv('POKER_BOT_SCHEDULE_LATE_REG_MINUTES', 30, 0, 120),
    freeEntry: (process.env.POKER_BOT_SCHEDULE_FREE_ENTRY ?? 'true').trim().toLowerCase() !== 'false',
    prize: process.env.POKER_BOT_SCHEDULE_PRIZE?.trim() || 'top_3',
    creator: creatorRaw && /^0x[0-9a-fA-F]{40}$/.test(creatorRaw) ? creatorRaw.toLowerCase() : null,
    creatorFee: intEnv('POKER_BOT_SCHEDULE_CREATOR_FEE', 0, 0, 15),
    name: process.env.POKER_BOT_SCHEDULE_NAME?.trim() || 'Beat the Bots',
  };
}

/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant for a wall-clock time in `timeZone` (DST-aware). */
export function zonedToUtc(y: number, mo: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
  let off = tzOffsetMs(guess, timeZone);
  let t = guess - off;
  const off2 = tzOffsetMs(t, timeZone);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}

function localYmd(utcMs: number, timeZone: string): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(utcMs),
  );
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export interface UpcomingSlot {
  slotKey: string;
  at: Date;
}

/** Slots (today + tomorrow, local) whose start is within (now, now + horizonMs]. */
export function upcomingSlots(nowMs: number, cfg: Pick<BotScheduleConfig, 'times' | 'timeZone'>, horizonMs: number): UpcomingSlot[] {
  const out: UpcomingSlot[] = [];
  for (const dayOffset of [0, 1]) {
    const { y, m, d } = localYmd(nowMs + dayOffset * 86_400_000, cfg.timeZone);
    for (const t of cfg.times) {
      const at = zonedToUtc(y, m, d, t.hh, t.mm, cfg.timeZone);
      const ms = at.getTime();
      if (ms > nowMs && ms <= nowMs + horizonMs) {
        const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        out.push({ slotKey: `${ymd} ${t.label} ${cfg.timeZone}`, at });
      }
    }
  }
  const seen = new Set<string>();
  return out
    .filter((s) => (seen.has(s.slotKey) ? false : (seen.add(s.slotKey), true)))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Pick `n` bots, shuffled so the line-up varies game to game. */
export function pickBots(all: string[], n: number, rng: () => number = Math.random): string[] {
  const a = [...all];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}

export class PokerBotScheduleService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly pool: Pool,
    private readonly tournaments: PokerTournamentService,
    /** Optional: lets the scheduler re-deal a bot game table that stalled (e.g. after a deploy). */
    private readonly games?: { startHand(tableId: string): Promise<unknown> },
  ) {}

  start(): void {
    const cfg = readBotScheduleConfig();
    if (!cfg.enabled) {
      logger.info('[bot-schedule] disabled (POKER_BOT_SCHEDULE_ENABLED is not true)');
      return;
    }
    if (this.timer) return;
    logger.info('[bot-schedule] started', {
      times: cfg.times.map((t) => t.label),
      timeZone: cfg.timeZone,
      bots: cfg.bots,
      seats: cfg.seats,
      buyIn: cfg.buyIn.toString(),
      leadMinutes: cfg.leadMinutes,
    });
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    setImmediate(() => void this.tick());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public for tests / admin trigger. */
  async tick(nowMs = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cfg = readBotScheduleConfig();
      if (!cfg.enabled || cfg.times.length === 0) return;
      // Create once we're inside the lead window, but never less than 90 s before start
      // (createPokerTournament requires a future start, and bots need time to register).
      const slots = upcomingSlots(nowMs, cfg, cfg.leadMinutes * 60_000).filter(
        (s) => s.at.getTime() - nowMs > 90_000,
      );
      for (const slot of slots) {
        await this.createSlotGame(slot, cfg);
      }
      await this.resumeStalledTables(nowMs);
    } catch (err) {
      logger.error('[bot-schedule] tick failed', { error: (err as Error)?.message });
    } finally {
      this.busy = false;
    }
  }

  async createSlotGame(slot: UpcomingSlot, cfg: BotScheduleConfig): Promise<string | null> {
    const claim = await this.pool.query(
      `INSERT INTO poker_bot_scheduled_games (slot_key, scheduled_at) VALUES ($1, $2)
       ON CONFLICT (slot_key) DO NOTHING RETURNING slot_key`,
      [slot.slotKey, slot.at.toISOString()],
    );
    if (claim.rows.length === 0) return null; // already handled (this or another instance)

    const bots = listPokerBotAccounts('tournament').map((b) => b.walletAddress);
    if (bots.length === 0) {
      await this.markSlot(slot.slotKey, null, 'error', 'no active bots in poker_bot_accounts');
      return null;
    }
    const creator = cfg.creator ?? bots[0];
    let tournamentId: string | null = null;
    try {
      const localLabel = slot.slotKey.split(' ')[1];
      const created = await this.tournaments.createPokerTournament({
        creatorAddress: creator,
        name: `${cfg.name} ${localLabel} ET`,
        buyInAmount: cfg.buyIn,
        prizeDistributionType: cfg.prize,
        config: {
          startingStack: cfg.startingStack,
          minPlayers: 2,
          maxPlayers: cfg.seats,
          seatsPerTable: cfg.seats,
          blindSchedule: DEFAULT_BLIND_SCHEDULE,
          blindIncreaseMode: 'by_time',
          blindIntervalMinutes: cfg.blindMinutes,
          startMode: 'time',
          lateRegMinutes: cfg.lateRegMinutes,
        },
        internalHumanFreeEntry: cfg.freeEntry,
        // Heads-up / bot-only end game gets shorter blind levels so games can't drag on.
        internalFastEndgame: true,
        isPrivate: false,
        scheduledStartAt: slot.at,
        creatorFeePercent: cfg.creatorFee,
        actionTimerSeconds: cfg.actionSeconds,
      });
      tournamentId = created.tournamentId;
      await this.markSlot(slot.slotKey, tournamentId, 'created', null);
      const seated = await this.seatBots(tournamentId, pickBots(bots, cfg.bots), cfg.buyIn);
      await this.markSlot(slot.slotKey, tournamentId, seated > 0 ? 'seated' : 'created', seated > 0 ? null : 'no bots joined');
      logger.info('[bot-schedule] game created', {
        slot: slot.slotKey,
        tournamentId,
        startsAt: slot.at.toISOString(),
        botsSeated: seated,
      });
      return tournamentId;
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      logger.error('[bot-schedule] game creation failed', { slot: slot.slotKey, error: msg });
      await this.markSlot(slot.slotKey, tournamentId, 'error', msg.slice(0, 500));
      return tournamentId;
    }
  }

  /**
   * A server restart clears in-flight hands ("stale hands from previous session") and
   * loses the in-memory next-hand timer. Human tables re-deal when a player reconnects,
   * but a bot-heavy table has nobody to trigger that, so it would sit idle forever.
   * Re-deal any active scheduled-game table with no hand in progress and no hand
   * finished in the last STALL_MS (normal between-hands pause is 15 s).
   */
  async resumeStalledTables(nowMs = Date.now()): Promise<number> {
    if (!this.games) return 0;
    const STALL_MS = 60_000;
    const r = await this.pool.query(
      `SELECT pt.id AS table_id
         FROM poker_bot_scheduled_games g
         JOIN tournaments t ON t.id = g.tournament_id AND t.status = 'active'
         JOIN poker_tables pt ON pt.tournament_id = g.tournament_id
        WHERE g.scheduled_at > NOW() - INTERVAL '12 hours'
          AND g.scheduled_at < $1
          AND NOT EXISTS (SELECT 1 FROM poker_hands h WHERE h.table_id = pt.id AND h.completed_at IS NULL)
          AND COALESCE((SELECT MAX(h.completed_at) FROM poker_hands h WHERE h.table_id = pt.id), pt.created_at)
              < $1::timestamptz - ($2 * INTERVAL '1 millisecond')
          AND (SELECT COUNT(*) FROM poker_seats s WHERE s.table_id = pt.id AND s.stack > 0) >= 2`,
      [new Date(nowMs).toISOString(), STALL_MS],
    );
    let resumed = 0;
    for (const row of r.rows) {
      try {
        await this.games.startHand(String(row.table_id));
        resumed++;
        logger.info('[bot-schedule] resumed stalled bot game table', { tableId: row.table_id });
      } catch (err) {
        logger.warn('[bot-schedule] resume failed', { tableId: row.table_id, error: (err as Error)?.message });
      }
    }
    return resumed;
  }

  /** Top each bot up to the buy-in (ledgered) and register it. Returns bots seated. */
  async seatBots(tournamentId: string, bots: string[], buyIn: bigint): Promise<number> {
    let seated = 0;
    for (const bot of bots) {
      try {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await fundPokerBotToBalance(client, bot, buyIn, { type: 'tournament', id: tournamentId });
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        await this.tournaments.joinPokerTournament(tournamentId, bot);
        seated++;
      } catch (err) {
        logger.warn('[bot-schedule] bot join failed', {
          tournamentId,
          bot,
          error: (err as Error)?.message,
        });
      }
    }
    return seated;
  }

  private async markSlot(slotKey: string, tournamentId: string | null, status: string, error: string | null) {
    await this.pool
      .query(
        `UPDATE poker_bot_scheduled_games
            SET tournament_id = COALESCE($2::UUID, tournament_id), status = $3, error = $4, updated_at = NOW()
          WHERE slot_key = $1`,
        [slotKey, tournamentId, status, error],
      )
      .catch((err) => logger.warn('[bot-schedule] markSlot failed', { slotKey, error: (err as Error)?.message }));
  }

  /** Upcoming + recent scheduled games, for the stream worker / admin view. */
  async listRecent(limit = 12): Promise<
    { slotKey: string; scheduledAt: string; tournamentId: string | null; status: string; tournamentStatus: string | null; tableId: string | null }[]
  > {
    const r = await this.pool.query(
      `SELECT g.slot_key, g.scheduled_at, g.tournament_id, g.status,
              t.status AS tournament_status,
              (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = g.tournament_id
                ORDER BY pt.table_seq NULLS LAST, pt.created_at LIMIT 1) AS table_id
         FROM poker_bot_scheduled_games g
         LEFT JOIN tournaments t ON t.id = g.tournament_id
        WHERE g.scheduled_at > NOW() - INTERVAL '12 hours'
        ORDER BY g.scheduled_at ASC
        LIMIT $1`,
      [limit],
    );
    return r.rows.map((row) => ({
      slotKey: String(row.slot_key),
      scheduledAt: new Date(row.scheduled_at).toISOString(),
      tournamentId: row.tournament_id ? String(row.tournament_id) : null,
      status: String(row.status),
      tournamentStatus: row.tournament_status ? String(row.tournament_status) : null,
      tableId: row.table_id ? String(row.table_id) : null,
    }));
  }
}
