import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { CosmeticsService } from './cosmetics.service';
import { randomPlaceholderConfig } from '../lib/cosmetics-catalog';
import { logger } from '../utils/logger';
import {
  applyWheelWagerCredit,
  recordDailyMilestone,
  recordGameOutcome,
} from './wheel-spin-wallet';
import { applyPokerChipDelta } from './poker-chip-wallet';
import { POKER_CHIP_WEI } from '../lib/poker-chip-scale';
import crypto from 'crypto';

/** Kick from table after this many consecutive timeouts (betting window + in-round auto-stand). */
const BJ_MULTI_AFK_KICK_AFTER = 3;

const BJ_MULTI_BETTING_RESTART_GRACE_MS = 3000;

/**
 * Acting player's decision clock before the watchdog auto-stands them. Must stay
 * in sync with the timer watchdog's sweep query (tickBJMultiTimers in
 * websocket.service.impl.js) and with the client countdown ring
 * (TURN_TIMEOUT in components/BLACKJACK/multi/) — the player watches that ring
 * hit zero and expects the server to act right then.
 */
const BJ_MULTI_TURN_TIMEOUT_SECONDS = 30;

/** 3:2 blackjack payout floored to whole chips (1 chip = 1 MORBIUS); the half-chip on odd bets rounds to the house. */
function bjMultiPayoutWhole(betWei: bigint): bigint {
  return ((betWei / POKER_CHIP_WEI) * 5n / 2n) * POKER_CHIP_WEI;
}

// ---------------------------------------------------------------------------
// Shared per-key mutex (copied from blackjack-game.service.ts pattern)
// ---------------------------------------------------------------------------
class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    const prevLock = this.locks.get(key) ?? Promise.resolve();
    let releaseFn!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFn = resolve; });
    const newTail = prevLock.then(() => gate);
    this.locks.set(key, newTail);
    await prevLock;
    return releaseFn;
  }

  delete(key: string): void { this.locks.delete(key); }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single hand within a seat (seats may have multiple hands after split). */
export interface BJMultiHandObj {
  cards: number[];
  total: number;
  hasAce: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  betAmount: string;   // NUMERIC as string (wei)
  result?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  payout: string;      // NUMERIC as string (wei)
  actions: any[];
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
}

export interface BJMultiSeatState {
  position: number;
  playerAddress: string | null;
  seatStatus: 'active' | 'sitting_out';
  consecutiveTimeouts: number;
  pendingBet: string;          // bet staged in betting phase
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
  // Round-specific (null when no active round or seat has no bet)
  betAmount: string;
  hands: BJMultiHandObj[];
  activeHandIndex: number;
  result?: string | null;
  payout: string;
  isActing: boolean;
}

export interface BJMultiTableState {
  tableId: string;
  status: string;
  minBet: string;
  maxBet: string;
  seats: BJMultiSeatState[];
  /** Dealer cards — only the first card is exposed during 'playing' phase */
  dealerCards: number[];
  dealerCardCount: number;   // total cards (for rendering face-down backs)
  dealerTotal: number;       // 0 unless dealer_turn or completed
  dealerHasAce: boolean;
  currentRoundId: string | null;
  actingSeatPosition: number | null;
  phase: 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed';
  roundNumber: number;
  /** Provably-fair commitment (0x-prefixed SHA-256 of the round's server seed). */
  serverSeedHash: string | null;
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  themeKind: 'video' | 'image';
  themeId: string;
  /** Sparse designer theme (layout/sounds/soundFx) or null for the stock table. */
  themeConfig: Record<string, unknown> | null;
  stateVersion: number;
}

export interface BJMultiTableSummary {
  id: string;
  status: string;
  minBet: string;
  maxBet: string;
  seatedCount: number;
  emptySeats: number;
  themeKind: 'video' | 'image';
  themeId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BlackjackMultiGameService {
  private readonly tableLocks = new KeyedMutex();
  private broadcastCallback: ((tableId: string) => Promise<void>) | null = null;
  private readonly stateVersions = new Map<string, number>();

  constructor(
    private readonly dbService: DatabaseService,
    private readonly pfService: ProvablyFairService,
  ) {}

  setBroadcastCallback(cb: (tableId: string) => Promise<void>): void {
    this.broadcastCallback = cb;
  }

  private async broadcastTableState(tableId: string, reason: string): Promise<void> {
    if (!this.broadcastCallback) return;
    await this.broadcastCallback(tableId).catch(err =>
      logger.error('BJMulti: broadcast error', { tableId, reason, error: err }),
    );
  }

  private get pool(): Pool {
    return this.dbService.getPool();
  }

  /** Bump and return the monotonic state version for a table. */
  private bumpStateVersion(tableId: string): number {
    const v = (this.stateVersions.get(tableId) ?? 0) + 1;
    this.stateVersions.set(tableId, v);
    return v;
  }

  /** Fire-and-forget audit log entry — never throws. */
  private audit(tableId: string, actionType: string, roundId?: string | null, playerAddress?: string | null, payload?: Record<string, any>): void {
    this.pool.query(
      `INSERT INTO blackjack_multi_audit_log (table_id, round_id, player_address, action_type, payload) VALUES ($1, $2, $3, $4, $5)`,
      [tableId, roundId ?? null, playerAddress ?? null, actionType, JSON.stringify(payload ?? {})],
    ).catch(err => logger.error('BJMulti audit log write failed', { tableId, actionType, error: err }));
  }

  /** Clear in-memory runtime metadata owned by this service for a table lifecycle transition. */
  private clearTableRuntimeState(tableId: string): void {
    this.stateVersions.delete(tableId);
    this.tableLocks.delete(tableId);
  }

  // --------------------------------------------------------------------------
  // Admin helpers
  // --------------------------------------------------------------------------

  async listTables(): Promise<BJMultiTableSummary[]> {
    const result = await this.pool.query(`
      SELECT t.id, t.status, t.min_bet, t.max_bet, t.theme_kind, t.theme_id,
             COUNT(s.id) AS seated_count
      FROM blackjack_multi_tables t
      LEFT JOIN blackjack_multi_seats s ON s.table_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at ASC
    `);
    return result.rows.map(r => ({
      id: r.id,
      status: r.status,
      minBet: r.min_bet,
      maxBet: r.max_bet,
      themeKind: r.theme_kind ?? 'video',
      themeId: r.theme_id ?? 'glowingTable',
      seatedCount: Number(r.seated_count),
      emptySeats: 3 - Number(r.seated_count),
    }));
  }

  async createTable(minBet: bigint, maxBet: bigint, themeKind = 'video', themeId = 'glowingTable'): Promise<{ id: string }> {
    const result = await this.pool.query(
      `INSERT INTO blackjack_multi_tables (min_bet, max_bet, theme_kind, theme_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [minBet.toString(), maxBet.toString(), themeKind, themeId],
    );
    return { id: result.rows[0].id };
  }

  /** Reads a table's saved theme; null when the table is stock or missing. */
  async getTableTheme(tableId: string): Promise<Record<string, unknown> | null> {
    const r = await this.pool.query(
      `SELECT theme_config FROM blackjack_multi_tables WHERE id = $1`, [tableId],
    );
    if (r.rows.length === 0) throw new Error('Table not found');
    return r.rows[0].theme_config ?? null;
  }

  /**
   * Saves (or clears, with null) a table's theme and pushes fresh state to
   * everyone seated, so a published look applies mid-session without a reload.
   */
  async setTableTheme(tableId: string, themeConfig: Record<string, unknown> | null): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE blackjack_multi_tables SET theme_config = $2 WHERE id = $1`,
      [tableId, themeConfig === null ? null : JSON.stringify(themeConfig)],
    );
    if ((r.rowCount ?? 0) === 0) return false;
    await this.broadcastTableState(tableId, 'theme_updated');
    return true;
  }

  async deleteTable(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const deleted = await this.dbService.withTransaction(async (client) => {
        // Lock the table row
        const tableResult = await client.query(
          `SELECT id FROM blackjack_multi_tables WHERE id = $1 FOR UPDATE`,
          [tableId],
        );
        if (tableResult.rows.length === 0) return false;

        // Refund pending bets on seats
        const seats = await client.query(
          `SELECT player_address, pending_bet FROM blackjack_multi_seats WHERE table_id = $1`,
          [tableId],
        );
        for (const seat of seats.rows) {
          const pending = BigInt(seat.pending_bet || '0');
          if (pending > 0n) {
            await applyPokerChipDelta(client, seat.player_address, pending / POKER_CHIP_WEI, 'blackjack_refund', {
              type: 'blackjack_multi',
              id: null,
            });
          }
        }

        // Refund committed (unsettled) round bets
        const unsettledBets = await client.query(
          `SELECT rs.player_address, rs.bet_amount, rs.hands
           FROM blackjack_multi_round_seats rs
           JOIN blackjack_multi_rounds r ON r.id = rs.round_id
           WHERE r.table_id = $1 AND rs.settled = FALSE`,
          [tableId],
        );
        for (const rs of unsettledBets.rows) {
          const betAmount = BigInt(rs.bet_amount || '0');
          if (betAmount > 0n) {
            await applyPokerChipDelta(client, rs.player_address, betAmount / POKER_CHIP_WEI, 'blackjack_refund', {
              type: 'blackjack_multi',
              id: null,
            });
          }
        }

        // Now safe to cascade delete
        await client.query(`DELETE FROM blackjack_multi_tables WHERE id = $1`, [tableId]);
        return true;
      });
      if (deleted) {
        this.clearTableRuntimeState(tableId);
      }
      return deleted;
    } finally {
      this.tableLocks.delete(tableId);
      release();
    }
  }

