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
export type PokerBlindIncreaseMode = 'knockout' | 'by_hand' | 'by_time';
/** Allowed wall-clock interval (minutes) for `by_time` mode — integers 1–60 inclusive. */
export declare const BLIND_INTERVAL_MINUTES_MIN = 1;
export declare const BLIND_INTERVAL_MINUTES_MAX = 60;
export type BlindIntervalMinutes = number;
export interface PokerTournamentConfig {
    startingStack: number;
    minPlayers: number;
    maxPlayers: number;
    blindSchedule: BlindLevel[];
    /**
     * `knockout` (default): blinds multiply when someone busts (legacy SNG behavior).
     * `by_hand`: blinds follow `blindSchedule` / `handsPerLevel` after each completed hand.
     * `by_time`: blinds advance one level every `blindIntervalMinutes` of wall-clock time.
     */
    blindIncreaseMode?: PokerBlindIncreaseMode;
    /** Required when `blindIncreaseMode === 'by_time'`. Integer minutes from `BLIND_INTERVAL_MINUTES_MIN` to `BLIND_INTERVAL_MINUTES_MAX`. */
    blindIntervalMinutes?: BlindIntervalMinutes;
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
    /** Chip-int for chips/promo; token-wei for custom-token (pair with `prizeTokenDecimals`). */
    prizePool: string;
    /** ERC-20 address when prize is a custom PRC-20; null/absent = chips. */
    prizeTokenAddress?: string | null;
    prizeTokenDecimals?: number | null;
    prizeTokenSymbol?: string | null;
    prizeTokenName?: string | null;
    buyInAmount: string;
    prizeDistributionType: string;
    pokerConfig?: PokerTournamentConfig;
    /** From `tournaments.action_timer_seconds`; null = default ~60s server turn clock. */
    actionTimerSeconds?: number | null;
    /** Percent of prize pool per finishing rank (index 0 = 1st place); integers summing to 100. */
    prizeSplitPercentages?: number[];
    /**
     * `by_time` mode only — wall-clock instant the current blind level became active.
     * Clients can subtract from `Date.now()` and compare against `pokerConfig.blindIntervalMinutes`
     * to render a countdown to the next bump. Null/absent for other modes or pre-activation.
     */
    currentBlindLevelStartedAt?: string | null;
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
    /**
     * For chip freerolls and platform-promo: chip amount.
     * For custom-token freerolls: amount in the token's smallest unit (wei). Pair with `prizeTokenDecimals`.
     */
    prizePool: string;
    /** ERC-20 contract address when prize is a custom PRC-20; null = chips. */
    prizeTokenAddress: string | null;
    /** 1–18 when `prizeTokenAddress` is set; null otherwise. */
    prizeTokenDecimals: number | null;
    /** Display ticker (e.g. "HEX"); null if missing or chips. */
    prizeTokenSymbol: string | null;
    /** Token contract name for UI (e.g. from PulseScan); null = use symbol / generic label. */
    prizeTokenName: string | null;
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
    /** `knockout` = elimination bumps; `by_hand` = schedule after each hand; `by_time` = wall-clock interval. */
    blindIncreaseMode: PokerBlindIncreaseMode;
    /** Set only when `blindIncreaseMode === 'by_time'`. */
    blindIntervalMinutes?: BlindIntervalMinutes;
}
/** Where the initial guaranteed pool is debited when buy-in is 0; `custom_token_buyin` is buy-in paid in PRC-20 via escrow. */
export type GuaranteedPrizePoolSource = 'creator' | 'platform_promo' | 'custom_token' | 'custom_token_buyin';
/** Token metadata for poker tournaments where each player pays buy-in into escrow (no creator deposit at create). */
export interface CustomTokenBuyInMeta {
    tokenAddress: string;
    decimals: number;
    symbol?: string;
    name?: string;
}
/**
 * Funding payload supplied by the client when the prize pool is held in the
 * `TournamentPrizeEscrowV2` contract for an arbitrary PRC-20 token.
 *
 * The client deposits BEFORE this call; the server re-reads on-chain state to
 * verify the deposit is real, matches the supplied token + amount, and was made
 * by the creator. Only then is the tournament row written, with the same UUID
 * used for both the DB id and the bytes32 escrow key (keccak256(uuid)).
 */
