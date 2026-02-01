"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentService = exports.TOURNAMENT_CONFIG = void 0;
const logger_1 = require("../utils/logger");
// Tournament constants
exports.TOURNAMENT_CONFIG = {
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
class TournamentService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    toBigInt(value) {
        if (typeof value === 'bigint')
            return value;
        if (value === null || value === undefined)
            return 0n;
        return BigInt(String(value));
    }
    normalizeAddress(address) {
        return address?.toLowerCase() || address;
    }
    normalizeTournament(row) {
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
        };
    }
    normalizeEntry(row) {
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
        };
    }
    /**
     * Get the current active tournament, creating one if needed
     */
    async getActiveTournament() {
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
                exports.TOURNAMENT_CONFIG.BUY_IN_AMOUNT.toString(),
                exports.TOURNAMENT_CONFIG.STARTING_CHIPS,
                exports.TOURNAMENT_CONFIG.MAX_HANDS,
            ]);
        }
        return this.normalizeTournament(result.rows[0]);
    }
    /**
     * Get a tournament by ID
     */
    async getTournament(tournamentId) {
        const query = `SELECT * FROM tournaments WHERE id = $1`;
        const result = await this.pool.query(query, [tournamentId]);
        return result.rows[0] ? this.normalizeTournament(result.rows[0]) : null;
    }
    /**
     * Enter a tournament by paying the buy-in
     */
    async enterTournament(playerAddress) {
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
            await client.query(`UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`, [tournament.buy_in_amount.toString(), normalizedAddress]);
            // Add to prize pool
            await client.query(`UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`, [tournament.buy_in_amount.toString(), tournament.id]);
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
            logger_1.logger.info('Player entered tournament', {
                playerAddress: normalizedAddress,
                tournamentId: tournament.id,
                entryId: entryResult.rows[0].id,
                startingChips: tournament.starting_chips,
            });
            return this.normalizeEntry(entryResult.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get player's tournament entry
     */
    async getTournamentEntry(playerAddress, tournamentId) {
        const normalizedAddress = this.normalizeAddress(playerAddress);
        let query;
        let params;
        if (tournamentId) {
            query = `
        SELECT * FROM tournament_entries
        WHERE LOWER(player_address) = LOWER($1) AND tournament_id = $2
        ORDER BY bought_in_at DESC
        LIMIT 1
      `;
            params = [normalizedAddress, tournamentId];
        }
        else {
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
    async getTournamentState(playerAddress) {
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
    async getLeaderboard(tournamentId, limit = 50) {
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
    async recordTournamentHand(entryId, gameId, betAmount, chipsBefore, chipsAfter, result) {
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
            await client.query(`INSERT INTO tournament_games (tournament_id, entry_id, game_id, hand_number, bet_amount, chips_before, chips_after, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [entry.tournament_id, entryId, gameId, handNumber, betAmount, chipsBefore, chipsAfter, result]);
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
            logger_1.logger.debug('Tournament hand recorded', {
                entryId,
                handNumber,
                betAmount,
                chipsBefore,
                chipsAfter,
                result,
            });
            return updatedEntry;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Update tournament chips after a hand
     */
    async updateChips(entryId, newChipCount) {
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
    async bustOut(entryId) {
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
        logger_1.logger.info('Player busted from tournament', {
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
    async completeTournamentEntry(entryId) {
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
        logger_1.logger.info('Player completed tournament', {
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
    async leaveTournament(playerAddress) {
        const entry = await this.getTournamentEntry(playerAddress);
        if (!entry || entry.status !== 'playing') {
            return null;
        }
        return this.bustOut(entry.id);
    }
    /**
     * Check if all players have finished and distribute prizes if so
     */
    async checkAndDistributePrizes(tournamentId) {
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
    async distributePrizes(tournamentId) {
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
            const distributions = [];
            // Apply prizes
            for (const row of prizesResult.rows) {
                const prizeAmount = this.toBigInt(row.prize_amount);
                if (prizeAmount > 0n) {
                    // Update entry with prize and final rank
                    await client.query(`UPDATE tournament_entries
             SET prize_won = $1::NUMERIC, final_rank = $2
             WHERE id = $3`, [prizeAmount.toString(), row.final_rank, row.entry_id]);
                    // Add prize to player balance
                    await client.query(`UPDATE players
             SET balance = balance + $1::NUMERIC
             WHERE LOWER(wallet_address) = LOWER($2)`, [prizeAmount.toString(), row.player_address]);
                    distributions.push({
                        entry_id: row.entry_id,
                        player_address: row.player_address,
                        final_rank: Number(row.final_rank),
                        prize_amount: prizeAmount,
                    });
                    logger_1.logger.info('Prize distributed', {
                        tournamentId,
                        playerAddress: row.player_address,
                        rank: row.final_rank,
                        prize: prizeAmount.toString(),
                    });
                }
                else {
                    // Just update final rank for non-prize positions
                    await client.query(`UPDATE tournament_entries SET final_rank = $1 WHERE id = $2`, [row.final_rank, row.entry_id]);
                }
            }
            // Mark tournament as completed
            await client.query(`UPDATE tournaments SET status = 'completed', ended_at = NOW() WHERE id = $1`, [tournamentId]);
            await client.query('COMMIT');
            logger_1.logger.info('Tournament completed and prizes distributed', {
                tournamentId,
                totalDistributed: distributions.reduce((sum, d) => sum + d.prize_amount, 0n).toString(),
                winners: distributions.length,
            });
            return distributions;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get total number of entries in a tournament
     */
    async getTournamentEntryCount(tournamentId) {
        const query = `SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1`;
        const result = await this.pool.query(query, [tournamentId]);
        return Number(result.rows[0].count);
    }
    /**
     * Validate bet amount for tournament
     */
    validateTournamentBet(chips, betAmount) {
        if (betAmount < exports.TOURNAMENT_CONFIG.MIN_BET) {
            return { valid: false, error: `Minimum bet is ${exports.TOURNAMENT_CONFIG.MIN_BET} chips` };
        }
        if (betAmount > chips) {
            return { valid: false, error: `Cannot bet more than your chip count (${chips})` };
        }
        return { valid: true };
    }
}
exports.TournamentService = TournamentService;
//# sourceMappingURL=tournament.service.js.map