  /** Tip the dealer (house). Deducts from player balance, credits deployer wallet. */
  async tipDealer(tableId: string, playerAddress: string, amount: bigint): Promise<{ success: boolean }> {
    if (amount <= 0n) throw new Error('Tip amount must be positive');
    const maxTip = BigInt('5000000000000000000000'); // 5000 MORBIUS max tip
    if (amount > maxTip) throw new Error('Tip amount too large');
    if (amount % POKER_CHIP_WEI !== 0n) throw new Error('Tip must be a whole number of MORBIUS');

    const normalized = playerAddress.toLowerCase();
    const balance = await this.dbService.getChipBalanceAsWei(normalized);
    if (balance < amount) throw new Error('Insufficient balance to tip');

    const deployerWallet = (process.env.NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET || process.env.BLACKJACK_DEPLOYER_WALLET || '').toLowerCase();
    if (!deployerWallet) throw new Error('Deployer wallet not configured');

    // Move the tip in chips (1 chip = 1 MORBIUS), player → deployer, atomically.
    const tipChips = amount / POKER_CHIP_WEI;
    await this.dbService.withTransaction(async (client) => {
      await applyPokerChipDelta(client, normalized, -tipChips, 'blackjack_tip', { type: 'blackjack_tip', id: null });
      await applyPokerChipDelta(client, deployerWallet, tipChips, 'blackjack_tip', { type: 'blackjack_tip', id: null });
    });
    this.audit(tableId, 'tip_dealer', null, normalized, { amount: amount.toString(), recipient: deployerWallet });

    return { success: true };
  }

