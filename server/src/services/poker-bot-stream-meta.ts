/**
 * Extra, public, read-only info for the X stream overlay + sidebars (stream/view.html):
 * tournament name/level/next-level time/payouts, open seats at the bot cash table(s),
 * and the next scheduled "Beat the Bots" game. No balances, no hole cards, no secrets.
 */
import type { Pool } from 'pg';
import { readBotScheduleConfig, upcomingSlots } from './poker-bot-schedule.service';
import { readBotCashConfig } from './poker-bot-cash.service';
import { endgameBlindIntervalMinutes } from './poker-tournament.service';
import { getPokerBotAddressSet } from '../lib/poker-bot-registry';

export interface StreamPayout {
  place: number;
  amount: number;
  percent: number;
}

/** Pool minus fees, split by percentages, floored (matches calculate_tournament_prizes). */
export function computeStreamPayouts(
  prizePool: number,
  percentages: number[],
  platformFeePct: number,
  creatorFeePct: number,
): StreamPayout[] {
  const net = Math.max(0, prizePool) * (1 - (Math.max(0, platformFeePct) + Math.max(0, creatorFeePct)) / 100);
  return percentages.map((p, i) => ({ place: i + 1, percent: p, amount: Math.floor((net * p) / 100) }));
}

export interface BlindInfo {
  level: number;
  smallBlind: number;
  bigBlind: number;
  nextLevelAt: string | null;
  nextSmallBlind: number | null;
  nextBigBlind: number | null;
}

export function computeBlindInfo(
  config: { blindSchedule?: { level: number; smallBlind: number; bigBlind: number }[]; blindIntervalMinutes?: number; blindIncreaseMode?: string } | null,
  level: number,
  levelStartedAt: Date | null,
  current: { smallBlind: number; bigBlind: number },
): BlindInfo {
  const schedule = Array.isArray(config?.blindSchedule) ? config!.blindSchedule! : [];
  const next = schedule.find((l) => Number(l.level) === level + 1) ?? null;
  const interval = Number(config?.blindIntervalMinutes);
  const byTime = String(config?.blindIncreaseMode ?? '') === 'by_time' && Number.isFinite(interval) && interval > 0;
  const nextLevelAt =
    byTime && levelStartedAt && next ? new Date(levelStartedAt.getTime() + interval * 60_000).toISOString() : null;
  return {
    level,
    smallBlind: current.smallBlind,
    bigBlind: current.bigBlind,
    nextLevelAt,
    nextSmallBlind: next ? Number(next.smallBlind) : null,
    nextBigBlind: next ? Number(next.bigBlind) : null,
  };
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '0').split('.')[0]);
  return Number.isFinite(n) ? n : 0;
};

