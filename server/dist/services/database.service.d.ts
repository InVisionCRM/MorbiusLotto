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
export declare class DatabaseService {
    private pool;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getOrCreatePlayer(walletAddress: string): Promise<Player>;
    updatePlayerLastSeen(playerId: string): Promise<void>;
    getPlayerStats(walletAddress: string): Promise<PlayerStats>;
    getPlayerStatsEnhanced(walletAddress: string): Promise<EnhancedPlayerStats>;
    getGlobalAnalytics(): Promise<GlobalAnalytics>;
    getPlayerGames(walletAddress: string, limit?: number, offset?: number): Promise<Game[]>;
    getSettlements(status?: string, limit?: number): Promise<any[]>;
    createGameSession(playerId: string, serverSeedHash: string): Promise<GameSession>;
    getActiveSession(playerId: string): Promise<GameSession | null>;
    updateSessionStats(sessionId: string, betAmount: bigint, winAmount: bigint): Promise<void>;
    endSession(sessionId: string): Promise<void>;
    createGame(sessionId: string, gameData: Partial<Game>): Promise<Game>;
    createGameHand(gameId: string, handData: Partial<GameHand>): Promise<GameHand>;
    updateGameHand(handId: string, updates: Partial<GameHand>): Promise<void>;
    getGameHands(gameId: string): Promise<GameHand[]>;
    updateGame(gameId: string, updates: Partial<Game>): Promise<void>;
    getGame(gameId: string): Promise<Game | null>;
    getSessionGames(sessionId: string): Promise<Game[]>;
    revealServerSeed(gameId: string, serverSeedHash: string, serverSeed: string): Promise<void>;
    createSettlement(gameId: string, playerAddress: string, amount: bigint): Promise<string>;
    updateSettlementStatus(settlementId: string, transactionHash: string, status: 'confirmed' | 'failed'): Promise<void>;
    addActiveConnection(playerId: string, connectionId: string): Promise<void>;
    removeActiveConnection(connectionId: string): Promise<void>;
    updateConnectionPing(connectionId: string): Promise<void>;
    cleanupOldConnections(): Promise<number>;
    withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=database.service.d.ts.map