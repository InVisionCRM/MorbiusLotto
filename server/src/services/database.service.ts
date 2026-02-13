import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface Player {
  id: string;
  wallet_address: string;
  balance: bigint; // Off-chain balance
  created_at: Date;
  updated_at: Date;
  last_seen: Date;
}

export interface GameSession {
  id: string;
  player_id: string;
  server_seed?: string; // secret server seed (hex). commitment is server_seed_hash.
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
  rng_counter?: number;
  perfect_pairs_bet_amount?: bigint;
  perfect_pairs_payout?: bigint;
  rng_version?: number;
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

export interface TopPlayerEntry {
  rank: number;
  wallet_address: string;
  total_games: number;
  total_bet: bigint;
  total_win: bigint;
  profit_loss: bigint;
  win_rate: number;
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

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_address: string | null;
  text: string;
  created_at: Date;
}

export interface BlackjackTableRow {
  id: string;
  kind: 'image' | 'video';
  name: string;
  src: string;
  description: string | null;
  token_contract_address: string | null;
  logo_url: string | null;
  ticker: string | null;
  iframe_url: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export class DatabaseService {
  private pool: Pool;

  /**
   * Get the underlying connection pool (for use by other services)
   */
  getPool(): Pool {
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

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased from 2000ms to 10 seconds for Neon connections
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  private toBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (value === null || value === undefined) return 0n;
    // pg returns NUMERIC/INT8 as string by default
    return BigInt(String(value));
  }

  private normalizePlayer(row: any): Player {
    return {
      ...row,
      balance: this.toBigInt(row.balance),
    };
  }

  private normalizeSession(row: any): GameSession {
    return {
      ...row,
      nonce: Number(row.nonce ?? 0),
      total_bet: this.toBigInt(row.total_bet),
      total_win: this.toBigInt(row.total_win),
      game_count: Number(row.game_count ?? 0),
    };
  }

  private normalizeGame(row: any): Game {
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
      perfect_pairs_bet_amount: row.perfect_pairs_bet_amount != null ? this.toBigInt(row.perfect_pairs_bet_amount) : 0n,
      perfect_pairs_payout: row.perfect_pairs_payout != null ? this.toBigInt(row.perfect_pairs_payout) : 0n,
      rng_version: Number(row.rng_version ?? 1),
    };
  }

