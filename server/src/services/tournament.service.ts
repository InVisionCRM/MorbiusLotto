import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { sendEscrowPayout } from '../utils/escrow-payout';
import { setMorbiusTournamentCompleted, setMorbiusTournamentActive, hasJoinedMorbiusTournament, sendMorbiusTournamentPayout } from '../utils/morbius-tournament';
import { getEscrowPoolStatus } from '../utils/escrow-status';

// Tournament constants
export const TOURNAMENT_CONFIG = {
  BUY_IN_AMOUNT: BigInt('1000000000000000000000'), // 1,000 MORBIUS (18 decimals)
  STARTING_CHIPS: 5000,
  MAX_HANDS: 25,
  MIN_PLAYERS_FOR_PRIZES: 2,

  // Bet limits for tournament chips
  MIN_BET: 50,
  MAX_BET: 5000, // Can go all-in

  // Prize distribution percentages (sum to 100% of distributable pool)
  PRIZE_PERCENTAGES: [56, 20, 10, 2, 2, 2, 2, 2, 2, 2], // 1st through 10th
  PROTOCOL_FEE_PERCENT: 3,
  CREATOR_FEE_PERCENT: 2,
};

// Table theme
export interface TableTheme {
  kind: 'image' | 'video';
  id: string;
}

export interface Tournament {
  id: string;
  name: string;
  buy_in_amount: bigint;
  starting_chips: number;
  max_hands: number;
  min_players: number;
  status: 'registration' | 'active' | 'completed' | 'cancelled';
  prize_pool: bigint;
  created_at: Date;
  ended_at?: Date;
  tournament_type?: string | null;
  // New custom tournament fields
  creator_address?: string;
  time_limit_minutes?: number;
  rebuy_config: { enabled: boolean; maxRebuys: number };
  table_theme: TableTheme;
  is_private: boolean;
  pin_code?: string;
  prize_distribution_type: string;
  prize_percentages?: number[];
  max_players?: number;
  ends_at?: Date;
  custom_image?: string | null; // Base64 data URL for custom tournament card
  // Custom prize token (when set, payouts go via TournamentPrizeEscrow)
  prize_token_address?: string | null;
  prize_token_decimals?: number | null;
  // Fee fields
  creator_fee_percent: number;
  platform_fee_percent: number;
  /** uint256 from MorbiusTournament contract; when set, server calls setCompleted after distribute */
  on_chain_tournament_id?: number | null;
}

export interface TournamentEntry {
  id: string;
  tournament_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  final_rank?: number;
  prize_won: bigint;
  status: 'playing' | 'busted' | 'completed';
  bought_in_at: Date;
  finished_at?: Date;
  // Rebuy tracking
  rebuy_count: number;
  total_buy_in: bigint;
}

  /** One row for "My History" — a tournament the player entered and its outcome */
  export interface PlayerTournamentHistoryItem {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: 'active' | 'completed' | 'cancelled';
  tournamentType: string;
  prizeTokenAddress: string | null;
  /** When the tournament actually ended (set on completion) */
  endedAt: Date | null;
  /** When the tournament is scheduled to end (time limit; null = no limit). Use for "time remaining" when in progress. */
  endsAt: Date | null;
  entryId: string;
  entryStatus: 'playing' | 'busted' | 'completed';
  finalRank: number | null;
  prizeWon: bigint;
  boughtInAt: Date;
  finishedAt: Date | null;
  handsPlayed: number;
  highestChipCount: number;
  chipsRemaining: number;
}

// Create tournament parameters
export interface CreateTournamentParams {
  creatorAddress: string;
  name: string;
  buyInAmount: bigint;
  startingChips: number;
  maxHands: number;
  timeLimitMinutes: number | null;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: string;
  maxPlayers?: number | null;
  customImage?: string | null; // Base64 data URL for custom tournament card
  /** When set, prize pool is funded by creator via escrow; prizeAmount in token smallest unit */
  prizeTokenAddress?: string | null;
  prizeAmount?: string; // wei/smallest unit
  prizeTokenDecimals?: number | null;
  /** Optional PIN for private tournaments; if provided and valid, used instead of generating */
  pinCode?: string | null;
  /** uint256 from MorbiusTournament.createTournament; when set, create/join use on-chain flow */
  onChainTournamentId?: number | bigint | null;
}

/** Create freeroll tournament (no buy-in, scheduled start). Chip-count only. */
export interface CreateFreerollParams {
  creatorAddress: string;
  name: string;
  scheduledStartAt: string; // ISO date string
  registrationOpensAt: string; // ISO date string
  durationMinutes: number;
  startingChips: number;
  maxHands: number;
  prizeDistributionType: string;
  tableTheme: TableTheme;
  isPrivate: boolean;
  maxPlayers?: number | null;
  customImage?: string | null;
  pinCode?: string | null;
}

// Freeroll list item (from list_freeroll_tournaments)
export interface FreerollListItem {
  id: string;
  name: string;
  creator_address: string | null;
  tournament_type: string;
  freeroll_mode: string;
  scheduled_start_at: Date | null;
  registration_opens_at: Date | null;
  duration_minutes: number | null;
  starting_chips: number;
  current_phase: string | null;
  registered_count: number;
  action_timer_seconds: number | null;
  elimination_config?: Record<string, unknown> | null; // Legacy; unused (chip-count only)
  reentry_config: Record<string, unknown> | null;
  prize_distribution_type: string;
  custom_image: string | null;
  created_at: Date;
}

// Tournament list item for browser
export interface TournamentListItem {
  id: string;
  name: string;
  creator_address: string | null;
  buy_in_amount: bigint;
  starting_chips: number;
  max_hands: number;
  prize_pool: bigint;
  entry_count: number;
  max_players: number | null;
  time_limit_minutes: number | null;
  ends_at: Date | null;
  rebuy_config: { enabled: boolean; maxRebuys: number };
  table_theme: TableTheme;
  is_private: boolean;
  prize_distribution_type: string;
  created_at: Date;
  custom_image?: string | null; // Base64 data URL for custom tournament card
  prize_token_address?: string | null;
  prize_token_decimals?: number | null;
  // Timing / phase fields (for freerolls and timer display)
  tournament_type?: string | null;
  scheduled_start_at?: Date | null;
  registration_opens_at?: Date | null;
  current_phase?: string | null;
  duration_minutes?: number | null;
  // Fee fields
  creator_fee_percent?: number;
  platform_fee_percent?: number;
  // Escrow funding (custom-token tournaments only)
  escrow_funded?: boolean;
  escrow_total_deposited?: string;
  escrow_token?: string | null;
  /** uint256 from MorbiusTournament; when set, create/join use on-chain flow */
  on_chain_tournament_id?: number | null;
  /** Tournament status: registration or active */
  status?: string;
  /** Minimum players to start */
  min_players?: number;
}

export interface TournamentGame {
  id: string;
  tournament_id: string;
  entry_id: string;
  game_id: string;
  hand_number: number;
  bet_amount: number;
  chips_before: number;
  chips_after: number;
  result?: string;
  created_at: Date;
}

export interface LeaderboardEntry {
  entry_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  status: string;
  current_rank: number;
}

export interface TournamentState {
  entryId: string;
  tournamentId: string;
  chips: number;
  handsPlayed: number;
  handsRemaining: number;
  highestChips: number;
  currentRank: number;
  status: 'playing' | 'busted' | 'completed';
  prizeWon: bigint;
  maxHands: number;
  startingChips: number;
}

export interface PrizeDistribution {
  entry_id: string;
  player_address: string;
  final_rank: number;
  prize_amount: bigint;
}