  /** Fetch completed rounds for a table (most recent first). */
  async getTableHistory(tableId: string, limit = 20): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT r.id, r.round_number, r.dealer_cards, r.dealer_total, r.dealer_has_ace,
             r.server_seed, r.server_seed_hash, r.completed_at,
             COALESCE(json_agg(json_build_object(
               'seatPosition', rs.seat_position,
               'playerAddress', rs.player_address,
               'hands', rs.hands,
               'result', rs.result,
               'payout', rs.payout,
               'betAmount', rs.bet_amount
             ) ORDER BY rs.seat_position) FILTER (WHERE rs.id IS NOT NULL), '[]') AS seats
      FROM blackjack_multi_rounds r
      LEFT JOIN blackjack_multi_round_seats rs ON rs.round_id = r.id
      WHERE r.table_id = $1 AND r.status = 'completed'
      GROUP BY r.id
      ORDER BY r.round_number DESC
      LIMIT $2
    `, [tableId, limit]);
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // Seat management
  // --------------------------------------------------------------------------

  async joinTable(tableId: string, playerAddress: string, seatPosition: number): Promise<BJMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const normalized = playerAddress.toLowerCase();

      // Validate table exists and is in a joinable state
      const tableResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
      );
      if (tableResult.rows.length === 0) throw new Error('Table not found');
      const table = tableResult.rows[0];
      if (!['waiting', 'betting', 'completed'].includes(table.status)) {
        throw new Error('Table is not accepting players right now');
      }
      if (![0, 1, 2].includes(seatPosition)) throw new Error('Invalid seat position');

      // Check not already seated
      const existingResult = await this.pool.query(
        `SELECT id FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, normalized],
      );
      if (existingResult.rows.length > 0) throw new Error('Already seated at this table');

      await this.pool.query(
        `INSERT INTO blackjack_multi_seats (table_id, position, player_address)
         VALUES ($1, $2, $3)`,
        [tableId, seatPosition, normalized],
      );
      this.audit(tableId, 'join_table', null, normalized, { seatPosition });

      // Transition to betting as soon as the first player joins
      if (table.status === 'waiting' || table.status === 'completed') {
        await this.pool.query(
          `UPDATE blackjack_multi_tables SET status = 'betting' WHERE id = $1`, [tableId],
        );
        await this.ensureBettingRound(tableId);
      }

      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  /**
   * Ensure the table has an open `betting` round. Its `created_at` is the ONLY
   * basis for the betting countdown — the client renders it as `bettingStartedAt`
   * and the timer watchdog uses it to decide when to fire handleBettingTimeout.
   *
   * A table sitting in status `betting` with no betting round is a frozen table:
   * players see no countdown and nothing ever starts the round.
   *
   * server_seed/hash are placeholders here — startRound() overwrites them with
   * the real committed values before any card is dealt.
   *
   * Caller must hold the table lock. Returns true if a round was created.
   */
  private async ensureBettingRound(tableId: string): Promise<boolean> {
    const existing = await this.pool.query(
      `SELECT 1 FROM blackjack_multi_rounds WHERE table_id = $1 AND status = 'betting' LIMIT 1`,
      [tableId],
    );
    if (existing.rows.length > 0) return false;

    const placeholderSeed = crypto.randomBytes(32).toString('hex');
    const placeholderHash = crypto.createHash('sha256').update(placeholderSeed).digest('hex');
    await this.pool.query(
      `INSERT INTO blackjack_multi_rounds (table_id, round_number, status, server_seed, server_seed_hash)
       SELECT $1, COALESCE(MAX(round_number), 0) + 1, 'betting', $2, $3
       FROM blackjack_multi_rounds WHERE table_id = $1`,
      [tableId, placeholderSeed, placeholderHash],
    );
    return true;
  }

  async leaveTable(tableId: string, playerAddress: string): Promise<BJMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const normalized = playerAddress.toLowerCase();

      // Refund pending bet if they had one
      const seatResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, normalized],
      );
      if (seatResult.rows.length === 0) throw new Error('Not seated at this table');
      const seat = seatResult.rows[0];

      // Block leaving if the player has an active (unsettled) round seat.
      // The auto-stand timeout will handle their hand if they disconnect.
      const activeRoundSeat = await this.pool.query(
        `SELECT rs.id FROM blackjack_multi_round_seats rs
         JOIN blackjack_multi_rounds r ON r.id = rs.round_id
         WHERE r.table_id = $1 AND LOWER(rs.player_address) = LOWER($2) AND rs.settled = FALSE`,
        [tableId, normalized],
      );
      if (activeRoundSeat.rows.length > 0) {
        throw new Error('Cannot leave while you have an active hand. Wait for the round to finish.');
      }

      // Refund pending bet atomically with seat deletion
      const pendingBet = BigInt(seat.pending_bet || '0');
      await this.dbService.withTransaction(async (client) => {
        if (pendingBet > 0n) {
          await applyPokerChipDelta(client, normalized, pendingBet / POKER_CHIP_WEI, 'blackjack_refund', {
            type: 'blackjack_multi',
            id: null,
          });
        }
        await client.query(
          `DELETE FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
          [tableId, normalized],
        );
      });
      this.audit(tableId, 'leave_table', null, normalized, { refundedBet: pendingBet.toString() });

      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  // --------------------------------------------------------------------------
  // Betting phase
  // --------------------------------------------------------------------------

  async placeBet(
    tableId: string,
    playerAddress: string,
    betAmount: bigint,
    clientSeed?: string,
  ): Promise<BJMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const normalized = playerAddress.toLowerCase();

      const tableResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
      );
      if (tableResult.rows.length === 0) throw new Error('Table not found');
      const table = tableResult.rows[0];

      // Only accept bets during betting (or waiting/completed which transition to betting)
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        throw new Error('Cannot place bets while a round is in progress. Wait for the current round to finish.');
      }

      const minBet = BigInt(table.min_bet);
      const maxBet = BigInt(table.max_bet);
      if (betAmount < minBet) throw new Error(`Minimum bet is ${minBet}`);
      if (betAmount > maxBet) throw new Error(`Maximum bet is ${maxBet}`);
      // Chips are whole integers (1 chip = 1 MORBIUS); reject sub-chip bets to avoid wei→chip truncation gaps.
      if (betAmount % POKER_CHIP_WEI !== 0n) throw new Error('Bet must be a whole number of MORBIUS');

      // Validate seat exists
      const seatResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, normalized],
      );
      if (seatResult.rows.length === 0) throw new Error('Not seated at this table');
      const seat = seatResult.rows[0];

      const normalizedClientSeed =
        typeof clientSeed === 'string' && clientSeed.length > 0
          ? clientSeed.slice(0, 255)
          : 'default';

      // Atomic: refund previous pending bet, deduct new bet, update seat — all in one transaction
      const prevPending = BigInt(seat.pending_bet || '0');
      await this.dbService.withTransaction(async (client) => {
        // Net change vs. the previously-staged bet, on the chip ledger (1 chip = 1 MORBIUS).
        // applyPokerChipDelta takes its own FOR UPDATE row lock + overdraft guard.
        const netDeduction = betAmount - prevPending;
        if (netDeduction > 0n) {
          try {
            await applyPokerChipDelta(client, normalized, -(netDeduction / POKER_CHIP_WEI), 'blackjack_bet', {
              type: 'blackjack_multi',
              id: null,
            });
          } catch (e) {
            if (e instanceof Error && /Insufficient poker chips/.test(e.message)) throw new Error('Insufficient balance');
            throw e;
          }
        } else if (netDeduction < 0n) {
          // New bet is smaller — refund the difference
          await applyPokerChipDelta(client, normalized, (-netDeduction) / POKER_CHIP_WEI, 'blackjack_refund', {
            type: 'blackjack_multi',
            id: null,
          });
        }
        // else netDeduction === 0 — same amount, no balance change needed

        await client.query(
          `UPDATE blackjack_multi_seats SET pending_bet = $1, consecutive_timeouts = 0, client_seed = $4 WHERE table_id = $2 AND LOWER(player_address) = LOWER($3)`,
          [betAmount.toString(), tableId, normalized, normalizedClientSeed],
        );
      });
      this.audit(tableId, 'place_bet', null, normalized, { betAmount: betAmount.toString() });

      // If table is still 'waiting' or 'completed', advance it to 'betting'.
      // Create the betting round alongside the status flip. joinTable does this on
      // the FIRST join, but once a round settles the table returns to 'completed'
      // and the next bet arrives here — which used to flip the status and nothing
      // else, leaving 'betting' with no round. The watchdog does eventually catch
      // that (its stuckBetting sweep hands it to handleBettingTimeout), but that
      // path starts the round IMMEDIATELY: no `bettingStartedAt` for the client
      // countdown, and everyone else at the table loses their window to bet.
      if (table.status === 'waiting' || table.status === 'completed') {
        await this.pool.query(
          `UPDATE blackjack_multi_tables SET status = 'betting' WHERE id = $1`, [tableId],
        );
        await this.ensureBettingRound(tableId);
      }

      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  /**
   * Check if the table is in betting phase and every seated player has placed a bet.
   * Used to skip the betting timer when there's no one left to wait for.
   */
  async allSeatedPlayersHaveBet(tableId: string): Promise<boolean> {
    const tableResult = await this.pool.query(
      `SELECT status FROM blackjack_multi_tables WHERE id = $1`, [tableId],
    );
    if (tableResult.rows.length === 0) return false;
    if (tableResult.rows[0].status !== 'betting') return false;

    const seatsResult = await this.pool.query(
      `SELECT pending_bet FROM blackjack_multi_seats WHERE table_id = $1`, [tableId],
    );
    if (seatsResult.rows.length === 0) return false;
    return seatsResult.rows.every(s => BigInt(s.pending_bet || '0') > 0n);
  }

  // --------------------------------------------------------------------------
  // Round lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a round: deduct bets, deal initial cards, set turn order.
   * Called when all seated players have bet OR betting timer expires.
   */
  async startRound(tableId: string): Promise<BJMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      return await this._startRoundInternal(tableId);
    } finally {
      release();
    }
  }

  /** Internal start-round logic — caller MUST hold the table lock. */
  private async _startRoundInternal(tableId: string): Promise<BJMultiTableState> {
    const tableResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    const table = tableResult.rows[0];
    if (table.status !== 'betting') throw new Error('Table is not in betting phase');

    // Load seats
    const seatsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
      [tableId],
    );
    const allSeats = seatsResult.rows;

    // Seats with a bet → they play this round (AFK counters handled in handleBettingTimeout).
    const bettingSeats = allSeats.filter(s => BigInt(s.pending_bet || '0') > 0n);

    if (bettingSeats.length === 0) {
      // No one bet — go back to waiting
      await this.pool.query(
        `UPDATE blackjack_multi_tables SET status = 'waiting' WHERE id = $1`, [tableId],
      );
      return this.getTableState(tableId);
    }

    // Reuse the existing betting round (created when first player joined), or get next round number
    const existingRoundResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_rounds WHERE table_id = $1 AND status = 'betting' ORDER BY created_at DESC LIMIT 1`,
      [tableId],
    );
    const existingRound = existingRoundResult.rows[0] ?? null;

    const roundNumResult = await this.pool.query(
      `SELECT COALESCE(MAX(round_number), 0) AS last FROM blackjack_multi_rounds WHERE table_id = $1`,
      [tableId],
    );
    const roundNumber = existingRound
      ? Number(existingRound.round_number)
      : Number(roundNumResult.rows[0].last) + 1;

    // Generate provably fair deck — round client seed = seat seeds in position order (colon-joined), max 255 chars
    const serverSeed = this.pfService.generateServerSeed();
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    const sortedBetting = [...bettingSeats].sort((a, b) => Number(a.position) - Number(b.position));
    const seedParts = sortedBetting.map((s) =>
      String(s.client_seed ?? 'default').slice(0, 255),
    );
    // Must fit blackjack_multi_rounds.client_seed (VARCHAR(255); see migration 137).
    // Two 32-char hex seeds + ':' = 65 chars — was failing at VARCHAR(64) with 2+ bettors.
    const joined = seedParts.join(':');
    const clientSeed = joined.length > 0 ? joined.slice(0, 255) : 'default';
    const deck = this.pfService.fisherYatesShuffle(serverSeed, clientSeed, roundNumber);

    // Initial deal: s0c1, s1c1, …, dealer_c1, s0c2, s1c2, …, dealer_c2
    let dp = 0;
    const initialCards1: number[] = bettingSeats.map(() => { const d = this.drawCard(deck, dp); dp = d.dp; return d.card; });
    const dc1 = this.drawCard(deck, dp); dp = dc1.dp; const dealerCard1 = dc1.card;
    const initialCards2: number[] = bettingSeats.map(() => { const d = this.drawCard(deck, dp); dp = d.dp; return d.card; });
    const dc2 = this.drawCard(deck, dp); dp = dc2.dp; const dealerCard2 = dc2.card;
    const dealerCards = [dealerCard1, dealerCard2];
    const dealerTotObj = this.pfService.calculateHandTotalV2(dealerCards);

    let roundId: string;
    if (existingRound) {
      // Update the placeholder betting round with real seeds
      await this.pool.query(
        `UPDATE blackjack_multi_rounds SET
           server_seed = $1, server_seed_hash = $2, client_seed = $3,
           dealer_cards = $4, dealer_total = $5, dealer_has_ace = $6,
           status = 'playing'
         WHERE id = $7`,
        [serverSeed, serverSeedHash, clientSeed,
         JSON.stringify(dealerCards), dealerTotObj.total, dealerTotObj.hasAce,
         existingRound.id],
      );
      roundId = existingRound.id;
    } else {
      // Fallback: insert a new round
      const roundResult = await this.pool.query(
        `INSERT INTO blackjack_multi_rounds
           (table_id, round_number, dealer_cards, dealer_total, dealer_has_ace,
            server_seed, server_seed_hash, client_seed, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'playing')
         RETURNING id`,
        [tableId, roundNumber, JSON.stringify(dealerCards), dealerTotObj.total, dealerTotObj.hasAce,
         serverSeed, serverSeedHash, clientSeed],
      );
      roundId = roundResult.rows[0].id;
    }

    // Create round_seat rows for each betting seat
    for (let i = 0; i < bettingSeats.length; i++) {
      const seat = bettingSeats[i];
      const betAmount = BigInt(seat.pending_bet);
      const cards = [initialCards1[i], initialCards2[i]];
      const handTot = this.pfService.calculateHandTotalV2(cards);
      const isBlackjack = this.pfService.isNaturalBlackjackV2(cards);
      const canSplit = this.canSplit(cards);

      const initialHand: BJMultiHandObj = {
        cards,
        total: handTot.total,
        hasAce: handTot.hasAce,
        isBlackjack,
        isBust: false,
        betAmount: betAmount.toString(),
        payout: '0',
        actions: [],
        canHit: !isBlackjack,
        canStand: !isBlackjack,
        canDoubleDown: !isBlackjack,
        canSplit: !isBlackjack && canSplit,
      };

      await this.pool.query(
        `INSERT INTO blackjack_multi_round_seats
           (round_id, seat_position, player_address, bet_amount, hands, active_hand_index)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [roundId, seat.position, seat.player_address, betAmount.toString(), JSON.stringify([initialHand])],
      );

      // Reset pending bet on the seat
      await this.pool.query(
        `UPDATE blackjack_multi_seats SET pending_bet = 0, status = 'active', consecutive_timeouts = 0 WHERE id = $1`,
        [seat.id],
      );
    }

    // Check if any seat has immediate blackjack — they don't need to act
    // Find first non-blackjack betting seat for first turn
    const firstActingSeat = await this.firstActiveTurnSeat(roundId);
    const now = new Date().toISOString();

    if (firstActingSeat !== null) {
      // Check for dealer blackjack — if dealer has BJ, all non-BJ seats lose immediately
      const dealerBlackjack = this.pfService.isNaturalBlackjackV2(dealerCards);
      if (dealerBlackjack) {
        await this.settleRoundInternal(tableId, roundId, deck, dp);
        return this.getTableState(tableId);
      }

      await this.pool.query(
        `UPDATE blackjack_multi_rounds SET acting_seat_position = $1, turn_started_at = $2 WHERE id = $3`,
        [firstActingSeat, now, roundId],
      );
      await this.pool.query(
        `UPDATE blackjack_multi_tables SET status = 'playing' WHERE id = $1`, [tableId],
      );
    } else {
      // All seats blackjack or no active seats — go straight to dealer
      await this.runDealerTurnInternal(tableId, roundId, deck, dp);
      return this.getTableState(tableId);
    }

    return this.getTableState(tableId);
  }

  /**
   * Handle a player action: hit / stand / double_down / split.
   */
  async playerAction(
    tableId: string,
    playerAddress: string,
    action: 'hit' | 'stand' | 'double_down' | 'split',
    handIndex?: number,
    actionId?: string,
  ): Promise<BJMultiTableState> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const normalized = playerAddress.toLowerCase();

      // Load round
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds WHERE table_id = $1 AND status = 'playing' ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      if (roundResult.rows.length === 0) throw new Error('No active round');
      const round = roundResult.rows[0];

      if (round.acting_seat_position === null) throw new Error('Not player turn');

      // Load this seat's round data
      const rsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [round.id, normalized],
      );
      if (rsResult.rows.length === 0) throw new Error('You are not in this round');
      const rs = rsResult.rows[0];
      if (rs.seat_position !== round.acting_seat_position) throw new Error('Not your turn');

      await this.pool.query(
        `UPDATE blackjack_multi_seats SET consecutive_timeouts = 0 WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, normalized],
      );

      // Idempotency check: reject duplicate action IDs
      if (actionId && rs.last_action_id === actionId) {
        logger.warn('BJMulti: duplicate actionId rejected', { tableId, actionId, seat: rs.seat_position });
        return this.getTableState(tableId);
      }

      const hi = handIndex ?? rs.active_hand_index ?? 0;
      const hands: BJMultiHandObj[] = rs.hands;
      if (!hands[hi]) throw new Error('Hand not found');
      const hand = hands[hi];

      if (!hand.canHit && !hand.canStand) throw new Error('This hand is already complete');

      // Re-derive deck
      const deck = this.pfService.fisherYatesShuffle(round.server_seed, round.client_seed, round.round_number);
      // Compute current deck position from cards dealt so far
      const dp = this.computeDeckPosition(round, rs, hands, hi);

      if (action === 'split') {
        await this.handleSplit(tableId, round, rs, hands, hi, deck, dp, normalized);
      } else {
        await this.handleHandAction(tableId, round, rs, hands, hi, action, deck, dp, normalized);
      }
      this.audit(tableId, action, round.id, normalized, { handIndex: hi, seatPosition: rs.seat_position });

      // Persist action ID for idempotency
      if (actionId) {
        await this.pool.query(
          `UPDATE blackjack_multi_round_seats SET last_action_id = $1 WHERE id = $2`,
          [actionId, rs.id],
        );
      }

      return this.getTableState(tableId);
    } finally {
      release();
    }
  }

  /**
   * Called by the timer watchdog: recover a round stranded in the `dealer_turn` phase.
   *
   * The dealer-turn → settle step (runDealerTurnInternal) flips the round/table to
   * `dealer_turn` OUTSIDE the settlement transaction, then draws the dealer, waits
   * ~300ms and settles. If settle throws, or the server restarts mid-dealer-turn
   * (e.g. a backend redeploy), the round/table are left in `dealer_turn` with no
   * player able to act — a permanently frozen table, since the other watchdog cases
   * only cover `betting`/`playing`/`waiting`/`completed`.
   *
   * Re-running the dealer turn is safe/idempotent: the dealer draw reads the current
   * dealer_cards and is a no-op once the dealer has reached 17+, the deck is
   * deterministic from the round seeds (so a pre-save crash reproduces the same
   * cards), and settleRoundInternal skips already-settled seats and completed rounds.
   */
  async recoverStuckDealerTurn(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds WHERE table_id = $1 AND status = 'dealer_turn' ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      if (roundResult.rows.length === 0) return; // already completed by the live path
      const round = roundResult.rows[0];
      logger.warn('BJMulti: recovering round stuck in dealer_turn', { tableId, roundId: round.id });
      const deck = this.pfService.fisherYatesShuffle(round.server_seed, round.client_seed, round.round_number);
      const dp = await this.computeDeckPositionAsync(round.id, round.dealer_cards);
      await this.runDealerTurnInternal(tableId, round.id, deck, dp);
    } finally {
      release();
    }
  }

  /**
   * Called by the timer watchdog: recover a table whose live round and table row
   * have drifted apart, or whose round is `playing` with nobody able to act.
   *
   * Both states are permanent freezes that none of the other watchdog cases can
   * clear:
   *
   * - `acting_seat_position IS NULL` on a `playing` round → autoStandTimedOut
   *   requires a non-null acting seat, so it never matches; and startBettingPhase
   *   is blocked by canCreateBettingRound while a non-completed round exists. The
   *   table sits mid-hand forever with the players' chips still staked.
   *
   * - `blackjack_multi_tables.status` disagreeing with the live round →
   *   getTableState reports `phase` straight from the TABLE row and picks the
   *   round snapshot by it (loadAuthorityRoundForSnapshot), so clients are told
   *   e.g. 'waiting' while a real round is in progress: the cards and action
   *   buttons vanish mid-hand even though the round is still live server-side.
   *   This is what a player sees as "the game froze".
   *
   * _startRoundInternal is the source of both: it flips the round to `playing`
   * up front, then deals seats, then sets acting_seat_position and the table
   * status across a dozen separate statements with no enclosing transaction. Any
   * throw in that window (or a redeploy) strands the round exactly here.
   *
   * Recovery is idempotent — state is re-read under the table lock, so a sweep
   * that overlaps a live deal simply finds nothing to do.
   */
  async recoverDesyncedTable(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    let recovered = false;
    try {
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds
         WHERE table_id = $1 AND status IN ('playing', 'dealer_turn')
         ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      if (roundResult.rows.length > 0) {
        const round = roundResult.rows[0];

        // 1. The live round is authoritative — realign the table row so clients
        //    are shown the phase they are actually in.
        const tableResult = await this.pool.query(
          `SELECT status FROM blackjack_multi_tables WHERE id = $1`, [tableId],
        );
        if (tableResult.rows.length > 0 && tableResult.rows[0].status !== round.status) {
          logger.warn('BJMulti: table status drifted from live round', {
            tableId, roundId: round.id, tableStatus: tableResult.rows[0].status, roundStatus: round.status,
          });
          await this.pool.query(
            `UPDATE blackjack_multi_tables SET status = $1 WHERE id = $2`, [round.status, tableId],
          );
          this.audit(tableId, 'recover_table_status', round.id, null, {
            from: tableResult.rows[0].status, to: round.status,
          });
          recovered = true;
        }

        // 2. A playing round with no acting seat has nobody to move it along.
        if (round.status === 'playing' && round.acting_seat_position === null) {
          logger.warn('BJMulti: recovering round stranded in playing with no acting seat', {
            tableId, roundId: round.id,
          });
          this.audit(tableId, 'recover_stranded_playing', round.id, null, {});

          const nextSeat = await this.firstActiveTurnSeat(round.id);
          if (nextSeat !== null) {
            await this.pool.query(
              `UPDATE blackjack_multi_rounds SET acting_seat_position = $1, turn_started_at = NOW() WHERE id = $2`,
              [nextSeat, round.id],
            );
          } else {
            // Nobody left to act (all blackjack, all finished, or the deal never
            // produced an actionable hand) — run the dealer and settle, which is
            // where the round should have gone in the first place.
            const deck = this.pfService.fisherYatesShuffle(round.server_seed, round.client_seed, round.round_number);
            const dp = await this.computeDeckPositionAsync(round.id, round.dealer_cards);
            await this.runDealerTurnInternal(tableId, round.id, deck, dp);
          }
          recovered = true;
        }
      }
    } finally {
      release();
    }

    if (recovered) await this.broadcastTableState(tableId, 'desync_recovery');
  }

  /**
   * Called by the timer watchdog: auto-stand the acting player if their 30s has expired.
   */
  async autoStandTimedOut(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds
         WHERE table_id = $1 AND status = 'playing'
           AND acting_seat_position IS NOT NULL
           AND turn_started_at < NOW() - ($2::text || ' seconds')::interval
         ORDER BY round_number DESC LIMIT 1`,
        [tableId, String(BJ_MULTI_TURN_TIMEOUT_SECONDS)],
      );
      if (roundResult.rows.length === 0) return;
      const round = roundResult.rows[0];
      const actingPos = round.acting_seat_position as number;

      const rsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 AND seat_position = $2`,
        [round.id, actingPos],
      );
      if (rsResult.rows.length === 0) {
        await this.advanceTurn(tableId, round.id);
        return;
      }
      const rs = rsResult.rows[0];

      const timeoutUp = await this.pool.query(
        `UPDATE blackjack_multi_seats
         SET consecutive_timeouts = consecutive_timeouts + 1
         WHERE table_id = $1 AND position = $2
         RETURNING consecutive_timeouts`,
        [tableId, actingPos],
      );
      if (timeoutUp.rows.length === 0) {
        logger.warn('BJMulti: auto-stand missing seat row for acting position', { tableId, actingPos });
        await this.advanceTurn(tableId, round.id);
        return;
      }
      const newTimeoutCount = Number(timeoutUp.rows[0].consecutive_timeouts ?? 0);

      if (newTimeoutCount >= BJ_MULTI_AFK_KICK_AFTER) {
        await this.kickActingPlayerMidRoundAfk(tableId, round.id, actingPos, rs, String(rs.player_address));
        return;
      }

      logger.info('BJMulti: auto-standing timed-out turn', {
        tableId, roundId: round.id, actingSeat: actingPos, consecutiveTimeouts: newTimeoutCount,
      });
      this.audit(tableId, 'auto_stand', round.id, null, { seatPosition: actingPos, consecutiveTimeouts: newTimeoutCount });

      const hands: BJMultiHandObj[] = rs.hands;
      const hi = rs.active_hand_index ?? 0;
      if (hands[hi]) {
        hands[hi].canHit = false;
        hands[hi].canStand = false;
        hands[hi].canDoubleDown = false;
        hands[hi].actions.push({ type: 'auto_stand', timestamp: Date.now() });
      }

      await this.pool.query(
        `UPDATE blackjack_multi_round_seats SET hands = $1 WHERE id = $2`,
        [JSON.stringify(hands), rs.id],
      );

      const nextInSeat = hands.findIndex((h, i) => i > hi && (h.canHit || h.canStand));
      if (nextInSeat !== -1) {
        await this.pool.query(
          `UPDATE blackjack_multi_round_seats SET hands = $1, active_hand_index = $2 WHERE id = $3`,
          [JSON.stringify(hands), nextInSeat, rs.id],
        );
        await this.pool.query(
          `UPDATE blackjack_multi_rounds SET turn_started_at = NOW() WHERE id = $1`, [round.id],
        );
      } else {
        await this.advanceTurn(tableId, round.id);
      }
    } finally {
      release();
    }

    await this.broadcastTableState(tableId, 'auto_stand_timeout');
  }

  /**
   * Called by the timer watchdog: transition a table from waiting to betting when
   * there are seated players, so the next round can start (15s betting timer applies).
   */
  private async loadLatestRoundMeta(tableId: string): Promise<{ status: string; completedAt: Date | null; roundNumber: number } | null> {
    const lastRoundResult = await this.pool.query(
      `SELECT status, completed_at, round_number
       FROM blackjack_multi_rounds
       WHERE table_id = $1
       ORDER BY round_number DESC
       LIMIT 1`,
      [tableId],
    );
    if (lastRoundResult.rows.length === 0) return null;
    const row = lastRoundResult.rows[0];
    return {
      status: String(row.status),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      roundNumber: Number(row.round_number ?? 0),
    };
  }

  private canCreateBettingRound(latestRound: { status: string; completedAt: Date | null } | null): boolean {
    if (!latestRound) return true;
    if (latestRound.status !== 'completed') return false;
    if (!latestRound.completedAt) return true;
    return Date.now() - latestRound.completedAt.getTime() >= BJ_MULTI_BETTING_RESTART_GRACE_MS;
  }

  private async createPlaceholderBettingRound(tableId: string, roundNumber: number): Promise<void> {
    const placeholderSeed = crypto.randomBytes(32).toString('hex');
    const placeholderHash = crypto.createHash('sha256').update(placeholderSeed).digest('hex');
    await this.pool.query(
      `INSERT INTO blackjack_multi_rounds (table_id, round_number, status, server_seed, server_seed_hash)
       VALUES ($1, $2, 'betting', $3, $4)`,
      [tableId, roundNumber, placeholderSeed, placeholderHash],
    );
  }

  async startBettingPhase(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const tableResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
      );
      if (tableResult.rows.length === 0) return;
      const table = tableResult.rows[0];
      if (table.status !== 'waiting' && table.status !== 'completed') return;

      const seatsResult = await this.pool.query(
        `SELECT id FROM blackjack_multi_seats WHERE table_id = $1`, [tableId],
      );
      if (seatsResult.rows.length === 0) return;

      // Only create a fresh betting round when transition guard passes.
      const latestRound = await this.loadLatestRoundMeta(tableId);
      if (!this.canCreateBettingRound(latestRound)) return;

      const roundNumber = (latestRound?.roundNumber ?? 0) + 1;
      await this.createPlaceholderBettingRound(tableId, roundNumber);
      await this.pool.query(
        `UPDATE blackjack_multi_tables SET status = 'betting' WHERE id = $1`, [tableId],
      );
    } finally {
      release();
    }
  }

  /**
   * Called by the timer watchdog: handle betting phase timeout.
   * Seats that haven't bet sit out (or get kicked), then start round if any bets exist.
   */
  async handleBettingTimeout(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const tableResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
      );
      if (tableResult.rows.length === 0) return;
      const table = tableResult.rows[0];
      if (table.status !== 'betting') return;

      let seatsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
        [tableId],
      );

      for (const seat of seatsResult.rows) {
        const hasBet = BigInt(seat.pending_bet || '0') > 0n;
        if (hasBet) {
          await this.pool.query(
            `UPDATE blackjack_multi_seats SET consecutive_timeouts = 0, status = 'active' WHERE id = $1`,
            [seat.id],
          );
        } else {
          const prev = Number(seat.consecutive_timeouts ?? 0);
          const newCount = prev + 1;
          if (newCount >= BJ_MULTI_AFK_KICK_AFTER) {
            await this.pool.query(`DELETE FROM blackjack_multi_seats WHERE id = $1`, [seat.id]);
            logger.info('BJMulti: kicked player for AFK (betting phase)', {
              tableId, position: seat.position, playerAddress: seat.player_address, consecutiveTimeouts: newCount,
            });
            this.audit(tableId, 'kick_afk_betting', null, seat.player_address, {
              consecutiveTimeouts: newCount, position: seat.position,
            });
          } else {
            await this.pool.query(
              `UPDATE blackjack_multi_seats SET consecutive_timeouts = $1, status = 'sitting_out' WHERE id = $2`,
              [newCount, seat.id],
            );
          }
        }
      }

      seatsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
        [tableId],
      );
      const bettingSeats = seatsResult.rows.filter(s => BigInt(s.pending_bet || '0') > 0n);
      if (bettingSeats.length === 0) {
        // No bets — revert to waiting and cancel the betting round so
        // startBettingPhase can create a fresh one on next timer tick.
        await this.pool.query(
          `UPDATE blackjack_multi_tables SET status = 'waiting' WHERE id = $1`, [tableId],
        );
        await this.pool.query(
          `UPDATE blackjack_multi_rounds SET status = 'completed', completed_at = NOW()
           WHERE table_id = $1 AND status = 'betting'`, [tableId],
        );
      } else {
        // Start round directly while holding the lock — no gap for interleaving
        await this._startRoundInternal(tableId);
      }
    } finally {
      release();
    }

    await this.broadcastTableState(tableId, 'betting_timeout');
  }

  // --------------------------------------------------------------------------
  // State query
  // --------------------------------------------------------------------------

  /**
   * Round snapshot authority:
   * - while playing/dealer_turn, prefer non-betting rounds so UI never "resets" to a placeholder betting round.
   * - otherwise, latest round is authoritative.
   */
  private async loadAuthorityRoundForSnapshot(tableId: string, tableStatus: string): Promise<any | null> {
    if (!['betting', 'playing', 'dealer_turn', 'completed'].includes(tableStatus)) {
      return null;
    }

    if (tableStatus === 'playing' || tableStatus === 'dealer_turn') {
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds
         WHERE table_id = $1 AND status IN ('playing', 'dealer_turn', 'completed')
         ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      return roundResult.rows[0] ?? null;
    }

    const roundResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_rounds WHERE table_id = $1 ORDER BY round_number DESC LIMIT 1`,
      [tableId],
    );
    return roundResult.rows[0] ?? null;
  }

  async getTableState(tableId: string): Promise<BJMultiTableState> {
    const tableResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_tables WHERE id = $1`, [tableId],
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    const table = tableResult.rows[0];

    const seatsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 ORDER BY position ASC`,
      [tableId],
    );
    const dbSeats = seatsResult.rows;

    // Load active round snapshot from the authority rule above.
    const round = await this.loadAuthorityRoundForSnapshot(tableId, table.status);
    let roundSeats: any[] = [];
    if (round) {
      const rsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1`,
        [round.id],
      );
      roundSeats = rsResult.rows;
    }

    // Enrich with profiles
    const addresses = dbSeats.map(s => s.player_address).filter(Boolean) as string[];
    const profiles = addresses.length > 0 ? await this.dbService.getProfiles(addresses) : new Map();

    // Ensure every seated player has an avatar (placeholder from unlocked cosmetics if none set)
    const placeholderByAddress = new Map<string, Record<string, unknown>>();
    const needPlaceholder = addresses.filter(addr => {
      const profile = profiles.get(addr.toLowerCase());
      return !profile || profile.avatarConfig == null;
    });
    if (needPlaceholder.length > 0) {
      const cosmeticsService = new CosmeticsService(this.pool);
      for (const addr of needPlaceholder) {
        try {
          const inventory = await cosmeticsService.getInventory(addr);
          const placeholder = randomPlaceholderConfig(new Set(inventory));
          await this.dbService.setDefaultAvatarIfNull(addr, placeholder);
          placeholderByAddress.set(addr.toLowerCase(), placeholder);
        } catch (err) {
          logger.warn(`BJ multi: failed to set placeholder avatar for ${addr}: ${(err as Error).message}`);
        }
      }
    }

    // Build seat states — always emit all 3 positions
    const seatMap = new Map(dbSeats.map(s => [s.position, s]));
    const roundSeatMap = new Map(roundSeats.map(rs => [rs.seat_position, rs]));

    const seats: BJMultiSeatState[] = [0, 1, 2].map(pos => {
      const seat = seatMap.get(pos);
      if (!seat) {
        return {
          position: pos,
          playerAddress: null,
          seatStatus: 'active' as const,
          consecutiveTimeouts: 0,
          pendingBet: '0',
          betAmount: '0',
          hands: [],
          activeHandIndex: 0,
          payout: '0',
          isActing: false,
        };
      }

      const profile = profiles.get(seat.player_address.toLowerCase());
      const rs = roundSeatMap.get(pos);
      const isActing = round?.acting_seat_position === pos &&
        ['playing'].includes(round?.status ?? '');

      return {
        position: pos,
        playerAddress: seat.player_address,
        seatStatus: seat.status,
        consecutiveTimeouts: Number(seat.consecutive_timeouts ?? 0),
        pendingBet: seat.pending_bet || '0',
        displayName: profile?.displayName ?? null,
        profileImageUrl: profile?.profileImageUrl ?? null,
        avatarConfig: profile?.avatarConfig ?? placeholderByAddress.get(seat.player_address.toLowerCase()) ?? null,
        profileDisplayMode: profile?.profileDisplayMode ?? 'avatar',
        betAmount: rs ? rs.bet_amount : '0',
        hands: rs ? (rs.hands as BJMultiHandObj[]) : [],
        activeHandIndex: rs ? (rs.active_hand_index ?? 0) : 0,
        result: rs ? rs.result : null,
        payout: rs ? rs.payout : '0',
        isActing,
      };
    });

    // During 'playing' phase, hide the hole card (only show first dealer card)
    // Reveal all cards on dealer_turn / completed (matches single-player behavior)
    const dealerCardsRaw: number[] = round?.dealer_cards ?? [];
    const dealerCardsVisible = table.status === 'playing'
      ? dealerCardsRaw.slice(0, 1) // only the up-card
      : dealerCardsRaw;

    const dealerTotObj = dealerCardsVisible.length > 0
      ? this.pfService.calculateHandTotalV2(dealerCardsVisible)
      : { total: 0, hasAce: false };

    return {
      tableId,
      status: table.status,
      minBet: table.min_bet,
      maxBet: table.max_bet,
      seats,
      dealerCards: dealerCardsVisible,
      dealerCardCount: dealerCardsRaw.length,
      dealerTotal: dealerTotObj.total,
      dealerHasAce: dealerTotObj.hasAce,
      currentRoundId: round?.id ?? null,
      actingSeatPosition: round?.acting_seat_position ?? null,
      phase: (table.status as BJMultiTableState['phase']),
      roundNumber: round?.round_number ?? 0,
      // The provably-fair commitment for the current round, shown in the
      // fairness panel while the round runs. The plaintext seed stays hidden
      // until the round completes (it lives in the same row; only the hash is
      // ever put on the wire here).
      serverSeedHash: round?.server_seed_hash ? `0x${round.server_seed_hash}` : null,
      turnStartedAt: round?.turn_started_at?.toISOString?.() ?? null,
      bettingStartedAt: (round?.status === 'betting' ? round?.created_at?.toISOString?.() : null) ?? null,
      themeKind: (table.theme_kind ?? 'video') as 'video' | 'image',
      themeId: table.theme_id ?? 'glowingTable',
      themeConfig: table.theme_config ?? null,
      stateVersion: this.bumpStateVersion(tableId),
    };
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /** Compute current deck position from all cards already in play for this round. */
  private computeDeckPosition(round: any, _currentRS: any, _hands: BJMultiHandObj[], _hi: number): number {
    // Initial deal used: bettingSeatsCount * 2 (player cards) + 2 (dealer) positions
    // Then each additional card per hit/double/split adds 1
    // We calculate by counting total cards across all round_seats + dealer
    // This is called within playerAction which holds the lock, so we can rely on DB state being up-to-date
    // We'll do a fresh count from the round's dealer_cards and all round_seats via a separate query.
    // Since this is sync and we're in an async context, we handle it differently below.
    // NOTE: actual deck position recomputation is done in handleHandAction/handleSplit which do a fresh DB read.
    return 0; // placeholder; actual dp computed in callers via computeDeckPositionAsync
  }

  private async computeDeckPositionAsync(roundId: string, dealerCards: number[]): Promise<number> {
    const rsResult = await this.pool.query(
      `SELECT hands FROM blackjack_multi_round_seats WHERE round_id = $1`,
      [roundId],
    );
    let totalCards = dealerCards.length;
    for (const row of rsResult.rows) {
      const hands: BJMultiHandObj[] = row.hands;
      for (const h of hands) {
        totalCards += h.cards.length;
      }
    }
    return totalCards;
  }

  /** Safe deck draw — throws if deck is exhausted (should never happen with 6-deck shoe). */
  private drawCard(deck: number[], dp: number): { card: number; dp: number } {
    if (dp >= deck.length) {
      throw new Error(`Deck exhausted at position ${dp}/${deck.length} — cannot draw`);
    }
    return { card: deck[dp], dp: dp + 1 };
  }

  private canSplit(cards: number[]): boolean {
    if (cards.length !== 2) return false;
    const r1 = this.pfService.cardIndexToRank(Number(cards[0]));
    const r2 = this.pfService.cardIndexToRank(Number(cards[1]));
    const val = (r: number) => (r >= 10 ? 10 : r);
    return val(r1) === val(r2);
  }

  private async handleHandAction(
    tableId: string,
    round: any,
    rs: any,
    hands: BJMultiHandObj[],
    hi: number,
    action: 'hit' | 'stand' | 'double_down',
    deck: number[],
    _dp: number,
    playerAddress: string,
  ): Promise<void> {
    const hand = hands[hi];

    // Recompute actual deck position from DB state
    let dp = await this.computeDeckPositionAsync(round.id, round.dealer_cards);

    if (action === 'hit') {
      const draw = this.drawCard(deck, dp); dp = draw.dp;
      const card = draw.card;
      hand.cards.push(card);
      hand.actions.push({ type: 'hit', card, timestamp: Date.now() });
      const tot = this.pfService.calculateHandTotalV2(hand.cards);
      hand.total = tot.total;
      hand.hasAce = tot.hasAce;
      if (hand.total > 21) {
        hand.isBust = true;
        hand.result = 'loss';
        hand.canHit = false;
        hand.canStand = false;
        hand.canDoubleDown = false;
        hand.canSplit = false;
      }
    } else if (action === 'stand') {
      hand.actions.push({ type: 'stand', timestamp: Date.now() });
      hand.canHit = false;
      hand.canStand = false;
      hand.canDoubleDown = false;
      hand.canSplit = false;
    } else if (action === 'double_down') {
      if (hand.cards.length !== 2) throw new Error('Can only double down on first two cards');
      const bet = BigInt(hand.betAmount);
      const balance = await this.dbService.getChipBalanceAsWei(playerAddress);
      if (balance < bet) throw new Error('Insufficient balance to double down');
      await this.dbService.debitChipsForWei(playerAddress, bet, 'blackjack_bet', { type: 'blackjack_multi', id: round.id });

      hand.betAmount = (bet * 2n).toString();
      const draw = this.drawCard(deck, dp); dp = draw.dp;
      const card = draw.card;
      hand.cards.push(card);
      hand.actions.push({ type: 'double_down', card, timestamp: Date.now() });
      const tot = this.pfService.calculateHandTotalV2(hand.cards);
      hand.total = tot.total;
      hand.hasAce = tot.hasAce;
      if (hand.total > 21) { hand.isBust = true; hand.result = 'loss'; }
      hand.canHit = false;
      hand.canStand = false;
      hand.canDoubleDown = false;
      hand.canSplit = false;
    }

    hands[hi] = hand;

    // Check if this hand is done and if there are more hands (split scenario)
    const handDone = !hand.canHit && !hand.canStand;
    let nextHandIndex = rs.active_hand_index;

    if (handDone) {
      const nextInSeat = hands.findIndex((h, i) => i > hi && (h.canHit || h.canStand));
      if (nextInSeat !== -1) {
        nextHandIndex = nextInSeat;
        await this.pool.query(
          `UPDATE blackjack_multi_round_seats SET hands = $1, active_hand_index = $2 WHERE id = $3`,
          [JSON.stringify(hands), nextHandIndex, rs.id],
        );
        // Update turn timer (still same seat, new hand)
        await this.pool.query(
          `UPDATE blackjack_multi_rounds SET turn_started_at = NOW() WHERE id = $1`, [round.id],
        );
        return; // stay on this seat
      }
    }

    await this.pool.query(
      `UPDATE blackjack_multi_round_seats SET hands = $1, active_hand_index = $2 WHERE id = $3`,
      [JSON.stringify(hands), nextHandIndex, rs.id],
    );

    if (handDone) {
      await this.advanceTurn(tableId, round.id);
    }
  }

  private async handleSplit(
    tableId: string,
    round: any,
    rs: any,
    hands: BJMultiHandObj[],
    hi: number,
    deck: number[],
    _dp: number,
    playerAddress: string,
  ): Promise<void> {
    const hand = hands[hi];
    if (!this.canSplit(hand.cards)) throw new Error('Cannot split this hand');

    const bet = BigInt(hand.betAmount);
    const balance = await this.dbService.getChipBalanceAsWei(playerAddress);
    if (balance < bet) throw new Error('Insufficient balance to split');
    await this.dbService.debitChipsForWei(playerAddress, bet, 'blackjack_bet', { type: 'blackjack_multi', id: round.id });

    let dp = await this.computeDeckPositionAsync(round.id, round.dealer_cards);

    const draw1 = this.drawCard(deck, dp); dp = draw1.dp; const card1 = draw1.card;
    const draw2 = this.drawCard(deck, dp); dp = draw2.dp; const card2 = draw2.card;

    const h1Cards = [hand.cards[0], card1];
    const h2Cards = [hand.cards[1], card2];
    const h1Tot = this.pfService.calculateHandTotalV2(h1Cards);
    const h2Tot = this.pfService.calculateHandTotalV2(h2Cards);

    const newHand1: BJMultiHandObj = {
      cards: h1Cards,
      total: h1Tot.total,
      hasAce: h1Tot.hasAce,
      isBlackjack: false,
      isBust: false,
      betAmount: bet.toString(),
      payout: '0',
      actions: [{ type: 'split', timestamp: Date.now() }],
      canHit: true,
      canStand: true,
      canDoubleDown: h1Cards.length === 2,
      canSplit: false,
    };
    const newHand2: BJMultiHandObj = {
      ...newHand1,
      cards: h2Cards,
      total: h2Tot.total,
      hasAce: h2Tot.hasAce,
      actions: [{ type: 'split', timestamp: Date.now() }],
    };

    hands.splice(hi, 1, newHand1, newHand2);

    await this.pool.query(
      `UPDATE blackjack_multi_round_seats SET hands = $1, active_hand_index = $2 WHERE id = $3`,
      [JSON.stringify(hands), hi, rs.id],
    );

    // Update turn timer (still same seat)
    await this.pool.query(
      `UPDATE blackjack_multi_rounds SET turn_started_at = NOW() WHERE id = $1`, [round.id],
    );
  }

  /**
   * Refund all chips in play for this round seat, remove round + table seat, then advance play.
   * Caller must hold the table lock.
   */
  private async kickActingPlayerMidRoundAfk(
    tableId: string,
    roundId: string,
    actingSeatPosition: number,
    rs: { id: string; hands: BJMultiHandObj[] },
    playerAddress: string,
  ): Promise<void> {
    const norm = playerAddress.toLowerCase();
    let refund = 0n;
    for (const h of rs.hands) {
      refund += BigInt(h.betAmount || '0');
    }

    await this.dbService.withTransaction(async (client) => {
      if (refund > 0n) {
        await applyPokerChipDelta(client, norm, refund / POKER_CHIP_WEI, 'blackjack_refund', {
          type: 'blackjack_multi',
          id: roundId,
        });
      }
      await client.query(`DELETE FROM blackjack_multi_round_seats WHERE id = $1`, [rs.id]);
      await client.query(
        `DELETE FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, norm],
      );
    });

    logger.info('BJMulti: kicked player for AFK (mid-round)', {
      tableId, roundId, position: actingSeatPosition, playerAddress: norm, refund: refund.toString(),
    });
    this.audit(tableId, 'kick_afk_mid_round', roundId, norm, {
      refund: refund.toString(), seatPosition: actingSeatPosition,
    });

    await this.advanceTurn(tableId, roundId);
  }

  /**
   * Advance acting_seat_position to the next seat that still has active hands.
   * If no more seats remain, trigger dealer turn.
   */
  private async advanceTurn(tableId: string, roundId: string): Promise<void> {
    const roundResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_rounds WHERE id = $1`, [roundId],
    );
    const round = roundResult.rows[0];
    const currentPos = round.acting_seat_position;

    // Find next seat > currentPos that has an active hand
    const rsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 ORDER BY seat_position ASC`,
      [roundId],
    );
    const roundSeats = rsResult.rows;

    const nextSeat = roundSeats.find(rs => {
      if (rs.seat_position <= (currentPos ?? -1)) return false;
      const hands: BJMultiHandObj[] = rs.hands;
      return hands.some(h => h.canHit || h.canStand);
    });

    if (nextSeat) {
      await this.pool.query(
        `UPDATE blackjack_multi_rounds SET acting_seat_position = $1, turn_started_at = NOW() WHERE id = $2`,
        [nextSeat.seat_position, roundId],
      );
    } else {
      // All player turns complete — dealer turn
      const deck = this.pfService.fisherYatesShuffle(round.server_seed, round.client_seed, round.round_number);
      const dp = await this.computeDeckPositionAsync(roundId, round.dealer_cards);
      await this.runDealerTurnInternal(tableId, roundId, deck, dp);
    }
  }

  private async runDealerTurnInternal(tableId: string, roundId: string, deck: number[], dp: number): Promise<void> {
    // turn_started_at doubles as the "entered dealer_turn at" marker so the timer
    // watchdog can detect (and recover) a dealer turn whose settle never completed.
    await this.pool.query(
      `UPDATE blackjack_multi_rounds SET status = 'dealer_turn', acting_seat_position = NULL, turn_started_at = NOW() WHERE id = $1`,
      [roundId],
    );
    await this.pool.query(
      `UPDATE blackjack_multi_tables SET status = 'dealer_turn' WHERE id = $1`, [tableId],
    );

    const roundResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_rounds WHERE id = $1`, [roundId],
    );
    const round = roundResult.rows[0];
    const dealerCards: number[] = round.dealer_cards;

    // Dealer stands on all 17s (S17)
    while (true) {
      const dh = this.pfService.calculateHandTotalV2(dealerCards);
      if (dh.total >= 17) break;
      const draw = this.drawCard(deck, dp); dp = draw.dp;
      dealerCards.push(draw.card);
    }

    const finalDh = this.pfService.calculateHandTotalV2(dealerCards);
    await this.pool.query(
      `UPDATE blackjack_multi_rounds SET dealer_cards = $1, dealer_total = $2, dealer_has_ace = $3 WHERE id = $4`,
      [JSON.stringify(dealerCards), finalDh.total, finalDh.hasAce, roundId],
    );

    // Broadcast dealer_turn state so clients can animate the card reveal
    // before the round settles to completed. The delay gives WS clients time
    // to receive the dealer_turn snapshot and start the reveal animation.
    await this.broadcastTableState(tableId, 'dealer_turn_reveal');
    await new Promise(resolve => setTimeout(resolve, 300));

    await this.settleRoundInternal(tableId, roundId, deck, dp);
  }

  private async settleRoundInternal(tableId: string, roundId: string, _deck: number[], _dp: number): Promise<void> {
    const roundResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_rounds WHERE id = $1`, [roundId],
    );
    const round = roundResult.rows[0];

    // Guard: don't re-settle an already completed round
    if (round.status === 'completed') {
      logger.warn('BJMulti: settleRoundInternal called on already-completed round', { roundId });
      return;
    }

    const dealerCards: number[] = round.dealer_cards;
    const dealerTotal = this.pfService.calculateHandTotalV2(dealerCards).total;
    const dealerBlackjack = this.pfService.isNaturalBlackjackV2(dealerCards);

    const rsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1`, [roundId],
    );

    // Wrap all seat settlements + round completion in a single transaction.
    // If the server crashes mid-settlement, the entire transaction rolls back
    // and no seats are left in an inconsistent settled/unsettled state.
    await this.dbService.withTransaction(async (client) => {
      for (const rs of rsResult.rows) {
        // Guard: skip seats already settled (prevents double-crediting)
        if (rs.settled) {
          logger.warn('BJMulti: skipping already-settled seat', { roundId, seatId: rs.id });
          continue;
        }

        const hands: BJMultiHandObj[] = rs.hands;
        let totalPayout = 0n;

        for (const hand of hands) {
          if (hand.isBlackjack) {
            if (dealerBlackjack) {
              hand.result = 'push';
              hand.payout = hand.betAmount; // return stake
            } else {
              hand.result = 'blackjack';
              // 3:2 blackjack payout floored to whole chips (1 chip = 1 MORBIUS)
              const bjBet = BigInt(hand.betAmount);
              hand.payout = bjMultiPayoutWhole(bjBet).toString();
            }
          } else if (hand.isBust) {
            hand.result = 'loss';
            hand.payout = '0';
          } else if (dealerBlackjack) {
            hand.result = 'loss';
            hand.payout = '0';
          } else if (dealerTotal > 21) {
            hand.result = 'win';
            hand.payout = (BigInt(hand.betAmount) * 2n).toString();
          } else if (hand.total > dealerTotal) {
            hand.result = 'win';
            hand.payout = (BigInt(hand.betAmount) * 2n).toString();
          } else if (hand.total < dealerTotal) {
            hand.result = 'loss';
            hand.payout = '0';
          } else {
            hand.result = 'push';
            hand.payout = hand.betAmount;
          }
          totalPayout += BigInt(hand.payout);
        }

        // Determine overall result for the seat
        const hasWin = hands.some(h => h.result === 'win' || h.result === 'blackjack');
        const allPush = hands.every(h => h.result === 'push');
        const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';

        await client.query(
          `UPDATE blackjack_multi_round_seats SET hands = $1, result = $2, payout = $3, settled = TRUE WHERE id = $4`,
          [JSON.stringify(hands), overallResult, totalPayout.toString(), rs.id],
        );

        // Credit payout to the chip ledger (1 chip = 1 MORBIUS)
        if (totalPayout > 0n) {
          await applyPokerChipDelta(client, rs.player_address, totalPayout / POKER_CHIP_WEI, 'blackjack_payout', {
            type: 'blackjack_multi',
            id: roundId,
          });
        }

        // Fan out settled hands into game_hands so history/verification use one table
        for (let hi = 0; hi < hands.length; hi++) {
          const h = hands[hi];
          const hTotal = this.pfService.calculateHandTotalV2(h.cards);
          await this.dbService.createGameHandInTx(client, rs.id, {
            hand_index: hi,
            cards: h.cards,
            total: hTotal.total,
            has_ace: hTotal.hasAce,
            is_blackjack: Boolean(h.isBlackjack),
            is_bust: Boolean(h.isBust),
            bet_amount: BigInt(h.betAmount || '0'),
            result: (h.result as any) ?? 'loss',
            payout: BigInt(h.payout || '0'),
            actions: h.actions ?? [],
          });
        }

        // Wheel/milestone credit is best-effort: a failure here must not cost the
        // player their settled payout. It runs on the settle transaction's client
        // though, and in Postgres any failed statement aborts the whole
        // transaction — every later command then fails with 25P02
        // ("current transaction is aborted") until it unwinds. Swallowing the
        // error without unwinding therefore took down the round completion below
        // and surfaced 25P02 to the player, hiding the real cause in a warning.
        // A savepoint scopes the damage: roll back just this block and the rest
        // of the settlement proceeds on a healthy transaction.
        await client.query('SAVEPOINT bj_multi_wheel_ledger');
        try {
          const totalWagered = hands.reduce(
            (sum: bigint, h: any) => sum + BigInt(h.betAmount || '0'),
            0n,
          );
          if (totalWagered > 0n && rs.player_address) {
            await applyWheelWagerCredit(
              client,
              rs.player_address,
              totalWagered,
              'wager_volume_blackjack_multi',
              { type: 'round_seat', id: rs.id },
            );
            await recordDailyMilestone(client, rs.player_address, 'first_blackjack_multi');
            await recordGameOutcome(
              client,
              rs.player_address,
              'blackjack_multi',
              overallResult === 'win',
            );
          }
          await client.query('RELEASE SAVEPOINT bj_multi_wheel_ledger');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT bj_multi_wheel_ledger');
          await client.query('RELEASE SAVEPOINT bj_multi_wheel_ledger');
          logger.warn('wheel ledger update failed (multi blackjack)', {
            seatId: rs.id,
            roundId,
            code: (e as { code?: string }).code,
            error: (e as Error).message,
          });
        }
      }

      // Reveal server seed and mark complete.
      // Table goes to 'completed' (NOT 'waiting') so getTableState still returns round
      // data (dealer cards, results, payouts). The timer watchdog transitions to betting later.
      await client.query(
        `UPDATE blackjack_multi_rounds SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [roundId],
      );
      await client.query(
        `UPDATE blackjack_multi_tables SET status = 'completed' WHERE id = $1`, [tableId],
      );
    });
    this.audit(tableId, 'settle', roundId, null, { dealerTotal, dealerBlackjack, seatCount: rsResult.rows.length });
  }

  /**
   * Find the first seat position that has an active (non-blackjack) hand.
   * Returns null if all are blackjacks, all are finished, or there are no seats.
   */
  private async firstActiveTurnSeat(roundId: string): Promise<number | null> {
    // After insert, reload round_seats
    const rsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 ORDER BY seat_position ASC`,
      [roundId],
    );
    for (const rs of rsResult.rows) {
      const hands: BJMultiHandObj[] = rs.hands;
      if (hands.some(h => h.canHit || h.canStand)) {
        return rs.seat_position;
      }
    }
    return null;
  }
}
