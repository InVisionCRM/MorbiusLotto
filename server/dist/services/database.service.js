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
        return this.normalizePlayer(result.rows[0]);
    }
    async updatePlayerLastSeen(playerId) {
        const query = `UPDATE players SET last_seen = NOW() WHERE id = $1`;
        await this.pool.query(query, [playerId]);
    }
    // Off-chain balance operations
    async getPlayerBalance(walletAddress) {
        const query = `SELECT balance FROM players WHERE wallet_address = $1`;
        const result = await this.pool.query(query, [walletAddress]);
        if (result.rows.length === 0) {
            return 0n;
        }
        return BigInt(result.rows[0].balance || '0');
    }
    async updatePlayerBalance(walletAddress, amount, operation) {
        let query;
        if (operation === 'set') {
            query = `UPDATE players SET balance = $2::NUMERIC WHERE wallet_address = $1 RETURNING balance`;
        }
        else if (operation === 'add') {
            query = `UPDATE players SET balance = balance + $2::NUMERIC WHERE wallet_address = $1 RETURNING balance`;
        }
        else {
            query = `UPDATE players SET balance = balance - $2::NUMERIC WHERE wallet_address = $1 RETURNING balance`;
        }
        const result = await this.pool.query(query, [walletAddress, amount.toString()]);
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
        await this.updatePlayerBalance(walletAddress, contractBalance, 'set');
    }
    async getPlayerStats(walletAddress) {
        const query = `SELECT * FROM get_player_stats($1)`;
        const result = await this.pool.query(query, [walletAddress]);
        return this.normalizePlayerStats(result.rows[0] || {});
    }
    async getPlayerStatsEnhanced(walletAddress) {
        const query = `SELECT * FROM get_player_stats_enhanced($1)`;
        const result = await this.pool.query(query, [walletAddress]);
        return this.normalizeEnhancedPlayerStats(result.rows[0] || {});
    }
    async getGlobalAnalytics() {
        const query = `SELECT * FROM get_global_analytics()`;
        const result = await this.pool.query(query);
        return this.normalizeGlobalAnalytics(result.rows[0] || {});
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
        return result.rows.map((r) => this.normalizeGame(r));
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/database.service.ts:updateGameHand:entry', message: 'updateGameHand called', data: { handId, updateKeys: Object.keys(updates || {}), hasCards: updates?.cards !== undefined }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/database.service.ts:updateGameHand:beforeQuery', message: 'updateGameHand SQL about to run', data: { query, valuesCount: values.length, valueTypes: values.map(v => typeof v), firstValuePreview: String(values[0]).slice(0, 48), lastValuePreview: String(values[values.length - 1]).slice(0, 48) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion
        await this.pool.query(query, values);
    }
    async getGameHands(gameId) {
        const query = `
      SELECT * FROM game_hands
      WHERE game_id = $1
      ORDER BY hand_index ASC
    `;
        const result = await this.pool.query(query, [gameId]);
        return result.rows.map((r) => this.normalizeGameHand(r));
    }
    async updateGame(gameId, updates) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/database.service.ts:updateGame:entry', message: 'updateGame called', data: { gameId, updateKeys: Object.keys(updates || {}), hasDealerCards: updates?.dealer_cards !== undefined }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
        // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/database.service.ts:updateGame:beforeQuery', message: 'updateGame SQL about to run', data: { query, valuesCount: values.length, valueTypes: values.map(v => typeof v), firstValuePreview: String(values[0]).slice(0, 48), lastValuePreview: String(values[values.length - 1]).slice(0, 48) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
        // #endregion
        await this.pool.query(query, values);
    }
    async getGame(gameId) {
        const query = `SELECT * FROM games WHERE id = $1`;
        const result = await this.pool.query(query, [gameId]);
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