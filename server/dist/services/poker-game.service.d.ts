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
    constructor(dbService: DatabaseService, pfService: ProvablyFairService);
    private getPool;
    private normalizeAddress;
    listTables(): Promise<PokerTableSummary[]>;
    getTable(tableId: string): Promise<{
        id: string;
        smallBlind: string;
        bigBlind: string;
        maxSeats: number;
        status: string;
    } | null>;
    createTable(smallBlind: bigint, bigBlind: bigint, maxSeats: number): Promise<string>;
    /**
     * Join a table: deduct buyIn from balance, add seat with stack = buyIn.
     */
    joinTable(tableId: string, playerAddress: string, buyInChips: string): Promise<PokerTableState>;
    /**
     * Leave table: credit stack back to balance, remove seat.
     */
    leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null>;
    /**
     * Get full table state. Hole cards only for forPlayerAddress.
     */
    getTableState(tableId: string, forPlayerAddress: string | null): Promise<PokerTableState>;
    /**
     * Player action: fold, check, call, bet, raise.
     */
    playerAction(tableId: string, handId: string, playerAddress: string, action: string, amount?: string): Promise<PokerTableState>;
    private getCurrentBetToCall;
    private getPlayerAtPosition;
    private getMinRaise;
    private advanceOrShowdown;
    private firstActivePosition;
    private nextActiveSeatPosition;
    private nextActivePosition;
    private haveAllActedThisStreet;
    private getDeckForHand;
    private runShowdown;
    private tryStartNextHand;
    private broadcastState;
    /**
     * Start a new hand. Requires 2+ players with stack > 0.
     * Deal order (provably fair): hole1 P0, hole2 P0, hole1 P1, hole2 P1, ... then flop 3, turn 1, river 1.
     */
    startHand(tableId: string): Promise<PokerTableState | null>;
}
//# sourceMappingURL=poker-game.service.d.ts.map