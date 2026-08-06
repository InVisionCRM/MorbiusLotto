/**
 * uth-multi-game.service.ts — multiplayer Ultimate Texas Hold'em.
 *
 * THE SHAPE, AND WHY IT IS A THIRD ONE
 *
 * Craps has no acting player: everyone bets, one throw settles all. Blackjack
 * is strictly turn-based: one player acts and the rest wait. Ultimate Hold'em
 * sits between them, and that is what makes it worth building as a shared table.
 *
 * Every seat plays its OWN hand against the same dealer, on the SAME five
 * community cards. No seat's decision affects any other seat's money. So nobody
 * waits for a turn — each seat simply has its own clock on each street, and the
 * street advances once every live seat has acted. A table of five plays at
 * roughly the speed of a table of one, which is the opposite of blackjack.
 *
 * WHAT IS SHARED AND WHAT IS NOT
 *
 * Shared: the board, the dealer's hand, the street, and the clock.
 * Private: your hole cards, your Play decision, and all of your money.
 *
 * That split is the whole design. Because a seat's settlement depends only on
 * (its own cards, the shared board, the dealer), settlement is literally the
 * SOLO game's settleUth called once per seat — no multiplayer-specific payout
 * maths exists, and therefore none can drift from the single-player game.
 *
 * THE DECK
 *
 * One shuffle per round, dealt in a fixed order so the round is reproducible:
 *
 *   cards 0 .. 2n-1   hole cards, two per seat in ascending seat position
 *   next 5            the board
 *   next 2            the dealer
 *
 * Everything — including all five board cards — is fixed before anyone acts.
 * Nothing is drawn in response to how a seat bets.
 *
 * The client seed is every seated player's seed joined in position order, so no
 * single player (nor the house alone) determines the deal, and anyone can
 * recompute it from the published round.
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { applyPokerChipDelta, getPokerChipBalance } from './poker-chip-wallet';
import { betLimits } from '../lib/game-limits';
import {
  KeyedMutex,
  loadPendingSeed,
  newServerSeed,
  rotateSeedEpoch,
  storePendingSeed,
  type SeedEpochTables,
} from '../lib/multiplayer-table';
import { logger } from '../utils/logger';
import {
  settleUth,
  uthBest,
  uthLegalActions,
  uthNextStage,
  uthPlayMultiple,
  type UthAction,
  type UthStage,
} from './arcade-ultimate-holdem';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * Seats. Six needs 19 of 52 cards, so the deck is never close to exhausted.
 * Kept smaller than the craps rail because each seat here shows two hole cards
 * and four bet spots — more than that stops fitting on a phone.
 */
export const UTH_MULTI_SEAT_COUNT = 6;

/** How long antes can be posted before the round deals. */
export const UTH_MULTI_BETTING_SECONDS = 15;

/**
 * Each seat's clock on a street. Generous, because a Hold'em decision is a real
 * decision — but it runs for every seat at once, so it does not compound.
 */
export const UTH_MULTI_STREET_SECONDS = 25;

/** Rounds a seat may sit through without posting before it loses the seat. */
export const UTH_MULTI_AFK_KICK_AFTER = 3;

