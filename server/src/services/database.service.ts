import { Pool } from 'pg';
import { formatEther } from 'viem';
import type { MoneyDatabasePort } from './money-database.port';
import { logger } from '../utils/logger';
import { toBigIntSafe } from '../utils/safe-bigint';

function formatWei(wei: bigint | string | number): string {
  try {
    const n = Number(formatEther(toBigIntSafe(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return String(wei);
  }
}

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

/** Instant lottery leaderboard entry (same shape as TopPlayerEntry for API consistency). */
export type LotteryTopPlayerEntry = TopPlayerEntry;

/** Instant lottery per-player stats (from indexed plays). */
export interface LotteryPlayerStats {
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
  total_wins: number;
  total_losses: number;
  total_pushes: number;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_address: string | null;
  text: string;
  created_at: Date;
  deleted_at?: Date | null;
  deleted_by?: string | null;
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
  website_url: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Single-player blackjack wager tier (admin + public list). */
export interface BlackjackSpWagerTierRow {
  id: string;
  label: string;
  min_bet: string;
  max_bet: string;
  theme_kind: 'image' | 'video' | null;
  theme_id: string | null;
  sort_order: number;
  enabled: boolean;
  slug: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MoneyDatabaseQueries extends MoneyDatabasePort {}

export class DatabaseService implements MoneyDatabaseQueries {
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
    return toBigIntSafe(value);
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
      total_wins: Number(row.total_wins ?? 0),
      total_losses: Number(row.total_losses ?? 0),
      total_pushes: Number(row.total_pushes ?? 0),
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

  // Off-chain balance operations.
  // NOTE: Money workflow callers should be routed through MoneyService's MoneyDatabasePort boundary.
  async getPlayerBalance(walletAddress: string): Promise<bigint> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`;
    const result = await this.pool.query(query, [normalizedAddress]);
    if (result.rows.length === 0) {
      return 0n;
    }
    const balance = BigInt(result.rows[0].balance || '0');
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
      throw new Error(`Insufficient balance: have ${formatWei(currentBalance)}, need ${formatWei(amount)}`);
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
      WHERE LOWER(wallet_address) = LOWER($1) AND status = 'pending'
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
    await this.addToBlackjackWithdrawnTotal(amount);
  }

  /**
   * Atomically deduct the player's balance AND create the pending withdrawal record in a single
   * transaction. If either step fails, both are rolled back — preventing permanent balance loss
   * from a partial failure between the two operations.
   * expiresAt: on-chain signature deadline; cron only refunds when NOW() > expiresAt.
   *
   * Returns the remaining balance after deduction.
   * Throws if the player has insufficient balance (same as deductPlayerBalance).
   */
  async deductAndCreatePendingWithdrawal(
    walletAddress: string,
    nonce: bigint,
    amount: bigint,
    expiresAt: Date,
  ): Promise<bigint> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    return this.withTransaction(async (client) => {
      // Deduct balance (fails if insufficient)
      const deductResult = await client.query(
        `UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING balance`,
        [normalizedAddress, amount.toString()],
      );
      if (deductResult.rows.length === 0) {
        const current = await client.query(
          `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`,
          [normalizedAddress],
        );
        const have = current.rows[0]?.balance ?? '0';
        throw new Error(`Insufficient balance: have ${formatWei(have)}, need ${formatWei(amount)}`);
      }
      const remainingBalance = BigInt(deductResult.rows[0].balance || '0');

      // Create pending withdrawal record (expires_at = on-chain signature deadline)
      await client.query(
        `INSERT INTO pending_withdrawals (nonce, wallet_address, amount, status, expires_at)
         VALUES ($1::NUMERIC, $2, $3::NUMERIC, 'pending', $4::timestamptz)`,
        [nonce.toString(), normalizedAddress, amount.toString(), expiresAt],
      );

      // Update platform analytics total
      await client.query(
        `UPDATE blackjack_platform_totals
         SET total_withdrawn = total_withdrawn + $1::NUMERIC, updated_at = NOW()
         WHERE id = 1`,
        [amount.toString()],
      );

      return remainingBalance;
    });
  }

  /**
   * Mark a pending withdrawal as completed after the user has successfully completed the on-chain tx.
   * Prevents the expiry cron from refunding the amount (double-credit). Idempotent: safe to call if already completed.
   */
  async markPendingWithdrawalCompleted(walletAddress: string, nonce: bigint, txHash?: string): Promise<boolean> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      UPDATE pending_withdrawals
      SET status = 'completed', tx_hash = COALESCE($3, tx_hash)
      WHERE LOWER(wallet_address) = LOWER($1) AND nonce = $2::NUMERIC AND status = 'pending'
      RETURNING id
    `;
    const result = await this.pool.query(query, [normalizedAddress, nonce.toString(), txHash ?? null]);
    return result.rows.length > 0;
  }

  /**
   * Record a completed hot-wallet withdrawal for history (shows in getPlayerTransactionHistory).
   * Uses a synthetic negative nonce so it does not clash with signature-based pending withdrawals.
   */
  async recordHotWalletWithdrawal(walletAddress: string, amount: bigint, txHash: string): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const nonce = -BigInt(Date.now()) * 1000000n - BigInt(Math.floor(Math.random() * 1000000));
    await this.pool.query(
      `INSERT INTO pending_withdrawals (nonce, wallet_address, amount, status, tx_hash)
       VALUES ($1::NUMERIC, $2, $3::NUMERIC, 'completed', $4)`,
      [nonce.toString(), normalizedAddress, amount.toString(), txHash],
    );
  }

  // ============================================
  // Hot Withdrawal Jobs (queue + confirmation)
  // ============================================

  /** Enqueue a hot-wallet withdrawal: deduct balance and insert job in one transaction. Returns job id. */
  async enqueueHotWithdrawal(
    walletAddress: string,
    amountWei: bigint,
    netToUserWei: bigint,
    feeWei: bigint,
  ): Promise<string> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    return this.withTransaction(async (client) => {
      const deductResult = await client.query(
        `UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING id`,
        [normalizedAddress, amountWei.toString()],
      );
      if (deductResult.rows.length === 0) {
        const cur = await client.query(
          `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)`,
          [normalizedAddress],
        );
        const have = cur.rows[0]?.balance ?? '0';
        throw new Error(`Insufficient balance: have ${formatWei(have)}, need ${formatWei(amountWei)}`);
      }
      const insertResult = await client.query(
        `INSERT INTO hot_withdrawal_jobs (wallet_address, amount_wei, net_to_user_wei, fee_wei, status)
         VALUES ($1, $2::NUMERIC, $3::NUMERIC, $4::NUMERIC, 'queued')
         RETURNING id`,
        [normalizedAddress, amountWei.toString(), netToUserWei.toString(), feeWei.toString()],
      );
      return insertResult.rows[0].id;
    });
  }

  /** Claim next queued job: SELECT FOR UPDATE SKIP LOCKED and set status = 'broadcasting' in one transaction. Returns null if none. */
  async claimNextHotWithdrawalJob(): Promise<{
    id: string;
    wallet_address: string;
    amount_wei: string;
    net_to_user_wei: string;
    fee_wei: string;
    created_at: Date;
  } | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query(
        `SELECT id, wallet_address, amount_wei, net_to_user_wei, fee_wei, created_at
         FROM hot_withdrawal_jobs
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      await client.query(
        `UPDATE hot_withdrawal_jobs SET status = 'broadcasting', updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
      return row;
    });
  }

  /** Update job status (and optionally tx_hash, error_message). */
  async updateHotWithdrawalJob(
    jobId: string,
    updates: { status: string; tx_hash?: string | null; error_message?: string | null },
  ): Promise<void> {
    const sets: string[] = ['status = $2', 'updated_at = NOW()'];
    const vals: (string | null)[] = [jobId, updates.status];
    let i = 3;
    if (updates.tx_hash !== undefined) {
      sets.push(`tx_hash = $${i++}`);
      vals.push(updates.tx_hash);
    }
    if (updates.error_message !== undefined) {
      sets.push(`error_message = $${i++}`);
      vals.push(updates.error_message);
    }
    await this.pool.query(
      `UPDATE hot_withdrawal_jobs SET ${sets.join(', ')} WHERE id = $1`,
      vals,
    );
  }

  /** Get job by id for status API. */
  async getHotWithdrawalJobById(jobId: string): Promise<{
    id: string;
    wallet_address: string;
    amount_wei: string;
    net_to_user_wei: string;
    status: string;
    tx_hash: string | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount_wei, net_to_user_wei, status, tx_hash, error_message, created_at, updated_at
       FROM hot_withdrawal_jobs WHERE id = $1`,
      [jobId],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /** Get the latest active (non-terminal) hot withdrawal job for a wallet. */
  async getActiveHotWithdrawalJob(walletAddress: string): Promise<{
    id: string;
    wallet_address: string;
    amount_wei: string;
    net_to_user_wei: string;
    status: string;
    tx_hash: string | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
  } | null> {
    const normalized = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount_wei, net_to_user_wei, status, tx_hash, error_message, created_at, updated_at
       FROM hot_withdrawal_jobs
       WHERE LOWER(wallet_address) = LOWER($1)
         AND status IN ('queued', 'broadcasting', 'pending_confirmation')
       ORDER BY created_at DESC LIMIT 1`,
      [normalized],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /** List jobs in pending_confirmation for the confirmation worker. */
  async getHotWithdrawalJobsPendingConfirmation(): Promise<
    Array<{ id: string; wallet_address: string; amount_wei: string; tx_hash: string; created_at: Date; updated_at: Date }>
  > {
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount_wei, tx_hash, created_at, updated_at
       FROM hot_withdrawal_jobs
       WHERE status = 'pending_confirmation' AND tx_hash IS NOT NULL`,
    );
    return result.rows;
  }

  /** Refund balance for a failed hot withdrawal job. */
  async refundHotWithdrawalJob(walletAddress: string, amountWei: bigint): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
      [normalizedAddress, amountWei.toString()],
    );
  }

  // ============================================
  // Pending Deposits (reorg protection)
  // ============================================

  /** Insert a pending deposit (do not credit balance until confirmations). */
  async insertPendingDeposit(
    walletAddress: string,
    amountWei: bigint,
    txHash: string,
    blockNumber: bigint | null,
    confirmationsRequired: number = 12,
  ): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `INSERT INTO pending_deposits (wallet_address, amount_wei, tx_hash, block_number, confirmations_required, status)
       VALUES ($1, $2::NUMERIC, $3, $4, $5, 'pending_confirmation')
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        normalizedAddress,
        amountWei.toString(),
        txHash,
        blockNumber != null ? Number(blockNumber) : null,
        confirmationsRequired,
      ],
    );
  }

  /** Returns true if the player has any unconfirmed pending deposit in flight. */
  async hasPendingDeposit(walletAddress: string): Promise<boolean> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT 1 FROM pending_deposits WHERE LOWER(wallet_address) = LOWER($1) AND status = 'pending_confirmation' LIMIT 1`,
      [normalizedAddress],
    );
    return result.rows.length > 0;
  }

  /** Get pending deposits that need confirmation check. */
  async getPendingDepositsForConfirmation(): Promise<
    Array<{ id: string; wallet_address: string; amount_wei: string; tx_hash: string; block_number: number | null; confirmations_required: number }>
  > {
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount_wei, tx_hash, block_number, confirmations_required
       FROM pending_deposits
       WHERE status = 'pending_confirmation'`,
    );
    return result.rows;
  }

  /** List pending_deposits rows for admin tables with pagination. */
  async listPendingDeposits(limit = 25, offset = 0): Promise<Array<{
    id: string;
    wallet_address: string;
    amount_wei: string;
    tx_hash: string | null;
    status: string;
    created_at: string;
  }>> {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount_wei::TEXT AS amount_wei, tx_hash, status, created_at
       FROM pending_deposits
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset],
    );

    return result.rows.map((r: any) => ({
      id: String(r.id),
      wallet_address: r.wallet_address ?? '',
      amount_wei: r.amount_wei ?? '0',
      tx_hash: r.tx_hash ?? null,
      status: r.status ?? 'unknown',
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  /**
   * Mark pending deposit as credited and credit players.balance — single writer for deposits.
   */
  async creditPendingDeposit(jobId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query(
        `SELECT wallet_address, amount_wei, tx_hash, block_number
         FROM pending_deposits
         WHERE id = $1 AND status = 'pending_confirmation'
         FOR UPDATE`,
        [jobId],
      );
      if (row.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const { wallet_address, amount_wei, tx_hash, block_number } = row.rows[0];
      const normWallet = this.normalizeAddress(wallet_address);
      await client.query(
        `INSERT INTO players (wallet_address, balance)
         VALUES ($1, $2::NUMERIC)
         ON CONFLICT (wallet_address) DO UPDATE SET
           balance = players.balance + $2::NUMERIC,
           last_seen = NOW()`,
        [normWallet, amount_wei],
      );
      await client.query(
        `INSERT INTO player_deposits (wallet_address, amount, tx_hash, block_number)
         VALUES ($1, $2::NUMERIC, $3, $4)
         ON CONFLICT (tx_hash) DO NOTHING`,
        [wallet_address, amount_wei, tx_hash, block_number ?? null],
      );
      await client.query(
        `UPDATE pending_deposits SET status = 'credited', updated_at = NOW() WHERE id = $1`,
        [jobId],
      );
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Update pending deposit block_number (e.g. after fetching from chain). */
  async updatePendingDepositBlockNumber(jobId: string, blockNumber: bigint): Promise<void> {
    await this.pool.query(
      `UPDATE pending_deposits SET block_number = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, Number(blockNumber)],
    );
  }

  /** Get a credited pending deposit by tx_hash (for admin shortfall correction). */
  async getCreditedPendingDepositByTxHash(
    txHash: string,
  ): Promise<{ wallet_address: string; amount_wei: string } | null> {
    const result = await this.pool.query(
      `SELECT wallet_address, amount_wei FROM pending_deposits WHERE tx_hash = $1 AND status = 'credited'`,
      [txHash],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /** Get stored Blackjack platform totals (deposit/withdraw). Used by chain-analytics for derived totals. */
  async getBlackjackPlatformTotals(): Promise<{
    totalDeposited: bigint;
    totalWithdrawn: bigint;
    lastScannedBlock: bigint | null;
  } | null> {
    const result = await this.pool.query(
      `SELECT total_deposited, total_withdrawn, last_scanned_block FROM blackjack_platform_totals WHERE id = 1`
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      totalDeposited: BigInt(r.total_deposited ?? '0'),
      totalWithdrawn: BigInt(r.total_withdrawn ?? '0'),
      lastScannedBlock: r.last_scanned_block != null ? BigInt(r.last_scanned_block) : null,
    };
  }

  /** Update Blackjack platform totals (after full or incremental chain scan). */
  async updateBlackjackPlatformTotals(
    totalDeposited: bigint,
    totalWithdrawn: bigint,
    lastScannedBlock: bigint | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE blackjack_platform_totals SET total_deposited = $1::NUMERIC, total_withdrawn = $2::NUMERIC, last_scanned_block = $3, updated_at = NOW() WHERE id = 1`,
      [totalDeposited.toString(), totalWithdrawn.toString(), lastScannedBlock != null ? Number(lastScannedBlock) : null]
    );
  }

  /** Add amount to stored total_withdrawn when a pending withdrawal is created. */
  async addToBlackjackWithdrawnTotal(amount: bigint): Promise<void> {
    if (amount <= 0n) return;
    await this.pool.query(
      `UPDATE blackjack_platform_totals SET total_withdrawn = total_withdrawn + $1::NUMERIC, updated_at = NOW() WHERE id = 1`,
      [amount.toString()]
    );
  }

  /** Blackjack deposits and withdrawals since a given time (from player_deposits + pending_withdrawals). */
  async getBlackjackDepositsWithdrawalsSince(since: Date): Promise<{ deposited: string; withdrawn: string }> {
    const sinceIso = since.toISOString();
    const [depResult, witResult] = await Promise.all([
      this.pool.query<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0)::TEXT AS sum FROM player_deposits WHERE created_at >= $1`,
        [sinceIso]
      ),
      this.pool.query<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0)::TEXT AS sum FROM pending_withdrawals WHERE created_at >= $1`,
        [sinceIso]
      ),
    ]);
    return {
      deposited: depResult.rows[0]?.sum ?? '0',
      withdrawn: witResult.rows[0]?.sum ?? '0',
    };
  }

  // ============================================
  // Instant Lottery (indexed plays for leaderboard + player stats)
  // ============================================

  async getInstantLotteryScanState(): Promise<{ lastScannedBlock: bigint | null } | null> {
    const result = await this.pool.query(
      `SELECT last_scanned_block FROM instant_lottery_scan WHERE id = 1`
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      lastScannedBlock: r.last_scanned_block != null ? BigInt(r.last_scanned_block) : null,
    };
  }

  async updateInstantLotteryScanState(lastScannedBlock: bigint | null): Promise<void> {
    await this.pool.query(
      `UPDATE instant_lottery_scan SET last_scanned_block = $1, updated_at = NOW() WHERE id = 1`,
      [lastScannedBlock != null ? Number(lastScannedBlock) : null]
    );
  }

  /** Insert one play (from chain event). ON CONFLICT DO NOTHING so re-scans are safe. */
  async logInstantLotteryPlay(
    walletAddress: string,
    wager: bigint,
    grossPayout: bigint,
    netPayout: bigint,
    blockNumber: bigint | null,
    txHash: string
  ): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `INSERT INTO instant_lottery_plays (wallet_address, wager, gross_payout, net_payout, block_number, tx_hash)
       VALUES ($1, $2::NUMERIC, $3::NUMERIC, $4::NUMERIC, $5, $6)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        normalized,
        wager.toString(),
        grossPayout.toString(),
        netPayout.toString(),
        blockNumber != null ? Number(blockNumber) : null,
        txHash,
      ]
    );
  }

  /** Top players by total wagered (all-time from indexed plays). */
  async getLotteryTopPlayers(limit: number = 25): Promise<LotteryTopPlayerEntry[]> {
    const query = `
      WITH agg AS (
        SELECT
          LOWER(wallet_address) AS wallet_address,
          COUNT(*)::INTEGER AS total_games,
          COALESCE(SUM(wager), 0)::NUMERIC(78, 0) AS total_bet,
          COALESCE(SUM(gross_payout), 0)::NUMERIC(78, 0) AS total_win,
          (COALESCE(SUM(gross_payout), 0) - COALESCE(SUM(wager), 0))::NUMERIC(78, 0) AS profit_loss,
          CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE net_payout > 0)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
          ELSE 0 END AS win_rate
        FROM instant_lottery_plays
        GROUP BY LOWER(wallet_address)
      )
      SELECT ROW_NUMBER() OVER (ORDER BY total_bet DESC)::INTEGER AS rank, *
      FROM agg
      ORDER BY total_bet DESC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map((r: any) => this.normalizeTopPlayerEntry(r));
  }

  /** Per-player stats from indexed instant lottery plays. */
  async getLotteryPlayerStats(walletAddress: string): Promise<LotteryPlayerStats | null> {
    const normalized = this.normalizeAddress(walletAddress);
    const query = `
      SELECT
        COUNT(*)::INTEGER AS total_games,
        COALESCE(SUM(wager), 0)::NUMERIC(78, 0) AS total_bet,
        COALESCE(SUM(gross_payout), 0)::NUMERIC(78, 0) AS total_win,
        (COALESCE(SUM(gross_payout), 0) - COALESCE(SUM(wager), 0))::NUMERIC(78, 0) AS profit_loss,
        CASE WHEN COUNT(*) > 0 THEN
          ROUND((COUNT(*) FILTER (WHERE net_payout > 0)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END AS win_rate
      FROM instant_lottery_plays
      WHERE LOWER(wallet_address) = LOWER($1)
    `;
    const result = await this.pool.query(query, [normalized]);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      total_games: Number(r.total_games ?? 0),
      total_bet: this.toBigInt(r.total_bet),
      total_win: this.toBigInt(r.total_win),
      profit_loss: this.toBigInt(r.profit_loss),
      win_rate: Number(r.win_rate ?? 0),
    };
  }

  /** Insert a provably-fair instant lottery play (before resolvePlay tx). */
  async insertInstantLotteryPlayPF(params: {
    walletAddress: string;
    wager: bigint;
    playerNumbers: number[];
    winningNumbers: number[];
    matchCount: number;
    grossPayout: bigint;
    netPayout: bigint;
    serverSeedHash: string;
    clientSeed: string;
    nonce: bigint;
  }): Promise<number> {
    const normalized = this.normalizeAddress(params.walletAddress);
    const result = await this.pool.query(
      `INSERT INTO instant_lottery_plays_pf (
        wallet_address, wager, player_numbers, winning_numbers, match_count,
        gross_payout, net_payout, server_seed_hash, client_seed, nonce
      ) VALUES ($1, $2::NUMERIC, $3, $4, $5, $6::NUMERIC, $7::NUMERIC, $8, $9, $10)
      RETURNING id`,
      [
        normalized,
        params.wager.toString(),
        params.playerNumbers,
        params.winningNumbers,
        params.matchCount,
        params.grossPayout.toString(),
        params.netPayout.toString(),
        params.serverSeedHash,
        params.clientSeed,
        params.nonce.toString(),
      ]
    );
    return Number(result.rows[0]?.id ?? 0);
  }

  /** Set tx_hash after resolvePlay succeeds (for verification lookup). Stored lowercase for consistent lookup. */
  async updateInstantLotteryPlayPFTxHash(id: number, txHash: string): Promise<void> {
    const normalized = (txHash || '').trim().toLowerCase();
    await this.pool.query(
      `UPDATE instant_lottery_plays_pf SET tx_hash = $1 WHERE id = $2`,
      [normalized, id]
    );
  }

  /** Reveal server seed for verification (call after play is settled). */
  async updateInstantLotteryPlayPFReveal(id: number, serverSeed: string): Promise<void> {
    await this.pool.query(
      `UPDATE instant_lottery_plays_pf SET server_seed = $1 WHERE id = $2`,
      [serverSeed, id]
    );
  }

  /** Get PF play by tx_hash for verification endpoint. Lookup is case-insensitive (EVM hashes). */
  async getInstantLotteryPlayPFByTxHash(txHash: string): Promise<{
    wallet_address: string;
    wager: bigint;
    player_numbers: number[];
    winning_numbers: number[];
    match_count: number;
    gross_payout: bigint;
    net_payout: bigint;
    server_seed_hash: string;
    server_seed: string | null;
    client_seed: string;
    nonce: string;
  } | null> {
    const normalized = txHash.trim().toLowerCase();
    const result = await this.pool.query(
      `SELECT wallet_address, wager, player_numbers, winning_numbers, match_count,
              gross_payout, net_payout, server_seed_hash, server_seed, client_seed, nonce
       FROM instant_lottery_plays_pf WHERE LOWER(tx_hash) = $1`,
      [normalized]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      wallet_address: r.wallet_address ?? '',
      wager: this.toBigInt(r.wager),
      player_numbers: Array.isArray(r.player_numbers) ? r.player_numbers : [],
      winning_numbers: Array.isArray(r.winning_numbers) ? r.winning_numbers : [],
      match_count: Number(r.match_count ?? 0),
      gross_payout: this.toBigInt(r.gross_payout),
      net_payout: this.toBigInt(r.net_payout),
      server_seed_hash: r.server_seed_hash ?? '',
      server_seed: r.server_seed ?? null,
      client_seed: r.client_seed ?? 'default',
      nonce: String(r.nonce ?? '0'),
    };
  }

  async expirePendingWithdrawals(): Promise<number> {
    // DEPRECATED: Use getExpiredPendingWithdrawals + expireSinglePendingWithdrawal instead.
    // This blind-refund version is kept only as a fallback.
    const query = `
      UPDATE pending_withdrawals
      SET status = 'expired'
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes'
      RETURNING wallet_address, amount
    `;
    const result = await this.pool.query(query);
    for (const row of result.rows) {
      await this.addPlayerBalance(row.wallet_address, BigInt(row.amount));
    }
    return result.rows.length;
  }

  /**
   * Get pending withdrawals past their on-chain deadline (expires_at).
   * Does NOT modify them — caller must verify on-chain before deciding to refund or mark completed.
   */
  async getExpiredPendingWithdrawals(): Promise<Array<{ wallet_address: string; nonce: string; amount: string }>> {
    const query = `
      SELECT wallet_address, nonce, amount
      FROM pending_withdrawals
      WHERE status = 'pending' AND expires_at IS NOT NULL AND NOW() > expires_at
    `;
    const result = await this.pool.query(query);
    return result.rows;
  }

  /** List pending_withdrawals rows for admin tables with pagination. */
  async listPendingWithdrawals(limit = 25, offset = 0): Promise<Array<{
    id: string;
    wallet_address: string;
    amount: string;
    tx_hash: string | null;
    nonce: string;
    status: string;
    created_at: string;
  }>> {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const result = await this.pool.query(
      `SELECT id, wallet_address, amount::TEXT AS amount, tx_hash, nonce::TEXT AS nonce, status, created_at
       FROM pending_withdrawals
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset],
    );

    return result.rows.map((r: any) => ({
      id: String(r.id),
      wallet_address: r.wallet_address ?? '',
      amount: r.amount ?? '0',
      tx_hash: r.tx_hash ?? null,
      nonce: r.nonce ?? '0',
      status: r.status ?? 'unknown',
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  /**
   * Get one expired pending withdrawal for a wallet (oldest first).
   * Used by admin to manually trigger refund when cron couldn't verify (e.g. RPC issues).
   */
  async getExpiredPendingForWallet(walletAddress: string): Promise<{ nonce: string; amount: string } | null> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      SELECT nonce, amount FROM pending_withdrawals
      WHERE LOWER(wallet_address) = LOWER($1) AND status = 'pending' AND expires_at IS NOT NULL AND NOW() > expires_at
      ORDER BY expires_at ASC LIMIT 1
    `;
    const result = await this.pool.query(query, [normalizedAddress]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Expire a single pending withdrawal and refund the balance.
   * Only call this after verifying on-chain that the nonce was NOT used.
   */
  async expireSinglePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE pending_withdrawals SET status = 'expired'
         WHERE LOWER(wallet_address) = LOWER($1) AND nonce = $2::NUMERIC AND status = 'pending'
         RETURNING id`,
        [normalizedAddress, nonce.toString()],
      );
      if (result.rows.length > 0) {
        await client.query(
          `UPDATE players SET balance = balance + $2::NUMERIC WHERE LOWER(wallet_address) = LOWER($1)`,
          [normalizedAddress, amount.toString()],
        );
      }
    });
  }

  /** Expire all pending withdrawals for a wallet (any age). Only used by cron — NOT on prepare (would allow double withdrawal). */
  async expirePendingWithdrawalsForWallet(walletAddress: string): Promise<number> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      UPDATE pending_withdrawals
      SET status = 'expired'
      WHERE LOWER(wallet_address) = LOWER($1) AND status = 'pending'
      RETURNING amount
    `;
    const result = await this.pool.query(query, [normalizedAddress]);
    for (const row of result.rows) {
      await this.addPlayerBalance(normalizedAddress, BigInt(row.amount));
    }
    return result.rows.length;
  }

  async syncPlayerBalanceWithContract(walletAddress: string, contractBalance: bigint): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    await this.updatePlayerBalance(normalizedAddress, contractBalance, 'set');
  }

  /**
   * Check whether a player has any in-progress (non-completed) blackjack games.
   * Used to guard balance resets during contract upgrades.
   */
  async hasActiveGames(walletAddress: string): Promise<boolean> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const query = `
      SELECT 1 FROM games g
      JOIN game_sessions gs ON g.session_id = gs.id
      JOIN players p ON gs.player_id = p.id
      WHERE LOWER(p.wallet_address) = LOWER($1)
        AND g.result = 'ongoing'
      LIMIT 1
    `;
    const result = await this.pool.query(query, [normalizedAddress]);
    return result.rows.length > 0;
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

  async getTopPlayers(limit: number = 25): Promise<TopPlayerEntry[]> {
    const query = `
      WITH all_game_rows AS (
        -- Single-player
        SELECT LOWER(p.wallet_address) AS addr,
               g.total_bet_amount, g.total_payout, g.result
        FROM players p
        JOIN game_sessions gs ON gs.player_id = p.id
        JOIN games g ON g.session_id = gs.id AND g.result IS NOT NULL AND g.result != 'ongoing'

        UNION ALL

        -- Multiplayer
        SELECT LOWER(s.player_address) AS addr,
               s.bet_amount AS total_bet_amount, s.payout AS total_payout, s.result
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE s.result IS NOT NULL AND r.status = 'completed'
      ),
      agg AS (
        SELECT
          addr AS wallet_address,
          COUNT(*)::BIGINT AS total_games,
          COALESCE(SUM(total_bet_amount), 0)::NUMERIC(78, 0) AS total_bet,
          COALESCE(SUM(total_payout), 0)::NUMERIC(78, 0) AS total_win,
          (COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::NUMERIC(78, 0) AS profit_loss,
          CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE result IN ('win', 'blackjack'))::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
          ELSE 0 END AS win_rate
        FROM all_game_rows
        GROUP BY addr
        HAVING COUNT(*) >= 10
      )
      SELECT ROW_NUMBER() OVER (ORDER BY profit_loss DESC, win_rate DESC)::INTEGER AS rank, *
      FROM agg
      ORDER BY profit_loss DESC, win_rate DESC
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
    // Fallback: when total_bet_amount/total_payout are 0 (e.g. tournament games), sum from game_hands.
    // Tournament chip amounts are 1:1; scale by 1e18 so formatEther displays correctly.
    // UNIONs multiplayer blackjack round seats so both game types appear in history.
    const query = `
      WITH gh_agg AS (
        SELECT game_id,
          SUM(bet_amount) AS bet_sum,
          SUM(payout) AS payout_sum
        FROM game_hands
        GROUP BY game_id
      ),
      combined AS (
        -- Single-player games
        SELECT
          g.id::text, g.session_id::text, g.game_number,
          CASE WHEN COALESCE(g.total_bet_amount, 0) = 0 THEN (COALESCE(gh.bet_sum, 0) * 1000000000000000000::numeric) ELSE g.total_bet_amount END AS total_bet_amount,
          g.dealer_cards, g.dealer_total, g.result,
          CASE WHEN COALESCE(g.total_payout, 0) = 0 THEN (COALESCE(gh.payout_sum, 0) * 1000000000000000000::numeric) ELSE g.total_payout END AS total_payout,
          g.dealer_actions, g.actions, g.created_at, g.completed_at, g.server_seed_revealed,
          g.client_seed_commitment, g.dealer_seed, g.hand_count, g.current_hand_index,
          g.rng_counter, g.rng_version, g.perfect_pairs_bet_amount, g.perfect_pairs_payout,
          gs.player_id::text,
          'single' AS game_mode
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        JOIN players p ON gs.player_id = p.id
        LEFT JOIN gh_agg gh ON gh.game_id = g.id
        WHERE LOWER(p.wallet_address) = LOWER($1)

        UNION ALL

        -- Multiplayer games
        SELECT
          s.id::text                      AS id,
          r.id::text                      AS session_id,
          r.round_number                  AS game_number,
          s.bet_amount                    AS total_bet_amount,
          r.dealer_cards                  AS dealer_cards,
          r.dealer_total                  AS dealer_total,
          s.result                        AS result,
          s.payout                        AS total_payout,
          '[]'::jsonb                     AS dealer_actions,
          '[]'::jsonb                     AS actions,
          r.created_at                    AS created_at,
          r.completed_at                  AS completed_at,
          FALSE                           AS server_seed_revealed,
          NULL                            AS client_seed_commitment,
          NULL                            AS dealer_seed,
          1                               AS hand_count,
          0                               AS current_hand_index,
          0                               AS rng_counter,
          1                               AS rng_version,
          0::numeric                      AS perfect_pairs_bet_amount,
          0::numeric                      AS perfect_pairs_payout,
          NULL::text                      AS player_id,
          'multi' AS game_mode
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE LOWER(s.player_address) = LOWER($1)
          AND s.result IS NOT NULL
          AND r.status = 'completed'
      )
      SELECT * FROM combined
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(query, [normalizedAddress, limit, offset]);
    const games = result.rows.map((r: any) => this.normalizeGame(r));
    return games;
  }

  /** Recent completed games globally (all players) for "Recent Play" feed.
   *  Includes both single-player and multiplayer blackjack games. */
  async getRecentGamesGlobal(limit: number = 20): Promise<Array<{
    id: string;
    wallet_address: string;
    result: string | null;
    total_bet_amount: bigint;
    total_payout: bigint;
    created_at: Date;
  }>> {
    const query = `
      WITH gh_agg AS (
        SELECT game_id,
          SUM(bet_amount) AS bet_sum,
          SUM(payout) AS payout_sum
        FROM game_hands
        GROUP BY game_id
      ),
      combined AS (
        -- Single-player games
        SELECT
          g.id::text,
          p.wallet_address,
          g.result,
          CASE WHEN COALESCE(g.total_bet_amount, 0) = 0 THEN (COALESCE(gh.bet_sum, 0) * 1000000000000000000::numeric) ELSE g.total_bet_amount END AS total_bet_amount,
          CASE WHEN COALESCE(g.total_payout, 0) = 0 THEN (COALESCE(gh.payout_sum, 0) * 1000000000000000000::numeric) ELSE g.total_payout END AS total_payout,
          g.created_at
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        JOIN players p ON gs.player_id = p.id
        LEFT JOIN gh_agg gh ON gh.game_id = g.id
        WHERE g.result IS NOT NULL AND g.result != 'ongoing'

        UNION ALL

        -- Multiplayer games
        SELECT
          s.id::text            AS id,
          s.player_address      AS wallet_address,
          s.result,
          s.bet_amount          AS total_bet_amount,
          s.payout              AS total_payout,
          r.created_at
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE s.result IS NOT NULL AND r.status = 'completed'
      )
      SELECT * FROM combined
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map((r: any) => ({
      id: r.id,
      wallet_address: r.wallet_address ?? '',
      result: r.result ?? null,
      total_bet_amount: this.toBigInt(r.total_bet_amount),
      total_payout: this.toBigInt(r.total_payout),
      created_at: r.created_at ? new Date(r.created_at) : new Date(0),
    }));
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

  /**
   * Insert a game_hand row using a provided transaction client.
   * Used by multiplayer settlement to fan out JSONB hands into normalised rows
   * inside the same transaction that settles balances.
   */
  async createGameHandInTx(client: any, gameId: string, handData: Partial<GameHand>): Promise<void> {
    const query = `
      INSERT INTO game_hands (
        game_id, hand_index, cards, total, has_ace, is_blackjack, is_bust,
        bet_amount, result, payout, actions, completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::NUMERIC, $9, $10::NUMERIC, $11, NOW())
    `;
    const values = [
      gameId,
      handData.hand_index ?? 0,
      JSON.stringify(handData.cards ?? []),
      handData.total ?? 0,
      handData.has_ace ?? false,
      handData.is_blackjack ?? false,
      handData.is_bust ?? false,
      (handData.bet_amount ?? 0n).toString(),
      handData.result ?? 'loss',
      (handData.payout ?? 0n).toString(),
      JSON.stringify(handData.actions ?? []),
    ];
    await client.query(query, values);
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
    // game_hands now stores both single-player and multiplayer hands
    // (multiplayer hands are fanned out at settlement time).
    const query = `
      SELECT * FROM game_hands
      WHERE game_id = $1
      ORDER BY hand_index ASC
    `;
    const result = await this.pool.query(query, [gameId]);
    if (result.rows.length > 0) {
      return result.rows.map((r: any) => this.normalizeGameHand(r));
    }

    // Legacy fallback for multiplayer games settled before migration 084.
    // Reads hands from the JSONB column on blackjack_multi_round_seats.
    const multiQuery = `
      SELECT s.id, s.round_id AS game_id, s.hands, s.result AS seat_result, s.payout AS seat_payout
      FROM blackjack_multi_round_seats s
      WHERE s.id = $1
    `;
    const multiResult = await this.pool.query(multiQuery, [gameId]);
    if (multiResult.rows.length === 0) return [];

    const row = multiResult.rows[0];
    const rawHands = typeof row.hands === 'string' ? JSON.parse(row.hands) : (row.hands ?? []);
    if (!Array.isArray(rawHands) || rawHands.length === 0) return [];

    return rawHands.map((h: any, idx: number) => ({
      id: `${row.id}-${idx}`,
      game_id: gameId,
      hand_index: idx,
      cards: Array.isArray(h.cards) ? h.cards : [],
      total: Number(h.total ?? 0),
      has_ace: Boolean(h.hasAce),
      is_blackjack: Boolean(h.isBlackjack),
      is_bust: Boolean(h.isBust),
      bet_amount: this.toBigInt(h.betAmount ?? '0'),
      result: h.result ?? row.seat_result ?? 'loss',
      payout: this.toBigInt(h.payout ?? '0'),
      actions: Array.isArray(h.actions) ? h.actions : [],
      created_at: new Date(),
    }));
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

  /** Multiplayer blackjack: one row per player per round (used as history `id` for verify links). */
  async getBlackjackMultiRoundSeatWithRound(seatId: string): Promise<{ seat: any; round: any } | null> {
    const id = typeof seatId === 'string' ? seatId.trim() : seatId;
    if (!id) return null;
    const seatResult = await this.pool.query(`SELECT * FROM blackjack_multi_round_seats WHERE id = $1`, [id]);
    if (!seatResult.rows[0]) return null;
    const seat = seatResult.rows[0];
    const roundResult = await this.pool.query(`SELECT * FROM blackjack_multi_rounds WHERE id = $1`, [seat.round_id]);
    if (!roundResult.rows[0]) return null;
    return { seat, round: roundResult.rows[0] };
  }

  /** Load a completed round and all seats (seat_position ASC). Used for verify-by-round-id when exactly one seat. */
  async getBlackjackMultiRoundWithSeats(roundId: string): Promise<{ round: any; seats: any[] } | null> {
    const id = typeof roundId === 'string' ? roundId.trim() : roundId;
    if (!id) return null;
    const roundResult = await this.pool.query(`SELECT * FROM blackjack_multi_rounds WHERE id = $1`, [id]);
    if (!roundResult.rows[0]) return null;
    const round = roundResult.rows[0];
    const seatsResult = await this.pool.query(
      `SELECT * FROM blackjack_multi_round_seats WHERE round_id = $1 ORDER BY seat_position ASC`,
      [id],
    );
    return { round, seats: seatsResult.rows };
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
      WHERE room_id = $1 AND deleted_at IS NULL
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

  /** Admin: recent messages including soft-deleted (for moderation UI). */
  async getRecentChatMessagesForAdmin(roomId: string, limit: number = 100): Promise<ChatMessage[]> {
    const query = `
      SELECT id, room_id, sender_address, text, created_at, deleted_at, deleted_by
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
      created_at: row.created_at,
      deleted_at: row.deleted_at ?? null,
      deleted_by: row.deleted_by ?? null
    })).reverse();
  }

  /** Admin: messages older than beforeId (including deleted), for pagination. */
  async getChatMessagesBeforeForAdmin(roomId: string, beforeId: string, limit: number = 100): Promise<ChatMessage[]> {
    const query = `
      SELECT id, room_id, sender_address, text, created_at, deleted_at, deleted_by
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
      created_at: row.created_at,
      deleted_at: row.deleted_at ?? null,
      deleted_by: row.deleted_by ?? null
    })).reverse();
  }

  /** Admin: soft-delete a chat message. Returns room_id if message existed and was not already deleted. */
  async deleteChatMessage(messageId: string, deletedByAddress: string): Promise<string | null> {
    const normalized = this.normalizeAddress(deletedByAddress);
    const query = `
      UPDATE chat_messages
      SET deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING room_id
    `;
    const result = await this.pool.query(query, [messageId, normalized]);
    return result.rows[0]?.room_id ?? null;
  }

  /** Messages older than the message with id beforeId, in chronological order (oldest first). */
  async getChatMessagesBefore(roomId: string, beforeId: string, limit: number = 50): Promise<ChatMessage[]> {
    const query = `
      SELECT id, room_id, sender_address, text, created_at
      FROM chat_messages
      WHERE room_id = $1 AND deleted_at IS NULL
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

  async getProfile(walletAddress: string): Promise<{ displayName: string; profileImageUrl: string | null; avatarConfig: Record<string, unknown> | null; bio: string | null; xHandle: string | null; tgHandle: string | null; profileDisplayMode: 'avatar' | 'photo' } | null> {
    const normalized = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT display_name, profile_image_url, avatar_config, bio, x_handle, tg_handle, profile_display_mode FROM chat_display_names WHERE wallet_address = $1`,
      [normalized],
    );
    const row = result.rows[0];
    if (!row) return null;
    const avatarConfig = row.avatar_config != null && typeof row.avatar_config === 'object' ? (row.avatar_config as Record<string, unknown>) : null;
    return {
      displayName: row.display_name,
      profileImageUrl: row.profile_image_url ?? null,
      avatarConfig,
      bio: row.bio ?? null,
      xHandle: row.x_handle ?? null,
      tgHandle: row.tg_handle ?? null,
      profileDisplayMode: row.profile_display_mode === 'photo' ? 'photo' : 'avatar',
    };
  }

  async setDisplayName(
    walletAddress: string,
    displayName: string,
    profileImageUrl?: string | null,
    avatarConfig?: Record<string, unknown> | null,
    bio?: string | null,
    xHandle?: string | null,
    tgHandle?: string | null,
    profileDisplayMode?: 'avatar' | 'photo' | null,
  ): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    // Always upsert all provided fields; NULL params fall back to COALESCE of existing value
    // so callers that don't know a field's current value won't accidentally clear it.
    await this.pool.query(
      `INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url, avatar_config, bio, x_handle, tg_handle, profile_display_mode)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, COALESCE($8, 'avatar'))
       ON CONFLICT (wallet_address) DO UPDATE SET
         display_name         = $2,
         updated_at           = NOW(),
         profile_image_url    = CASE WHEN $3 = '' THEN NULL WHEN $3 IS NULL THEN chat_display_names.profile_image_url ELSE $3 END,
         avatar_config        = COALESCE($4::jsonb, chat_display_names.avatar_config),
         bio                  = COALESCE($5, chat_display_names.bio),
         x_handle             = COALESCE($6, chat_display_names.x_handle),
         tg_handle            = COALESCE($7, chat_display_names.tg_handle),
         profile_display_mode = COALESCE($8, chat_display_names.profile_display_mode)`,
      [
        normalized,
        displayName,
        profileImageUrl ?? null,
        avatarConfig != null ? JSON.stringify(avatarConfig) : null,
        bio ?? null,
        xHandle ?? null,
        tgHandle ?? null,
        profileDisplayMode ?? null,
      ],
    );
  }

  /**
   * Sets avatar_config only when it is currently null (for new players or those who never set an avatar).
   * If no row exists, inserts one with empty display_name and the given config.
   */
  async setDefaultAvatarIfNull(walletAddress: string, avatarConfig: Record<string, unknown>): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    const configJson = JSON.stringify(avatarConfig);
    await this.pool.query(
      `INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url, avatar_config, bio, x_handle, tg_handle)
       VALUES ($1, '', NULL, $2::jsonb, NULL, NULL, NULL)
       ON CONFLICT (wallet_address) DO UPDATE SET
         avatar_config = COALESCE(chat_display_names.avatar_config, EXCLUDED.avatar_config),
         updated_at = NOW()`,
      [normalized, configJson],
    );
  }

  /** Explicitly update social/bio fields — allows clearing (pass empty string → stored as null). */
  async updateProfileSocial(
    walletAddress: string,
    bio: string | null,
    xHandle: string | null,
    tgHandle: string | null,
  ): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `UPDATE chat_display_names
       SET bio = $2, x_handle = $3, tg_handle = $4, updated_at = NOW()
       WHERE wallet_address = $1`,
      [normalized, bio || null, xHandle || null, tgHandle || null],
    );
  }

  async getDisplayNames(walletAddresses: string[]): Promise<Map<string, string>> {
    if (walletAddresses.length === 0) return new Map();
    const normalized = [...new Set(walletAddresses.map(a => this.normalizeAddress(a)))];
    const query = `SELECT wallet_address, display_name FROM chat_display_names WHERE wallet_address = ANY($1)`;
    const result = await this.pool.query(query, [normalized]);
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(this.normalizeAddress(row.wallet_address), row.display_name);
    }
    return map;
  }

  async getProfiles(walletAddresses: string[]): Promise<Map<string, { displayName: string; profileImageUrl: string | null; avatarConfig: Record<string, unknown> | null; profileDisplayMode: 'avatar' | 'photo' }>> {
    if (walletAddresses.length === 0) return new Map();
    const normalized = [...new Set(walletAddresses.map(a => this.normalizeAddress(a)))];
    const query = `SELECT wallet_address, display_name, profile_image_url, avatar_config, profile_display_mode FROM chat_display_names WHERE wallet_address = ANY($1)`;
    const result = await this.pool.query(query, [normalized]);
    const map = new Map<string, { displayName: string; profileImageUrl: string | null; avatarConfig: Record<string, unknown> | null; profileDisplayMode: 'avatar' | 'photo' }>();
    for (const row of result.rows) {
      const avatarConfig = row.avatar_config != null && typeof row.avatar_config === 'object' ? (row.avatar_config as Record<string, unknown>) : null;
      // Always key by normalized lowercase — lookups use normalizeAddress(); DB may return mixed-case PKs.
      map.set(this.normalizeAddress(row.wallet_address), {
        displayName: row.display_name,
        profileImageUrl: row.profile_image_url ?? null,
        avatarConfig,
        profileDisplayMode: row.profile_display_mode === 'photo' ? 'photo' : 'avatar',
      });
    }
    return map;
  }

  // Chat blocked addresses (admin)
  async getBlockedAddresses(): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT wallet_address FROM chat_blocked_addresses ORDER BY blocked_at DESC`
    );
    return result.rows.map((r: any) => r.wallet_address);
  }

  async isAddressBlocked(walletAddress: string): Promise<boolean> {
    const normalized = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT 1 FROM chat_blocked_addresses WHERE wallet_address = $1 LIMIT 1`,
      [normalized]
    );
    return result.rows.length > 0;
  }

  async addBlockedAddress(walletAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    await this.pool.query(
      `INSERT INTO chat_blocked_addresses (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING`,
      [normalized]
    );
  }

  async removeBlockedAddress(walletAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(walletAddress);
    await this.pool.query(`DELETE FROM chat_blocked_addresses WHERE wallet_address = $1`, [normalized]);
  }

  // ============================================
  // User Reports
  // ============================================

  async createReport(data: {
    walletAddress?: string;
    category: string;
    description: string;
    pageUrl?: string;
    userAgent?: string;
    balanceSnapshot?: bigint;
    recentErrors?: unknown[];
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO user_reports (wallet_address, category, description, page_url, user_agent, balance_snapshot, recent_errors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.walletAddress ? this.normalizeAddress(data.walletAddress) : null,
        data.category,
        data.description,
        data.pageUrl ?? null,
        data.userAgent ?? null,
        data.balanceSnapshot != null ? data.balanceSnapshot.toString() : null,
        data.recentErrors ? JSON.stringify(data.recentErrors) : null,
      ],
    );
    return result.rows[0].id as string;
  }

  async getReports(status?: string, limit = 200): Promise<{
    id: string;
    wallet_address: string | null;
    category: string;
    description: string;
    page_url: string | null;
    user_agent: string | null;
    balance_snapshot: string | null;
    recent_errors: unknown[] | null;
    status: string;
    created_at: Date;
  }[]> {
    const params: unknown[] = [limit];
    const where = status ? `WHERE status = $2` : '';
    if (status) params.push(status);
    const result = await this.pool.query(
      `SELECT id, wallet_address, category, description, page_url, user_agent,
              balance_snapshot::TEXT, recent_errors, status, created_at
       FROM user_reports
       ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      params,
    );
    return result.rows;
  }

  async updateReportStatus(id: string, status: 'read' | 'resolved'): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_reports SET status = $2 WHERE id = $1 RETURNING id`,
      [id, status],
    );
    return result.rows.length > 0;
  }

  /** How many reports has this wallet submitted in the last N minutes (rate limiting). */
  async getRecentReportCountByWallet(walletAddress: string, windowMinutes: number): Promise<number> {
    const normalized = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM user_reports
       WHERE wallet_address = $1 AND created_at > NOW() - INTERVAL '1 minute' * $2`,
      [normalized, windowMinutes],
    );
    return parseInt(result.rows[0].count, 10);
  }

  // ============================================
  // Player deposit history (populated by chain-analytics scans)
  // ============================================

  /**
   * Record a single on-chain deposit for a player.
   * Uses ON CONFLICT DO NOTHING so re-scanning the same block range is safe.
   */
  async logDeposit(
    walletAddress: string,
    amount: bigint,
    txHash: string,
    blockNumber: bigint | null,
    blockTimestamp?: bigint,
  ): Promise<void> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const createdAt = blockTimestamp
      ? new Date(Number(blockTimestamp) * 1000).toISOString()
      : null;
    await this.pool.query(
      `INSERT INTO player_deposits (wallet_address, amount, tx_hash, block_number, created_at)
       VALUES ($1, $2::NUMERIC, $3, $4, COALESCE($5::TIMESTAMPTZ, NOW()))
       ON CONFLICT (tx_hash) DO NOTHING`,
      [normalizedAddress, amount.toString(), txHash, blockNumber !== null ? Number(blockNumber) : null, createdAt],
    );
  }

  /**
   * Return a unified transaction history (deposits + withdrawals) for a wallet,
   * sorted newest-first.
   */
  async getPlayerTransactionHistory(
    walletAddress: string,
    limit = 50,
    offset = 0,
  ): Promise<Array<{
    type: 'deposit' | 'withdrawal';
    amount: string;
    status: string;
    tx_hash: string | null;
    created_at: string;
  }>> {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const result = await this.pool.query(
      `SELECT type, amount::TEXT AS amount, status, tx_hash, created_at
       FROM (
         SELECT
           'deposit'    AS type,
           amount,
           'completed'  AS status,
           tx_hash,
           created_at
         FROM player_deposits
         WHERE LOWER(wallet_address) = LOWER($1)

         UNION ALL

         SELECT
           'withdrawal' AS type,
           amount,
           status,
           tx_hash,
           created_at
         FROM pending_withdrawals
         WHERE LOWER(wallet_address) = LOWER($1)
           AND status IN ('completed', 'expired')
       ) t
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [normalizedAddress, limit, offset],
    );
    return result.rows.map((r: any) => ({
      type: r.type as 'deposit' | 'withdrawal',
      amount: r.amount ?? '0',
      status: r.status ?? 'completed',
      tx_hash: r.tx_hash ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
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
    const colsExtended = 'id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, website_url, sort_order, enabled, created_at, updated_at';
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
      website_url: withExtended ? (r.website_url ?? null) : null,
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

  async hasBlackjackTableByKindSrc(kind: string, src: string): Promise<boolean> {
    const r = await this.pool.query(
      'SELECT 1 FROM blackjack_tables WHERE kind = $1 AND src = $2 LIMIT 1',
      [kind, src]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async createBlackjackTable(row: Omit<BlackjackTableRow, 'id' | 'created_at' | 'updated_at'>): Promise<BlackjackTableRow> {
    const withExtended = async () => {
      const r = await this.pool.query(
        `INSERT INTO blackjack_tables (kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, website_url, sort_order, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, website_url, sort_order, enabled, created_at, updated_at`,
        [row.kind, row.name, row.src, row.description ?? null, row.token_contract_address ?? null, row.logo_url ?? null, row.ticker ?? null, row.iframe_url ?? null, row.website_url ?? null, row.sort_order, row.enabled]
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
        website_url: extended ? (x.website_url ?? null) : null,
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
        website_url: extended ? (x.website_url ?? null) : null,
        sort_order: x.sort_order,
        enabled: x.enabled,
        created_at: new Date(x.created_at),
        updated_at: new Date(x.updated_at),
      };
    }
  }

  async updateBlackjackTable(
    id: string,
    updates: Partial<Pick<BlackjackTableRow, 'name' | 'src' | 'description' | 'token_contract_address' | 'logo_url' | 'ticker' | 'iframe_url' | 'website_url' | 'sort_order' | 'enabled'>>
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
      if (includeExtended && updates.website_url !== undefined) { fields.push(`website_url = $${i++}`); values.push(updates.website_url); }
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
    const colsExtended = 'id, kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, website_url, sort_order, enabled, created_at, updated_at';
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
      website_url: extended ? (x.website_url ?? null) : null,
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

  private mapBlackjackSpWagerTierRow(r: any): BlackjackSpWagerTierRow {
    const tk = r.theme_kind;
    const themeKind =
      tk === 'image' || tk === 'video' ? (tk as 'image' | 'video') : null;
    return {
      id: r.id,
      label: r.label,
      min_bet: String(r.min_bet),
      max_bet: String(r.max_bet),
      theme_kind: themeKind,
      theme_id: r.theme_id ?? null,
      sort_order: Number(r.sort_order ?? 0),
      enabled: Boolean(r.enabled),
      slug: r.slug ?? null,
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at),
    };
  }

  async listBlackjackSpWagerTiers(enabledOnly: boolean): Promise<BlackjackSpWagerTierRow[]> {
    const where = enabledOnly ? 'WHERE enabled = true' : '';
    const r = await this.pool.query(
      `SELECT id, label, min_bet::TEXT, max_bet::TEXT, theme_kind, theme_id, sort_order, enabled, slug, created_at, updated_at
       FROM blackjack_sp_wager_tiers
       ${where}
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return r.rows.map((row: any) => this.mapBlackjackSpWagerTierRow(row));
  }

  async getBlackjackSpWagerTierById(
    id: string,
    enabledOnly: boolean,
  ): Promise<BlackjackSpWagerTierRow | null> {
    const r = await this.pool.query(
      `SELECT id, label, min_bet::TEXT, max_bet::TEXT, theme_kind, theme_id, sort_order, enabled, slug, created_at, updated_at
       FROM blackjack_sp_wager_tiers
       WHERE id = $1 ${enabledOnly ? 'AND enabled = true' : ''}
       LIMIT 1`,
      [id],
    );
    if (r.rows.length === 0) return null;
    return this.mapBlackjackSpWagerTierRow(r.rows[0]);
  }

  async createBlackjackSpWagerTier(input: {
    label: string;
    minBet: bigint;
    maxBet: bigint;
    themeKind?: 'image' | 'video' | null;
    themeId?: string | null;
    sortOrder?: number;
    slug?: string | null;
    enabled?: boolean;
  }): Promise<BlackjackSpWagerTierRow> {
    const sortRes = await this.pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM blackjack_sp_wager_tiers`,
    );
    const nextSort = Number(sortRes.rows[0]?.next_sort ?? 0);
    const sortOrder = input.sortOrder ?? nextSort;
    const themeKind = input.themeKind ?? null;
    const themeId = input.themeId?.trim() || null;
    const slug = input.slug?.trim() || null;
    const enabled = input.enabled !== false;
    const label = input.label.length > 512 ? input.label.slice(0, 512) : input.label;
    const r = await this.pool.query(
      `INSERT INTO blackjack_sp_wager_tiers (label, min_bet, max_bet, theme_kind, theme_id, sort_order, slug, enabled)
       VALUES ($1, $2::NUMERIC, $3::NUMERIC, $4, $5, $6, $7, $8)
       RETURNING id, label, min_bet::TEXT, max_bet::TEXT, theme_kind, theme_id, sort_order, enabled, slug, created_at, updated_at`,
      [label, input.minBet.toString(), input.maxBet.toString(), themeKind, themeId, sortOrder, slug, enabled],
    );
    return this.mapBlackjackSpWagerTierRow(r.rows[0]);
  }

  async updateBlackjackSpWagerTier(
    id: string,
    updates: Partial<{
      label: string;
      minBet: bigint;
      maxBet: bigint;
      themeKind: 'image' | 'video' | null;
      themeId: string | null;
      sortOrder: number;
      enabled: boolean;
      slug: string | null;
    }>,
  ): Promise<BlackjackSpWagerTierRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (updates.label !== undefined) {
      fields.push(`label = $${i++}`);
      const lb = updates.label;
      values.push(lb.length > 512 ? lb.slice(0, 512) : lb);
    }
    if (updates.minBet !== undefined) {
      fields.push(`min_bet = $${i++}::NUMERIC`);
      values.push(updates.minBet.toString());
    }
    if (updates.maxBet !== undefined) {
      fields.push(`max_bet = $${i++}::NUMERIC`);
      values.push(updates.maxBet.toString());
    }
    if (updates.themeKind !== undefined) {
      fields.push(`theme_kind = $${i++}`);
      values.push(updates.themeKind);
    }
    if (updates.themeId !== undefined) {
      fields.push(`theme_id = $${i++}`);
      values.push(updates.themeId?.trim() || null);
    }
    if (updates.sortOrder !== undefined) {
      fields.push(`sort_order = $${i++}`);
      values.push(updates.sortOrder);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${i++}`);
      values.push(updates.enabled);
    }
    if (updates.slug !== undefined) {
      fields.push(`slug = $${i++}`);
      values.push(updates.slug?.trim() || null);
    }
    if (fields.length === 0) {
      return this.getBlackjackSpWagerTierById(id, false);
    }
    fields.push('updated_at = NOW()');
    values.push(id);
    const r = await this.pool.query(
      `UPDATE blackjack_sp_wager_tiers SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, label, min_bet::TEXT, max_bet::TEXT, theme_kind, theme_id, sort_order, enabled, slug, created_at, updated_at`,
      values,
    );
    if (r.rows.length === 0) return null;
    return this.mapBlackjackSpWagerTierRow(r.rows[0]);
  }

  async deleteBlackjackSpWagerTier(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM blackjack_sp_wager_tiers WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  // ── Contract daily snapshots ────────────────────────────────────────────────

  /** Upsert a snapshot for today. Called hourly by the snapshot scheduler. */
  async saveContractDailySnapshot(
    game: string,
    totalWagered: bigint,
    totalPayouts: bigint,
    contractReserve: bigint,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.pool.query(
      `INSERT INTO contract_daily_snapshots (snapshot_date, game, total_wagered, total_payouts, contract_reserve)
       VALUES ($1, $2, $3::NUMERIC, $4::NUMERIC, $5::NUMERIC)
       ON CONFLICT (snapshot_date, game) DO UPDATE SET
         total_wagered    = EXCLUDED.total_wagered,
         total_payouts    = EXCLUDED.total_payouts,
         contract_reserve = EXCLUDED.contract_reserve,
         captured_at      = NOW()`,
      [today, game, totalWagered.toString(), totalPayouts.toString(), contractReserve.toString()],
    );
  }

  /** Return snapshots for the last N days, oldest first. */
  async getContractDailySnapshots(days = 7): Promise<Array<{
    snapshot_date: string;
    game: string;
    total_wagered: string;
    total_payouts: string;
    contract_reserve: string;
  }>> {
    const result = await this.pool.query(
      `SELECT snapshot_date::TEXT, game,
              total_wagered::TEXT, total_payouts::TEXT, contract_reserve::TEXT
       FROM contract_daily_snapshots
       WHERE snapshot_date >= CURRENT_DATE - ($1 - 1) * INTERVAL '1 day'
       ORDER BY snapshot_date ASC, game ASC`,
      [days],
    );
    return result.rows;
  }

  /** Upsert one hourly snapshot (current hour bucket). Called by snapshot scheduler. */
  async saveContractHourlySnapshot(
    game: string,
    totalWagered: bigint,
    totalPayouts: bigint,
    contractReserve: bigint,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO contract_hourly_snapshots (snapshot_hour, game, total_wagered, total_payouts, contract_reserve)
       VALUES (date_trunc('hour', NOW()), $1, $2::NUMERIC, $3::NUMERIC, $4::NUMERIC)
       ON CONFLICT (snapshot_hour, game) DO UPDATE SET
         total_wagered    = EXCLUDED.total_wagered,
         total_payouts    = EXCLUDED.total_payouts,
         contract_reserve = EXCLUDED.contract_reserve,
         captured_at      = NOW()`,
      [game, totalWagered.toString(), totalPayouts.toString(), contractReserve.toString()],
    );
  }

  /** Prune hourly snapshots older than keepHours. */
  async pruneContractHourlySnapshots(keepHours = 48): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM contract_hourly_snapshots
       WHERE snapshot_hour < NOW() - make_interval(hours => $1::int)`,
      [keepHours],
    );
    return result.rowCount ?? 0;
  }

  /** Return hourly snapshots for the last N hours, oldest first. */
  async getContractHourlySnapshots(hours = 24): Promise<Array<{
    snapshot_hour: string;
    game: string;
    total_wagered: string;
    total_payouts: string;
    contract_reserve: string;
  }>> {
    const result = await this.pool.query(
      `SELECT snapshot_hour::TEXT, game,
              total_wagered::TEXT, total_payouts::TEXT, contract_reserve::TEXT
       FROM contract_hourly_snapshots
       WHERE snapshot_hour >= NOW() - make_interval(hours => $1::int)
       ORDER BY snapshot_hour ASC, game ASC`,
      [hours],
    );
    return result.rows;
  }

  // ── Poker player hands and stats ───────────────────────────────────────────

  /** Completed poker hands for a player (for history modal). */
  async getPokerPlayerHands(
    address: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Array<{
    id: string;
    table_id: string | null;
    tournament_id: string | null;
    tournament_name: string | null;
    hand_number: number;
    pot_amount: string;
    community_cards: number[];
    result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
    rakeAmount: string;
    completed_at: string;
    myContributed: string;
    myWon: string;
    resultType: 'win' | 'loss' | 'fold';
  }>> {
    const normalized = this.normalizeAddress(address);
    const query = `
      SELECT
        h.id,
        h.table_id,
        h.tournament_id,
        tour.name AS tournament_name,
        h.hand_number,
        h.pot_amount::TEXT,
        h.community_cards,
        h.result,
        h.rake_amount::TEXT AS rake_amount,
        h.completed_at AT TIME ZONE 'UTC' AS completed_at,
        p.contributed::TEXT AS my_contributed,
        p.won_amount::TEXT AS my_won,
        CASE
          WHEN p.won THEN 'win'
          WHEN p.folded THEN 'fold'
          ELSE 'loss'
        END AS result_type
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      LEFT JOIN tournaments tour ON tour.id = h.tournament_id
      WHERE LOWER(p.player_address) = LOWER($1)
        AND h.completed_at IS NOT NULL
      ORDER BY h.completed_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(query, [normalized, limit, offset]);
    return result.rows.map((r: any) => ({
      id: r.id,
      table_id: r.table_id ?? null,
      tournament_id: r.tournament_id ?? null,
      tournament_name: r.tournament_name ?? null,
      hand_number: r.hand_number,
      pot_amount: String(r.pot_amount ?? '0'),
      community_cards: Array.isArray(r.community_cards) ? r.community_cards : (r.community_cards ? JSON.parse(JSON.stringify(r.community_cards)) : []),
      result: r.result,
      rakeAmount: String(r.rake_amount ?? '0'),
      completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : '',
      myContributed: String(r.my_contributed ?? '0'),
      myWon: String(r.my_won ?? '0'),
      resultType: r.result_type as 'win' | 'loss' | 'fold',
    }));
  }

  /** Aggregate poker stats for a player (from completed hands). */
  async getPokerPlayerStats(address: string, scope: 'cash' | 'tournament' | 'all' = 'cash'): Promise<{
    total_hands: number;
    hands_won: number;
    win_rate: number;
    total_wagered: string;
    total_won: string;
    profit_loss: string;
    roi: number;
    current_streak: number;
    best_streak: number;
    biggest_pot_won: string;
    biggest_loss: string;
    // HUD 6
    vpip_pct: number;
    pfr_pct: number;
    three_bet_pct: number;
    wtsd_pct: number;
    wsd_pct: number;
    aggression_factor: number | null;
    // Add-ons
    bb_per_100: number | null;
    showdown_win_rate: number;
    non_showdown_win_rate: number;
    tournament_hands: number;
    position_win_rates: {
      button: { hands: number; win_rate: number };
      small_blind: { hands: number; win_rate: number };
      big_blind: { hands: number; win_rate: number };
      other: { hands: number; win_rate: number };
    };
    winning_hand_breakdown: Array<{ hand_name: string; count: number }>;
  }> {
    const normalized = this.normalizeAddress(address);
    const emptyResponse = {
      total_hands: 0,
      hands_won: 0,
      win_rate: 0,
      total_wagered: '0',
      total_won: '0',
      profit_loss: '0',
      roi: 0,
      current_streak: 0,
      best_streak: 0,
      biggest_pot_won: '0',
      biggest_loss: '0',
      vpip_pct: 0,
      pfr_pct: 0,
      three_bet_pct: 0,
      wtsd_pct: 0,
      wsd_pct: 0,
      aggression_factor: null,
      bb_per_100: null,
      showdown_win_rate: 0,
      non_showdown_win_rate: 0,
      tournament_hands: 0,
      position_win_rates: {
        button: { hands: 0, win_rate: 0 },
        small_blind: { hands: 0, win_rate: 0 },
        big_blind: { hands: 0, win_rate: 0 },
        other: { hands: 0, win_rate: 0 },
      },
      winning_hand_breakdown: [],
    };

    const scopeFilter =
      scope === 'cash' ? 'AND h.tournament_id IS NULL'
      : scope === 'tournament' ? 'AND h.tournament_id IS NOT NULL'
      : '';

    // Single aggregate over selected scope covering every scalar metric.
    const aggQuery = `
      SELECT
        COUNT(*)::INT AS total_hands,
        COUNT(*) FILTER (WHERE p.won)::INT AS hands_won,
        COALESCE(SUM(p.contributed), 0)::TEXT AS total_wagered,
        COALESCE(SUM(p.won_amount), 0)::TEXT AS total_won,
        COALESCE(MAX(p.won_amount) FILTER (WHERE p.won), 0)::TEXT AS biggest_pot_won,
        COALESCE(MAX(p.contributed) FILTER (WHERE NOT p.won), 0)::TEXT AS biggest_loss,
        COUNT(*) FILTER (WHERE p.vpip)::INT AS vpip_count,
        COUNT(*) FILTER (WHERE p.pfr)::INT AS pfr_count,
        COUNT(*) FILTER (WHERE p.three_bet)::INT AS three_bet_count,
        COUNT(*) FILTER (WHERE p.saw_flop)::INT AS saw_flop_count,
        COUNT(*) FILTER (WHERE p.saw_showdown)::INT AS saw_showdown_count,
        COUNT(*) FILTER (WHERE p.saw_showdown AND p.won)::INT AS showdown_wins,
        COUNT(*) FILTER (WHERE p.won AND NOT p.saw_showdown)::INT AS non_showdown_wins,
        COALESCE(SUM(
          p.preflop_bets + p.preflop_raises + p.flop_bets + p.flop_raises +
          p.turn_bets + p.turn_raises + p.river_bets + p.river_raises
        ), 0)::INT AS total_bets_raises,
        COALESCE(SUM(
          p.preflop_calls + p.flop_calls + p.turn_calls + p.river_calls
        ), 0)::INT AS total_calls,
        -- BB/100: use table.big_blind averaged; profit in chips / avg_bb / hands * 100.
        COALESCE(AVG(t.big_blind)::NUMERIC, 0)::TEXT AS avg_big_blind,
        -- Positional splits
        COUNT(*) FILTER (WHERE p.is_button)::INT AS button_hands,
        COUNT(*) FILTER (WHERE p.is_button AND p.won)::INT AS button_wins,
        COUNT(*) FILTER (WHERE p.is_small_blind)::INT AS sb_hands,
        COUNT(*) FILTER (WHERE p.is_small_blind AND p.won)::INT AS sb_wins,
        COUNT(*) FILTER (WHERE p.is_big_blind)::INT AS bb_hands,
        COUNT(*) FILTER (WHERE p.is_big_blind AND p.won)::INT AS bb_wins,
        COUNT(*) FILTER (WHERE NOT p.is_button AND NOT p.is_small_blind AND NOT p.is_big_blind)::INT AS other_hands,
        COUNT(*) FILTER (WHERE NOT p.is_button AND NOT p.is_small_blind AND NOT p.is_big_blind AND p.won)::INT AS other_wins
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      LEFT JOIN poker_tables t ON t.id = h.table_id
      WHERE LOWER(p.player_address) = LOWER($1)
        AND h.completed_at IS NOT NULL
        ${scopeFilter}
    `;
    const aggResult = await this.pool.query(aggQuery, [normalized]);
    const row = aggResult.rows[0];
    if (!row || Number(row.total_hands) === 0) return emptyResponse;

    const totalHands = Number(row.total_hands);
    const handsWon = Number(row.hands_won);
    const totalWagered = BigInt(row.total_wagered ?? '0');
    const totalWon = BigInt(row.total_won ?? '0');
    const profitLoss = totalWon - totalWagered;
    const roi = totalWagered > 0n ? Number((profitLoss * 10000n) / totalWagered) / 100 : 0;
    const pct = (num: number, denom: number) => (denom > 0 ? (num / denom) * 100 : 0);

    const totalBetsRaises = Number(row.total_bets_raises);
    const totalCalls = Number(row.total_calls);
    const aggressionFactor = totalCalls > 0 ? totalBetsRaises / totalCalls : null;

    const avgBigBlind = Number(row.avg_big_blind ?? 0);
    const bbPer100 = avgBigBlind > 0 && totalHands > 0
      ? (Number(profitLoss) / avgBigBlind) / totalHands * 100
      : null;

    const sawFlopCount = Number(row.saw_flop_count);
    const sawShowdownCount = Number(row.saw_showdown_count);
    const showdownWins = Number(row.showdown_wins);
    const nonShowdownWins = Number(row.non_showdown_wins);

    // Tournament hand count (fast COUNT)
    const tournamentHandsRes = await this.pool.query(
      `SELECT COUNT(*)::INT AS n
         FROM poker_hand_players p
         JOIN poker_hands h ON h.id = p.hand_id
        WHERE LOWER(p.player_address) = LOWER($1)
          AND h.completed_at IS NOT NULL
          AND h.tournament_id IS NOT NULL`,
      [normalized]
    );
    const tournamentHands = Number(tournamentHandsRes.rows[0]?.n ?? 0);

    // Winning hand breakdown, same scope as primary stats
    const breakdownRes = await this.pool.query(
      `SELECT p.hand_name, COUNT(*)::INT AS count
         FROM poker_hand_players p
         JOIN poker_hands h ON h.id = p.hand_id
        WHERE LOWER(p.player_address) = LOWER($1)
          AND h.completed_at IS NOT NULL
          ${scopeFilter}
          AND p.won
          AND p.hand_name IS NOT NULL
        GROUP BY p.hand_name
        ORDER BY count DESC`,
      [normalized]
    );
    const winningHandBreakdown = breakdownRes.rows.map((r: any) => ({
      hand_name: String(r.hand_name),
      count: Number(r.count),
    }));

    // Ordered outcomes for streaks (same scope)
    const orderedQuery = `
      SELECT
        CASE
          WHEN p.won THEN 1
          WHEN p.folded THEN 0
          ELSE -1
        END AS outcome
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      WHERE LOWER(p.player_address) = LOWER($1)
        AND h.completed_at IS NOT NULL
        ${scopeFilter}
      ORDER BY h.completed_at DESC
    `;
    const orderedResult = await this.pool.query(orderedQuery, [normalized]);
    const outcomes = orderedResult.rows.map((r: any) => Number(r.outcome));
    let currentStreak = 0;
    let bestStreak = 0;
    let run = 0;
    for (const outcome of outcomes) {
      if (outcome === 1) {
        run = run >= 0 ? run + 1 : 1;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = run <= 0 ? run - 1 : -1;
      }
    }
    currentStreak = run;

    const buttonHands = Number(row.button_hands);
    const sbHands = Number(row.sb_hands);
    const bbHands = Number(row.bb_hands);
    const otherHands = Number(row.other_hands);

    return {
      total_hands: totalHands,
      hands_won: handsWon,
      win_rate: pct(handsWon, totalHands),
      total_wagered: totalWagered.toString(),
      total_won: totalWon.toString(),
      profit_loss: profitLoss.toString(),
      roi,
      current_streak: currentStreak,
      best_streak: bestStreak,
      biggest_pot_won: String(row.biggest_pot_won ?? '0'),
      biggest_loss: String(row.biggest_loss ?? '0'),
      vpip_pct: pct(Number(row.vpip_count), totalHands),
      pfr_pct: pct(Number(row.pfr_count), totalHands),
      three_bet_pct: pct(Number(row.three_bet_count), totalHands),
      wtsd_pct: pct(sawShowdownCount, sawFlopCount),
      wsd_pct: pct(showdownWins, sawShowdownCount),
      aggression_factor: aggressionFactor,
      bb_per_100: bbPer100,
      showdown_win_rate: pct(showdownWins, sawShowdownCount),
      non_showdown_win_rate: pct(nonShowdownWins, totalHands),
      tournament_hands: tournamentHands,
      position_win_rates: {
        button: { hands: buttonHands, win_rate: pct(Number(row.button_wins), buttonHands) },
        small_blind: { hands: sbHands, win_rate: pct(Number(row.sb_wins), sbHands) },
        big_blind: { hands: bbHands, win_rate: pct(Number(row.bb_wins), bbHands) },
        other: { hands: otherHands, win_rate: pct(Number(row.other_wins), otherHands) },
      },
      winning_hand_breakdown: winningHandBreakdown,
    };
  }

  /** Aggregate poker stats for a player at a specific table (from completed hands). */
  async getPokerPlayerTableStats(
    tableId: string,
    address: string
  ): Promise<{
    total_hands: number;
    hands_won: number;
    win_rate: number;
    total_wagered: string;
    total_won: string;
    profit_loss: string;
    roi: number;
    current_streak: number;
    best_streak: number;
    biggest_pot_won: string;
    biggest_loss: string;
    hands_history: Array<{
      hand_number: number;
      completed_at: string;
      my_contributed: string;
      my_won: string;
      result_type: 'win' | 'loss' | 'fold';
    }>;
  }> {
    const normalized = this.normalizeAddress(address);
    const aggQuery = `
      SELECT
        COUNT(*)::INT AS total_hands,
        COUNT(*) FILTER (WHERE p.won)::INT AS hands_won,
        COALESCE(SUM(p.contributed), 0)::TEXT AS total_wagered,
        COALESCE(SUM(p.won_amount), 0)::TEXT AS total_won,
        COALESCE(MAX(p.won_amount) FILTER (WHERE p.won), 0)::TEXT AS biggest_pot_won,
        COALESCE(MAX(p.contributed) FILTER (WHERE NOT p.won), 0)::TEXT AS biggest_loss
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      WHERE LOWER(p.player_address) = LOWER($1)
        AND h.completed_at IS NOT NULL
        AND h.table_id = $2
    `;
    const aggResult = await this.pool.query(aggQuery, [normalized, tableId]);
    const row = aggResult.rows[0];
    if (!row || Number(row.total_hands) === 0) {
      return {
        total_hands: 0, hands_won: 0, win_rate: 0,
        total_wagered: '0', total_won: '0', profit_loss: '0',
        roi: 0, current_streak: 0, best_streak: 0,
        biggest_pot_won: '0', biggest_loss: '0', hands_history: [],
      };
    }
    const totalHands = Number(row.total_hands);
    const handsWon = Number(row.hands_won);
    const totalWagered = BigInt(row.total_wagered ?? '0');
    const totalWon = BigInt(row.total_won ?? '0');
    const profitLoss = totalWon - totalWagered;
    const roi = totalWagered > 0n ? Number((profitLoss * 10000n) / totalWagered) / 100 : 0;
    // Fetch ordered outcomes for streak + chart data in one query
    const orderedQuery = `
      SELECT
        h.hand_number,
        h.completed_at,
        p.contributed::TEXT AS my_contributed,
        p.won_amount::TEXT AS my_won,
        CASE
          WHEN p.won THEN 'win'
          WHEN p.folded THEN 'fold'
          ELSE 'loss'
        END AS result_type
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      WHERE LOWER(p.player_address) = LOWER($1)
        AND h.completed_at IS NOT NULL
        AND h.table_id = $2
      ORDER BY h.completed_at ASC
    `;
    const orderedResult = await this.pool.query(orderedQuery, [normalized, tableId]);
    const handsHistory = orderedResult.rows.map((r: any) => ({
      hand_number: r.hand_number,
      completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : '',
      my_contributed: String(r.my_contributed ?? '0'),
      my_won: String(r.my_won ?? '0'),
      result_type: r.result_type as 'win' | 'loss' | 'fold',
    }));
    // Compute streaks from chronological order (reversed for current streak)
    let currentStreak = 0;
    let bestStreak = 0;
    let run = 0;
    const reversed = [...handsHistory].reverse();
    for (const h of reversed) {
      const outcome = h.result_type === 'win' ? 1 : -1;
      if (outcome === 1) {
        run = run >= 0 ? run + 1 : 1;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = run <= 0 ? run - 1 : -1;
      }
    }
    currentStreak = run;
    return {
      total_hands: totalHands,
      hands_won: handsWon,
      win_rate: totalHands > 0 ? (handsWon / totalHands) * 100 : 0,
      total_wagered: totalWagered.toString(),
      total_won: totalWon.toString(),
      profit_loss: profitLoss.toString(),
      roi,
      current_streak: currentStreak,
      best_streak: bestStreak,
      biggest_pot_won: String(row.biggest_pot_won ?? '0'),
      biggest_loss: String(row.biggest_loss ?? '0'),
      hands_history: handsHistory,
    };
  }

  /** Single hand detail for replay (actions + hole cards for requesting player). */
  async getPokerHandDetail(
    handId: string,
    playerAddress: string
  ): Promise<{
    id: string;
    table_id: string | null;
    tournament_id: string | null;
    tournament_name: string | null;
    hand_number: number;
    pot_amount: string;
    community_cards: number[];
    result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
    completed_at: string;
    actions: Array<{ street: string; player_address: string; action: string; amount: string }>;
    holeCards: number[] | null;
  } | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const handResult = await this.pool.query(
      `SELECT h.id, h.table_id, h.tournament_id, tour.name AS tournament_name, h.hand_number,
              h.pot_amount::TEXT, h.community_cards, h.result, h.completed_at
       FROM poker_hands h
       LEFT JOIN tournaments tour ON tour.id = h.tournament_id
       WHERE h.id = $1 AND h.completed_at IS NOT NULL`,
      [handId]
    );
    if (handResult.rows.length === 0) return null;
    const h = handResult.rows[0];
    const actionsResult = await this.pool.query(
      `SELECT street, player_address, action, amount::TEXT AS amount
       FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order" ASC`,
      [handId]
    );
    const holeResult = await this.pool.query(
      `SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND LOWER(player_address) = LOWER($2)`,
      [handId, normalized]
    );
    const holeCards = holeResult.rows.length > 0 && holeResult.rows[0].cards != null
      ? (Array.isArray(holeResult.rows[0].cards) ? holeResult.rows[0].cards : JSON.parse(JSON.stringify(holeResult.rows[0].cards)))
      : null;
    const communityCards = Array.isArray(h.community_cards) ? h.community_cards : (h.community_cards ? JSON.parse(JSON.stringify(h.community_cards)) : []);
    return {
      id: h.id,
      table_id: h.table_id ?? null,
      tournament_id: h.tournament_id ?? null,
      tournament_name: h.tournament_name ?? null,
      hand_number: h.hand_number,
      pot_amount: String(h.pot_amount ?? '0'),
      community_cards: communityCards,
      result: h.result,
      completed_at: h.completed_at ? new Date(h.completed_at).toISOString() : '',
      actions: actionsResult.rows.map((r: any) => ({
        street: r.street,
        player_address: r.player_address,
        action: r.action,
        amount: String(r.amount ?? '0'),
      })),
      holeCards,
    };
  }

  // ── Poker lobby aggregates (House Records + Top Players) ─────────────────

  async getPokerHouseRecords(): Promise<{
    hands_dealt: number;
    largest_pot: { amount: string; hand_id: string | null };
    tournaments_played: number;
    total_rake: string;
  }> {
    const [handsRes, potRes, tourRes, rakeRes] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*)::BIGINT AS n
           FROM poker_hands
          WHERE completed_at IS NOT NULL`
      ),
      this.pool.query(
        `SELECT id, pot_amount::TEXT AS amount
           FROM poker_hands
          WHERE completed_at IS NOT NULL
          ORDER BY pot_amount DESC NULLS LAST
          LIMIT 1`
      ),
      this.pool.query(
        `SELECT COUNT(*)::BIGINT AS n
           FROM tournaments
          WHERE game_type = 'poker' AND status = 'completed'`
      ),
      this.pool.query(
        `SELECT COALESCE(SUM(rake_paid), 0)::TEXT AS total
           FROM poker_hand_players`
      ),
    ]);

    const potRow = potRes.rows[0];
    return {
      hands_dealt: Number(handsRes.rows[0]?.n ?? 0),
      largest_pot: {
        amount: String(potRow?.amount ?? '0'),
        hand_id: potRow?.id ?? null,
      },
      tournaments_played: Number(tourRes.rows[0]?.n ?? 0),
      total_rake: String(rakeRes.rows[0]?.total ?? '0'),
    };
  }

  async getPokerTopPlayers(
    category: 'net_chips' | 'biggest_pot' | 'hands_played',
    limit: number,
    requesterAddress?: string | null
  ): Promise<{
    category: 'net_chips' | 'biggest_pot' | 'hands_played';
    rows: Array<{ rank: number; address: string; net_chips: string; biggest_pot: string; hands_played: number }>;
    requester: { rank: number; address: string; net_chips: string; biggest_pot: string; hands_played: number } | null;
  }> {
    const safeLimit = Math.min(Math.max(limit | 0, 1), 100);
    const orderClause =
      category === 'net_chips' ? 'net_chips DESC'
      : category === 'biggest_pot' ? 'biggest_pot DESC'
      : 'hands_played DESC';

    const baseSelect = `
      SELECT
        LOWER(p.player_address) AS address,
        COALESCE(SUM(p.won_amount - p.contributed), 0)::TEXT AS net_chips,
        COALESCE(MAX(p.won_amount) FILTER (WHERE p.won), 0)::TEXT AS biggest_pot,
        COUNT(*)::INT AS hands_played
      FROM poker_hand_players p
      JOIN poker_hands h ON h.id = p.hand_id
      WHERE h.completed_at IS NOT NULL
      GROUP BY LOWER(p.player_address)
    `;

    const topResult = await this.pool.query(
      `${baseSelect} ORDER BY ${orderClause} LIMIT $1`,
      [safeLimit]
    );
    const rows = topResult.rows.map((r: any, idx: number) => ({
      rank: idx + 1,
      address: String(r.address),
      net_chips: String(r.net_chips ?? '0'),
      biggest_pot: String(r.biggest_pot ?? '0'),
      hands_played: Number(r.hands_played ?? 0),
    }));

    let requester: typeof rows[number] | null = null;
    if (requesterAddress) {
      const normalized = this.normalizeAddress(requesterAddress);
      const inTopN = rows.find((r) => r.address === normalized);
      if (!inTopN) {
        const rankResult = await this.pool.query(
          `
          WITH agg AS (${baseSelect})
          SELECT *, (
            SELECT COUNT(*) + 1
              FROM agg b
             WHERE
               CASE
                 WHEN $1::text = 'net_chips' THEN b.net_chips::NUMERIC > a.net_chips::NUMERIC
                 WHEN $1::text = 'biggest_pot' THEN b.biggest_pot::NUMERIC > a.biggest_pot::NUMERIC
                 ELSE b.hands_played > a.hands_played
               END
          )::INT AS rank
            FROM agg a
           WHERE a.address = $2
           LIMIT 1
          `,
          [category, normalized]
        );
        const row = rankResult.rows[0];
        if (row) {
          requester = {
            rank: Number(row.rank),
            address: String(row.address),
            net_chips: String(row.net_chips ?? '0'),
            biggest_pot: String(row.biggest_pot ?? '0'),
            hands_played: Number(row.hands_played ?? 0),
          };
        }
      }
    }

    return { category, rows, requester };
  }

  // ── Poker table-level dashboard stats (admin) ─────────────────────────────

  async getPokerTableDashboardStats(tableId: string): Promise<{
    table: { id: string; small_blind: string; big_blind: string; max_seats: number; hand_number: number; created_at: string } | null;
    seats: Array<{ position: number; player_address: string; stack: string; status: string; joined_at: string }>;
    stats: {
      total_hands: number;
      total_rake: string;
      total_pot_volume: string;
      avg_pot: string;
      avg_hand_duration_seconds: number;
      biggest_pot: string;
      hands_today: number;
      hands_this_hour: number;
    };
    player_stats: Array<{
      player_address: string;
      hands_played: number;
      hands_won: number;
      total_wagered: string;
      total_won: string;
      net_pnl: string;
      vpip_pct: number;
    }>;
    recent_hands: Array<{
      id: string;
      hand_number: number;
      pot_amount: string;
      rake_amount: string;
      street: string;
      community_cards: number[];
      result: any;
      completed_at: string;
      duration_seconds: number;
      player_count: number;
    }>;
  }> {
    // Table info
    const tableResult = await this.pool.query(
      `SELECT id, small_blind::TEXT, big_blind::TEXT, max_seats, hand_number,
              created_at AT TIME ZONE 'UTC' AS created_at
       FROM poker_tables WHERE id = $1`, [tableId]
    );
    if (tableResult.rows.length === 0) {
      return { table: null, seats: [], stats: { total_hands: 0, total_rake: '0', total_pot_volume: '0', avg_pot: '0', avg_hand_duration_seconds: 0, biggest_pot: '0', hands_today: 0, hands_this_hour: 0 }, player_stats: [], recent_hands: [] };
    }
    const table = tableResult.rows[0];

    // Current seats
    const seatsResult = await this.pool.query(
      `SELECT position, player_address, stack::TEXT, status,
              joined_at AT TIME ZONE 'UTC' AS joined_at
       FROM poker_seats WHERE table_id = $1 ORDER BY position`, [tableId]
    );

    // Aggregate stats
    const aggResult = await this.pool.query(`
      SELECT
        COUNT(*)::INT AS total_hands,
        COALESCE(SUM(rake_amount), 0)::TEXT AS total_rake,
        COALESCE(SUM(pot_amount), 0)::TEXT AS total_pot_volume,
        COALESCE(AVG(pot_amount), 0)::TEXT AS avg_pot,
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))), 0)::FLOAT AS avg_hand_duration_seconds,
        COALESCE(MAX(pot_amount), 0)::TEXT AS biggest_pot,
        COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '1 day')::INT AS hands_today,
        COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '1 hour')::INT AS hands_this_hour
      FROM poker_hands
      WHERE table_id = $1 AND completed_at IS NOT NULL
    `, [tableId]);
    const agg = aggResult.rows[0];

    // Per-player stats at this table
    const playerStatsResult = await this.pool.query(`
      WITH hand_players AS (
        SELECT DISTINCT a.player_address, a.hand_id
        FROM poker_hand_actions a
        INNER JOIN poker_hands h ON h.id = a.hand_id
        WHERE h.table_id = $1 AND h.completed_at IS NOT NULL
      ),
      player_agg AS (
        SELECT
          hp.player_address,
          COUNT(DISTINCT hp.hand_id)::INT AS hands_played,
          COUNT(DISTINCT hp.hand_id) FILTER (WHERE (
            SELECT COALESCE(SUM((w->>'amount')::numeric), 0)
            FROM jsonb_array_elements(COALESCE(h.result->'winners', '[]'::jsonb)) w
            WHERE LOWER(w->>'address') = LOWER(hp.player_address)
          ) > 0)::INT AS hands_won,
          COALESCE(SUM(a_sum.total_wagered), 0)::TEXT AS total_wagered,
          COALESCE(SUM(
            (SELECT COALESCE(SUM((w->>'amount')::numeric), 0)
             FROM jsonb_array_elements(COALESCE(h.result->'winners', '[]'::jsonb)) w
             WHERE LOWER(w->>'address') = LOWER(hp.player_address))
          ), 0)::TEXT AS total_won,
          COUNT(DISTINCT hp.hand_id) FILTER (WHERE EXISTS (
            SELECT 1 FROM poker_hand_actions vp
            WHERE vp.hand_id = hp.hand_id
              AND LOWER(vp.player_address) = LOWER(hp.player_address)
              AND vp.action IN ('call', 'bet', 'raise')
              AND (vp.blind_type IS NULL OR vp.blind_type = '')
          ))::INT AS vpip_hands
        FROM hand_players hp
        INNER JOIN poker_hands h ON h.id = hp.hand_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(amount), 0) AS total_wagered
          FROM poker_hand_actions
          WHERE hand_id = hp.hand_id AND LOWER(player_address) = LOWER(hp.player_address)
        ) a_sum ON TRUE
        GROUP BY hp.player_address
      )
      SELECT
        player_address,
        hands_played,
        hands_won,
        total_wagered,
        total_won,
        (total_won::numeric - total_wagered::numeric)::TEXT AS net_pnl,
        CASE WHEN hands_played > 0 THEN ROUND(vpip_hands::numeric / hands_played * 100, 1)::FLOAT ELSE 0 END AS vpip_pct
      FROM player_agg
      ORDER BY hands_played DESC
    `, [tableId]);

    // Recent hands (last 50)
    const recentResult = await this.pool.query(`
      SELECT
        h.id,
        h.hand_number,
        h.pot_amount::TEXT,
        h.rake_amount::TEXT AS rake_amount,
        h.street,
        h.community_cards,
        h.result,
        h.completed_at AT TIME ZONE 'UTC' AS completed_at,
        EXTRACT(EPOCH FROM (h.completed_at - h.created_at))::INT AS duration_seconds,
        (SELECT COUNT(DISTINCT player_address)::INT FROM poker_hand_actions WHERE hand_id = h.id) AS player_count
      FROM poker_hands h
      WHERE h.table_id = $1 AND h.completed_at IS NOT NULL
      ORDER BY h.completed_at DESC
      LIMIT 50
    `, [tableId]);

    return {
      table: {
        id: table.id,
        small_blind: table.small_blind,
        big_blind: table.big_blind,
        max_seats: table.max_seats,
        hand_number: table.hand_number,
        created_at: new Date(table.created_at).toISOString(),
      },
      seats: seatsResult.rows.map((r: any) => ({
        position: r.position,
        player_address: r.player_address,
        stack: r.stack,
        status: r.status,
        joined_at: new Date(r.joined_at).toISOString(),
      })),
      stats: {
        total_hands: Number(agg.total_hands),
        total_rake: String(agg.total_rake),
        total_pot_volume: String(agg.total_pot_volume),
        avg_pot: String(agg.avg_pot),
        avg_hand_duration_seconds: Number(agg.avg_hand_duration_seconds),
        biggest_pot: String(agg.biggest_pot),
        hands_today: Number(agg.hands_today),
        hands_this_hour: Number(agg.hands_this_hour),
      },
      player_stats: playerStatsResult.rows.map((r: any) => ({
        player_address: r.player_address,
        hands_played: r.hands_played,
        hands_won: r.hands_won,
        total_wagered: r.total_wagered,
        total_won: r.total_won,
        net_pnl: r.net_pnl,
        vpip_pct: Number(r.vpip_pct),
      })),
      recent_hands: recentResult.rows.map((r: any) => ({
        id: r.id,
        hand_number: r.hand_number,
        pot_amount: String(r.pot_amount),
        rake_amount: String(r.rake_amount ?? '0'),
        street: r.street,
        community_cards: Array.isArray(r.community_cards) ? r.community_cards : [],
        result: r.result,
        completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : '',
        duration_seconds: Number(r.duration_seconds ?? 0),
        player_count: Number(r.player_count),
      })),
    };
  }

  // ── Follow system ──────────────────────────────────────────────────────────

  async followPlayer(followerAddress: string, followingAddress: string): Promise<void> {
    const follower  = followerAddress.toLowerCase();
    const following = followingAddress.toLowerCase();
    if (follower === following) throw new Error('Cannot follow yourself');
    await this.pool.query(
      `INSERT INTO player_follows (follower_address, following_address)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [follower, following],
    );
  }

  async unfollowPlayer(followerAddress: string, followingAddress: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM player_follows
       WHERE LOWER(follower_address) = LOWER($1)
         AND LOWER(following_address) = LOWER($2)`,
      [followerAddress, followingAddress],
    );
  }

  async isFollowing(followerAddress: string, followingAddress: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM player_follows
       WHERE LOWER(follower_address) = LOWER($1)
         AND LOWER(following_address) = LOWER($2)`,
      [followerAddress, followingAddress],
    );
    return result.rowCount! > 0;
  }

  async getFollowCounts(address: string): Promise<{ followerCount: number; followingCount: number }> {
    const result = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM player_follows WHERE LOWER(following_address) = LOWER($1)) AS follower_count,
         (SELECT COUNT(*) FROM player_follows WHERE LOWER(follower_address)  = LOWER($1)) AS following_count`,
      [address],
    );
    return {
      followerCount:  Number(result.rows[0]?.follower_count  ?? 0),
      followingCount: Number(result.rows[0]?.following_count ?? 0),
    };
  }

  async getFollowers(address: string, limit = 50, offset = 0): Promise<Array<{ address: string; displayName: string | null; avatarConfig: Record<string, unknown> | null }>> {
    const result = await this.pool.query(
      `SELECT pf.follower_address AS address,
              cdn.display_name,
              cdn.avatar_config
       FROM player_follows pf
       LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(pf.follower_address)
       WHERE LOWER(pf.following_address) = LOWER($1)
       ORDER BY pf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset],
    );
    return result.rows.map((r: any) => ({
      address:     r.address,
      displayName: r.display_name ?? null,
      avatarConfig: r.avatar_config ?? null,
    }));
  }

  async getFollowing(address: string, limit = 50, offset = 0): Promise<Array<{ address: string; displayName: string | null; avatarConfig: Record<string, unknown> | null }>> {
    const result = await this.pool.query(
      `SELECT pf.following_address AS address,
              cdn.display_name,
              cdn.avatar_config
       FROM player_follows pf
       LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(pf.following_address)
       WHERE LOWER(pf.follower_address) = LOWER($1)
       ORDER BY pf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset],
    );
    return result.rows.map((r: any) => ({
      address:     r.address,
      displayName: r.display_name ?? null,
      avatarConfig: r.avatar_config ?? null,
    }));
  }
}