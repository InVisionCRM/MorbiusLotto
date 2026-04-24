import { Pool } from 'pg';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';
export interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    handsPerLevel: number;
}
/** How posted blinds go up during the event (stored in `poker_config`). */
export type PokerBlindIncreaseMode = 'knockout' | 'by_hand';
export interface PokerTournamentConfig {
    startingStack: number;
    minPlayers: number;
    maxPlayers: number;
    blindSchedule: BlindLevel[];
    /**
     * `knockout` (default): blinds multiply when someone busts (legacy SNG behavior).
     * `by_hand`: blinds follow `blindSchedule` / `handsPerLevel` after each completed hand.
     */
    blindIncreaseMode?: PokerBlindIncreaseMode;
}
export declare const DEFAULT_BLIND_SCHEDULE: BlindLevel[];
export interface PokerTournamentPlayer {
    playerAddress: string;
    /** From `chat_display_names`; null if unset. */
    displayName: string | null;
    entryId: string;
    chipsRemaining: number;
    status: 'playing' | 'busted' | 'completed';
    finalRank: number | null;
    prizeWon: string;
}
export interface PokerTournamentState {
    tournamentId: string;
    name: string;
    status: string;
    tableId: string | null;
    blindLevel: number;
    smallBlind: number;
    bigBlind: number;
    handNumber: number;
    players: PokerTournamentPlayer[];
    prizePool: string;
    buyInAmount: string;
    prizeDistributionType: string;
    pokerConfig?: PokerTournamentConfig;
    /** From `tournaments.action_timer_seconds`; null = default ~60s server turn clock. */
    actionTimerSeconds?: number | null;
    /** Percent of prize pool per finishing rank (index 0 = 1st place); integers summing to 100. */
    prizeSplitPercentages?: number[];
}
export interface PokerTournamentSummary {
    tournamentId: string;
    name: string;
    status: string;
    buyInAmount: string;
    startingStack: number;
    registeredCount: number;
    maxPlayers: number;
    minPlayers: number;
    prizePool: string;
    tableId: string | null;
    createdAt: string;
    creatorAddress: string | null;
    prizeDistributionType: string;
    scheduledStartAt: string | null;
    isRegistered: boolean;
    isPrivate: boolean;
    /** Level-1 or live table blinds (chip ints). */
    smallBlind: number;
    bigBlind: number;
    /** `knockout` = elimination bumps; `by_hand` = schedule after each hand. */
    blindIncreaseMode: PokerBlindIncreaseMode;
}
/** Where the initial guaranteed pool is debited when buy-in is 0. */
export type GuaranteedPrizePoolSource = 'creator' | 'platform_promo';
export interface CreatePokerTournamentParams {
    creatorAddress: string;
    name: string;
    buyInAmount: bigint;
    /** Required when buyInAmount is 0: poker chips debited from creator at create; becomes initial prize_pool (chips). */
    guaranteedPrizePool?: bigint;
    /**
     * When buy-in is 0: debit the creator's `players.balance` (default).
     * `platform_promo`: same debit/refund wallet, but only allowed if the creator is in ADMIN_WALLETS (comma-separated `ADMIN_WALLETS` / `NEXT_PUBLIC_ADMIN_WALLETS`).
     */
    guaranteedPrizePoolSource?: GuaranteedPrizePoolSource;
    prizeDistributionType: string;
    /** Required when prizeDistributionType is `custom` (one integer % per rank, length = maxPlayers, sum 100). */
    prizePercentages?: number[];
    config: PokerTournamentConfig;
    isPrivate?: boolean;
    pinCode?: string | null;
    /** Required — must be a finite `Date` strictly in the future (enforced at create). */
    scheduledStartAt: Date;
}
/**
 * Validates creator prize % per finishing rank (index 0 = 1st place … index maxPlayers-1).
 * Integers 0–100; unused ranks may be 0; must sum to exactly 100.
 */
