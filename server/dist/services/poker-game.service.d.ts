import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export interface PokerTableSummary {
    id: string;
    smallBlind: string;
    bigBlind: string;
    maxSeats: number;
    status: string;
    seatedCount: number;
    emptySeats: number;
    hasPin: boolean;
    /** Lowercase 0x creator; null for legacy tables. */
    creatorAddress: string | null;
    /** ISO8601 when the table row was created (server clock). */
    createdAt: string | null;
}
export interface PokerSeatState {
    position: number;
    playerAddress: string | null;
    stack: string;
    status: string;
    consecutiveTimeouts?: number;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
    isActing: boolean;
    folded: boolean;
    currentBet: string;
    displayName?: string | null;
    profileImageUrl?: string | null;
    avatarConfig?: Record<string, unknown> | null;
    profileDisplayMode?: 'avatar' | 'photo';
}
export interface PokerCurrentHand {
    handId: string;
    street: PokerStreet;
    communityCards: number[];
    pot: string;
    actingPosition: number | null;
    lastAction: {
        position: number;
        action: string;
        amount: string;
    } | null;
    /**
     * Recent non-blind actions across the hand, oldest → newest. Each carries its own
     * `street` and monotonic `order`, so the client can log every action even when
     * rapid server broadcasts are batched into a single React state update.
     */
    recentActions?: {
        order: number;
        street: PokerStreet;
        position: number;
        action: string;
        amount: string;
    }[];
    /** Latest non-blind action for each seat on the current street, keyed by seat position. */
    streetActions?: Record<number, {
        action: string;
        amount: string;
    }>;
    minRaise: string;
    /** Amount the acting player must put in to call (0 if can check). */
    toCall: string;
    /** ISO timestamp of when the current player's turn started (for the 60s timer). */
    turnStartedAt: string | null;
    /** At showdown: all players' revealed hole cards keyed by address */
    showdownHands?: Record<string, number[]>;
    /**
     * At showdown: true when at least two dealt-in players did not fold (real showdown).
     * False on fold-out wins — clients must not expose uncalled winners' hole cards.
     */
    handWentToShowdown?: boolean;
    /** At showdown: winner(s), amount each receives, optional hand name, and 5 card indices forming best hand */
    winners?: {
        address: string;
        amount: string;
        handName?: string;
        winningCardIndices?: number[];
    }[];
    /** ISO wall time when the server will auto-start the next hand (showdown intermission only). */
    nextHandAt?: string | null;
}
export interface PokerTableState {
    tableId: string;
    smallBlind: string;
    bigBlind: string;
    maxSeats: number;
    status: string;
    seats: PokerSeatState[];
    currentHand: PokerCurrentHand | null;
    /** Hole cards only for the requesting player */
    myHoleCards: number[] | null;
    /**
     * Sponsored marketing logo filename (gallery file under `public/Marketing /LOGOS/`).
     * Null when idle — clients show the default Morbius logo on the felt.
     */
    tableLogo?: string | null;
    /** Logo opacity (0–1). */
    tableLogoOpacity?: number | null;
    /** ISO end time of current paid logo window, or null if idle. */
    tableLogoSponsoredUntil?: string | null;
    /** Last sponsor wallet (lowercase), for UI. */
    tableLogoSponsorAddress?: string | null;
    /** True when no active sponsorship (felt uses default Morbius token). */
    tableLogoIsDefault?: boolean;
    /** Whole MORBIUS chips (string) for the next logo change at this moment. */
    tableLogoPriceMorbiusChips?: string;
    /** Sponsored token contract address (lowercased), or null when idle. */
    tableLogoTokenAddress?: string | null;
    tableLogoTokenName?: string | null;
    tableLogoTokenSymbol?: string | null;
    tableLogoTokenLogoUrl?: string | null;
    /** Set when `poker_tables.tournament_id` is non-null (SNG / scheduled poker tournament). */
    tournamentId?: string | null;
}
export declare class PokerGameService {
    private dbService;
    private pfService;
    private broadcastCallback;
    private postHandCallback;
    /** When &lt; 2 seated stacks remain, tournament tables may need a no-deal recovery pass. */
    private tournamentUnderfilledRecovery;
    private notifyCallback;
    private activeTables;
    private nextHandTimers;
    /** Per-table mutex to serialize playerAction / autoFold / leaveTable calls. */
    private tableLocks;
    /** Starting stacks (whole chips) captured at hand deal, keyed by handId -> address. */
    private handStartingStacks;
    /**
     * Hand number of the most-recently-completed hand per tableId, stashed by
     * `persistShowdown` so the deferred post-hand callback (eliminations, blind
     * updates) can fire from inside the inter-hand timer instead of immediately
     * on showdown — that way the busted tournament player stays seated through
     * the full reveal + 15-second post-showdown window. Read+deleted by
     * `scheduleNextHandAfterShowdown`'s timer body.
     */
    private pendingPostHandHandNumbers;
    /** Bail flag for `recoverStuckPostHandTables` so overlapping ticks can't pile up. */
    private recoveryInFlight;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /** Wire in the WebSocket broadcast so actions push state to clients. */
    setBroadcastCallback(cb: (tableId: string) => Promise<void>): void;
    /** Register a callback for push notifications (e.g. player kicked, sitting out). */
    setNotifyCallback(cb: (room: string, type: string, payload: any) => void): void;
    /** Register a callback fired after every showdown (used by PokerTournamentService to sync chips). */
    setPostHandCallback(cb: (tableId: string, handNumber: number) => Promise<void>): void;
    /**
     * Called when a tournament table cannot start the next hand because fewer than two seats have stack &gt; 0.
     * Applies late eliminations and may complete the SNG.
     */
    setTournamentUnderfilledRecovery(cb: (tableId: string) => Promise<void>): void;
    private getPool;
    /**
     * Serialize async operations on a given table so that concurrent
     * playerAction / autoFold / leaveTable calls cannot interleave.
     */
    private withTableLock;
    /** Cached tournament-mode flag; invalidated on table delete. */
    private tournamentModeCache;
    private invalidateTableScaling;
    private isTournamentTable;
    private normalizeAddress;
    /**
     * DB remains the canonical source of poker hand/seat state.
     * In-memory table state is an execution cache and can be reconstructed.
     */
    private getOrReconstructActiveTable;
    private clearScheduledNextHand;
    /**
     * All-in showdown: chevtek already resolved the full board in memory.
     * Persist immediately — the client handles staged card reveal animation.
     * Always returns false (caller should call scheduleNextHandAfterShowdown).
     */
    private completeShowdownWithOptionalRunout;
    /**
     * Centralizes the post-showdown transition: waits SHOWDOWN_DELAY_MS, then
     * runs the tournament post-hand callback (eliminations + blind updates)
     * BEFORE starting the next hand. Eliminations are deliberately deferred to
     * this moment so a busted player remains seated through the full reveal
     * window (cards stay flipped, chat works, no surprise auto-leave) and the
     * tournament-end check runs in time to cancel a stale `tryStartNextHand`.
     */
    private scheduleNextHandAfterShowdown;
    /**
     * Self-healing sweep — finds any showdown whose deferred post-hand work
     * never ran (server restart during the 15s window, lost in-memory timer,
     * etc.) and finishes it. Must be safe to call repeatedly: every step
     * re-checks the `post_hand_processed_at` marker under the per-table lock
     * before mutating, and the partial index keeps the scan cheap.
     *
     * Wired into the existing 5s `pokerAutoFoldInterval` and called once
     * during server bootstrap.
     */
    recoverStuckPostHandTables(): Promise<void>;
    private broadcastState;
    listTables(): Promise<PokerTableSummary[]>;
    createTable(smallBlindChips: number, bigBlindChips: number, maxSeats: number, pinCode?: string, creatorAddress?: string | null): Promise<string>;
    deleteTable(tableId: string): Promise<boolean>;
    /** `buyInChips` is a stringified whole-chip count (not MORBIUS wei). */
    joinTable(tableId: string, playerAddress: string, buyInChips: string, pinCode?: string): Promise<PokerTableState>;
    private _joinTable;
    leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null>;
    private _leaveTable;
    private persistActionAfterStandUp;
    /** `amountChips` is a stringified whole-chip count to add from the player poker chip wallet. */
    addChips(tableId: string, playerAddress: string, amountChips: string): Promise<PokerTableState>;
    private _addChips;
    /** Clear expired paid logo rows so all readers converge without a cron. */
    private expirePokerTableLogoIfExpired;
    getTableState(tableId: string, forPlayer: string | null): Promise<PokerTableState>;
    updateTableLogo(tableId: string, logo: string | null, opacity: number): Promise<void>;
    /**
     * Pay MORBIUS (off-chain `players.balance`) to sponsor a token spotlight for 10 minutes.
     * Timer restarts on each purchase. Seated players only.
     *
     * Trust-the-client metadata: the client passes name/symbol/logoUrl pulled from DexScreener.
     * Only the address is structurally validated; lengths are capped server-side.
     */
    purchaseTableLogoSponsorship(tableId: string, playerAddress: string, token: {
        address: string;
        name: string;
        symbol: string;
        logoUrl: string | null;
    }): Promise<PokerTableState>;
    setSitOut(tableId: string, playerAddress: string): Promise<PokerTableState>;
    setSitBack(tableId: string, playerAddress: string): Promise<PokerTableState>;
    /** Kick players who have been sitting out for >= 15 minutes (cash games only). */
    kickStaleSitOuts(): Promise<void>;
    startHand(tableId: string): Promise<PokerTableState | null>;
    playerAction(tableId: string, handId: string, playerAddress: string, action: string, amount?: string): Promise<PokerTableState>;
    private _playerAction;
    private persistShowdown;
    /**
     * Denormalize per-player stats for a completed hand into poker_hand_players.
     * Reads poker_hand_actions (already persisted) and combines with in-memory
     * starting stacks + settlement data. Failure here must never corrupt a hand —
     * errors are swallowed by the caller.
     */
    private populateHandPlayers;
    autoFoldTimedOutTurns(): Promise<string[]>;
    tickServerTournamentBots(): Promise<void>;
    private reconstructTable;
    private tryStartNextHand;
    private syncSeatsFromTable;
    private nextSeatPosition;
    /**
     * Seat a player at a tournament table with virtual chips.
     * Unlike joinTable, this does NOT deduct from players.balance.
     * The buy-in was already collected by PokerTournamentService.
     * Does NOT auto-start a hand — the tournament service controls timing.
     */
    joinTableTournament(tableId: string, playerAddress: string, startingChips: number | string): Promise<void>;
    /**
     * Remove a player from a tournament table without crediting their stack back.
     * Used by PokerTournamentService when a player is eliminated.
     */
    leaveTableTournament(tableId: string, playerAddress: string): Promise<void>;
    /**
     * Delete a tournament table without crediting player stacks back.
     * Used by PokerTournamentService after prize distribution.
     */
    deleteTableTournament(tableId: string): Promise<void>;
}
//# sourceMappingURL=poker-game.service.d.ts.map