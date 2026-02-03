"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
class DatabaseService {
    pool;
    /**
     * Get the underlying connection pool (for use by other services)
     */
    getPool() {
        return this.pool;
    }
    constructor() {
        // Neon PostgreSQL requires SSL. Respect sslmode in URL: verify-full/verify-ca => verify cert; require => accept any cert.
        const url = process.env.DATABASE_URL ?? '';
        const useVerifyFull = /sslmode=verify-full|sslmode=verify-ca/i.test(url);
        const isNeon = url.includes('neon.tech');
        const sslConfig = isNeon
            ? (useVerifyFull ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
            : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false);
        this.pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: sslConfig,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000, // Increased from 2000ms to 10 seconds for Neon connections
        });
        this.pool.on('error', (err) => {
            logger_1.logger.error('Unexpected error on idle client', err);
        });
    }
    toBigInt(value) {
        if (typeof value === 'bigint')
            return value;
        if (value === null || value === undefined)
            return 0n;
        // pg returns NUMERIC/INT8 as string by default
        return BigInt(String(value));
    }
    normalizePlayer(row) {
        return {
            ...row,
            balance: this.toBigInt(row.balance),
        };
    }
    normalizeSession(row) {
        return {
            ...row,
            nonce: Number(row.nonce ?? 0),
            total_bet: this.toBigInt(row.total_bet),
            total_win: this.toBigInt(row.total_win),
            game_count: Number(row.game_count ?? 0),
        };
    }
    normalizeGame(row) {
        return {
            ...row,
            total_bet_amount: this.toBigInt(row.total_bet_amount),
            total_payout: this.toBigInt(row.total_payout),
            dealer_cards: row.dealer_cards ?? [],
            dealer_actions: row.dealer_actions ?? [],
            actions: row.actions ?? [],
            game_number: Number(row.game_number ?? 0),
            hand_count: Number(row.hand_count ?? 1),
            current_hand_index: Number(row.current_hand_index ?? 0),
            server_seed_revealed: Boolean(row.server_seed_revealed),
            rng_counter: Number(row.rng_counter ?? 0),
        };
    }
    normalizeGameHand(row) {
        return {
            ...row,
            hand_index: Number(row.hand_index ?? 0),
            cards: row.cards ?? [],
            bet_amount: this.toBigInt(row.bet_amount),
            payout: this.toBigInt(row.payout),
            actions: row.actions ?? [],
            has_ace: Boolean(row.has_ace),
            is_blackjack: Boolean(row.is_blackjack),
            is_bust: Boolean(row.is_bust),
        };
    }
    normalizePlayerStats(row) {
        return {
            ...row,
            total_games: Number(row.total_games ?? 0),
            total_bet: this.toBigInt(row.total_bet),
            total_win: this.toBigInt(row.total_win),
            win_rate: Number(row.win_rate ?? 0),
            blackjack_count: Number(row.blackjack_count ?? 0),
        };
    }
    normalizeEnhancedPlayerStats(row) {
        return {
            ...row,
            total_games: Number(row.total_games ?? 0),
            total_bet: this.toBigInt(row.total_bet),
            total_win: this.toBigInt(row.total_win),
            win_rate: Number(row.win_rate ?? 0),
            blackjack_count: Number(row.blackjack_count ?? 0),
            current_streak: Number(row.current_streak ?? 0),
            best_streak: Number(row.best_streak ?? 0),
            biggest_win: this.toBigInt(row.biggest_win),
            biggest_loss: this.toBigInt(row.biggest_loss),
            average_bet: Number(row.average_bet ?? 0),
            average_payout: Number(row.average_payout ?? 0),
            profit_loss: this.toBigInt(row.profit_loss),
            roi: Number(row.roi ?? 0),
            games_today: Number(row.games_today ?? 0),
            games_this_week: Number(row.games_this_week ?? 0),
            favorite_bet_amount: this.toBigInt(row.favorite_bet_amount),
            rank: Number(row.rank ?? 0),
        };
    }
    normalizeGlobalAnalytics(row) {
        return {
            ...row,
            total_players: Number(row.total_players ?? 0),
            active_players: Number(row.active_players ?? 0),
            total_games_played: Number(row.total_games_played ?? 0),
            total_volume: this.toBigInt(row.total_volume),
            total_payouts: this.toBigInt(row.total_payouts),
            house_profit: this.toBigInt(row.house_profit),
            games_last_hour: Number(row.games_last_hour ?? 0),
            games_last_24_hours: Number(row.games_last_24_hours ?? 0),
            volume_last_24_hours: this.toBigInt(row.volume_last_24_hours),
            profit_last_24_hours: this.toBigInt(row.profit_last_24_hours),
            average_win_rate: Number(row.average_win_rate ?? 0),
            average_bet_size: Number(row.average_bet_size ?? 0),
            house_edge: Number(row.house_edge ?? 0),
            active_connections: Number(row.active_connections ?? 0),
            blackjack_rate: Number(row.blackjack_rate ?? 0),
            split_rate: Number(row.split_rate ?? 0),
            double_down_rate: Number(row.double_down_rate ?? 0),
            surrender_rate: Number(row.surrender_rate ?? 0),
            pending_settlements: Number(row.pending_settlements ?? 0),
            failed_settlements: Number(row.failed_settlements ?? 0),
            largest_bet: this.toBigInt(row.largest_bet),
            largest_payout: this.toBigInt(row.largest_payout),
        };
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
    // Helper to normalize Ethereum addresses to lowercase
    normalizeAddress(address) {
        return address?.toLowerCase() || address;
    }
    // Player operations
    async getOrCreatePlayer(walletAddress) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        const query = `
      INSERT INTO players (wallet_address)
      VALUES ($1)
      ON CONFLICT (wallet_address)
      DO UPDATE SET last_seen = NOW()
      RETURNING *
    `;
        const result = await this.pool.query(query, [normalizedAddress]);
        return this.normalizePlayer(result.rows[0]);
    }
    async updatePlayerLastSeen(playerId) {
        const query = `UPDATE players SET last_seen = NOW() WHERE id = $1`;
        await this.pool.query(query, [playerId]);
    }
    // Off-chain balance operations
    async getPlayerBalance(walletAddress) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        const query = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
        const result = await this.pool.query(query, [normalizedAddress]);
        if (result.rows.length === 0) {
            return 0n;
        }
        return BigInt(result.rows[0].balance || '0');
    }
    async updatePlayerBalance(walletAddress, amount, operation) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        let query;
        if (operation === 'set') {
            query = `UPDATE players SET balance = $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
        }
        else if (operation === 'add') {
            query = `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
        }
        else {
            query = `UPDATE players SET balance = balance - $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
        }
        const result = await this.pool.query(query, [normalizedAddress, amount.toString()]);
        if (result.rows.length === 0) {
            throw new Error(`Player not found: ${walletAddress}`);
        }
        return BigInt(result.rows[0].balance || '0');
    }
    async deductPlayerBalance(walletAddress, amount) {
        // Check balance first
        const currentBalance = await this.getPlayerBalance(walletAddress);
        if (currentBalance < amount) {
            throw new Error(`Insufficient balance: have ${currentBalance.toString()}, need ${amount.toString()}`);
        }
        return await this.updatePlayerBalance(walletAddress, amount, 'subtract');
    }
    async addPlayerBalance(walletAddress, amount) {
        return await this.updatePlayerBalance(walletAddress, amount, 'add');
    }
    async syncPlayerBalanceWithContract(walletAddress, contractBalance) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        await this.updatePlayerBalance(normalizedAddress, contractBalance, 'set');
    }
    async getPlayerStats(walletAddress) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        const query = `SELECT * FROM get_player_stats($1)`;
        const result = await this.pool.query(query, [normalizedAddress]);
        return this.normalizePlayerStats(result.rows[0] || {});
    }
    async getPlayerStatsEnhanced(walletAddress) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        const query = `SELECT * FROM get_player_stats_enhanced($1)`;
        const result = await this.pool.query(query, [normalizedAddress]);
        return this.normalizeEnhancedPlayerStats(result.rows[0] || {});
    }
    async getGlobalAnalytics() {
        const query = `SELECT * FROM get_global_analytics()`;
        const result = await this.pool.query(query);
        return this.normalizeGlobalAnalytics(result.rows[0] || {});
    }
    async getTopPlayers(limit = 10) {
        const query = `
      WITH agg AS (
        SELECT
          p.wallet_address,
          COUNT(g.*)::BIGINT AS total_games,
          COALESCE(SUM(g.total_bet_amount), 0)::NUMERIC(78, 0) AS total_bet,
          COALESCE(SUM(g.total_payout), 0)::NUMERIC(78, 0) AS total_win,
          (COALESCE(SUM(g.total_payout), 0) - COALESCE(SUM(g.total_bet_amount), 0))::NUMERIC(78, 0) AS profit_loss,
          CASE WHEN COUNT(g.*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE g.result IN ('win', 'blackjack'))::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
          ELSE 0 END AS win_rate
        FROM players p
        JOIN game_sessions gs ON gs.player_id = p.id
        JOIN games g ON g.session_id = gs.id AND g.result IS NOT NULL AND g.result != 'ongoing'
        GROUP BY p.id, p.wallet_address
      )
      SELECT ROW_NUMBER() OVER (ORDER BY total_bet DESC)::INTEGER AS rank, *
      FROM agg
      ORDER BY total_bet DESC
      LIMIT $1
    `;
        const result = await this.pool.query(query, [limit]);
        return result.rows.map((r) => this.normalizeTopPlayerEntry(r));
    }
    normalizeTopPlayerEntry(row) {
        return {
            rank: Number(row.rank ?? 0),
            wallet_address: row.wallet_address ?? '',
            total_games: Number(row.total_games ?? 0),
            total_bet: this.toBigInt(row.total_bet),
            total_win: this.toBigInt(row.total_win),
            profit_loss: this.toBigInt(row.profit_loss),
            win_rate: Number(row.win_rate ?? 0),
        };
    }
    async getPlayerGames(walletAddress, limit = 50, offset = 0) {
        const normalizedAddress = this.normalizeAddress(walletAddress);
        const query = `
      SELECT g.*, gs.player_id
      FROM games g
      JOIN game_sessions gs ON g.session_id = gs.id
      JOIN players p ON gs.player_id = p.id
      WHERE LOWER(p.wallet_address) = LOWER($1)
      ORDER BY g.created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const result = await this.pool.query(query, [normalizedAddress, limit, offset]);
        const games = result.rows.map((r) => this.normalizeGame(r));
        return games;
    }
    // Game session operations
    async createGameSession(playerId, serverSeed, serverSeedHash) {
        const query = `
      INSERT INTO game_sessions (player_id, server_seed, server_seed_hash)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await this.pool.query(query, [playerId, serverSeed, serverSeedHash]);
        return this.normalizeSession(result.rows[0]);
    }
    async getActiveSession(playerId) {
        const query = `
      SELECT * FROM game_sessions
      WHERE player_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await this.pool.query(query, [playerId]);
        return result.rows[0] ? this.normalizeSession(result.rows[0]) : null;
    }
    async getSessionById(sessionId) {
        const query = `SELECT * FROM game_sessions WHERE id = $1`;
        const result = await this.pool.query(query, [sessionId]);
        return result.rows[0] ? this.normalizeSession(result.rows[0]) : null;
    }
    async getPlayerAddressFromSession(sessionId) {
        const query = `
      SELECT p.wallet_address
      FROM players p
      JOIN game_sessions gs ON p.id = gs.player_id
      WHERE gs.id = $1
    `;
        const result = await this.pool.query(query, [sessionId]);
        if (result.rows.length === 0) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return result.rows[0].wallet_address;
    }
    async updateSessionStats(sessionId, betAmount, winAmount, incrementGameCount = true) {
        const query = `
      UPDATE game_sessions
      SET
        total_bet = total_bet + $2::NUMERIC,
        total_win = total_win + $3::NUMERIC,
        game_count = game_count + CASE WHEN $4::BOOLEAN THEN 1 ELSE 0 END
      WHERE id = $1
    `;
        await this.pool.query(query, [sessionId, betAmount.toString(), winAmount.toString(), incrementGameCount]);
    }
    async endSession(sessionId) {
        const query = `
      UPDATE game_sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = $1
    `;
        await this.pool.query(query, [sessionId]);
    }
    async setSessionServerSeed(sessionId, serverSeed, serverSeedHash) {
        const query = `
      UPDATE game_sessions
      SET server_seed = $2,
          server_seed_hash = $3
      WHERE id = $1
    `;
        await this.pool.query(query, [sessionId, serverSeed, serverSeedHash]);
    }
    // Game operations
    async createGame(sessionId, gameData) {
        // If the game isn't immediately settled, it must be persisted as 'ongoing'
        // so the first player_action isn't rejected as "Game already completed".
        const persistedResult = (gameData.result ?? 'ongoing');
        const query = `
      INSERT INTO games (
        session_id,
        game_number,
        total_bet_amount,
        dealer_cards,
        dealer_total,
        result,
        total_payout,
        actions,
        dealer_actions,
        client_seed_commitment,
        dealer_seed,
        hand_count,
        current_hand_index,
        rng_counter
      )
      VALUES ($1, $2, $3::NUMERIC, $4, $5, $6, $7::NUMERIC, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
        const values = [
            sessionId,
            gameData.game_number || 1,
            (gameData.total_bet_amount || 0n).toString(), // Convert BigInt to string, cast to NUMERIC then BIGINT
            JSON.stringify(gameData.dealer_cards || []),
            gameData.dealer_total,
            persistedResult,
            (gameData.total_payout || 0n).toString(),
            JSON.stringify(gameData.actions || []),
            JSON.stringify(gameData.dealer_actions || []),
            gameData.client_seed_commitment,
            gameData.dealer_seed,
            gameData.hand_count || 1,
            gameData.current_hand_index || 0,
            Number(gameData.rng_counter ?? 0),
        ];
        const result = await this.pool.query(query, values);
        return this.normalizeGame(result.rows[0]);
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
        payout,
        actions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::NUMERIC, $9, $10::NUMERIC, $11)
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
            (handData.bet_amount || 0n).toString(), // Convert BigInt to string, cast to NUMERIC then BIGINT
            handData.result,
            (handData.payout || 0n).toString(), // Convert BigInt to string, cast to NUMERIC then BIGINT
            JSON.stringify(handData.actions || [])
        ];
        const result = await this.pool.query(query, values);
        return this.normalizeGameHand(result.rows[0]);
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
        if (updates.bet_amount !== undefined) {
            fields.push(`bet_amount = $${paramCount++}::NUMERIC`);
            values.push(updates.bet_amount.toString());
        }
        if (updates.result !== undefined) {
            fields.push(`result = $${paramCount++}`);
            values.push(updates.result);
        }
        if (updates.payout !== undefined) {
            fields.push(`payout = $${paramCount++}::NUMERIC`);
            values.push(updates.payout.toString()); // Convert BigInt to string
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
        const idParam = paramCount++;
        const query = `
      UPDATE game_hands
      SET ${fields.join(', ')}
      WHERE id = $${idParam}
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
        const hands = result.rows.map((r) => this.normalizeGameHand(r));
        return hands;
    }
    async updateGame(gameId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        if (updates.dealer_cards !== undefined) {
            fields.push(`dealer_cards = $${paramCount++}`);
            values.push(JSON.stringify(updates.dealer_cards));
        }
        if (updates.total_bet_amount !== undefined) {
            fields.push(`total_bet_amount = $${paramCount++}::NUMERIC`);
            values.push(updates.total_bet_amount.toString());
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
            fields.push(`total_payout = $${paramCount++}::NUMERIC`);
            values.push(updates.total_payout.toString()); // Convert BigInt to string
        }
        if (updates.actions !== undefined) {
            fields.push(`actions = $${paramCount++}`);
            values.push(JSON.stringify(updates.actions));
        }
        if (updates.dealer_actions !== undefined) {
            fields.push(`dealer_actions = $${paramCount++}`);
            values.push(JSON.stringify(updates.dealer_actions));
        }
        if (updates.hand_count !== undefined) {
            fields.push(`hand_count = $${paramCount++}`);
            values.push(Number(updates.hand_count));
        }
        if (updates.current_hand_index !== undefined) {
            fields.push(`current_hand_index = $${paramCount++}`);
            values.push(Number(updates.current_hand_index));
        }
        if (updates.server_seed_revealed !== undefined) {
            fields.push(`server_seed_revealed = $${paramCount++}`);
            values.push(Boolean(updates.server_seed_revealed));
        }
        if (updates.client_seed_commitment !== undefined) {
            fields.push(`client_seed_commitment = $${paramCount++}`);
            values.push(updates.client_seed_commitment);
        }
        if (updates.dealer_seed !== undefined) {
            fields.push(`dealer_seed = $${paramCount++}`);
            values.push(updates.dealer_seed);
        }
        if (updates.rng_counter !== undefined) {
            fields.push(`rng_counter = $${paramCount++}`);
            values.push(Number(updates.rng_counter));
        }
        if (updates.completed_at !== undefined) {
            fields.push(`completed_at = $${paramCount++}`);
            values.push(updates.completed_at);
        }
        if (fields.length === 0)
            return;
        const idParam = paramCount++;
        const query = `
      UPDATE games
      SET ${fields.join(', ')}
      WHERE id = $${idParam}
    `;
        values.push(gameId);
        await this.pool.query(query, values);
    }
    async getGame(gameId) {
        const id = typeof gameId === 'string' ? gameId.trim() : gameId;
        if (!id)
            return null;
        const query = `SELECT * FROM games WHERE id = $1`;
        const result = await this.pool.query(query, [id]);
        return result.rows[0] ? this.normalizeGame(result.rows[0]) : null;
    }
    async getSessionGames(sessionId) {
        const query = `
      SELECT * FROM games
      WHERE session_id = $1
      ORDER BY game_number ASC
    `;
        const result = await this.pool.query(query, [sessionId]);
        return result.rows.map((r) => this.normalizeGame(r));
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
    async getSeedReveal(gameId) {
        const query = `
      SELECT server_seed_hash, server_seed
      FROM seed_reveals
      WHERE game_id = $1
      ORDER BY revealed_at DESC
      LIMIT 1
    `;
        const result = await this.pool.query(query, [gameId]);
        return result.rows[0] ? result.rows[0] : null;
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
    // Chat (main + per-game rooms)
    async insertChatMessage(roomId, senderAddress, text) {
        const query = `
      INSERT INTO chat_messages (room_id, sender_address, text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await this.pool.query(query, [
            roomId,
            senderAddress ? this.normalizeAddress(senderAddress) : null,
            text
        ]);
        const row = result.rows[0];
        return {
            id: row.id,
            room_id: row.room_id,
            sender_address: row.sender_address,
            text: row.text,
            created_at: row.created_at
        };
    }
    async getRecentChatMessages(roomId, limit = 50) {
        const query = `
      SELECT id, room_id, sender_address, text, created_at
      FROM chat_messages
      WHERE room_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
        const result = await this.pool.query(query, [roomId, limit]);
        return result.rows.map((row) => ({
            id: row.id,
            room_id: row.room_id,
            sender_address: row.sender_address,
            text: row.text,
            created_at: row.created_at
        })).reverse(); // chronological order for display
    }
    /** Messages older than the message with id beforeId, in chronological order (oldest first). */
    async getChatMessagesBefore(roomId, beforeId, limit = 50) {
        const query = `
      SELECT id, room_id, sender_address, text, created_at
      FROM chat_messages
      WHERE room_id = $1
        AND created_at < (SELECT created_at FROM chat_messages WHERE id = $2 LIMIT 1)
      ORDER BY created_at DESC
      LIMIT $3
    `;
        const result = await this.pool.query(query, [roomId, beforeId, limit]);
        return result.rows.map((row) => ({
            id: row.id,
            room_id: row.room_id,
            sender_address: row.sender_address,
            text: row.text,
            created_at: row.created_at
        })).reverse(); // chronological order for display
    }
    // Chat display names and profile (editable per wallet)
    async getDisplayName(walletAddress) {
        const normalized = this.normalizeAddress(walletAddress);
        const query = `SELECT display_name FROM chat_display_names WHERE wallet_address = $1`;
        const result = await this.pool.query(query, [normalized]);
        return result.rows[0]?.display_name ?? null;
    }
    async getProfile(walletAddress) {
        const normalized = this.normalizeAddress(walletAddress);
        const query = `SELECT display_name, profile_image_url FROM chat_display_names WHERE wallet_address = $1`;
        const result = await this.pool.query(query, [normalized]);
        const row = result.rows[0];
        if (!row)
            return null;
        return { displayName: row.display_name, profileImageUrl: row.profile_image_url ?? null };
    }
    async setDisplayName(walletAddress, displayName, profileImageUrl) {
        const normalized = this.normalizeAddress(walletAddress);
        if (profileImageUrl === undefined) {
            const query = `
        INSERT INTO chat_display_names (wallet_address, display_name)
        VALUES ($1, $2)
        ON CONFLICT (wallet_address)
        DO UPDATE SET display_name = $2, updated_at = NOW()
      `;
            await this.pool.query(query, [normalized, displayName]);
        }
        else {
            const query = `
        INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (wallet_address)
        DO UPDATE SET display_name = $2, updated_at = NOW(), profile_image_url = $3
      `;
            await this.pool.query(query, [normalized, displayName, profileImageUrl]);
        }
    }
    async getDisplayNames(walletAddresses) {
        if (walletAddresses.length === 0)
            return new Map();
        const normalized = [...new Set(walletAddresses.map(a => this.normalizeAddress(a)))];
        const query = `SELECT wallet_address, display_name FROM chat_display_names WHERE wallet_address = ANY($1)`;
        const result = await this.pool.query(query, [normalized]);
        const map = new Map();
        for (const row of result.rows) {
            map.set(row.wallet_address, row.display_name);
        }
        return map;
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
    // ============================================
    // Self-Exclusion / Responsible Gaming Methods
    // ============================================
    async checkExclusionStatus(walletAddress) {
        const normalized = this.normalizeAddress(walletAddress);
        // First, cleanup any expired timeouts
        await this.pool.query(`SELECT cleanup_expired_exclusions()`);
        const query = `
      SELECT
        exclusion_type,
        expires_at,
        duration_label,
        created_at
      FROM player_exclusions
      WHERE wallet_address = $1
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await this.pool.query(query, [normalized]);
        if (result.rows.length === 0) {
            return {
                isExcluded: false,
                exclusionType: null,
                expiresAt: null,
                durationLabel: null,
                createdAt: null
            };
        }
        const row = result.rows[0];
        return {
            isExcluded: true,
            exclusionType: row.exclusion_type,
            expiresAt: row.expires_at ? new Date(row.expires_at) : null,
            durationLabel: row.duration_label,
            createdAt: new Date(row.created_at)
        };
    }
    async setExclusion(walletAddress, exclusionType, durationLabel, expiresAt, reason) {
        const normalized = this.normalizeAddress(walletAddress);
        // Get or create player
        const player = await this.getOrCreatePlayer(walletAddress);
        // Deactivate any existing active exclusions first
        await this.pool.query(`UPDATE player_exclusions
       SET is_active = FALSE,
           deactivated_at = NOW(),
           deactivated_reason = 'Replaced by new exclusion'
       WHERE wallet_address = $1 AND is_active = TRUE`, [normalized]);
        // Insert new exclusion
        const query = `
      INSERT INTO player_exclusions (
        player_id, wallet_address, exclusion_type, expires_at, reason, duration_label
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
        await this.pool.query(query, [
            player.id,
            normalized,
            exclusionType,
            expiresAt,
            reason || null,
            durationLabel
        ]);
    }
    async getExclusionHistory(walletAddress) {
        const normalized = this.normalizeAddress(walletAddress);
        const query = `
      SELECT
        id, exclusion_type, duration_label, expires_at,
        created_at, is_active, deactivated_at, deactivated_reason
      FROM player_exclusions
      WHERE wallet_address = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;
        const result = await this.pool.query(query, [normalized]);
        return result.rows.map((row) => ({
            id: row.id,
            exclusionType: row.exclusion_type,
            durationLabel: row.duration_label,
            expiresAt: row.expires_at ? new Date(row.expires_at) : null,
            createdAt: new Date(row.created_at),
            isActive: row.is_active,
            deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at) : null,
            deactivatedReason: row.deactivated_reason
        }));
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.service.js.map