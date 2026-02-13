import { Pool } from 'pg';
export declare const TOURNAMENT_CONFIG: {
    BUY_IN_AMOUNT: bigint;
    STARTING_CHIPS: number;
    MAX_HANDS: number;
    MIN_PLAYERS_FOR_PRIZES: number;
    MIN_BET: number;
    MAX_BET: number;
    PRIZE_PERCENTAGES: number[];
    HOUSE_PERCENTAGE: number;
};
export interface RebuyConfig {
    enabled: boolean;
    maxRebuys: number;
}
export interface TableTheme {
    kind: 'image' | 'video';
    id: string;
}
export interface Tournament {
    id: string;
    name: string;
    buy_in_amount: bigint;
    starting_chips: number;
    max_hands: number;
    min_players: number;
    status: 'active' | 'completed' | 'cancelled';
    prize_pool: bigint;
    created_at: Date;
    ended_at?: Date;
    tournament_type?: string | null;
    creator_address?: string;
    time_limit_minutes?: number;
    rebuy_config: RebuyConfig;
    table_theme: TableTheme;
    is_private: boolean;
    pin_code?: string;
    prize_distribution_type: string;
    prize_percentages?: number[];
    max_players?: number;
    ends_at?: Date;
    custom_image?: string | null;
    prize_token_address?: string | null;
    prize_token_decimals?: number | null;
    creator_fee_percent: number;
    platform_fee_percent: number;
}
export interface TournamentEntry {
    id: string;
    tournament_id: string;
    player_address: string;
    chips_remaining: number;
    hands_played: number;
    highest_chip_count: number;
    final_rank?: number;
    prize_won: bigint;
    status: 'playing' | 'busted' | 'completed';
    bought_in_at: Date;
    finished_at?: Date;
    rebuy_count: number;
    total_buy_in: bigint;
}
/** One row for "My History" — a tournament the player entered and its outcome */
export interface PlayerTournamentHistoryItem {
    tournamentId: string;
    tournamentName: string;
    tournamentStatus: 'active' | 'completed' | 'cancelled';
    tournamentType: string;
    prizeTokenAddress: string | null;
    /** When the tournament actually ended (set on completion) */
    endedAt: Date | null;
    /** When the tournament is scheduled to end (time limit; null = no limit). Use for "time remaining" when in progress. */
    endsAt: Date | null;
    entryId: string;
    entryStatus: 'playing' | 'busted' | 'completed';
    finalRank: number | null;
    prizeWon: bigint;
    boughtInAt: Date;
    finishedAt: Date | null;
    handsPlayed: number;
    highestChipCount: number;
    chipsRemaining: number;
}
export interface CreateTournamentParams {
    creatorAddress: string;
    name: string;
    buyInAmount: bigint;
    startingChips: number;
    maxHands: number;
    timeLimitMinutes: number | null;
    rebuyConfig: RebuyConfig;
    tableTheme: TableTheme;
    isPrivate: boolean;
    prizeDistributionType: string;
    customPrizePercentages?: number[];
    maxPlayers?: number | null;
    customImage?: string | null;
    /** When set, prize pool is funded by creator via escrow; prizeAmount in token smallest unit */
    prizeTokenAddress?: string | null;
    prizeAmount?: string;
    prizeTokenDecimals?: number | null;
    /** Optional PIN for private tournaments; if provided and valid, used instead of generating */
    pinCode?: string | null;
    /** Creator fee percentage (0-5%). Deducted from prize pool and paid to creator. */
    creatorFeePercent?: number;
    /** Platform fee percentage. Read from env at creation time. */
    platformFeePercent?: number;
}
/** Create freeroll tournament (no buy-in, scheduled start). */
export interface CreateFreerollParams {
    creatorAddress: string;
    name: string;
    freerollMode: 'elimination' | 'standard_chip_count';
    scheduledStartAt: string;
    registrationOpensAt: string;
    durationMinutes: number;
    startingChips: number;
    maxHands: number;
    prizeDistributionType: string;
    customPrizePercentages?: number[];
    eliminationConfig?: {
        intervalType: string;
        intervalValue: number;
        eliminationPercentage: number;
        resetChipsAfterRound?: boolean;
        eliminationRoundsMin?: number;
        eliminationRoundsMax?: number;
    } | null;
    reentryConfig: {
        enabled: boolean;
        windowMinutes?: number;
    };
    actionTimerSeconds: number | null;
    tiebreakerOrder?: string[];
    tableTheme: TableTheme;
    isPrivate: boolean;
    minPlayers?: number;
    maxPlayers?: number | null;
    customImage?: string | null;
    pinCode?: string | null;
    /** Creator fee percentage (0-5%). */
    creatorFeePercent?: number;
    /** Platform fee percentage. Read from env at creation time. */
    platformFeePercent?: number;
}
export interface FreerollListItem {
    id: string;
    name: string;
    creator_address: string | null;
    tournament_type: string;
    freeroll_mode: string;
    scheduled_start_at: Date | null;
    registration_opens_at: Date | null;
    duration_minutes: number | null;
    starting_chips: number;
    current_phase: string | null;
    registered_count: number;
    action_timer_seconds: number | null;
    elimination_config: Record<string, unknown> | null;
    reentry_config: Record<string, unknown> | null;
    prize_distribution_type: string;
    custom_image: string | null;
    created_at: Date;
}
export interface TournamentListItem {
    id: string;
    name: string;
    creator_address: string | null;
    buy_in_amount: bigint;
    starting_chips: number;
    max_hands: number;
    prize_pool: bigint;
    entry_count: number;
    max_players: number | null;
    time_limit_minutes: number | null;
    ends_at: Date | null;
    rebuy_config: RebuyConfig;
    table_theme: TableTheme;
    is_private: boolean;
    prize_distribution_type: string;
    created_at: Date;
    custom_image?: string | null;
    prize_token_address?: string | null;
    prize_token_decimals?: number | null;
    tournament_type?: string | null;
    scheduled_start_at?: Date | null;
    registration_opens_at?: Date | null;
    current_phase?: string | null;
    duration_minutes?: number | null;
    creator_fee_percent?: number;
    platform_fee_percent?: number;
    escrow_funded?: boolean;
    escrow_total_deposited?: string;
    escrow_token?: string | null;
}
export interface TournamentGame {
    id: string;
    tournament_id: string;
    entry_id: string;
    game_id: string;
    hand_number: number;
    bet_amount: number;
    chips_before: number;
    chips_after: number;
    result?: string;
    created_at: Date;
}
export interface LeaderboardEntry {
    entry_id: string;
    player_address: string;
    chips_remaining: number;
    hands_played: number;
    highest_chip_count: number;
    status: string;
    current_rank: number;
}
export interface TournamentState {
    entryId: string;
    tournamentId: string;
    chips: number;
    handsPlayed: number;
    handsRemaining: number;
    highestChips: number;
    currentRank: number;
    status: 'playing' | 'busted' | 'completed';
    prizeWon: bigint;
    maxHands: number;
    startingChips: number;
}
export interface PrizeDistribution {
    entry_id: string;
    player_address: string;
    final_rank: number;
    prize_amount: bigint;
}
export declare class TournamentService {
    private pool;
    constructor(pool: Pool);
    private toBigInt;
    private normalizeAddress;
    private normalizeTournament;
    private normalizeEntry;
    /**
     * Generate a random 4-digit PIN code
     */
    private generatePinCode;
    /**
     * Get prize percentages for a distribution type
     */
    private getPrizePercentages;
    /**
     * Get the current active tournament, creating one if needed
     */
    getActiveTournament(): Promise<Tournament>;
    /**
     * Get a tournament by ID
     */
    getTournament(tournamentId: string): Promise<Tournament | null>;
    /**
     * Enter a tournament by paying the buy-in
     */
    enterTournament(playerAddress: string): Promise<TournamentEntry>;
    /**
     * Get player's tournament entry
     */
    getTournamentEntry(playerAddress: string, tournamentId?: string): Promise<TournamentEntry | null>;
    /**
     * Get player's active tournament entry with full state
     */
    getTournamentState(playerAddress: string): Promise<TournamentState | null>;
    /**
     * Get tournament leaderboard
     */
    getLeaderboard(tournamentId: string, limit?: number): Promise<LeaderboardEntry[]>;
    /**
     * Record a tournament hand result
     */
    recordTournamentHand(entryId: string, gameId: string, betAmount: number, chipsBefore: number, chipsAfter: number, result?: string): Promise<TournamentEntry>;
    /**
     * Update tournament chips after a hand
     */
    updateChips(entryId: string, newChipCount: number): Promise<TournamentEntry>;
    /**
     * Mark entry as busted (0 chips)
     */
    bustOut(entryId: string): Promise<TournamentEntry>;
    /**
     * Mark entry as completed (50 hands played)
     */
    completeTournamentEntry(entryId: string): Promise<TournamentEntry>;
    /**
     * Leave tournament early (forfeit remaining chips)
     */
    leaveTournament(playerAddress: string): Promise<TournamentEntry | null>;
    /**
     * Check if all players have finished and distribute prizes if so
     */
    private checkAndDistributePrizes;
    /**
     * Distribute prizes to top players
     */
    distributePrizes(tournamentId: string): Promise<PrizeDistribution[]>;
    /**
     * Get all entries for a tournament (for detail view player list)
     */
    getEntries(tournamentId: string): Promise<LeaderboardEntry[]>;
    /**
     * Get total number of entries in a tournament
     */
    getTournamentEntryCount(tournamentId: string): Promise<number>;
    /**
     * Get all tournaments a player has entered, with outcome (for "My History" UI).
     * Returns entries ordered by bought_in_at descending (most recent first).
     */
    getPlayerTournamentHistory(playerAddress: string): Promise<PlayerTournamentHistoryItem[]>;
    /**
     * List freeroll tournaments (from list_freeroll_tournaments).
     */
    listFreerollTournaments(includePast?: boolean): Promise<FreerollListItem[]>;
    /**
     * Register for a freeroll (during registration phase).
     */
    registerFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry>;
    /**
     * Mark freeroll registration as "joined" (player is at the table).
     */
    joinFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry>;
    /**
     * Re-enter a freeroll during the reentry window (after elimination).
     */
    reentryFreeroll(playerAddress: string, tournamentId: string): Promise<TournamentEntry>;
    /**
     * Validate bet amount for tournament
     */
    validateTournamentBet(chips: number, betAmount: number): {
        valid: boolean;
        error?: string;
    };
    /**
     * Create a custom tournament
     */
    createTournament(params: CreateTournamentParams): Promise<Tournament>;
    /**
     * Determine the correct phase for a freeroll tournament based on current time.
     */
    private determineFreerollPhase;
    /**
     * Create a freeroll tournament (no buy-in, scheduled start).
     */
    createFreeroll(params: CreateFreerollParams): Promise<{
        id: string;
        pinCode?: string | null;
    }>;
    /**
     * Validate tournament creation parameters
     */
    validateTournamentParams(params: CreateTournamentParams): {
        valid: boolean;
        error?: string;
    };
    /**
     * List active tournaments (for browser)
     */
    listTournaments(includePrivate?: boolean): Promise<TournamentListItem[]>;
    /**
     * Join a specific tournament by ID
     */
    joinTournament(playerAddress: string, tournamentId: string, pinCode?: string): Promise<TournamentEntry>;
    /**
     * Process rebuy for a player
     */
    processRebuy(playerAddress: string, tournamentId: string): Promise<{
        entry: TournamentEntry;
        newPrizePool: bigint;
    }>;
    /**
     * Get extended tournament info including all settings
     */
    getTournamentInfoExtended(tournamentId: string): Promise<{
        tournament: Tournament;
        entryCount: number;
        prizePercentages: number[];
    } | null>;
    /**
     * Get tournament state including rebuy info
     */
    getTournamentStateExtended(playerAddress: string): Promise<(TournamentState & {
        rebuyCount: number;
        totalBuyIn: bigint;
        canRebuy: boolean;
        maxRebuys: number;
        rebuyEnabled: boolean;
    }) | null>;
    /**
     * Execute a pending freeroll scheduled event (start, elimination_round, end, reentry_close).
     * Called by FreerollSchedulerService. Only marks the event as executed on success.
     */
    executeScheduledEvent(event: {
        id: string;
        tournament_id: string;
        event_type: string;
        scheduled_at: Date;
        metadata: Record<string, unknown> | null;
    }): Promise<void>;
    /** Transition freeroll to active and mark no-shows. */
    private handleFreerollStart;
    /** Run elimination round: eliminate bottom % by chips (with tiebreakers), optionally reset chips for survivors. */
    private handleEliminationRound;
    /**
     * Get all tournaments created by an address (active + completed)
     */
    getCreatorTournaments(creatorAddress: string): Promise<{
        id: string;
        name: string;
        status: string;
        buyInAmount: string;
        prizePool: string;
        entryCount: number;
        creatorFeePercent: number;
        platformFeePercent: number;
        creatorFeeEarned: string;
        prizeDistributionType: string;
        createdAt: string;
        endedAt: string | null;
        customImage: string | null;
        isPrivate: boolean;
        tournamentType: string;
        maxHands: number;
        startingChips: number;
    }[]>;
    /**
     * Get earnings from completed tournaments for a creator
     */
    getCreatorEarnings(creatorAddress: string): Promise<{
        tournamentId: string;
        tournamentName: string;
        prizePool: string;
        feePercent: number;
        feeEarned: string;
        completedAt: string;
    }[]>;
    /** Complete freeroll: distribute prizes (via existing logic) and set current_phase = completed. */
    private handleFreerollEnd;
}
//# sourceMappingURL=tournament.service.d.ts.map