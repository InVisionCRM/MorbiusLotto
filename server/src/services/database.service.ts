import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface Player {
  id: string;
  wallet_address: string;
  created_at: Date;
  updated_at: Date;
  last_seen: Date;
}

export interface GameSession {
  id: string;
  player_id: string;
  server_seed_hash: string;
  client_seed?: string;
  nonce: number;
  created_at: Date;
  ended_at?: Date;
  status: 'active' | 'completed' | 'abandoned';
  total_bet: bigint;
  total_win: bigint;
  game_count: number;
}

export interface GameHand {
  id: string;
  game_id: string;
  hand_index: number;
  cards: any[];
  total?: number;
  has_ace: boolean;
  is_blackjack: boolean;
  is_bust: boolean;
  bet_amount: bigint;
  result?: 'win' | 'loss' | 'push' | 'blackjack' | 'ongoing';
  payout: bigint;
  actions: any[];
  created_at: Date;
  completed_at?: Date;
}

export interface Game {
  id: string;
  session_id: string;
  game_number: number;
  total_bet_amount: bigint;
  dealer_cards: any[];
  dealer_total?: number;
  dealer_actions: any[];
  result?: 'win' | 'loss' | 'push' | 'blackjack' | 'ongoing';
  total_payout: bigint;
  actions: any[];
  created_at: Date;
  completed_at?: Date;
  server_seed_revealed: boolean;
  client_seed_commitment?: string;
  dealer_seed?: string;
  hand_count: number;
  current_hand_index: number;
}

export interface PlayerStats {
  total_games: number;
  total_bet: bigint;
  total_win: bigint;
  win_rate: number;
  blackjack_count: number;
}

export interface EnhancedPlayerStats extends PlayerStats {
  current_streak: number;
  best_streak: number;
  biggest_win: bigint;
  biggest_loss: bigint;
  average_bet: number;
  average_payout: number;
  profit_loss: bigint;
  roi: number;
  games_today: number;
  games_this_week: number;
  favorite_bet_amount: bigint;
  last_game_timestamp?: Date;
  rank: number;
}

