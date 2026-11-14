/**
 * 100-player MTT live test — integration (real Postgres; set TEST_DATABASE_URL to a local /
 * test DB with migrations through 203 applied — never production).
 *
 * Covers: event creation + 70-bot seating (ledgered, 'mtt' fund budget), free human entry,
 * activation layout, balancing, table breaking, lone-survivor recovery, activeTables cache
 * eviction on moves, the tournament-wide blind clock, and the fee waiver at payout.
 *
 * Run: cd server && TEST_DATABASE_URL=postgresql://…/morbius_test DATABASE_URL=$TEST_DATABASE_URL \
 *        npx jest --runInBand src/__tests__/poker/tournaments/poker-mtt-live-test.test.ts
 */
import { testPool, TEST_PLAYERS, resetTestBalances, getTestChipBalance, withRollback } from '../../setup';
import { PokerTournamentService } from '../../../services/poker-tournament.service';
import { TournamentService } from '../../../services/tournament.service';
import { PokerGameService } from '../../../services/poker-game.service';
import { DatabaseService } from '../../../services/database.service';
import { ProvablyFairService } from '../../../services/provably-fair.service';
import { PokerBotScheduleService } from '../../../services/poker-bot-schedule.service';
import { PokerMttEventService } from '../../../services/poker-mtt-event.service';
import { listPokerBotAccounts } from '../../../lib/poker-bot-registry';
import { fundPokerBotToBalance } from '../../../lib/poker-bot-bankroll';
import { getPlatformFeeWalletLower } from '../../../services/poker-chip-wallet';

let dbService: DatabaseService;
let pokerGameService: PokerGameService;
let tournamentService: TournamentService;
let svc: PokerTournamentService;
let events: PokerMttEventService;
const broadcasts: Array<{ room: string; type: string; payload: any }> = [];
const createdTournamentIds: string[] = [];
const createdSlotKeys: string[] = [];
const savedEnv: Record<string, string | undefined> = {};

const MTT_BOTS = () => listPokerBotAccounts('mtt').map((b) => b.walletAddress).sort();
const HUMANS = TEST_PLAYERS.slice(0, 9);

function futureStart(minutes = 120): string {
  // Whole-minute instants, unique per call so the idempotent slot claim never collides across tests.
  const base = Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000;
  return new Date(base + createdSlotKeys.length * 60_000).toISOString();
}

async function createEvent(extra: Record<string, unknown> = {}) {
  const r = await events.createLiveTest({ startAt: futureStart(), allowDailyOverlap: true, ...extra });
  if ('conflict' in r) throw new Error('unexpected slot conflict');
  createdTournamentIds.push(r.tournamentId);
  createdSlotKeys.push(r.slotKey);
  return r;
}

async function tables(tournamentId: string) {
  const r = await testPool.query<{ id: string; table_seq: number; seats: number; level: number; started: Date }>(
    `SELECT pt.id, pt.table_seq, pt.current_blind_level AS level, pt.current_blind_level_started_at AS started,
            (SELECT COUNT(*) FROM poker_seats ps WHERE ps.table_id = pt.id)::int AS seats
       FROM poker_tables pt WHERE pt.tournament_id = $1 ORDER BY pt.table_seq`,
    [tournamentId],
  );
  return r.rows;
}

/** The player's seat rows within this tournament (the same bots sit in other tests' events). */
async function seatsOf(tournamentId: string, address: string) {
  return testPool.query<{ table_id: string }>(
    `SELECT ps.table_id FROM poker_seats ps JOIN poker_tables pt ON pt.id = ps.table_id
      WHERE pt.tournament_id = $1 AND LOWER(ps.player_address) = LOWER($2)`,
    [tournamentId, address],
  );
}

/** Freeze every table between hands (complete the dealt hands) so post-hand paths can run. */
async function settleAllHands(tournamentId: string) {
  await testPool.query(
    `UPDATE poker_hands SET completed_at = NOW(), post_hand_processed_at = NOW()
      WHERE tournament_id = $1 AND completed_at IS NULL`,
    [tournamentId],
  );
}

