import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { TournamentService } from './tournament.service';
export interface Hand {
    id: string;
    cards: number[];
    total: number;
    hasAce: boolean;
    isBlackjack: boolean;
    isBust: boolean;
    betAmount: bigint;
    result?: 'win' | 'loss' | 'push' | 'blackjack';
    payout: bigint;
    actions: any[];
    canHit: boolean;
    canStand: boolean;
    canDoubleDown: boolean;
    canSplit: boolean;
}
export interface GameState {
    gameId: string;
    sessionId: string;
    playerHands: Hand[];
    dealerCards: number[];
    dealerTotal: number;
    dealerHasAce: boolean;
    status: 'waiting' | 'player_turn' | 'dealer_turn' | 'completed';
    totalBetAmount: bigint;
    totalPayout: bigint;
    actions: any[];
    dealerActions: any[];
    currentHandIndex: number;
    canSplit: boolean;
    isBlackjack: boolean;
    /** Perfect Pairs side bet result (first two cards). */
    perfectPairsResult?: PerfectPairsResult;
    /** Payout for Perfect Pairs (0 if no bet or no pair). */
    perfectPairsPayout?: bigint;
    /** Side bet amount (for display). */
    perfectPairsBetAmount?: bigint;
    /** RNG version: 2 = Fisher-Yates 52-card deck (card indices 0-51). */
    rngVersion?: number;
}
export interface CreateGameRequest {
    playerAddress: string;
    betAmount: bigint;
    /** Optional Perfect Pairs side bet (first two cards). Locked together with main bet. */
    perfectPairsBetAmount?: bigint;
    clientSeedCommitment?: string;
    gameHash?: string;
}
/** Perfect Pairs result for the first two player cards.
 *  V1 (infinite deck): 'perfect' = same rank + same suit.
 *  V2 (52-card deck):  'colored' = same rank + same color, 'mixed' = same rank + different color.
 *  'perfect' is impossible with a single 52-card deck (no duplicate cards).
 */
export type PerfectPairsResult = 'perfect' | 'colored' | 'mixed' | 'none';
export interface CreateTournamentGameRequest {
    playerAddress: string;
    betAmount: number;
    entryId: string;
    clientSeedCommitment?: string;
}
export interface TournamentGameState extends GameState {
    tournamentEntryId: string;
    tournamentChips: number;
    handsPlayed: number;
    handsRemaining: number;
    currentRank: number;
}
export interface PlayerActionRequest {
    gameId: string;
    action: 'hit' | 'stand' | 'double_down' | 'split';
    handIndex?: number;
    clientSeed?: string;
    /** When set, use tournament chips instead of MORBIUS balance (split/double-down) */
    tournamentEntryId?: string;
}
export declare class BlackjackGameService {
    private dbService;
    private pfService;
    private static readonly GAME_NONCE_MULTIPLIER;
    private tournamentService?;
    private readonly gameLocks;
    private readonly createGameLocks;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /**
     * Set the tournament service (optional, for tournament mode support)
     */
    setTournamentService(tournamentService: TournamentService): void;
    /** Resolve Blackjack fee % and fee wallet from admin config + env. Fee applies to profit only. */
    private getBlackjackFeeConfig;
    /** Apply fee on profit (if configured); credit player (payout - fee) and fee wallet (fee). Returns fee amount applied. */
    private creditPayoutWithFee;
    private ensureSessionSeed;
    /**
     * Create a new blackjack game
     */
    createGame(request: CreateGameRequest): Promise<GameState>;
    /**
     * Split value: 10/J/Q/K (ranks 10-13) all map to 10; 2-9 and Ace use rank.
     * Standard blackjack allows splitting any two 10-value cards (e.g. King+Jack).
     */
    private getSplitValue;
    /**
     * Check if hand can be split — v2 card indices (0-51): same blackjack value (10/J/Q/K interchangeable)
     */
    private canSplitV2;
    /**
     * Classify Perfect Pairs for v2 card indices (0-51).
     * With a single 52-card deck, same rank+suit is impossible.
     * Suits: 0=hearts(red), 1=diamonds(red), 2=clubs(black), 3=spades(black).
     * Colored pair = same rank + same color. Mixed pair = same rank + different color.
     */
    private classifyPerfectPairV2;
    private getPerfectPairsPayout;
    /**
     * Handle player action (locked wrapper — prevents concurrent actions on same game)
     */
    handlePlayerAction(request: PlayerActionRequest): Promise<GameState>;
    /**
     * Handle player action (inner, unlocked — called by locked wrappers)
     */
    private _handlePlayerActionUnlocked;
    /**
     * Handle splitting a hand — v2 deck-based
     */
    private handleSplitV2;
    /**
     * Handle action on a specific hand — v2 deck-based
     */
    private handleHandActionV2;
    /**
     * Play dealer turn and complete the game — v2 deck-based
     */
    private playDealerAndCompleteV2;
    /**
     * Verify game result (alias for getGameResult for API compatibility)
     */
    verifyGame(gameId: string): Promise<any>;
    /**
     * Get game result for verification
     */
    getGameResult(gameId: string): Promise<any>;
    /**
     * Create a tournament game using tournament chips
     */
    createTournamentGame(request: CreateTournamentGameRequest): Promise<TournamentGameState>;
    /**
     * Handle player action in tournament mode
     */
    handleTournamentPlayerAction(gameId: string, action: 'hit' | 'stand' | 'double_down' | 'split', entryId: string, handIndex?: number): Promise<TournamentGameState>;
}
//# sourceMappingURL=blackjack-game.service.d.ts.map