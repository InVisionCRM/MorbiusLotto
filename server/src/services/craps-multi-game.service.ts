/**
 * craps-multi-game.service.ts — the shared craps felt.
 *
 * Craps is the one casino game that is genuinely worse alone. Everyone leans on
 * the same rail, backs the same shooter, and lives or dies on the same throw.
 * The solo game in arcade-craps.routes.ts throws that away; this brings it back.
 *
 * WHAT MAKES THIS DIFFERENT FROM MULTIPLAYER BLACKJACK
 *
 * Blackjack is turn-based: one player acts while everyone waits. Craps has no
 * acting player at all. Every seat bets during the same window, then ONE throw
 * settles all of them independently. That removes the hardest part of a shared
 * table (turn order, action clocks, auto-stand) and replaces it with a much
 * smaller problem: keep the table's phase authoritative, and make sure a seat's
 * money only ever depends on its own chips.
 *
 * THE INVARIANT EVERYTHING RESTS ON
 *
 * The come-out/point cycle is decided by the dice alone — never by what anyone
 * has bet (proven exhaustively in the test suite). So the table advances its
 * phase once, via advanceCrapsPhase, and each seat is settled with the SAME
 * before-phase by the same evaluator the solo game uses. Nobody's chips can
 * move the point, and no seat can disagree about where the table stands.
 *
 * MONEY
 *
 * Whole chips (poker_chips), exactly like the solo game — losses are debited
 * when the bet is placed, so a throw only ever credits winnings. That is not a
 * shortcut: a craps place bet legitimately rides across many throws, so the
 * chips genuinely leave the player when they hit the felt.
 *
 * The `craps_multi_bet` / `craps_multi_payout` ledger reasons end in `_bet` and
 * `_payout` on purpose — VipService and the Weekly Drop find wagers with
 * `reason LIKE '%\_bet'`, so those suffixes are what earn players rakeback here.
 *
 * This file deliberately does not touch blackjack-multi-game.service.ts. That
 * service carries live money; the patterns worth reusing (the keyed mutex, the
 * state version, the AFK counter) are cheap to restate and expensive to break.
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { applyPokerChipDelta, getPokerChipBalance } from './poker-chip-wallet';
import { betLimits } from '../lib/game-limits';
import { logger } from '../utils/logger';
import {
  CrapsBets,
  CrapsBetType,
  CrapsPhase,
  advanceCrapsPhase,
  canClearBet,
  canPlaceBet,
  evaluateRoll,
  isValidBetType,
  rollDiceFromSeeds,
} from './arcade-craps';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Seats on the rail. Craps has no turn order, so a full table costs no pacing. */
export const CRAPS_MULTI_SEAT_COUNT = 8;

/**
 * How long chips can go down between throws. The shooter can always cut this
 * short by throwing — "dice out" ends betting, same as a real table.
 */
export const CRAPS_MULTI_BETTING_SECONDS = 15;

/** The shooter's clock once betting closes. Past this the box throws for them. */
export const CRAPS_MULTI_ROLL_SECONDS = 20;

/**
 * Consecutive throws a seat can sit through with nothing on the felt before it
 * loses the seat. Someone watching is welcome; someone holding a seat at a busy
 * table without ever betting is not.
 */
export const CRAPS_MULTI_AFK_KICK_AFTER = 6;

// ---------------------------------------------------------------------------
// Shared per-table mutex (same shape as the blackjack multi table lock)
// ---------------------------------------------------------------------------

class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    const prevLock = this.locks.get(key) ?? Promise.resolve();
    let releaseFn!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFn = resolve; });
    this.locks.set(key, prevLock.then(() => gate));
    await prevLock;
    return releaseFn;
  }

  delete(key: string): void { this.locks.delete(key); }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrapsMultiSeatState {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  /** Live chips on the felt, per zone. */
  bets: CrapsBets;
  /** Sum of every zone — what this seat stands to lose right now. */
  atRisk: number;
  isShooter: boolean;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
  /** Winnings this seat took on the most recent throw (0 if it had nothing on). */
  lastWin: number;
  lastLoss: number;
}

