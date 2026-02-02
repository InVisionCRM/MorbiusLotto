import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// Tournament constants
export const TOURNAMENT_CONFIG = {
  BUY_IN_AMOUNT: BigInt('1000000000000000000000'), // 1,000 MORBIUS (18 decimals)
  STARTING_CHIPS: 5000,
  MAX_HANDS: 50,
  MIN_PLAYERS_FOR_PRIZES: 2,

  // Bet limits for tournament chips
  MIN_BET: 50,
  MAX_BET: 5000, // Can go all-in

  // Prize distribution percentages (out of 84% distributable pool)
  PRIZE_PERCENTAGES: [40, 20, 10, 2, 2, 2, 2, 2, 2, 2], // 1st through 10th
  HOUSE_PERCENTAGE: 16, // Goes to burn/keeper/deployer
};

// Rebuy configuration
export interface RebuyConfig {
  enabled: boolean;
  maxRebuys: number; // 0 = unlimited
}

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
  status: 'active' | 'completed' | 'cancelled';
  prize_pool: bigint;
  created_at: Date;
  ended_at?: Date;
  // New custom tournament fields
  creator_address?: string;
  time_limit_minutes?: number;
  rebuy_config: RebuyConfig;
  table_theme: TableTheme;
  is_private: boolean;
  pin_code?: string;
  prize_distribution_type: string;
  prize_percentages?: number[];
  max_players?: number;
  ends_at?: Date;
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

