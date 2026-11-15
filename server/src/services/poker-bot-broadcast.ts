/**
 * Public, read-only MTT broadcast snapshot for the X stream (stream/ service):
 * GET /api/poker/bot-schedule/tournament/:tournamentId/broadcast
 *
 * One call returns everything the overlay + feature-table picker need: tournament meta (reusing
 * loadStreamMeta), every table (pot / all-in / showdown / biggest stack), a field-wide chip
 * leaderboard, recent eliminations and derived milestone flags. No hole cards, no balances, no
 * secrets. Cheap by design (a handful of set-based queries + a ~1 s per-tournament cache) because
 * the stream polls it every 1-2 s.
 */
import type { Pool } from 'pg';
import { loadStreamMeta, type StreamPayout } from './poker-bot-stream-meta';

const num = (v: unknown) => {
  const n = Number(String(v ?? '0').split('.')[0]);
  return Number.isFinite(n) ? n : 0;
};

export interface BroadcastFlags {
  /** players left = paid places + 1 (and the bubble can still burst: late reg closed). */
  bubble: boolean;
  /** players left <= paid places: everyone remaining is locked into at least the min cash. */
  inTheMoney: boolean;
  /** field fits on one table (<= maxSeats left) in a field that started bigger than one table. */
  finalTable: boolean;
  headsUp: boolean;
  finished: boolean;
}

/** Milestone flags from field-wide counts. Pure. */
export function computeBroadcastFlags(i: {
  status: string | null;
  entrants: number;
  playersLeft: number;
  paidPlaces: number;
  maxSeats: number;
  lateRegOpen: boolean;
}): BroadcastFlags {
  const finished = i.status === 'completed' || i.status === 'finished';
  const active = i.status === 'active' && i.playersLeft > 0;
  const paid = Math.max(0, i.paidPlaces);
  return {
    bubble: active && !i.lateRegOpen && paid > 0 && i.playersLeft === paid + 1,
    inTheMoney: (active || finished) && paid > 0 && i.playersLeft <= paid && i.entrants > paid,
    finalTable: active && i.entrants > i.maxSeats && i.playersLeft <= i.maxSeats,
    headsUp: active && i.playersLeft === 2,
    finished,
  };
}

