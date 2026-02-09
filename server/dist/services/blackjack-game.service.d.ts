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
}
export declare class BlackjackGameService {
    private dbService;
    private pfService;
    private static readonly GAME_NONCE_MULTIPLIER;
    private tournamentService?;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /**
     * Set the tournament service (optional, for tournament mode support)
     */
    setTournamentService(tournamentService: TournamentService): void;
    private getGameBaseNonce;
    private ensureSessionSeed;
    /**
     * Create a new blackjack game
     */
    createGame(request: CreateGameRequest): Promise<GameState>;
    /**
     * Check if hand can be split (same rank 1-13)
     */
    private canSplit;
    /**
     * Classify Perfect Pairs: exact match only (same rank AND same suit).
     */
    private classifyPerfectPair;
    /**
     * Check if hand can be split — v2 card indices (0-51): same rank
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
    /** Draw one encoded card (value*10+suit), consumes 2 nonces. */
    private drawEncodedCard;
    /**
     * Handle player action
     */
    handlePlayerAction(request: PlayerActionRequest): Promise<GameState>;
    /**
     * Handle splitting a hand
     */
    private handleSplit;
    /**
     * Handle action on a specific hand
     */
    private handleHandAction;
    /**
     * Play dealer turn and complete the game
     */
    private playDealerAndComplete;
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