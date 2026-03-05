import { DatabaseService } from './database.service';
import { BlackjackGameService } from './blackjack-game.service';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';
export declare class WebSocketService {
    private gameService;
    private dbService;
    private wss;
    private clients;
    private roomToClients;
    private chatMessageTimestampsByAddress;
    private heartbeatInterval;
    private chatRateLimitCleanupInterval;
    private publicClient;
    private contractAddress;
    private tournamentService?;
    private pokerGameService;
    private betLimitsCache;
    constructor(server: any, gameService: BlackjackGameService, dbService: DatabaseService, tournamentService?: TournamentService, pokerGameService?: PokerGameService | null);
    /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
    private cleanupChatRateLimitMap;
    /** Resolve Blackjack min/max bet from admin config (cached). Uses defaults if missing/invalid. */
    private getBetLimits;
    /** Returns false if over per-address limit; otherwise records the message and returns true. */
    private checkPerAddressChatLimit;
    private handleConnection;
    private handleMessage;
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
    private handlePokerAction;
    private handlePokerGetState;
    private handleGetChatHistory;
    private handleSetDisplayName;
    private handleGetProfile;
    private handleChatMessage;
    private sendMessage;
    private sendError;
    private broadcastToPlayer;
    private broadcastToAll;
    private broadcastToRoom;
    /** Called by admin API when a message is soft-deleted; notifies all clients in the room. */
    broadcastChatMessageDeleted(roomId: string, messageId: string): void;
    getConnectionCount(): number;
    getActivePlayersCount(): Promise<number>;
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
}
//# sourceMappingURL=websocket.service.d.ts.map