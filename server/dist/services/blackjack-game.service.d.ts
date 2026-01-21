import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
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
}
export interface CreateGameRequest {
    playerAddress: string;
    betAmount: bigint;
    clientSeedCommitment?: string;
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
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /**
     * Create a new blackjack game
     */
    createGame(request: CreateGameRequest): Promise<GameState>;
    /**
     * Check if hand can be split
     */
    private canSplit;
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
     * Verify game result (alias for getGameResult for API compatibility)
     */
    verifyGame(gameId: string): Promise<any>;
    /**
     * Get game result for verification
     */
    getGameResult(gameId: string): Promise<any>;
}
//# sourceMappingURL=blackjack-game.service.d.ts.map