export interface CrapsMultiRollSummary {
  rollId: string;
  die1: number;
  die2: number;
  sum: number;
  phaseBefore: CrapsPhase;
  phaseAfter: CrapsPhase;
  pointBefore: number | null;
  pointAfter: number | null;
  isPoint: boolean;
  isSevenOut: boolean;
  dicePassed: boolean;
  shooterPosition: number | null;
  shooterAddress: string | null;
}

export interface CrapsMultiTableState {
  tableId: string;
  status: 'waiting' | 'betting' | 'rolling';
  phase: CrapsPhase;
  point: number | null;
  shooterPosition: number | null;
  minBet: number;
  maxBet: number;
  seats: CrapsMultiSeatState[];
  seatCount: number;
  /** Commitment for the live seed epoch — the plaintext stays hidden until rotation. */
  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;
  bettingStartedAt: string | null;
  rollStartedAt: string | null;
  bettingSeconds: number;
  rollSeconds: number;
  lastRoll: CrapsMultiRollSummary | null;
  /** Most recent sums, newest first — the rail's memory. */
  rollHistory: number[];
  themeKind: string;
  themeId: string;
  themeConfig: Record<string, unknown> | null;
  stateVersion: number;
}

export interface CrapsMultiTableSummary {
  id: string;
  status: string;
  phase: CrapsPhase;
  point: number | null;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  themeKind: string;
  themeId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CrapsMultiGameService {
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
    await this.broadcastCallback(tableId).catch((err) =>
      logger.error('CrapsMulti: broadcast error', { tableId, reason, error: err }),
    );
  }

  private bumpStateVersion(tableId: string): number {
    const v = (this.stateVersions.get(tableId) ?? 0) + 1;
    this.stateVersions.set(tableId, v);
    return v;
  }

  // -------------------------------------------------------------------------
  // Seeds
  // -------------------------------------------------------------------------

  private newServerSeed(): { seed: string; hash: string } {
    const seed = crypto.randomBytes(32).toString('hex');
    const hash = '0x' + crypto.createHash('sha256').update(seed).digest('hex');
    return { seed, hash };
  }

  private async loadPendingSeed(client: PoolClient, tableId: string): Promise<string> {
    const r = await client.query<{ server_seed: string }>(
      'SELECT server_seed FROM craps_multi_table_pending_seeds WHERE table_id = $1',
      [tableId],
    );
    if (r.rows.length === 0) throw new Error('NO_LIVE_SEED');
    return r.rows[0].server_seed;
  }

