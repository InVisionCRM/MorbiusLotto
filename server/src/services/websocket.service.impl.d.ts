import { DatabaseService } from './database.service';
import { BlackjackGameService } from './blackjack-game.service';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';
import { PokerTournamentService } from './poker-tournament.service';
import { BlackjackMultiGameService } from './blackjack-multi-game.service';
import { AuthService } from './auth.service';
interface WebSocketMessage {
    type: string;
    payload: any;
    requestId?: string;
}
export declare class WebSocketService {
    private gameService;
    private dbService;
    private wss;
    private clients;
    private roomToClients;
    private chatMessageTimestampsByAddress;
    private heartbeatInterval;
    private chatRateLimitCleanupInterval;
    private pokerAutoFoldInterval;
    private pokerServerBotInterval;
    private publicClient;
    private contractAddress;
    private tournamentService?;
    private pokerGameService;
    private pokerTournamentService;
    private bjMultiService;
    private bjMultiTimerInterval;
    private bjMultiActionTimestamps;
    private betLimitsCache;
    private authService;
    constructor(server: any, gameService: BlackjackGameService, dbService: DatabaseService, tournamentService?: TournamentService, pokerGameService?: PokerGameService | null, bjMultiService?: BlackjackMultiGameService | null, authService?: AuthService | null);
    /** Wire in the PokerTournamentService after construction. */
    setPokerTournamentService(service: PokerTournamentService): void;
    /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
    private cleanupChatRateLimitMap;
    /** Resolve Blackjack min/max bet from admin config (cached). Uses defaults if missing/invalid. */
    private getBetLimits;
    /** Returns false if over per-address limit; otherwise records the message and returns true. */
    private checkPerAddressChatLimit;
    private handleConnection;
    private handleMessage;
    private routeAuthMessage;
    private routePublicMessage;
    private routeBlackjackMessage;
    private routeChatMessage;
    private routeTournamentMessage;
    private routePokerMessage;
    private routeBJMultiMessage;
    private dispatchDomainMessage;
    private handlePing;
    /**
     * Check if client is authenticated. If not, send error and return false.
     * In grace period (REQUIRE_WS_AUTH=false), accepts legacy query-param auth.
     */
    private requireAuth;
    /**
     * Handle EIP-712 auth response from client.
     * Client signs the nonce we sent in auth_challenge to prove wallet ownership.
     */
    private handleAuthResponse;
    private handleGetServerSeedHash;
    private handleCreateGame;
    private handlePlayerAction;
    /**
     * Resolve any pending withdrawals for a player by checking on-chain nonce usage.
     * If the nonce was used (withdrawal succeeded on-chain), marks it completed (no refund).
     * If the nonce was NOT used, leaves it pending for the expiry cron to refund.
     */
    private resolvePendingWithdrawals;
    private handleSyncBalance;
    private handleGetBalance;
    private handleGetGameState;
    private handleJoinRoom;
    private handlePokerListTables;
    private handlePokerJoinTable;
    private handlePokerLeaveTable;
    private handlePokerAddChips;
    private handlePokerAction;
    private handlePokerShowCards;
    private handlePokerGetState;
    private handlePokerQuickReaction;
    private static readonly POKER_AVATAR_EMOTIONS;
    private handlePokerAvatarEmotion;
    private handlePokerCreateTable;
    private handlePokerUpdateTableLogo;
    private handleGetChatHistory;
    private handleSetDisplayName;
    private handleGetProfile;
    private handleChatMessage;
    private sendMessage;
    private sendError;
    private broadcastToPlayer;
    private broadcastToAll;
    broadcastToRoom(roomId: string, message: WebSocketMessage): void;
    /** Called by admin API when a message is soft-deleted; notifies all clients in the room. */
    broadcastChatMessageDeleted(roomId: string, messageId: string): void;
    /** Broadcast current poker table state to room (e.g. after API adds bots so UI updates). */
    broadcastPokerTableState(tableId: string): Promise<void>;
    private handlePokerTournamentList;
    private handlePokerTournamentCreate;
    private handlePokerTournamentJoin;
    private handlePokerTournamentGetState;
    private handlePokerTournamentCancel;
    private handlePokerTournamentForfeit;
    private handlePokerVoiceToken;
    getConnectionCount(): number;
    getActivePlayersCount(): Promise<number>;
    /**
     * WebSocket clients currently in each game’s rooms (chat + table rooms).
     * One browser tab ≈ one connection; not deduped by wallet.
     */
    getLivePresenceByGame(): {
        poker: number;
        blackjackMulti: number;
        blackjack: number;
        plinko: number;
        keno: number;
        lottery: number;
        bigWheel: number;
    };
    private handleCheckExclusionStatus;
    private handleSetExclusion;
    private handleGetExclusionHistory;
    isPlayerExcluded(playerAddress: string): Promise<boolean>;
    private handleTournamentEnter;
    private handleTournamentLeave;
    private handleGetTournamentState;
    private handleTournamentGameStart;
    private handleTournamentPlayerAction;
    private handleTournamentLeaderboard;
    private handleTournamentLeaderboardById;
    private handleGetTournamentInfo;
    private broadcastTournamentLeaderboardUpdate;
    private handleTournamentCreate;
    private handleCreateFreeroll;
    private handleTournamentList;
    private handleTournamentJoin;
    private handleTournamentUnregister;
    private handleTournamentGetInfo;
    private handleFreerollList;
    private handleFreerollRegister;
    private handleFreerollJoin;
    private handleTournamentEntriesList;
    private handleCreatorTournaments;
    private handleCreatorEarnings;
    private handleTournamentCancel;
    private handleTournamentReclaim;
    private handleRecentGlobalWins;
    private getPrizePercentagesForType;
    shutdown(): void;
    /** Broadcast current BJ multi table state to room. */
    broadcastBJMultiTableState(tableId: string): Promise<void>;
    /** Timer tick: check for expired turns and betting timeouts across all active BJ multi tables. */
    private tickBJMultiTimers;
    private handleBJMultiListTables;
    private handleBJMultiJoinTable;
    private handleBJMultiLeaveTable;
    private handleBJMultiPlaceBet;
    private handleBJMultiAction;
    private handleBJMultiGetState;
    private handleBJMultiTipDealer;
    /**
     * Generic tip dealer — works from any game page (solo blackjack, poker, etc.)
     * Deducts from player balance and credits the deployer wallet.
     */
    private handleGenericTipDealer;
    private handleBJMultiTableHistory;
    /** Auto-stand a disconnected player if it's currently their turn. */
    private handleBJMultiDisconnect;
    private handleBJMultiCreateTable;
    private handleBJMultiDeleteTable;
    private handleBJMultiQuickReaction;
    private handleBJMultiAvatarEmotion;
}
export {};
//# sourceMappingURL=websocket.service.d.ts.map