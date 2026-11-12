/**
 * Regression: 2026-11-12 1 PM Beat the Bots never ended. A human (Snev) left the tournament
 * table mid-hand; the seat row was deleted but the tournament entry stayed `playing`, so the
 * "≤1 player left" check saw 2 forever while Brunson sat alone with every chip.
 *
 * Fake-pool unit tests: orphaned `playing` entries (no seat at any tournament table) are busted
 * with finished_at = their last hand, ranked below later busts, and the stalled-table sweep
 * completes the tournament once ≤1 player remains.
 */
import { PokerTournamentService } from '../../services/poker-tournament.service';

type Q = { sql: string; params: unknown[] };

function makeService(handler: (sql: string, params: unknown[]) => { rows: any[]; rowCount?: number }) {
  const calls: Q[] = [];
  const pool = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const r = handler(sql, params);
      return { rowCount: r.rows.length, ...r };
    }),
  };
  const svc = new PokerTournamentService(pool as any, {} as any, {} as any);
  const events: any[] = [];
  svc.setBroadcastCallback((room, msg) => events.push({ room, msg }));
  return { svc, calls, events };
}

const T = '27035225-7b86-472f-8fa3-619a8de492b2';
const SNEV = '0x7d7394ed0a3c24b455e20c121e1ab8a66015a8a2';
const LEFT_AT = new Date('2026-11-12T18:15:30.093Z');

describe('bustOrphanedTournamentEntries', () => {
  it('busts a seatless playing entry, ranked by when they actually went out', async () => {
    const { svc, calls, events } = makeService((sql) => {
      if (sql.includes('NOT EXISTS') && sql.includes('poker_seats')) {
        return { rows: [{ id: 'snev-entry', player_address: SNEV, left_at: LEFT_AT }] };
      }
      if (sql.includes("status = 'playing' AND NOT (id = ANY")) return { rows: [{ c: '1' }] }; // Brunson
      if (sql.includes("status = 'busted' AND finished_at >")) return { rows: [{ c: '4' }] }; // b074,b072,Teddy,b076,b077 minus b074 same hand
      if (sql.startsWith('UPDATE tournament_entries') || sql.trim().startsWith('UPDATE tournament_entries')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const n = await svc.bustOrphanedTournamentEntries(T);
    expect(n).toBe(1);

    const upd = calls.find((c) => c.sql.includes("SET status = 'busted', chips_remaining = 0, finished_at = $2"));
    expect(upd).toBeDefined();
    expect(upd!.params).toEqual(['snev-entry', LEFT_AT, 6]); // 1 playing + 4 later busts + 1
    expect(calls.some((c) => c.sql.includes('UPDATE poker_tournament_seats SET eliminated_at'))).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].msg.type).toBe('poker_tournament_player_eliminated');
  });

  it('is a no-op when every playing entry still has a seat', async () => {
    const { svc, calls } = makeService(() => ({ rows: [] }));
    expect(await svc.bustOrphanedTournamentEntries(T)).toBe(0);
    expect(calls.filter((c) => c.sql.includes('UPDATE'))).toHaveLength(0);
  });

  it('orphan query only targets active, activated tournaments and entries past the seating grace', async () => {
    const { svc, calls } = makeService(() => ({ rows: [] }));
    await svc.bustOrphanedTournamentEntries(T);
    const sql = calls[0].sql;
    expect(sql).toContain("t.status = 'active'");
    expect(sql).toContain("te.status = 'playing'");
    expect(sql).toContain("INTERVAL '60 seconds'");
    expect(sql).toContain('pt.tournament_id = te.tournament_id');
  });
});

describe('sweepStalledTournaments', () => {
  it('completes a tournament whose table cannot deal and only one player remains', async () => {
    let playing = 2;
    const { svc } = makeService((sql) => {
      if (sql.includes('FROM poker_tables pt') && sql.includes('< 2')) {
        return { rows: [{ tournament_id: T, table_id: 'tbl' }] };
      }
      if (sql.includes('NOT EXISTS') && sql.includes('poker_seats') && sql.includes('te.player_address')) {
        return { rows: [{ id: 'snev-entry', player_address: SNEV, left_at: LEFT_AT }] };
      }
      if (sql.includes("NOT (id = ANY")) return { rows: [{ c: '1' }] };
      if (sql.includes("status = 'busted' AND finished_at >")) return { rows: [{ c: '4' }] };
      if (sql.includes("SET status = 'busted'")) { playing = 1; return { rows: [], rowCount: 1 }; }
      if (sql.includes("COUNT(*)::text AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'")) {
        return { rows: [{ c: String(playing) }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const complete = jest.spyOn(svc, 'completeTournament').mockResolvedValue(undefined);
    await svc.sweepStalledTournaments();
    expect(complete).toHaveBeenCalledWith(T, 'tbl');
  });

  it('leaves the tournament alone while 2+ players are still in', async () => {
    const { svc } = makeService((sql) => {
      if (sql.includes('FROM poker_tables pt') && sql.includes('< 2')) {
        return { rows: [{ tournament_id: T, table_id: 'tbl' }] };
      }
      if (sql.includes("status = 'playing'") && sql.includes('COUNT')) return { rows: [{ c: '2' }] };
      return { rows: [] };
    });
    const complete = jest.spyOn(svc, 'completeTournament').mockResolvedValue(undefined);
    await svc.sweepStalledTournaments();
    expect(complete).not.toHaveBeenCalled();
  });
});
