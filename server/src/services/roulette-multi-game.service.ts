/**
 * roulette-multi-game.service.ts — the shared roulette wheel.
 *
 * The simplest of the shared tables, and deliberately so. Craps carries a
 * come-out/point cycle that survives throws and a shooter who holds the dice;
 * blackjack and Ultimate Hold'em deal every seat its own cards and need turn
 * order or per-seat clocks. Roulette has none of that. Chips go down, the wheel
 * turns, one pocket settles every bet on the felt, and the table remembers
 * nothing. What is left is the small honest core every shared table needs: a
 * betting window, a seed epoch, and per-seat money that only ever depends on
 * that seat's own chips.
 *
 * NOTHING ABOUT THE GAME IS REIMPLEMENTED HERE
 *
 * `validateRouletteBets` and `resolveRoulettePayouts` are the solo game's, used
 * unchanged. That matters for more than tidiness: a second implementation of a
 * payout table is a second thing that can be wrong, and the two would drift the
 * first time a paytable was touched. One pocket goes through one evaluator, once
 * per seat.
 *
 * WHOSE SEED SPINS THE WHEEL
 *
 * In craps the shooter supplies the client seed, which is real — holding the
 * dice genuinely changes the outcome. Roulette has no shooter, so the
 * contribution rotates: each spin is fed by one seat's client seed and the
 * pointer moves on. Every player at the table feeds the wheel in turn, and the
 * verifier can prove which seat fed any given spin.
 *
 * MONEY
 *
 * Whole chips (poker_chips), like the solo game. Chips are debited when they hit
 * the felt, not when the wheel stops, so a spin only ever credits winnings.
 * Unlike a craps place bet, roulette chips do not ride across spins — the felt
 * is swept every time — so each window's stake is settled and cleared together.
 *
 * The `roulette_multi_bet` / `roulette_multi_payout` ledger reasons end in
 * `_bet` and `_payout` on purpose: VipService and the Weekly Drop find wagers
 * with `reason LIKE '%\_bet'`, so those suffixes are what earn rakeback here.
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { applyPokerChipDelta, getPokerChipBalance } from './poker-chip-wallet';
import { betLimits } from '../lib/game-limits';
import {
  KeyedMutex,
  loadPendingSeed as loadEpochSeed,
  newServerSeed,
  nextOccupiedSeat,
  rotateSeedEpoch,
  storePendingSeed,
  type SeedEpochTables,
} from '../lib/multiplayer-table';
import { logger } from '../utils/logger';
import {
  ROULETTE_MAX_TOTAL_BET,
  ROULETTE_MAX_ZONES,
  resolveRoulettePayouts,
  rouletteResultFromFloat,
  sumRoulettePayouts,
  validateRouletteBets,
  type RouletteBet,
} from './arcade-roulette';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Seats at the rail. No turn order, so a full table costs nothing in pacing. */
export const ROULETTE_MULTI_SEAT_COUNT = 8;

/** How long chips can go down between spins. */
export const ROULETTE_MULTI_BETTING_SECONDS = 20;

/** How long the wheel is "turning" before the pocket is published. */
export const ROULETTE_MULTI_SPIN_SECONDS = 8;

/** Empty windows in a row before an idle seat gives up its chair. */
export const ROULETTE_MULTI_AFK_KICK_AFTER = 4;

/** Spins kept in the table's recent-results strip. */
export const ROULETTE_MULTI_HISTORY = 12;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export interface RouletteMultiSeatState {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  bets: RouletteBet[];
  /** Total chips this seat has on the felt right now. */
  atRisk: number;
  /** True when this seat's client seed feeds the next spin. */
  isSeedSeat: boolean;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
  lastWin: number;
  lastLoss: number;
}

export interface RouletteMultiSpin {
  spinId: string;
  result: number;
  seedPosition: number | null;
  seedAddress: string | null;
}