  private normalizeGameHand(row: any): GameHand {
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

  private normalizePlayerStats(row: any): PlayerStats {
    return {
      ...row,
      total_games: Number(row.total_games ?? 0),
      total_bet: this.toBigInt(row.total_bet),
      total_win: this.toBigInt(row.total_win),
      win_rate: Number(row.win_rate ?? 0),
      blackjack_count: Number(row.blackjack_count ?? 0),
    };
  }

  private normalizeEnhancedPlayerStats(row: any): EnhancedPlayerStats {
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

  private normalizeGlobalAnalytics(row: any): GlobalAnalytics {
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

  // Helper to normalize Ethereum addresses to lowercase
  private normalizeAddress(address: string): string {
    return address?.toLowerCase() || address;
  }

  // Player operations
  async getOrCreatePlayer(walletAddress: string): Promise<Player> {
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

  async updatePlayerLastSeen(playerId: string): Promise<void> {
    const query = `UPDATE players SET last_seen = NOW() WHERE id = $1`;
    await this.pool.query(query, [playerId]);
  }

  // Off-chain balance operations
  async getPlayerBalance(walletAddress: string): Promise<bigint> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.service.ts:331',message:'getPlayerBalance query',data:{walletAddress,normalizedAddress},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const query = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
    const result = await this.pool.query(query, [normalizedAddress]);
    if (result.rows.length === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.service.ts:334',message:'Player not found in DB',data:{walletAddress,normalizedAddress},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return 0n;
    }
    const balance = BigInt(result.rows[0].balance || '0');
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.service.ts:337',message:'getPlayerBalance result',data:{walletAddress,normalizedAddress,balance:balance.toString(),rawBalance:result.rows[0].balance},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return balance;
  }

  async updatePlayerBalance(walletAddress: string, amount: bigint, operation: 'add' | 'subtract' | 'set'): Promise<bigint> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    let query: string;
    if (operation === 'set') {
      query = `UPDATE players SET balance = $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
    } else if (operation === 'add') {
      query = `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
    } else {
      query = `UPDATE players SET balance = balance - $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1) RETURNING balance`;
    }
    
    const result = await this.pool.query(query, [normalizedAddress, amount.toString()]);
    if (result.rows.length === 0) {
      throw new Error(`Player not found: ${walletAddress}`);
    }
    return BigInt(result.rows[0].balance || '0');
  }

  async deductPlayerBalance(walletAddress: string, amount: bigint): Promise<bigint> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      UPDATE players SET balance = balance - $2::NUMERIC
      WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
      RETURNING balance
    `;
    const result = await this.pool.query(query, [normalizedAddress, amount.toString()]);
    if (result.rows.length === 0) {
      // Either player not found or insufficient balance
      const currentBalance = await this.getPlayerBalance(walletAddress);
      throw new Error(`Insufficient balance: have ${currentBalance.toString()}, need ${amount.toString()}`);
    }
    return BigInt(result.rows[0].balance || '0');
  }

  async addPlayerBalance(walletAddress: string, amount: bigint): Promise<bigint> {
    return await this.updatePlayerBalance(walletAddress, amount, 'add');
  }

  /** Credit an address (e.g. fee wallet). Upserts a player row if missing. */
  async addBalanceToAddress(walletAddress: string, amount: bigint): Promise<void> {
    if (amount <= 0n) return;
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `INSERT INTO players (wallet_address, balance) VALUES ($1, $2::NUMERIC)
       ON CONFLICT (wallet_address) DO UPDATE SET balance = players.balance + $2::NUMERIC, last_seen = NOW()`,
      [normalizedAddress, amount.toString()]
    );
  }

  // ============================================
  // Pending Withdrawal Methods
  // ============================================

  async getActivePendingWithdrawal(walletAddress: string): Promise<{ nonce: string; amount: string } | null> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      SELECT nonce, amount FROM pending_withdrawals
      WHERE wallet_address = $1 AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `;
    const result = await this.pool.query(query, [normalizedAddress]);
    if (result.rows.length === 0) return null;
    return { nonce: result.rows[0].nonce, amount: result.rows[0].amount };
  }

  async createPendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      INSERT INTO pending_withdrawals (nonce, wallet_address, amount, status)
      VALUES ($1::NUMERIC, $2, $3::NUMERIC, 'pending')
    `;
    await this.pool.query(query, [nonce.toString(), normalizedAddress, amount.toString()]);
  }

  async expirePendingWithdrawals(): Promise<number> {
    // Expire pending withdrawals older than 10 minutes and refund balances
    const query = `
      UPDATE pending_withdrawals
      SET status = 'expired'
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'
      RETURNING wallet_address, amount
    `;
    const result = await this.pool.query(query);
    // Refund each expired withdrawal
    for (const row of result.rows) {
      await this.addPlayerBalance(row.wallet_address, BigInt(row.amount));
    }
    return result.rows.length;
  }

  async syncPlayerBalanceWithContract(walletAddress: string, contractBalance: bigint): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.updatePlayerBalance(normalizedAddress, contractBalance, 'set');
  }

  async getPlayerStats(walletAddress: string): Promise<PlayerStats> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `SELECT * FROM get_player_stats($1)`;
    const result = await this.pool.query(query, [normalizedAddress]);
    return this.normalizePlayerStats(result.rows[0] || {});
  }

  async getPlayerStatsEnhanced(walletAddress: string): Promise<EnhancedPlayerStats> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `SELECT * FROM get_player_stats_enhanced($1)`;
    const result = await this.pool.query(query, [normalizedAddress]);
    return this.normalizeEnhancedPlayerStats(result.rows[0] || {});
  }

  async getGlobalAnalytics(): Promise<GlobalAnalytics> {
    const query = `SELECT * FROM get_global_analytics()`;
    const result = await this.pool.query(query);
    return this.normalizeGlobalAnalytics(result.rows[0] || {});
  }

  async getTopPlayers(limit: number = 10): Promise<TopPlayerEntry[]> {
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
    return result.rows.map((r: any) => this.normalizeTopPlayerEntry(r));
  }

  private normalizeTopPlayerEntry(row: any): TopPlayerEntry {
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

  async getTopPlayersByCategory(category: 'games' | 'profit_loss' | 'wagered' | 'win_rate' | 'total_won' | 'win_streak'): Promise<Array<{
    wallet_address: string;
    display_name?: string;
    profile_image_url?: string | null;
    value: string;
    label: string;
    created_at?: Date;
  }>> {
    let orderBy: string;
    let valueField: string;
    let label: string;

    switch (category) {
      case 'games':
        orderBy = 'total_games DESC';
        valueField = 'total_games::TEXT';
        label = 'Most Games';
        break;
      case 'profit_loss':
        orderBy = 'profit_loss DESC';
        valueField = 'profit_loss::TEXT';
        label = 'Top P/L';
        break;
      case 'wagered':
        orderBy = 'total_bet DESC';
        valueField = 'total_bet::TEXT';
        label = 'Top Wagered';
        break;
      case 'win_rate':
        orderBy = 'win_rate DESC';
        valueField = 'ROUND(win_rate, 2)::TEXT';
        label = 'Top Win %';
        break;
      case 'total_won':
        orderBy = 'total_win DESC';
        valueField = 'total_win::TEXT';
        label = 'Top Total Won';
        break;
      case 'win_streak':
        orderBy = 'best_streak DESC';
        valueField = 'best_streak::TEXT';
        label = 'Highest Win Streak';
        break;
      default:
        throw new Error(`Unknown category: ${category}`);
    }

    // For win_streak, we need to calculate it dynamically
    const streakCalculation = category === 'win_streak' ? `
      WITH player_games AS (
        SELECT 
          p.id as player_id,
          p.wallet_address,
          p.created_at,
          g.result,
          g.created_at as game_time,
          ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY g.created_at DESC) as rn
        FROM players p
        JOIN game_sessions gs ON gs.player_id = p.id
        JOIN games g ON g.session_id = gs.id
        WHERE g.result IS NOT NULL AND g.result != 'ongoing'
      ),
      streak_calc AS (
        SELECT 
          player_id,
          wallet_address,
          created_at,
          result,
          rn,
          CASE 
            WHEN result IN ('win', 'blackjack') THEN 1
            ELSE -1
          END as result_value,
          rn - ROW_NUMBER() OVER (PARTITION BY player_id, CASE WHEN result IN ('win', 'blackjack') THEN 1 ELSE -1 END ORDER BY rn) as streak_group
        FROM player_games
      ),
      streak_lengths AS (
        SELECT 
          player_id,
          result_value,
          streak_group,
          COUNT(*) as streak_length
        FROM streak_calc
        WHERE result_value = 1
        GROUP BY player_id, result_value, streak_group
      ),
      best_streaks AS (
        SELECT 
          player_id,
          COALESCE(MAX(streak_length), 0) as best_streak
        FROM streak_lengths
        GROUP BY player_id
      ),
      agg AS (
        SELECT
          p.wallet_address,
          p.created_at,
          COUNT(g.*)::BIGINT AS total_games,
          COALESCE(SUM(g.total_bet_amount), 0)::NUMERIC(78, 0) AS total_bet,
          COALESCE(SUM(g.total_payout), 0)::NUMERIC(78, 0) AS total_win,
          (COALESCE(SUM(g.total_payout), 0) - COALESCE(SUM(g.total_bet_amount), 0))::NUMERIC(78, 0) AS profit_loss,
          CASE WHEN COUNT(g.*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE g.result IN ('win', 'blackjack'))::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
          ELSE 0 END AS win_rate,
          COALESCE(bs.best_streak, 0) AS best_streak
        FROM players p
        LEFT JOIN game_sessions gs ON gs.player_id = p.id
        LEFT JOIN games g ON g.session_id = gs.id AND g.result IS NOT NULL AND g.result != 'ongoing'
        LEFT JOIN best_streaks bs ON bs.player_id = p.id
        GROUP BY p.id, p.wallet_address, p.created_at, bs.best_streak
        HAVING COUNT(g.*) > 0
      )
      SELECT 
        agg.wallet_address,
        agg.created_at,
        ${valueField} AS value,
        cdn.display_name,
        cdn.profile_image_url
      FROM agg
      LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(agg.wallet_address)
      ORDER BY ${orderBy}
      LIMIT 1
    ` : `
      WITH agg AS (
        SELECT
          p.wallet_address,
          p.created_at,
          COUNT(g.*)::BIGINT AS total_games,
          COALESCE(SUM(g.total_bet_amount), 0)::NUMERIC(78, 0) AS total_bet,
          COALESCE(SUM(g.total_payout), 0)::NUMERIC(78, 0) AS total_win,
          (COALESCE(SUM(g.total_payout), 0) - COALESCE(SUM(g.total_bet_amount), 0))::NUMERIC(78, 0) AS profit_loss,
          CASE WHEN COUNT(g.*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE g.result IN ('win', 'blackjack'))::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
          ELSE 0 END AS win_rate
        FROM players p
        LEFT JOIN game_sessions gs ON gs.player_id = p.id
        LEFT JOIN games g ON g.session_id = gs.id AND g.result IS NOT NULL AND g.result != 'ongoing'
        GROUP BY p.id, p.wallet_address, p.created_at
        HAVING COUNT(g.*) > 0
      )
      SELECT 
        agg.wallet_address,
        agg.created_at,
        ${valueField} AS value,
        cdn.display_name,
        cdn.profile_image_url
      FROM agg
      LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(agg.wallet_address)
      ORDER BY ${orderBy}
      LIMIT 1
    `;

    const result = await this.pool.query(streakCalculation);
    if (result.rows.length === 0) {
      return [];
    }

    const row = result.rows[0];
    return [{
      wallet_address: row.wallet_address ?? '',
      display_name: row.display_name ?? undefined,
      profile_image_url: row.profile_image_url ?? null,
      value: row.value ?? '0',
      label,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
    }];
  }

  async getPlayerGames(walletAddress: string, limit: number = 50, offset: number = 0): Promise<Game[]> {
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
    const games = result.rows.map((r: any) => this.normalizeGame(r));
    return games;
  }

  // Game session operations
  async createGameSession(playerId: string, serverSeed: string, serverSeedHash: string): Promise<GameSession> {
    const query = `
      INSERT INTO game_sessions (player_id, server_seed, server_seed_hash)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await this.pool.query(query, [playerId, serverSeed, serverSeedHash]);
    return this.normalizeSession(result.rows[0]);
  }

