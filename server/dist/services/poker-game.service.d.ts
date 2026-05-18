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
    /** Sum of all pots (kept as scalar for backward-compat clients). */
    pot: string;
    /**
     * Structured pot breakdown — main pot + each side/uncalled pot, in the
     * order chevtek created them. Lets the client render side pots as
     * separately labeled stacks instead of a single flat total, and drive
     * per-pot chip-flow animations at showdown (each pot's chips fly to
     * THAT pot's winner). Only populated while a hand is in progress with
     * an active in-memory table — falls back to the `pot` scalar otherwise.
     *
     * `winnerAddresses` is populated once chevtek's `showdown()` has run,
     * including for "uncalled" refund pots (sole eligible player) so the
     * client can fly those chips back to the over-bettor.
     */
    pots?: {
        amount: string;
        label: string;
        winnerAddresses?: string[];
    }[];
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
    /**
     * Provably-fair commitment — `SHA-256(serverSeed)` published at hand start.
     * Plaintext `serverSeed` stays hidden until showdown (see
     * `poker_hand_pending_seeds`); the hash lets the UI prove "deck was
     * locked in before the deal" in real time. After showdown, players can
     * verify the full proof at `/poker/verify?handId={handId}`.
     */
    serverSeedHash?: string;
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
    /**
     * Active server-driven runout timers — one per table. Cleared on completion,
     * on `clearScheduledNextHand` (leaveTable / standUp mid-runout), and on
     * recovery fast-forward.
     */
    private runoutTimers;
    /** Tables currently animating an all-in runout. Read by callers that need
     *  to know "is the table mid-resolve" without hitting the DB. */
    private runoutInFlight;
    /**
     * Per-table snapshot of each player's pre-payout chip stack, used to freeze
     * the displayed stacks during an all-in runout so the board reveal doesn't
     * leak the winner (otherwise the seat plate updates to the post-payout
     * value the instant chevtek auto-resolves). Keyed by tableId → (lowercase
     * player address → chip-int string). Populated in `scheduleRunout` before
     * the first staged broadcast and cleared at the showdown frame so the
     * stack change is revealed alongside the winner badges.
     */
    private runoutFrozenStacks;
    /**
     * Per-step runout delays default on in production, off under jest. When
     * disabled `scheduleRunout` runs all frames inline (no setTimeout chain),
     * so existing integration tests can assert on post-showdown DB state
     * immediately after the triggering action without polling. Toggle via
     * `setRunoutDelaysForTesting(enabled)` if a test needs the production
     * pacing.
     */
    private runoutDelaysEnabled;
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
    private clearRunoutTimer;
    /**
     * Test-only: drop runout per-step delays to 0 so tests can drive a full
     * runout synchronously. Mirrors the production pacing in semantics — just
     * collapses the wall-clock waits.
     */
    setRunoutDelaysForTesting(enabled: boolean): void;
    /**
     * Showdown entry point. Two paths:
     *
     * (a) Single-street showdown — river already on the board (or fold-out
     *     resolution): persist immediately. Caller schedules next hand.
     *
     * (b) Multi-street all-in runout — chevtek auto-resolved one or more
     *     streets in this action. Snapshot the final state, then chain
     *     intermediate broadcasts (flop / turn / river) before finally calling
     *     persistShowdown on the showdown frame. Caller does NOT schedule next
     *     hand; the final runout step schedules it.
     *
     * Returns `true` when the showdown work is deferred to runout timers; the
     * caller should NOT call `scheduleNextHandAfterShowdown` in that case
     * (the runout chain does it). Returns `false` when persistShowdown ran
     * inline.
     */
    private completeShowdownWithOptionalRunout;
    /**
     * Snapshot the resolved table + chain intermediate broadcasts. Each tick
     * updates `poker_hands.street` + `community_cards` to the in-progress
     * intermediate value and broadcasts. The final tick calls `persistShowdown`
     * (which writes winners, completed_at, etc.) and schedules the next hand.
     *
     * The full final board is also persisted to `runout_final_community_cards`
     * up-front so the recovery sweep can fast-forward if the server crashes
     * mid-stream.
     */
    private scheduleRunout;
    /**
     * Collapse an in-flight runout to its final showdown state right now.
     *
     * Two call sites:
     * 1. Live: player leaves mid-runout and we need their stack credited
     *    before we strip their seat. The in-memory chevtek table is present;
     *    we cancel pending timers and finalize.
     * 2. Recovery: server restarted with `runout_resolved_at IS NOT NULL AND
     *    completed_at IS NULL` rows on disk. In-memory state is gone; we
     *    reconstruct from DB, which deterministically produces the same
     *    final chevtek state.
     *
     * No-op when no hand is mid-runout (idempotent — safe to call repeatedly
     * from a recovery sweep that may double-fire after a race).
     */
    private finalizeRunoutImmediately;
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
    /**
     * Public entry: tournament-side leave / elimination. Takes the per-table
     * lock so concurrent `playerAction` / `autoFoldTimedOutTurns` ticks can't
     * race the `standUp` + DB writes. Called from `eliminateBustedTournamentSeats`
     * in the post-hand timer body (which does NOT hold the lock).
     *
     * **Do NOT call this from a code path that already holds the table lock**
     * (the lock is not re-entrant — it would deadlock). Internal callers under
     * a held lock should call `leaveTableTournamentNoLock` instead.
     */
    leaveTableTournament(tableId: string, playerAddress: string): Promise<void>;
    /**
     * Lock-free variant of {@link leaveTableTournament}. Assumes the caller
     * already holds the per-table lock — used by recovery paths fired from
     * inside `tryStartNextHand`'s lock body (e.g.
     * `recoverTournamentTableIfUnderTwoStackedSeats`). Using the lock-acquiring
     * public method from those paths would deadlock since `withTableLock` is
     * not re-entrant.
     */
    leaveTableTournamentNoLock(tableId: string, playerAddress: string): Promise<void>;
    private _leaveTableTournament;
    /**
     * Delete a tournament table without crediting player stacks back.
     * Used by PokerTournamentService after prize distribution.
     */
    deleteTableTournament(tableId: string): Promise<void>;
}
//# sourceMappingURL=poker-game.service.d.ts.map