export async function loadStreamMeta(pool: Pool, tableId: string, nowMs = Date.now()) {
  const sched = readBotScheduleConfig();
  const nextSlot = upcomingSlots(nowMs, sched, 36 * 3600_000).find((s) => s.at.getTime() > nowMs) ?? null;

  const t = await pool.query(
    `SELECT pt.max_seats, pt.small_blind, pt.big_blind, pt.current_blind_level, pt.current_blind_level_started_at,
            pt.tournament_id, t.name, t.status, t.poker_config, t.prize_pool, t.prize_percentages,
            t.platform_fee_percent, t.creator_fee_percent, t.activated_at, t.action_timer_seconds,
            (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id)::int AS entrants,
            (SELECT COUNT(*) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL
                AND COALESCE(s.stack, 0) > 0)::int AS alive,
            (SELECT COUNT(*) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL)::int AS seated,
            (SELECT array_agg(LOWER(s.player_address)) FROM poker_seats s WHERE s.table_id = pt.id
                AND s.player_address IS NOT NULL AND COALESCE(s.stack, 0) > 0) AS alive_addrs
       FROM poker_tables pt
       LEFT JOIN tournaments t ON t.id = pt.tournament_id
      WHERE pt.id = $1`,
    [tableId],
  );
  const row = t.rows[0];

  let tournament: Record<string, unknown> | null = null;
  if (row?.tournament_id) {
    const rawCfg = typeof row.poker_config === 'string' ? JSON.parse(row.poker_config) : row.poker_config;
    // Mirror the fast-endgame level length so the on-stream countdown matches the server.
    let cfg = rawCfg;
    if (rawCfg?.fastEndgame === true && Number(rawCfg?.blindIntervalMinutes) > 0) {
      const alive: string[] = (row.alive_addrs ?? []).filter(Boolean);
      let bots: Set<string> | null = null;
      try { bots = getPokerBotAddressSet(); } catch { bots = null; }
      const humansAlive = bots ? alive.filter((a) => !bots!.has(a)).length : alive.length;
      const lateRegMs = (Number(rawCfg.lateRegMinutes) || 0) * 60_000;
      const actMs = row.activated_at ? new Date(row.activated_at).getTime() : null;
      const lateRegOpen = lateRegMs > 0 && (actMs == null || nowMs < actMs + lateRegMs);
      cfg = { ...rawCfg, blindIntervalMinutes: endgameBlindIntervalMinutes(Number(rawCfg.blindIntervalMinutes), {
        fastEndgame: true, alive: alive.length, humansAlive, lateRegOpen,
      }) };
    }
    const pcts: number[] = (Array.isArray(row.prize_percentages)
      ? row.prize_percentages
      : typeof row.prize_percentages === 'string'
        ? JSON.parse(row.prize_percentages)
        : []
    ).map(Number);
    tournament = {
      name: row.name,
      status: row.status,
      freeEntry: cfg?.humanFreeEntry === true,
      lateRegMinutes: Number(cfg?.lateRegMinutes) || 0,
      startedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
      entrants: row.entrants,
      playersLeft: row.alive,
      prizePool: num(row.prize_pool),
      // calculate_tournament_prizes() (migration 127) always distributes 95% of the pool
      // (hard-coded 3% protocol + 2% creator), whatever creator_fee_percent says.
      payouts: computeStreamPayouts(num(row.prize_pool), pcts, 5, 0),
      blinds: computeBlindInfo(
        cfg,
        Math.max(1, Number(row.current_blind_level ?? 1)),
        row.current_blind_level_started_at ? new Date(row.current_blind_level_started_at) : null,
        { smallBlind: num(row.small_blind), bigBlind: num(row.big_blind) },
      ),
    };
  }

  const cashCfg = readBotCashConfig();
  let cashTables: { tableId: string; smallBlind: number; bigBlind: number; seatsOpen: number; maxSeats: number }[] = [];
  if (cashCfg.enabled) {
    const c = await pool.query(
      `SELECT pt.id, pt.small_blind, pt.big_blind, pt.max_seats,
              (SELECT COUNT(*) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL)::int AS seated
         FROM poker_bot_cash_tables c JOIN poker_tables pt ON pt.id = c.table_id
        ORDER BY c.created_at`,
    ).catch(() => ({ rows: [] as any[] }));
    cashTables = c.rows.map((r: any) => ({
      tableId: String(r.id),
      smallBlind: num(r.small_blind),
      bigBlind: num(r.big_blind),
      maxSeats: Number(r.max_seats) || 10,
      seatsOpen: Math.max(0, (Number(r.max_seats) || 10) - Number(r.seated || 0)),
    }));
  }

  return {
    kind: row?.tournament_id ? 'tournament' : 'cash',
    playUrl: 'morbius.io/poker',
    // Turn clock length for the on-stream action timer (same default as the auto-fold sweep).
    actionSeconds: Number(row?.action_timer_seconds) > 0 ? Number(row.action_timer_seconds) : 60,
    seatsOpen: row ? Math.max(0, (Number(row.max_seats) || 10) - Number(row.seated || 0)) : null,
    tournament,
    cashTables,
    nextGame: nextSlot
      ? { at: nextSlot.at.toISOString(), label: nextSlot.slotKey.split(' ')[1] ?? '', timeZone: sched.timeZone, buyIn: sched.buyIn.toString(), freeEntry: sched.freeEntry }
      : null,
  };
}