const UTH_SEED_TABLES: SeedEpochTables = {
  tables: 'uth_multi_tables',
  pending: 'uth_multi_table_pending_seeds',
  revealed: 'uth_multi_revealed_seeds',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UthMultiSeatState {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  /** Staged for the next round; becomes a real wager when it deals. */
  pendingAnte: number;
  pendingTrips: number;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;

  // ── Round-specific. Null/zero when this seat isn't in the live round. ──
  inRound: boolean;
  /** Only ever populated for the viewer's own seat — see getTableState. */
  holeCards: number[] | null;
  ante: number;
  blind: number;
  trips: number;
  play: number;
  folded: boolean;
  /** True once this seat has acted on the current street. */
  acted: boolean;
  result: string | null;
  totalPayout: number;
  playerCategory: string | null;
}

export interface UthMultiTableState {
  tableId: string;
  status: 'waiting' | 'betting' | 'dealing';
  minBet: number;
  maxBet: number;
  seats: UthMultiSeatState[];
  seatCount: number;

  roundId: string | null;
  roundNumber: number;
  stage: UthStage;
  /** Only the cards this street has reached. */
  board: number[];
  /** Empty until showdown. */
  dealerCards: number[];

  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;

  bettingStartedAt: string | null;
  streetStartedAt: string | null;
  bettingSeconds: number;
  streetSeconds: number;

  /** What the viewer may do right now, given their seat and the street. */
  legalActions: UthAction[];

  stateVersion: number;
}

export interface UthMultiTableSummary {
  id: string;
  status: string;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  stage: UthStage | null;
}

/**
 * Does this seat still owe the table a decision on `stage`?
 *
 * Pulled out as a pure function because it is the ONE genuinely new rule this
 * game adds — settlement is the solo engine, the seat plumbing is shared, but
 * "when does a street end" exists only here. A seat is done once it has folded,
 * once it has committed Play (there is nothing further to decide all hand), or
 * once it has acted on this particular street.
 */
export function uthSeatOwesDecision(
  seat: { folded: boolean; play: number; actedStage: string | null },
  stage: UthStage,
): boolean {
  if (seat.folded) return false;
  if (seat.play > 0) return false;
  return seat.actedStage !== stage;
}

/** A street ends when nobody still owes a decision. */
export function uthStreetComplete(
  seats: Array<{ folded: boolean; play: number; actedStage: string | null }>,
  stage: UthStage,
): boolean {
  return seats.every((s) => !uthSeatOwesDecision(s, stage));
}

/**
 * What a posted seat must cover before the round deals: the ante, an equal
 * blind alongside it, and any Trips.
 *
 * Exported so the rule is testable. It exists because a seat that could not pay
 * used to abort the entire deal and leave an expired betting window behind,
 * turning the watchdog into an infinite retry that bricked the table.
 */
export function uthSeatCost(pendingAnte: number, pendingTrips: number): number {
  return pendingAnte * 2 + pendingTrips;
}

/** Can this seat back what it posted? */
export function uthSeatCanAfford(
  pendingAnte: number,
  pendingTrips: number,
  balance: bigint,
): boolean {
  return balance >= BigInt(uthSeatCost(pendingAnte, pendingTrips));
}

/** How many board cards a street has turned over. */
function boardVisible(stage: UthStage): number {
  if (stage === 'preflop') return 0;
  if (stage === 'flop') return 3;
  return 5;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class UthMultiGameService {
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

  private bump(tableId: string): number {
    const v = (this.stateVersions.get(tableId) ?? 0) + 1;
    this.stateVersions.set(tableId, v);
    return v;
  }

  private async broadcast(tableId: string, reason: string): Promise<void> {
    if (!this.broadcastCallback) return;
    await this.broadcastCallback(tableId).catch((error) =>
      logger.error('UthMulti: broadcast error', { tableId, reason, error }),
    );
  }

  // -------------------------------------------------------------------------
  // Lobby / admin
  // -------------------------------------------------------------------------

  async listTables(): Promise<UthMultiTableSummary[]> {
    const r = await this.pool.query(`
      SELECT t.id, t.status, t.min_bet, t.max_bet,
             COUNT(s.id) AS seated_count,
             (SELECT stage FROM uth_multi_rounds rr
               WHERE rr.table_id = t.id AND rr.stage <> 'settled' LIMIT 1) AS stage
        FROM uth_multi_tables t
        LEFT JOIN uth_multi_seats s ON s.table_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at ASC
    `);
    return r.rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      minBet: Number(row.min_bet),
      maxBet: Number(row.max_bet),
      seatedCount: Number(row.seated_count),
      emptySeats: UTH_MULTI_SEAT_COUNT - Number(row.seated_count),
      stage: row.stage ?? null,
    }));
  }

  async createTable(minBet?: number, maxBet?: number): Promise<{ id: string }> {
    const reg = betLimits('ultimate_holdem');
    const min = Math.max(1, Math.floor(minBet ?? reg.min));
    const max = Math.max(min, Math.floor(maxBet ?? reg.max));
    const seed = newServerSeed();

    const id = await this.dbService.withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO uth_multi_tables (min_bet, max_bet, server_seed_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [min, max, seed.hash],
      );
      const newId: string = r.rows[0].id;
      await storePendingSeed(client, UTH_SEED_TABLES, newId, seed.seed);
      return newId;
    });
    return { id };
  }

  /**
   * Delete a table, refunding any staged antes.
   *
   * A live round cannot simply be dropped — its antes are already debited — so
   * deleting mid-round settles nothing and refunds everything committed.
   */
  async deleteTable(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const existed = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(`SELECT id FROM uth_multi_tables WHERE id = $1 FOR UPDATE`, [tableId]);
        if (t.rows.length === 0) return false;

        // Staged antes never became wagers, but a live round's did.
        const live = await client.query(
          `SELECT rs.player_address, rs.ante, rs.blind, rs.trips, rs.play
             FROM uth_multi_round_seats rs
             JOIN uth_multi_rounds r ON r.id = rs.round_id
            WHERE r.table_id = $1 AND r.stage <> 'settled'`,
          [tableId],
        );
        for (const row of live.rows) {
          const back = Number(row.ante) + Number(row.blind) + Number(row.trips) + Number(row.play);
          if (back > 0) {
            await applyPokerChipDelta(client, row.player_address, BigInt(back), 'uth_multi_refund', {
              type: 'uth_multi', id: tableId,
            });
          }
        }
        await client.query(`DELETE FROM uth_multi_tables WHERE id = $1`, [tableId]);
        return true;
      });
      if (existed) this.stateVersions.delete(tableId);
      return existed;
    } finally {
      release();
      this.tableLocks.delete(tableId);
    }
  }

  async rotateSeed(tableId: string): Promise<{ ok: boolean; error?: string }> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const live = await client.query(
          `SELECT 1 FROM uth_multi_rounds WHERE table_id = $1 AND stage <> 'settled'`,
          [tableId],
        );
        // Rotating mid-round would change the deck a live hand was dealt from.
        if (live.rows.length > 0) throw new Error('ROUND_LIVE');
        await rotateSeedEpoch(client, UTH_SEED_TABLES, tableId);
      });
      await this.broadcast(tableId, 'seed_rotated');
      return { ok: true };
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'NOT_FOUND') return { ok: false, error: 'Table not found.' };
      if (msg === 'ROUND_LIVE') return { ok: false, error: 'Cannot rotate the seed mid-round.' };
      logger.error('UthMulti: rotateSeed failed', { tableId, error: msg });
      return { ok: false, error: 'Could not rotate the seed.' };
    } finally {
      release();
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
  ): Promise<UthMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    if (!Number.isInteger(seatPosition) || seatPosition < 0 || seatPosition >= UTH_MULTI_SEAT_COUNT) {
      throw new Error('BAD_SEAT');
    }
    const seed = (clientSeed ?? '').trim() || crypto.randomBytes(8).toString('hex');

    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT id, status FROM uth_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');

        const taken = await client.query(
          `SELECT position, player_address FROM uth_multi_seats WHERE table_id = $1`, [tableId],
        );
        if (taken.rows.some((s: any) => s.player_address === addr)) throw new Error('ALREADY_SEATED');
        if (taken.rows.some((s: any) => Number(s.position) === seatPosition)) throw new Error('SEAT_TAKEN');

        await client.query(
          `INSERT INTO uth_multi_seats (table_id, position, player_address, client_seed)
           VALUES ($1, $2, $3, $4)`,
          [tableId, seatPosition, addr, seed],
        );

        // A newcomer to an idle table opens the betting window. Joining
        // mid-round is fine — they simply sit out until the next deal.
        if (t.rows[0].status === 'waiting') {
          await client.query(
            `UPDATE uth_multi_tables SET status = 'betting', betting_started_at = NOW() WHERE id = $1`,
            [tableId],
          );
        }
      });
      this.bump(tableId);
      await this.broadcast(tableId, 'join');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  async leaveTable(tableId: string, playerAddress: string): Promise<UthMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const s = await client.query(
          `SELECT id, pending_ante, pending_trips FROM uth_multi_seats
            WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        // A seat in a LIVE round can't just vanish — its ante is already a
        // wager. It folds, which is what standing up mid-hand means.
        const live = await client.query(
          `SELECT rs.round_id, rs.position FROM uth_multi_round_seats rs
             JOIN uth_multi_rounds r ON r.id = rs.round_id
            WHERE r.table_id = $1 AND r.stage <> 'settled'
              AND rs.player_address = $2 AND rs.folded = FALSE`,
          [tableId, addr],
        );
        for (const row of live.rows) {
          await client.query(
            `UPDATE uth_multi_round_seats SET folded = TRUE, acted_stage = 'river'
              WHERE round_id = $1 AND position = $2`,
            [row.round_id, row.position],
          );
        }

        // Staged antes never became wagers, so they are simply not taken.
        await client.query(`DELETE FROM uth_multi_seats WHERE id = $1`, [s.rows[0].id]);

        const left = await client.query(
          `SELECT COUNT(*)::int AS n FROM uth_multi_seats WHERE table_id = $1`, [tableId],
        );
        if (Number(left.rows[0].n) === 0) {
          await client.query(
            `UPDATE uth_multi_tables SET status = 'waiting', betting_started_at = NULL WHERE id = $1`,
            [tableId],
          );
        }
      });
      this.bump(tableId);
      await this.broadcast(tableId, 'leave');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Posting the ante
  // -------------------------------------------------------------------------

  /**
   * Stage an ante (and optional Trips) for the next round.
   *
   * Nothing is debited here. Unlike craps — where a chip on the felt is live
   * immediately because a Place bet rides across throws — a Hold'em ante only
   * becomes a wager when the round actually deals, so the money moves there.
   */
  async postAnte(
    tableId: string,
    playerAddress: string,
    ante: number,
    trips: number,
  ): Promise<UthMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, min_bet, max_bet FROM uth_multi_tables WHERE id = $1 FOR UPDATE`, [tableId],
        );
        if (t.rows.length === 0) throw new Error('NOT_FOUND');
        if (t.rows[0].status === 'dealing') throw new Error('ROUND_LIVE');

        const min = Number(t.rows[0].min_bet);
        const max = Number(t.rows[0].max_bet);
        const a = Math.floor(Number(ante));
        const tr = Math.max(0, Math.floor(Number(trips) || 0));
        if (!Number.isFinite(a) || a < min) throw new Error('UNDER_MIN');
        if (a > max) throw new Error('OVER_MAX');
        if (tr > max) throw new Error('OVER_MAX');

        const s = await client.query(
          `SELECT id FROM uth_multi_seats WHERE table_id = $1 AND player_address = $2 FOR UPDATE`,
          [tableId, addr],
        );
        if (s.rows.length === 0) throw new Error('NOT_SEATED');

        await client.query(
          `UPDATE uth_multi_seats
              SET pending_ante = $1, pending_trips = $2, consecutive_timeouts = 0, status = 'active'
            WHERE id = $3`,
          [a, tr, s.rows[0].id],
        );
      });
      this.bump(tableId);
      await this.broadcast(tableId, 'ante');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Dealing
  // -------------------------------------------------------------------------

  /**
   * Deal a round to every seat that has posted.
   *
   * The whole deck is dealt up front — hole cards, all five board cards and the
   * dealer's two — from one shuffle sealed behind the published commitment.
   * Nothing is drawn later in response to how anyone bets.
   */
  async dealRound(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const dealt = await this.dbService.withTransaction(async (client) => {
        const t = await client.query(
          `SELECT status, seed_epoch, nonce_counter FROM uth_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (t.rows.length === 0) return false;
        if (t.rows[0].status === 'dealing') return false;

        const seats = await client.query(
          `SELECT id, position, player_address, pending_ante, pending_trips, client_seed,
                  consecutive_timeouts
             FROM uth_multi_seats WHERE table_id = $1 ORDER BY position ASC FOR UPDATE`,
          [tableId],
        );
        const posting = seats.rows.filter((s: any) => Number(s.pending_ante) > 0);
        if (posting.length === 0) {
          // Nobody posted. Count it against every seat and reopen the window
          // rather than dealing a round to an empty table.
          for (const s of seats.rows) {
            const next = Number(s.consecutive_timeouts ?? 0) + 1;
            if (next >= UTH_MULTI_AFK_KICK_AFTER) {
              await client.query(`DELETE FROM uth_multi_seats WHERE id = $1`, [s.id]);
            } else {
              await client.query(
                `UPDATE uth_multi_seats SET consecutive_timeouts = $1 WHERE id = $2`, [next, s.id],
              );
            }
          }
          await client.query(
            `UPDATE uth_multi_tables SET betting_started_at = NOW() WHERE id = $1`, [tableId],
          );
          return false;
        }

        // Who can actually cover what they posted?
        //
        // This has to happen BEFORE any cards are assigned. A seat that cannot
        // pay used to throw out of applyPokerChipDelta, roll the whole deal
        // back, and leave betting_started_at untouched — so the watchdog picked
        // the same table again every tick and no hand ever played again. One
        // player running out of chips must not take the table down with them.
        //
        // Filtering first (rather than skipping mid-loop) also keeps the deal
        // recipe honest: the cards are handed out to exactly the seats recorded
        // on the round, in position order, with nothing burned in between.
        const affordable: any[] = [];
        for (const s of posting) {
          const balance = await getPokerChipBalance(client, s.player_address);
          if (uthSeatCanAfford(Number(s.pending_ante), Number(s.pending_trips), balance)) {
            affordable.push(s);
          } else {
            // Clear the stake they can't back and sit them out; they can post
            // again once they top up.
            await client.query(
              `UPDATE uth_multi_seats SET pending_ante = 0, pending_trips = 0, status = 'sitting_out'
                WHERE id = $1`,
              [s.id],
            );
          }
        }
        if (affordable.length === 0) {
          // Nobody could pay. Reopen the window rather than leaving an expired
          // one for the watchdog to trip over again immediately.
          await client.query(
            `UPDATE uth_multi_tables SET betting_started_at = NOW() WHERE id = $1`, [tableId],
          );
          return false;
        }

        const serverSeed = await loadPendingSeed(client, UTH_SEED_TABLES, tableId);
        const nonce = Number(t.rows[0].nonce_counter);
        // Every seated player contributes, in seat order, so no single party
        // (including the house) determines the deal.
        const combinedClientSeed = seats.rows.map((s: any) => String(s.client_seed)).join('|');
        const deck = this.pfService.fisherYatesShuffle(serverSeed, combinedClientSeed, nonce);

        // Fixed deal order — this IS the verification recipe.
        let cursor = 0;
        const hole: Record<number, number[]> = {};
        for (const s of affordable) {
          hole[Number(s.position)] = [deck[cursor++], deck[cursor++]];
        }
        const board = [deck[cursor++], deck[cursor++], deck[cursor++], deck[cursor++], deck[cursor++]];
        const dealerCards = [deck[cursor++], deck[cursor++]];

        const nextNumber = await client.query(
          `SELECT COALESCE(MAX(round_number), 0) + 1 AS n FROM uth_multi_rounds WHERE table_id = $1`,
          [tableId],
        );
        const roundId = crypto.randomUUID();
        await client.query(
          `INSERT INTO uth_multi_rounds
             (id, table_id, round_number, seed_epoch, nonce, stage, board, dealer_cards, street_started_at)
           VALUES ($1,$2,$3,$4,$5,'preflop',$6,$7,NOW())`,
          [roundId, tableId, Number(nextNumber.rows[0].n), Number(t.rows[0].seed_epoch), nonce, board, dealerCards],
        );

        for (const s of affordable) {
          const ante = Number(s.pending_ante);
          const trips = Number(s.pending_trips);
          // Ante + an equal Blind, plus Trips. Debited here, where the wager
          // actually becomes real.
          const cost = uthSeatCost(ante, trips);
          await applyPokerChipDelta(client, s.player_address, BigInt(-cost), 'uth_multi_bet', {
            type: 'uth_multi', id: roundId,
          });
          await client.query(
            `INSERT INTO uth_multi_round_seats
               (round_id, position, player_address, hole_cards, ante, blind, trips)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [roundId, Number(s.position), s.player_address, hole[Number(s.position)], ante, ante, trips],
          );
          await client.query(
            `UPDATE uth_multi_seats SET pending_ante = 0, pending_trips = 0, consecutive_timeouts = 0
              WHERE id = $1`,
            [s.id],
          );
        }

        await client.query(
          `UPDATE uth_multi_tables
              SET status = 'dealing', nonce_counter = $1, betting_started_at = NULL
            WHERE id = $2`,
          [nonce + 1, tableId],
        );
        return true;
      });

      if (dealt) {
        this.bump(tableId);
        await this.broadcast(tableId, 'deal');
      }
      return dealt;
    } catch (err) {
      logger.error('UthMulti: deal failed', { tableId, error: (err as Error)?.message });
      // The transaction rolled back, so the expired window is still sitting
      // there. Reopen it — otherwise ANY unexpected failure here becomes a
      // watchdog that retries the same doomed deal every couple of seconds.
      await this.pool
        .query(`UPDATE uth_multi_tables SET betting_started_at = NOW() WHERE id = $1`, [tableId])
        .catch(() => { /* nothing more we can do from here */ });
      return false;
    } finally {
      release();
    }
  }

  // -------------------------------------------------------------------------
  // Acting
  // -------------------------------------------------------------------------

  /**
   * A seat's decision on the current street.
   *
   * Independent of every other seat: betting Play here changes only this seat's
   * money. The only shared consequence is that the street advances once every
   * live seat has acted.
   */
  async act(tableId: string, playerAddress: string, action: UthAction): Promise<UthMultiTableState> {
    const addr = playerAddress.trim().toLowerCase();
    const release = await this.tableLocks.acquire(tableId);
    try {
      await this.dbService.withTransaction(async (client) => {
        const round = await this.loadLiveRound(client, tableId, true);
        if (!round) throw new Error('NO_ROUND');

        const stage: UthStage = round.stage;
        if (!uthLegalActions(stage).includes(action)) throw new Error('ILLEGAL_ACTION');

        const rs = await client.query(
          `SELECT * FROM uth_multi_round_seats
            WHERE round_id = $1 AND player_address = $2 FOR UPDATE`,
          [round.id, addr],
        );
        if (rs.rows.length === 0) throw new Error('NOT_IN_ROUND');
        const seat = rs.rows[0];
        if (seat.folded) throw new Error('ALREADY_FOLDED');
        if (Number(seat.play) > 0) throw new Error('ALREADY_COMMITTED');
        if (seat.acted_stage === stage) throw new Error('ALREADY_ACTED');

        if (action === 'fold') {
          await client.query(
            `UPDATE uth_multi_round_seats SET folded = TRUE, acted_stage = $1
              WHERE round_id = $2 AND position = $3`,
            [stage, round.id, Number(seat.position)],
          );
        } else if (action === 'check') {
          await client.query(
            `UPDATE uth_multi_round_seats SET acted_stage = $1 WHERE round_id = $2 AND position = $3`,
            [stage, round.id, Number(seat.position)],
          );
        } else {
          const mult = uthPlayMultiple(action);
          const play = Number(seat.ante) * mult;
          await applyPokerChipDelta(client, addr, BigInt(-play), 'uth_multi_bet', {
            type: 'uth_multi', id: round.id,
          });
          await client.query(
            `UPDATE uth_multi_round_seats SET play = $1, acted_stage = $2
              WHERE round_id = $3 AND position = $4`,
            [play, stage, round.id, Number(seat.position)],
          );
        }

        await this.advanceIfStreetComplete(client, tableId, round.id);
      });
      this.bump(tableId);
      await this.broadcast(tableId, 'act');
      return this.getTableState(tableId, addr);
    } finally {
      release();
    }
  }

  private async loadLiveRound(client: PoolClient, tableId: string, lock = false): Promise<any | null> {
    const r = await client.query(
      `SELECT * FROM uth_multi_rounds WHERE table_id = $1 AND stage <> 'settled'
       ${lock ? 'FOR UPDATE' : ''}`,
      [tableId],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Move to the next street once every seat that still has a decision has made
   * it — or settle, if the river is done.
   *
   * A seat needs no further decision once it has folded or committed Play, so
   * "everyone acted" means every seat that is still choosing.
   */
  private async advanceIfStreetComplete(
    client: PoolClient,
    tableId: string,
    roundId: string,
  ): Promise<void> {
    const r = await client.query(`SELECT * FROM uth_multi_rounds WHERE id = $1 FOR UPDATE`, [roundId]);
    if (r.rows.length === 0) return;
    const round = r.rows[0];
    const stage: UthStage = round.stage;
    if (stage === 'settled') return;

    const seats = await client.query(
      `SELECT position, play, folded, acted_stage FROM uth_multi_round_seats WHERE round_id = $1`,
      [roundId],
    );
    const shaped = seats.rows.map((s: any) => ({
      folded: Boolean(s.folded),
      play: Number(s.play),
      actedStage: s.acted_stage ?? null,
    }));
    if (!uthStreetComplete(shaped, stage)) return;

    // Everyone still choosing has chosen. The river ends the round; earlier
    // streets just turn more board cards over.
    const nextStage = stage === 'river' ? 'settled' : uthNextStage(stage, 'check');
    if (nextStage === 'settled') {
      await this.settleRound(client, tableId, roundId);
      return;
    }
    await client.query(
      `UPDATE uth_multi_rounds SET stage = $1, street_started_at = NOW() WHERE id = $2`,
      [nextStage, roundId],
    );
  }

  /** Settle every seat with the SOLO game's evaluator — one call per seat. */
  private async settleRound(client: PoolClient, tableId: string, roundId: string): Promise<void> {
    const r = await client.query(`SELECT * FROM uth_multi_rounds WHERE id = $1`, [roundId]);
    if (r.rows.length === 0) return;
    const round = r.rows[0];
    const board: number[] = (round.board as number[]).map(Number);
    const dealerCards: number[] = (round.dealer_cards as number[]).map(Number);
    const dealerHand = uthBest(dealerCards, board);

    const seats = await client.query(
      `SELECT * FROM uth_multi_round_seats WHERE round_id = $1 FOR UPDATE`, [roundId],
    );

    for (const s of seats.rows) {
      const hole: number[] = (s.hole_cards as number[]).map(Number);
      const playerHand = uthBest(hole, board);
      const settlement = settleUth(
        playerHand,
        dealerHand,
        Number(s.ante),
        Number(s.blind),
        Number(s.trips),
        Number(s.play),
        Boolean(s.folded),
      );

      if (settlement.totalPayout > 0) {
        await applyPokerChipDelta(
          client, s.player_address, BigInt(settlement.totalPayout), 'uth_multi_payout',
          { type: 'uth_multi', id: roundId },
        );
      }

      await client.query(
        `UPDATE uth_multi_round_seats
            SET result = $1, ante_payout = $2, blind_payout = $3, play_payout = $4,
                trips_payout = $5, total_payout = $6, player_category = $7,
                dealer_category = $8, dealer_qualified = $9
          WHERE round_id = $10 AND position = $11`,
        [
          settlement.result, settlement.antePayout, settlement.blindPayout, settlement.playPayout,
          settlement.tripsPayout, settlement.totalPayout, settlement.playerCategory,
          settlement.dealerCategory, settlement.dealerQualified, roundId, Number(s.position),
        ],
      );
    }

    await client.query(
      `UPDATE uth_multi_rounds SET stage = 'settled', settled_at = NOW(), street_started_at = NULL
        WHERE id = $1`,
      [roundId],
    );
    // Straight back into a betting window for the next hand.
    await client.query(
      `UPDATE uth_multi_tables SET status = 'betting', betting_started_at = NOW() WHERE id = $1`,
      [tableId],
    );
  }

  // -------------------------------------------------------------------------
  // Timers (driven by the WebSocket watchdog)
  // -------------------------------------------------------------------------

  /** Betting windows whose time is up — deal them. */
  async dealExpiredBettingWindows(): Promise<string[]> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM uth_multi_tables
        WHERE status = 'betting'
          AND betting_started_at IS NOT NULL
          AND betting_started_at < NOW() - ($1 || ' seconds')::interval`,
      [String(UTH_MULTI_BETTING_SECONDS)],
    );
    const dealt: string[] = [];
    for (const row of r.rows) {
      if (await this.dealRound(row.id)) dealt.push(row.id);
    }
    return dealt;
  }

  /**
   * Streets whose clock has run out.
   *
   * An absent seat CHECKS on the early streets — checking is free and is the
   * choice that keeps their hand alive. At the river checking isn't legal, so
   * an expired clock folds them, which is the only remaining option.
   */
  async resolveExpiredStreets(): Promise<string[]> {
    const r = await this.pool.query<{ id: string; table_id: string; stage: UthStage }>(
      `SELECT id, table_id, stage FROM uth_multi_rounds
        WHERE stage <> 'settled'
          AND street_started_at IS NOT NULL
          AND street_started_at < NOW() - ($1 || ' seconds')::interval`,
      [String(UTH_MULTI_STREET_SECONDS)],
    );

    const touched: string[] = [];
    for (const round of r.rows) {
      const release = await this.tableLocks.acquire(round.table_id);
      try {
        await this.dbService.withTransaction(async (client) => {
          const live = await client.query(
            `SELECT stage FROM uth_multi_rounds WHERE id = $1 FOR UPDATE`, [round.id],
          );
          if (live.rows.length === 0 || live.rows[0].stage === 'settled') return;
          const stage: UthStage = live.rows[0].stage;

          await client.query(
            `UPDATE uth_multi_round_seats
                SET acted_stage = $1, folded = CASE WHEN $2 THEN TRUE ELSE folded END
              WHERE round_id = $3 AND folded = FALSE AND play = 0
                AND (acted_stage IS DISTINCT FROM $1)`,
            [stage, stage === 'river', round.id],
          );
          await this.advanceIfStreetComplete(client, round.table_id, round.id);
        });
        touched.push(round.table_id);
        this.bump(round.table_id);
        await this.broadcast(round.table_id, 'street_timeout');
      } catch (err) {
        logger.error('UthMulti: street timeout failed', { roundId: round.id, error: (err as Error)?.message });
      } finally {
        release();
      }
    }
    return touched;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /**
   * `viewerAddress` decides whose hole cards come back.
   *
   * Only the viewer's own are ever included before showdown — this is the one
   * place where getting it wrong would let a player read the table, so the
   * filtering happens on the way OUT rather than being trusted to the client.
   */
  async getTableState(tableId: string, viewerAddress?: string | null): Promise<UthMultiTableState> {
    const viewer = viewerAddress ? viewerAddress.trim().toLowerCase() : null;

    const t = await this.pool.query(`SELECT * FROM uth_multi_tables WHERE id = $1`, [tableId]);
    if (t.rows.length === 0) throw new Error('NOT_FOUND');
    const table = t.rows[0];

    const round = await this.loadLiveRound(this.pool as unknown as PoolClient, tableId);
    // After settlement the felt should still show the hand that just finished,
    // so fall back to the most recent settled round.
    const shown = round ?? (await this.pool.query(
      `SELECT * FROM uth_multi_rounds WHERE table_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    )).rows[0] ?? null;

    const seatRows = await this.pool.query(`
      SELECT s.position, s.player_address, s.status, s.pending_ante, s.pending_trips,
             s.consecutive_timeouts,
             p.display_name, p.profile_image_url, p.avatar_config
        FROM uth_multi_seats s
        LEFT JOIN chat_display_names p ON LOWER(p.wallet_address) = s.player_address
       WHERE s.table_id = $1
       ORDER BY s.position ASC
    `, [tableId]);

    const roundSeats = shown
      ? (await this.pool.query(`SELECT * FROM uth_multi_round_seats WHERE round_id = $1`, [shown.id])).rows
      : [];
    const bySeatPos = new Map<number, any>();
    for (const rs of roundSeats) bySeatPos.set(Number(rs.position), rs);

    const stage: UthStage = shown ? shown.stage : 'preflop';
    const settled = stage === 'settled';
    const fullBoard: number[] = shown ? (shown.board as number[]).map(Number) : [];
    const board = fullBoard.slice(0, boardVisible(stage));

    const byPosition = new Map<number, any>();
    for (const row of seatRows.rows) byPosition.set(Number(row.position), row);

    const seats: UthMultiSeatState[] = [];
    for (let i = 0; i < UTH_MULTI_SEAT_COUNT; i++) {
      const row = byPosition.get(i);
      const rs = bySeatPos.get(i);
      if (!row) {
        seats.push({
          position: i, playerAddress: null, status: 'active', pendingAnte: 0, pendingTrips: 0,
          consecutiveTimeouts: 0, inRound: false, holeCards: null, ante: 0, blind: 0, trips: 0,
          play: 0, folded: false, acted: false, result: null, totalPayout: 0, playerCategory: null,
        });
        continue;
      }
      const isViewer = !!viewer && row.player_address === viewer;
      seats.push({
        position: i,
        playerAddress: row.player_address,
        status: row.status,
        pendingAnte: Number(row.pending_ante),
        pendingTrips: Number(row.pending_trips),
        consecutiveTimeouts: Number(row.consecutive_timeouts ?? 0),
        displayName: row.display_name ?? null,
        profileImageUrl: row.profile_image_url ?? null,
        avatarConfig: row.avatar_config ?? null,
        inRound: !!rs,
        // Your own cards always; everyone else's only once the hand is over.
        holeCards: rs ? (isViewer || settled ? (rs.hole_cards as number[]).map(Number) : null) : null,
        ante: rs ? Number(rs.ante) : 0,
        blind: rs ? Number(rs.blind) : 0,
        trips: rs ? Number(rs.trips) : 0,
        play: rs ? Number(rs.play) : 0,
        folded: rs ? Boolean(rs.folded) : false,
        acted: rs ? rs.acted_stage === stage || Number(rs.play) > 0 || Boolean(rs.folded) : false,
        result: rs?.result ?? null,
        totalPayout: rs ? Number(rs.total_payout) : 0,
        playerCategory: rs?.player_category ?? null,
      });
    }

    // What the viewer may do right now.
    const viewerSeat = viewer ? seats.find((s) => s.playerAddress === viewer) : undefined;
    const canAct =
      !!viewerSeat && viewerSeat.inRound && !settled && !viewerSeat.folded &&
      viewerSeat.play === 0 && !viewerSeat.acted;
    const legalActions = canAct ? uthLegalActions(stage) : [];

    return {
      tableId,
      status: table.status,
      minBet: Number(table.min_bet),
      maxBet: Number(table.max_bet),
      seats,
      seatCount: UTH_MULTI_SEAT_COUNT,
      roundId: shown?.id ?? null,
      roundNumber: shown ? Number(shown.round_number) : 0,
      stage,
      board,
      dealerCards: settled && shown ? (shown.dealer_cards as number[]).map(Number) : [],
      serverSeedHash: table.server_seed_hash ?? null,
      seedEpoch: Number(table.seed_epoch),
      nonce: Number(table.nonce_counter),
      bettingStartedAt: table.betting_started_at ? new Date(table.betting_started_at).toISOString() : null,
      streetStartedAt: shown?.street_started_at ? new Date(shown.street_started_at).toISOString() : null,
      bettingSeconds: UTH_MULTI_BETTING_SECONDS,
      streetSeconds: UTH_MULTI_STREET_SECONDS,
      legalActions,
      stateVersion: this.stateVersions.get(tableId) ?? 0,
    };
  }
}