  /**
   * Retire the live seed and issue a fresh one.
   *
   * The retired seed is published, so every throw made under it stays provable
   * forever even though the table never stops. Refused while the point is on:
   * rotating mid-hand would let a table swap the dice underneath a live bet.
   */
  async rotateSeed(tableId: string): Promise<{ ok: boolean; error?: string }> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT phase, seed_epoch, server_seed_hash FROM craps_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].phase === 'POINT') throw new Error('POINT_LIVE');

        const epoch = Number(t.rows[0].seed_epoch);
        const plaintext = await this.loadPendingSeed(client, tableId);

        await client.query(
          `INSERT INTO craps_multi_revealed_seeds (table_id, seed_epoch, server_seed, server_seed_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (table_id, seed_epoch) DO NOTHING`,
          [tableId, epoch, plaintext, t.rows[0].server_seed_hash],
        );

        const next = this.newServerSeed();
        await client.query(
          `UPDATE craps_multi_tables
              SET server_seed_hash = $1, seed_epoch = $2, nonce_counter = 0
            WHERE id = $3`,
          [next.hash, epoch + 1, tableId],
        );
        await client.query(
          `INSERT INTO craps_multi_table_pending_seeds (table_id, server_seed) VALUES ($1, $2)
           ON CONFLICT (table_id) DO UPDATE SET server_seed = EXCLUDED.server_seed`,
          [tableId, next.seed],
        );
        return { ok: true as const };
      });
      await this.broadcast(tableId, 'seed_rotated');
      return out;
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return { ok: false, error: 'Table not found.' };
      if (msg === 'POINT_LIVE') return { ok: false, error: 'Cannot rotate the seed while a point is on.' };
      logger.error('CrapsMulti: rotateSeed failed', { tableId, error: msg });
      return { ok: false, error: 'Could not rotate the seed.' };
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Lobby / admin
  // -------------------------------------------------------------------------

  async listTables(): Promise<CrapsMultiTableSummary[]> {
    const r = await this.pool.query(`
      SELECT t.id, t.status, t.phase, t.point, t.min_bet, t.max_bet,
             t.theme_kind, t.theme_id,
             COUNT(s.id) AS seated_count
        FROM craps_multi_tables t
        LEFT JOIN craps_multi_seats s ON s.table_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at ASC
    `);
    return r.rows.map((row) => ({
      id: row.id,
      status: row.status,
      phase: row.phase,
      point: row.point === null ? null : Number(row.point),
      minBet: Number(row.min_bet),
      maxBet: Number(row.max_bet),
      seatedCount: Number(row.seated_count),
      emptySeats: CRAPS_MULTI_SEAT_COUNT - Number(row.seated_count),
      themeKind: row.theme_kind ?? 'image',
      themeId: row.theme_id ?? 'default',
    }));
  }

  /**
   * Limits are snapshotted from the registry at creation, not read live, so an
   * admin edit can't silently rewrite the numbers posted on a running table.
   */
  async createTable(minBet?: number, maxBet?: number): Promise<{ id: string }> {
    const reg = betLimits('craps');
    const min = Math.max(1, Math.floor(minBet ?? reg.min));
    const max = Math.max(min, Math.floor(maxBet ?? reg.max));
    const seed = this.newServerSeed();

    const id = await this.dbService.withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO craps_multi_tables (min_bet, max_bet, server_seed_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [min, max, seed.hash],
      );
      const newId: string = r.rows[0].id;
      await client.query(
        `INSERT INTO craps_multi_table_pending_seeds (table_id, server_seed) VALUES ($1, $2)`,
        [newId, seed.seed],
      );
      return newId;
    });
    return { id };
  }

  /**
   * Delete a table, returning every chip resting on the felt first. Bets were
   * debited at placement, so closing a table without refunding would simply
   * keep money the house never won.
   */
  async deleteTable(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const existed = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(`SELECT id FROM craps_multi_tables WHERE id = $1 FOR UPDATE`, [tableId]);
        if (t.rows.length === 0) return false;

        const seats = await client.query(
          `SELECT player_address, bets FROM craps_multi_seats WHERE table_id = $1`, [tableId],
        );
        for (const seat of seats.rows) {
          const refund = this.totalOnFelt(seat.bets as CrapsBets);
          if (refund > 0) {
            await applyPokerChipDelta(
              client, seat.player_address, BigInt(refund), 'craps_multi_refund',
              { type: 'craps_multi', id: tableId },
            );
          }
        }
        await client.query(`DELETE FROM craps_multi_tables WHERE id = $1`, [tableId]);
        return true;
      });
      if (existed) {
        this.stateVersions.delete(tableId);
      }
      return existed;
    } finally {
      release();
      this.tableLocks.delete(tableId);
    }
  }

  // -------------------------------------------------------------------------
  // Seating
  // -------------------------------------------------------------------------

  async joinTable(
    tableId: string,
    playerAddress: string,
    seatPosition: number,
    clientSeed?: string,
  ): Promise<CrapsMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    if (!Number.isInteger(seatPosition) || seatPosition < 0 || seatPosition >= CRAPS_MULTI_SEAT_COUNT) {
      throw new Error('BAD_SEAT');
    }
    const seed = (clientSeed ?? '').trim() || crypto.randomBytes(8).toString('hex');

    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT id, shooter_position FROM craps_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');

        const taken = await client.query(
          `SELECT position, player_address FROM craps_multi_seats WHERE table_id = $1`, [tableId],
        );
        if (taken.rows.some((s: any) => s.player_address === addr)) throw new Error('ALREADY_SEATED');
        if (taken.rows.some((s: any) => Number(s.position) === seatPosition)) throw new Error('SEAT_TAKEN');

        await client.query(
          `INSERT INTO craps_multi_seats (table_id, position, player_address, client_seed)
           VALUES ($1, $2, $3, $4)`,
          [tableId, seatPosition, addr, seed],
        );

        // First player through the door picks up the dice and opens betting.
        //
        // "No shooter" has to mean a pointer that names nobody OR one that
        // names a seat that isn't there: a table whose shooter vanished while
        // it was mid-throw keeps a stale position, and if arriving players did
        // not clear it the table would stay shut — status never returns to
        // 'betting', so the newcomer can neither bet nor throw.
        const claimed = t.rows[0].shooter_position;
        const shooterPresent =
          claimed !== null && taken.rows.some((s: any) => Number(s.position) === Number(claimed));
        if (!shooterPresent) {
          await client.query(
            `UPDATE craps_multi_tables
                SET shooter_position = $1, status = 'betting', betting_started_at = NOW()
              WHERE id = $2`,
            [seatPosition, tableId],
          );
        }
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'join');
      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  async leaveTable(tableId: string, playerAddress: string): Promise<CrapsMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT shooter_position, phase FROM craps_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');

        const s = await client.query(
          `SELECT id, position, bets FROM craps_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        // Chips on the felt come back — they were debited when placed.
        const refund = this.totalOnFelt(s.rows[0].bets as CrapsBets);
        if (refund > 0) {
          await applyPokerChipDelta(
            client, addr, BigInt(refund), 'craps_multi_refund',
            { type: 'craps_multi', id: tableId },
          );
        }
        await client.query(`DELETE FROM craps_multi_seats WHERE id = $1`, [s.rows[0].id]);

        // If the shooter walked, the dice pass on rather than stranding the table.
        if (Number(t.rows[0].shooter_position) === Number(s.rows[0].position)) {
          await this.passDiceTo(client, tableId, Number(s.rows[0].position));
        }
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'leave');
      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Betting
  // -------------------------------------------------------------------------

  async placeBet(
    tableId: string,
    playerAddress: string,
    type: CrapsBetType,
    amount: number,
  ): Promise<{ bets: CrapsBets; chipBalance: string }> {
    const addr = playerAddress.trim().toLowerCase();
    if (!isValidBetType(type)) throw new Error('BAD_BET_TYPE');
    const chips = Math.floor(Number(amount));
    if (!Number.isFinite(chips) || chips <= 0) throw new Error('BAD_AMOUNT');

    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, phase, min_bet, max_bet FROM craps_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        const table = t.rows[0];

        // Betting is shut once the dice are out — no late money on a throw.
        if (table.status === 'rolling') throw new Error('WINDOW_CLOSED');

        const phase: CrapsPhase = table.phase;
        if (!canPlaceBet(type, phase)) throw new Error('LOCKED');

        const minBet = Number(table.min_bet);
        const maxBet = Number(table.max_bet);
        if (chips < minBet) throw new Error('UNDER_MIN');

        const s = await client.query(
          `SELECT id, bets FROM craps_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');
        const bets = s.rows[0].bets as CrapsBets;

        // Same rule as the solo game: the cap is on the TOTAL resting on a zone,
        // because craps bets accumulate and a per-click check is no cap at all.
        const resting = Number(bets[type] || 0);
        if (resting + chips > maxBet) throw new Error('OVER_MAX');

        const chipBalance = await applyPokerChipDelta(
          client, addr, BigInt(-chips), 'craps_multi_bet',
          { type: 'craps_multi', id: tableId },
        );

        const nextBets: CrapsBets = { ...bets, [type]: resting + chips };
        await client.query(
          `UPDATE craps_multi_seats SET bets = $1, consecutive_timeouts = 0, status = 'active' WHERE id = $2`,
          [JSON.stringify(nextBets), s.rows[0].id],
        );
        return { bets: nextBets, chipBalance: chipBalance.toString() };
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'bet');
      return out;
    } finally {
      release();
    }
  }

  async clearBet(
    tableId: string,
    playerAddress: string,
    type: CrapsBetType,
  ): Promise<{ bets: CrapsBets; chipBalance: string }> {
    const addr = playerAddress.trim().toLowerCase();
    if (!isValidBetType(type)) throw new Error('BAD_BET_TYPE');

    const release = await this.tableLocks.acquire(tableId);
    try {
      const out = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, phase FROM craps_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].status === 'rolling') throw new Error('WINDOW_CLOSED');
        if (!canClearBet(type, t.rows[0].phase as CrapsPhase)) throw new Error('LOCKED');

        const s = await client.query(
          `SELECT id, bets FROM craps_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        const bets = { ...(s.rows[0].bets as CrapsBets) };
        const resting = Number(bets[type] || 0);
        if (resting <= 0) throw new Error('NOTHING_THERE');
        delete bets[type];

        const chipBalance = await applyPokerChipDelta(
          client, addr, BigInt(resting), 'craps_multi_refund',
          { type: 'craps_multi', id: tableId },
        );
        await client.query(`UPDATE craps_multi_seats SET bets = $1 WHERE id = $2`,
          [JSON.stringify(bets), s.rows[0].id]);
        return { bets, chipBalance: chipBalance.toString() };
      });
      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'clear');
      return out;
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // The throw
  // -------------------------------------------------------------------------

  /**
   * Throw the dice and settle the whole table.
   *
   * `byAddress` is null when the box throws for an absent shooter. Only the
   * shooter may throw otherwise — that is the entire point of holding the dice.
   */
  async roll(tableId: string, byAddress: string | null): Promise<CrapsMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, phase, point, shooter_position, seed_epoch, nonce_counter
             FROM craps_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        const table = t.rows[0];

        const seats = await client.query(
          `SELECT id, position, player_address, bets, client_seed, consecutive_timeouts
             FROM craps_multi_seats WHERE table_id = $1 ORDER BY position ASC FOR UPDATE`,
          [tableId],
        );

        const claimed: number | null =
          table.shooter_position === null ? null : Number(table.shooter_position);
        let shooterSeat = claimed === null
          ? undefined
          : seats.rows.find((s: any) => Number(s.position) === claimed);

        // Self-heal a dangling shooter. If the pointer names a seat that is no
        // longer there, the lowest occupied seat picks the dice up rather than
        // the throw failing. Without this a table whose shooter vanished can
        // never throw again, and because a failed throw leaves it in 'rolling',
        // betting never reopens either — the table is bricked with players'
        // chips still on the felt. Cheap to do, and it recovers any table that
        // was already stranded before this guard existed.
        if (!shooterSeat && seats.rows.length > 0) {
          shooterSeat = seats.rows[0];
          await client.query(
            `UPDATE craps_multi_tables SET shooter_position = $1 WHERE id = $2`,
            [Number(shooterSeat.position), tableId],
          );
          logger.warn('CrapsMulti: shooter seat was missing, dice adopted by lowest seat', {
            tableId, claimed, adoptedBy: Number(shooterSeat.position),
          });
        }
        if (!shooterSeat) throw new Error('NO_SHOOTER');

        const shooterPosition = Number(shooterSeat.position);

        if (byAddress !== null && shooterSeat.player_address !== byAddress.trim().toLowerCase()) {
          throw new Error('NOT_SHOOTER');
        }

        const serverSeed = await this.loadPendingSeed(client, tableId);
        const nonce = Number(table.nonce_counter);
        const [die1, die2] = rollDiceFromSeeds(
          this.pfService, serverSeed, String(shooterSeat.client_seed), nonce,
        );
        const sum = die1 + die2;

        const phaseBefore: CrapsPhase = table.phase;
        const pointBefore: number | null = table.point === null ? null : Number(table.point);

        // The table's own transition — computed once, from the dice alone.
        const change = advanceCrapsPhase(sum, phaseBefore, pointBefore);

        const rollId = crypto.randomUUID();
        // Seven-out passes the dice. Making the point does NOT — a shooter who
        // hits their number keeps shooting, which is the whole thrill of a hot
        // roll and the reason a rail cheers for one.
        const dicePassed = change.isSevenOut;

        await client.query(
          `INSERT INTO craps_multi_rolls
             (id, table_id, seed_epoch, nonce, shooter_position, shooter_address,
              shooter_client_seed, die1, die2, sum,
              phase_before, phase_after, point_before, point_after,
              is_point, is_seven_out, dice_passed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            rollId, tableId, Number(table.seed_epoch), nonce,
            shooterPosition, shooterSeat.player_address, String(shooterSeat.client_seed),
            die1, die2, sum,
            phaseBefore, change.phaseAfter, pointBefore, change.pointAfter,
            change.isPoint, change.isSevenOut, dicePassed,
          ],
        );

        // Settle each seat independently against the same dice and the same
        // before-phase. Losses left the player at placement, so only winnings
        // are credited here.
        for (const seat of seats.rows) {
          const bets = seat.bets as CrapsBets;
          const hadChips = this.totalOnFelt(bets) > 0;

          if (!hadChips) {
            // Nothing on the felt — count it toward the idle-seat limit.
            const next = Number(seat.consecutive_timeouts ?? 0) + 1;
            // NEVER kick the seat holding the dice. Two reasons, and the second
            // is the dangerous one: the dice are yours until you seven out, so
            // taking a shooter's seat mid-hand is simply wrong; and deleting it
            // here would leave shooter_position pointing at a seat that no
            // longer exists, which strands the table in 'rolling' forever —
            // every later throw fails NO_SHOOTER and betting never reopens.
            // The counter keeps climbing either way, so an idle shooter loses
            // the seat on the first throw after they seven out and the dice
            // have moved on.
            if (next >= CRAPS_MULTI_AFK_KICK_AFTER && Number(seat.position) !== shooterPosition) {
              await client.query(`DELETE FROM craps_multi_seats WHERE id = $1`, [seat.id]);
            } else {
              await client.query(
                `UPDATE craps_multi_seats SET consecutive_timeouts = $1 WHERE id = $2`,
                [next, seat.id],
              );
            }
            continue;
          }

          const outcome = evaluateRoll(die1, die2, phaseBefore, pointBefore, bets);

          // Cheap assertion of the invariant this table is built on. If a seat's
          // evaluation ever disagreed with the table's own transition, the felt
          // and the money would be telling different stories — better to abort
          // the throw than to persist a table nobody can reconcile.
          if (outcome.phaseAfter !== change.phaseAfter || outcome.pointAfter !== change.pointAfter) {
            throw new Error('PHASE_DESYNC');
          }

          if (outcome.wins > 0) {
            await applyPokerChipDelta(
              client, seat.player_address, BigInt(outcome.wins), 'craps_multi_payout',
              { type: 'craps_multi', id: tableId },
            );
          }

          await client.query(
            `INSERT INTO craps_multi_roll_seats
               (roll_id, position, player_address, bets_before, bets_after, wins, losses)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              rollId, Number(seat.position), seat.player_address,
              JSON.stringify(outcome.betsBefore), JSON.stringify(outcome.betsAfter),
              outcome.wins, outcome.losses,
            ],
          );

          await client.query(
            `UPDATE craps_multi_seats SET bets = $1, consecutive_timeouts = 0 WHERE id = $2`,
            [JSON.stringify(outcome.betsAfter), seat.id],
          );
        }

        await client.query(
          `UPDATE craps_multi_tables
              SET nonce_counter = $1, phase = $2, point = $3,
                  status = 'betting', betting_started_at = NOW(), roll_started_at = NULL
            WHERE id = $4`,
          [nonce + 1, change.phaseAfter, change.pointAfter, tableId],
        );

        if (dicePassed) {
          await this.passDiceTo(client, tableId, shooterPosition);
        }
      });

      this.bumpStateVersion(tableId);
      await this.broadcast(tableId, 'roll');
      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  /**
   * Hand the dice to the next occupied seat clockwise from `fromPosition`.
   * Falls back to no shooter (and a waiting table) when the rail is empty.
   */
  private async passDiceTo(client: PoolClient, tableId: string, fromPosition: number): Promise<void> {
    const seats = await client.query<{ position: number }>(
      `SELECT position FROM craps_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
      [tableId],
    );
    const positions = seats.rows.map((r) => Number(r.position));
    if (positions.length === 0) {
      await client.query(
        `UPDATE craps_multi_tables SET shooter_position = NULL, status = 'waiting' WHERE id = $1`,
        [tableId],
      );
      return;
    }
    const next = positions.find((p) => p > fromPosition) ?? positions[0];
    await client.query(
      `UPDATE craps_multi_tables SET shooter_position = $1 WHERE id = $2`,
      [next, tableId],
    );
  }

  // -------------------------------------------------------------------------
  // Timers (driven by the WebSocket watchdog)
  // -------------------------------------------------------------------------

  /** Tables whose betting window has run out — close them and start the shooter's clock. */
  async closeExpiredBettingWindows(): Promise<string[]> {
    const r = await this.pool.query<{ id: string }>(
      `UPDATE craps_multi_tables
          SET status = 'rolling', roll_started_at = NOW()
        WHERE status = 'betting'
          AND shooter_position IS NOT NULL
          AND betting_started_at IS NOT NULL
          AND betting_started_at < NOW() - ($1 || ' seconds')::interval
          -- Nothing to close if the whole table is empty-handed; leave the
          -- window open rather than marching an idle table through throws.
          AND EXISTS (
            SELECT 1 FROM craps_multi_seats s
             WHERE s.table_id = craps_multi_tables.id AND s.bets <> '{}'::jsonb
          )
        RETURNING id`,
      [String(CRAPS_MULTI_BETTING_SECONDS)],
    );
    const ids = r.rows.map((row) => row.id);
    for (const id of ids) {
      this.bumpStateVersion(id);
      await this.broadcast(id, 'betting_closed');
    }
    return ids;
  }

  /** Shooters who let their clock run out — the box throws for them. */
  async rollForExpiredShooters(): Promise<string[]> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM craps_multi_tables
        WHERE status = 'rolling'
          AND roll_started_at IS NOT NULL
          AND roll_started_at < NOW() - ($1 || ' seconds')::interval`,
      [String(CRAPS_MULTI_ROLL_SECONDS)],
    );
    const rolled: string[] = [];
    for (const row of r.rows) {
      try {
        await this.roll(row.id, null);
        rolled.push(row.id);
      } catch (err) {
        logger.error('CrapsMulti: auto-roll failed', { tableId: row.id, error: (err as Error)?.message });
      }
    }
    return rolled;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private totalOnFelt(bets: CrapsBets | null | undefined): number {
    if (!bets) return 0;
    return Object.values(bets).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }

  async getTableState(tableId: string): Promise<CrapsMultiTableState> {
    const t = await this.pool.query(`SELECT * FROM craps_multi_tables WHERE id = $1`, [tableId]);
    if (t.rows.length === 0) throw new Error('NOT_FOUND');
    const table = t.rows[0];

    const seatRows = await this.pool.query(`
      SELECT s.position, s.player_address, s.status, s.bets, s.consecutive_timeouts,
             p.display_name, p.profile_image_url, p.avatar_config, p.profile_display_mode
        FROM craps_multi_seats s
        LEFT JOIN players p ON LOWER(p.wallet_address) = s.player_address
       WHERE s.table_id = $1
       ORDER BY s.position ASC
    `, [tableId]);

    const lastRollRow = await this.pool.query(`
      SELECT * FROM craps_multi_rolls WHERE table_id = $1
       ORDER BY created_at DESC LIMIT 1
    `, [tableId]);

    const historyRows = await this.pool.query<{ sum: number }>(`
      SELECT sum FROM craps_multi_rolls WHERE table_id = $1
       ORDER BY created_at DESC LIMIT 12
    `, [tableId]);

    // Per-seat result of the most recent throw, for the felt to animate.
    const lastRoll = lastRollRow.rows[0] ?? null;
    const perSeat = new Map<number, { wins: number; losses: number }>();
    if (lastRoll) {
      const rs = await this.pool.query<{ position: number; wins: string; losses: string }>(
        `SELECT position, wins, losses FROM craps_multi_roll_seats WHERE roll_id = $1`,
        [lastRoll.id],
      );
      for (const row of rs.rows) {
        perSeat.set(Number(row.position), { wins: Number(row.wins), losses: Number(row.losses) });
      }
    }

    const shooterPosition = table.shooter_position === null ? null : Number(table.shooter_position);

    const byPosition = new Map<number, any>();
    for (const row of seatRows.rows) byPosition.set(Number(row.position), row);

    const seats: CrapsMultiSeatState[] = [];
    for (let i = 0; i < CRAPS_MULTI_SEAT_COUNT; i++) {
      const row = byPosition.get(i);
      if (!row) {
        seats.push({
          position: i, playerAddress: null, status: 'active', bets: {}, atRisk: 0,
          isShooter: false, consecutiveTimeouts: 0, lastWin: 0, lastLoss: 0,
        });
        continue;
      }
      const bets = (row.bets ?? {}) as CrapsBets;
      const last = perSeat.get(i);
      seats.push({
        position: i,
        playerAddress: row.player_address,
        status: row.status,
        bets,
        atRisk: this.totalOnFelt(bets),
        isShooter: shooterPosition === i,
        consecutiveTimeouts: Number(row.consecutive_timeouts ?? 0),
        displayName: row.display_name ?? null,
        profileImageUrl: row.profile_image_url ?? null,
        avatarConfig: row.avatar_config ?? null,
        profileDisplayMode: row.profile_display_mode ?? 'avatar',
        lastWin: last?.wins ?? 0,
        lastLoss: last?.losses ?? 0,
      });
    }

    return {
      tableId,
      status: table.status,
      phase: table.phase,
      point: table.point === null ? null : Number(table.point),
      shooterPosition,
      minBet: Number(table.min_bet),
      maxBet: Number(table.max_bet),
      seats,
      seatCount: CRAPS_MULTI_SEAT_COUNT,
      serverSeedHash: table.server_seed_hash ?? null,
      seedEpoch: Number(table.seed_epoch),
      nonce: Number(table.nonce_counter),
      bettingStartedAt: table.betting_started_at ? new Date(table.betting_started_at).toISOString() : null,
      rollStartedAt: table.roll_started_at ? new Date(table.roll_started_at).toISOString() : null,
      bettingSeconds: CRAPS_MULTI_BETTING_SECONDS,
      rollSeconds: CRAPS_MULTI_ROLL_SECONDS,
      lastRoll: lastRoll
        ? {
            rollId: lastRoll.id,
            die1: Number(lastRoll.die1),
            die2: Number(lastRoll.die2),
            sum: Number(lastRoll.sum),
            phaseBefore: lastRoll.phase_before,
            phaseAfter: lastRoll.phase_after,
            pointBefore: lastRoll.point_before === null ? null : Number(lastRoll.point_before),
            pointAfter: lastRoll.point_after === null ? null : Number(lastRoll.point_after),
            isPoint: Boolean(lastRoll.is_point),
            isSevenOut: Boolean(lastRoll.is_seven_out),
            dicePassed: Boolean(lastRoll.dice_passed),
            shooterPosition: lastRoll.shooter_position === null ? null : Number(lastRoll.shooter_position),
            shooterAddress: lastRoll.shooter_address ?? null,
          }
        : null,
      rollHistory: historyRows.rows.map((r) => Number(r.sum)),
      themeKind: table.theme_kind ?? 'image',
      themeId: table.theme_id ?? 'default',
      themeConfig: table.theme_config ?? null,
      stateVersion: this.stateVersions.get(tableId) ?? 0,
    };
  }

  /** Chip balance helper for the felt's own header. */
  async getChipBalance(playerAddress: string): Promise<string> {
    const bal = await getPokerChipBalance(this.pool, playerAddress.trim().toLowerCase());
    return bal.toString();
  }
}