export interface RouletteMultiTableState {
  tableId: string;
  status: string;
  seedPosition: number | null;
  minBet: number;
  maxBet: number;
  maxTotalBet: number;
  seats: RouletteMultiSeatState[];
  seatCount: number;
  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;
  bettingStartedAt: string | null;
  spinStartedAt: string | null;
  bettingSeconds: number;
  spinSeconds: number;
  lastSpin: RouletteMultiSpin | null;
  /** Recent pockets, newest first — the board every roulette table posts. */
  spinHistory: number[];
  themeKind: string;
  themeId: string;
  themeConfig: Record<string, unknown> | null;
  stateVersion: number;
}

export interface RouletteMultiSpinHistoryRow {
  spinId: string;
  seedEpoch: number;
  nonce: number;
  result: number;
  seedPosition: number | null;
  seedAddress: string | null;
  viewerStaked: number | null;
  viewerReturned: number | null;
  createdAt: string;
}

export interface RouletteMultiTableSummary {
  id: string;
  status: string;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  themeKind: string;
  themeId: string;
  /** Newest pockets, so the lobby can show a table's recent run. */
  recent: number[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Where this game keeps its commitment, live seed and retired epochs. */
const ROULETTE_SEED_TABLES: SeedEpochTables = {
  tables: 'roulette_multi_tables',
  pending: 'roulette_multi_table_pending_seeds',
  revealed: 'roulette_multi_revealed_seeds',
};

/**
 * Two bets are the same ZONE when they are the same type over the same numbers.
 * Roulette zones are not a fixed set — a straight on 17 and a split on 17/18 are
 * different bets that no single key could name — so identity is the type plus
 * the sorted numbers, and that is what lets a second click stack chips on a
 * zone rather than opening a duplicate one.
 */
function zoneKey(bet: RouletteBet): string {
  const nums = [...(bet.numbers ?? [])].sort((a, b) => a - b).join(',');
  return `${bet.type}:${nums}`;
}

export class RouletteMultiGameService {
  private readonly tableLocks = new KeyedMutex();
  private readonly stateVersions = new Map<string, number>();
  private broadcastCallback: ((tableId: string) => Promise<void>) | null = null;

  constructor(
    private readonly dbService: DatabaseService,
    private readonly pfService: ProvablyFairService,
  ) {}

  setBroadcastCallback(cb: (tableId: string) => Promise<void>): void {
    this.broadcastCallback = cb;
  }

  private get pool(): Pool {
    return this.dbService.getPool();
  }

  private async broadcast(tableId: string, reason: string): Promise<void> {
    if (!this.broadcastCallback) return;
    try {
      await this.broadcastCallback(tableId);
    } catch (err) {
      logger.error('RouletteMulti: broadcast failed', { tableId, reason, error: (err as Error)?.message });
    }
  }

  private bumpStateVersion(tableId: string): number {
    const next = (this.stateVersions.get(tableId) ?? 0) + 1;
    this.stateVersions.set(tableId, next);
    return next;
  }

  private totalOnFelt(bets: RouletteBet[] | null | undefined): number {
    if (!Array.isArray(bets)) return 0;
    return bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }

  // -------------------------------------------------------------------------
  // Fairness
  // -------------------------------------------------------------------------

  /**
   * Retire the current seed and commit a new one.
   *
   * Unlike craps there is no mid-hand state to protect — every spin is
   * independent, so the only thing that must not be rotated through is a spin
   * already in flight, whose result is already determined by the seed being
   * replaced.
   */
  async rotateSeed(tableId: string): Promise<{ ok: boolean; error?: string }> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].status === 'spinning') throw new Error('SPIN_LIVE');