/** Remove seats (and bust their entries) so a table drops to `keep` players. */
async function shrinkTable(tournamentId: string, tableId: string, keep: number) {
  const seats = await testPool.query<{ player_address: string }>(
    `SELECT player_address FROM poker_seats WHERE table_id = $1 ORDER BY position`,
    [tableId],
  );
  const drop = seats.rows.slice(keep).map((r) => r.player_address);
  if (drop.length === 0) return;
  await testPool.query(`DELETE FROM poker_seats WHERE table_id = $1 AND player_address = ANY($2::text[])`, [tableId, drop]);
  await testPool.query(
    `UPDATE tournament_entries SET status = 'busted', chips_remaining = 0, finished_at = NOW()
      WHERE tournament_id = $1 AND player_address = ANY($2::text[])`,
    [tournamentId, drop],
  );
}

async function startEvent(humans: string[] = []) {
  const ev = await createEvent();
  for (const h of humans) await svc.joinPokerTournament(ev.tournamentId, h);
  await svc.startScheduledPokerTournament(ev.tournamentId);
  return ev;
}

beforeAll(async () => {
  for (const k of ['POKER_MTT_BOT_DAILY_FUND_CAP', 'POKER_BOT_DAILY_FUND_CAP', 'POKER_BOT_BANKROLL_WALLET', 'PLATFORM_FEE_WALLET']) {
    savedEnv[k] = process.env[k];
  }
  // Re-runs on the same UTC day would otherwise hit the 60k 'mtt' budget; the cap itself is tested below.
  process.env.POKER_MTT_BOT_DAILY_FUND_CAP = '0';
  delete process.env.POKER_BOT_DAILY_FUND_CAP;
  delete process.env.POKER_BOT_BANKROLL_WALLET; // self-funded bots (production default)
  dbService = new DatabaseService();
  await dbService.connect();
  pokerGameService = new PokerGameService(dbService, new ProvablyFairService());
  tournamentService = new TournamentService(testPool);
  svc = new PokerTournamentService(testPool, tournamentService, pokerGameService);
  svc.setBroadcastCallback((room, message: any) => broadcasts.push({ room, type: message.type, payload: message.payload }));
  events = new PokerMttEventService(testPool, svc, new PokerBotScheduleService(testPool, svc));
  if (MTT_BOTS().length < 70) throw new Error('migration 203 not applied to the test DB (need 70 mtt bots)');
});

afterAll(async () => {
  // setup.ts's afterAll ends `testPool` before this one runs — clean up on the service pool.
  const db = dbService.getPool();
  for (const id of createdTournamentIds) {
    await db.query(`DELETE FROM poker_tables WHERE tournament_id = $1`, [id]).catch(() => {});
    await db.query(`DELETE FROM poker_hands WHERE tournament_id = $1`, [id]).catch(() => {});
    await db.query(`DELETE FROM tournament_scheduled_events WHERE tournament_id = $1`, [id]).catch(() => {});
    await db.query(`DELETE FROM tournaments WHERE id = $1`, [id]).catch(() => {});
  }
  await db.query(`DELETE FROM poker_bot_scheduled_games WHERE slot_key = ANY($1::text[])`, [createdSlotKeys]).catch(() => {});
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await dbService.disconnect?.();
});

beforeEach(async () => {
  broadcasts.length = 0;
  await resetTestBalances();
});

