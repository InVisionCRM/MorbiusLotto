import { DatabaseService } from './database.service';
import { BlackjackGameService } from './blackjack-game.service';
import { TournamentService } from './tournament.service';
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
    constructor(server: any, gameService: BlackjackGameService, dbService: DatabaseService, tournamentService?: TournamentService);
    /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
    private cleanupChatRateLimitMap;
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
    private handleSyncBalance;
    private handleGetBalance;
    private handleGetGameState;
    private handleJoinRoom;
    private handleGetChatHistory;
    private handleSetDisplayName;
    private handleGetProfile;
    private handleChatMessage;
    private sendMessage;
    private sendError;
    private broadcastToPlayer;
    private broadcastToAll;
    private broadcastToRoom;
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
    private handleTournamentRebuy;
    private handleTournamentGetInfo;
    private handleFreerollList;
    private handleFreerollRegister;
    private handleFreerollJoin;
    private handleFreerollReentry;
    private handleTournamentEntriesList;
    private getPrizePercentagesForType;
    shutdown(): void;
}
//# sourceMappingURL=websocket.service.d.ts.map