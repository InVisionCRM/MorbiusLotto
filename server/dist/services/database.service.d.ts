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
    /** Returns null if the player has never been synced (first-time baseline needed). */
    getLastSyncedReserve(walletAddress: string): Promise<bigint | null>;
    updateLastSyncedReserve(walletAddress: string, reserve: bigint): Promise<void>;
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
     * expiresAt: on-chain signature deadline; cron only refunds when NOW() > expiresAt.
     *
     * Returns the remaining balance after deduction.
     * Throws if the player has insufficient balance (same as deductPlayerBalance).
     */
    deductAndCreatePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint, expiresAt: Date): Promise<bigint>;
    /**
     * Mark a pending withdrawal as completed after the user has successfully completed the on-chain tx.
     * Prevents the expiry cron from refunding the amount (double-credit). Idempotent: safe to call if already completed.
     */
    markPendingWithdrawalCompleted(walletAddress: string, nonce: bigint, txHash?: string): Promise<boolean>;
    /**
     * Record a completed hot-wallet withdrawal for history (shows in getPlayerTransactionHistory).
     * Uses a synthetic negative nonce so it does not clash with signature-based pending withdrawals.
     */
    recordHotWalletWithdrawal(walletAddress: string, amount: bigint, txHash: string): Promise<void>;
    /** Enqueue a hot-wallet withdrawal: deduct balance and insert job in one transaction. Returns job id. */
    enqueueHotWithdrawal(walletAddress: string, amountWei: bigint, netToUserWei: bigint, feeWei: bigint): Promise<string>;
    /** Claim next queued job: SELECT FOR UPDATE SKIP LOCKED and set status = 'broadcasting' in one transaction. Returns null if none. */
    claimNextHotWithdrawalJob(): Promise<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        net_to_user_wei: string;
        fee_wei: string;
        created_at: Date;
    } | null>;
    /** Update job status (and optionally tx_hash, error_message). */
    updateHotWithdrawalJob(jobId: string, updates: {
        status: string;
        tx_hash?: string | null;
        error_message?: string | null;
    }): Promise<void>;
    /** Get job by id for status API. */
    getHotWithdrawalJobById(jobId: string): Promise<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        net_to_user_wei: string;
        status: string;
        tx_hash: string | null;
        error_message: string | null;
        created_at: Date;
        updated_at: Date;
    } | null>;
    /** Get the latest active (non-terminal) hot withdrawal job for a wallet. */
    getActiveHotWithdrawalJob(walletAddress: string): Promise<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        net_to_user_wei: string;
        status: string;
        tx_hash: string | null;
        error_message: string | null;
        created_at: Date;
        updated_at: Date;
    } | null>;
    /** List jobs in pending_confirmation for the confirmation worker. */
    getHotWithdrawalJobsPendingConfirmation(): Promise<Array<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        tx_hash: string;
        created_at: Date;
        updated_at: Date;
    }>>;
    /** Refund balance for a failed hot withdrawal job. */
    refundHotWithdrawalJob(walletAddress: string, amountWei: bigint): Promise<void>;
    /** Insert a pending deposit (do not credit balance until confirmations). */
    insertPendingDeposit(walletAddress: string, amountWei: bigint, txHash: string, blockNumber: bigint | null, confirmationsRequired?: number): Promise<void>;
    /** Returns true if the player has any unconfirmed pending deposit in flight. */
    hasPendingDeposit(walletAddress: string): Promise<boolean>;
    /** Get pending deposits that need confirmation check. */
    getPendingDepositsForConfirmation(): Promise<Array<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        tx_hash: string;
        block_number: number | null;
        confirmations_required: number;
    }>>;
    /** List pending_deposits rows for admin tables with pagination. */
    listPendingDeposits(limit?: number, offset?: number): Promise<Array<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        tx_hash: string | null;
        status: string;
        created_at: string;
    }>>;
    /** Mark pending deposit as credited and credit players.balance. */
    creditPendingDeposit(jobId: string): Promise<boolean>;
    /** Update pending deposit block_number (e.g. after fetching from chain). */
    updatePendingDepositBlockNumber(jobId: string, blockNumber: bigint): Promise<void>;
    /** Get a credited pending deposit by tx_hash (for admin shortfall correction). */
    getCreditedPendingDepositByTxHash(txHash: string): Promise<{
        wallet_address: string;
        amount_wei: string;
    } | null>;
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
    /** Blackjack deposits and withdrawals since a given time (from player_deposits + pending_withdrawals). */
    getBlackjackDepositsWithdrawalsSince(since: Date): Promise<{
        deposited: string;
        withdrawn: string;
    }>;
    getInstantLotteryScanState(): Promise<{
        lastScannedBlock: bigint | null;
    } | null>;
    updateInstantLotteryScanState(lastScannedBlock: bigint | null): Promise<void>;
    /** Insert one play (from chain event). ON CONFLICT DO NOTHING so re-scans are safe. */
    logInstantLotteryPlay(walletAddress: string, wager: bigint, grossPayout: bigint, netPayout: bigint, blockNumber: bigint | null, txHash: string): Promise<void>;
    /** Top players by total wagered (all-time from indexed plays). */
    getLotteryTopPlayers(limit?: number): Promise<LotteryTopPlayerEntry[]>;
    /** Per-player stats from indexed instant lottery plays. */
    getLotteryPlayerStats(walletAddress: string): Promise<LotteryPlayerStats | null>;
    /** Insert a provably-fair instant lottery play (before resolvePlay tx). */
    insertInstantLotteryPlayPF(params: {
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
    }): Promise<number>;
    /** Set tx_hash after resolvePlay succeeds (for verification lookup). Stored lowercase for consistent lookup. */
    updateInstantLotteryPlayPFTxHash(id: number, txHash: string): Promise<void>;
    /** Reveal server seed for verification (call after play is settled). */
    updateInstantLotteryPlayPFReveal(id: number, serverSeed: string): Promise<void>;
    /** Get PF play by tx_hash for verification endpoint. Lookup is case-insensitive (EVM hashes). */
    getInstantLotteryPlayPFByTxHash(txHash: string): Promise<{
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
    } | null>;
    expirePendingWithdrawals(): Promise<number>;
    /**
     * Get pending withdrawals past their on-chain deadline (expires_at).
     * Does NOT modify them — caller must verify on-chain before deciding to refund or mark completed.
     */
    getExpiredPendingWithdrawals(): Promise<Array<{
        wallet_address: string;
        nonce: string;
        amount: string;
    }>>;
    /** List pending_withdrawals rows for admin tables with pagination. */
    listPendingWithdrawals(limit?: number, offset?: number): Promise<Array<{
        id: string;
        wallet_address: string;
        amount: string;
        tx_hash: string | null;
        nonce: string;
        status: string;
        created_at: string;
    }>>;
    /**
     * Get one expired pending withdrawal for a wallet (oldest first).
     * Used by admin to manually trigger refund when cron couldn't verify (e.g. RPC issues).
     */
    getExpiredPendingForWallet(walletAddress: string): Promise<{
        nonce: string;
        amount: string;
    } | null>;
    /**
     * Expire a single pending withdrawal and refund the balance.
     * Only call this after verifying on-chain that the nonce was NOT used.
     */
    expireSinglePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<void>;
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
    /** Recent completed games globally (all players) for "Recent Play" feed.
     *  Includes both single-player and multiplayer blackjack games. */
    getRecentGamesGlobal(limit?: number): Promise<Array<{
        id: string;
        wallet_address: string;
        result: string | null;
        total_bet_amount: bigint;
        total_payout: bigint;
        created_at: Date;
    }>>;
    createGameSession(playerId: string, serverSeed: string, serverSeedHash: string): Promise<GameSession>;
    getActiveSession(playerId: string): Promise<GameSession | null>;
    getSessionById(sessionId: string): Promise<GameSession | null>;
    getPlayerAddressFromSession(sessionId: string): Promise<string>;
    updateSessionStats(sessionId: string, betAmount: bigint, winAmount: bigint, incrementGameCount?: boolean): Promise<void>;
    endSession(sessionId: string): Promise<void>;
    setSessionServerSeed(sessionId: string, serverSeed: string, serverSeedHash: string): Promise<void>;
    createGame(sessionId: string, gameData: Partial<Game>): Promise<Game>;
    createGameHand(gameId: string, handData: Partial<GameHand>): Promise<GameHand>;
    /**
     * Insert a game_hand row using a provided transaction client.
     * Used by multiplayer settlement to fan out JSONB hands into normalised rows
     * inside the same transaction that settles balances.
     */
    createGameHandInTx(client: any, gameId: string, handData: Partial<GameHand>): Promise<void>;
    updateGameHand(handId: string, updates: Partial<GameHand>): Promise<void>;
    getGameHands(gameId: string): Promise<GameHand[]>;
    updateGame(gameId: string, updates: Partial<Game>): Promise<void>;
    getGame(gameId: string): Promise<Game | null>;
    /** Multiplayer blackjack: one row per player per round (used as history `id` for verify links). */
    getBlackjackMultiRoundSeatWithRound(seatId: string): Promise<{
        seat: any;
        round: any;
    } | null>;
    /** Load a completed round and all seats (seat_position ASC). Used for verify-by-round-id when exactly one seat. */
    getBlackjackMultiRoundWithSeats(roundId: string): Promise<{
        round: any;
        seats: any[];
    } | null>;
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
        avatarConfig: Record<string, unknown> | null;
        bio: string | null;
        xHandle: string | null;
        tgHandle: string | null;
    } | null>;
    setDisplayName(walletAddress: string, displayName: string, profileImageUrl?: string | null, avatarConfig?: Record<string, unknown> | null, bio?: string | null, xHandle?: string | null, tgHandle?: string | null): Promise<void>;
    /**
     * Sets avatar_config only when it is currently null (for new players or those who never set an avatar).
     * If no row exists, inserts one with empty display_name and the given config.
     */
    setDefaultAvatarIfNull(walletAddress: string, avatarConfig: Record<string, unknown>): Promise<void>;
    /** Explicitly update social/bio fields — allows clearing (pass empty string → stored as null). */
    updateProfileSocial(walletAddress: string, bio: string | null, xHandle: string | null, tgHandle: string | null): Promise<void>;
    getDisplayNames(walletAddresses: string[]): Promise<Map<string, string>>;
    getProfiles(walletAddresses: string[]): Promise<Map<string, {
        displayName: string;
        profileImageUrl: string | null;
        avatarConfig: Record<string, unknown> | null;
    }>>;
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
    /** Upsert a snapshot for today. Called hourly by the snapshot scheduler. */
    saveContractDailySnapshot(game: string, totalWagered: bigint, totalPayouts: bigint, contractReserve: bigint): Promise<void>;
    /** Return snapshots for the last N days, oldest first. */
    getContractDailySnapshots(days?: number): Promise<Array<{
        snapshot_date: string;
        game: string;
        total_wagered: string;
        total_payouts: string;
        contract_reserve: string;
    }>>;
    /** Upsert one hourly snapshot (current hour bucket). Called by snapshot scheduler. */
    saveContractHourlySnapshot(game: string, totalWagered: bigint, totalPayouts: bigint, contractReserve: bigint): Promise<void>;
    /** Prune hourly snapshots older than keepHours. */
    pruneContractHourlySnapshots(keepHours?: number): Promise<number>;
    /** Return hourly snapshots for the last N hours, oldest first. */
    getContractHourlySnapshots(hours?: number): Promise<Array<{
        snapshot_hour: string;
        game: string;
        total_wagered: string;
        total_payouts: string;
        contract_reserve: string;
    }>>;
    /** Completed poker hands for a player (for history modal). */
    getPokerPlayerHands(address: string, limit?: number, offset?: number): Promise<Array<{
        id: string;
        table_id: string;
        hand_number: number;
        pot_amount: string;
        community_cards: number[];
        result: {
            winners: Array<{
                address: string;
                amount: string;
                handName?: string;
            }>;
        } | null;
        rakeAmount: string;
        completed_at: string;
        myContributed: string;
        myWon: string;
        resultType: 'win' | 'loss' | 'fold';
    }>>;
    /** Aggregate poker stats for a player (from completed hands). */
    getPokerPlayerStats(address: string): Promise<{
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
    }>;
    /** Aggregate poker stats for a player at a specific table (from completed hands). */
    getPokerPlayerTableStats(tableId: string, address: string): Promise<{
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
    }>;
    /** Single hand detail for replay (actions + hole cards for requesting player). */
    getPokerHandDetail(handId: string, playerAddress: string): Promise<{
        id: string;
        table_id: string;
        hand_number: number;
        pot_amount: string;
        community_cards: number[];
        result: {
            winners: Array<{
                address: string;
                amount: string;
                handName?: string;
            }>;
        } | null;
        completed_at: string;
        actions: Array<{
            street: string;
            player_address: string;
            action: string;
            amount: string;
        }>;
        holeCards: number[] | null;
    } | null>;
    getPokerTableDashboardStats(tableId: string): Promise<{
        table: {
            id: string;
            small_blind: string;
            big_blind: string;
            max_seats: number;
            hand_number: number;
            created_at: string;
        } | null;
        seats: Array<{
            position: number;
            player_address: string;
            stack: string;
            status: string;
            joined_at: string;
        }>;
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
    }>;
    followPlayer(followerAddress: string, followingAddress: string): Promise<void>;
    unfollowPlayer(followerAddress: string, followingAddress: string): Promise<void>;
    isFollowing(followerAddress: string, followingAddress: string): Promise<boolean>;
    getFollowCounts(address: string): Promise<{
        followerCount: number;
        followingCount: number;
    }>;
    getFollowers(address: string, limit?: number, offset?: number): Promise<Array<{
        address: string;
        displayName: string | null;
        avatarConfig: Record<string, unknown> | null;
    }>>;
    getFollowing(address: string, limit?: number, offset?: number): Promise<Array<{
        address: string;
        displayName: string | null;
        avatarConfig: Record<string, unknown> | null;
    }>>;
}
//# sourceMappingURL=database.service.d.ts.map