describe('MTT live test: creation + bot seating', () => {
  it('creates the 100-seat, fee-waived, free-for-humans event and seats + funds all 70 mtt bots', async () => {
    const ev = await createEvent();
    expect(ev.botsSeated).toBe(70);
    expect(ev.prizePool).toBe('50050');

    const t = await testPool.query(`SELECT * FROM tournaments WHERE id = $1`, [ev.tournamentId]);
    const row = t.rows[0];
    expect(row.status).toBe('registration');
    expect(row.name).toBe('The Morbius 100-Player Freeroll');
    expect(row.fees_waived).toBe(true);
    expect(Number(row.platform_fee_percent)).toBe(0);
    expect(Number(row.creator_fee_percent)).toBe(0);
    expect(Number(row.action_timer_seconds)).toBe(15);
    expect(Number(row.max_players)).toBe(100);
    expect(row.prize_distribution_type).toBe('custom');
    expect(row.prize_percentages).toEqual([30, 20, 14, 10, 8, 6, 4, 4, 2, 2]);
    expect(row.poker_config).toMatchObject({
      startingStack: 5000, minPlayers: 2, maxPlayers: 100, seatsPerTable: 10,
      blindIncreaseMode: 'by_time', blindIntervalMinutes: 5, startMode: 'time',
      lateRegMinutes: 45, humanFreeEntry: true, fastEndgame: true,
    });

    const entries = await testPool.query<{ player_address: string }>(
      `SELECT LOWER(player_address) AS player_address FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`,
      [ev.tournamentId],
    );
    expect(entries.rows.map((r) => r.player_address).sort()).toEqual(MTT_BOTS());
    // Never a daily ('tournament') or cash bot.
    const others = new Set(listPokerBotAccounts().filter((b) => b.role !== 'mtt').map((b) => b.walletAddress));
    expect(entries.rows.some((r) => others.has(r.player_address))).toBe(false);

    // Each bot paid exactly the 715 buy-in through the ledger.
    const buyins = await testPool.query<{ n: number; s: string }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(-delta), 0)::TEXT AS s FROM poker_chip_ledger
        WHERE reason = 'tournament_buyin' AND ref_id = $1`,
      [ev.tournamentId],
    );
    expect(buyins.rows[0].n).toBe(70);
    expect(buyins.rows[0].s.split('.')[0]).toBe('50050');

    const slot = await testPool.query(`SELECT status, tournament_id FROM poker_bot_scheduled_games WHERE slot_key = $1`, [ev.slotKey]);
    expect(slot.rows[0]).toMatchObject({ status: 'seated', tournament_id: ev.tournamentId });

    // Idempotent per start time.
    const again = await events.createLiveTest({ startAt: ev.startsAt, allowDailyOverlap: true });
    expect(again).toEqual({ conflict: 'slot_exists', slotKey: ev.slotKey });
  });

  it('humans join free (one seat per wallet) without touching the pool', async () => {
    const ev = await createEvent();
    const before = await getTestChipBalance(HUMANS[0]);
    await svc.joinPokerTournament(ev.tournamentId, HUMANS[0]);
    await svc.joinPokerTournament(ev.tournamentId, HUMANS[1]);
    expect(await getTestChipBalance(HUMANS[0])).toBe(before);
    const t = await testPool.query(`SELECT prize_pool::TEXT AS p FROM tournaments WHERE id = $1`, [ev.tournamentId]);
    expect(t.rows[0].p.split('.')[0]).toBe('50050');
    // re-join is idempotent (same entry), not a second seat
    await svc.joinPokerTournament(ev.tournamentId, HUMANS[0]);
    const n = await testPool.query(`SELECT COUNT(*)::int AS n FROM tournament_entries WHERE tournament_id = $1`, [ev.tournamentId]);
    expect(n.rows[0].n).toBe(72);
  });

  it('refuses a start time that overlaps a daily freeroll unless explicitly allowed', async () => {
    // 1:30 PM ET on some future day overlaps the 1 PM daily game.
    const d = new Date(Date.now() + 3 * 86_400_000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const { zonedToUtc } = await import('../../../services/poker-bot-schedule.service');
    const [y, m, dd] = ymd.split('-').map(Number);
    const at = zonedToUtc(y, m, dd, 13, 30, 'America/New_York');
    await expect(events.createLiveTest({ startAt: at.toISOString() })).rejects.toThrow(/overlaps the daily freeroll/);
  });
});

describe('MTT live test: activation, balancing, breaking, cache eviction', () => {
  it('activates 79 players onto 8 tables of ≤10 within one of each other, one shared blind clock', async () => {
    const ev = await startEvent(HUMANS);
    const ts = await tables(ev.tournamentId);
    expect(ts).toHaveLength(8);
    const sizes = ts.map((t) => t.seats);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(79);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(new Set(ts.map((t) => t.started.getTime())).size).toBe(1);
    expect(new Set(ts.map((t) => t.level)).size).toBe(1);
    const pts = await testPool.query(`SELECT COUNT(*)::int AS n FROM poker_tournament_seats WHERE tournament_id = $1`, [ev.tournamentId]);
    expect(pts.rows[0].n).toBe(79);
    const live = await testPool.query(
      `SELECT COUNT(DISTINCT table_id)::int AS n FROM poker_hands WHERE tournament_id = $1 AND completed_at IS NULL`,
      [ev.tournamentId],
    );
    expect(live.rows[0].n).toBe(8);
  });

  it('balances: the biggest table sends its next big blind to the shortest table and evicts caches', async () => {
    const ev = await startEvent();
    let ts = await tables(ev.tournamentId); // 70 → 7 tables of 10
    expect(ts).toHaveLength(7);
    await settleAllHands(ev.tournamentId);
    const [src, short] = [ts[0], ts[1]];
    await shrinkTable(ev.tournamentId, short.id, 7); // 10,7,10,10,10,10,10 = 67 (needs 7 tables)
    const active = (pokerGameService as any).activeTables as Map<string, unknown>;
    expect(active.has(src.id)).toBe(true);
    expect(active.has(short.id)).toBe(true);

    const btn = await testPool.query(`SELECT button_position FROM poker_tables WHERE id = $1`, [src.id]);
    const srcSeats = await testPool.query<{ position: number; player_address: string }>(
      `SELECT position, player_address FROM poker_seats WHERE table_id = $1`, [src.id]);
    const expectedBb = PokerTournamentService.nextBigBlindPosition(
      Number(btn.rows[0].button_position ?? 0), srcSeats.rows.map((r) => Number(r.position)), 10);
    const mover = srcSeats.rows.find((r) => Number(r.position) === expectedBb)!.player_address;

    const evict = jest.spyOn(pokerGameService, 'evictTableCache');
    await svc.syncAfterHand(src.id, 1);

    ts = await tables(ev.tournamentId);
    expect(ts.find((t) => t.id === src.id)!.seats).toBe(9);
    expect(ts.find((t) => t.id === short.id)!.seats).toBe(8);
    const moved = await seatsOf(ev.tournamentId, mover);
    expect(moved.rows.map((r) => r.table_id)).toEqual([short.id]);
    const pts = await testPool.query(
      `SELECT table_id FROM poker_tournament_seats WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [ev.tournamentId, mover]);
    expect(pts.rows[0].table_id).toBe(short.id);
    expect(broadcasts.some((b) => b.type === 'poker_tournament_player_moved' && b.payload.toTableId === short.id)).toBe(true);
    // both cached chevtek Tables dropped: source always, destination because it was idle
    expect(evict).toHaveBeenCalledWith(src.id);
    expect(evict).toHaveBeenCalledWith(short.id);
    evict.mockRestore();
    expect(active.has(src.id)).toBe(false);
    // the idle destination is nudged to deal, and the moved player is dealt into that hand
    let dealt: string[] = [];
    for (let i = 0; i < 40 && dealt.length === 0; i++) {
      const h = await testPool.query<{ player_address: string }>(
        `SELECT hc.player_address FROM poker_hands h JOIN poker_hand_hole_cards hc ON hc.hand_id = h.id
          WHERE h.table_id = $1 AND h.completed_at IS NULL`, [short.id]);
      dealt = h.rows.map((r) => r.player_address.toLowerCase());
      if (dealt.length === 0) await new Promise((r) => setTimeout(r, 50));
    }
    expect(dealt).toHaveLength(8);
    expect(dealt).toContain(mover.toLowerCase());
    const state = await pokerGameService.getTableState(short.id, null);
    expect(state.seats.filter((s) => s.playerAddress?.toLowerCase() === mover.toLowerCase())).toHaveLength(1);
  });

  it('does not evict a destination that is mid-hand (its live Table holds the hand)', async () => {
    const ev = await startEvent();
    const ts = await tables(ev.tournamentId);
    const [src, short] = [ts[0], ts[1]];
    // settle only the source; the destination keeps dealing
    await testPool.query(
      `UPDATE poker_hands SET completed_at = NOW(), post_hand_processed_at = NOW() WHERE table_id = $1 AND completed_at IS NULL`,
      [src.id]);
    await testPool.query(
      `DELETE FROM poker_seats WHERE table_id = $1 AND position IN (7, 8, 9)`, [short.id]); // 7 left (no bust needed for the count)
    const active = (pokerGameService as any).activeTables as Map<string, unknown>;
    await svc.syncAfterHand(src.id, 1);
    expect(active.has(src.id)).toBe(false);
    expect(active.has(short.id)).toBe(true);
    const after = await tables(ev.tournamentId);
    expect(after.find((t) => t.id === short.id)!.seats).toBe(8);
  });

  it('breaks the shortest table when the field fits on one fewer table', async () => {
    const ev = await startEvent(); // 7 × 10
    let ts = await tables(ev.tournamentId);
    await settleAllHands(ev.tournamentId);
    const victim = ts[6];
    // 60 players would fit on 6 tables: shrink two tables so victim is the shortest.
    await shrinkTable(ev.tournamentId, victim.id, 4);
    await shrinkTable(ev.tournamentId, ts[0].id, 8);
    await shrinkTable(ev.tournamentId, ts[1].id, 8); // 8,8,10,10,10,10,4 = 60
    await svc.syncAfterHand(victim.id, 1);
    ts = await tables(ev.tournamentId);
    expect(ts).toHaveLength(6);
    expect(ts.some((t) => t.id === victim.id)).toBe(false);
    expect(ts.reduce((n, t) => n + t.seats, 0)).toBe(60);
    expect(Math.max(...ts.map((t) => t.seats))).toBeLessThanOrEqual(10);
    expect(broadcasts.some((b) => b.type === 'poker_tournament_table_broken' && b.payload.brokenTableId === victim.id)).toBe(true);
    const stranded = await testPool.query(
      `SELECT COUNT(*)::int AS n FROM tournament_entries te WHERE te.tournament_id = $1 AND te.status = 'playing'
          AND NOT EXISTS (SELECT 1 FROM poker_seats ps JOIN poker_tables pt ON pt.id = ps.table_id
                           WHERE pt.tournament_id = te.tournament_id AND LOWER(ps.player_address) = LOWER(te.player_address))`,
      [ev.tournamentId]);
    expect(stranded.rows[0].n).toBe(0);
  });

  it('a lone survivor (table that cannot deal) is moved by the underfilled-table recovery', async () => {
    const ev = await startEvent();
    let ts = await tables(ev.tournamentId);
    await settleAllHands(ev.tournamentId);
    const lone = ts[3];
    await shrinkTable(ev.tournamentId, lone.id, 1);
    await shrinkTable(ev.tournamentId, ts[0].id, 9); // room elsewhere: 9,10,10,1,10,10,10 = 60 → fits on 6
    const survivor = (await testPool.query(`SELECT player_address FROM poker_seats WHERE table_id = $1`, [lone.id])).rows[0].player_address;
    await svc.recoverTournamentTableIfUnderTwoStackedSeats(lone.id);
    ts = await tables(ev.tournamentId);
    expect(ts.some((t) => t.id === lone.id)).toBe(false);
    const seat = await seatsOf(ev.tournamentId, survivor);
    expect(seat.rows).toHaveLength(1);
    expect(seat.rows[0].table_id).not.toBe(lone.id);
    const entry = await testPool.query(
      `SELECT status FROM tournament_entries WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [ev.tournamentId, survivor]);
    expect(entry.rows[0].status).toBe('playing');
  });

  it('ranks MTT busts against the whole field, not the table', async () => {
    const ev = await startEvent(); // 70 players
    const ts = await tables(ev.tournamentId);
    await settleAllHands(ev.tournamentId);
    const seat = (await testPool.query(`SELECT player_address FROM poker_seats WHERE table_id = $1 ORDER BY position LIMIT 1`, [ts[2].id])).rows[0];
    await testPool.query(`UPDATE poker_seats SET stack = 0 WHERE table_id = $1 AND player_address = $2`, [ts[2].id, seat.player_address]);
    await svc.syncAfterHand(ts[2].id, 1);
    const e = await testPool.query(
      `SELECT status, final_rank FROM tournament_entries WHERE tournament_id = $1 AND player_address = $2`,
      [ev.tournamentId, seat.player_address]);
    expect(e.rows[0]).toMatchObject({ status: 'busted', final_rank: 70 });
  });
});

describe('MTT live test: tournament-wide blind clock', () => {
  it('syncs lagging tables to the leader and advances every table with one stamp', async () => {
    const ev = await startEvent();
    const ts = await tables(ev.tournamentId);
    // Drift: table 1 is at level 3 (started 1 min ago); the rest lag at level 2 (started 4 min ago).
    await testPool.query(
      `UPDATE poker_tables SET current_blind_level = 2, current_blind_level_started_at = NOW() - INTERVAL '4 minutes',
              small_blind = 50, big_blind = 100 WHERE tournament_id = $1`, [ev.tournamentId]);
    await testPool.query(
      `UPDATE poker_tables SET current_blind_level = 3, current_blind_level_started_at = NOW() - INTERVAL '1 minute',
              small_blind = 75, big_blind = 150 WHERE id = $1`, [ts[0].id]);
    await svc.tickTimeBasedBlindAdvances();
    let after = await tables(ev.tournamentId);
    expect(new Set(after.map((t) => t.level))).toEqual(new Set([3]));
    expect(new Set(after.map((t) => t.started.getTime())).size).toBe(1);
    const blinds = await testPool.query(`SELECT DISTINCT small_blind::int AS sb, big_blind::int AS bb FROM poker_tables WHERE tournament_id = $1`, [ev.tournamentId]);
    expect(blinds.rows).toEqual([{ sb: 75, bb: 150 }]);

    // Level elapses → every table moves to level 4 together.
    await testPool.query(
      `UPDATE poker_tables SET current_blind_level_started_at = NOW() - INTERVAL '5 minutes 5 seconds' WHERE tournament_id = $1`,
      [ev.tournamentId]);
    await svc.tickTimeBasedBlindAdvances();
    after = await tables(ev.tournamentId);
    expect(new Set(after.map((t) => t.level))).toEqual(new Set([4]));
    expect(new Set(after.map((t) => t.started.getTime())).size).toBe(1);
  });

  it('fast end game looks at the whole field: bot-only tables keep the base level while a human is alive', async () => {
    const ev = await startEvent([HUMANS[0]]);
    // Late registration closed, everyone 2 minutes into level 1.
    await testPool.query(`UPDATE tournaments SET activated_at = NOW() - INTERVAL '3 hours' WHERE id = $1`, [ev.tournamentId]);
    await testPool.query(
      `UPDATE poker_tables SET current_blind_level = 1, current_blind_level_started_at = NOW() - INTERVAL '2 minutes'
        WHERE tournament_id = $1`, [ev.tournamentId]);
    await svc.tickTimeBasedBlindAdvances();
    const after = await tables(ev.tournamentId);
    // Per-table logic would have put the bot-only tables on 1-minute levels (level 3 by now).
    expect(new Set(after.map((t) => t.level))).toEqual(new Set([1]));
  });
});

describe('MTT live test: fee waiver', () => {
  async function paidSng(waived: boolean): Promise<string> {
    const created = await svc.createPokerTournament({
      creatorAddress: HUMANS[0],
      name: waived ? 'fee waiver test' : 'fee control test',
      buyInAmount: 1000n,
      prizeDistributionType: 'top_3',
      config: {
        startingStack: 5000, minPlayers: 2, maxPlayers: 3,
        blindSchedule: [{ level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 999 }],
      },
      scheduledStartAt: new Date(Date.now() + 3600_000),
      creatorFeePercent: 2,
      internalFeesWaived: waived,
    });
    createdTournamentIds.push(created.tournamentId);
    for (const h of HUMANS.slice(0, 3)) await svc.joinPokerTournament(created.tournamentId, h);
    // Finish order: HUMANS[2] out first, HUMANS[1] second, HUMANS[0] wins.
    await testPool.query(`UPDATE tournaments SET status = 'active', activated_at = NOW() WHERE id = $1`, [created.tournamentId]);
    await testPool.query(
      `UPDATE tournament_entries SET status = 'busted', chips_remaining = 0,
              finished_at = NOW() - (CASE WHEN LOWER(player_address) = LOWER($2) THEN INTERVAL '2 minutes' ELSE INTERVAL '1 minute' END)
        WHERE tournament_id = $1 AND LOWER(player_address) IN (LOWER($2), LOWER($3))`,
      [created.tournamentId, HUMANS[2], HUMANS[1]]);
    await testPool.query(
      `UPDATE tournament_entries SET chips_remaining = 15000 WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [created.tournamentId, HUMANS[0]]);
    await svc.completeTournament(created.tournamentId);
    return created.tournamentId;
  }

  async function prizes(tournamentId: string) {
    const r = await testPool.query<{ final_rank: number; prize: string }>(
      `SELECT final_rank, COALESCE(prize_won, 0)::TEXT AS prize FROM tournament_entries WHERE tournament_id = $1 ORDER BY final_rank`,
      [tournamentId]);
    return r.rows.map((x) => Number(String(x.prize).split('.')[0]));
  }

  async function feeRows(tournamentId: string) {
    const r = await testPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM poker_chip_ledger WHERE ref_id = $1 AND reason IN ('platform_fee', 'creator_fee')`,
      [tournamentId]);
    return r.rows[0].n;
  }

  it('fees_waived pays 100% of the pool to the places and takes no platform / creator fee', async () => {
    const id = await paidSng(true);
    expect(await prizes(id)).toEqual([1500, 900, 600]);
    expect(await feeRows(id)).toBe(0);
    const t = await testPool.query(`SELECT status, fees_waived FROM tournaments WHERE id = $1`, [id]);
    expect(t.rows[0]).toMatchObject({ status: 'completed', fees_waived: true });
  });

  it('control: without the waiver the old 5% cut + platform fee still apply', async () => {
    const id = await paidSng(false);
    expect(await prizes(id)).toEqual([1425, 855, 570]);
    const platform = await testPool.query<{ s: string }>(
      `SELECT COALESCE(SUM(delta), 0)::TEXT AS s FROM poker_chip_ledger WHERE ref_id = $1 AND reason = 'platform_fee' AND wallet_address = $2`,
      [id, getPlatformFeeWalletLower()]);
    expect(platform.rows[0].s.split('.')[0]).toBe('90');
  });

  it('user-created tournaments can never set the waiver (internal flag only)', async () => {
    const created = await svc.createPokerTournament({
      creatorAddress: HUMANS[0], name: 'no waiver', buyInAmount: 100n, prizeDistributionType: 'top_3',
      config: { startingStack: 5000, minPlayers: 2, maxPlayers: 3, blindSchedule: [{ level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 999 }] },
      scheduledStartAt: new Date(Date.now() + 3600_000),
      internalFeesWaived: 'yes' as unknown as boolean,
    });
    createdTournamentIds.push(created.tournamentId);
    const t = await testPool.query(`SELECT fees_waived, platform_fee_percent FROM tournaments WHERE id = $1`, [created.tournamentId]);
    expect(t.rows[0]).toMatchObject({ fees_waived: false, platform_fee_percent: 3 });
  });
});

describe('MTT bot funding budget', () => {
  async function usedToday(mtt: boolean): Promise<bigint> {
    const r = await testPool.query<{ s: string }>(
      `SELECT COALESCE(SUM(delta), 0)::TEXT AS s FROM poker_chip_ledger
        WHERE reason = 'bot_bankroll_fund' AND delta > 0
          AND wallet_address IN (SELECT wallet_address FROM poker_bot_accounts WHERE (role = 'mtt') = $1)
          AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`, [mtt]);
    return BigInt(r.rows[0].s.split('.')[0]);
  }

  it("enforces POKER_MTT_BOT_DAILY_FUND_CAP for mtt bots, independent of the daily bots' cap", async () => {
    const [b1, b2] = MTT_BOTS();
    const mttUsed = await usedToday(true);
    const dailyUsed = await usedToday(false);
    const prevMtt = process.env.POKER_MTT_BOT_DAILY_FUND_CAP;
    try {
      // The daily pool's cap is already exhausted — it must not block MTT funding.
      process.env.POKER_BOT_DAILY_FUND_CAP = String(dailyUsed > 0n ? dailyUsed : 1n);
      process.env.POKER_MTT_BOT_DAILY_FUND_CAP = String(mttUsed + 1000n);
      await withRollback(async (client) => {
        await client.query(`UPDATE player_poker_chips SET balance = 0 WHERE wallet_address = ANY($1::text[])`, [[b1, b2]]);
        const r = await fundPokerBotToBalance(client, b1, 715n);
        expect(r.funded).toBe(715n);
        await expect(fundPokerBotToBalance(client, b2, 715n)).rejects.toThrow(/MTT bot daily fund cap/);
      });
    } finally {
      process.env.POKER_MTT_BOT_DAILY_FUND_CAP = prevMtt;
      delete process.env.POKER_BOT_DAILY_FUND_CAP;
    }
  });

  it('refuses to create the event when the mtt budget cannot cover 70 buy-ins', async () => {
    const prev = process.env.POKER_MTT_BOT_DAILY_FUND_CAP;
    process.env.POKER_MTT_BOT_DAILY_FUND_CAP = '10000';
    try {
      await expect(events.createLiveTest({ startAt: futureStart(), allowDailyOverlap: true })).rejects.toThrow(/POKER_MTT_BOT_DAILY_FUND_CAP/);
    } finally {
      process.env.POKER_MTT_BOT_DAILY_FUND_CAP = prev;
    }
  });
});
