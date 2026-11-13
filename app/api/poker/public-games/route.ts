import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * Public, read-only lobby feed for visitors without a connected wallet:
 * open/upcoming Morbius Daily Freeroll tournaments (internally the scheduled bot games) and the always-open house cash table.
 * Only aggregate, non-private data (times, counts, pool) — no wallets, no seats, no cards.
 */
export const dynamic = 'force-dynamic';

type ScheduleGame = {
  slotKey: string;
  scheduledAt: string;
  tournamentId: string | null;
  status: string;
  tournamentStatus: string | null;
};
type Schedule = { enabled: boolean; seats: number; bots: number; buyIn: string; freeEntry: boolean; games: ScheduleGame[] };
type CashFeed = {
  enabled: boolean;
  tables: { tableId: string; smallBlind: number; bigBlind: number; maxSeats: number; seated: number; seatsOpen: number }[];
};

export type PublicTournament = {
  tournamentId: string;
  name: string;
  startsAt: string;
  status: 'registration' | 'active';
  freeEntry: boolean;
  buyIn: string;
  registered: number | null;
  maxPlayers: number;
  seatsOpen: number | null;
  prizePool: string | null;
  lateRegEndsAt: string | null;
};
export type PublicCashTable = CashFeed['tables'][number];
export type PublicGamesResponse = { now: string; tournaments: PublicTournament[]; cash: PublicCashTable[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const backend = (process.env.BLACKJACK_SERVER_URL || '').trim().replace(/\/$/, '');
  if (!backend) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const [schedule, cashFeed] = await Promise.all([
    getJson<Schedule>(`${backend}/api/poker/bot-schedule`),
    getJson<CashFeed>(`${backend}/api/poker/bot-cash`),
  ]);

  const nowMs = Date.now();
  const games = (schedule?.games ?? []).filter(
    (g) =>
      g.tournamentId &&
      UUID_RE.test(g.tournamentId) &&
      (g.tournamentStatus === 'registration' || g.tournamentStatus === 'active'),
  );

  // Entry counts + pool for those tournaments (aggregates only).
  const details = new Map<string, { name: string; registered: number; maxPlayers: number; prizePool: string; lateReg: number }>();
  if (games.length > 0 && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const ids = games.map((g) => g.tournamentId as string);
      const rows = (await sql`
        SELECT t.id::text AS id, t.name, t.prize_pool::text AS prize_pool,
               COALESCE((t.poker_config->>'maxPlayers')::int, 10) AS max_players,
               COALESCE((t.poker_config->>'lateRegMinutes')::int, 0) AS late_reg,
               (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id)::int AS registered
          FROM tournaments t
         WHERE t.id = ANY(${ids}::uuid[]) AND COALESCE(t.is_private, false) = false`) as Record<string, unknown>[];
      for (const r of rows) {
        details.set(String(r.id), {
          name: String(r.name ?? ''),
          registered: Number(r.registered) || 0,
          maxPlayers: Number(r.max_players) || 10,
          prizePool: String(r.prize_pool ?? '0').split('.')[0],
          lateReg: Number(r.late_reg) || 0,
        });
      }
    } catch (err) {
      console.error('public-games: tournament details failed', (err as Error).message);
    }
  }

  const tournaments: PublicTournament[] = [];
  for (const g of games) {
    const d = details.get(g.tournamentId as string);
    const startMs = Date.parse(g.scheduledAt);
    const lateRegMin = d?.lateReg ?? 30;
    const lateRegEndsMs = startMs + lateRegMin * 60_000;
    // Active games are only listed while late registration is still open.
    if (g.tournamentStatus === 'active' && nowMs > lateRegEndsMs) continue;
    const maxPlayers = d?.maxPlayers ?? schedule?.seats ?? 10;
    const label = g.slotKey.split(' ')[1] ?? '';
    tournaments.push({
      tournamentId: g.tournamentId as string,
      name: d?.name || `The Morbius Daily Freeroll ${label} ET`,
      startsAt: new Date(startMs).toISOString(),
      status: g.tournamentStatus as 'registration' | 'active',
      freeEntry: schedule?.freeEntry ?? true,
      buyIn: schedule?.buyIn ?? '500',
      registered: d ? d.registered : null,
      maxPlayers,
      seatsOpen: d ? Math.max(0, maxPlayers - d.registered) : null,
      prizePool: d && d.prizePool !== '0' ? d.prizePool : null,
      lateRegEndsAt: lateRegMin > 0 ? new Date(lateRegEndsMs).toISOString() : null,
    });
  }
  tournaments.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const body: PublicGamesResponse = {
    now: new Date(nowMs).toISOString(),
    tournaments,
    cash: cashFeed?.enabled ? cashFeed.tables : [],
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } });
}