export interface GlobalAnalytics {
  total_players: number;
  active_players: number;
  total_games_played: number;
  total_volume: bigint;
  total_payouts: bigint;
  house_profit: bigint;
  games_last_hour: number;
  games_last_24_hours: number;
  volume_last_24_hours: bigint;
  profit_last_24_hours: bigint;
  average_win_rate: number;
  average_bet_size: number;
  house_edge: number;
  active_connections: number;
  blackjack_rate: number;
  split_rate: number;
  double_down_rate: number;
  surrender_rate: number;
  pending_settlements: number;
  failed_settlements: number;
  largest_bet: bigint;
  largest_payout: bigint;
}

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      logger.info('Database connected successfully');
      client.release();
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Database disconnected');
  }

  // Player operations
  async getOrCreatePlayer(walletAddress: string): Promise<Player> {
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

  async updatePlayerLastSeen(playerId: string): Promise<void> {
    const query = `UPDATE players SET last_seen = NOW() WHERE id = $1`;
    await this.pool.query(query, [playerId]);
  }

  async getPlayerStats(walletAddress: string): Promise<PlayerStats> {
    const query = `SELECT * FROM get_player_stats($1)`;
    const result = await this.pool.query(query, [walletAddress]);
    return result.rows[0];
  }

  async getPlayerStatsEnhanced(walletAddress: string): Promise<EnhancedPlayerStats> {
    const query = `SELECT * FROM get_player_stats_enhanced($1)`;
    const result = await this.pool.query(query, [walletAddress]);
    return result.rows[0];
  }

  async getGlobalAnalytics(): Promise<GlobalAnalytics> {
    const query = `SELECT * FROM get_global_analytics()`;
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  async getPlayerGames(walletAddress: string, limit: number = 50, offset: number = 0): Promise<Game[]> {
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

  async getSettlements(status?: string, limit: number = 100): Promise<any[]> {
    let query = `SELECT * FROM settlements`;
    const params: any[] = [];
    
    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
      query += ` ORDER BY settled_at DESC LIMIT $2`;
      params.push(limit);
    } else {
      query += ` ORDER BY settled_at DESC LIMIT $1`;
      params.push(limit);
    }
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Game session operations
  async createGameSession(playerId: string, serverSeedHash: string): Promise<GameSession> {
    const query = `
      INSERT INTO game_sessions (player_id, server_seed_hash)
      VALUES ($1, $2)
      RETURNING *
    `;

    const result = await this.pool.query(query, [playerId, serverSeedHash]);
    return result.rows[0];
  }

  async getActiveSession(playerId: string): Promise<GameSession | null> {
    const query = `
      SELECT * FROM game_sessions
      WHERE player_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [playerId]);
    return result.rows[0] || null;
  }

  async updateSessionStats(sessionId: string, betAmount: bigint, winAmount: bigint): Promise<void> {
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

  async endSession(sessionId: string): Promise<void> {
    const query = `
      UPDATE game_sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [sessionId]);
  }

  // Game operations
  async createGame(sessionId: string, gameData: Partial<Game>): Promise<Game> {
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
  async createGameHand(gameId: string, handData: Partial<GameHand>): Promise<GameHand> {
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

  async updateGameHand(handId: string, updates: Partial<GameHand>): Promise<void> {
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

    if (fields.length === 0) return;

    const query = `
      UPDATE game_hands
      SET ${fields.join(', ')}
      WHERE id = $1
    `;

    values.push(handId);
    await this.pool.query(query, values);
  }

  async getGameHands(gameId: string): Promise<GameHand[]> {
    const query = `
      SELECT * FROM game_hands
      WHERE game_id = $1
      ORDER BY hand_index ASC
    `;
    const result = await this.pool.query(query, [gameId]);
    return result.rows;
  }

  async updateGame(gameId: string, updates: Partial<Game>): Promise<void> {
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

    if (fields.length === 0) return;

    const query = `
      UPDATE games
      SET ${fields.join(', ')}
      WHERE id = $1
    `;

    values.push(gameId);
    await this.pool.query(query, values);
  }

  async getGame(gameId: string): Promise<Game | null> {
    const query = `SELECT * FROM games WHERE id = $1`;
    const result = await this.pool.query(query, [gameId]);
    return result.rows[0] || null;
  }

  async getSessionGames(sessionId: string): Promise<Game[]> {
    const query = `
      SELECT * FROM games
      WHERE session_id = $1
      ORDER BY game_number ASC
    `;
    const result = await this.pool.query(query, [sessionId]);
    return result.rows;
  }

  // Seed reveal operations
  async revealServerSeed(gameId: string, serverSeedHash: string, serverSeed: string): Promise<void> {
    const query = `
      INSERT INTO seed_reveals (game_id, server_seed_hash, server_seed)
      VALUES ($1, $2, $3)
    `;

    await this.pool.query(query, [gameId, serverSeedHash, serverSeed]);

    // Mark the game as having revealed seed
    await this.pool.query(
      'UPDATE games SET server_seed_revealed = true WHERE id = $1',
      [gameId]
    );
  }

  // Settlement operations
  async createSettlement(gameId: string, playerAddress: string, amount: bigint): Promise<string> {
    const query = `
      INSERT INTO settlements (game_id, player_address, amount)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    const result = await this.pool.query(query, [gameId, playerAddress, amount]);
    return result.rows[0].id;
  }

  async updateSettlementStatus(settlementId: string, transactionHash: string, status: 'confirmed' | 'failed'): Promise<void> {
    const query = `
      UPDATE settlements
      SET transaction_hash = $2, status = $3, settled_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [settlementId, transactionHash, status]);
  }

  // Connection management
  async addActiveConnection(playerId: string, connectionId: string): Promise<void> {
    const query = `
      INSERT INTO active_connections (player_id, connection_id)
      VALUES ($1, $2)
      ON CONFLICT (connection_id)
      DO UPDATE SET last_ping = NOW()
    `;

    await this.pool.query(query, [playerId, connectionId]);
  }

  async removeActiveConnection(connectionId: string): Promise<void> {
    const query = `DELETE FROM active_connections WHERE connection_id = $1`;
    await this.pool.query(query, [connectionId]);
  }

  async updateConnectionPing(connectionId: string): Promise<void> {
    const query = `UPDATE active_connections SET last_ping = NOW() WHERE connection_id = $1`;
    await this.pool.query(query, [connectionId]);
  }

  async cleanupOldConnections(): Promise<number> {
    const query = `SELECT cleanup_old_connections()`;
    const result = await this.pool.query(query);
    return result.rows[0].cleanup_old_connections;
  }

  // Utility methods
  async withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}