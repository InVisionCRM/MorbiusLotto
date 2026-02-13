"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentService = exports.TOURNAMENT_CONFIG = void 0;
const logger_1 = require("../utils/logger");
const escrow_payout_1 = require("../utils/escrow-payout");
const escrow_status_1 = require("../utils/escrow-status");
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
        // Parse rebuy_config from JSONB
        let rebuyConfig = { enabled: false, maxRebuys: 0 };
        if (row.rebuy_config) {
            if (typeof row.rebuy_config === 'string') {
                try {
                    rebuyConfig = JSON.parse(row.rebuy_config);
                }
                catch {
                    // Keep default
                }
            }
            else {
                rebuyConfig = row.rebuy_config;
            }
        }
        // Parse table_theme from JSONB
        let tableTheme = { kind: 'image', id: 'BigRich' };
        if (row.table_theme) {
            if (typeof row.table_theme === 'string') {
                try {
                    tableTheme = JSON.parse(row.table_theme);
                }
                catch {
                    // Keep default
                }
            }
            else {
                tableTheme = row.table_theme;
            }
        }
        // Parse prize_percentages from JSONB
        let prizePercentages;
        if (row.prize_percentages) {
            if (typeof row.prize_percentages === 'string') {
                try {
                    prizePercentages = JSON.parse(row.prize_percentages);
                }
                catch {
                    // Keep undefined
                }
            }
            else {
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
            creator_fee_percent: Number(row.creator_fee_percent ?? 0),
            platform_fee_percent: Number(row.platform_fee_percent ?? 16),
            tournament_type: row.tournament_type ?? null,
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
            // Rebuy tracking
            rebuy_count: Number(row.rebuy_count || 0),
            total_buy_in: this.toBigInt(row.total_buy_in),
        };
    }
    /**
     * Generate a random 4-digit PIN code
     */
    generatePinCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }
    /**
     * Get prize percentages for a distribution type
     */
    getPrizePercentages(type, custom) {
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
            // Add to prize pool only for platform (non–custom token) tournaments
            if (!tournament.prize_token_address) {
                await client.query(`UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`, [tournament.buy_in_amount.toString(), tournament.id]);
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
            const useEscrow = Boolean(tournament.prize_token_address);
            // Apply prizes
            for (const row of prizesResult.rows) {
                const prizeAmount = this.toBigInt(row.prize_amount);
                if (prizeAmount > 0n) {
                    // Update entry with prize and final rank
                    await client.query(`UPDATE tournament_entries
             SET prize_won = $1::NUMERIC, final_rank = $2
             WHERE id = $3`, [prizeAmount.toString(), row.final_rank, row.entry_id]);
                    if (useEscrow) {
                        const result = await (0, escrow_payout_1.sendEscrowPayout)(tournamentId, row.player_address, prizeAmount);
                        if (!result.success) {
                            logger_1.logger.error('Escrow payout failed; rolling back tournament completion', {
                                tournamentId,
                                winner: row.player_address,
                                amount: prizeAmount.toString(),
                                error: result.error,
                            });
                            throw new Error(`Escrow payout failed for ${row.player_address}: ${result.error || 'Unknown error'}`);
                        }
                    }
                    else {
                        // Add prize to player balance (platform MORBIUS)
                        await client.query(`UPDATE players
               SET balance = balance + $1::NUMERIC
               WHERE LOWER(wallet_address) = LOWER($2)`, [prizeAmount.toString(), row.player_address]);
                    }
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
                        viaEscrow: useEscrow,
                    });
                }
                else {
                    // Just update final rank for non-prize positions
                    await client.query(`UPDATE tournament_entries SET final_rank = $1 WHERE id = $2`, [row.final_rank, row.entry_id]);
                }
            }
            // Distribute fees to platform wallet and creator
            const platformFeePercent = tournament.platform_fee_percent;
            const creatorFeePercent = tournament.creator_fee_percent;
            const totalPool = tournament.prize_pool;
            if (platformFeePercent > 0) {
                const platformFeeAmount = (totalPool * BigInt(platformFeePercent)) / 100n;
                const platformWallet = process.env.PLATFORM_FEE_WALLET;
                if (platformFeeAmount > 0n && platformWallet) {
                    if (useEscrow) {
                        const result = await (0, escrow_payout_1.sendEscrowPayout)(tournamentId, platformWallet, platformFeeAmount);
                        if (!result.success) {
                            logger_1.logger.error('Platform fee escrow payout failed; rolling back tournament completion', { tournamentId, amount: platformFeeAmount.toString(), error: result.error });
                            throw new Error(`Platform fee escrow payout failed: ${result.error || 'Unknown error'}`);
                        }
                    }
                    else {
                        await client.query(`INSERT INTO players (wallet_address, balance) VALUES (LOWER($1), $2::NUMERIC)
               ON CONFLICT (wallet_address) DO UPDATE SET balance = players.balance + $2::NUMERIC`, [platformWallet.toLowerCase(), platformFeeAmount.toString()]);
                    }
                    logger_1.logger.info('Platform fee distributed', { tournamentId, wallet: platformWallet, amount: platformFeeAmount.toString() });
                }
            }
            if (creatorFeePercent > 0 && tournament.creator_address) {
                const creatorFeeAmount = (totalPool * BigInt(creatorFeePercent)) / 100n;
                if (creatorFeeAmount > 0n) {
                    if (useEscrow) {
                        const result = await (0, escrow_payout_1.sendEscrowPayout)(tournamentId, tournament.creator_address, creatorFeeAmount);
                        if (!result.success) {
                            logger_1.logger.error('Creator fee escrow payout failed; rolling back tournament completion', { tournamentId, amount: creatorFeeAmount.toString(), error: result.error });
                            throw new Error(`Creator fee escrow payout failed: ${result.error || 'Unknown error'}`);
                        }
                    }
                    else {
                        await client.query(`UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`, [creatorFeeAmount.toString(), tournament.creator_address]);
                    }
                    logger_1.logger.info('Creator fee distributed', { tournamentId, wallet: tournament.creator_address, amount: creatorFeeAmount.toString() });
                }
            }
            // Mark tournament as completed
            // For freerolls, also update current_phase in the same transaction
            const isFreeroll = tournament.tournament_type === 'freeroll';
            if (isFreeroll) {
                await client.query(`UPDATE tournaments SET status = 'completed', ended_at = NOW(), current_phase = 'completed' WHERE id = $1`, [tournamentId]);
            }
            else {
                await client.query(`UPDATE tournaments SET status = 'completed', ended_at = NOW() WHERE id = $1`, [tournamentId]);
            }
            await client.query('COMMIT');
            // Reclaim any remaining escrow balance so funds never sit after tournament ends
            if (useEscrow) {
                const reclaimResult = await (0, escrow_payout_1.sendEscrowRemainderToReclaimWallet)(tournamentId);
                if (!reclaimResult.success && reclaimResult.error) {
                    logger_1.logger.warn('Escrow remainder reclaim failed (tournament already completed)', {
                        tournamentId,
                        error: reclaimResult.error,
                    });
                }
            }
            logger_1.logger.info('Tournament completed and prizes distributed', {
                tournamentId,
                totalDistributed: distributions.reduce((sum, d) => sum + d.prize_amount, 0n).toString(),
                winners: distributions.length,
                platformFeePercent,
                creatorFeePercent,
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
     * Get all entries for a tournament (for detail view player list)
     */
    async getEntries(tournamentId) {
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
    async getTournamentEntryCount(tournamentId) {
        const query = `SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1`;
        const result = await this.pool.query(query, [tournamentId]);
        return Number(result.rows[0].count);
    }
    /**
     * Get all tournaments a player has entered, with outcome (for "My History" UI).
     * Returns entries ordered by bought_in_at descending (most recent first).
     */
    async getPlayerTournamentHistory(playerAddress) {
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
        return result.rows.map((row) => ({
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
    async listFreerollTournaments(includePast = false) {
        const result = await this.pool.query('SELECT * FROM list_freeroll_tournaments($1)', [includePast]);
        return (result.rows || []).map((row) => ({
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
    async registerFreeroll(playerAddress, tournamentId) {
        const normalizedAddress = this.normalizeAddress(playerAddress);
        const tournamentResult = await this.pool.query(`SELECT id, tournament_type, current_phase, starting_chips, max_players, registration_opens_at, scheduled_start_at, ends_at FROM tournaments WHERE id = $1`, [tournamentId]);
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
            await this.pool.query(`UPDATE tournaments SET current_phase = $1 WHERE id = $2`, [correctPhase, tournamentId]);
            if (correctPhase !== 'registration') {
                throw new Error('Registration is closed');
            }
        }
        const existing = await this.getTournamentEntry(normalizedAddress, tournamentId);
        if (existing) {
            throw new Error('Already registered');
        }
        const countResult = await this.pool.query(`SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND registration_status IN ('registered', 'joined')`, [tournamentId]);
        const count = Number(countResult.rows[0].c);
        if (t.max_players != null && count >= t.max_players) {
            throw new Error('Tournament is full');
        }
        const startingChips = Number(t.starting_chips);
        const entryResult = await this.pool.query(`INSERT INTO tournament_entries (
        tournament_id, player_address, chips_remaining, highest_chip_count, total_buy_in, registration_status
      ) VALUES ($1, $2, $3, $3, 0, 'registered')
      RETURNING *`, [tournamentId, normalizedAddress, startingChips]);
        logger_1.logger.info('Player registered for freeroll', { playerAddress: normalizedAddress, tournamentId });
        return this.normalizeEntry(entryResult.rows[0]);
    }
    /**
     * Mark freeroll registration as "joined" (player is at the table).
     */
    async joinFreeroll(playerAddress, tournamentId) {
        const normalizedAddress = this.normalizeAddress(playerAddress);
        const entry = await this.getTournamentEntry(normalizedAddress, tournamentId);
        if (!entry) {
            throw new Error('Not registered for this freeroll');
        }
        const tournamentResult = await this.pool.query(`SELECT tournament_type, current_phase FROM tournaments WHERE id = $1`, [tournamentId]);
        if (tournamentResult.rows.length === 0) {
            throw new Error('Tournament not found');
        }
        const t = tournamentResult.rows[0];
        if (t.tournament_type !== 'freeroll') {
            throw new Error('Not a freeroll tournament');
        }
        if (t.current_phase !== 'registration' && t.current_phase !== 'active' && t.current_phase !== 'elimination_round') {
            throw new Error('Cannot join at this phase');
        }
        const statusResult = await this.pool.query(`SELECT registration_status FROM tournament_entries WHERE id = $1`, [entry.id]);
        const registrationStatus = statusResult.rows[0]?.registration_status;
        if (registrationStatus === 'joined') {
            return entry;
        }
        if (registrationStatus !== 'registered') {
            throw new Error('Invalid registration status');
        }
        await this.pool.query(`UPDATE tournament_entries SET registration_status = 'joined' WHERE id = $1`, [entry.id]);
        const updated = await this.getTournamentEntry(normalizedAddress, tournamentId);
        return updated;
    }
    /**
     * Re-enter a freeroll during the reentry window (after elimination).
     */
    async reentryFreeroll(playerAddress, tournamentId) {
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
        const tournamentResult = await this.pool.query(`SELECT starting_chips FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
        if (tournamentResult.rows.length === 0) {
            throw new Error('Tournament not found');
        }
        const startingChips = Number(tournamentResult.rows[0].starting_chips);
        await this.pool.query(`UPDATE tournament_entries SET status = 'playing', chips_remaining = $1, reentry_count = COALESCE(reentry_count, 0) + 1, last_reentry_at = NOW() WHERE id = $2`, [startingChips, entry.id]);
        const updated = await this.getTournamentEntry(normalizedAddress, tournamentId);
        logger_1.logger.info('Player re-entered freeroll', { playerAddress: normalizedAddress, tournamentId });
        return updated;
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
    // ============================================
    // Tournament Creator Methods
    // ============================================
    /**
     * Create a custom tournament
     */
    async createTournament(params) {
        const normalizedCreator = this.normalizeAddress(params.creatorAddress);
        // Validate parameters
        const validation = this.validateTournamentParams(params);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        // PIN for private tournaments: use creator-provided if valid, else generate
        let pinCode = null;
        if (params.isPrivate) {
            const customPin = params.pinCode?.trim();
            if (customPin && customPin.length >= 4 && customPin.length <= 12 && /^\d+$/.test(customPin)) {
                pinCode = customPin;
            }
            else {
                pinCode = this.generatePinCode();
            }
        }
        // Calculate ends_at if time limit is set
        let endsAt = null;
        if (params.timeLimitMinutes) {
            endsAt = new Date(Date.now() + params.timeLimitMinutes * 60 * 1000);
        }
        // Get prize percentages
        const prizePercentages = this.getPrizePercentages(params.prizeDistributionType, params.customPrizePercentages);
        const hasCustomPrizeToken = params.prizeTokenAddress != null && params.prizeTokenAddress.trim() !== '';
        const initialPrizePool = hasCustomPrizeToken && params.prizeAmount ? params.prizeAmount : '0';
        // Fee percentages: platform from env (or passed param), creator from request
        const platformFeePercent = params.platformFeePercent ?? parseInt(process.env.PLATFORM_FEE_PERCENT || '16', 10);
        const creatorFeePercent = params.creatorFeePercent ?? 0;
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
        ends_at,
        custom_image,
        prize_token_address,
        prize_token_decimals,
        prize_pool,
        creator_fee_percent,
        platform_fee_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
            params.customImage || null,
            hasCustomPrizeToken ? params.prizeTokenAddress.trim() : null,
            hasCustomPrizeToken && params.prizeTokenDecimals != null ? params.prizeTokenDecimals : null,
            initialPrizePool,
            creatorFeePercent,
            platformFeePercent,
        ]);
        const tournament = this.normalizeTournament(result.rows[0]);
        logger_1.logger.info('Custom tournament created', {
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
    determineFreerollPhase(registrationOpensAt, scheduledStartAt, endsAt) {
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
    async createFreeroll(params) {
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
        const validStartingChips = [1000, 5000, 10000, 25000];
        if (!validStartingChips.includes(params.startingChips)) {
            throw new Error('Invalid starting chips');
        }
        if (params.maxHands < 1 || params.maxHands > 200) {
            throw new Error('Max hands must be 1–200');
        }
        const minPlayers = Math.min(100, Math.max(2, params.minPlayers ?? 2));
        const maxPlayers = params.maxPlayers != null
            ? Math.min(1000, Math.max(2, params.maxPlayers))
            : null;
        if (maxPlayers != null && minPlayers > maxPlayers) {
            throw new Error('Min players cannot exceed max players');
        }
        if (params.freerollMode === 'elimination') {
            const ec = params.eliminationConfig;
            if (!ec || typeof ec.intervalType !== 'string' || typeof ec.intervalValue !== 'number') {
                throw new Error('Elimination mode requires eliminationConfig with intervalType and intervalValue');
            }
            const roundsMin = ec.eliminationRoundsMin ?? 1;
            const roundsMax = ec.eliminationRoundsMax ?? 20;
            if (roundsMin < 1 || roundsMax < 1 || roundsMin > roundsMax) {
                throw new Error('Elimination rounds min/max must be 1+ and min <= max');
            }
            if (ec.intervalValue < 1) {
                throw new Error('Elimination interval must be at least 1');
            }
        }
        let pinCode = null;
        if (params.isPrivate) {
            pinCode = (params.pinCode?.trim() && /^\d{4,12}$/.test(params.pinCode.trim()))
                ? params.pinCode.trim()
                : this.generatePinCode();
        }
        const prizePercentages = this.getPrizePercentages(params.prizeDistributionType, params.customPrizePercentages);
        const rebuyConfig = { enabled: false, maxRebuys: 0 };
        // Fee percentages
        const platformFeePercent = params.platformFeePercent ?? parseInt(process.env.PLATFORM_FEE_PERCENT || '16', 10);
        const creatorFeePercent = params.creatorFeePercent ?? 0;
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
            params.freerollMode,
            params.eliminationConfig ? JSON.stringify(params.eliminationConfig) : null,
            JSON.stringify(params.reentryConfig),
            params.actionTimerSeconds,
            initialPhase,
            Array.isArray(params.tiebreakerOrder) && params.tiebreakerOrder.length > 0
                ? JSON.stringify(params.tiebreakerOrder)
                : JSON.stringify(['highest_chips', 'blackjacks', 'hands_won', 'entry_time']),
            creatorFeePercent,
            platformFeePercent,
            endsAt.toISOString(),
            minPlayers,
        ]);
        const row = result.rows[0];
        const tournamentId = row.id;
        await this.pool.query(`INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
       VALUES ($1, 'start', $2, 'pending'), ($1, 'end', $3, 'pending')`, [tournamentId, scheduledStart.toISOString(), endsAt.toISOString()]);
        // Time-based elimination: schedule elimination_round events
        if (params.freerollMode === 'elimination' && params.eliminationConfig?.intervalType === 'time') {
            const ec = params.eliminationConfig;
            const intervalMins = Math.max(1, ec.intervalValue);
            const roundsMin = ec.eliminationRoundsMin ?? 1;
            const roundsMax = ec.eliminationRoundsMax ?? 20;
            const possibleByTime = Math.floor(params.durationMinutes / intervalMins);
            const numRounds = Math.min(roundsMax, Math.max(roundsMin, possibleByTime));
            if (numRounds >= 1) {
                const eventRows = [];
                for (let r = 1; r <= numRounds; r++) {
                    const at = new Date(scheduledStart.getTime() + r * intervalMins * 60 * 1000);
                    if (at < endsAt) {
                        eventRows.push({
                            tournament_id: tournamentId,
                            event_type: 'elimination_round',
                            scheduled_at: at.toISOString(),
                            status: 'pending',
                            metadata: JSON.stringify({ round_number: r }),
                        });
                    }
                }
                if (eventRows.length > 0) {
                    const values = eventRows
                        .map((_, i) => `($${1 + i * 5}, $${2 + i * 5}, $${3 + i * 5}, $${4 + i * 5}, $${5 + i * 5}::jsonb)`)
                        .join(', ');
                    const flatParams = eventRows.flatMap((e) => [e.tournament_id, e.event_type, e.scheduled_at, e.status, e.metadata]);
                    await this.pool.query(`INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status, metadata) VALUES ${values}`, flatParams);
                }
            }
        }
        logger_1.logger.info('Freeroll tournament created', {
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
    validateTournamentParams(params) {
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
        // Validate max hands (1-200 range)
        if (params.maxHands < 1 || params.maxHands > 200) {
            return { valid: false, error: 'Max hands must be between 1 and 200' };
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
    async listTournaments(includePrivate = false) {
        const query = `SELECT * FROM list_active_tournaments($1)`;
        const result = await this.pool.query(query, [includePrivate]);
        const list = result.rows.map(row => {
            // Parse JSONB fields
            let rebuyConfig = { enabled: false, maxRebuys: 0 };
            if (row.rebuy_config) {
                rebuyConfig = typeof row.rebuy_config === 'string'
                    ? JSON.parse(row.rebuy_config)
                    : row.rebuy_config;
            }
            let tableTheme = { kind: 'image', id: 'BigRich' };
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
                custom_image: row.custom_image || null,
                prize_token_address: row.prize_token_address ?? null,
                prize_token_decimals: row.prize_token_decimals != null ? Number(row.prize_token_decimals) : null,
                tournament_type: row.tournament_type ?? null,
                scheduled_start_at: row.scheduled_start_at ?? null,
                registration_opens_at: row.registration_opens_at ?? null,
                current_phase: row.current_phase ?? null,
                duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
                creator_fee_percent: Number(row.creator_fee_percent ?? 0),
                platform_fee_percent: Number(row.platform_fee_percent ?? 16),
            };
        });
        // For custom-token tournaments, fetch escrow funding status from chain
        await Promise.all(list.map(async (item) => {
            if (!item.prize_token_address)
                return;
            const pool = await (0, escrow_status_1.getEscrowPoolStatus)(item.id);
            if (pool) {
                item.escrow_funded = pool.totalDeposited > 0n;
                item.escrow_total_deposited = pool.totalDeposited.toString();
                item.escrow_token = pool.token;
            }
            else {
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
    async joinTournament(playerAddress, tournamentId, pinCode) {
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
        // Custom-token tournaments: must be funded before anyone can join
        if (tournament.prize_token_address) {
            const pool = await (0, escrow_status_1.getEscrowPoolStatus)(tournamentId);
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
            await client.query(`UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`, [tournament.buy_in_amount.toString(), normalizedAddress]);
            // Add to prize pool only for platform (non–custom token) tournaments
            if (!tournament.prize_token_address) {
                await client.query(`UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`, [tournament.buy_in_amount.toString(), tournamentId]);
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
            await client.query('COMMIT');
            logger_1.logger.info('Player joined tournament', {
                playerAddress: normalizedAddress,
                tournamentId,
                entryId: entryResult.rows[0].id,
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
     * Process rebuy for a player
     */
    async processRebuy(playerAddress, tournamentId) {
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
            await client.query(`UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`, [tournament.buy_in_amount.toString(), normalizedAddress]);
            // Add to prize pool only for platform (non–custom token) tournaments
            let newPrizePool = tournament.prize_pool;
            if (!tournament.prize_token_address) {
                const prizePoolResult = await client.query(`UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2 RETURNING prize_pool`, [tournament.buy_in_amount.toString(), tournamentId]);
                newPrizePool = this.toBigInt(prizePoolResult.rows[0].prize_pool);
            }
            // Update entry: reset chips, increment rebuy count, add to total buy-in
            const entryResult = await client.query(`UPDATE tournament_entries
         SET
           chips_remaining = $1,
           status = 'playing',
           rebuy_count = rebuy_count + 1,
           total_buy_in = total_buy_in + $2::NUMERIC,
           highest_chip_count = GREATEST(highest_chip_count, $1)
         WHERE id = $3
         RETURNING *`, [tournament.starting_chips, tournament.buy_in_amount.toString(), entry.id]);
            await client.query('COMMIT');
            logger_1.logger.info('Player rebuy processed', {
                playerAddress: normalizedAddress,
                tournamentId,
                entryId: entry.id,
                rebuyCount: entryResult.rows[0].rebuy_count,
            });
            return {
                entry: this.normalizeEntry(entryResult.rows[0]),
                newPrizePool,
            };
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
     * Get extended tournament info including all settings
     */
    async getTournamentInfoExtended(tournamentId) {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) {
            return null;
        }
        const entryCount = await this.getTournamentEntryCount(tournamentId);
        const prizePercentages = this.getPrizePercentages(tournament.prize_distribution_type, tournament.prize_percentages);
        return {
            tournament,
            entryCount,
            prizePercentages,
        };
    }
    /**
     * Get tournament state including rebuy info
     */
    async getTournamentStateExtended(playerAddress) {
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
     * Execute a pending freeroll scheduled event (start, elimination_round, end, reentry_close).
     * Called by FreerollSchedulerService. Only marks the event as executed on success.
     */
    async executeScheduledEvent(event) {
        const { id: eventId, tournament_id: tournamentId, event_type: eventType, metadata } = event;
        try {
            switch (eventType) {
                case 'start':
                    await this.handleFreerollStart(tournamentId);
                    break;
                case 'elimination_round':
                    await this.handleEliminationRound(tournamentId, metadata);
                    break;
                case 'end':
                    await this.handleFreerollEnd(tournamentId);
                    break;
                case 'reentry_close':
                    // No-op: reentry window is time-based; closing is implicit
                    break;
                default:
                    logger_1.logger.warn('executeScheduledEvent: unknown event_type %s', eventType);
                    return; // Don't mark unknown events as executed
            }
            // Only mark as executed if handler succeeded
            await this.pool.query(`UPDATE tournament_scheduled_events SET executed_at = NOW(), status = 'executed' WHERE id = $1`, [eventId]);
        }
        catch (error) {
            logger_1.logger.error('executeScheduledEvent: failed to execute event %s for tournament %s: %s', eventId, tournamentId, error);
            // Leave event as 'pending' so it can be retried
            throw error;
        }
    }
    /** Transition freeroll to active and mark no-shows. */
    async handleFreerollStart(tournamentId) {
        logger_1.logger.info('handleFreerollStart: tournamentId=%s', tournamentId);
        // Get tournament to ensure ends_at is set
        const tournamentResult = await this.pool.query(`SELECT scheduled_start_at, duration_minutes, ends_at FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
        if (tournamentResult.rows.length === 0) {
            logger_1.logger.warn('handleFreerollStart: tournament not found: %s', tournamentId);
            return;
        }
        const t = tournamentResult.rows[0];
        const scheduledStart = t.scheduled_start_at ? new Date(t.scheduled_start_at) : null;
        const durationMinutes = t.duration_minutes ? Number(t.duration_minutes) : null;
        // Ensure ends_at is set if not already set
        let endsAt = t.ends_at ? new Date(t.ends_at) : null;
        if (!endsAt && scheduledStart && durationMinutes) {
            endsAt = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
            await this.pool.query(`UPDATE tournaments SET ends_at = $1 WHERE id = $2`, [endsAt.toISOString(), tournamentId]);
        }
        await this.pool.query(`UPDATE tournaments SET current_phase = 'active' WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
        await this.pool.query(`UPDATE tournament_entries SET registration_status = 'no_show' WHERE tournament_id = $1 AND registration_status = 'registered'`, [tournamentId]);
    }
    /** Run elimination round: eliminate bottom % by chips (with tiebreakers), optionally reset chips for survivors. */
    async handleEliminationRound(tournamentId, metadata) {
        const roundNumber = typeof metadata?.round_number === 'number' ? metadata.round_number : 1;
        const tournamentResult = await this.pool.query(`SELECT elimination_config, tiebreaker_order, starting_chips FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
        if (tournamentResult.rows.length === 0) {
            logger_1.logger.warn('handleEliminationRound: tournament not found or not freeroll: %s', tournamentId);
            return;
        }
        const row = tournamentResult.rows[0];
        const eliminationConfig = row.elimination_config;
        const tiebreakerOrder = row.tiebreaker_order ?? ['highest_chips', 'blackjacks', 'hands_won', 'entry_time'];
        const startingChips = Number(row.starting_chips);
        if (!eliminationConfig || typeof eliminationConfig.eliminationPercentage !== 'number') {
            logger_1.logger.warn('handleEliminationRound: missing elimination_config or eliminationPercentage: %s', tournamentId);
            return;
        }
        const eliminationPct = Math.min(50, Math.max(5, eliminationConfig.eliminationPercentage));
        const resetChipsAfterRound = Boolean(eliminationConfig.resetChipsAfterRound);
        const entriesResult = await this.pool.query(`SELECT entry_id, player_address, rank_position, chips_remaining FROM get_entries_for_elimination($1, $2::jsonb)`, [tournamentId, JSON.stringify(tiebreakerOrder)]);
        const entries = entriesResult.rows;
        const count = entries.length;
        if (count === 0) {
            logger_1.logger.info('handleEliminationRound: no playing entries, skipping round %s', roundNumber);
            return;
        }
        const toEliminate = Math.min(count - 1, Math.ceil((count * eliminationPct) / 100));
        if (toEliminate <= 0) {
            await this.pool.query(`UPDATE tournaments SET current_elimination_round = $1, current_phase = 'elimination_round' WHERE id = $2`, [roundNumber, tournamentId]);
            return;
        }
        const toEliminateList = entries.filter((e) => e.rank_position <= toEliminate);
        const thresholdChips = toEliminateList.length > 0
            ? toEliminateList[toEliminateList.length - 1].chips_remaining
            : '0';
        const eliminatedEntryIds = toEliminateList.map((e) => e.entry_id);
        const survivorCount = count - eliminatedEntryIds.length;
        const eliminatedEntriesJson = JSON.stringify(toEliminateList.map((e) => ({ entry_id: e.entry_id, player_address: e.player_address, chips: e.chips_remaining })));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const entryId of eliminatedEntryIds) {
                await client.query(`UPDATE tournament_entries SET status = 'busted', eliminated_in_round = $1, chips_at_elimination = chips_remaining WHERE id = $2`, [roundNumber, entryId]);
            }
            await client.query(`INSERT INTO tournament_eliminations (tournament_id, round_number, eliminated_entries, threshold_chips, survivors_count)
         VALUES ($1, $2, $3::jsonb, $4::bigint, $5)`, [tournamentId, roundNumber, eliminatedEntriesJson, thresholdChips, survivorCount]);
            if (resetChipsAfterRound && survivorCount > 0) {
                await client.query(`UPDATE tournament_entries SET chips_remaining = $1, elimination_stats = '{"blackjacks": 0, "hands_won": 0, "hands_played": 0}' WHERE tournament_id = $2 AND status = 'playing' AND registration_status = 'joined'`, [startingChips, tournamentId]);
            }
            await client.query(`UPDATE tournaments SET current_elimination_round = $1, current_phase = 'elimination_round' WHERE id = $2`, [roundNumber, tournamentId]);
            await client.query('COMMIT');
            logger_1.logger.info('handleEliminationRound: tournamentId=%s round=%s eliminated=%s survivors=%s', tournamentId, roundNumber, eliminatedEntryIds.length, survivorCount);
            if (survivorCount <= 1) {
                await this.distributePrizes(tournamentId);
            }
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    // ============================================
    // Creator Dashboard Methods
    // ============================================
    /**
     * Get all tournaments created by an address (active + completed)
     */
    async getCreatorTournaments(creatorAddress) {
        const normalizedAddress = this.normalizeAddress(creatorAddress);
        const result = await this.pool.query('SELECT * FROM get_creator_tournaments($1)', [normalizedAddress]);
        return (result.rows || []).map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            buyInAmount: String(row.buy_in_amount ?? '0'),
            prizePool: String(row.prize_pool ?? '0'),
            entryCount: Number(row.entry_count ?? 0),
            creatorFeePercent: Number(row.creator_fee_percent ?? 0),
            platformFeePercent: Number(row.platform_fee_percent ?? 16),
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
    async getCreatorEarnings(creatorAddress) {
        const normalizedAddress = this.normalizeAddress(creatorAddress);
        const query = `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.prize_pool,
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
        return (result.rows || []).map((row) => ({
            tournamentId: row.tournament_id,
            tournamentName: row.tournament_name,
            prizePool: String(row.prize_pool ?? '0'),
            feePercent: Number(row.creator_fee_percent ?? 0),
            feeEarned: String(row.fee_earned ?? '0'),
            completedAt: row.ended_at ? new Date(row.ended_at).toISOString() : '',
        }));
    }
    /** Complete freeroll: distribute prizes (via existing logic) and set current_phase = completed. */
    async handleFreerollEnd(tournamentId) {
        logger_1.logger.info('handleFreerollEnd: tournamentId=%s', tournamentId);
        const tournamentResult = await this.pool.query(`SELECT status FROM tournaments WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
        if (tournamentResult.rows.length === 0) {
            logger_1.logger.warn('handleFreerollEnd: tournament not found or not freeroll: %s', tournamentId);
            return;
        }
        if (tournamentResult.rows[0].status !== 'active') {
            logger_1.logger.info('handleFreerollEnd: tournament already not active, skipping: %s', tournamentId);
            await this.pool.query(`UPDATE tournaments SET current_phase = 'completed' WHERE id = $1 AND tournament_type = 'freeroll'`, [tournamentId]);
            return;
        }
        // distributePrizes now handles current_phase update for freerolls inside the transaction
        await this.distributePrizes(tournamentId);
    }
}
exports.TournamentService = TournamentService;
//# sourceMappingURL=tournament.service.js.map