export interface CustomTokenEscrowFunding {
    /** Client-generated UUID v4. Used as `tournaments.id` AND keccak'd to produce the on-chain bytes32 key. */
    tournamentId: string;
    /** Tx hash of the depositPrizePool call. Stored for auditability. */
    txHash: string;
    /** ERC-20 contract address that funded the pool. */
    tokenAddress: string;
    /** Wei (smallest unit) of the deposit. */
    amount: bigint;
    /** Token decimals (1–18). Used for display only; server trusts on-chain decimals for math. */
    decimals: number;
    /** Display ticker (e.g. "HEX"). Optional — server falls back to address tail in lobby/HUD if missing. */
    symbol?: string;
    /** Full token name (e.g. from picker / PulseScan). Optional; stored for history/lobby display. */
    name?: string;
}
export interface CreatePokerTournamentParams {
    creatorAddress: string;
    name: string;
    buyInAmount: bigint;
    /** Required when buyInAmount is 0: poker chips debited from creator at create; becomes initial prize_pool (chips). */
    guaranteedPrizePool?: bigint;
    /**
     * When buy-in is 0: debit the creator's `players.balance` (default).
     * `platform_promo`: same debit/refund wallet, but only allowed if the creator is in ADMIN_WALLETS (comma-separated `ADMIN_WALLETS` / `NEXT_PUBLIC_ADMIN_WALLETS`).
     * `custom_token`: prize pool is held in the on-chain escrow contract; `customTokenEscrow` must be supplied and is verified before the row is written.
     */
    guaranteedPrizePoolSource?: GuaranteedPrizePoolSource;
    /** Required when `guaranteedPrizePoolSource === 'custom_token'`. */
    customTokenEscrow?: CustomTokenEscrowFunding;
    /** Required when `guaranteedPrizePoolSource === 'custom_token_buyin'`. */
    customTokenBuyIn?: CustomTokenBuyInMeta;
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
    /** Normalize stored / client-sent blind interval (minutes). Returns null when out of range. */
    private normalizeBlindIntervalMinutes;
    /** Return the BlindLevel that applies for a given hand number (1-indexed). */
    computeBlindLevel(blindSchedule: BlindLevel[], handNumber: number): BlindLevel;
    /**
     * SNG posted blinds use level-1 schedule amounts as a base, then double per elimination.
     * HUD / WS `newLevel` uses this tier: 1 + floor(log2(posted SB / level-1 SB)).
     */
    knockoutBlindDisplayLevel(blindSchedule: BlindLevel[], smallBlindChips: number): number;
    /**
     * `by_time`: how many full intervals have elapsed since `levelStartedAt`.
     * Capped at the schedule length so we never read past the last level.
     * Returns the level number (1-based) that should currently be in effect.
     *
     * Example: schedule has 8 levels, interval = 30 min, levelStartedAt was the
     * level-1 start. After 75 minutes (2 full 30-min intervals elapsed) the
     * effective level is `1 + 2 = 3`.
     */
    computeBlindLevelByTime(blindSchedule: BlindLevel[], intervalMinutes: number, levelStartedAt: Date, startingLevel: number, now?: Date): BlindLevel;
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
    joinPokerTournament(tournamentId: string, playerAddress: string, pinCode?: string, joinEscrowTxHash?: string | null): Promise<{
        entryId: string;
        autoStarted: boolean;
        tableId: string | null;
    }>;
    /**
     * Registration-phase exit for custom-token buy-in tournaments: server pushes buy-in back from escrow, then removes DB entry.
     */
    leavePokerTournamentRegistration(tournamentId: string, playerAddress: string): Promise<void>;
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
     * Player-initiated forfeit: voluntarily eliminates the caller from an active poker tournament.
     * Same DB path as a chip bust (rank assigned, seat removed, WS event broadcast, knockout blind
     * multiplier applied, may complete the tournament). No refund — buy-in stays in the prize pool.
     *
     * No-ops cleanly when the player isn't seated or the tournament isn't active.
     */
    forfeitPokerTournament(tournamentId: string, playerAddress: string): Promise<void>;
    /**
     * `tryStartNextHand` refuses to deal when &lt; 2 seats have stack &gt; 0. If eliminations were not fully
     * applied (e.g. stack format mismatch), the table can stall with no winner. Re-sync entries from
     * seats, eliminate 0-chip players (no `hands_played` bump), then complete when ≤1 remain.
     */
    recoverTournamentTableIfUnderTwoStackedSeats(tableId: string): Promise<void>;
    /**
     * Scheduler tick: advance blinds for all active poker tournaments running in
     * `by_time` mode whose current level has been live for ≥ `blindIntervalMinutes`.
     *
     * Called by `FreerollSchedulerService`. Cheap on average — the partial index on
     * `current_blind_level_started_at` keeps the scan tight and most tables won't
     * need an update on any given poll.
     *
     * One row per tournament-table; we step the level forward one at a time per
     * tick (even if multiple intervals have passed), so a brief outage doesn't
     * skip levels visually — but `computeBlindLevelByTime` still picks the
     * correct target so we'll catch up over the next few ticks.
     */
    tickTimeBasedBlindAdvances(): Promise<void>;
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
    /**
     * Cancelled custom-token poker tournaments where the caller is the creator and
     * funds may still be reclaimable from the escrow contract.
     *
     * Pure DB read — the client decides whether to surface a "Reclaim" button by
     * doing an on-chain `getPool` to confirm `cancelled === true && totalDeposited > amountPaidOut`.
     * We do NOT round-trip the chain here: this list could be 0 rows for many viewers
     * and we don't want to slow the lobby for everyone.
     */
    listReclaimableCustomTokenPokerTournaments(creatorAddress: string): Promise<Array<{
        tournamentId: string;
        name: string;
        cancelledAt: string | null;
        prizeTokenAddress: string;
        prizeTokenDecimals: number;
        prizeTokenSymbol: string | null;
        prizeTokenName: string | null;
        prizePool: string;
        escrowTournamentIdBytes32: string | null;
    }>>;
    /**
     * Completed custom-token poker tournaments where the caller has a positive `prize_won`
     * but no `prize_payout_tx_hash` recorded — i.e. the push payout didn't fire (or hasn't
     * yet) and the server-recorded claimable amount may still be pullable on-chain.
     *
     * Pure DB read; the client confirms each row via `unclaimedOf(bytes32, me)` before
     * surfacing a button. Cheap query — index on `tournament_id, player_address` already exists.
     */
    listClaimableCustomTokenPokerTournaments(playerAddress: string): Promise<Array<{
        tournamentId: string;
        name: string;
        completedAt: string | null;
        prizeTokenAddress: string;
        prizeTokenDecimals: number;
        prizeTokenSymbol: string | null;
        prizeTokenName: string | null;
        /** Token-wei the player should be owed; pair with `prizeTokenDecimals` for display. */
        prizeWon: string;
        escrowTournamentIdBytes32: string | null;
    }>>;
    getTournamentState(tournamentId: string): Promise<PokerTournamentState | null>;
    getPlayerEntryStatus(tournamentId: string, playerAddress: string): Promise<PokerTournamentPlayer | null>;
    private eliminateBustedTournamentSeats;
    private getTableIdForTournament;
}
//# sourceMappingURL=poker-tournament.service.d.ts.map