// Create tournament parameters
export interface CreateTournamentParams {
  creatorAddress: string;
  name: string;
  buyInAmount: bigint;
  startingChips: number;
  maxHands: number;
  timeLimitMinutes: number | null;
  rebuyConfig: RebuyConfig;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: string;
  customPrizePercentages?: number[];
  maxPlayers?: number | null;
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
  rebuy_config: RebuyConfig;
  table_theme: TableTheme;
  is_private: boolean;
  prize_distribution_type: string;
  created_at: Date;
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
    // Parse rebuy_config from JSONB
    let rebuyConfig: RebuyConfig = { enabled: false, maxRebuys: 0 };
    if (row.rebuy_config) {
      if (typeof row.rebuy_config === 'string') {
        try {
          rebuyConfig = JSON.parse(row.rebuy_config);
        } catch {
          // Keep default
        }
      } else {
        rebuyConfig = row.rebuy_config;
      }
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
          prizePercentages = JSON.parse(row.prize_percentages);
        } catch {
          // Keep undefined
        }
      } else {
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
  private getPrizePercentages(type: string, custom?: number[]): number[] {
    switch (type) {
      case 'winner_takes_all':
        return [100];
      case 'top_3':
        return [50, 30, 20];
      case 'top_3_steep':
        return [60, 25, 15];
      case 'top_5':
        return [40, 25, 15, 12, 8];
      case 'custom':
        return custom || [40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
      case 'top_10':
      default:
        return [40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
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

      // Add to prize pool
      await client.query(
        `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
        [tournament.buy_in_amount.toString(), tournament.id]
      );

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

      // Calculate prizes using the database function
      const prizesQuery = `SELECT * FROM calculate_tournament_prizes($1)`;
      const prizesResult = await client.query(prizesQuery, [tournamentId]);

      const distributions: PrizeDistribution[] = [];

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

          // Add prize to player balance
          await client.query(
            `UPDATE players
             SET balance = balance + $1::NUMERIC
             WHERE LOWER(wallet_address) = LOWER($2)`,
            [prizeAmount.toString(), row.player_address]
          );

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
          });
        } else {
          // Just update final rank for non-prize positions
          await client.query(
            `UPDATE tournament_entries SET final_rank = $1 WHERE id = $2`,
            [row.final_rank, row.entry_id]
          );
        }
      }

      // Mark tournament as completed
      await client.query(
        `UPDATE tournaments SET status = 'completed', ended_at = NOW() WHERE id = $1`,
        [tournamentId]
      );

      await client.query('COMMIT');

      logger.info('Tournament completed and prizes distributed', {
        tournamentId,
        totalDistributed: distributions.reduce((sum, d) => sum + d.prize_amount, 0n).toString(),
        winners: distributions.length,
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
   * Get total number of entries in a tournament
   */
  async getTournamentEntryCount(tournamentId: string): Promise<number> {
    const query = `SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1`;
    const result = await this.pool.query(query, [tournamentId]);
    return Number(result.rows[0].count);
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

    // Generate PIN for private tournaments
    const pinCode = params.isPrivate ? this.generatePinCode() : null;

    // Calculate ends_at if time limit is set
    let endsAt: Date | null = null;
    if (params.timeLimitMinutes) {
      endsAt = new Date(Date.now() + params.timeLimitMinutes * 60 * 1000);
    }

    // Get prize percentages
    const prizePercentages = this.getPrizePercentages(
      params.prizeDistributionType,
      params.customPrizePercentages
    );

    const query = `
      INSERT INTO tournaments (
        name,
        creator_address,
        buy_in_amount,
        starting_chips,
        max_hands,
        time_limit_minutes,
        rebuy_config,
        table_theme,
        is_private,
        pin_code,
        prize_distribution_type,
        prize_percentages,
        max_players,
        ends_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      params.name.trim(),
      normalizedCreator,
      params.buyInAmount.toString(),
      params.startingChips,
      params.maxHands,
      params.timeLimitMinutes,
      JSON.stringify(params.rebuyConfig),
      JSON.stringify(params.tableTheme),
      params.isPrivate,
      pinCode,
      params.prizeDistributionType,
      JSON.stringify(prizePercentages),
      params.maxPlayers,
      endsAt,
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

    // Validate starting chips
    const validStartingChips = [1000, 5000, 10000, 25000];
    if (!validStartingChips.includes(params.startingChips)) {
      return { valid: false, error: 'Invalid starting chips amount' };
    }

    // Validate max hands
    const validMaxHands = [25, 50, 100, 200, 500];
    if (!validMaxHands.includes(params.maxHands)) {
      return { valid: false, error: 'Invalid max hands amount' };
    }

    // Validate time limit
    const validTimeLimits = [null, 60, 120, 240, 1440];
    if (!validTimeLimits.includes(params.timeLimitMinutes)) {
      return { valid: false, error: 'Invalid time limit' };
    }

    // Validate rebuy config
    if (params.rebuyConfig.enabled) {
      const validMaxRebuys = [0, 1, 3, 5];
      if (!validMaxRebuys.includes(params.rebuyConfig.maxRebuys)) {
        return { valid: false, error: 'Invalid max rebuys setting' };
      }
    }

    // Validate prize distribution
    const validTypes = ['winner_takes_all', 'top_3', 'top_3_steep', 'top_5', 'top_10', 'custom'];
    if (!validTypes.includes(params.prizeDistributionType)) {
      return { valid: false, error: 'Invalid prize distribution type' };
    }

    // Validate custom percentages if provided
    if (params.prizeDistributionType === 'custom' && params.customPrizePercentages) {
      const sum = params.customPrizePercentages.reduce((a, b) => a + b, 0);
      if (sum !== 100) {
        return { valid: false, error: 'Custom prize percentages must sum to 100' };
      }
    }

    return { valid: true };
  }

  /**
   * List active tournaments (for browser)
   */
  async listTournaments(includePrivate: boolean = false): Promise<TournamentListItem[]> {
    const query = `SELECT * FROM list_active_tournaments($1)`;
    const result = await this.pool.query(query, [includePrivate]);

    return result.rows.map(row => {
      // Parse JSONB fields
      let rebuyConfig: RebuyConfig = { enabled: false, maxRebuys: 0 };
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
        prize_pool: this.toBigInt(row.prize_pool),
        entry_count: Number(row.entry_count),
        max_players: row.max_players ? Number(row.max_players) : null,
        time_limit_minutes: row.time_limit_minutes ? Number(row.time_limit_minutes) : null,
        ends_at: row.ends_at,
        rebuy_config: rebuyConfig,
        table_theme: tableTheme,
        is_private: Boolean(row.is_private),
        prize_distribution_type: row.prize_distribution_type || 'top_10',
        created_at: row.created_at,
      };
    });
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

    if (tournament.status !== 'active') {
      throw new Error('Tournament is not active');
    }

    // Check time limit
    if (tournament.ends_at && new Date(tournament.ends_at) <= new Date()) {
      throw new Error('Tournament has ended');
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

    // Check max players
    const entryCount = await this.getTournamentEntryCount(tournamentId);
    if (tournament.max_players && entryCount >= tournament.max_players) {
      throw new Error('Tournament is full');
    }

    // Check if player already in this tournament
    const existingEntry = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (existingEntry && existingEntry.status === 'playing') {
      throw new Error('Already in this tournament');
    }

    // Check player balance
    const balanceQuery = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
    const balanceResult = await this.pool.query(balanceQuery, [normalizedAddress]);

    if (balanceResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const balance = this.toBigInt(balanceResult.rows[0].balance);
    if (balance < tournament.buy_in_amount) {
      throw new Error(`Insufficient balance for buy-in. Need ${tournament.buy_in_amount.toString()}, have ${balance.toString()}`);
    }

    // Process buy-in
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Deduct buy-in
      await client.query(
        `UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
        [tournament.buy_in_amount.toString(), normalizedAddress]
      );

      // Add to prize pool
      await client.query(
        `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
        [tournament.buy_in_amount.toString(), tournamentId]
      );

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
   * Process rebuy for a player
   */
  async processRebuy(playerAddress: string, tournamentId: string): Promise<{
    entry: TournamentEntry;
    newPrizePool: bigint;
  }> {
    const normalizedAddress = this.normalizeAddress(playerAddress);

    // Get tournament
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'active') {
      throw new Error('Tournament is not active');
    }

    // Check if rebuys are enabled
    if (!tournament.rebuy_config.enabled) {
      throw new Error('Rebuys are not enabled for this tournament');
    }

    // Get entry
    const entry = await this.getTournamentEntry(normalizedAddress, tournamentId);
    if (!entry) {
      throw new Error('Not in this tournament');
    }

    // Check if player can rebuy
    if (entry.status !== 'busted' && entry.chips_remaining > 0) {
      throw new Error('Can only rebuy when busted or at 0 chips');
    }

    // Check max rebuys (0 = unlimited)
    if (tournament.rebuy_config.maxRebuys > 0 && entry.rebuy_count >= tournament.rebuy_config.maxRebuys) {
      throw new Error(`Maximum rebuys (${tournament.rebuy_config.maxRebuys}) reached`);
    }

    // Check player balance
    const balanceQuery = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
    const balanceResult = await this.pool.query(balanceQuery, [normalizedAddress]);

    if (balanceResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const balance = this.toBigInt(balanceResult.rows[0].balance);
    if (balance < tournament.buy_in_amount) {
      throw new Error(`Insufficient balance for rebuy. Need ${tournament.buy_in_amount.toString()}, have ${balance.toString()}`);
    }

    // Process rebuy
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Deduct buy-in
      await client.query(
        `UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
        [tournament.buy_in_amount.toString(), normalizedAddress]
      );

      // Add to prize pool
      const prizePoolResult = await client.query(
        `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2 RETURNING prize_pool`,
        [tournament.buy_in_amount.toString(), tournamentId]
      );
      const newPrizePool = this.toBigInt(prizePoolResult.rows[0].prize_pool);

      // Update entry: reset chips, increment rebuy count, add to total buy-in
      const entryResult = await client.query(
        `UPDATE tournament_entries
         SET
           chips_remaining = $1,
           status = 'playing',
           rebuy_count = rebuy_count + 1,
           total_buy_in = total_buy_in + $2::NUMERIC,
           highest_chip_count = GREATEST(highest_chip_count, $1)
         WHERE id = $3
         RETURNING *`,
        [tournament.starting_chips, tournament.buy_in_amount.toString(), entry.id]
      );

      await client.query('COMMIT');

      logger.info('Player rebuy processed', {
        playerAddress: normalizedAddress,
        tournamentId,
        entryId: entry.id,
        rebuyCount: entryResult.rows[0].rebuy_count,
      });

      return {
        entry: this.normalizeEntry(entryResult.rows[0]),
        newPrizePool,
      };
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
    const prizePercentages = this.getPrizePercentages(
      tournament.prize_distribution_type,
      tournament.prize_percentages
    );

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
    let rebuyConfig: RebuyConfig = { enabled: false, maxRebuys: 0 };
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
}
