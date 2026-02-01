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
     * Get total number of entries in a tournament
     */
    getTournamentEntryCount(tournamentId: string): Promise<number>;
    /**
     * Validate bet amount for tournament
     */
    validateTournamentBet(chips: number, betAmount: number): {
        valid: boolean;
        error?: string;
    };
}
//# sourceMappingURL=tournament.service.d.ts.map