export class TournamentService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private toBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (value === null || value === undefined) return 0n;
    return BigInt(String(value));
  }

  private normalizeAddress(address: string): string {
    return address?.toLowerCase() || address;
  }

  private normalizeTournament(row: any): Tournament {
    let rebuyConfig = { enabled: false, maxRebuys: 0 };
    if (row.rebuy_config) {
      try {
        rebuyConfig = typeof row.rebuy_config === 'string' ? JSON.parse(row.rebuy_config) : row.rebuy_config;
      } catch { /* keep default */ }
    }

    // Parse table_theme from JSONB
    let tableTheme: TableTheme = { kind: 'image', id: 'BigRich' };
    if (row.table_theme) {
      if (typeof row.table_theme === 'string') {
        try {
          tableTheme = JSON.parse(row.table_theme);
        } catch {
          // Keep default
        }
      } else {
        tableTheme = row.table_theme;
      }
    }

    // Parse prize_percentages from JSONB
    let prizePercentages: number[] | undefined;
    if (row.prize_percentages) {
      if (typeof row.prize_percentages === 'string') {
        try {
          const parsed = JSON.parse(row.prize_percentages);
          // Ensure it's a valid array
          if (Array.isArray(parsed) && parsed.length > 0) {
            prizePercentages = parsed;
          }
        } catch {
          // Keep undefined
        }
      } else if (Array.isArray(row.prize_percentages) && row.prize_percentages.length > 0) {
        prizePercentages = row.prize_percentages;
      }
    }

    return {
      id: row.id,
      name: row.name,
      buy_in_amount: this.toBigInt(row.buy_in_amount),
      starting_chips: Number(row.starting_chips),
      max_hands: Number(row.max_hands),
      min_players: Number(row.min_players),
      status: row.status,
      prize_pool: this.toBigInt(row.prize_pool),
      created_at: row.created_at,
      ended_at: row.ended_at,
      // New fields
      creator_address: row.creator_address,
      time_limit_minutes: row.time_limit_minutes ? Number(row.time_limit_minutes) : undefined,
      rebuy_config: rebuyConfig,
      table_theme: tableTheme,
      is_private: Boolean(row.is_private),
      pin_code: row.pin_code,
      prize_distribution_type: row.prize_distribution_type || 'top_10',
      prize_percentages: prizePercentages,
      max_players: row.max_players ? Number(row.max_players) : undefined,
      ends_at: row.ends_at,
      custom_image: row.custom_image || null,
      prize_token_address: row.prize_token_address ?? null,
      prize_token_decimals: row.prize_token_decimals != null ? Number(row.prize_token_decimals) : null,
      creator_fee_percent: Number(row.creator_fee_percent ?? 2),
      platform_fee_percent: Number(row.platform_fee_percent ?? 3),
      tournament_type: row.tournament_type ?? null,
      on_chain_tournament_id: row.on_chain_tournament_id != null ? Number(row.on_chain_tournament_id) : null,
    };
  }

  private normalizeEntry(row: any): TournamentEntry {
    return {
      id: row.id,
      tournament_id: row.tournament_id,
      player_address: row.player_address,
      chips_remaining: Number(row.chips_remaining),
      hands_played: Number(row.hands_played),
      highest_chip_count: Number(row.highest_chip_count),
      final_rank: row.final_rank ? Number(row.final_rank) : undefined,
      prize_won: this.toBigInt(row.prize_won),
      status: row.status,
      bought_in_at: row.bought_in_at,
      finished_at: row.finished_at,
      // Rebuy tracking
      rebuy_count: Number(row.rebuy_count || 0),
      total_buy_in: this.toBigInt(row.total_buy_in),
    };
  }

  /**
   * Generate a random 4-digit PIN code
   */
  private generatePinCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Get prize percentages for a distribution type
   */
  private getPrizePercentages(type: string): number[] {
    switch (type) {
      case 'winner_takes_all':
        return [100];
      case 'top_3':
        return [50, 30, 20];
      case 'top_5':
        return [40, 25, 15, 12, 8];
      case 'top_10':
      default:
        return [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
    }
  }

  /** Min players = number of paid places (industry standard: don't run without full prize pool). */
  private getMinPlayersFromPrizeDistribution(type: string): number {
    switch (type) {
      case 'winner_takes_all':
        return 1;
      case 'top_3':
        return 3;
      case 'top_5':
        return 5;
      case 'top_10':
      default:
        return 10;
    }
  }

  /**
   * Get the current active tournament, creating one if needed
   */
  async getActiveTournament(): Promise<Tournament> {
    const query = `SELECT * FROM tournaments WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`;
    let result = await this.pool.query(query);

    if (result.rows.length === 0) {
      // Create a new tournament
      const createQuery = `
        INSERT INTO tournaments (name, buy_in_amount, starting_chips, max_hands)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const nextNum = await this.pool.query(`SELECT COUNT(*) FROM tournaments`);
      const tournamentNum = Number(nextNum.rows[0].count) + 1;

      result = await this.pool.query(createQuery, [
        `Tournament #${tournamentNum}`,
        TOURNAMENT_CONFIG.BUY_IN_AMOUNT.toString(),
        TOURNAMENT_CONFIG.STARTING_CHIPS,
        TOURNAMENT_CONFIG.MAX_HANDS,
      ]);
    }

    return this.normalizeTournament(result.rows[0]);
  }

  /**
   * Get a tournament by ID
   */
  async getTournament(tournamentId: string): Promise<Tournament | null> {
    const query = `SELECT * FROM tournaments WHERE id = $1`;
    const result = await this.pool.query(query, [tournamentId]);
    return result.rows[0] ? this.normalizeTournament(result.rows[0]) : null;
  }

  /**
   * Enter a tournament by paying the buy-in
   */
  async enterTournament(playerAddress: string): Promise<TournamentEntry> {
    const normalizedAddress = this.normalizeAddress(playerAddress);
    const tournament = await this.getActiveTournament();

    // Check if player already has an active entry in this tournament
    const existingEntry = await this.getTournamentEntry(normalizedAddress, tournament.id);
    if (existingEntry && existingEntry.status === 'playing') {
      throw new Error('Already in this tournament');
    }

    // Check player has enough balance for buy-in
    const balanceQuery = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
    const balanceResult = await this.pool.query(balanceQuery, [normalizedAddress]);

    if (balanceResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const balance = this.toBigInt(balanceResult.rows[0].balance);
    if (balance < tournament.buy_in_amount) {
      throw new Error(`Insufficient balance for tournament buy-in. Need ${tournament.buy_in_amount.toString()}, have ${balance.toString()}`);
    }

    // Use transaction for atomic buy-in
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Deduct buy-in from player balance
      await client.query(
        `UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
        [tournament.buy_in_amount.toString(), normalizedAddress]
      );

      // Add to prize pool only for platform (non–custom token) tournaments
      if (!tournament.prize_token_address) {
        await client.query(
          `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
          [tournament.buy_in_amount.toString(), tournament.id]
        );
      }

      // Create tournament entry
      const entryQuery = `
        INSERT INTO tournament_entries (
          tournament_id, player_address, chips_remaining, highest_chip_count
        ) VALUES ($1, $2, $3, $3)
        RETURNING *
      `;
      const entryResult = await client.query(entryQuery, [
        tournament.id,
        normalizedAddress,
        tournament.starting_chips,
      ]);

      await client.query('COMMIT');

      logger.info('Player entered tournament', {
        playerAddress: normalizedAddress,
        tournamentId: tournament.id,
        entryId: entryResult.rows[0].id,
        startingChips: tournament.starting_chips,
      });

      return this.normalizeEntry(entryResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get player's tournament entry
   */
  async getTournamentEntry(playerAddress: string, tournamentId?: string): Promise<TournamentEntry | null> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    let query: string;
    let params: any[];

    if (tournamentId) {
      query = `
        SELECT * FROM tournament_entries
        WHERE LOWER(player_address) = LOWER($1) AND tournament_id = $2
        ORDER BY bought_in_at DESC
        LIMIT 1
      `;
      params = [normalizedAddress, tournamentId];
    } else {
      // Get entry from active tournament
      query = `
        SELECT te.* FROM tournament_entries te
        JOIN tournaments t ON te.tournament_id = t.id
        WHERE LOWER(te.player_address) = LOWER($1) AND t.status = 'active'
        ORDER BY te.bought_in_at DESC
        LIMIT 1
      `;
      params = [normalizedAddress];
    }

    const result = await this.pool.query(query, params);
    return result.rows[0] ? this.normalizeEntry(result.rows[0]) : null;
  }

  /**
   * Get player's active tournament entry with full state
   */
  async getTournamentState(playerAddress: string): Promise<TournamentState | null> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const query = `
      SELECT
        te.*,
        t.max_hands,
        t.starting_chips,
        tl.current_rank
      FROM tournament_entries te
      JOIN tournaments t ON te.tournament_id = t.id
      LEFT JOIN tournament_leaderboard tl ON tl.entry_id = te.id
      WHERE LOWER(te.player_address) = LOWER($1)
        AND t.status = 'active'
        AND te.status = 'playing'
      ORDER BY te.bought_in_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [normalizedAddress]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      entryId: row.id,
      tournamentId: row.tournament_id,
      chips: Number(row.chips_remaining),
      handsPlayed: Number(row.hands_played),
      handsRemaining: Number(row.max_hands) - Number(row.hands_played),
      highestChips: Number(row.highest_chip_count),
      currentRank: Number(row.current_rank || 1),
      status: row.status,
      prizeWon: this.toBigInt(row.prize_won),
      maxHands: Number(row.max_hands),
      startingChips: Number(row.starting_chips),
    };
  }

  /**
   * Get tournament leaderboard
   */
  async getLeaderboard(tournamentId: string, limit: number = 50): Promise<LeaderboardEntry[]> {
    const query = `SELECT * FROM get_tournament_leaderboard($1, $2)`;
    const result = await this.pool.query(query, [tournamentId, limit]);

    return result.rows.map(row => ({
      entry_id: row.entry_id,
      player_address: row.player_address,
      chips_remaining: Number(row.chips_remaining),
      hands_played: Number(row.hands_played),
      highest_chip_count: Number(row.highest_chip_count),
      status: row.status,
      current_rank: Number(row.current_rank),
    }));
  }

  /**
   * Record a tournament hand result
   */
  async recordTournamentHand(
    entryId: string,
    gameId: string,
    betAmount: number,
    chipsBefore: number,
    chipsAfter: number,
    result?: string
  ): Promise<TournamentEntry> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get entry details
      const entryQuery = `SELECT * FROM tournament_entries WHERE id = $1 FOR UPDATE`;
      const entryResult = await client.query(entryQuery, [entryId]);

      if (entryResult.rows.length === 0) {
        throw new Error('Tournament entry not found');
      }

      const entry = this.normalizeEntry(entryResult.rows[0]);

      if (entry.status !== 'playing') {
        throw new Error('Tournament entry is not active');
      }

      const handNumber = entry.hands_played + 1;
      const newHighest = Math.max(entry.highest_chip_count, chipsAfter);

      // Insert tournament game record
      await client.query(
        `INSERT INTO tournament_games (tournament_id, entry_id, game_id, hand_number, bet_amount, chips_before, chips_after, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [entry.tournament_id, entryId, gameId, handNumber, betAmount, chipsBefore, chipsAfter, result]
      );

      // Update entry
      const updateQuery = `
        UPDATE tournament_entries
        SET
          chips_remaining = $1,
          hands_played = $2,
          highest_chip_count = $3
        WHERE id = $4
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [
        chipsAfter,
        handNumber,
        newHighest,
        entryId,
      ]);

      await client.query('COMMIT');

      const updatedEntry = this.normalizeEntry(updateResult.rows[0]);

      logger.debug('Tournament hand recorded', {
        entryId,
        handNumber,
        betAmount,
        chipsBefore,
        chipsAfter,
        result,
      });

      return updatedEntry;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update tournament chips after a hand
   */
  async updateChips(entryId: string, newChipCount: number): Promise<TournamentEntry> {
    const query = `
      UPDATE tournament_entries
      SET
        chips_remaining = $1,
        highest_chip_count = GREATEST(highest_chip_count, $1)
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [newChipCount, entryId]);

    if (result.rows.length === 0) {
      throw new Error('Tournament entry not found');
    }

    return this.normalizeEntry(result.rows[0]);
  }

  /**
   * Mark entry as busted (0 chips)
   */
  async bustOut(entryId: string): Promise<TournamentEntry> {
    const query = `
      UPDATE tournament_entries
      SET
        status = 'busted',
        chips_remaining = 0,
        finished_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [entryId]);

    if (result.rows.length === 0) {
      throw new Error('Tournament entry not found');
    }

    const entry = this.normalizeEntry(result.rows[0]);

    logger.info('Player busted from tournament', {
      entryId,
      tournamentId: entry.tournament_id,
      playerAddress: entry.player_address,
      handsPlayed: entry.hands_played,
    });

    // Check if we should distribute prizes
    await this.checkAndDistributePrizes(entry.tournament_id);

    return entry;
  }

  /**
   * Mark entry as completed (50 hands played)
   */
  async completeTournamentEntry(entryId: string): Promise<TournamentEntry> {
    const query = `
      UPDATE tournament_entries
      SET
        status = 'completed',
        finished_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [entryId]);

    if (result.rows.length === 0) {
      throw new Error('Tournament entry not found');
    }

    const entry = this.normalizeEntry(result.rows[0]);

    logger.info('Player completed tournament', {
      entryId,
      tournamentId: entry.tournament_id,
      playerAddress: entry.player_address,
      finalChips: entry.chips_remaining,
      handsPlayed: entry.hands_played,
    });

    // Check if we should distribute prizes
    await this.checkAndDistributePrizes(entry.tournament_id);

    return entry;
  }

  /**
   * Leave tournament early (forfeit remaining chips)
   */
  async leaveTournament(playerAddress: string): Promise<TournamentEntry | null> {
    const entry = await this.getTournamentEntry(playerAddress);

    if (!entry || entry.status !== 'playing') {
      return null;
    }

    return this.bustOut(entry.id);
  }

  /**
   * Check if all players have finished and distribute prizes if so
   */
  private async checkAndDistributePrizes(tournamentId: string): Promise<void> {
    // Check if any players are still playing
    const playingQuery = `
      SELECT COUNT(*) as playing_count
      FROM tournament_entries
      WHERE tournament_id = $1 AND status = 'playing'
    `;
    const playingResult = await this.pool.query(playingQuery, [tournamentId]);
    const playingCount = Number(playingResult.rows[0].playing_count);

    if (playingCount > 0) {
      // Still players in the tournament
      return;
    }

    // All players finished, check if tournament already completed
    const tournament = await this.getTournament(tournamentId);
    if (!tournament || tournament.status !== 'active') {
      return;
    }

    // Distribute prizes
    await this.distributePrizes(tournamentId);
  }

  /**
   * Distribute prizes to top players
   */
  async distributePrizes(tournamentId: string): Promise<PrizeDistribution[]> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get tournament
      const tournamentQuery = `SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`;
      const tournamentResult = await client.query(tournamentQuery, [tournamentId]);

      if (tournamentResult.rows.length === 0) {
        throw new Error('Tournament not found');
      }

      const tournament = this.normalizeTournament(tournamentResult.rows[0]);

      if (tournament.status !== 'active') {
        throw new Error('Tournament already completed');
      }

      // For on-chain tournaments, sync prize pool from contract before distribution
      let actualPrizePool = tournament.prize_pool;
      if (tournament.on_chain_tournament_id != null && !tournament.prize_token_address) {
        const { getMorbiusTournamentPrizePool } = await import('../utils/morbius-tournament');
        const contractPrizePool = await getMorbiusTournamentPrizePool(tournament.on_chain_tournament_id);
        if (contractPrizePool > 0n) {
          actualPrizePool = contractPrizePool;
          // Update database to match contract (for accurate fee calculations)
          await client.query(
            `UPDATE tournaments SET prize_pool = $1::NUMERIC WHERE id = $2`,
            [contractPrizePool.toString(), tournamentId]
          );
          logger.info('Synced prize pool from contract', {
            tournamentId,
            dbPool: tournament.prize_pool.toString(),
            contractPool: contractPrizePool.toString(),
          });
        }
      }

      // Calculate prizes using the database function (now uses synced prize pool)
      const prizesQuery = `SELECT * FROM calculate_tournament_prizes($1)`;
      const prizesResult = await client.query(prizesQuery, [tournamentId]);

      const distributions: PrizeDistribution[] = [];
      const useEscrow = Boolean(tournament.prize_token_address);
      const isOnChain = tournament.on_chain_tournament_id != null;
      const useMorbiusPayout = isOnChain && !useEscrow;
      // Custom token: always use V2 (bytes32). V3 deprecated for reliability.
      const useEscrowV2 = useEscrow;

      // Apply prizes
      for (const row of prizesResult.rows) {
        const prizeAmount = this.toBigInt(row.prize_amount);

        if (prizeAmount > 0n) {
          // Update entry with prize and final rank
          await client.query(
            `UPDATE tournament_entries
             SET prize_won = $1::NUMERIC, final_rank = $2
             WHERE id = $3`,
            [prizeAmount.toString(), row.final_rank, row.entry_id]
          );

          if (useMorbiusPayout) {
            const result = await sendMorbiusTournamentPayout(tournament.on_chain_tournament_id!, row.player_address, prizeAmount);
            if (!result.success) {
              logger.error('MorbiusTournament payout failed; rolling back tournament completion', {
                tournamentId,
                winner: row.player_address,
                amount: prizeAmount.toString(),
                error: result.error,
              });
              throw new Error(`Prize payout failed for ${row.player_address}: ${result.error || 'Unknown error'}`);
            }
          } else if (useEscrowV2) {
            const result = await sendEscrowPayout(tournamentId, row.player_address, prizeAmount);
            if (!result.success) {
              logger.error('Escrow payout failed; rolling back tournament completion', {
                tournamentId,
                winner: row.player_address,
                amount: prizeAmount.toString(),
                error: result.error,
              });
              throw new Error(`Escrow payout failed for ${row.player_address}: ${result.error || 'Unknown error'}`);
            }
          } else {
            // Add prize to player balance (platform MORBIUS, off-chain)
            await client.query(
              `UPDATE players
               SET balance = balance + $1::NUMERIC
               WHERE LOWER(wallet_address) = LOWER($2)`,
              [prizeAmount.toString(), row.player_address]
            );
          }

          distributions.push({
            entry_id: row.entry_id,
            player_address: row.player_address,
            final_rank: Number(row.final_rank),
            prize_amount: prizeAmount,
          });

          logger.info('Prize distributed', {
            tournamentId,
            playerAddress: row.player_address,
            rank: row.final_rank,
            prize: prizeAmount.toString(),
            viaEscrow: useEscrow,
          });
        } else {
          // Just update final rank for non-prize positions
          await client.query(
            `UPDATE tournament_entries SET final_rank = $1 WHERE id = $2`,
            [row.final_rank, row.entry_id]
          );
        }
      }

      // Distribute fees: hardcoded 3% protocol, 2% creator
      const platformFeePercent = 3;
      const creatorFeePercent = 2;
      const totalPool = actualPrizePool; // Use synced pool for accurate fee calculations

      if (platformFeePercent > 0) {
        const platformFeeAmount = (totalPool * BigInt(platformFeePercent)) / 100n;
        const platformWallet = process.env.PLATFORM_FEE_WALLET;
        if (platformFeeAmount > 0n && platformWallet) {
          if (useMorbiusPayout) {
            const result = await sendMorbiusTournamentPayout(tournament.on_chain_tournament_id!, platformWallet, platformFeeAmount);
            if (!result.success) {
              logger.error('Platform fee MorbiusTournament payout failed; rolling back', { tournamentId, amount: platformFeeAmount.toString(), error: result.error });
              throw new Error(`Platform fee payout failed: ${result.error || 'Unknown error'}`);
            }
          } else if (useEscrowV2) {
            const result = await sendEscrowPayout(tournamentId, platformWallet, platformFeeAmount);
            if (!result.success) {
              logger.error('Platform fee escrow payout failed; rolling back tournament completion', { tournamentId, amount: platformFeeAmount.toString(), error: result.error });
              throw new Error(`Platform fee escrow payout failed: ${result.error || 'Unknown error'}`);
            }
          } else {
            await client.query(
              `INSERT INTO players (wallet_address, balance) VALUES (LOWER($1), $2::NUMERIC)
               ON CONFLICT (wallet_address) DO UPDATE SET balance = players.balance + $2::NUMERIC`,
              [platformWallet.toLowerCase(), platformFeeAmount.toString()]
            );
          }
          logger.info('Platform fee distributed', { tournamentId, wallet: platformWallet, amount: platformFeeAmount.toString() });
        }
      }

      if (creatorFeePercent > 0 && tournament.creator_address) {
        const creatorFeeAmount = (totalPool * BigInt(creatorFeePercent)) / 100n;
        if (creatorFeeAmount > 0n) {
          if (useMorbiusPayout) {
            const result = await sendMorbiusTournamentPayout(tournament.on_chain_tournament_id!, tournament.creator_address, creatorFeeAmount);
            if (!result.success) {
              logger.error('Creator fee MorbiusTournament payout failed; rolling back', { tournamentId, amount: creatorFeeAmount.toString(), error: result.error });
              throw new Error(`Creator fee payout failed: ${result.error || 'Unknown error'}`);
            }
          } else if (useEscrowV2) {
            const result = await sendEscrowPayout(tournamentId, tournament.creator_address, creatorFeeAmount);
            if (!result.success) {
              logger.error('Creator fee escrow payout failed; rolling back tournament completion', { tournamentId, amount: creatorFeeAmount.toString(), error: result.error });
              throw new Error(`Creator fee escrow payout failed: ${result.error || 'Unknown error'}`);
            }
          } else {
            await client.query(
              `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
              [creatorFeeAmount.toString(), tournament.creator_address]
            );
          }
          logger.info('Creator fee distributed', { tournamentId, wallet: tournament.creator_address, amount: creatorFeeAmount.toString() });
        }
      }

      // Mark tournament as completed
      // For freerolls, also update current_phase in the same transaction
      const isFreeroll = tournament.tournament_type === 'freeroll';
      if (isFreeroll) {
        await client.query(
          `UPDATE tournaments SET status = 'completed', ended_at = NOW(), current_phase = 'completed' WHERE id = $1`,
          [tournamentId]
        );
      } else {
        await client.query(
          `UPDATE tournaments SET status = 'completed', ended_at = NOW() WHERE id = $1`,
          [tournamentId]
        );
      }

      await client.query('COMMIT');

      // Update MorbiusTournament contract status when using on-chain tournament
      if (tournament.on_chain_tournament_id != null) {
        const setResult = await setMorbiusTournamentCompleted(tournament.on_chain_tournament_id);
        if (!setResult.success) {
          logger.warn('MorbiusTournament setCompleted failed (tournament completed in DB)', {
            tournamentId,
            onChainId: tournament.on_chain_tournament_id,
            error: setResult.error,
          });
        }
      }

      logger.info('Tournament completed and prizes distributed', {
        tournamentId,
        totalDistributed: distributions.reduce((sum, d) => sum + d.prize_amount, 0n).toString(),
        winners: distributions.length,
        platformFeePercent,
        creatorFeePercent,
      });

      return distributions;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all entries for a tournament (for detail view player list)
   */
  async getEntries(tournamentId: string): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT
        te.id AS entry_id,
        te.player_address,
        te.chips_remaining,
        te.hands_played,
        te.highest_chip_count,
        te.status,
        COALESCE(tl.current_rank, 0) AS current_rank
      FROM tournament_entries te
      LEFT JOIN tournament_leaderboard tl ON tl.entry_id = te.id
      WHERE te.tournament_id = $1
      ORDER BY COALESCE(tl.current_rank, 999999) ASC
    `;
    const result = await this.pool.query(query, [tournamentId]);
    return result.rows.map(row => ({
      entry_id: row.entry_id,
      player_address: row.player_address,
      chips_remaining: Number(row.chips_remaining),
      hands_played: Number(row.hands_played),
      highest_chip_count: Number(row.highest_chip_count),
      status: row.status,
      current_rank: Number(row.current_rank),
    }));
  }

  /**
   * Get total number of entries in a tournament
   */
  async getTournamentEntryCount(tournamentId: string): Promise<number> {
    const query = `SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1`;
    const result = await this.pool.query(query, [tournamentId]);
    return Number(result.rows[0].count);
  }

  /**
   * Get all tournaments a player has entered, with outcome (for "My History" UI).
   * Returns entries ordered by bought_in_at descending (most recent first).
   */
  async getPlayerTournamentHistory(playerAddress: string): Promise<PlayerTournamentHistoryItem[]> {
    const normalized = this.normalizeAddress(playerAddress);
    const query = `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.status AS tournament_status,
        t.tournament_type,
        t.prize_token_address,
        t.ended_at,
        t.ends_at,
        te.id AS entry_id,
        te.status AS entry_status,
        te.final_rank,
        te.prize_won,
        te.bought_in_at,
        te.finished_at,
        te.hands_played,
        te.highest_chip_count,
        te.chips_remaining
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE LOWER(te.player_address) = $1
      ORDER BY te.bought_in_at DESC
    `;
    const result = await this.pool.query(query, [normalized]);
    return result.rows.map((row: any) => ({
      tournamentId: row.tournament_id,
      tournamentName: row.tournament_name,
      tournamentStatus: row.tournament_status,
      tournamentType: row.tournament_type ?? 'standard',
      prizeTokenAddress: row.prize_token_address ?? null,
      endedAt: row.ended_at ?? null,
      endsAt: row.ends_at ?? null,
      entryId: row.entry_id,
      entryStatus: row.entry_status,
      finalRank: row.final_rank != null ? Number(row.final_rank) : null,
      prizeWon: this.toBigInt(row.prize_won),
      boughtInAt: row.bought_in_at,
      finishedAt: row.finished_at ?? null,
      handsPlayed: Number(row.hands_played ?? 0),
      highestChipCount: Number(row.highest_chip_count ?? 0),
      chipsRemaining: Number(row.chips_remaining ?? 0),
    }));
  }

  // ============================================
  // Freeroll methods
  // ============================================

  /**
   * List freeroll tournaments (from list_freeroll_tournaments).
   */
  async listFreerollTournaments(includePast = false): Promise<FreerollListItem[]> {
    const result = await this.pool.query('SELECT * FROM list_freeroll_tournaments($1)', [includePast]);
    return (result.rows || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      creator_address: row.creator_address,
      tournament_type: row.tournament_type,
      freeroll_mode: row.freeroll_mode,
      scheduled_start_at: row.scheduled_start_at,
      registration_opens_at: row.registration_opens_at,
      duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
      starting_chips: Number(row.starting_chips),
      current_phase: row.current_phase,
      registered_count: Number(row.registered_count),
      action_timer_seconds: row.action_timer_seconds != null ? Number(row.action_timer_seconds) : null,
      elimination_config: row.elimination_config ?? null,
      reentry_config: row.reentry_config ?? null,
      prize_distribution_type: row.prize_distribution_type,
      custom_image: row.custom_image ?? null,
      created_at: row.created_at,
    }));
  }

  /**
   * Register for a freeroll (during registration phase).
   */
  async registerFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const tournamentResult = await this.pool.query(
      `SELECT id, tournament_type, current_phase, starting_chips, max_players, registration_opens_at, scheduled_start_at, ends_at FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      throw new Error('Tournament not found');
    }
    const t = tournamentResult.rows[0];
    if (t.tournament_type !== 'freeroll') {
      throw new Error('Not a freeroll tournament');
    }
    
    // Validate registration is open based on time
    const now = new Date();
    const registrationOpens = t.registration_opens_at ? new Date(t.registration_opens_at) : null;
    const scheduledStart = t.scheduled_start_at ? new Date(t.scheduled_start_at) : null;
    
    if (!registrationOpens || !scheduledStart) {
      throw new Error('Tournament timing not configured');
    }
    
    if (now < registrationOpens) {
      throw new Error('Registration has not opened yet');
    }
    
    if (now >= scheduledStart) {
      throw new Error('Registration is closed - tournament has started');
    }
    
    // Sync phase if needed
    const endsAt = t.ends_at ? new Date(t.ends_at) : null;
    const correctPhase = this.determineFreerollPhase(registrationOpens, scheduledStart, endsAt);
    
    if (t.current_phase !== correctPhase) {
      await this.pool.query(
        `UPDATE tournaments SET current_phase = $1 WHERE id = $2`,
        [correctPhase, tournamentId]
      );
      if (correctPhase !== 'registration') {
        throw new Error('Registration is closed');
      }
    }

    const existing = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (existing) {
      throw new Error('Already registered');
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND registration_status IN ('registered', 'joined')`,
      [tournamentId]
    );
    const count = Number(countResult.rows[0].c);
    if (t.max_players != null && count >= t.max_players) {
      throw new Error('Tournament is full');
    }

    const startingChips = Number(t.starting_chips);
    const entryResult = await this.pool.query(
      `INSERT INTO tournament_entries (
        tournament_id, player_address, chips_remaining, highest_chip_count, total_buy_in, registration_status
      ) VALUES ($1, $2, $3, $3, 0, 'registered')
      RETURNING *`,
      [tournamentId, normalizedAddress, startingChips]
    );
    logger.info('Player registered for freeroll', { playerAddress: normalizedAddress, tournamentId });
    return this.normalizeEntry(entryResult.rows[0]);
  }

  /**
   * Mark freeroll registration as "joined" (player is at the table).
   */
  async joinFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const entry = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (!entry) {
      throw new Error('Not registered for this freeroll');
    }

    const tournamentResult = await this.pool.query(
      `SELECT tournament_type, current_phase FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      throw new Error('Tournament not found');
    }
    const t = tournamentResult.rows[0];
    if (t.tournament_type !== 'freeroll') {
      throw new Error('Not a freeroll tournament');
    }
    if (t.current_phase !== 'registration' && t.current_phase !== 'active') {
      throw new Error('Cannot join at this phase');
    }

    const statusResult = await this.pool.query(
      `SELECT registration_status FROM tournament_entries WHERE id = $1`,
      [entry.id]
    );
    const registrationStatus = statusResult.rows[0]?.registration_status;
    if (registrationStatus === 'joined') {
      return entry;
    }
    if (registrationStatus !== 'registered') {
      throw new Error('Invalid registration status');
    }

    await this.pool.query(
      `UPDATE tournament_entries SET registration_status = 'joined' WHERE id = $1`,
      [entry.id]
    );
    const updated = await this.getTournamentEntry(normalizedAddress, tournamentId);
    return updated!;
  }

  /**
   * Re-enter a freeroll during the reentry window (if busted).
   */
  async reentryFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const windowResult = await this.pool.query('SELECT is_reentry_window_open($1) AS open', [tournamentId]);
    if (!windowResult.rows[0]?.open) {
      throw new Error('Re-entry window is not open');
    }

    const entry = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (!entry) {
      throw new Error('Not in this tournament');
    }
    if (entry.status !== 'busted') {
      throw new Error('Only eliminated players can re-enter');
    }

    const tournamentResult = await this.pool.query(
      `SELECT starting_chips FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      throw new Error('Tournament not found');
    }
    const startingChips = Number(tournamentResult.rows[0].starting_chips);

    await this.pool.query(
      `UPDATE tournament_entries SET status = 'playing', chips_remaining = $1, reentry_count = COALESCE(reentry_count, 0) + 1, last_reentry_at = NOW() WHERE id = $2`,
      [startingChips, entry.id]
    );
    const updated = await this.getTournamentEntry(normalizedAddress, tournamentId);
    logger.info('Player re-entered freeroll', { playerAddress: normalizedAddress, tournamentId });
    return updated!;
  }

  /**
   * Validate bet amount for tournament
   */
  validateTournamentBet(chips: number, betAmount: number): { valid: boolean; error?: string } {
    if (betAmount < TOURNAMENT_CONFIG.MIN_BET) {
      return { valid: false, error: `Minimum bet is ${TOURNAMENT_CONFIG.MIN_BET} chips` };
    }

    if (betAmount > chips) {
      return { valid: false, error: `Cannot bet more than your chip count (${chips})` };
    }

    return { valid: true };
  }

  // ============================================
  // Tournament Creator Methods
  // ============================================

  /**
   * Create a custom tournament
   */
  async createTournament(params: CreateTournamentParams): Promise<Tournament> {
    const normalizedCreator = this.normalizeAddress(params.creatorAddress);

    // Validate parameters
    const validation = this.validateTournamentParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // onChainTournamentId validation - address is hardcoded, always available

    // PIN for private tournaments: use creator-provided if valid, else generate
    let pinCode: string | null = null;
    if (params.isPrivate) {
      const customPin = params.pinCode?.trim();
      if (customPin && customPin.length >= 4 && customPin.length <= 12 && /^\d+$/.test(customPin)) {
        pinCode = customPin;
      } else {
        pinCode = this.generatePinCode();
      }
    }

    // Buy-in tournaments start in registration; ends_at is set when min_players reached (24h window)
    const prizePercentages = this.getPrizePercentages(params.prizeDistributionType);

    const hasCustomPrizeToken = params.prizeTokenAddress != null && params.prizeTokenAddress.trim() !== '';
    const initialPrizePool = hasCustomPrizeToken && params.prizeAmount ? params.prizeAmount : '0';

    const platformFeePercent = 3;
    const creatorFeePercent = 2;

    const onChainId = params.onChainTournamentId != null ? Number(params.onChainTournamentId) : null;
    const minPlayers = this.getMinPlayersFromPrizeDistribution(params.prizeDistributionType);

    const query = `
      INSERT INTO tournaments (
        name,
        creator_address,
        buy_in_amount,
        starting_chips,
        max_hands,
        min_players,
        time_limit_minutes,
        rebuy_config,
        table_theme,
        is_private,
        pin_code,
        prize_distribution_type,
        prize_percentages,
        max_players,
        ends_at,
        custom_image,
        prize_token_address,
        prize_token_decimals,
        prize_pool,
        creator_fee_percent,
        platform_fee_percent,
        on_chain_tournament_id,
        status,
        activated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'registration', NULL)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      params.name.trim(),
      normalizedCreator,
      params.buyInAmount.toString(),
      params.startingChips,
      params.maxHands,
      minPlayers,
      params.timeLimitMinutes,
      JSON.stringify({ enabled: false, maxRebuys: 0 }),
      JSON.stringify(params.tableTheme),
      params.isPrivate,
      pinCode,
      params.prizeDistributionType,
      JSON.stringify(prizePercentages),
      params.maxPlayers,
      null,
      params.customImage || null,
      hasCustomPrizeToken ? params.prizeTokenAddress!.trim() : null,
      hasCustomPrizeToken && params.prizeTokenDecimals != null ? params.prizeTokenDecimals : null,
      initialPrizePool,
      creatorFeePercent,
      platformFeePercent,
      onChainId,
    ]);

    const tournament = this.normalizeTournament(result.rows[0]);

    logger.info('Custom tournament created', {
      tournamentId: tournament.id,
      name: tournament.name,
      creator: normalizedCreator,
      buyIn: params.buyInAmount.toString(),
      isPrivate: params.isPrivate,
    });

    return tournament;
  }

  /**
   * Determine the correct phase for a freeroll tournament based on current time.
   */
  private determineFreerollPhase(
    registrationOpensAt: Date,
    scheduledStartAt: Date,
    endsAt: Date | null
  ): 'registration' | 'active' | 'completed' {
    const now = new Date();
    
    if (endsAt && now >= endsAt) {
      return 'completed';
    }
    
    if (now >= scheduledStartAt) {
      return 'active';
    }
    
    if (now >= registrationOpensAt) {
      return 'registration';
    }
    
    return 'registration';
  }

  /**
   * Create a freeroll tournament (no buy-in, scheduled start).
   */
  async createFreeroll(params: CreateFreerollParams): Promise<{ id: string; pinCode?: string | null }> {
    const normalizedCreator = this.normalizeAddress(params.creatorAddress);
    const name = params.name.trim();
    if (name.length < 3 || name.length > 50) {
      throw new Error('Tournament name must be 3–50 characters');
    }
    const scheduledStart = new Date(params.scheduledStartAt);
    const registrationOpens = new Date(params.registrationOpensAt);
    if (isNaN(scheduledStart.getTime()) || isNaN(registrationOpens.getTime())) {
      throw new Error('Invalid scheduled or registration date');
    }
    if (registrationOpens >= scheduledStart) {
      throw new Error('Registration must open before scheduled start time');
    }
    if (params.durationMinutes < 5 || params.durationMinutes > 1440) {
      throw new Error('Duration must be 5–1440 minutes');
    }
    if (params.startingChips !== TOURNAMENT_CONFIG.STARTING_CHIPS) {
      throw new Error('Starting chips must be 5000');
    }
    if (params.maxHands !== TOURNAMENT_CONFIG.MAX_HANDS) {
      throw new Error('Max hands must be 25');
    }
    // Min players = number of paid places (don't run without full prize pool)
    const minPlayers = this.getMinPlayersFromPrizeDistribution(params.prizeDistributionType);
    const maxPlayers = params.maxPlayers != null
      ? Math.min(1000, Math.max(2, params.maxPlayers))
      : null;
    if (maxPlayers != null && minPlayers > maxPlayers) {
      throw new Error('Min players cannot exceed max players');
    }
    let pinCode: string | null = null;
    if (params.isPrivate) {
      pinCode = (params.pinCode?.trim() && /^\d{4,12}$/.test(params.pinCode.trim()))
        ? params.pinCode.trim()
        : this.generatePinCode();
    }
    const prizePercentages = this.getPrizePercentages(params.prizeDistributionType);
    const rebuyConfig = { enabled: false, maxRebuys: 0 };

    const platformFeePercent = 3;
    const creatorFeePercent = 2;

    // Calculate ends_at
    const endsAt = new Date(scheduledStart.getTime() + params.durationMinutes * 60 * 1000);
    
    // Determine initial phase based on current time
    const initialPhase = this.determineFreerollPhase(registrationOpens, scheduledStart, endsAt);

    const query = `
      INSERT INTO tournaments (
        name,
        creator_address,
        buy_in_amount,
        starting_chips,
        max_hands,
        min_players,
        status,
        prize_pool,
        time_limit_minutes,
        rebuy_config,
        table_theme,
        is_private,
        pin_code,
        prize_distribution_type,
        prize_percentages,
        max_players,
        custom_image,
        tournament_type,
        scheduled_start_at,
        registration_opens_at,
        duration_minutes,
        freeroll_mode,
        elimination_config,
        reentry_config,
        action_timer_seconds,
        current_phase,
        current_elimination_round,
        tiebreaker_order,
        creator_fee_percent,
        platform_fee_percent,
        ends_at
      ) VALUES ($1, $2, 0, $3, $4, $25, 'active', 0, NULL, $5, $6, $7, $8, $9, $10, $11, $12, 'freeroll', $13, $14, $15, $16, $17, $18, $19, $20, 0, $21, $22, $23, $24)
      RETURNING id, pin_code
    `;
    const result = await this.pool.query(query, [
      name,
      normalizedCreator,
      params.startingChips,
      params.maxHands,
      JSON.stringify(rebuyConfig),
      JSON.stringify(params.tableTheme),
      params.isPrivate,
      pinCode,
      params.prizeDistributionType,
      JSON.stringify(prizePercentages),
      maxPlayers,
      params.customImage || null,
      scheduledStart.toISOString(),
      registrationOpens.toISOString(),
      params.durationMinutes,
      'standard_chip_count',
      null,
      JSON.stringify({ enabled: false }),
      null,
      initialPhase,
      JSON.stringify(['highest_chips', 'blackjacks', 'hands_won', 'entry_time']),
      creatorFeePercent,
      platformFeePercent,
      endsAt.toISOString(),
      minPlayers,
    ]);
    const row = result.rows[0];
    const tournamentId = row.id;

    await this.pool.query(
      `INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
       VALUES ($1, 'start', $2, 'pending'), ($1, 'end', $3, 'pending')`,
      [tournamentId, scheduledStart.toISOString(), endsAt.toISOString()]
    );

    logger.info('Freeroll tournament created', {
      tournamentId,
      name,
      creator: normalizedCreator,
      scheduledStartAt: params.scheduledStartAt,
      initialPhase,
      endsAt: endsAt.toISOString(),
    });
    return { id: tournamentId, pinCode: row.pin_code };
  }

  /**
   * Validate tournament creation parameters
   */
  validateTournamentParams(params: CreateTournamentParams): { valid: boolean; error?: string } {
    // Validate name
    const name = params.name.trim();
    if (name.length < 3) {
      return { valid: false, error: 'Tournament name must be at least 3 characters' };
    }
    if (name.length > 50) {
      return { valid: false, error: 'Tournament name must be at most 50 characters' };
    }
    if (!/^[\w\s-]+$/.test(name)) {
      return { valid: false, error: 'Tournament name contains invalid characters' };
    }

    // Validate buy-in
    const minBuyIn = BigInt('100000000000000000000'); // 100 MORBIUS
    const maxBuyIn = BigInt('1000000000000000000000000'); // 1M MORBIUS
    if (params.buyInAmount < minBuyIn) {
      return { valid: false, error: 'Minimum buy-in is 100 MORBIUS' };
    }
    if (params.buyInAmount > maxBuyIn) {
      return { valid: false, error: 'Maximum buy-in is 1,000,000 MORBIUS' };
    }

    if (params.startingChips !== TOURNAMENT_CONFIG.STARTING_CHIPS) {
      return { valid: false, error: 'Starting chips must be 5000' };
    }
    if (params.maxHands !== TOURNAMENT_CONFIG.MAX_HANDS) {
      return { valid: false, error: 'Max hands must be 25' };
    }

    // Validate custom prize token (if set)
    if (params.prizeTokenAddress != null && params.prizeTokenAddress.trim() !== '') {
      const addr = params.prizeTokenAddress.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return { valid: false, error: 'Invalid prize token address' };
      }
      if (!params.prizeAmount || BigInt(params.prizeAmount) <= 0n) {
        return { valid: false, error: 'Prize amount required when using custom token' };
      }
      if (params.prizeTokenDecimals != null && (params.prizeTokenDecimals < 0 || params.prizeTokenDecimals > 18)) {
        return { valid: false, error: 'Prize token decimals must be 0–18' };
      }
    }

    // Validate time limit
    const validTimeLimits = [null, 60, 120, 240, 1440];
    if (!validTimeLimits.includes(params.timeLimitMinutes)) {
      return { valid: false, error: 'Invalid time limit' };
    }


    const validTypes = ['winner_takes_all', 'top_3', 'top_5', 'top_10'];
    if (!validTypes.includes(params.prizeDistributionType)) {
      return { valid: false, error: 'Invalid prize distribution type' };
    }

    return { valid: true };
  }

  /**
   * List active tournaments (for browser)
   */
  async listTournaments(includePrivate: boolean = false): Promise<TournamentListItem[]> {
    const query = `SELECT * FROM list_active_tournaments($1)`;
    const result = await this.pool.query(query, [includePrivate]);

    const list: TournamentListItem[] = result.rows.map(row => {
      // Parse JSONB fields
      let rebuyConfig = { enabled: false, maxRebuys: 0 };
      if (row.rebuy_config) {
        rebuyConfig = typeof row.rebuy_config === 'string'
          ? JSON.parse(row.rebuy_config)
          : row.rebuy_config;
      }

      let tableTheme: TableTheme = { kind: 'image', id: 'BigRich' };
      if (row.table_theme) {
        tableTheme = typeof row.table_theme === 'string'
          ? JSON.parse(row.table_theme)
          : row.table_theme;
      }

      return {
        id: row.id,
        name: row.name,
        creator_address: row.creator_address,
        buy_in_amount: this.toBigInt(row.buy_in_amount),
        starting_chips: Number(row.starting_chips),
        max_hands: Number(row.max_hands),
        min_players: Number(row.min_players ?? 2),
        prize_pool: this.toBigInt(row.prize_pool),
        entry_count: Number(row.entry_count),
        max_players: row.max_players ? Number(row.max_players) : null,
        status: row.status || 'active',
        time_limit_minutes: row.time_limit_minutes ? Number(row.time_limit_minutes) : null,
        ends_at: row.ends_at,
        rebuy_config: rebuyConfig,
        table_theme: tableTheme,
        is_private: Boolean(row.is_private),
        prize_distribution_type: row.prize_distribution_type || 'top_10',
        created_at: row.created_at,
        custom_image: row.custom_image || null,
        prize_token_address: row.prize_token_address ?? null,
        prize_token_decimals: row.prize_token_decimals != null ? Number(row.prize_token_decimals) : null,
        tournament_type: row.tournament_type ?? null,
        scheduled_start_at: row.scheduled_start_at ?? null,
        registration_opens_at: row.registration_opens_at ?? null,
        current_phase: row.current_phase ?? null,
        duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
        creator_fee_percent: Number(row.creator_fee_percent ?? 2),
        platform_fee_percent: Number(row.platform_fee_percent ?? 3),
        on_chain_tournament_id: row.on_chain_tournament_id != null ? Number(row.on_chain_tournament_id) : null,
      };
    });

    // For custom-token tournaments, fetch escrow funding status from V2 (bytes32)
    await Promise.all(list.map(async (item) => {
      if (!item.prize_token_address) return;
      const pool = await getEscrowPoolStatus(item.id);
      if (pool) {
        item.escrow_funded = pool.totalDeposited > 0n;
        item.escrow_total_deposited = pool.totalDeposited.toString();
        item.escrow_token = pool.token;
      } else {
        item.escrow_funded = false;
        item.escrow_total_deposited = '0';
        item.escrow_token = item.prize_token_address;
      }
    }));

    return list;
  }

  /**
   * Join a specific tournament by ID
   */
  async joinTournament(
    playerAddress: string,
    tournamentId: string,
    pinCode?: string
  ): Promise<TournamentEntry> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    // Get tournament
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'registration' && tournament.status !== 'active') {
      throw new Error('Tournament is not open for registration or play');
    }

    // Check time limit (only when active; registration has no ends_at yet)
    if (tournament.status === 'active' && tournament.ends_at && new Date(tournament.ends_at) <= new Date()) {
      throw new Error('Tournament has ended');
    }

    // Custom-token tournaments: must be funded before anyone can join
    if (tournament.prize_token_address) {
      const pool = await getEscrowPoolStatus(tournamentId);
      if (!pool || pool.totalDeposited <= 0n) {
        throw new Error('Tournament prize pool is not funded yet. No one can join until the pool is funded.');
      }
    }

    // Check PIN for private tournaments
    if (tournament.is_private) {
      if (!pinCode) {
        throw new Error('PIN code required for private tournament');
      }
      if (pinCode !== tournament.pin_code) {
        throw new Error('Invalid PIN code');
      }
    }

    const isOnChain = tournament.on_chain_tournament_id != null;

    // For on-chain tournaments: verify player joined on-chain before creating DB entry
    if (isOnChain) {
      // Verify player joined on-chain (address is hardcoded, always available)
      const joined = await hasJoinedMorbiusTournament(tournament.on_chain_tournament_id!, normalizedAddress);
      if (!joined) {
        throw new Error('You must join the tournament on-chain first. Please sign the transaction in your wallet.');
      }
    } else {
      // Off-chain: check player balance
      const balanceQuery = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
      const balanceResult = await this.pool.query(balanceQuery, [normalizedAddress]);

      if (balanceResult.rows.length === 0) {
        throw new Error('Player not found');
      }

      const balance = this.toBigInt(balanceResult.rows[0].balance);
      if (balance < tournament.buy_in_amount) {
        throw new Error(`Insufficient balance for buy-in. Need ${tournament.buy_in_amount.toString()}, have ${balance.toString()}`);
      }
    }

    // Process buy-in (off-chain only; on-chain buy-in already done via contract)
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock tournament row and check max players (race condition protection)
      await client.query(`SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);
      const entryCountQuery = `SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1`;
      const entryCountResult = await client.query(entryCountQuery, [tournamentId]);
      const entryCount = parseInt(entryCountResult.rows[0].count, 10);
      if (tournament.max_players && entryCount >= tournament.max_players) {
        await client.query('ROLLBACK');
        throw new Error('Tournament is full');
      }

      // Check if player already in this tournament
      const existingEntry = await this.getTournamentEntry(normalizedAddress, tournamentId);
      if (existingEntry && existingEntry.status === 'playing') {
        await client.query('ROLLBACK');
        throw new Error('Already in this tournament');
      }

      if (!isOnChain) {
        // Deduct buy-in from DB balance
        await client.query(
          `UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
          [tournament.buy_in_amount.toString(), normalizedAddress]
        );
      }

      // Add to DB prize_pool for prize calculation (both on-chain and off-chain platform MORBIUS)
      if (!tournament.prize_token_address && tournament.buy_in_amount > 0n) {
        await client.query(
          `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
          [tournament.buy_in_amount.toString(), tournamentId]
        );
      }

      // Create entry
      const entryQuery = `
        INSERT INTO tournament_entries (
          tournament_id, player_address, chips_remaining, highest_chip_count, total_buy_in
        ) VALUES ($1, $2, $3, $3, $4)
        RETURNING *
      `;
      const entryResult = await client.query(entryQuery, [
        tournamentId,
        normalizedAddress,
        tournament.starting_chips,
        tournament.buy_in_amount.toString(),
      ]);

      // Transition from registration to active when min_players reached
      const minPlayers = tournament.min_players ?? this.getMinPlayersFromPrizeDistribution(tournament.prize_distribution_type || 'top_10');
      const finalEntryCountResult = await client.query(
        `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1`,
        [tournamentId]
      );
      const finalEntryCount = parseInt(finalEntryCountResult.rows[0].c, 10);

      if (tournament.status === 'registration' && finalEntryCount >= minPlayers) {
        await client.query(
          `UPDATE tournaments SET status = 'active', activated_at = NOW(), ends_at = NOW() + INTERVAL '24 hours' WHERE id = $1`,
          [tournamentId]
        );
        if (isOnChain && tournament.on_chain_tournament_id != null) {
          const setActiveResult = await setMorbiusTournamentActive(tournament.on_chain_tournament_id);
          if (!setActiveResult.success) {
            logger.warn('MorbiusTournament setActive failed (continuing with join)', {
              tournamentId,
              onChainId: tournament.on_chain_tournament_id,
              error: setActiveResult.error,
            });
          }
        }
        logger.info('Tournament transitioned to active (min players reached)', {
          tournamentId,
          entryCount: finalEntryCount,
          minPlayers,
        });
      }

      await client.query('COMMIT');

      logger.info('Player joined tournament', {
        playerAddress: normalizedAddress,
        tournamentId,
        entryId: entryResult.rows[0].id,
      });

      return this.normalizeEntry(entryResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Unregister from a tournament during registration phase. MORBIUS only (platform tournaments).
   * Refunds buy-in to player balance and removes entry.
   */
  async unregisterTournament(playerAddress: string, tournamentId: string): Promise<void> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'registration') {
      throw new Error('Can only unregister before the tournament starts');
    }

    if (tournament.prize_token_address) {
      throw new Error('Unregister not supported for custom token tournaments');
    }

    if (tournament.on_chain_tournament_id != null) {
      throw new Error('Unregister not supported for on-chain tournaments');
    }

    const entry = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (!entry) {
      throw new Error('You are not in this tournament');
    }

    if (entry.status !== 'playing') {
      throw new Error('Cannot unregister: entry is not active');
    }

    const refundAmount = entry.total_buy_in > 0n ? entry.total_buy_in : tournament.buy_in_amount;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
        [refundAmount.toString(), normalizedAddress]
      );

      await client.query(
        `UPDATE tournaments SET prize_pool = prize_pool - $1::NUMERIC WHERE id = $2`,
        [refundAmount.toString(), tournamentId]
      );

      await client.query(`DELETE FROM tournament_entries WHERE id = $1`, [entry.id]);

      await client.query('COMMIT');

      logger.info('Player unregistered from tournament', {
        playerAddress: normalizedAddress,
        tournamentId,
        refundAmount: refundAmount.toString(),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get extended tournament info including all settings
   */
  async getTournamentInfoExtended(tournamentId: string): Promise<{
    tournament: Tournament;
    entryCount: number;
    prizePercentages: number[];
  } | null> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      return null;
    }

    const entryCount = await this.getTournamentEntryCount(tournamentId);
    const prizePercentages = this.getPrizePercentages(tournament.prize_distribution_type);

    return {
      tournament,
      entryCount,
      prizePercentages,
    };
  }

  /**
   * Get tournament state including rebuy info
   */
  async getTournamentStateExtended(playerAddress: string): Promise<(TournamentState & {
    rebuyCount: number;
    totalBuyIn: bigint;
    canRebuy: boolean;
    maxRebuys: number;
    rebuyEnabled: boolean;
  }) | null> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    const query = `
      SELECT
        te.*,
        t.max_hands,
        t.starting_chips,
        t.rebuy_config,
        tl.current_rank
      FROM tournament_entries te
      JOIN tournaments t ON te.tournament_id = t.id
      LEFT JOIN tournament_leaderboard tl ON tl.entry_id = te.id
      WHERE LOWER(te.player_address) = LOWER($1)
        AND t.status = 'active'
      ORDER BY te.bought_in_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [normalizedAddress]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Parse rebuy config
    let rebuyConfig = { enabled: false, maxRebuys: 0 };
    if (row.rebuy_config) {
      rebuyConfig = typeof row.rebuy_config === 'string'
        ? JSON.parse(row.rebuy_config)
        : row.rebuy_config;
    }

    // Determine if player can rebuy
    const canRebuy = rebuyConfig.enabled &&
      (row.status === 'busted' || Number(row.chips_remaining) <= 0) &&
      (rebuyConfig.maxRebuys === 0 || Number(row.rebuy_count || 0) < rebuyConfig.maxRebuys);

    return {
      entryId: row.id,
      tournamentId: row.tournament_id,
      chips: Number(row.chips_remaining),
      handsPlayed: Number(row.hands_played),
      handsRemaining: Number(row.max_hands) - Number(row.hands_played),
      highestChips: Number(row.highest_chip_count),
      currentRank: Number(row.current_rank || 1),
      status: row.status,
      prizeWon: this.toBigInt(row.prize_won),
      maxHands: Number(row.max_hands),
      startingChips: Number(row.starting_chips),
      // Extended fields
      rebuyCount: Number(row.rebuy_count || 0),
      totalBuyIn: this.toBigInt(row.total_buy_in),
      canRebuy,
      maxRebuys: rebuyConfig.maxRebuys,
      rebuyEnabled: rebuyConfig.enabled,
    };
  }

  /**
   * Execute a pending freeroll scheduled event (start, end, reentry_close).
   * Called by FreerollSchedulerService. Only marks the event as executed on success.
   */
  async executeScheduledEvent(event: {
    id: string;
    tournament_id: string;
    event_type: string;
    scheduled_at: Date;
    metadata: Record<string, unknown> | null;
  }): Promise<void> {
    const { id: eventId, tournament_id: tournamentId, event_type: eventType, metadata } = event;

    try {
      switch (eventType) {
        case 'start':
          await this.handleFreerollStart(tournamentId);
          break;
        case 'end':
          await this.handleFreerollEnd(tournamentId);
          break;
        case 'reentry_close':
          // No-op: reentry window is time-based; closing is implicit
          break;
        default:
          logger.warn('executeScheduledEvent: unknown event_type %s', eventType);
          return; // Don't mark unknown events as executed
      }

      // Only mark as executed if handler succeeded
      await this.pool.query(
        `UPDATE tournament_scheduled_events SET executed_at = NOW(), status = 'executed' WHERE id = $1`,
        [eventId]
      );
    } catch (error) {
      logger.error('executeScheduledEvent: failed to execute event %s for tournament %s: %s', eventId, tournamentId, error);
      // Leave event as 'pending' so it can be retried
      throw error;
    }
  }

  /** Transition freeroll to active and mark no-shows. Cancels if min players not met. */
  private async handleFreerollStart(tournamentId: string): Promise<void> {
    logger.info('handleFreerollStart: tournamentId=%s', tournamentId);

    const tournamentResult = await this.pool.query(
      `SELECT t.scheduled_start_at, t.duration_minutes, t.ends_at, t.prize_distribution_type, t.min_players,
              t.buy_in_amount, t.prize_token_address, t.on_chain_tournament_id, t.creator_address
       FROM tournaments t WHERE t.id = $1 AND t.tournament_type = 'freeroll'`,
      [tournamentId]
    );

    if (tournamentResult.rows.length === 0) {
      logger.warn('handleFreerollStart: tournament not found: %s', tournamentId);
      return;
    }

    const t = tournamentResult.rows[0];
    const minPlayers = Number(t.min_players ?? this.getMinPlayersFromPrizeDistribution(t.prize_distribution_type || 'top_10'));

    const entryCountResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND registration_status IN ('registered', 'joined')`,
      [tournamentId]
    );
    const entryCount = parseInt(entryCountResult.rows[0]?.c ?? '0', 10);

    if (entryCount < minPlayers) {
      logger.info('handleFreerollStart: insufficient players (%d < %d), cancelling tournament', entryCount, minPlayers);
      await this.cancelTournamentDueToInsufficientPlayers(tournamentId);
      return;
    }

    const scheduledStart = t.scheduled_start_at ? new Date(t.scheduled_start_at) : null;
    const durationMinutes = t.duration_minutes ? Number(t.duration_minutes) : null;

    let endsAt = t.ends_at ? new Date(t.ends_at) : null;
    if (!endsAt && scheduledStart && durationMinutes) {
      endsAt = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
      await this.pool.query(
        `UPDATE tournaments SET ends_at = $1 WHERE id = $2`,
        [endsAt.toISOString(), tournamentId]
      );
    }

    await this.pool.query(
      `UPDATE tournaments SET current_phase = 'active' WHERE id = $1 AND tournament_type = 'freeroll'`,
      [tournamentId]
    );
    await this.pool.query(
      `UPDATE tournament_entries SET registration_status = 'no_show' WHERE tournament_id = $1 AND registration_status = 'registered'`,
      [tournamentId]
    );
  }

  /**
   * Cancel tournament due to insufficient players at scheduled start.
   * Refunds buy-ins (credit MORBIUS to player balance). Cancels escrow for custom token.
   */
  private async cancelTournamentDueToInsufficientPlayers(tournamentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tournamentResult = await client.query(`SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);
      if (tournamentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const tournament = this.normalizeTournament(tournamentResult.rows[0]);
      const entriesResult = await client.query(`SELECT * FROM tournament_entries WHERE tournament_id = $1`, [tournamentId]);
      const entries = entriesResult.rows;

      if (tournament.buy_in_amount > 0n) {
        for (const entry of entries) {
          const refundAmount = this.toBigInt(entry.total_buy_in || tournament.buy_in_amount);
          if (refundAmount > 0n) {
            await client.query(
              `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
              [refundAmount.toString(), entry.player_address]
            );
            logger.info('Refunded buy-in for cancelled tournament (insufficient players)', {
              tournamentId,
              player: entry.player_address,
              amount: refundAmount.toString(),
            });
          }
        }
      }

      await client.query(
        `UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), current_phase = 'completed' WHERE id = $1`,
        [tournamentId]
      );

      if (tournament.prize_token_address) {
        const { cancelTournamentInEscrow } = await import('../utils/escrow-payout');
        const cancelResult = await cancelTournamentInEscrow(tournamentId);
        if (!cancelResult.success && cancelResult.error) {
          logger.warn('Failed to cancel tournament in escrow (insufficient players)', {
            tournamentId,
            error: cancelResult.error,
          });
        }
      }

      await client.query('COMMIT');
      logger.info('Tournament cancelled due to insufficient players', { tournamentId, entryCount: entries.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Creator Dashboard Methods
  // ============================================

  /**
   * Get all tournaments created by an address (active + completed)
   */
  async getCreatorTournaments(creatorAddress: string): Promise<{
    id: string;
    name: string;
    status: string;
    buyInAmount: string;
    prizePool: string;
    entryCount: number;
    creatorFeePercent: number;
    platformFeePercent: number;
    creatorFeeEarned: string;
    prizeDistributionType: string;
    createdAt: string;
    endedAt: string | null;
    customImage: string | null;
    isPrivate: boolean;
    tournamentType: string;
    maxHands: number;
    startingChips: number;
  }[]> {
    const normalizedAddress = this.normalizeAddress(creatorAddress);
    const result = await this.pool.query('SELECT * FROM get_creator_tournaments($1)', [normalizedAddress]);

    return (result.rows || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      buyInAmount: String(row.buy_in_amount ?? '0'),
      prizePool: String(row.prize_pool ?? '0'),
      entryCount: Number(row.entry_count ?? 0),
      creatorFeePercent: Number(row.creator_fee_percent ?? 2),
      platformFeePercent: Number(row.platform_fee_percent ?? 3),
      creatorFeeEarned: String(row.creator_fee_earned ?? '0'),
      prizeDistributionType: row.prize_distribution_type || 'top_10',
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      customImage: row.custom_image || null,
      isPrivate: Boolean(row.is_private),
      tournamentType: row.tournament_type || 'standard',
      maxHands: Number(row.max_hands ?? 50),
      startingChips: Number(row.starting_chips ?? 5000),
    }));
  }

  /**
   * Get earnings from completed tournaments for a creator
   */
  async getCreatorEarnings(creatorAddress: string): Promise<{
    tournamentId: string;
    tournamentName: string;
    prizePool: string;
    prizeTokenAddress: string | null;
    prizeTokenDecimals: number | null;
    feePercent: number;
    feeEarned: string;
    completedAt: string;
  }[]> {
    const normalizedAddress = this.normalizeAddress(creatorAddress);
    const query = `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.prize_pool,
        t.prize_token_address,
        t.prize_token_decimals,
        COALESCE(t.creator_fee_percent, 0) AS creator_fee_percent,
        (t.prize_pool * COALESCE(t.creator_fee_percent, 0)) / 100 AS fee_earned,
        t.ended_at
      FROM tournaments t
      WHERE LOWER(t.creator_address) = LOWER($1)
        AND t.status = 'completed'
        AND COALESCE(t.creator_fee_percent, 0) > 0
      ORDER BY t.ended_at DESC
    `;
    const result = await this.pool.query(query, [normalizedAddress]);

    return (result.rows || []).map((row: any) => ({
      tournamentId: row.tournament_id,
      tournamentName: row.tournament_name,
      prizePool: String(row.prize_pool ?? '0'),
      prizeTokenAddress: row.prize_token_address ?? null,
      prizeTokenDecimals: row.prize_token_decimals != null ? Number(row.prize_token_decimals) : null,
      feePercent: Number(row.creator_fee_percent ?? 0),
      feeEarned: String(row.fee_earned ?? '0'),
      completedAt: row.ended_at ? new Date(row.ended_at).toISOString() : '',
    }));
  }

  /** Complete freeroll: distribute prizes (via existing logic) and set current_phase = completed. */
  private async handleFreerollEnd(tournamentId: string): Promise<void> {
    logger.info('handleFreerollEnd: tournamentId=%s', tournamentId);

    const tournamentResult = await this.pool.query(
      `SELECT status FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      logger.warn('handleFreerollEnd: tournament not found or not freeroll: %s', tournamentId);
      return;
    }
    if (tournamentResult.rows[0].status !== 'active') {
      logger.info('handleFreerollEnd: tournament already not active, skipping: %s', tournamentId);
      await this.pool.query(
        `UPDATE tournaments SET current_phase = 'completed' WHERE id = $1 AND tournament_type = 'freeroll'`,
        [tournamentId]
      );
      return;
    }

    // distributePrizes now handles current_phase update for freerolls inside the transaction
    await this.distributePrizes(tournamentId);
  }

  /**
   * Cancel a tournament that hasn't started (no games played yet).
   * Only the creator can cancel their tournament.
   * If tournament has custom prize token, marks it as cancelled in escrow.
   * Refunds buy-ins to players if tournament hasn't started.
   */
  async cancelTournament(tournamentId: string, cancellerAddress: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get tournament
      const tournamentQuery = `SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`;
      const tournamentResult = await client.query(tournamentQuery, [tournamentId]);

      if (tournamentResult.rows.length === 0) {
        throw new Error('Tournament not found');
      }

      const tournament = this.normalizeTournament(tournamentResult.rows[0]);
      const normalizedCanceller = this.normalizeAddress(cancellerAddress);

      // Verify canceller is the creator
      if (!tournament.creator_address || this.normalizeAddress(tournament.creator_address) !== normalizedCanceller) {
        throw new Error('Only the tournament creator can cancel the tournament');
      }

      // Check tournament status
      if (tournament.status === 'completed') {
        throw new Error('Cannot cancel a completed tournament');
      }
      if (tournament.status === 'cancelled') {
        throw new Error('Tournament is already cancelled');
      }

      // Check if any games have been played
      const gamesQuery = `SELECT COUNT(*) as count FROM tournament_games WHERE tournament_id = $1`;
      const gamesResult = await client.query(gamesQuery, [tournamentId]);
      const gamesCount = parseInt(gamesResult.rows[0].count, 10);

      if (gamesCount > 0) {
        throw new Error('Cannot cancel tournament that has already started (games have been played)');
      }

      // Get all entries
      const entriesQuery = `SELECT * FROM tournament_entries WHERE tournament_id = $1`;
      const entriesResult = await client.query(entriesQuery, [tournamentId]);
      const entries = entriesResult.rows;

      const isOnChain = tournament.on_chain_tournament_id != null;

      // Refund buy-ins to players (if tournament has buy-in)
      if (tournament.buy_in_amount > 0n) {
        if (isOnChain) {
          // For on-chain tournaments: refund from contract
          const { cancelMorbiusTournament, refundMorbiusTournamentPlayer } = await import('../utils/morbius-tournament');
          
          // Cancel tournament on-chain first
          const cancelResult = await cancelMorbiusTournament(tournament.on_chain_tournament_id!);
          if (!cancelResult.success) {
            throw new Error(`Failed to cancel tournament on-chain: ${cancelResult.error || 'Unknown error'}`);
          }

          // Refund each player from contract
          for (const entry of entries) {
            const refundResult = await refundMorbiusTournamentPlayer(tournament.on_chain_tournament_id!, entry.player_address);
            if (!refundResult.success) {
              logger.warn('Failed to refund player from on-chain tournament', {
                tournamentId,
                player: entry.player_address,
                error: refundResult.error,
              });
              // Continue with other refunds even if one fails
            } else {
              logger.info('Refunded player from on-chain tournament', {
                tournamentId,
                player: entry.player_address,
                txHash: refundResult.txHash,
              });
            }
          }
        } else {
          // Off-chain tournaments: refund from DB balance
          for (const entry of entries) {
            const refundAmount = this.toBigInt(entry.total_buy_in || tournament.buy_in_amount);
            if (refundAmount > 0n) {
              await client.query(
                `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
                [refundAmount.toString(), entry.player_address]
              );
              logger.info('Refunded buy-in for cancelled tournament', {
                tournamentId,
                player: entry.player_address,
                amount: refundAmount.toString(),
              });
            }
          }
        }
      }

      // Mark tournament as cancelled
      await client.query(
        `UPDATE tournaments SET status = 'cancelled', ended_at = NOW() WHERE id = $1`,
        [tournamentId]
      );

      // If tournament has custom prize token, mark as cancelled in escrow (always V2 bytes32)
      if (tournament.prize_token_address) {
        const { cancelTournamentInEscrow } = await import('../utils/escrow-payout');
        const cancelResult = await cancelTournamentInEscrow(tournamentId);
        if (!cancelResult.success && cancelResult.error) {
          logger.warn('Failed to cancel tournament in escrow (tournament marked cancelled in DB)', {
            tournamentId,
            error: cancelResult.error,
          });
        }
      }

      await client.query('COMMIT');

      logger.info('Tournament cancelled', {
        tournamentId,
        cancelledBy: normalizedCanceller,
        entriesRefunded: entries.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle time-expired tournament: mark forfeits, then either distribute prizes (with forfeit bonus to 1st)
   * or refund everyone if all forfeited.
   */
  async handleTimeExpiredTournament(tournamentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tournamentResult = await client.query(`SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);
      if (tournamentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const tournament = this.normalizeTournament(tournamentResult.rows[0]);
      if (tournament.status !== 'active') {
        await client.query('ROLLBACK');
        return;
      }

      // Mark all still-playing as forfeited
      const forfeitResult = await client.query(
        `UPDATE tournament_entries SET status = 'forfeited', finished_at = NOW() WHERE tournament_id = $1 AND status = 'playing' RETURNING id, player_address, total_buy_in`,
        [tournamentId]
      );
      const forfeitedEntries = forfeitResult.rows;

      // Count by status
      const countResult = await client.query(
        `SELECT status, COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 GROUP BY status`,
        [tournamentId]
      );
      const completedCount = countResult.rows.find((r: any) => r.status === 'completed')?.c ?? 0;
      const bustedCount = countResult.rows.find((r: any) => r.status === 'busted')?.c ?? 0;
      const forfeitedCount = countResult.rows.find((r: any) => r.status === 'forfeited')?.c ?? 0;
      const hasFinishers = parseInt(completedCount, 10) + parseInt(bustedCount, 10) > 0;

      if (hasFinishers) {
        // Prize pool already includes forfeited buy-ins (added when they joined).
        // calculate_tournament_prizes excludes forfeited from ranking; full pool goes to completed/busted.
        await client.query('COMMIT');
        client.release();
        await this.distributePrizes(tournamentId);
        return;
      }

      // All forfeited: refund each player
      const entriesResult = await client.query(`SELECT * FROM tournament_entries WHERE tournament_id = $1`, [tournamentId]);
      const entries = entriesResult.rows;
      const isOnChain = tournament.on_chain_tournament_id != null;
      const useCustomToken = Boolean(tournament.prize_token_address);

      if (isOnChain && !useCustomToken) {
        const { cancelMorbiusTournament, refundMorbiusTournamentPlayer } = await import('../utils/morbius-tournament');
        const cancelResult = await cancelMorbiusTournament(tournament.on_chain_tournament_id!);
        if (!cancelResult.success) {
          await client.query('ROLLBACK');
          throw new Error(`Failed to cancel on-chain tournament for refund: ${cancelResult.error || 'Unknown error'}`);
        }
        for (const entry of entries) {
          const refundResult = await refundMorbiusTournamentPlayer(tournament.on_chain_tournament_id!, entry.player_address);
          if (!refundResult.success) {
            logger.warn('Failed to refund player (everyone forfeited)', {
              tournamentId,
              player: entry.player_address,
              error: refundResult.error,
            });
          }
        }
      } else if (!isOnChain) {
        for (const entry of entries) {
          const refundAmount = this.toBigInt(entry.total_buy_in || tournament.buy_in_amount);
          if (refundAmount > 0n) {
            await client.query(
              `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
              [refundAmount.toString(), entry.player_address]
            );
          }
        }
      }
      // On-chain custom token: buy-ins went to platform; refund would need platform logic - skip for now

      await client.query(
        `UPDATE tournaments SET status = 'cancelled', ended_at = NOW() WHERE id = $1`,
        [tournamentId]
      );

      if (useCustomToken) {
        const { cancelTournamentInEscrow } = await import('../utils/escrow-payout');
        await cancelTournamentInEscrow(tournamentId);
      }

      await client.query('COMMIT');
      logger.info('Tournament cancelled (everyone forfeited), refunds processed', {
        tournamentId,
        entryCount: entries.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Creator reclaims funds from a cancelled tournament with custom prize token.
   * Only works if tournament is cancelled and caller is the creator.
   */
  async creatorReclaimFunds(tournamentId: string, creatorAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const client = await this.pool.connect();
    try {
      // Get tournament
      const tournament = await this.getTournament(tournamentId);
      if (!tournament) {
        return { success: false, error: 'Tournament not found' };
      }

      const normalizedCreator = this.normalizeAddress(creatorAddress);

      // Verify caller is the creator
      if (!tournament.creator_address || this.normalizeAddress(tournament.creator_address) !== normalizedCreator) {
        return { success: false, error: 'Only the tournament creator can reclaim funds' };
      }

      // Verify tournament is cancelled
      if (tournament.status !== 'cancelled') {
        return { success: false, error: 'Tournament must be cancelled before creator can reclaim funds' };
      }

      // Verify tournament has custom prize token
      if (!tournament.prize_token_address) {
        return { success: false, error: 'Tournament does not use custom prize token (no escrow funds to reclaim)' };
      }

      // Escrow V3 and V1/V2: Creator must call creatorReclaim() directly from their wallet.
      // This is a security feature - only the depositor can reclaim. The frontend handles the contract call.
      const isOnChain = tournament.on_chain_tournament_id != null;
      if (isOnChain) {
        return {
          success: false,
          error: 'For Escrow V3 tournaments, use the Reclaim Funds button to call creatorReclaim() from your wallet. Tournament ID: ' + tournament.on_chain_tournament_id,
        };
      } else {
        const { creatorReclaimFromEscrow } = await import('../utils/escrow-payout');
        const result = await creatorReclaimFromEscrow(tournamentId, creatorAddress);
        return result;
      }
    } catch (error) {
      logger.error('Error in creatorReclaimFunds', { tournamentId, creatorAddress, error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      client.release();
    }
  }
}
