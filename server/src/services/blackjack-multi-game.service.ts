import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { CosmeticsService } from './cosmetics.service';
import { randomPlaceholderConfig } from '../lib/cosmetics-catalog';
import { logger } from '../utils/logger';

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
  consecutiveSitOuts: number;
  pendingBet: string;          // bet staged in betting phase
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
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
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  themeKind: 'video' | 'image';
  themeId: string;
  stateVersion: number;
}

export interface BJMultiTableSummary {
  id: string;
  status: string;
  minBet: string;
  maxBet: string;
  seatedCount: number;
  emptySeats: number;
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

  async deleteTable(tableId: string): Promise<boolean> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      return await this.dbService.withTransaction(async (client) => {
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
            await client.query(
              `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
              [seat.player_address, pending.toString()],
            );
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
            await client.query(
              `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
              [rs.player_address, betAmount.toString()],
            );
          }
        }

        // Now safe to cascade delete
        await client.query(`DELETE FROM blackjack_multi_tables WHERE id = $1`, [tableId]);
        return true;
      });
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

    const normalized = playerAddress.toLowerCase();
    const balance = await this.dbService.getPlayerBalance(normalized);
    if (balance < amount) throw new Error('Insufficient balance to tip');

    const deployerWallet = (process.env.NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET || process.env.BLACKJACK_DEPLOYER_WALLET || '').toLowerCase();
    if (!deployerWallet) throw new Error('Deployer wallet not configured');

    await this.dbService.deductPlayerBalance(normalized, amount);
    await this.dbService.addPlayerBalance(deployerWallet, amount);
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
        // Create a betting round so the timer has a created_at to track.
        // server_seed/hash are placeholders — overwritten with real values in startRound().
        const placeholderSeed = require('crypto').randomBytes(32).toString('hex');
        const placeholderHash = require('crypto').createHash('sha256').update(placeholderSeed).digest('hex');
        await this.pool.query(
          `INSERT INTO blackjack_multi_rounds (table_id, round_number, status, server_seed, server_seed_hash)
           SELECT $1, COALESCE(MAX(round_number), 0) + 1, 'betting', $2, $3
           FROM blackjack_multi_rounds WHERE table_id = $1`,
          [tableId, placeholderSeed, placeholderHash],
        );
      }

      return this.getTableState(tableId);
    } finally {
      release();
    }
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
          await client.query(
            `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
            [normalized, pendingBet.toString()],
          );
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

  async placeBet(tableId: string, playerAddress: string, betAmount: bigint): Promise<BJMultiTableState> {
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

      // Validate seat exists
      const seatResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, normalized],
      );
      if (seatResult.rows.length === 0) throw new Error('Not seated at this table');
      const seat = seatResult.rows[0];

      // Atomic: refund previous pending bet, deduct new bet, update seat — all in one transaction
      const prevPending = BigInt(seat.pending_bet || '0');
      await this.dbService.withTransaction(async (client) => {
        // Lock player row to serialize concurrent balance changes
        const playerLock = await client.query(
          `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
          [normalized],
        );
        if (playerLock.rows.length === 0) throw new Error('Player not found');

        const currentBalance = BigInt(playerLock.rows[0].balance || '0');
        // Net change: refund old pending, deduct new bet
        const netDeduction = betAmount - prevPending;
        if (netDeduction > 0n) {
          if (currentBalance < netDeduction) throw new Error('Insufficient balance');
          await client.query(
            `UPDATE players SET balance = balance - $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
            [normalized, netDeduction.toString()],
          );
        } else if (netDeduction < 0n) {
          // New bet is smaller — refund the difference
          await client.query(
            `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
            [normalized, (-netDeduction).toString()],
          );
        }
        // else netDeduction === 0 — same amount, no balance change needed

        await client.query(
          `UPDATE blackjack_multi_seats SET pending_bet = $1 WHERE table_id = $2 AND LOWER(player_address) = LOWER($3)`,
          [betAmount.toString(), tableId, normalized],
        );
      });
      this.audit(tableId, 'place_bet', null, normalized, { betAmount: betAmount.toString() });

      // If table is still 'waiting' or 'completed', advance it to 'betting'
      if (table.status === 'waiting' || table.status === 'completed') {
        await this.pool.query(
          `UPDATE blackjack_multi_tables SET status = 'betting' WHERE id = $1`, [tableId],
        );
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

    // Seats with a bet → they play this round
    const bettingSeats = allSeats.filter(s => BigInt(s.pending_bet || '0') > 0n);
    // Seats without a bet → sit out and increment counter
    const nonBettingSeats = allSeats.filter(s => BigInt(s.pending_bet || '0') === 0n);

    for (const seat of nonBettingSeats) {
      const newCount = (seat.consecutive_sit_outs || 0) + 1;
      if (newCount >= 3) {
        // Kick player
        await this.pool.query(
          `DELETE FROM blackjack_multi_seats WHERE id = $1`, [seat.id],
        );
        logger.info('BJMulti: kicked player for 3 consecutive sit-outs', {
          tableId, position: seat.position, playerAddress: seat.player_address,
        });
      } else {
        await this.pool.query(
          `UPDATE blackjack_multi_seats SET status = 'sitting_out', consecutive_sit_outs = $1 WHERE id = $2`,
          [newCount, seat.id],
        );
      }
    }

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

    // Generate provably fair deck
    const serverSeed = this.pfService.generateServerSeed();
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    const clientSeed = 'default';
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
        `UPDATE blackjack_multi_seats SET pending_bet = 0, status = 'active', consecutive_sit_outs = 0 WHERE id = $1`,
        [seat.id],
      );
    }

    // Check if any seat has immediate blackjack — they don't need to act
    // Find first non-blackjack betting seat for first turn
    const firstActingSeat = await this.firstActiveTurnSeat(roundId, bettingSeats);
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
   * Called by the timer watchdog: auto-stand the acting player if their 30s has expired.
   */
  async autoStandTimedOut(tableId: string): Promise<void> {
    const release = await this.tableLocks.acquire(tableId);
    try {
      const roundResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_rounds
         WHERE table_id = $1 AND status = 'playing'
           AND acting_seat_position IS NOT NULL
           AND turn_started_at < NOW() - INTERVAL '30 seconds'
         ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      if (roundResult.rows.length === 0) return;
      const round = roundResult.rows[0];

      logger.info('BJMulti: auto-standing timed-out turn', {
        tableId, roundId: round.id, actingSeat: round.acting_seat_position,
      });
      this.audit(tableId, 'auto_stand', round.id, null, { seatPosition: round.acting_seat_position });

      // Stand the acting seat's current hand
      const rsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 AND seat_position = $2`,
        [round.id, round.acting_seat_position],
      );
      if (rsResult.rows.length === 0) {
        await this.advanceTurn(tableId, round.id);
        return;
      }
      const rs = rsResult.rows[0];
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

      // If same seat has another active hand (e.g. after split), advance to it instead of next seat
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

    if (this.broadcastCallback) {
      await this.broadcastCallback(tableId).catch(err =>
        logger.error('BJMulti: broadcast error after auto-stand', err),
      );
    }
  }

  /**
   * Called by the timer watchdog: transition a table from waiting to betting when
   * there are seated players, so the next round can start (15s betting timer applies).
   */
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

      // Only start a new round when the previous round actually completed (not when we reverted
      // to waiting because no one bet — in that case the last round is still 'betting' and we
      // must not create a new round every timer tick).
      const lastRoundResult = await this.pool.query(
        `SELECT status, completed_at FROM blackjack_multi_rounds
         WHERE table_id = $1 ORDER BY round_number DESC LIMIT 1`,
        [tableId],
      );
      if (lastRoundResult.rows.length > 0) {
        const last = lastRoundResult.rows[0];
        if (last.status !== 'completed') return; // last round still betting/playing/dealer_turn — do not create another
        if (last.completed_at) {
          const completedAt = last.completed_at instanceof Date ? last.completed_at.getTime() : new Date(last.completed_at).getTime();
          if (Date.now() - completedAt < 3000) return; // wait 3s after completion before next betting phase
        }
      }

      const roundNumResult = await this.pool.query(
        `SELECT COALESCE(MAX(round_number), 0) + 1 AS next_num FROM blackjack_multi_rounds WHERE table_id = $1`,
        [tableId],
      );
      const roundNumber = Number(roundNumResult.rows[0].next_num);

      const placeholderSeed = require('crypto').randomBytes(32).toString('hex');
      const placeholderHash = require('crypto').createHash('sha256').update(placeholderSeed).digest('hex');
      await this.pool.query(
        `INSERT INTO blackjack_multi_rounds (table_id, round_number, status, server_seed, server_seed_hash)
         VALUES ($1, $2, 'betting', $3, $4)`,
        [tableId, roundNumber, placeholderSeed, placeholderHash],
      );
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

      const seatsResult = await this.pool.query(
        `SELECT * FROM blackjack_multi_seats WHERE table_id = $1`, [tableId],
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

    if (this.broadcastCallback) {
      await this.broadcastCallback(tableId).catch(err =>
        logger.error('BJMulti: broadcast error after betting timeout', err),
      );
    }
  }

  // --------------------------------------------------------------------------
  // State query
  // --------------------------------------------------------------------------

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

    // Load active round if any. When table is playing/dealer_turn, only consider rounds in that phase
    // so we never show a newly created 'betting' round (which would look like a reset).
    let round: any = null;
    let roundSeats: any[] = [];
    if (['betting', 'playing', 'dealer_turn', 'completed'].includes(table.status)) {
      let roundResult;
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        roundResult = await this.pool.query(
          `SELECT * FROM blackjack_multi_rounds
           WHERE table_id = $1 AND status IN ('playing', 'dealer_turn', 'completed')
           ORDER BY round_number DESC LIMIT 1`,
          [tableId],
        );
      } else {
        roundResult = await this.pool.query(
          `SELECT * FROM blackjack_multi_rounds WHERE table_id = $1 ORDER BY round_number DESC LIMIT 1`,
          [tableId],
        );
      }
      if (roundResult.rows.length > 0) {
        round = roundResult.rows[0];
        const rsResult = await this.pool.query(
          `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1`,
          [round.id],
        );
        roundSeats = rsResult.rows;
      }
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
          consecutiveSitOuts: 0,
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
        consecutiveSitOuts: seat.consecutive_sit_outs,
        pendingBet: seat.pending_bet || '0',
        displayName: profile?.displayName ?? null,
        profileImageUrl: profile?.profileImageUrl ?? null,
        avatarConfig: profile?.avatarConfig ?? placeholderByAddress.get(seat.player_address.toLowerCase()) ?? null,
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
      turnStartedAt: round?.turn_started_at?.toISOString?.() ?? null,
      bettingStartedAt: (round?.status === 'betting' ? round?.created_at?.toISOString?.() : null) ?? null,
      themeKind: (table.theme_kind ?? 'video') as 'video' | 'image',
      themeId: table.theme_id ?? 'glowingTable',
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
      const balance = await this.dbService.getPlayerBalance(playerAddress);
      if (balance < bet) throw new Error('Insufficient balance to double down');
      await this.dbService.deductPlayerBalance(playerAddress, bet);

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
    const balance = await this.dbService.getPlayerBalance(playerAddress);
    if (balance < bet) throw new Error('Insufficient balance to split');
    await this.dbService.deductPlayerBalance(playerAddress, bet);

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
    await this.pool.query(
      `UPDATE blackjack_multi_rounds SET status = 'dealer_turn', acting_seat_position = NULL WHERE id = $1`,
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

    // Check if all players busted or have blackjack (dealer still draws for fairness)
    while (true) {
      const dh = this.pfService.calculateHandTotalV2(dealerCards);
      if (dh.total >= 17 && !(dh.total === 17 && dh.hasAce)) break;
      const draw = this.drawCard(deck, dp); dp = draw.dp;
      dealerCards.push(draw.card);
    }

    const finalDh = this.pfService.calculateHandTotalV2(dealerCards);
    await this.pool.query(
      `UPDATE blackjack_multi_rounds SET dealer_cards = $1, dealer_total = $2, dealer_has_ace = $3 WHERE id = $4`,
      [JSON.stringify(dealerCards), finalDh.total, finalDh.hasAce, roundId],
    );

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
              // 3:2 blackjack payout: bet * 5 / 2, rounded up to avoid truncation
              const bjBet = BigInt(hand.betAmount);
              hand.payout = ((bjBet * 5n + 1n) / 2n).toString();
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

        // Credit payout
        if (totalPayout > 0n) {
          await client.query(
            `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
            [rs.player_address, totalPayout.toString()],
          );
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
   * Find the first seat position that has an active (non-blackjack) hand, among betting seats.
   * Returns null if all are blackjacks or no seats.
   */
  private async firstActiveTurnSeat(roundId: string, bettingSeats: any[]): Promise<number | null> {
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
