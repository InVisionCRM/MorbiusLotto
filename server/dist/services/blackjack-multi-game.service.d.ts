import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
/** A single hand within a seat (seats may have multiple hands after split). */
export interface BJMultiHandObj {
    cards: number[];
    total: number;
    hasAce: boolean;
    isBlackjack: boolean;
    isBust: boolean;
    betAmount: string;
    result?: 'win' | 'loss' | 'push' | 'blackjack' | null;
    payout: string;
    actions: any[];
    canHit: boolean;
    canStand: boolean;
    canDoubleDown: boolean;
    canSplit: boolean;
}
export interface BJMultiSeatState {
    position: number;
    playerAddress: string | null;
    seatStatus: 'active' | 'sitting_out';
    consecutiveTimeouts: number;
    pendingBet: string;
    displayName?: string | null;
    profileImageUrl?: string | null;
    avatarConfig?: Record<string, unknown> | null;
    profileDisplayMode?: 'avatar' | 'photo';
    betAmount: string;
    hands: BJMultiHandObj[];
    activeHandIndex: number;
    result?: string | null;
    payout: string;
    isActing: boolean;
}
export interface BJMultiTableState {
    tableId: string;
    status: string;
    minBet: string;
    maxBet: string;
    seats: BJMultiSeatState[];
    /** Dealer cards — only the first card is exposed during 'playing' phase */
    dealerCards: number[];
    dealerCardCount: number;
    dealerTotal: number;
    dealerHasAce: boolean;
    currentRoundId: string | null;
    actingSeatPosition: number | null;
    phase: 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed';
    roundNumber: number;
    turnStartedAt: string | null;
    bettingStartedAt: string | null;
    themeKind: 'video' | 'image';
    themeId: string;
    stateVersion: number;
}
export interface BJMultiTableSummary {
    id: string;
    status: string;
    minBet: string;
    maxBet: string;
    seatedCount: number;
    emptySeats: number;
    themeKind: 'video' | 'image';
    themeId: string;
}
export declare class BlackjackMultiGameService {
    private readonly dbService;
    private readonly pfService;
    private readonly tableLocks;
    private broadcastCallback;
    private readonly stateVersions;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    setBroadcastCallback(cb: (tableId: string) => Promise<void>): void;
    private broadcastTableState;
    private get pool();
    /** Bump and return the monotonic state version for a table. */
    private bumpStateVersion;
    /** Fire-and-forget audit log entry — never throws. */
    private audit;
    /** Clear in-memory runtime metadata owned by this service for a table lifecycle transition. */
    private clearTableRuntimeState;
    listTables(): Promise<BJMultiTableSummary[]>;
    createTable(minBet: bigint, maxBet: bigint, themeKind?: string, themeId?: string): Promise<{
        id: string;
    }>;
    deleteTable(tableId: string): Promise<boolean>;
    /** Tip the dealer (house). Deducts from player balance, credits deployer wallet. */
    tipDealer(tableId: string, playerAddress: string, amount: bigint): Promise<{
        success: boolean;
    }>;
    /** Fetch completed rounds for a table (most recent first). */
    getTableHistory(tableId: string, limit?: number): Promise<any[]>;
    joinTable(tableId: string, playerAddress: string, seatPosition: number): Promise<BJMultiTableState>;
    leaveTable(tableId: string, playerAddress: string): Promise<BJMultiTableState>;
    placeBet(tableId: string, playerAddress: string, betAmount: bigint, clientSeed?: string): Promise<BJMultiTableState>;
    /**
     * Check if the table is in betting phase and every seated player has placed a bet.
     * Used to skip the betting timer when there's no one left to wait for.
     */
    allSeatedPlayersHaveBet(tableId: string): Promise<boolean>;
    /**
     * Start a round: deduct bets, deal initial cards, set turn order.
     * Called when all seated players have bet OR betting timer expires.
     */
    startRound(tableId: string): Promise<BJMultiTableState>;
    /** Internal start-round logic — caller MUST hold the table lock. */
    private _startRoundInternal;
    /**
     * Handle a player action: hit / stand / double_down / split.
     */
    playerAction(tableId: string, playerAddress: string, action: 'hit' | 'stand' | 'double_down' | 'split', handIndex?: number, actionId?: string): Promise<BJMultiTableState>;
    /**
     * Called by the timer watchdog: auto-stand the acting player if their 30s has expired.
     */
    autoStandTimedOut(tableId: string): Promise<void>;
    /**
     * Called by the timer watchdog: transition a table from waiting to betting when
     * there are seated players, so the next round can start (15s betting timer applies).
     */
    private loadLatestRoundMeta;
    private canCreateBettingRound;
    private createPlaceholderBettingRound;
    startBettingPhase(tableId: string): Promise<void>;
    /**
     * Called by the timer watchdog: handle betting phase timeout.
     * Seats that haven't bet sit out (or get kicked), then start round if any bets exist.
     */
    handleBettingTimeout(tableId: string): Promise<void>;
    /**
     * Round snapshot authority:
     * - while playing/dealer_turn, prefer non-betting rounds so UI never "resets" to a placeholder betting round.
     * - otherwise, latest round is authoritative.
     */
    private loadAuthorityRoundForSnapshot;
    getTableState(tableId: string): Promise<BJMultiTableState>;
    /** Compute current deck position from all cards already in play for this round. */
    private computeDeckPosition;
    private computeDeckPositionAsync;
    /** Safe deck draw — throws if deck is exhausted (should never happen with 6-deck shoe). */
    private drawCard;
    private canSplit;
    private handleHandAction;
    private handleSplit;
    /**
     * Refund all chips in play for this round seat, remove round + table seat, then advance play.
     * Caller must hold the table lock.
     */
    private kickActingPlayerMidRoundAfk;
    /**
     * Advance acting_seat_position to the next seat that still has active hands.
     * If no more seats remain, trigger dealer turn.
     */
    private advanceTurn;
    private runDealerTurnInternal;
    private settleRoundInternal;
    /**
     * Find the first seat position that has an active (non-blackjack) hand, among betting seats.
     * Returns null if all are blackjacks or no seats.
     */
    private firstActiveTurnSeat;
}
//# sourceMappingURL=blackjack-multi-game.service.d.ts.map