"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
class DatabaseService {
    pool;
    constructor() {
        this.pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        this.pool.on('error', (err) => {
            logger_1.logger.error('Unexpected error on idle client', err);
        });
    }
    async connect() {
        try {
            const client = await this.pool.connect();
            logger_1.logger.info('Database connected successfully');
            client.release();
        }
        catch (error) {
            logger_1.logger.error('Database connection failed:', error);
            throw error;
        }
    }
    async disconnect() {
        await this.pool.end();
        logger_1.logger.info('Database disconnected');
    }
    // Player operations
    async getOrCreatePlayer(walletAddress) {
        const query = `
      INSERT INTO players (wallet_address)
      VALUES ($1)
      ON CONFLICT (wallet_address)
      DO UPDATE SET last_seen = NOW()
      RETURNING *
    `;
        const result = await this.pool.query(query, [walletAddress]);
        return result.rows[0];
    }
    async updatePlayerLastSeen(playerId) {
        const query = `UPDATE players SET last_seen = NOW() WHERE id = $1`;
        await this.pool.query(query, [playerId]);
    }
    async getPlayerStats(walletAddress) {
        const query = `SELECT * FROM get_player_stats($1)`;
        const result = await this.pool.query(query, [walletAddress]);
        return result.rows[0];
    }
    async getPlayerStatsEnhanced(walletAddress) {
        const query = `SELECT * FROM get_player_stats_enhanced($1)`;
        const result = await this.pool.query(query, [walletAddress]);
        return result.rows[0];
    }
    async getGlobalAnalytics() {
        const query = `SELECT * FROM get_global_analytics()`;
        const result = await this.pool.query(query);
        return result.rows[0];
    }
    async getPlayerGames(walletAddress, limit = 50, offset = 0) {
        const query = `
      SELECT g.*, gs.player_id
      FROM games g
      JOIN game_sessions gs ON g.session_id = gs.id
      JOIN players p ON gs.player_id = p.id
      WHERE p.wallet_address = $1
      ORDER BY g.created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const result = await this.pool.query(query, [walletAddress, limit, offset]);
        return result.rows;
    }
    async getSettlements(status, limit = 100) {
        let query = `SELECT * FROM settlements`;
        const params = [];
        if (status) {
            query += ` WHERE status = $1`;
            params.push(status);
            query += ` ORDER BY settled_at DESC LIMIT $2`;
            params.push(limit);
        }
        else {
            query += ` ORDER BY settled_at DESC LIMIT $1`;
            params.push(limit);
        }
        const result = await this.pool.query(query, params);
        return result.rows;
    }
    // Game session operations
    async createGameSession(playerId, serverSeedHash) {
        const query = `
      INSERT INTO game_sessions (player_id, server_seed_hash)
      VALUES ($1, $2)
      RETURNING *
    `;
        const result = await this.pool.query(query, [playerId, serverSeedHash]);
        return result.rows[0];
    }
    async getActiveSession(playerId) {
        const query = `
      SELECT * FROM game_sessions
      WHERE player_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await this.pool.query(query, [playerId]);
        return result.rows[0] || null;
    }
    async updateSessionStats(sessionId, betAmount, winAmount) {
        const query = `
      UPDATE game_sessions
      SET
        total_bet = total_bet + $2,
        total_win = total_win + $3,
        game_count = game_count + 1,
        updated_at = NOW()
      WHERE id = $1
    `;
        await this.pool.query(query, [sessionId, betAmount, winAmount]);
    }
    async endSession(sessionId) {
        const query = `
      UPDATE game_sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = $1
    `;
        await this.pool.query(query, [sessionId]);
    }
    // Game operations
    async createGame(sessionId, gameData) {
        const query = `
      INSERT INTO games (
        session_id,
        game_number,
        total_bet_amount,
        dealer_cards,
        dealer_total,
        client_seed_commitment,
        dealer_seed,
        hand_count,
        current_hand_index
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
        const values = [
            sessionId,
            gameData.game_number || 1,
            gameData.total_bet_amount || 0n,
            JSON.stringify(gameData.dealer_cards || []),
            gameData.dealer_total,
            gameData.client_seed_commitment,
            gameData.dealer_seed,
            gameData.hand_count || 1,
            gameData.current_hand_index || 0
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    // Game hand operations
    async createGameHand(gameId, handData) {
        const query = `
      INSERT INTO game_hands (
        game_id,
        hand_index,
        cards,
        total,
        has_ace,
        is_blackjack,
        is_bust,
        bet_amount,
        result,
        payout
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
        const values = [
            gameId,
            handData.hand_index || 0,
            JSON.stringify(handData.cards || []),
            handData.total,
            handData.has_ace || false,
            handData.is_blackjack || false,
            handData.is_bust || false,
            handData.bet_amount || 0n,
            handData.result,
            handData.payout || 0n
        ];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }
    async updateGameHand(handId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        if (updates.cards !== undefined) {
            fields.push(`cards = $${paramCount++}`);
            values.push(JSON.stringify(updates.cards));
        }
        if (updates.total !== undefined) {
            fields.push(`total = $${paramCount++}`);
            values.push(updates.total);
        }
        if (updates.has_ace !== undefined) {
            fields.push(`has_ace = $${paramCount++}`);
            values.push(updates.has_ace);
        }
        if (updates.is_blackjack !== undefined) {
            fields.push(`is_blackjack = $${paramCount++}`);
            values.push(updates.is_blackjack);
        }
        if (updates.is_bust !== undefined) {
            fields.push(`is_bust = $${paramCount++}`);
            values.push(updates.is_bust);
        }
        if (updates.result !== undefined) {
            fields.push(`result = $${paramCount++}`);
            values.push(updates.result);
        }
        if (updates.payout !== undefined) {
            fields.push(`payout = $${paramCount++}`);
            values.push(updates.payout);
        }
        if (updates.actions !== undefined) {
            fields.push(`actions = $${paramCount++}`);
            values.push(JSON.stringify(updates.actions));
        }
        if (updates.completed_at !== undefined) {
            fields.push(`completed_at = $${paramCount++}`);
            values.push(updates.completed_at);
        }
        if (fields.length === 0)
            return;
        const query = `
      UPDATE game_hands
      SET ${fields.join(', ')}
      WHERE id = $1
    `;
        values.push(handId);
        await this.pool.query(query, values);
    }
    async getGameHands(gameId) {
        const query = `
      SELECT * FROM game_hands
      WHERE game_id = $1
      ORDER BY hand_index ASC
    `;
        const result = await this.pool.query(query, [gameId]);
        return result.rows;
    }
    async updateGame(gameId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        if (updates.dealer_cards !== undefined) {
            fields.push(`dealer_cards = $${paramCount++}`);
            values.push(JSON.stringify(updates.dealer_cards));
        }
        if (updates.dealer_total !== undefined) {
            fields.push(`dealer_total = $${paramCount++}`);
            values.push(updates.dealer_total);
        }
        if (updates.result !== undefined) {
            fields.push(`result = $${paramCount++}`);
            values.push(updates.result);
        }
        if (updates.total_payout !== undefined) {
            fields.push(`total_payout = $${paramCount++}`);
            values.push(updates.total_payout);
        }
        if (updates.actions !== undefined) {
            fields.push(`actions = $${paramCount++}`);
            values.push(JSON.stringify(updates.actions));
        }
        if (updates.dealer_actions !== undefined) {
            fields.push(`dealer_actions = $${paramCount++}`);
            values.push(JSON.stringify(updates.dealer_actions));
        }
        if (updates.completed_at !== undefined) {
            fields.push(`completed_at = $${paramCount++}`);
            values.push(updates.completed_at);
        }
        if (fields.length === 0)
            return;
        const query = `
      UPDATE games
      SET ${fields.join(', ')}
      WHERE id = $1
    `;
        values.push(gameId);
        await this.pool.query(query, values);
    }
    async getGame(gameId) {
        const query = `SELECT * FROM games WHERE id = $1`;
        const result = await this.pool.query(query, [gameId]);
        return result.rows[0] || null;
    }
    async getSessionGames(sessionId) {
        const query = `
      SELECT * FROM games
      WHERE session_id = $1
      ORDER BY game_number ASC
    `;
        const result = await this.pool.query(query, [sessionId]);
        return result.rows;
    }
    // Seed reveal operations
    async revealServerSeed(gameId, serverSeedHash, serverSeed) {
        const query = `
      INSERT INTO seed_reveals (game_id, server_seed_hash, server_seed)
      VALUES ($1, $2, $3)
    `;
        await this.pool.query(query, [gameId, serverSeedHash, serverSeed]);
        // Mark the game as having revealed seed
        await this.pool.query('UPDATE games SET server_seed_revealed = true WHERE id = $1', [gameId]);
    }
    // Settlement operations
    async createSettlement(gameId, playerAddress, amount) {
        const query = `
      INSERT INTO settlements (game_id, player_address, amount)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
        const result = await this.pool.query(query, [gameId, playerAddress, amount]);
        return result.rows[0].id;
    }
    async updateSettlementStatus(settlementId, transactionHash, status) {
        const query = `
      UPDATE settlements
      SET transaction_hash = $2, status = $3, settled_at = NOW()
      WHERE id = $1
    `;
        await this.pool.query(query, [settlementId, transactionHash, status]);
    }
    // Connection management
    async addActiveConnection(playerId, connectionId) {
        const query = `
      INSERT INTO active_connections (player_id, connection_id)
      VALUES ($1, $2)
      ON CONFLICT (connection_id)
      DO UPDATE SET last_ping = NOW()
    `;
        await this.pool.query(query, [playerId, connectionId]);
    }
    async removeActiveConnection(connectionId) {
        const query = `DELETE FROM active_connections WHERE connection_id = $1`;
        await this.pool.query(query, [connectionId]);
    }
    async updateConnectionPing(connectionId) {
        const query = `UPDATE active_connections SET last_ping = NOW() WHERE connection_id = $1`;
        await this.pool.query(query, [connectionId]);
    }
    async cleanupOldConnections() {
        const query = `SELECT cleanup_old_connections()`;
        const result = await this.pool.query(query);
        return result.rows[0].cleanup_old_connections;
    }
    // Utility methods
    async withTransaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.service.js.map