        await rotateSeedEpoch(client, ROULETTE_SEED_TABLES, tableId);
        return { ok: true as const };
      });
      await this.broadcast(tableId, 'seed_rotated');
      return out;
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return { ok: false, error: 'Table not found.' };
      if (msg === 'SPIN_LIVE') return { ok: false, error: 'Cannot rotate the seed mid-spin.' };
      logger.error('RouletteMulti: rotateSeed failed', { tableId, error: msg });
      return { ok: false, error: 'Could not rotate the seed.' };
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Lobby / admin
  // -------------------------------------------------------------------------

  async listTables(): Promise<RouletteMultiTableSummary[]> {
    const r = await this.pool.query(`
      SELECT t.id, t.status, t.min_bet, t.max_bet, t.theme_kind, t.theme_id,
             COUNT(s.id)::int AS seated,
             COALESCE(
               (SELECT ARRAY_AGG(x.result ORDER BY x.created_at DESC)
                  FROM (SELECT result, created_at FROM roulette_multi_spins
                         WHERE table_id = t.id ORDER BY created_at DESC LIMIT 6) x),
               ARRAY[]::smallint[]
             ) AS recent
        FROM roulette_multi_tables t
        LEFT JOIN roulette_multi_seats s ON s.table_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at ASC
    `);
    return r.rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      minBet: Number(row.min_bet),
      maxBet: Number(row.max_bet),
      seatedCount: Number(row.seated),
      emptySeats: ROULETTE_MULTI_SEAT_COUNT - Number(row.seated),
      themeKind: row.theme_kind,
      themeId: row.theme_id,
      recent: (row.recent ?? []).map((n: any) => Number(n)),
    }));
  }

  async createTable(minBet?: number, maxBet?: number): Promise<{ id: string }> {
    const limits = betLimits('roulette');
    const min = Math.max(1, Math.floor(Number(minBet ?? limits.min)));
    const max = Math.max(min, Math.floor(Number(maxBet ?? limits.max)));
    const seed = newServerSeed();
    const id = crypto.randomUUID();

    await this.dbService.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO roulette_multi_tables
           (id, status, min_bet, max_bet, max_total_bet, server_seed_hash)
         VALUES ($1, 'waiting', $2, $3, $4, $5)`,
        [id, min, max, Math.max(max, ROULETTE_MAX_TOTAL_BET), seed.hash],
      );
      await storePendingSeed(client, ROULETTE_SEED_TABLES, id, seed.seed);
    });
    return { id };
  }

  /**
   * Close a table and hand every live chip back.
   *
   * Refunded, never settled: the players did not choose to stop, so the house
   * does not get to keep a wager it never spun for.
   */
  async deleteTable(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      return await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT id FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) return false;

        const seats = await client.query(
          `SELECT player_address, bets FROM roulette_multi_seats WHERE table_id = $1 FOR UPDATE`,
          [tableId],
        );
        for (const seat of seats.rows) {
          const staked = this.totalOnFelt(seat.bets as RouletteBet[]);
          if (staked > 0) {
            await applyPokerChipDelta(
              client, seat.player_address, BigInt(staked), 'roulette_multi_refund',
              { type: 'roulette_multi', id: tableId },
            );
          }
        }
        await client.query(`DELETE FROM roulette_multi_tables WHERE id = $1`, [tableId]);
        return true;
      });
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Seats
  // -------------------------------------------------------------------------

  async joinTable(
    tableId: string,
    playerAddress: string,
    seatPosition: number,
    clientSeed?: string,
  ): Promise<RouletteMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const pos = Math.floor(Number(seatPosition));
    if (!Number.isFinite(pos) || pos < 0 || pos >= ROULETTE_MULTI_SEAT_COUNT) {
      throw new Error('BAD_SEAT');
    }

    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, seed_position FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');

        const existing = await client.query(
          `SELECT position FROM roulette_multi_seats
            WHERE table_id = $1 AND player_address = $2`,
          [tableId, addr],
        );
        if (existing.rows.length > 0) throw new Error('ALREADY_SEATED');

        const taken = await client.query(
          `SELECT id FROM roulette_multi_seats WHERE table_id = $1 AND position = $2`,
          [tableId, pos],
        );
        if (taken.rows.length > 0) throw new Error('SEAT_TAKEN');

        const seed = (clientSeed ?? '').trim() || crypto.randomBytes(8).toString('hex');
        await client.query(
          `INSERT INTO roulette_multi_seats (table_id, position, player_address, client_seed)
           VALUES ($1, $2, $3, $4)`,
          [tableId, pos, addr, seed],
        );

        // First one in opens the window and feeds the first spin.
        if (t.rows[0].seed_position === null) {
          await client.query(
            `UPDATE roulette_multi_tables
                SET seed_position = $1, status = 'betting', betting_started_at = NOW()
              WHERE id = $2`,
            [pos, tableId],
          );
        } else if (t.rows[0].status === 'waiting') {
          await client.query(
            `UPDATE roulette_multi_tables SET status = 'betting', betting_started_at = NOW() WHERE id = $1`,
            [tableId],
          );
        }
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'join');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  /**
   * Give up a seat, taking any live chips with you.
   *
   * Standing up before the wheel turns is not a loss — the bet was never spun
   * for, so it comes back. The seed pointer moves on if it was pointing here,
   * because a seat that has left cannot feed the next spin.
   */
  async leaveTable(tableId: string, playerAddress: string): Promise<RouletteMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const s = await client.query(
          `SELECT id, position, bets FROM roulette_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        const staked = this.totalOnFelt(s.rows[0].bets as RouletteBet[]);
        if (staked > 0) {
          await applyPokerChipDelta(
            client, addr, BigInt(staked), 'roulette_multi_refund',
            { type: 'roulette_multi', id: tableId },
          );
        }
        await client.query(`DELETE FROM roulette_multi_seats WHERE id = $1`, [s.rows[0].id]);
        await this.reseatSeedPointer(client, tableId, Number(s.rows[0].position));
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'leave');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  /**
   * Point the seed at a seat that actually exists.
   *
   * Called whenever a seat leaves. If the pointer named the departing seat it
   * moves to the next occupied one; if the table is now empty it goes null and
   * the table falls back to waiting. Leaving it dangling would mean the next
   * spin has no client seed to mix in.
   */
  private async reseatSeedPointer(
    client: PoolClient,
    tableId: string,
    vacated: number,
  ): Promise<void> {
    const t = await client.query(
      `SELECT seed_position FROM roulette_multi_tables WHERE id = $1`, [tableId],
    );
    if (t.rows.length === 0) return;
    const current = t.rows[0].seed_position === null ? null : Number(t.rows[0].seed_position);
    if (current !== vacated) return;

    const rest = await client.query(
      `SELECT position FROM roulette_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
      [tableId],
    );
    const occupied = rest.rows.map((r: any) => Number(r.position));
    if (occupied.length === 0) {
      await client.query(
        `UPDATE roulette_multi_tables
            SET seed_position = NULL, status = 'waiting', betting_started_at = NULL
          WHERE id = $1`,
        [tableId],
      );
      return;
    }
    await client.query(
      `UPDATE roulette_multi_tables SET seed_position = $1 WHERE id = $2`,
      [nextOccupiedSeat(occupied, vacated) ?? occupied[0], tableId],
    );
  }

  // -------------------------------------------------------------------------
  // Betting
  // -------------------------------------------------------------------------

  /**
   * Put chips on a zone.
   *
   * The whole bet array is revalidated after the change rather than just the
   * new chip, because roulette's limits are about the felt as a whole — a zone
   * ceiling, a zone count, and a total — and none of those can be checked one
   * click at a time.
   */
  async placeBet(
    tableId: string,
    playerAddress: string,
    bet: RouletteBet,
  ): Promise<{ bets: RouletteBet[]; chipBalance: string }> {
    const addr = playerAddress.trim().toLowerCase();
    const chips = Math.floor(Number(bet?.amount));
    if (!Number.isFinite(chips) || chips <= 0) throw new Error('BAD_AMOUNT');

    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, min_bet, max_bet, max_total_bet
             FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        const table = t.rows[0];
        if (table.status === 'spinning') throw new Error('WINDOW_CLOSED');

        const s = await client.query(
          `SELECT id, bets FROM roulette_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        const current = (s.rows[0].bets ?? []) as RouletteBet[];
        const key = zoneKey(bet);
        const next = current.map((b) => ({ ...b }));
        const hit = next.find((b) => zoneKey(b) === key);
        if (hit) hit.amount = Number(hit.amount) + chips;
        else next.push({ type: bet.type, amount: chips, numbers: bet.numbers ?? [] });

        // The solo game's validator, unchanged — shape, zone count and per-zone
        // limits all come from one place.
        const check = validateRouletteBets(next);
        if (!check.ok) throw new Error(`INVALID:${check.error}`);

        const minBet = Number(table.min_bet);
        const maxBet = Number(table.max_bet);
        const maxTotal = Number(table.max_total_bet);
        const stacked = hit ? Number(hit.amount) : chips;
        if (stacked < minBet) throw new Error('UNDER_MIN');
        if (stacked > maxBet) throw new Error('OVER_MAX');
        if (check.total > maxTotal) throw new Error('OVER_TABLE_MAX');

        const chipBalance = await applyPokerChipDelta(
          client, addr, BigInt(-chips), 'roulette_multi_bet',
          { type: 'roulette_multi', id: tableId },
        );

        await client.query(
          `UPDATE roulette_multi_seats
              SET bets = $1, consecutive_timeouts = 0, status = 'active'
            WHERE id = $2`,
          [JSON.stringify(next), s.rows[0].id],
        );
        return { bets: next, chipBalance: chipBalance.toString() };
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'bet');
      return out;
    } finally {
      release();
    }
  }

  /** Take a zone back off the felt while the window is still open. */
  async clearBet(
    tableId: string,
    playerAddress: string,
    bet: RouletteBet,
  ): Promise<{ bets: RouletteBet[]; chipBalance: string }> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].status === 'spinning') throw new Error('WINDOW_CLOSED');

        const s = await client.query(
          `SELECT id, bets FROM roulette_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        const current = (s.rows[0].bets ?? []) as RouletteBet[];
        const key = zoneKey(bet);
        const hit = current.find((b) => zoneKey(b) === key);
        if (!hit) throw new Error('NOTHING_THERE');

        const refund = Number(hit.amount) || 0;
        const next = current.filter((b) => zoneKey(b) !== key);

        const chipBalance = await applyPokerChipDelta(
          client, addr, BigInt(refund), 'roulette_multi_refund',
          { type: 'roulette_multi', id: tableId },
        );
        await client.query(
          `UPDATE roulette_multi_seats SET bets = $1 WHERE id = $2`,
          [JSON.stringify(next), s.rows[0].id],
        );
        return { bets: next, chipBalance: chipBalance.toString() };
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'clear');
      return out;
    } finally {
      release();
    }
  }

  /** Sweep every zone this player has down, in one go. */
  async clearAllBets(
    tableId: string,
    playerAddress: string,
  ): Promise<{ bets: RouletteBet[]; chipBalance: string }> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].status === 'spinning') throw new Error('WINDOW_CLOSED');

        const s = await client.query(
          `SELECT id, bets FROM roulette_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        const refund = this.totalOnFelt(s.rows[0].bets as RouletteBet[]);
        let chipBalance = await getPokerChipBalance(client, addr);
        if (refund > 0) {
          chipBalance = await applyPokerChipDelta(
            client, addr, BigInt(refund), 'roulette_multi_refund',
            { type: 'roulette_multi', id: tableId },
          );
        }
        await client.query(
          `UPDATE roulette_multi_seats SET bets = '[]'::jsonb WHERE id = $1`,
          [s.rows[0].id],
        );
        return { bets: [] as RouletteBet[], chipBalance: chipBalance.toString() };
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'clear_all');
      return out;
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // The spin
  // -------------------------------------------------------------------------

  /**
   * Turn the wheel: one pocket, every seat settled against it.
   *
   * `byAddress` is null when the clock closed the window rather than a player
   * asking. Any seated player may spin — there is no shooter to be, and making
   * the table wait on one particular seat would be inventing a rule roulette
   * does not have.
   */
  async spin(tableId: string, byAddress: string | null): Promise<RouletteMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, seed_epoch, nonce_counter, seed_position
             FROM roulette_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        const table = t.rows[0];
        if (table.status === 'spinning') throw new Error('ALREADY_SPINNING');

        const seats = await client.query(
          `SELECT id, position, player_address, bets, client_seed, consecutive_timeouts
             FROM roulette_multi_seats WHERE table_id = $1 ORDER BY position ASC FOR UPDATE`,
          [tableId],
        );
        if (seats.rows.length === 0) throw new Error('NO_PLAYERS');

        if (byAddress !== null) {
          const asker = byAddress.trim().toLowerCase();
          if (!seats.rows.some((s: any) => s.player_address === asker)) throw new Error('NOT_SEATED');
        }

        // Whose seed feeds this spin. Self-heals a dangling pointer the same way
        // craps adopts an orphaned shooter: a table whose seed seat vanished
        // must still be able to spin, or it strands every chip on the felt.
        const claimed = table.seed_position === null ? null : Number(table.seed_position);
        let seedSeat = claimed === null
          ? undefined
          : seats.rows.find((s: any) => Number(s.position) === claimed);
        if (!seedSeat) {
          seedSeat = seats.rows[0];
          logger.warn('RouletteMulti: seed seat missing, adopted by lowest seat', {
            tableId, claimed, adoptedBy: Number(seedSeat.position),
          });
        }
        const seedPosition = Number(seedSeat.position);

        const serverSeed = await loadEpochSeed(client, ROULETTE_SEED_TABLES, tableId);
        const nonce = Number(table.nonce_counter);
        const r = this.pfService.bytesToFloat(
          this.pfService.hmacByteStream(serverSeed, String(seedSeat.client_seed), nonce, 0),
        );
        const result = rouletteResultFromFloat(r);

        const spinId = crypto.randomUUID();
        await client.query(
          `INSERT INTO roulette_multi_spins
             (id, table_id, seed_epoch, nonce, seed_position, seed_address, seed_client_seed, result)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            spinId, tableId, Number(table.seed_epoch), nonce,
            seedPosition, seedSeat.player_address, String(seedSeat.client_seed), result,
          ],
        );

        // Settle each seat independently against the same pocket. Stakes left
        // the player when the chips hit the felt, so only winnings are credited.
        for (const seat of seats.rows) {
          const bets = (seat.bets ?? []) as RouletteBet[];
          const staked = this.totalOnFelt(bets);

          if (staked <= 0) {
            const next = Number(seat.consecutive_timeouts ?? 0) + 1;
            if (next >= ROULETTE_MULTI_AFK_KICK_AFTER) {
              await client.query(`DELETE FROM roulette_multi_seats WHERE id = $1`, [seat.id]);
              await this.reseatSeedPointer(client, tableId, Number(seat.position));
            } else {
              await client.query(
                `UPDATE roulette_multi_seats SET consecutive_timeouts = $1 WHERE id = $2`,
                [next, seat.id],
              );
            }
            continue;
          }

          const returned = sumRoulettePayouts(resolveRoulettePayouts(bets, result));
          if (returned > 0) {
            await applyPokerChipDelta(
              client, seat.player_address, BigInt(returned), 'roulette_multi_payout',
              { type: 'roulette_multi', id: tableId },
            );
          }

          await client.query(
            `INSERT INTO roulette_multi_spin_seats
               (spin_id, position, player_address, bets, staked, returned)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [spinId, Number(seat.position), seat.player_address, JSON.stringify(bets), staked, returned],
          );

          // The felt is swept every spin — roulette chips do not ride.
          await client.query(
            `UPDATE roulette_multi_seats SET bets = '[]'::jsonb, consecutive_timeouts = 0 WHERE id = $1`,
            [seat.id],
          );
        }

        // Hand the seed on, so the next spin is fed by a different player.
        const occupied = seats.rows.map((s: any) => Number(s.position));
        await client.query(
          `UPDATE roulette_multi_tables
              SET nonce_counter = nonce_counter + 1,
                  status = 'spinning',
                  spin_started_at = NOW(),
                  betting_started_at = NULL,
                  seed_position = $1
            WHERE id = $2`,
          [nextOccupiedSeat(occupied, seedPosition) ?? seedPosition, tableId],
        );
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'spin');
      return this.getTableState(tableId, null);
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Clocks
  // -------------------------------------------------------------------------

  /** Betting windows whose time is up — the caller spins them. */
  async closeExpiredBettingWindows(): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT t.id
         FROM roulette_multi_tables t
        WHERE t.status = 'betting'
          AND t.betting_started_at IS NOT NULL
          AND t.betting_started_at < NOW() - ($1 || ' seconds')::interval
          AND EXISTS (SELECT 1 FROM roulette_multi_seats s WHERE s.table_id = t.id)`,
      [ROULETTE_MULTI_BETTING_SECONDS],
    );
    return r.rows.map((row: any) => row.id);
  }

  /**
   * Wheels that have finished turning: reopen betting.
   *
   * The spin's result was decided the moment it was recorded — this delay only
   * paces the reveal, so the felt has time to show the ball land before chips
   * can go down again.
   */
  async reopenFinishedSpins(): Promise<string[]> {
    const r = await this.pool.query(
      `UPDATE roulette_multi_tables
          SET status = 'betting', betting_started_at = NOW(), spin_started_at = NULL
        WHERE status = 'spinning'
          AND spin_started_at IS NOT NULL
          AND spin_started_at < NOW() - ($1 || ' seconds')::interval
      RETURNING id`,
      [ROULETTE_MULTI_SPIN_SECONDS],
    );
    return r.rows.map((row: any) => row.id);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getTableState(tableId: string, viewerAddress?: string | null): Promise<RouletteMultiTableState> {
    const t = await this.pool.query(`SELECT * FROM roulette_multi_tables WHERE id = $1`, [tableId]);
    if (t.rows.length === 0) throw new Error('NOT_FOUND');
    const table = t.rows[0];

    const seatRows = await this.pool.query(`
      SELECT s.position, s.player_address, s.status, s.bets, s.consecutive_timeouts,
             p.display_name, p.profile_image_url, p.avatar_config, p.profile_display_mode
        FROM roulette_multi_seats s
        LEFT JOIN chat_display_names p ON LOWER(p.wallet_address) = s.player_address
       WHERE s.table_id = $1
       ORDER BY s.position ASC
    `, [tableId]);

    const lastSpinRow = await this.pool.query(
      `SELECT * FROM roulette_multi_spins WHERE table_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    );
    const historyRows = await this.pool.query<{ result: number }>(
      `SELECT result FROM roulette_multi_spins WHERE table_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [tableId, ROULETTE_MULTI_HISTORY],
    );

    // What the latest spin did to each seat, for the felt to animate.
    const lastSpin = lastSpinRow.rows[0] ?? null;
    const perSeat = new Map<number, { staked: number; returned: number }>();
    if (lastSpin) {
      const rs = await this.pool.query<{ position: number; staked: string; returned: string }>(
        `SELECT position, staked, returned FROM roulette_multi_spin_seats WHERE spin_id = $1`,
        [lastSpin.id],
      );
      for (const row of rs.rows) {
        perSeat.set(Number(row.position), {
          staked: Number(row.staked), returned: Number(row.returned),
        });
      }
    }

    const seedPosition = table.seed_position === null ? null : Number(table.seed_position);
    const byPosition = new Map<number, any>();
    for (const row of seatRows.rows) byPosition.set(Number(row.position), row);

    const seats: RouletteMultiSeatState[] = [];
    for (let i = 0; i < ROULETTE_MULTI_SEAT_COUNT; i++) {
      const row = byPosition.get(i);
      if (!row) {
        seats.push({
          position: i, playerAddress: null, status: 'active', bets: [], atRisk: 0,
          isSeedSeat: false, consecutiveTimeouts: 0, lastWin: 0, lastLoss: 0,
        });
        continue;
      }
      const bets = ((row.bets ?? []) as RouletteBet[]);
      const last = perSeat.get(i);
      seats.push({
        position: i,
        playerAddress: row.player_address,
        status: row.status,
        bets,
        atRisk: this.totalOnFelt(bets),
        isSeedSeat: seedPosition === i,
        consecutiveTimeouts: Number(row.consecutive_timeouts ?? 0),
        displayName: row.display_name ?? null,
        profileImageUrl: row.profile_image_url ?? null,
        avatarConfig: row.avatar_config ?? null,
        profileDisplayMode: row.profile_display_mode ?? 'avatar',
        // Net, so a seat that staked 100 and got 300 back shows +200 won.
        lastWin: last ? Math.max(0, last.returned - last.staked) : 0,
        lastLoss: last ? Math.max(0, last.staked - last.returned) : 0,
      });
    }

    return {
      tableId,
      status: table.status,
      seedPosition,
      minBet: Number(table.min_bet),
      maxBet: Number(table.max_bet),
      maxTotalBet: Number(table.max_total_bet),
      seats,
      seatCount: ROULETTE_MULTI_SEAT_COUNT,
      serverSeedHash: table.server_seed_hash ?? null,
      seedEpoch: Number(table.seed_epoch),
      nonce: Number(table.nonce_counter),
      bettingStartedAt: table.betting_started_at ? new Date(table.betting_started_at).toISOString() : null,
      spinStartedAt: table.spin_started_at ? new Date(table.spin_started_at).toISOString() : null,
      bettingSeconds: ROULETTE_MULTI_BETTING_SECONDS,
      spinSeconds: ROULETTE_MULTI_SPIN_SECONDS,
      lastSpin: lastSpin
        ? {
            spinId: lastSpin.id,
            result: Number(lastSpin.result),
            seedPosition: lastSpin.seed_position === null ? null : Number(lastSpin.seed_position),
            seedAddress: lastSpin.seed_address ?? null,
          }
        : null,
      spinHistory: historyRows.rows.map((r) => Number(r.result)),
      themeKind: table.theme_kind ?? 'image',
      themeId: table.theme_id ?? 'default',
      themeConfig: table.theme_config ?? null,
      stateVersion: this.stateVersions.get(tableId) ?? 0,
    };
  }

  /**
   * Recent spins, newest first.
   *
   * Split the way the schema splits them: what the wheel did is the same for
   * everyone, and what it cost is private to the viewer. An onlooker gets the
   * pockets and simply has no money column.
   */
  async getSpinHistory(
    tableId: string,
    limit = 25,
    viewerAddress?: string | null,
  ): Promise<RouletteMultiSpinHistoryRow[]> {
    const capped = Math.max(1, Math.min(100, Math.floor(limit) || 25));
    const viewer = viewerAddress ? viewerAddress.trim().toLowerCase() : null;

    const r = await this.pool.query(
      `SELECT sp.id, sp.seed_epoch, sp.nonce, sp.result,
              sp.seed_position, sp.seed_address, sp.created_at,
              ss.staked  AS viewer_staked,
              ss.returned AS viewer_returned
         FROM roulette_multi_spins sp
         LEFT JOIN roulette_multi_spin_seats ss
           ON ss.spin_id = sp.id AND ($2::text IS NOT NULL AND ss.player_address = $2)
        WHERE sp.table_id = $1
        ORDER BY sp.created_at DESC
        LIMIT $3`,
      [tableId, viewer, capped],
    );

    return r.rows.map((row: any) => ({
      spinId: row.id,
      seedEpoch: Number(row.seed_epoch),
      nonce: Number(row.nonce),
      result: Number(row.result),
      seedPosition: row.seed_position === null ? null : Number(row.seed_position),
      seedAddress: row.seed_address ?? null,
      viewerStaked: row.viewer_staked === null ? null : Number(row.viewer_staked),
      viewerReturned: row.viewer_returned === null ? null : Number(row.viewer_returned),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async getChipBalance(playerAddress: string): Promise<string> {
    return (await getPokerChipBalance(this.pool, playerAddress.trim().toLowerCase())).toString();
  }
}
