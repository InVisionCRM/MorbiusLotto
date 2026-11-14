/**
 * Bots-only smoke run of the 100-player MTT live test, end to end, against a LOCAL / TEST
 * Postgres (never production — the script refuses any other host unless the DB name contains
 * "test").
 *
 * Creates the event exactly as the admin endpoint does (70 'mtt' bots, 50,050 pool, top 10,
 * fees waived), starts it immediately, then drives the same loops the server runs in prod —
 * bot actions, post-hand sync (eliminations → final-table collapse / table breaking /
 * balancing), the shared by_time blind clock, the stalled-tournament sweep — until the
 * tournament completes. Level time is compressed (SMOKE_LEVEL_SECONDS of wall time per blind
 * level) and the 15 s between-hand pause is shortened so a run takes minutes, not hours.
 *
 * Checked continuously: every 'playing' entry holds exactly one seat, no table sits idle with a
 * lone survivor while the event goes on, all tables share one blind level. Checked at the end:
 * status completed, the full 50,050 pool paid to exactly 10 places in the advertised split,
 * no platform / creator fee taken.
 *
 *   cd server
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/morbius_test npx ts-node src/scripts/mtt-bots-smoke.ts
 *
 * Env: SMOKE_LEVEL_SECONDS (default 20), SMOKE_MAX_MINUTES (default 30), SMOKE_KEEP=1 keeps rows.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test'; // collapses all-in runout pacing
process.env.POKER_SERVER_BOT_THINK_MS = process.env.POKER_SERVER_BOT_THINK_MS || '200';
process.env.POKER_MTT_BOT_DAILY_FUND_CAP = process.env.POKER_MTT_BOT_DAILY_FUND_CAP || '0';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

import { Pool } from 'pg';

function resolveDbUrl(): string {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) throw new Error('Set TEST_DATABASE_URL to a local / test Postgres');
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const db = u.pathname.replace(/^\//, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !/test/.test(db)) {
    throw new Error(`Refusing to run the MTT smoke against ${host}/${db} — local or *test* databases only`);
  }
  return url;
}

async function main() {
  const url = resolveDbUrl();
  process.env.DATABASE_URL = url; // DatabaseService reads DATABASE_URL

  const { DatabaseService } = await import('../services/database.service');
  const { ProvablyFairService } = await import('../services/provably-fair.service');
  const { PokerGameService } = await import('../services/poker-game.service');
  const { TournamentService } = await import('../services/tournament.service');
  const { PokerTournamentService } = await import('../services/poker-tournament.service');
  const { PokerBotScheduleService } = await import('../services/poker-bot-schedule.service');
  const { PokerMttEventService, MTT_LIVE_TEST_DEFAULTS } = await import('../services/poker-mtt-event.service');
  const { loadPokerBotRegistry } = await import('../lib/poker-bot-registry');

  const pool = new Pool({ connectionString: url, max: 10 });
  const dbService = new DatabaseService();
  await dbService.connect();
  await loadPokerBotRegistry(pool);

  const games = new PokerGameService(dbService, new ProvablyFairService());
  games.setShowdownDelayForTesting(150);
  const tournaments = new TournamentService(pool);
  const mtt = new PokerTournamentService(pool, tournaments, games);
  tournaments.setPokerTournamentService?.(mtt);
  games.setPostHandCallback((tableId, handNumber) => mtt.syncAfterHand(tableId, handNumber));
  games.setTournamentUnderfilledRecovery((tableId) => mtt.recoverTournamentTableIfUnderTwoStackedSeats(tableId));
  const events = new PokerMttEventService(pool, mtt, new PokerBotScheduleService(pool, mtt));
  const counters = { moved: 0, broken: 0, consolidated: 0, eliminated: 0 };
  const eliminatedOnce = new Set<string>();
  const duplicateEliminations: string[] = [];
  mtt.setBroadcastCallback((_room, msg: any) => {
    if (msg.type === 'poker_tournament_player_moved') counters.moved++;
    if (msg.type === 'poker_tournament_table_broken') counters.broken++;
    if (msg.type === 'poker_tournament_table_consolidated') counters.consolidated++;
    if (msg.type === 'poker_tournament_player_eliminated') {
      counters.eliminated++;
      const a = String(msg.payload?.playerAddress ?? '').toLowerCase();
      if (eliminatedOnce.has(a)) duplicateEliminations.push(`${a} (rank ${msg.payload?.finalRank}, hand ${msg.payload?.handNumber})`);
      eliminatedOnce.add(a);
    }
  });

  const levelSeconds = Math.max(5, Number(process.env.SMOKE_LEVEL_SECONDS || 20));
  const maxMs = Math.max(1, Number(process.env.SMOKE_MAX_MINUTES || 30)) * 60_000;
  const t0 = Date.now();
  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    console.log(`[smoke +${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`, Object.keys(extra).length ? JSON.stringify(extra) : '');

  const created = await events.createLiveTest({
    startAt: new Date(Date.now() + 4 * 60_000).toISOString(),
    allowDailyOverlap: true,
    lateRegMinutes: 0,
    name: 'MTT smoke (local)',
  });
  if ('conflict' in created) throw new Error('slot conflict');
  const { tournamentId, slotKey } = created;
  log('event created', { tournamentId, botsSeated: created.botsSeated, prizePool: created.prizePool });
  if (created.botsSeated !== 70 || created.prizePool !== '50050') throw new Error('bad event setup');

  await mtt.startScheduledPokerTournament(tournamentId);
  const startTables = await pool.query(`SELECT COUNT(*)::int AS n FROM poker_tables WHERE tournament_id = $1`, [tournamentId]);
  log('started', { tables: startTables.rows[0].n });

  const failures: string[] = [];
  let lastLevelBump = Date.now();
  let lastCheck = 0;
  let lastReport = 0;
  let loneSince: Map<string, number> = new Map();
  let maxSpread = 0;
  let status = 'active';

  while (Date.now() - t0 < maxMs) {
    await games.tickServerTournamentBots().catch((e) => log('bot tick error', { e: String(e?.message ?? e) }));
    await games.autoFoldTimedOutTurns().catch(() => {});

    // Compressed blind clock: every `levelSeconds`, age the shared stamp by one level and tick.
    // A bots-only field with late reg closed runs fastEndgame 1-minute levels, so one level = 61 s.
    if (Date.now() - lastLevelBump >= levelSeconds * 1000) {
      lastLevelBump = Date.now();
      await pool.query(
        `UPDATE poker_tables SET current_blind_level_started_at = current_blind_level_started_at - INTERVAL '61 seconds'
          WHERE tournament_id = $1`,
        [tournamentId],
      );
      await mtt.tickTimeBasedBlindAdvances();
    }

    if (Date.now() - lastCheck >= 1000) {
      lastCheck = Date.now();
      await games.recoverStuckPostHandTables().catch(() => {});
      await mtt.sweepStalledTournaments().catch(() => {});
      const st = await pool.query(`SELECT status FROM tournaments WHERE id = $1`, [tournamentId]);
      status = String(st.rows[0]?.status);
      if (status !== 'active') break;

      // Invariant 1: one seat per live entry (moves insert-then-delete, so >1 is a bug; 0 = stranded).
      const seats = await pool.query<{ addr: string; n: number }>(
        `SELECT LOWER(te.player_address) AS addr,
                (SELECT COUNT(*) FROM poker_seats ps JOIN poker_tables pt ON pt.id = ps.table_id
                  WHERE pt.tournament_id = te.tournament_id AND LOWER(ps.player_address) = LOWER(te.player_address))::int AS n
           FROM tournament_entries te WHERE te.tournament_id = $1 AND te.status = 'playing'`,
        [tournamentId],
      );
      for (const r of seats.rows) {
        if (r.n !== 1) failures.push(`entry ${r.addr} holds ${r.n} seats at +${Math.round((Date.now() - t0) / 1000)}s`);
      }
      // Invariant 2: shared blind level; track table-size spread; no lone survivor stuck > 20 s.
      const tbl = await pool.query<{ id: string; seats: number; level: number; live: boolean }>(
        `SELECT pt.id, pt.current_blind_level AS level,
                (SELECT COUNT(*) FROM poker_seats ps WHERE ps.table_id = pt.id AND ps.stack > 0)::int AS seats,
                EXISTS (SELECT 1 FROM poker_hands h WHERE h.table_id = pt.id AND h.completed_at IS NULL) AS live
           FROM poker_tables pt WHERE pt.tournament_id = $1`,
        [tournamentId],
      );
      const levels = new Set(tbl.rows.map((r) => r.level));
      if (levels.size > 1) failures.push(`blind levels diverged: ${[...levels].join(',')}`);
      const sizes = tbl.rows.map((r) => r.seats).filter((n) => n > 0);
      if (sizes.length > 1) maxSpread = Math.max(maxSpread, Math.max(...sizes) - Math.min(...sizes));
      const now = Date.now();
      const nextLone = new Map<string, number>();
      for (const r of tbl.rows) {
        if (tbl.rows.length > 1 && r.seats < 2 && !r.live) {
          const since = loneSince.get(r.id) ?? now;
          nextLone.set(r.id, since);
          if (now - since > 20_000) failures.push(`table ${r.id} stuck with ${r.seats} player(s) for >20s`);
        }
      }
      loneSince = nextLone;

      if (now - lastReport > 15_000) {
        lastReport = now;
        log('progress', { players: seats.rows.length, tables: sizes.length, sizes: sizes.sort((a, b) => b - a).join('/'), level: [...levels][0], ...counters });
      }
      if (failures.length > 20) break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // Final checks.
  const t = await pool.query(`SELECT status, prize_pool::TEXT AS pool, fees_waived FROM tournaments WHERE id = $1`, [tournamentId]);
  const paid = await pool.query<{ final_rank: number; prize: string }>(
    `SELECT final_rank, prize_won::TEXT AS prize FROM tournament_entries
      WHERE tournament_id = $1 AND COALESCE(prize_won, 0) > 0 ORDER BY final_rank`,
    [tournamentId],
  );
  const fees = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM poker_chip_ledger WHERE ref_id = $1 AND reason IN ('platform_fee', 'creator_fee')`,
    [tournamentId],
  );
  const ranks = await pool.query<{ n: number; d: number }>(
    `SELECT COUNT(*)::int AS n, COUNT(DISTINCT final_rank)::int AS d FROM tournament_entries WHERE tournament_id = $1`,
    [tournamentId],
  );
  const hands = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM poker_hands WHERE tournament_id = $1`, [tournamentId]);
  const prizes = paid.rows.map((r) => BigInt(String(r.prize).split('.')[0]));
  const total = prizes.reduce((a, b) => a + b, 0n);
  const expected = MTT_LIVE_TEST_DEFAULTS.prizePercentages.map((p) => (50_050n * BigInt(p)) / 100n);

  if (t.rows[0]?.status !== 'completed') failures.push(`tournament did not complete (status ${t.rows[0]?.status}) within ${maxMs / 60_000} min`);
  if (paid.rows.length !== 10) failures.push(`expected 10 paid places, got ${paid.rows.length}`);
  if (total !== 50_050n) failures.push(`paid ${total}, expected the full 50050`);
  if (paid.rows.length === 10 && prizes.join(',') !== expected.join(',')) failures.push(`payout split ${prizes.join(',')} != ${expected.join(',')}`);
  if (fees.rows[0].n !== 0) failures.push(`${fees.rows[0].n} fee ledger rows on a fee-waived event`);

  log('result', {
    status: t.rows[0]?.status,
    hands: hands.rows[0].n,
    paid: prizes.map(String),
    entrants: ranks.rows[0].n,
    distinctRanks: ranks.rows[0].d,
    maxTableSpread: maxSpread,
    ...counters,
    duplicateEliminations,
  });

  if (!process.env.SMOKE_KEEP) {
    await pool.query(`DELETE FROM poker_tables WHERE tournament_id = $1`, [tournamentId]);
    await pool.query(`DELETE FROM tournament_scheduled_events WHERE tournament_id = $1`, [tournamentId]);
    await pool.query(`DELETE FROM tournaments WHERE id = $1`, [tournamentId]);
    await pool.query(`DELETE FROM poker_bot_scheduled_games WHERE slot_key = $1`, [slotKey]);
  }
  await pool.end();
  await dbService.disconnect?.();

  if (failures.length) {
    console.error(`SMOKE FAILED (${failures.length}):\n - ${[...new Set(failures)].slice(0, 30).join('\n - ')}`);
    process.exit(1);
  }
  console.log('SMOKE PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE CRASHED', err);
  process.exit(1);
});
