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
}
export interface PokerSeatState {
    position: number;
    playerAddress: string | null;
    stack: string;
    status: string;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
    isActing: boolean;
    folded: boolean;
    currentBet: string;
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
    /** At showdown: winner(s), amount each receives, and optional hand name */
    winners?: {
        address: string;
        amount: string;
        handName?: string;
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
}
export declare class PokerGameService {
    private dbService;
    private pfService;
    private broadcastCallback;
    private activeTables;
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    /** Wire in the WebSocket broadcast so actions push state to clients. */
    setBroadcastCallback(cb: (tableId: string) => Promise<void>): void;
    private getPool;
    private normalizeAddress;
    private broadcastState;
    listTables(): Promise<PokerTableSummary[]>;
    createTable(smallBlind: bigint, bigBlind: bigint, maxSeats: number): Promise<string>;
    deleteTable(tableId: string): Promise<boolean>;
    joinTable(tableId: string, playerAddress: string, buyInChips: string): Promise<PokerTableState>;
    leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null>;
    private persistActionAfterStandUp;
    addChips(tableId: string, playerAddress: string, amount: string): Promise<PokerTableState>;
    getTableState(tableId: string, forPlayer: string | null): Promise<PokerTableState>;
    startHand(tableId: string): Promise<PokerTableState | null>;
    playerAction(tableId: string, handId: string, playerAddress: string, action: string, amount?: string): Promise<PokerTableState>;
    private persistShowdown;
    autoFoldTimedOutTurns(): Promise<string[]>;
    private reconstructTable;
    private tryStartNextHand;
    private syncSeatsFromTable;
    private nextSeatPosition;
}
//# sourceMappingURL=poker-game.service.d.ts.map