export declare function normalizePokerTournamentPrizePercents(maxPlayers: number, raw: unknown): number[];
export declare class PokerTournamentService {
    private pool;
    private tournamentService;
    private pokerGameService;
    private broadcastCallback;
    constructor(pool: Pool, tournamentService: TournamentService, pokerGameService: PokerGameService);
    /** Wire in a broadcast function so the service can push WS events. */
    setBroadcastCallback(cb: (room: string, message: object) => void): void;
    private broadcast;
    private normalizeAddress;
    private parseBigInt;
    /**
     * Who receives the **guaranteed** freeroll overlay (buy-in 0) when it is returned:
     * creator cancel (registration) or scheduled start with insufficient players.
     */
    private guaranteedPrizePoolRefundRecipient;
    /**
     * JSON/DB may return `handsPerLevel` as a string; `accumulated += "10"` would concatenate
     * instead of adding and breaks level boundaries — always coerce to a positive integer width.
     */
    private handsPerLevelNumeric;
    /** Normalize stored / client-sent blind mode (case, kebab, legacy snake key handled in parse). */
    private normalizeBlindIncreaseMode;
    /** Return the BlindLevel that applies for a given hand number (1-indexed). */
    computeBlindLevel(blindSchedule: BlindLevel[], handNumber: number): BlindLevel;
    /**
     * SNG posted blinds use level-1 schedule amounts as a base, then double per elimination.
     * HUD / WS `newLevel` uses this tier: 1 + floor(log2(posted SB / level-1 SB)).
     */
    knockoutBlindDisplayLevel(blindSchedule: BlindLevel[], smallBlindChips: number): number;
    /** Blinds that apply to the next hand after `completedHandNumber` (1-based) finishes. */
    blindsForNextHand(blindSchedule: BlindLevel[], completedHandNumber: number): BlindLevel;
    private getBlindIncreaseMode;
    /** HUD / snapshot: schedule level index from posted blinds (by-hand mode). */
    private scheduleDisplayLevel;
    private parsePokerConfig;
    createPokerTournament(params: CreatePokerTournamentParams): Promise<{
        tournamentId: string;
        pinCode: string | null;
    }>;
    /**
     * Player joins the registration phase by paying the buy-in.
     * Uses SELECT ... FOR UPDATE to prevent race condition on auto-start.
     * Returns the entry and whether the tournament auto-started.
     */
    joinPokerTournament(tournamentId: string, playerAddress: string, pinCode?: string): Promise<{
        entryId: string;
        autoStarted: boolean;
        tableId: string | null;
    }>;
    /**
     * Called by FreerollSchedulerService when scheduled_start_at elapses.
     * Cancels + refunds if below minPlayers; otherwise activates (status must become active for sync + payouts).
     */
    startScheduledPokerTournament(tournamentId: string): Promise<void>;
    /**
     * Transition tournament from registration → active.
     * Creates a dedicated poker table (tournament_mode=TRUE), seats all players,
     * starts the first hand.
     */
    activateTournament(tournamentId: string): Promise<string>;
    /**
     * After each hand completes:
     * 1. Sync seat stacks → tournament_entries.chips_remaining
     * 2. Eliminate 0-chip players (mark busted, remove seat)
     * 3. Blind updates (see `blindIncreaseMode` in `poker_config`):
     *    - `knockout`: multiply SB/BB by 2^k when k players bust this hand
     *    - `by_hand`: set SB/BB from the blind schedule for the **next** hand (uses `handsPerLevel`)
     * 4. Complete tournament if ≤1 active player remains
     */
    syncAfterHand(tableId: string, handNumber: number): Promise<void>;
    /**
     * Bust a player from an active poker SNG after consecutive turn-timer auto-folds (wired from PokerGameService).
     * Same DB path as chip bust: ranks, seat removal, WS elimination event, knockout blind multiplier, may complete.
     */
    eliminatePlayerForConsecutiveTimeouts(tableId: string, playerAddress: string): Promise<void>;
    /**
     * `tryStartNextHand` refuses to deal when &lt; 2 seats have stack &gt; 0. If eliminations were not fully
     * applied (e.g. stack format mismatch), the table can stall with no winner. Re-sync entries from
     * seats, eliminate 0-chip players (no `hands_played` bump), then complete when ≤1 remain.
     */
    recoverTournamentTableIfUnderTwoStackedSeats(tableId: string): Promise<void>;
    completeTournament(tournamentId: string, tableId?: string): Promise<void>;
    cancelPokerTournament(tournamentId: string, callerAddress: string): Promise<void>;
    /**
     * **Dev / QA only** (HTTP layer must also enable `POKER_TOURNAMENT_DEV_RESET=true`):
     * Drops tournament poker table(s), cancels pending scheduled events, marks `playing`/`forfeited`
     * entries as busted, sets tournament `cancelled` and `prize_pool = 0`.
     * Does **not** credit player balances (including locked guarantee / buy-ins) — for local DB cleanup only.
     */
    adminDevForceResetPokerTournament(tournamentId: string): Promise<{
        tournamentId: string;
        deletedTableIds: string[];
        priorStatus: string;
    }>;
    /** Entrants for lobby / modal (addresses + optional display name + registration time + entry status). */
    getPokerTournamentRegistrants(tournamentId: string): Promise<Array<{
        playerAddress: string;
        displayName: string | null;
        registeredAt: string | null;
        status: 'playing' | 'busted' | 'completed';
    }>>;
    listPokerTournaments(playerAddress?: string): Promise<PokerTournamentSummary[]>;
    getTournamentState(tournamentId: string): Promise<PokerTournamentState | null>;
    getPlayerEntryStatus(tournamentId: string, playerAddress: string): Promise<PokerTournamentPlayer | null>;
    private eliminateBustedTournamentSeats;
    private getTableIdForTournament;
}
//# sourceMappingURL=poker-tournament.service.d.ts.map