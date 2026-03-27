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
    minRaise: string;
    /** Amount the acting player must put in to call (0 if can check). */
    toCall: string;
    /** ISO timestamp of when the current player's turn started (for the 30s timer). */
    turnStartedAt: string | null;
    /** At showdown: all players' revealed hole cards keyed by address */
    showdownHands?: Record<string, number[]>;
    /** At showdown: winner(s), amount each receives, optional hand name, and 5 card indices forming best hand */
    winners?: {
        address: string;
        amount: string;
        handName?: string;
        winningCardIndices?: number[];
    }[];
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
    /** Marketing logo filename (admin-set). Null = no logo. */
    tableLogo?: string | null;
    /** Logo opacity (0–1). */
    tableLogoOpacity?: number | null;
}
export declare class PokerGameService {
    private dbService;
    private pfService;
    private broadcastCallback;
    private postHandCallback;
    private notifyCallback;
    private activeTables;
    /** Per-table mutex to serialize playerAction / autoFold / leaveTable calls. */
    private tableLocks;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /** Wire in the WebSocket broadcast so actions push state to clients. */
    setBroadcastCallback(cb: (tableId: string) => Promise<void>): void;
    /** Register a callback for push notifications (e.g. player kicked, sitting out). */
    setNotifyCallback(cb: (room: string, type: string, payload: any) => void): void;
    /** Register a callback fired after every showdown (used by PokerTournamentService to sync chips). */
    setPostHandCallback(cb: (tableId: string, handNumber: number) => Promise<void>): void;
    private getPool;
    /**
     * Serialize async operations on a given table so that concurrent
     * playerAction / autoFold / leaveTable calls cannot interleave.
     */
    private withTableLock;
    /** Cached cash vs tournament + chip wei; invalidated on table delete. */
    private scalingCache;
    private invalidateTableScaling;
    private getTableScaling;
    private normalizeAddress;
    private broadcastState;
    listTables(): Promise<PokerTableSummary[]>;
    createTable(smallBlind: bigint, bigBlind: bigint, maxSeats: number, pinCode?: string): Promise<string>;
    deleteTable(tableId: string): Promise<boolean>;
    joinTable(tableId: string, playerAddress: string, buyInChips: string, pinCode?: string): Promise<PokerTableState>;
    private _joinTable;
    leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null>;
    private _leaveTable;
    private persistActionAfterStandUp;
    addChips(tableId: string, playerAddress: string, amount: string): Promise<PokerTableState>;
    private _addChips;
    getTableState(tableId: string, forPlayer: string | null): Promise<PokerTableState>;
    updateTableLogo(tableId: string, logo: string | null, opacity: number): Promise<void>;
    startHand(tableId: string): Promise<PokerTableState | null>;
    playerAction(tableId: string, handId: string, playerAddress: string, action: string, amount?: string): Promise<PokerTableState>;
    private _playerAction;
    private persistShowdown;
    autoFoldTimedOutTurns(): Promise<string[]>;
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