export interface EliminationRow {
  address: string;
  name: string;
  place: number;
  /** ISO time the player busted. */
  at: string | null;
  /** payout for a paid place, else null */
  prize: number | null;
  label: string;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** "GhostCall eliminated in 14th" / "GhostCall eliminated in 7th — wins 20,006". Pure. */
export function formatElimination(name: string, place: number, prize: number | null): string {
  const base = `${name} eliminated in ${ordinal(place)}`;
  return prize != null && prize > 0 ? `${base} — wins ${prize.toLocaleString('en-US')}` : base;
}

/** Prize for a finishing place from the (fee-aware) payout ladder, else null. Pure. */
export function prizeForPlace(payouts: StreamPayout[], place: number): number | null {
  const p = payouts.find((x) => x.place === place);
  return p && p.amount > 0 ? p.amount : null;
}

export interface TableRowIn {
  id: string;
  table_seq: number | null;
  is_final_table: boolean | null;
  max_seats: number | null;
  seated: number;
  stack_total: string | number | null;
  biggest_stack: string | number | null;
  hand_number: number | null;
  pot: string | number | null;
  street: string | null;
  runout_resolved_at: Date | string | null;
  hand_completed_at: Date | string | null;
}

export interface BroadcastTable {
  tableId: string;
  tableNumber: number;
  seated: number;
  maxSeats: number;
  pot: number;
  /** preflop|flop|turn|river|showdown, or null between hands */
  phase: string | null;
  handNumber: number | null;
  allIn: boolean;
  showdown: boolean;
  biggestStack: number;
  isFinalTable: boolean;
}

/** Shape one table from its DB row + the in-memory all-in flag. Pure. */
export function shapeTable(r: TableRowIn, liveAllIn: boolean, idx: number): BroadcastTable {
  const inHand = r.hand_number != null;
  const resolved = r.runout_resolved_at != null;
  const showdown = inHand && (r.street === 'showdown' || resolved);
  return {
    tableId: String(r.id),
    tableNumber: Number(r.table_seq) || idx + 1,
    seated: Number(r.seated) || 0,
    maxSeats: Number(r.max_seats) || 10,
    pot: inHand ? num(r.pot) : 0,
    phase: inHand ? String(r.street ?? '') || null : null,
    handNumber: inHand ? Number(r.hand_number) : null,
    // runout_resolved_at = the server already locked an all-in showdown, even if the in-memory table moved on
    allIn: inHand && (liveAllIn || resolved),
    showdown,
    biggestStack: num(r.biggest_stack),
    isFinalTable: r.is_final_table === true,
  };
}

export interface BroadcastLeader { address: string; name: string; stack: number; tableNumber: number; rank: number }

export interface BroadcastSnapshot {
  tournamentId: string;
  generatedAt: string;
  tournament: {
    name: string | null;
    status: string | null;
    entrants: number;
    playersLeft: number;
    avgStack: number;
    prizePool: number;
    payouts: StreamPayout[];
    paidPlaces: number;
    lateReg: { open: boolean; endsAt: string | null };
    startedAt: string | null;
    blinds: unknown;
    actionSeconds: number;
  };
  tables: BroadcastTable[];
  leaderboard: BroadcastLeader[];
  eliminations: EliminationRow[];
  winner: { address: string; name: string; prize: number | null } | null;
  flags: BroadcastFlags;
}

/** Minimal surface of PokerGameService we need (kept narrow for tests). */
export interface LiveTableReader { getLiveTableSummary(tableId: string): { live: boolean; anyAllIn: boolean } }

const CACHE_MS = 1000;
const cache = new Map<string, { at: number; p: Promise<BroadcastSnapshot | null> }>();

/** Allowed only for tournaments in poker_bot_scheduled_games. Null = not a scheduled bot game. */
export function loadBroadcast(
  pool: Pool,
  live: LiveTableReader,
  tournamentId: string,
  nowMs = Date.now(),
): Promise<BroadcastSnapshot | null> {
  const hit = cache.get(tournamentId);
  if (hit && nowMs - hit.at < CACHE_MS) return hit.p;
  const p = buildBroadcast(pool, live, tournamentId, nowMs);
  cache.set(tournamentId, { at: nowMs, p });
  p.catch(() => { if (cache.get(tournamentId)?.p === p) cache.delete(tournamentId); });
  if (cache.size > 50) for (const k of cache.keys()) { if (k !== tournamentId) { cache.delete(k); break; } }
  return p;
}

async function buildBroadcast(pool: Pool, live: LiveTableReader, tournamentId: string, nowMs: number): Promise<BroadcastSnapshot | null> {
  const ok = await pool.query('SELECT 1 FROM poker_bot_scheduled_games WHERE tournament_id = $1 LIMIT 1', [tournamentId]);
  if (ok.rows.length === 0) return null;

  const tablesRes = await pool.query(
    `SELECT pt.id, pt.table_seq, pt.is_final_table, pt.max_seats,
            (SELECT COUNT(*) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL AND COALESCE(s.stack,0) > 0)::int AS seated,
            (SELECT COALESCE(SUM(s.stack),0) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL)::text AS stack_total,
            (SELECT COALESCE(MAX(s.stack),0) FROM poker_seats s WHERE s.table_id = pt.id AND s.player_address IS NOT NULL)::text AS biggest_stack,
            h.hand_number, h.pot_amount::text AS pot, h.street, h.runout_resolved_at, h.completed_at AS hand_completed_at
       FROM poker_tables pt
       LEFT JOIN LATERAL (
              SELECT hand_number, pot_amount, street, runout_resolved_at, completed_at
                FROM poker_hands
               WHERE table_id = pt.id
                 AND (completed_at IS NULL OR (street = 'showdown' AND completed_at > NOW() - INTERVAL '15 seconds'))
               ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1) h ON TRUE
      WHERE pt.tournament_id = $1
      ORDER BY pt.table_seq NULLS LAST, pt.created_at`,
    [tournamentId],
  );
  const tableRows = tablesRes.rows as TableRowIn[];
  const tables = tableRows.map((r, i) => shapeTable(r, live.getLiveTableSummary(String(r.id)).anyAllIn, i));
  const seqById = new Map(tables.map((t) => [t.tableId, t.tableNumber]));
  const firstTable = tables.find((t) => t.seated > 0) ?? tables[0];

  const [meta, lbRes, elimRes] = await Promise.all([
    firstTable ? loadStreamMeta(pool, firstTable.tableId, nowMs) : Promise.resolve(null),
    pool.query(
      `SELECT LOWER(s.player_address) AS addr, s.stack::text AS stack, s.table_id
         FROM poker_seats s JOIN poker_tables pt ON pt.id = s.table_id
        WHERE pt.tournament_id = $1 AND s.player_address IS NOT NULL AND COALESCE(s.stack,0) > 0
        ORDER BY s.stack DESC, s.player_address LIMIT 12`,
      [tournamentId],
    ),
    pool.query(
      `SELECT LOWER(player_address) AS addr, final_rank, finished_at
         FROM tournament_entries
        WHERE tournament_id = $1 AND final_rank IS NOT NULL
        ORDER BY (status = 'busted') DESC, finished_at DESC NULLS LAST, final_rank ASC LIMIT 20`,
      [tournamentId],
    ),
  ]);

  const t = (meta?.tournament ?? null) as Record<string, any> | null;
  const payouts: StreamPayout[] = Array.isArray(t?.payouts) ? t!.payouts : [];
  const addrs = [...new Set([...lbRes.rows.map((r: any) => r.addr), ...elimRes.rows.map((r: any) => r.addr)])];
  const names = new Map<string, string>();
  if (addrs.length) {
    const nr = await pool.query('SELECT LOWER(wallet_address) AS a, display_name FROM chat_display_names WHERE LOWER(wallet_address) = ANY($1)', [addrs]);
    for (const r of nr.rows) if (r.display_name) names.set(r.a, String(r.display_name));
  }
  const nameOf = (a: string) => names.get(a) ?? `${a.slice(0, 6)}…${a.slice(-4)}`;

  const playersLeft = Number(t?.playersLeft) || tables.reduce((n, x) => n + x.seated, 0);
  const entrants = Number(t?.entrants) || 0;
  const totalChips = tableRows.reduce((n, r) => n + num(r.stack_total), 0);
  const startedAtMs = t?.startedAt ? Date.parse(t.startedAt) : null;
  const lateEndsMs = startedAtMs != null && Number(t?.lateRegMinutes) > 0 ? startedAtMs + Number(t!.lateRegMinutes) * 60_000 : null;
  const lateRegOpen = t?.status === 'active' && lateEndsMs != null && nowMs < lateEndsMs;
  const maxSeats = tables[0]?.maxSeats ?? 10;
  const flags = computeBroadcastFlags({ status: t?.status ?? null, entrants, playersLeft, paidPlaces: payouts.length, maxSeats, lateRegOpen });

  const eliminations: EliminationRow[] = elimRes.rows
    .filter((r: any) => Number(r.final_rank) > 1 || !flags.finished)
    .map((r: any) => {
      const place = Number(r.final_rank);
      const prize = prizeForPlace(payouts, place);
      return {
        address: r.addr, name: nameOf(r.addr), place,
        at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        prize, label: formatElimination(nameOf(r.addr), place, prize),
      };
    });
  const winRow = flags.finished ? elimRes.rows.find((r: any) => Number(r.final_rank) === 1) : null;

  return {
    tournamentId,
    generatedAt: new Date(nowMs).toISOString(),
    tournament: {
      name: t?.name ?? null,
      status: t?.status ?? null,
      entrants,
      playersLeft,
      avgStack: playersLeft > 0 ? Math.round(totalChips / playersLeft) : 0,
      prizePool: Number(t?.prizePool) || 0,
      payouts,
      paidPlaces: payouts.length,
      lateReg: { open: lateRegOpen, endsAt: lateEndsMs != null ? new Date(lateEndsMs).toISOString() : null },
      startedAt: t?.startedAt ?? null,
      blinds: t?.blinds ?? null,
      actionSeconds: Number((meta as any)?.actionSeconds) || 15,
    },
    tables,
    leaderboard: lbRes.rows.map((r: any, i: number) => ({
      rank: i + 1, address: r.addr, name: nameOf(r.addr), stack: num(r.stack), tableNumber: seqById.get(String(r.table_id)) ?? 0,
    })),
    eliminations,
    winner: winRow ? { address: winRow.addr, name: nameOf(winRow.addr), prize: prizeForPlace(payouts, 1) } : null,
    flags,
  };
}
