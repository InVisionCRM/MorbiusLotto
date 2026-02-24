import { Pool } from 'pg';
export interface Player {
    id: string;
    wallet_address: string;
    balance: bigint;
    created_at: Date;
    updated_at: Date;
    last_seen: Date;
}
export interface GameSession {
    id: string;
    player_id: string;
    server_seed?: string;
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
export declare class DatabaseService {
    private pool;
    /**
     * Get the underlying connection pool (for use by other services)
     */
    getPool(): Pool;
    constructor();
    private toBigInt;
    private normalizePlayer;
    private normalizeSession;
    private normalizeGame;
    private normalizeGameHand;
    private normalizePlayerStats;
    private normalizeEnhancedPlayerStats;
    private normalizeGlobalAnalytics;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private normalizeAddress;
    getOrCreatePlayer(walletAddress: string): Promise<Player>;
    updatePlayerLastSeen(playerId: string): Promise<void>;
    getPlayerBalance(walletAddress: string): Promise<bigint>;
    updatePlayerBalance(walletAddress: string, amount: bigint, operation: 'add' | 'subtract' | 'set'): Promise<bigint>;
    deductPlayerBalance(walletAddress: string, amount: bigint): Promise<bigint>;
    addPlayerBalance(walletAddress: string, amount: bigint): Promise<bigint>;
    /** Credit an address (e.g. fee wallet). Upserts a player row if missing. */
    addBalanceToAddress(walletAddress: string, amount: bigint): Promise<void>;
    getActivePendingWithdrawal(walletAddress: string): Promise<{
        nonce: string;
        amount: string;
    } | null>;
    createPendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<void>;
    /**
     * Atomically deduct the player's balance AND create the pending withdrawal record in a single
     * transaction. If either step fails, both are rolled back — preventing permanent balance loss
     * from a partial failure between the two operations.
     *
     * Returns the remaining balance after deduction.
     * Throws if the player has insufficient balance (same as deductPlayerBalance).
     */
    deductAndCreatePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<bigint>;
    /**
     * Mark a pending withdrawal as completed after the user has successfully completed the on-chain tx.
     * Prevents the expiry cron from refunding the amount (double-credit). Idempotent: safe to call if already completed.
     */
    markPendingWithdrawalCompleted(walletAddress: string, nonce: bigint, txHash?: string): Promise<boolean>;
    /** Get stored Blackjack platform totals (deposit/withdraw). Used by chain-analytics for derived totals. */
    getBlackjackPlatformTotals(): Promise<{
        totalDeposited: bigint;
        totalWithdrawn: bigint;
        lastScannedBlock: bigint | null;
    } | null>;
    /** Update Blackjack platform totals (after full or incremental chain scan). */
    updateBlackjackPlatformTotals(totalDeposited: bigint, totalWithdrawn: bigint, lastScannedBlock: bigint | null): Promise<void>;
    /** Add amount to stored total_withdrawn when a pending withdrawal is created. */
    addToBlackjackWithdrawnTotal(amount: bigint): Promise<void>;
    expirePendingWithdrawals(): Promise<number>;
    /** Expire all pending withdrawals for a wallet (any age). Only used by cron — NOT on prepare (would allow double withdrawal). */
    expirePendingWithdrawalsForWallet(walletAddress: string): Promise<number>;
    syncPlayerBalanceWithContract(walletAddress: string, contractBalance: bigint): Promise<void>;
    /**
     * Check whether a player has any in-progress (non-completed) blackjack games.
     * Used to guard balance resets during contract upgrades.
     */
    hasActiveGames(walletAddress: string): Promise<boolean>;
    getPlayerStats(walletAddress: string): Promise<PlayerStats>;
    getPlayerStatsEnhanced(walletAddress: string): Promise<EnhancedPlayerStats>;
    getGlobalAnalytics(): Promise<GlobalAnalytics>;
    getTopPlayers(limit?: number): Promise<TopPlayerEntry[]>;
    private normalizeTopPlayerEntry;
    getTopPlayersByCategory(category: 'games' | 'profit_loss' | 'wagered' | 'win_rate' | 'total_won' | 'win_streak'): Promise<Array<{
        wallet_address: string;
        display_name?: string;
        profile_image_url?: string | null;
        value: string;
        label: string;
        created_at?: Date;
    }>>;
    getPlayerGames(walletAddress: string, limit?: number, offset?: number): Promise<Game[]>;
    createGameSession(playerId: string, serverSeed: string, serverSeedHash: string): Promise<GameSession>;
    getActiveSession(playerId: string): Promise<GameSession | null>;
    getSessionById(sessionId: string): Promise<GameSession | null>;
    getPlayerAddressFromSession(sessionId: string): Promise<string>;
    updateSessionStats(sessionId: string, betAmount: bigint, winAmount: bigint, incrementGameCount?: boolean): Promise<void>;
    endSession(sessionId: string): Promise<void>;
    setSessionServerSeed(sessionId: string, serverSeed: string, serverSeedHash: string): Promise<void>;
    createGame(sessionId: string, gameData: Partial<Game>): Promise<Game>;
    createGameHand(gameId: string, handData: Partial<GameHand>): Promise<GameHand>;
    updateGameHand(handId: string, updates: Partial<GameHand>): Promise<void>;
    getGameHands(gameId: string): Promise<GameHand[]>;
    updateGame(gameId: string, updates: Partial<Game>): Promise<void>;
    getGame(gameId: string): Promise<Game | null>;
    getSessionGames(sessionId: string): Promise<Game[]>;
    revealServerSeed(gameId: string, serverSeedHash: string, serverSeed: string): Promise<void>;
    getSeedReveal(gameId: string): Promise<{
        server_seed_hash: string;
        server_seed: string;
    } | null>;
    addActiveConnection(playerId: string, connectionId: string): Promise<void>;
    removeActiveConnection(connectionId: string): Promise<void>;
    updateConnectionPing(connectionId: string): Promise<void>;
    cleanupOldConnections(): Promise<number>;
    insertChatMessage(roomId: string, senderAddress: string | null, text: string): Promise<ChatMessage>;
    getRecentChatMessages(roomId: string, limit?: number): Promise<ChatMessage[]>;
    /** Admin: recent messages including soft-deleted (for moderation UI). */
    getRecentChatMessagesForAdmin(roomId: string, limit?: number): Promise<ChatMessage[]>;
    /** Admin: messages older than beforeId (including deleted), for pagination. */
    getChatMessagesBeforeForAdmin(roomId: string, beforeId: string, limit?: number): Promise<ChatMessage[]>;
    /** Admin: soft-delete a chat message. Returns room_id if message existed and was not already deleted. */
    deleteChatMessage(messageId: string, deletedByAddress: string): Promise<string | null>;
    /** Messages older than the message with id beforeId, in chronological order (oldest first). */
    getChatMessagesBefore(roomId: string, beforeId: string, limit?: number): Promise<ChatMessage[]>;
    getDisplayName(walletAddress: string): Promise<string | null>;
    getProfile(walletAddress: string): Promise<{
        displayName: string;
        profileImageUrl: string | null;
    } | null>;
    setDisplayName(walletAddress: string, displayName: string, profileImageUrl?: string | null): Promise<void>;
    getDisplayNames(walletAddresses: string[]): Promise<Map<string, string>>;
    getBlockedAddresses(): Promise<string[]>;
    isAddressBlocked(walletAddress: string): Promise<boolean>;
    addBlockedAddress(walletAddress: string): Promise<void>;
    removeBlockedAddress(walletAddress: string): Promise<void>;
    createReport(data: {
        walletAddress?: string;
        category: string;
        description: string;
        pageUrl?: string;
        userAgent?: string;
        balanceSnapshot?: bigint;
        recentErrors?: unknown[];
    }): Promise<string>;
    getReports(status?: string, limit?: number): Promise<{
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
    }[]>;
    updateReportStatus(id: string, status: 'read' | 'resolved'): Promise<boolean>;
    /** How many reports has this wallet submitted in the last N minutes (rate limiting). */
    getRecentReportCountByWallet(walletAddress: string, windowMinutes: number): Promise<number>;
    /**
     * Record a single on-chain deposit for a player.
     * Uses ON CONFLICT DO NOTHING so re-scanning the same block range is safe.
     */
    logDeposit(walletAddress: string, amount: bigint, txHash: string, blockNumber: bigint | null, blockTimestamp?: bigint): Promise<void>;
    /**
     * Return a unified transaction history (deposits + withdrawals) for a wallet,
     * sorted newest-first.
     */
    getPlayerTransactionHistory(walletAddress: string, limit?: number, offset?: number): Promise<Array<{
        type: 'deposit' | 'withdrawal';
        amount: string;
        status: string;
        tx_hash: string | null;
        created_at: string;
    }>>;
    withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
    checkExclusionStatus(walletAddress: string): Promise<{
        isExcluded: boolean;
        exclusionType: 'timeout' | 'permanent' | null;
        expiresAt: Date | null;
        durationLabel: string | null;
        createdAt: Date | null;
    }>;
    setExclusion(walletAddress: string, exclusionType: 'timeout' | 'permanent', durationLabel: string, expiresAt: Date | null, reason?: string): Promise<void>;
    getExclusionHistory(walletAddress: string): Promise<Array<{
        id: string;
        exclusionType: 'timeout' | 'permanent';
        durationLabel: string;
        expiresAt: Date | null;
        createdAt: Date;
        isActive: boolean;
        deactivatedAt: Date | null;
        deactivatedReason: string | null;
    }>>;
    /** Admin metrics aggregates for a time range (Blackjack only). Returns zeros if tables are missing. */
    getMetricsAggregates(range: '24h' | '7d' | '30d' | 'all'): Promise<{
        volume: bigint;
        games: number;
        activePlayers: number;
        pnl: bigint;
        tournamentEntries: number;
    }>;
    /** Tournament metrics aggregates for a time range. Returns zeros if tables are missing. */
    getTournamentMetrics(range: '24h' | '7d' | '30d' | 'all'): Promise<{
        totalTournaments: number;
        activeTournaments: number;
        completedTournaments: number;
        totalEntries: number;
        totalPrizePool: bigint;
        totalBuyIns: bigint;
    }>;
    /** Admin metrics time-series (hourly or daily buckets) for charts. Returns [] if games table missing. */
    getMetricsSeries(range: '24h' | '7d' | '30d' | 'all'): Promise<Array<{
        period: string;
        volume: string;
        games: number;
    }>>;
    /** Recent Blackjack wins (for public latest-wins feed). Only win/blackjack results. */
    getRecentGlobalWins(limit?: number): Promise<Array<{
        gameId: string;
        playerAddress: string;
        result: string;
        betAmount: string;
        payout: string;
        timestamp: number;
    }>>;
    /** Admin game config: get all key-value pairs. */
    getAdminGameConfig(): Promise<Record<string, string>>;
    /** Admin game config: set one key. */
    setAdminGameConfigKey(key: string, value: string): Promise<void>;
    /** Up to N player wallet addresses (by recent activity) for admin reserve sampling. */
    getPlayerAddressesForReserveCheck(limit?: number): Promise<string[]>;
    getBlackjackTables(enabledOnly?: boolean): Promise<BlackjackTableRow[]>;
    hasBlackjackTableByKindSrc(kind: string, src: string): Promise<boolean>;
    createBlackjackTable(row: Omit<BlackjackTableRow, 'id' | 'created_at' | 'updated_at'>): Promise<BlackjackTableRow>;
    updateBlackjackTable(id: string, updates: Partial<Pick<BlackjackTableRow, 'name' | 'src' | 'description' | 'token_contract_address' | 'logo_url' | 'ticker' | 'iframe_url' | 'website_url' | 'sort_order' | 'enabled'>>): Promise<BlackjackTableRow | null>;
    deleteBlackjackTable(id: string): Promise<boolean>;
}
//# sourceMappingURL=database.service.d.ts.map