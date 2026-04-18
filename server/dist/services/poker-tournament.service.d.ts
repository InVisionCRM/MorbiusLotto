import { Pool } from 'pg';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';
export interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    handsPerLevel: number;
}
export interface PokerTournamentConfig {
    startingStack: number;
    minPlayers: number;
    maxPlayers: number;
    blindSchedule: BlindLevel[];
}
export declare const DEFAULT_BLIND_SCHEDULE: BlindLevel[];
export interface PokerTournamentPlayer {
    playerAddress: string;
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
}
/** Where the initial guaranteed pool is debited when buy-in is 0. */
export type GuaranteedPrizePoolSource = 'creator' | 'platform_promo';
export interface CreatePokerTournamentParams {
    creatorAddress: string;
    name: string;
    buyInAmount: bigint;
    /** Required when buyInAmount is 0: MORBIUS (wei) debited at create; becomes initial prize_pool. */
    guaranteedPrizePool?: bigint;
    /**
     * When buy-in is 0: debit `creator` (default) or `platform_promo` wallet.
     * `platform_promo` requires caller in ADMIN_WALLETS and POKER_PROMO_GUARANTEED_POOL_WALLET in env.
     */
    guaranteedPrizePoolSource?: GuaranteedPrizePoolSource;
    prizeDistributionType: string;
    config: PokerTournamentConfig;
    isPrivate?: boolean;
    pinCode?: string | null;
    scheduledStartAt?: Date | null;
}
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
    /** Who receives prize_pool on cancel / scheduled under-min (freeroll → funder or creator). */
    private prizePoolRefundRecipient;
    /** Return the BlindLevel that applies for a given hand number (1-indexed). */
    computeBlindLevel(blindSchedule: BlindLevel[], handNumber: number): BlindLevel;
    private parsePokerConfig;
    createPokerTournament(params: CreatePokerTournamentParams): Promise<{
        tournamentId: string;
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
     * 3. Advance blind level if needed
     * 4. Complete tournament if ≤1 active player remains
     */
    syncAfterHand(tableId: string, handNumber: number): Promise<void>;
    completeTournament(tournamentId: string, tableId?: string): Promise<void>;
    cancelPokerTournament(tournamentId: string, callerAddress: string): Promise<void>;
    listPokerTournaments(playerAddress?: string): Promise<PokerTournamentSummary[]>;
    getTournamentState(tournamentId: string): Promise<PokerTournamentState | null>;
    getPlayerEntryStatus(tournamentId: string, playerAddress: string): Promise<PokerTournamentPlayer | null>;
    private getTableIdForTournament;
}
//# sourceMappingURL=poker-tournament.service.d.ts.map