  async getActiveSession(playerId: string): Promise<GameSession | null> {
    const query = `
      SELECT * FROM game_sessions
      WHERE player_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [playerId]);
    return result.rows[0] ? this.normalizeSession(result.rows[0]) : null;
  }

  async getSessionById(sessionId: string): Promise<GameSession | null> {
    const query = `SELECT * FROM game_sessions WHERE id = $1`;
    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0] ? this.normalizeSession(result.rows[0]) : null;
  }

  async getPlayerAddressFromSession(sessionId: string): Promise<string> {
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

  async updateSessionStats(
    sessionId: string,
    betAmount: bigint,
    winAmount: bigint,
    incrementGameCount: boolean = true
  ): Promise<void> {
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

  async endSession(sessionId: string): Promise<void> {
    const query = `
      UPDATE game_sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [sessionId]);
  }

  async setSessionServerSeed(sessionId: string, serverSeed: string, serverSeedHash: string): Promise<void> {
    const query = `
      UPDATE game_sessions
      SET server_seed = $2,
          server_seed_hash = $3
      WHERE id = $1
    `;
    await this.pool.query(query, [sessionId, serverSeed, serverSeedHash]);
  }

  // Game operations
  async createGame(sessionId: string, gameData: Partial<Game>): Promise<Game> {
    // If the game isn't immediately settled, it must be persisted as 'ongoing'
    // so the first player_action isn't rejected as "Game already completed".
    const persistedResult = (gameData.result ?? 'ongoing') as any;

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
        rng_counter,
        perfect_pairs_bet_amount,
        perfect_pairs_payout,
        rng_version
      )
      VALUES ($1, $2, $3::NUMERIC, $4, $5, $6, $7::NUMERIC, $8, $9, $10, $11, $12, $13, $14, $15::NUMERIC, $16::NUMERIC, $17)
      RETURNING *
    `;

    const values = [
      sessionId,
      gameData.game_number || 1,
      (gameData.total_bet_amount || 0n).toString(),
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
      (gameData.perfect_pairs_bet_amount ?? 0n).toString(),
      (gameData.perfect_pairs_payout ?? 0n).toString(),
      Number(gameData.rng_version ?? 1),
    ];

    const result = await this.pool.query(query, values);
    return this.normalizeGame(result.rows[0]);
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

    if (fields.length === 0) return;

    const idParam = paramCount++;
    const query = `
      UPDATE game_hands
      SET ${fields.join(', ')}
      WHERE id = $${idParam}
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
    const hands = result.rows.map((r: any) => this.normalizeGameHand(r));
    return hands;
  }

  async updateGame(gameId: string, updates: Partial<Game>): Promise<void> {
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
    if (updates.rng_version !== undefined) {
      fields.push(`rng_version = $${paramCount++}`);
      values.push(Number(updates.rng_version));
    }
    if (updates.completed_at !== undefined) {
      fields.push(`completed_at = $${paramCount++}`);
      values.push(updates.completed_at);
    }

    if (fields.length === 0) return;

    const idParam = paramCount++;
    const query = `
      UPDATE games
      SET ${fields.join(', ')}
      WHERE id = $${idParam}
    `;

    values.push(gameId);
    await this.pool.query(query, values);
  }

  async getGame(gameId: string): Promise<Game | null> {
    const id = typeof gameId === 'string' ? gameId.trim() : gameId;
    if (!id) return null;
    const query = `SELECT * FROM games WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.normalizeGame(result.rows[0]) : null;
  }

  async getSessionGames(sessionId: string): Promise<Game[]> {
    const query = `
      SELECT * FROM games
      WHERE session_id = $1
      ORDER BY game_number ASC
    `;
    const result = await this.pool.query(query, [sessionId]);
    return result.rows.map((r: any) => this.normalizeGame(r));
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

  async getSeedReveal(gameId: string): Promise<{ server_seed_hash: string; server_seed: string } | null> {
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

  // Chat (main + per-game rooms)
  async insertChatMessage(roomId: string, senderAddress: string | null, text: string): Promise<ChatMessage> {
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

  async getRecentChatMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    const query = `
      SELECT id, room_id, sender_address, text, created_at
      FROM chat_messages
      WHERE room_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [roomId, limit]);
    return result.rows.map((row: any) => ({
      id: row.id,
      room_id: row.room_id,
      sender_address: row.sender_address,
      text: row.text,
      created_at: row.created_at
    })).reverse(); // chronological order for display
  }

  /** Messages older than the message with id beforeId, in chronological order (oldest first). */
  async getChatMessagesBefore(roomId: string, beforeId: string, limit: number = 50): Promise<ChatMessage[]> {
    const query = `
      SELECT id, room_id, sender_address, text, created_at
      FROM chat_messages
      WHERE room_id = $1
        AND created_at < (SELECT created_at FROM chat_messages WHERE id = $2 LIMIT 1)
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const result = await this.pool.query(query, [roomId, beforeId, limit]);
    return result.rows.map((row: any) => ({
      id: row.id,
      room_id: row.room_id,
      sender_address: row.sender_address,
      text: row.text,
      created_at: row.created_at
    })).reverse(); // chronological order for display
  }

  // Chat display names and profile (editable per wallet)
  async getDisplayName(walletAddress: string): Promise<string | null> {
    const normalized = this.normalizeAddress(walletAddress);
    const query = `SELECT display_name FROM chat_display_names WHERE wallet_address = $1`;
    const result = await this.pool.query(query, [normalized]);
    return result.rows[0]?.display_name ?? null;
  }

  async getProfile(walletAddress: string): Promise<{ displayName: string; profileImageUrl: string | null } | null> {
    const normalized = this.normalizeAddress(walletAddress);
    const query = `SELECT display_name, profile_image_url FROM chat_display_names WHERE wallet_address = $1`;
    const result = await this.pool.query(query, [normalized]);
    const row = result.rows[0];
    if (!row) return null;
    return { displayName: row.display_name, profileImageUrl: row.profile_image_url ?? null };
  }

  async setDisplayName(walletAddress: string, displayName: string, profileImageUrl?: string | null): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    if (profileImageUrl === undefined) {
      const query = `
        INSERT INTO chat_display_names (wallet_address, display_name)
        VALUES ($1, $2)
        ON CONFLICT (wallet_address)
        DO UPDATE SET display_name = $2, updated_at = NOW()
      `;
      await this.pool.query(query, [normalized, displayName]);
    } else {
      const query = `
        INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (wallet_address)
        DO UPDATE SET display_name = $2, updated_at = NOW(), profile_image_url = $3
      `;
      await this.pool.query(query, [normalized, displayName, profileImageUrl]);
    }
  }

  async getDisplayNames(walletAddresses: string[]): Promise<Map<string, string>> {
    if (walletAddresses.length === 0) return new Map();
    const normalized = [...new Set(walletAddresses.map(a => this.normalizeAddress(a)))];
    const query = `SELECT wallet_address, display_name FROM chat_display_names WHERE wallet_address = ANY($1)`;
    const result = await this.pool.query(query, [normalized]);
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.wallet_address, row.display_name);
    }
    return map;
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

  // ============================================
  // Self-Exclusion / Responsible Gaming Methods
  // ============================================

  async checkExclusionStatus(walletAddress: string): Promise<{
    isExcluded: boolean;
    exclusionType: 'timeout' | 'permanent' | null;
    expiresAt: Date | null;
    durationLabel: string | null;
    createdAt: Date | null;
  }> {
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

  async setExclusion(
    walletAddress: string,
    exclusionType: 'timeout' | 'permanent',
    durationLabel: string,
    expiresAt: Date | null,
    reason?: string
  ): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);

    // Get or create player
    const player = await this.getOrCreatePlayer(walletAddress);

    // Deactivate any existing active exclusions first
    await this.pool.query(
      `UPDATE player_exclusions
       SET is_active = FALSE,
           deactivated_at = NOW(),
           deactivated_reason = 'Replaced by new exclusion'
       WHERE wallet_address = $1 AND is_active = TRUE`,
      [normalized]
    );

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

  async getExclusionHistory(walletAddress: string): Promise<Array<{
    id: string;
    exclusionType: 'timeout' | 'permanent';
    durationLabel: string;
    expiresAt: Date | null;
    createdAt: Date;
    isActive: boolean;
    deactivatedAt: Date | null;
    deactivatedReason: string | null;
  }>> {
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

    return result.rows.map((row: any) => ({
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

  // --- Blackjack tables (admin-managed) ---

  /** Admin metrics aggregates for a time range (Blackjack only). Returns zeros if tables are missing. */
  async getMetricsAggregates(range: '24h' | '7d' | '30d' | 'all'): Promise<{
    volume: bigint;
    games: number;
    activePlayers: number;
    pnl: bigint;
    tournamentEntries: number;
  }> {
    const zero = () => ({ volume: 0n, games: 0, activePlayers: 0, pnl: 0n, tournamentEntries: 0 });
    const interval = range === '24h' ? "INTERVAL '24 hours'" : range === '7d' ? "INTERVAL '7 days'" : range === '30d' ? "INTERVAL '30 days'" : null;
    const gamesFilter = interval ? `AND COALESCE(g.completed_at, g.created_at) >= NOW() - ${interval}` : '';

    const volQuery = `
      SELECT
        (COALESCE(SUM(g.total_bet_amount), 0))::BIGINT AS volume,
        COUNT(*)::INT AS games,
        ((COALESCE(SUM(g.total_payout), 0) - COALESCE(SUM(g.total_bet_amount), 0)))::BIGINT AS pnl
      FROM games g
      WHERE g.result IS NOT NULL AND g.result != 'ongoing' ${gamesFilter}
    `;
    const activeQuery = interval
      ? `SELECT COUNT(DISTINCT gs.player_id)::INT AS cnt FROM game_sessions gs JOIN games g ON g.session_id = gs.id WHERE g.result IS NOT NULL AND g.result != 'ongoing' AND COALESCE(g.completed_at, g.created_at) >= NOW() - ${interval}`
      : `SELECT COUNT(DISTINCT gs.player_id)::INT AS cnt FROM game_sessions gs JOIN games g ON g.session_id = gs.id WHERE g.result IS NOT NULL AND g.result != 'ongoing'`;
    const entriesQuery = interval
      ? `SELECT COUNT(*)::INT AS cnt FROM tournament_entries te WHERE te.created_at >= NOW() - ${interval}`
      : `SELECT COUNT(*)::INT AS cnt FROM tournament_entries te`;

    try {
      const [volRes, activeRes, entriesRes] = await Promise.all([
        this.pool.query(volQuery),
        this.pool.query(activeQuery),
        this.pool.query(entriesQuery),
      ]);

      const volume = this.toBigInt(volRes.rows[0]?.volume ?? 0);
      const games = Number(volRes.rows[0]?.games ?? 0);
      const pnl = this.toBigInt(volRes.rows[0]?.pnl ?? 0);
      const activePlayers = Number(activeRes.rows[0]?.cnt ?? 0);
      const tournamentEntries = Number(entriesRes.rows[0]?.cnt ?? 0);

      return { volume, games, activePlayers, pnl, tournamentEntries };
    } catch (err: any) {
      const missing = err?.code === '42P01' || err?.code === '42703' || (typeof err?.message === 'string' && /relation .* does not exist|column .* does not exist/i.test(err.message));
      if (missing) return zero();
      throw err;
    }
  }

  /** Tournament metrics aggregates for a time range. Returns zeros if tables are missing. */
  async getTournamentMetrics(range: '24h' | '7d' | '30d' | 'all'): Promise<{
    totalTournaments: number;
    activeTournaments: number;
    completedTournaments: number;
    totalEntries: number;
    totalPrizePool: bigint;
    totalBuyIns: bigint;
  }> {
    const zero = () => ({ totalTournaments: 0, activeTournaments: 0, completedTournaments: 0, totalEntries: 0, totalPrizePool: 0n, totalBuyIns: 0n });
    const interval = range === '24h' ? "INTERVAL '24 hours'" : range === '7d' ? "INTERVAL '7 days'" : range === '30d' ? "INTERVAL '30 days'" : null;
    const timeFilter = interval ? `WHERE t.created_at >= NOW() - ${interval}` : '';

    const tournamentsQuery = `
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE t.status = 'active')::INT AS active,
        COUNT(*) FILTER (WHERE t.status = 'completed')::INT AS completed,
        (COALESCE(SUM(t.prize_pool), 0))::BIGINT AS total_prize_pool
      FROM tournaments t
      ${timeFilter}
    `;
    const buyInsQuery = interval
      ? `
        SELECT (COALESCE(SUM(t.buy_in_amount), 0))::BIGINT AS total_buy_ins
        FROM tournaments t
        JOIN tournament_entries te ON te.tournament_id = t.id
        WHERE t.created_at >= NOW() - ${interval}
      `
      : `
        SELECT (COALESCE(SUM(t.buy_in_amount), 0))::BIGINT AS total_buy_ins
        FROM tournaments t
        JOIN tournament_entries te ON te.tournament_id = t.id
      `;
    const entriesQuery = interval
      ? `SELECT COUNT(*)::INT AS cnt FROM tournament_entries te WHERE te.created_at >= NOW() - ${interval}`
      : `SELECT COUNT(*)::INT AS cnt FROM tournament_entries te`;

    try {
      const [tournamentsRes, buyInsRes, entriesRes] = await Promise.all([
        this.pool.query(tournamentsQuery),
        this.pool.query(buyInsQuery),
        this.pool.query(entriesQuery),
      ]);

      const totalTournaments = Number(tournamentsRes.rows[0]?.total ?? 0);
      const activeTournaments = Number(tournamentsRes.rows[0]?.active ?? 0);
      const completedTournaments = Number(tournamentsRes.rows[0]?.completed ?? 0);
      const totalPrizePool = this.toBigInt(tournamentsRes.rows[0]?.total_prize_pool ?? 0);
      const totalBuyIns = this.toBigInt(buyInsRes.rows[0]?.total_buy_ins ?? 0);
      const totalEntries = Number(entriesRes.rows[0]?.cnt ?? 0);

      return { totalTournaments, activeTournaments, completedTournaments, totalEntries, totalPrizePool, totalBuyIns };
    } catch (err: any) {
      const missing = err?.code === '42P01' || err?.code === '42703' || (typeof err?.message === 'string' && /relation .* does not exist|column .* does not exist/i.test(err.message));
      if (missing) return zero();
      throw err;
    }
  }

  /** Admin metrics time-series (hourly or daily buckets) for charts. Returns [] if games table missing. */
  async getMetricsSeries(range: '24h' | '7d' | '30d' | 'all'): Promise<Array<{ period: string; volume: string; games: number }>> {
    const bucket = range === '24h' ? 'hour' : 'day';
    const interval = range === '24h' ? "INTERVAL '24 hours'" : range === '7d' ? "INTERVAL '7 days'" : range === '30d' ? "INTERVAL '30 days'" : "INTERVAL '90 days'";
    const query = `
      SELECT
        date_trunc('${bucket}', COALESCE(g.completed_at, g.created_at))::TEXT AS period,
        (COALESCE(SUM(g.total_bet_amount), 0))::BIGINT AS volume,
        COUNT(*)::INT AS games
      FROM games g
      WHERE g.result IS NOT NULL AND g.result != 'ongoing'
        AND COALESCE(g.completed_at, g.created_at) >= NOW() - ${interval}
      GROUP BY 1
      ORDER BY 1
    `;
    try {
      const result = await this.pool.query(query);
      return result.rows.map((r: any) => ({
        period: r.period,
        volume: String(r.volume ?? 0),
        games: Number(r.games ?? 0),
      }));
    } catch (err: any) {
      const missing = err?.code === '42P01' || err?.code === '42703' || (typeof err?.message === 'string' && /relation .* does not exist|column .* does not exist/i.test(err.message));
      if (missing) return [];
      throw err;
    }
  }

  /** Recent Blackjack wins (for public latest-wins feed). Only win/blackjack results. */
  async getRecentGlobalWins(limit: number = 20): Promise<Array<{ gameId: string; playerAddress: string; result: string; betAmount: string; payout: string; timestamp: number }>> {
    const query = `
      SELECT
        g.id AS game_id,
        g.total_bet_amount,
        g.total_payout,
        g.result,
        g.completed_at,
        p.wallet_address AS player_address
      FROM games g
      JOIN game_sessions gs ON g.session_id = gs.id
      JOIN players p ON gs.player_id = p.id
      WHERE g.result IN ('win', 'blackjack')
        AND g.completed_at IS NOT NULL
      ORDER BY g.completed_at DESC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map((r: any) => ({
      gameId: r.game_id,
      playerAddress: r.player_address ?? '',
      result: r.result === 'blackjack' ? 'blackjack' : 'win',
      betAmount: String(r.total_bet_amount ?? '0'),
      payout: String(r.total_payout ?? '0'),
      timestamp: r.completed_at ? new Date(r.completed_at).getTime() : Date.now(),
    }));
  }

  /** Admin game config: get all key-value pairs. */
  async getAdminGameConfig(): Promise<Record<string, string>> {
    const result = await this.pool.query(`SELECT key, value FROM admin_game_config`);
    const out: Record<string, string> = {};
    for (const row of result.rows) out[row.key] = row.value ?? '';
    return out;
  }

  /** Admin game config: set one key. */
  async setAdminGameConfigKey(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_game_config (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
  }

  /** Up to N player wallet addresses (by recent activity) for admin reserve sampling. */
  async getPlayerAddressesForReserveCheck(limit: number = 100): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT wallet_address FROM players ORDER BY last_seen DESC NULLS LAST LIMIT $1`,
      [limit]
    );
    return result.rows.map((r: any) => r.wallet_address);
  }

  async getBlackjackTables(enabledOnly: boolean = false): Promise<BlackjackTableRow[]> {
    const colsExtended = 'id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled, created_at, updated_at';
    const colsBase = 'id, kind, name, src, description, token_contract_address, sort_order, enabled, created_at, updated_at';
    const whereOrder = enabledOnly
      ? ' WHERE enabled = true ORDER BY sort_order ASC, created_at ASC'
      : ' ORDER BY sort_order ASC, created_at ASC';

    const mapRow = (r: any, withExtended: boolean): BlackjackTableRow => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      src: r.src,
      description: r.description ?? null,
      token_contract_address: r.token_contract_address ?? null,
      logo_url: withExtended ? (r.logo_url ?? null) : null,
      ticker: withExtended ? (r.ticker ?? null) : null,
      iframe_url: withExtended ? (r.iframe_url ?? null) : null,
      sort_order: r.sort_order,
      enabled: r.enabled,
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at),
    });

    try {
      const result = await this.pool.query(
        `SELECT ${colsExtended} FROM blackjack_tables${whereOrder}`
      );
      return result.rows.map((r: any) => mapRow(r, true));
    } catch (err: any) {
      const isMissingColumn = err?.code === '42703' || (typeof err?.message === 'string' && err.message.includes('column') && err.message.includes('does not exist'));
      if (isMissingColumn) {
        const result = await this.pool.query(
          `SELECT ${colsBase} FROM blackjack_tables${whereOrder}`
        );
        return result.rows.map((r: any) => mapRow(r, false));
      }
      throw err;
    }
  }

  async createBlackjackTable(row: Omit<BlackjackTableRow, 'id' | 'created_at' | 'updated_at'>): Promise<BlackjackTableRow> {
    const withExtended = async () => {
      const r = await this.pool.query(
        `INSERT INTO blackjack_tables (kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled, created_at, updated_at`,
        [row.kind, row.name, row.src, row.description ?? null, row.token_contract_address ?? null, row.logo_url ?? null, row.ticker ?? null, row.iframe_url ?? null, row.sort_order, row.enabled]
      );
      const x = r.rows[0];
      return { x, extended: true };
    };
    const withBase = async () => {
      const r = await this.pool.query(
        `INSERT INTO blackjack_tables (kind, name, src, description, token_contract_address, sort_order, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, kind, name, src, description, token_contract_address, sort_order, enabled, created_at, updated_at`,
        [row.kind, row.name, row.src, row.description ?? null, row.token_contract_address ?? null, row.sort_order, row.enabled]
      );
      const x = r.rows[0];
      return { x, extended: false };
    };
    try {
      const { x, extended } = await withExtended();
      return {
        id: x.id,
        kind: x.kind,
        name: x.name,
        src: x.src,
        description: x.description ?? null,
        token_contract_address: x.token_contract_address ?? null,
        logo_url: extended ? (x.logo_url ?? null) : null,
        ticker: extended ? (x.ticker ?? null) : null,
        iframe_url: extended ? (x.iframe_url ?? null) : null,
        sort_order: x.sort_order,
        enabled: x.enabled,
        created_at: new Date(x.created_at),
        updated_at: new Date(x.updated_at),
      };
    } catch (err: any) {
      const isMissingColumn = err?.code === '42703' || (typeof err?.message === 'string' && err.message.includes('column') && err.message.includes('does not exist'));
      if (!isMissingColumn) throw err;
      const { x, extended } = await withBase();
      return {
        id: x.id,
        kind: x.kind,
        name: x.name,
        src: x.src,
        description: x.description ?? null,
        token_contract_address: x.token_contract_address ?? null,
        logo_url: extended ? (x.logo_url ?? null) : null,
        ticker: extended ? (x.ticker ?? null) : null,
        iframe_url: extended ? (x.iframe_url ?? null) : null,
        sort_order: x.sort_order,
        enabled: x.enabled,
        created_at: new Date(x.created_at),
        updated_at: new Date(x.updated_at),
      };
    }
  }

  async updateBlackjackTable(
    id: string,
    updates: Partial<Pick<BlackjackTableRow, 'name' | 'src' | 'description' | 'token_contract_address' | 'logo_url' | 'ticker' | 'iframe_url' | 'sort_order' | 'enabled'>>
  ): Promise<BlackjackTableRow | null> {
    const buildUpdate = (includeExtended: boolean) => {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (updates.name !== undefined) { fields.push(`name = $${i++}`); values.push(updates.name); }
      if (updates.src !== undefined) { fields.push(`src = $${i++}`); values.push(updates.src); }
      if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description); }
      if (updates.token_contract_address !== undefined) { fields.push(`token_contract_address = $${i++}`); values.push(updates.token_contract_address); }
      if (includeExtended && updates.logo_url !== undefined) { fields.push(`logo_url = $${i++}`); values.push(updates.logo_url); }
      if (includeExtended && updates.ticker !== undefined) { fields.push(`ticker = $${i++}`); values.push(updates.ticker); }
      if (includeExtended && updates.iframe_url !== undefined) { fields.push(`iframe_url = $${i++}`); values.push(updates.iframe_url); }
      if (updates.sort_order !== undefined) { fields.push(`sort_order = $${i++}`); values.push(updates.sort_order); }
      if (updates.enabled !== undefined) { fields.push(`enabled = $${i++}`); values.push(updates.enabled); }
      return { fields, values, i };
    };

    const { fields: f, values: v, i } = buildUpdate(true);
    if (f.length === 0) {
      const existing = await this.getBlackjackTables().then((rows) => rows.find((r) => r.id === id));
      return existing ?? null;
    }
    const fields = [...f, 'updated_at = NOW()'];
    const values = [...v, id];
    const colsExtended = 'id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled, created_at, updated_at';
    const colsBase = 'id, kind, name, src, description, token_contract_address, sort_order, enabled, created_at, updated_at';

    const mapReturn = (x: any, extended: boolean): BlackjackTableRow => ({
      id: x.id,
      kind: x.kind,
      name: x.name,
      src: x.src,
      description: x.description ?? null,
      token_contract_address: x.token_contract_address ?? null,
      logo_url: extended ? (x.logo_url ?? null) : null,
      ticker: extended ? (x.ticker ?? null) : null,
      iframe_url: extended ? (x.iframe_url ?? null) : null,
      sort_order: x.sort_order,
      enabled: x.enabled,
      created_at: new Date(x.created_at),
      updated_at: new Date(x.updated_at),
    });

    try {
      const r = await this.pool.query(
        `UPDATE blackjack_tables SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${colsExtended}`,
        values
      );
      if (r.rows.length === 0) return null;
      return mapReturn(r.rows[0], true);
    } catch (err: any) {
      const isMissingColumn = err?.code === '42703' || (typeof err?.message === 'string' && err.message.includes('column') && err.message.includes('does not exist'));
      if (!isMissingColumn) throw err;
      const { fields: fBase, values: vBase, i: iBase } = buildUpdate(false);
      if (fBase.length === 0) return this.getBlackjackTables().then((rows) => rows.find((r) => r.id === id) ?? null);
      const fieldsBase = [...fBase, 'updated_at = NOW()'];
      const valuesBase = [...vBase, id];
      const r = await this.pool.query(
        `UPDATE blackjack_tables SET ${fieldsBase.join(', ')} WHERE id = $${valuesBase.length} RETURNING ${colsBase}`,
        valuesBase
      );
      if (r.rows.length === 0) return null;
      return mapReturn(r.rows[0], false);
    }
  }

  async deleteBlackjackTable(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM blackjack_tables WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }
}