"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const tournament_service_1 = require("./tournament.service");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const blackjack_1 = require("../abi/blackjack");
// Allowed chat rooms: main (home) + per-game
const ALLOWED_CHAT_ROOMS = new Set([
    'main',
    'blackjack',
    'plinko',
    'keno',
    'lottery',
    'bigwheel',
    'morb-it'
]);
const CHAT_MAX_LENGTH = 500;
const CHAT_RATE_LIMIT_MS = 2000; // min 2s between messages per connection
const CHAT_RECENT_MESSAGES_LIMIT = 50;
const CHAT_PER_ADDRESS_MAX = 20; // max messages per wallet per window
const CHAT_PER_ADDRESS_WINDOW_MS = 60_000; // 1 minute
const CHAT_PER_ADDRESS_CLEANUP_MS = 120_000; // prune stale entries every 2 min
const CHAT_DISPLAY_NAME_MIN_LEN = 3;
const CHAT_DISPLAY_NAME_MAX_LEN = 32;
// Bet limits (in MORBIUS, 18 decimals)
const BET_LIMITS = {
    MIN_BET: BigInt('1000000000000000000'), // 1 MORBIUS
    MAX_BET: BigInt('100000000000000000000000'), // 100,000 MORBIUS
};
class WebSocketService {
    gameService;
    dbService;
    wss;
    clients = new Map();
    roomToClients = new Map(); // roomId -> Set<connectionId>
    chatMessageTimestampsByAddress = new Map(); // per-address rate limit
    heartbeatInterval;
    chatRateLimitCleanupInterval;
    publicClient;
    contractAddress;
    tournamentService;
    constructor(server, gameService, dbService, tournamentService) {
        this.gameService = gameService;
        this.dbService = dbService;
        this.tournamentService = tournamentService;
        this.wss = new ws_1.WebSocketServer({ server });
        // Initialize public client for reading contract state
        this.publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
        });
        this.contractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080');
        this.wss.on('connection', this.handleConnection.bind(this));
        // Heartbeat to keep connections alive
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((client) => {
                if (!client.isAlive) {
                    client.terminate();
                    return;
                }
                client.isAlive = false;
                client.ping();
            });
        }, 30000);
        // Periodic cleanup of per-address chat rate limit (prune stale entries)
        this.chatRateLimitCleanupInterval = setInterval(() => {
            this.cleanupChatRateLimitMap();
        }, CHAT_PER_ADDRESS_CLEANUP_MS);
        logger_1.logger.info('WebSocket service initialized');
    }
    /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
    cleanupChatRateLimitMap() {
        const now = Date.now();
        const cutoff = now - CHAT_PER_ADDRESS_WINDOW_MS;
        for (const [address, timestamps] of this.chatMessageTimestampsByAddress.entries()) {
            const kept = timestamps.filter(t => t > cutoff);
            if (kept.length === 0) {
                this.chatMessageTimestampsByAddress.delete(address);
            }
            else {
                this.chatMessageTimestampsByAddress.set(address, kept);
            }
        }
    }
    /** Returns false if over per-address limit; otherwise records the message and returns true. */
    checkPerAddressChatLimit(address, now) {
        const key = address.toLowerCase();
        let timestamps = this.chatMessageTimestampsByAddress.get(key) ?? [];
        const cutoff = now - CHAT_PER_ADDRESS_WINDOW_MS;
        timestamps = timestamps.filter(t => t > cutoff);
        if (timestamps.length >= CHAT_PER_ADDRESS_MAX) {
            return false;
        }
        timestamps.push(now);
        this.chatMessageTimestampsByAddress.set(key, timestamps);
        return true;
    }
    async handleConnection(ws, request) {
        const connectionId = (0, uuid_1.v4)();
        ws.connectionId = connectionId;
        ws.isAlive = true;
        // Extract player address from query parameters and normalize to lowercase
        const url = new URL(request.url || '', 'http://localhost');
        const playerAddress = url.searchParams.get('address')?.toLowerCase();
        // IMPORTANT: attach handlers immediately. If we await DB calls before registering
        // ws.on('message'), early client requests (like get_balance right after connect)
        // can be dropped and will timeout client-side.
        ws.on('message', (data) => this.handleMessage(ws, data));
        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            ws.isAlive = true;
            if (ws.connectionId) {
                this.dbService.updateConnectionPing(ws.connectionId);
            }
        });
        // Handle disconnection
        ws.on('close', () => {
            if (ws.connectionId) {
                if (ws.currentRoom) {
                    const set = this.roomToClients.get(ws.currentRoom);
                    if (set) {
                        set.delete(ws.connectionId);
                        if (set.size === 0)
                            this.roomToClients.delete(ws.currentRoom);
                    }
                }
                this.clients.delete(ws.connectionId);
                this.dbService.removeActiveConnection(ws.connectionId);
                logger_1.logger.info('WebSocket connection closed', { connectionId: ws.connectionId });
            }
        });
        // Handle errors
        ws.on('error', (error) => {
            logger_1.logger.error('WebSocket error', { connectionId: ws.connectionId, error });
        });
        if (playerAddress) {
            ws.playerAddress = playerAddress;
            try {
                // active_connections expects a UUID player_id (players.id), not a wallet address
                const player = await this.dbService.getOrCreatePlayer(playerAddress);
                await this.dbService.addActiveConnection(player.id, connectionId);
                logger_1.logger.info('WebSocket connection established', { connectionId, playerAddress: player.wallet_address, playerId: player.id });
            }
            catch (error) {
                // Don't crash the server if connection tracking fails
                logger_1.logger.error('Failed to track active connection', { connectionId, playerAddress, error });
            }
        }
        else {
            logger_1.logger.warn('WebSocket connection without player address', { connectionId });
        }
        this.clients.set(connectionId, ws);
        // Send welcome message
        this.sendMessage(ws, {
            type: 'connection_established',
            payload: { connectionId, playerAddress }
        });
    }
    async handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());
            logger_1.logger.debug('Received WebSocket message', {
                type: message.type,
                connectionId: ws.connectionId,
                requestId: message.requestId
            });
            switch (message.type) {
                case 'get_server_seed_hash':
                    await this.handleGetServerSeedHash(ws, message);
                    break;
                case 'create_game':
                    await this.handleCreateGame(ws, message);
                    break;
                case 'player_action':
                    await this.handlePlayerAction(ws, message);
                    break;
                case 'get_game_state':
                    await this.handleGetGameState(ws, message);
                    break;
                case 'sync_balance':
                    await this.handleSyncBalance(ws, message);
                    break;
                case 'get_balance':
                    await this.handleGetBalance(ws, message);
                    break;
                case 'ping':
                    this.sendMessage(ws, { type: 'pong', payload: {}, requestId: message.requestId });
                    break;
                case 'join_room':
                    await this.handleJoinRoom(ws, message);
                    break;
                case 'chat_message':
                    await this.handleChatMessage(ws, message);
                    break;
                case 'set_display_name':
                    await this.handleSetDisplayName(ws, message);
                    break;
                case 'get_profile':
                    await this.handleGetProfile(ws, message);
                    break;
                case 'get_chat_history':
                    await this.handleGetChatHistory(ws, message);
                    break;
                // Responsible Gaming / Self-Exclusion
                case 'check_exclusion_status':
                    await this.handleCheckExclusionStatus(ws, message);
                    break;
                case 'set_exclusion':
                    await this.handleSetExclusion(ws, message);
                    break;
                case 'get_exclusion_history':
                    await this.handleGetExclusionHistory(ws, message);
                    break;
                // Tournament Mode
                case 'tournament_enter':
                    await this.handleTournamentEnter(ws, message);
                    break;
                case 'tournament_leave':
                    await this.handleTournamentLeave(ws, message);
                    break;
                case 'tournament_state':
                    await this.handleGetTournamentState(ws, message);
                    break;
                case 'tournament_game_start':
                    await this.handleTournamentGameStart(ws, message);
                    break;
                case 'tournament_player_action':
                    await this.handleTournamentPlayerAction(ws, message);
                    break;
                case 'tournament_leaderboard':
                    await this.handleTournamentLeaderboard(ws, message);
                    break;
                case 'tournament_leaderboard_by_id':
                    await this.handleTournamentLeaderboardById(ws, message);
                    break;
                case 'tournament_info':
                    await this.handleGetTournamentInfo(ws, message);
                    break;
                // Tournament Creator - New handlers
                case 'tournament_create':
                    await this.handleTournamentCreate(ws, message);
                    break;
                case 'tournament_list':
                    await this.handleTournamentList(ws, message);
                    break;
                case 'tournament_join':
                    await this.handleTournamentJoin(ws, message);
                    break;
                case 'tournament_rebuy':
                    await this.handleTournamentRebuy(ws, message);
                    break;
                case 'tournament_get_info':
                    await this.handleTournamentGetInfo(ws, message);
                    break;
                case 'freeroll_list':
                    await this.handleFreerollList(ws, message);
                    break;
                case 'freeroll_register':
                    await this.handleFreerollRegister(ws, message);
                    break;
                case 'freeroll_join':
                    await this.handleFreerollJoin(ws, message);
                    break;
                case 'freeroll_reentry':
                    await this.handleFreerollReentry(ws, message);
                    break;
                default:
                    this.sendError(ws, 'Unknown message type', message.requestId);
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling WebSocket message:', error);
            this.sendError(ws, 'Invalid message format', undefined);
        }
    }
    async handleGetServerSeedHash(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            // Get or create player
            const player = await this.dbService.getOrCreatePlayer(ws.playerAddress);
            // Get or create active session
            let session = await this.dbService.getActiveSession(player.id);
            if (!session) {
                const serverSeed = this.gameService['pfService'].generateServerSeed();
                const serverSeedHash = this.gameService['pfService'].createServerSeedHash(serverSeed);
                session = await this.dbService.createGameSession(player.id, serverSeed, serverSeedHash);
            }
            // Return server seed hash and next nonce
            const nextNonce = session.game_count + 1;
            // Ensure server seed hash is in hex format (0x prefix for contract)
            const serverSeedHash = session.server_seed_hash.startsWith('0x')
                ? session.server_seed_hash
                : '0x' + session.server_seed_hash;
            this.sendMessage(ws, {
                type: 'server_seed_hash',
                payload: {
                    serverSeedHash,
                    nonce: nextNonce
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting server seed hash:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleCreateGame(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            // Check if player is self-excluded
            const exclusionStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            if (exclusionStatus.isExcluded) {
                const expiryMsg = exclusionStatus.expiresAt
                    ? ` until ${exclusionStatus.expiresAt.toISOString()}`
                    : ' (permanent)';
                return this.sendError(ws, `Account is self-excluded${expiryMsg}. Gaming is disabled during this period.`, message.requestId);
            }
            const payload = message.payload;
            // Convert betAmount from string to bigint if needed
            let betAmount;
            try {
                if (typeof payload.betAmount === 'string') {
                    betAmount = BigInt(payload.betAmount);
                }
                else if (typeof payload.betAmount === 'bigint') {
                    betAmount = payload.betAmount;
                }
                else {
                    betAmount = BigInt(payload.betAmount || '0');
                }
            }
            catch (error) {
                logger_1.logger.error('Invalid betAmount format', { payload, error });
                return this.sendError(ws, 'Invalid bet amount format', message.requestId);
            }
            // Validate bet amount is within limits
            if (betAmount < BET_LIMITS.MIN_BET) {
                return this.sendError(ws, `Bet amount too small. Minimum bet is ${BET_LIMITS.MIN_BET.toString()} (1 MORBIUS)`, message.requestId);
            }
            if (betAmount > BET_LIMITS.MAX_BET) {
                return this.sendError(ws, `Bet amount too large. Maximum bet is ${BET_LIMITS.MAX_BET.toString()} (100,000 MORBIUS)`, message.requestId);
            }
            // Validate player has sufficient off-chain balance
            try {
                const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
                if (balance < betAmount) {
                    return this.sendError(ws, `Insufficient balance. You have ${balance.toString()}, but need ${betAmount.toString()}`, message.requestId);
                }
            }
            catch (error) {
                logger_1.logger.error('Error checking player balance:', error);
                return this.sendError(ws, 'Failed to verify balance. Please try again.', message.requestId);
            }
            logger_1.logger.debug('Creating game', {
                playerAddress: ws.playerAddress,
                betAmount: betAmount.toString(),
                clientSeedCommitment: payload.clientSeedCommitment,
                gameHash: payload.gameHash,
                requestId: message.requestId
            });
            const gameState = await this.gameService.createGame({
                playerAddress: ws.playerAddress,
                betAmount,
                clientSeedCommitment: payload.clientSeedCommitment,
                gameHash: payload.gameHash
            });
            logger_1.logger.debug('Game created successfully', {
                gameId: gameState.gameId,
                requestId: message.requestId
            });
            this.sendMessage(ws, {
                type: 'game_created',
                payload: gameState,
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error creating game:', {
                error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                playerAddress: ws.playerAddress,
                requestId: message.requestId,
                payload: message.payload
            });
            const errorMessage = error instanceof Error
                ? (error.message || 'Failed to create game')
                : (String(error) || 'Unknown error occurred');
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handlePlayerAction(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            const payload = message.payload;
            const gameState = await this.gameService.handlePlayerAction(payload);
            this.sendMessage(ws, {
                type: 'game_updated',
                payload: gameState,
                requestId: message.requestId
            });
            // If game is completed, also send settlement info as an event (not a response)
            if (gameState.status === 'completed') {
                // Calculate overall result from hands
                const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';
                // Send as event (no requestId) - client will handle via event listener
                this.sendMessage(ws, {
                    type: 'game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        result: overallResult,
                        payout: gameState.totalPayout,
                        betAmount: gameState.totalBetAmount
                    }
                    // No requestId - this is an event, not a response
                });
                // Broadcast global_game_completed to all clients for GlobalWinsFeed
                const globalMessage = {
                    type: 'global_game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        playerAddress: ws.playerAddress || '',
                        result: overallResult,
                        payout: gameState.totalPayout.toString(),
                        betAmount: gameState.totalBetAmount.toString()
                    }
                };
                this.broadcastToAll(globalMessage);
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling player action:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleSyncBalance(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            // Get contract reserve balance
            const contractBalance = await this.publicClient.readContract({
                address: this.contractAddress,
                abi: blackjack_1.blackjackAbi,
                functionName: 'getPlayerReserve',
                args: [ws.playerAddress]
            });
            // Sync off-chain balance with contract
            await this.dbService.syncPlayerBalanceWithContract(ws.playerAddress, contractBalance);
            logger_1.logger.debug('Balance synced', {
                playerAddress: ws.playerAddress,
                contractBalance: contractBalance.toString()
            });
            this.sendMessage(ws, {
                type: 'balance_synced',
                payload: {
                    balance: contractBalance.toString()
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error syncing balance:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to sync balance';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleGetBalance(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            // Get off-chain balance
            const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'balance',
                payload: {
                    balance: balance.toString()
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting balance:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to get balance';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleGetGameState(ws, message) {
        try {
            const { gameId } = message.payload;
            if (!gameId) {
                return this.sendError(ws, 'Game ID required', message.requestId);
            }
            const gameResult = await this.gameService.getGameResult(gameId);
            if (!gameResult) {
                return this.sendError(ws, 'Game not found or not completed', message.requestId);
            }
            this.sendMessage(ws, {
                type: 'game_result',
                payload: gameResult,
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting game state:', error);
            this.sendError(ws, 'Failed to get game state', message.requestId);
        }
    }
    async handleJoinRoom(ws, message) {
        try {
            const { roomId } = message.payload;
            if (!roomId || typeof roomId !== 'string') {
                return this.sendError(ws, 'roomId required', message.requestId);
            }
            const normalized = roomId.toLowerCase().trim();
            if (!ALLOWED_CHAT_ROOMS.has(normalized)) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            if (ws.currentRoom && ws.connectionId) {
                const prevSet = this.roomToClients.get(ws.currentRoom);
                if (prevSet) {
                    prevSet.delete(ws.connectionId);
                    if (prevSet.size === 0)
                        this.roomToClients.delete(ws.currentRoom);
                }
            }
            ws.currentRoom = normalized;
            if (!this.roomToClients.has(normalized)) {
                this.roomToClients.set(normalized, new Set());
            }
            this.roomToClients.get(normalized).add(ws.connectionId);
            const recent = await this.dbService.getRecentChatMessages(normalized, CHAT_RECENT_MESSAGES_LIMIT);
            const addresses = [...new Set(recent.map(m => m.sender_address).filter(Boolean))];
            const displayNames = await this.dbService.getDisplayNames(addresses);
            this.sendMessage(ws, {
                type: 'room_joined',
                payload: {
                    roomId: normalized,
                    recentMessages: recent.map(m => ({
                        id: m.id,
                        roomId: m.room_id,
                        senderAddress: m.sender_address,
                        displayName: m.sender_address ? displayNames.get(m.sender_address.toLowerCase()) ?? null : null,
                        text: m.text,
                        timestamp: m.created_at
                    }))
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error joining room:', error);
            this.sendError(ws, 'Failed to join room', message.requestId);
        }
    }
    async handleGetChatHistory(ws, message) {
        try {
            const payload = message.payload;
            const { roomId, beforeId, limit } = payload ?? {};
            if (!roomId || typeof roomId !== 'string') {
                return this.sendError(ws, 'roomId required', message.requestId);
            }
            if (!beforeId || typeof beforeId !== 'string') {
                return this.sendError(ws, 'beforeId required', message.requestId);
            }
            const normalized = roomId.toLowerCase().trim();
            if (!ALLOWED_CHAT_ROOMS.has(normalized)) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            const limitNum = typeof limit === 'number' && limit > 0 && limit <= CHAT_RECENT_MESSAGES_LIMIT
                ? limit
                : 50;
            const older = await this.dbService.getChatMessagesBefore(normalized, beforeId, limitNum);
            const addresses = [...new Set(older.map(m => m.sender_address).filter(Boolean))];
            const displayNames = await this.dbService.getDisplayNames(addresses);
            const messages = older.map(m => ({
                id: m.id,
                roomId: m.room_id,
                senderAddress: m.sender_address,
                displayName: m.sender_address ? displayNames.get(m.sender_address.toLowerCase()) ?? null : null,
                text: m.text,
                timestamp: m.created_at
            }));
            this.sendMessage(ws, {
                type: 'chat_history',
                payload: { messages },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting chat history:', error);
            this.sendError(ws, 'Failed to load older messages', message.requestId);
        }
    }
    async handleSetDisplayName(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required to set display name', message.requestId);
            }
            const payload = message.payload;
            const raw = payload?.displayName;
            if (raw === undefined || raw === null || typeof raw !== 'string') {
                return this.sendError(ws, 'displayName required', message.requestId);
            }
            const trimmed = raw.trim();
            if (trimmed.length < CHAT_DISPLAY_NAME_MIN_LEN) {
                return this.sendError(ws, `Display name must be at least ${CHAT_DISPLAY_NAME_MIN_LEN} characters`, message.requestId);
            }
            if (trimmed.length > CHAT_DISPLAY_NAME_MAX_LEN) {
                return this.sendError(ws, `Display name must be at most ${CHAT_DISPLAY_NAME_MAX_LEN} characters`, message.requestId);
            }
            // Allow letters, numbers, spaces, hyphens, underscores
            const sanitized = trimmed.replace(/[^\w\s-]/gi, '').replace(/\s+/g, ' ').trim();
            if (sanitized.length < CHAT_DISPLAY_NAME_MIN_LEN) {
                return this.sendError(ws, 'Display name contains invalid characters', message.requestId);
            }
            const displayName = sanitized.slice(0, CHAT_DISPLAY_NAME_MAX_LEN);
            const profileImageUrl = payload.profileImageUrl !== undefined
                ? (typeof payload.profileImageUrl === 'string' ? payload.profileImageUrl : null)
                : undefined;
            await this.dbService.setDisplayName(ws.playerAddress, displayName, profileImageUrl);
            const profile = await this.dbService.getProfile(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'display_name_set',
                payload: {
                    displayName,
                    profileImageUrl: profile?.profileImageUrl ?? null
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error setting display name:', error);
            this.sendError(ws, 'Failed to set display name', message.requestId);
        }
    }
    async handleGetProfile(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required to get profile', message.requestId);
            }
            const profile = await this.dbService.getProfile(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'profile',
                payload: profile
                    ? { displayName: profile.displayName, profileImageUrl: profile.profileImageUrl }
                    : { displayName: null, profileImageUrl: null },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting profile:', error);
            this.sendError(ws, 'Failed to get profile', message.requestId);
        }
    }
    async handleChatMessage(ws, message) {
        try {
            const payload = message.payload;
            const { roomId, text } = payload ?? {};
            if (!roomId || typeof roomId !== 'string') {
                return this.sendError(ws, 'roomId required', message.requestId);
            }
            if (text === undefined || text === null || typeof text !== 'string') {
                return this.sendError(ws, 'text required', message.requestId);
            }
            const trimmed = text.trim();
            if (trimmed.length === 0) {
                return this.sendError(ws, 'Message cannot be empty', message.requestId);
            }
            if (trimmed.length > CHAT_MAX_LENGTH) {
                return this.sendError(ws, `Message too long (max ${CHAT_MAX_LENGTH})`, message.requestId);
            }
            const normalizedRoom = roomId.toLowerCase().trim();
            if (!ALLOWED_CHAT_ROOMS.has(normalizedRoom)) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            if (ws.currentRoom !== normalizedRoom) {
                return this.sendError(ws, 'Not in this room', message.requestId);
            }
            const now = Date.now();
            if (ws.lastChatMessageAt != null && now - ws.lastChatMessageAt < CHAT_RATE_LIMIT_MS) {
                return this.sendError(ws, 'Please wait before sending another message', message.requestId);
            }
            ws.lastChatMessageAt = now;
            const senderAddress = ws.playerAddress ?? null;
            // Per-address limit (across all tabs/connections) so one wallet can't spam
            if (senderAddress) {
                if (!this.checkPerAddressChatLimit(senderAddress, now)) {
                    return this.sendError(ws, 'Too many messages. Try again in a minute.', message.requestId);
                }
            }
            const row = await this.dbService.insertChatMessage(normalizedRoom, senderAddress, trimmed);
            const displayName = row.sender_address
                ? await this.dbService.getDisplayName(row.sender_address)
                : null;
            const broadcastPayload = {
                id: row.id,
                roomId: row.room_id,
                senderAddress: row.sender_address,
                displayName,
                text: row.text,
                timestamp: row.created_at
            };
            this.broadcastToRoom(normalizedRoom, {
                type: 'chat_message',
                payload: broadcastPayload
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending chat message:', error);
            this.sendError(ws, 'Failed to send message', message.requestId);
        }
    }
    sendMessage(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                // Convert BigInt values to strings for JSON serialization
                // This replacer handles nested objects and arrays
                const replacer = (key, value) => {
                    if (typeof value === 'bigint') {
                        return value.toString();
                    }
                    // Handle nested objects/arrays that might contain BigInt
                    if (value && typeof value === 'object') {
                        if (Array.isArray(value)) {
                            return value.map(item => typeof item === 'bigint' ? item.toString() : item);
                        }
                        // For objects, recursively process
                        const processed = {};
                        for (const k in value) {
                            if (Object.prototype.hasOwnProperty.call(value, k)) {
                                const v = value[k];
                                processed[k] = typeof v === 'bigint' ? v.toString() : v;
                            }
                        }
                        return processed;
                    }
                    return value;
                };
                const serialized = JSON.stringify(message, replacer);
                ws.send(serialized);
            }
            catch (error) {
                logger_1.logger.error('Error sending WebSocket message:', {
                    error,
                    errorMessage: error instanceof Error ? error.message : String(error),
                    messageType: message.type,
                    hasPayload: !!message.payload
                });
                // Try to send a simplified error message
                if (message.requestId) {
                    try {
                        ws.send(JSON.stringify({
                            type: 'error',
                            payload: {
                                message: 'Failed to serialize message',
                                error: error instanceof Error ? error.message : String(error)
                            },
                            requestId: message.requestId
                        }));
                    }
                    catch (sendError) {
                        logger_1.logger.error('Failed to send error message to client:', sendError);
                    }
                }
            }
        }
    }
    sendError(ws, error, requestId) {
        const errorMessage = error instanceof Error ? error.message : (error || 'Unknown error');
        this.sendMessage(ws, {
            type: 'error',
            payload: {
                message: errorMessage,
                error: errorMessage
            },
            requestId
        });
    }
    // Broadcast to all clients of a specific player
    broadcastToPlayer(playerAddress, message) {
        this.wss.clients.forEach((client) => {
            if (client.playerAddress === playerAddress && client.readyState === ws_1.WebSocket.OPEN) {
                this.sendMessage(client, message);
            }
        });
    }
    // Broadcast to all connected clients
    broadcastToAll(message) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                this.sendMessage(client, message);
            }
        });
    }
    // Broadcast to all clients in a chat room
    broadcastToRoom(roomId, message) {
        const connectionIds = this.roomToClients.get(roomId);
        if (!connectionIds)
            return;
        connectionIds.forEach((connectionId) => {
            const client = this.clients.get(connectionId);
            if (client?.readyState === ws_1.WebSocket.OPEN) {
                this.sendMessage(client, message);
            }
        });
    }
    // Get connection count
    getConnectionCount() {
        return this.wss.clients.size;
    }
    // Get active players count
    async getActivePlayersCount() {
        const result = await this.dbService.cleanupOldConnections();
        return this.wss.clients.size;
    }
    // ============================================
    // Responsible Gaming / Self-Exclusion Handlers
    // ============================================
    async handleCheckExclusionStatus(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            const status = await this.dbService.checkExclusionStatus(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'exclusion_status',
                payload: status,
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error checking exclusion status:', error);
            this.sendError(ws, 'Failed to check exclusion status', message.requestId);
        }
    }
    async handleSetExclusion(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            const payload = message.payload;
            if (!payload?.durationType) {
                return this.sendError(ws, 'Duration type required', message.requestId);
            }
            const validDurations = ['24h', '7d', '30d', '6m', '1y', 'permanent'];
            if (!validDurations.includes(payload.durationType)) {
                return this.sendError(ws, 'Invalid duration type', message.requestId);
            }
            // Check if already permanently excluded
            const currentStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            if (currentStatus.isExcluded && currentStatus.exclusionType === 'permanent') {
                return this.sendError(ws, 'Account is permanently self-excluded', message.requestId);
            }
            // Calculate expiry date
            let expiresAt = null;
            let exclusionType = 'timeout';
            const now = new Date();
            switch (payload.durationType) {
                case '24h':
                    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    break;
                case '6m':
                    expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
                    break;
                case '1y':
                    expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
                    break;
                case 'permanent':
                    expiresAt = null;
                    exclusionType = 'permanent';
                    break;
            }
            await this.dbService.setExclusion(ws.playerAddress, exclusionType, payload.durationType, expiresAt, payload.reason);
            const newStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'exclusion_set',
                payload: {
                    success: true,
                    ...newStatus
                },
                requestId: message.requestId
            });
            logger_1.logger.info('Player self-excluded', {
                playerAddress: ws.playerAddress,
                exclusionType,
                durationType: payload.durationType,
                expiresAt
            });
        }
        catch (error) {
            logger_1.logger.error('Error setting exclusion:', error);
            this.sendError(ws, 'Failed to set exclusion', message.requestId);
        }
    }
    async handleGetExclusionHistory(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            const history = await this.dbService.getExclusionHistory(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'exclusion_history',
                payload: { history },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting exclusion history:', error);
            this.sendError(ws, 'Failed to get exclusion history', message.requestId);
        }
    }
    // Helper to check if a player is excluded (call before allowing game actions)
    async isPlayerExcluded(playerAddress) {
        const status = await this.dbService.checkExclusionStatus(playerAddress);
        return status.isExcluded;
    }
    // ============================================
    // Tournament Mode Handlers
    // ============================================
    async handleTournamentEnter(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            // Check if player is self-excluded
            const exclusionStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            if (exclusionStatus.isExcluded) {
                return this.sendError(ws, 'Account is self-excluded. Gaming is disabled.', message.requestId);
            }
            const entry = await this.tournamentService.enterTournament(ws.playerAddress);
            const tournament = await this.tournamentService.getActiveTournament();
            const leaderboard = await this.tournamentService.getLeaderboard(tournament.id, 10);
            // Get initial rank
            const playerRank = leaderboard.find(e => e.entry_id === entry.id)?.current_rank ?? 1;
            this.sendMessage(ws, {
                type: 'tournament_entered',
                payload: {
                    entryId: entry.id,
                    tournamentId: entry.tournament_id,
                    chips: entry.chips_remaining,
                    handsPlayed: entry.hands_played,
                    handsRemaining: tournament.max_hands - entry.hands_played,
                    currentRank: playerRank,
                    maxHands: tournament.max_hands,
                    startingChips: tournament.starting_chips,
                    buyInAmount: tournament.buy_in_amount.toString(),
                    prizePool: tournament.prize_pool.toString(),
                },
                requestId: message.requestId
            });
            // Broadcast leaderboard update
            this.broadcastTournamentLeaderboardUpdate(tournament.id);
            logger_1.logger.info('Player entered tournament', {
                playerAddress: ws.playerAddress,
                entryId: entry.id,
                tournamentId: entry.tournament_id,
            });
        }
        catch (error) {
            logger_1.logger.error('Error entering tournament:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to enter tournament';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentLeave(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const entry = await this.tournamentService.leaveTournament(ws.playerAddress);
            if (!entry) {
                return this.sendError(ws, 'No active tournament entry found', message.requestId);
            }
            this.sendMessage(ws, {
                type: 'tournament_left',
                payload: {
                    entryId: entry.id,
                    finalChips: entry.chips_remaining,
                    handsPlayed: entry.hands_played,
                },
                requestId: message.requestId
            });
            // Broadcast leaderboard update
            this.broadcastTournamentLeaderboardUpdate(entry.tournament_id);
        }
        catch (error) {
            logger_1.logger.error('Error leaving tournament:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to leave tournament';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleGetTournamentState(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const state = await this.tournamentService.getTournamentState(ws.playerAddress);
            if (!state) {
                this.sendMessage(ws, {
                    type: 'tournament_state',
                    payload: { inTournament: false },
                    requestId: message.requestId
                });
                return;
            }
            this.sendMessage(ws, {
                type: 'tournament_state',
                payload: {
                    inTournament: true,
                    entryId: state.entryId,
                    tournamentId: state.tournamentId,
                    chips: state.chips,
                    handsPlayed: state.handsPlayed,
                    handsRemaining: state.handsRemaining,
                    highestChips: state.highestChips,
                    currentRank: state.currentRank,
                    status: state.status,
                    maxHands: state.maxHands,
                    startingChips: state.startingChips,
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament state:', error);
            this.sendError(ws, 'Failed to get tournament state', message.requestId);
        }
    }
    async handleTournamentGameStart(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload.betAmount || typeof payload.betAmount !== 'number') {
                return this.sendError(ws, 'Bet amount required', message.requestId);
            }
            // Get tournament entry
            const state = await this.tournamentService.getTournamentState(ws.playerAddress);
            if (!state) {
                return this.sendError(ws, 'No active tournament entry', message.requestId);
            }
            if (state.status !== 'playing') {
                return this.sendError(ws, 'Tournament entry is not active', message.requestId);
            }
            // Validate bet
            const validation = this.tournamentService.validateTournamentBet(state.chips, payload.betAmount);
            if (!validation.valid) {
                return this.sendError(ws, validation.error, message.requestId);
            }
            // Create tournament game
            const gameState = await this.gameService.createTournamentGame({
                playerAddress: ws.playerAddress,
                betAmount: payload.betAmount,
                entryId: state.entryId,
                clientSeedCommitment: payload.clientSeedCommitment,
            });
            this.sendMessage(ws, {
                type: 'tournament_game_created',
                payload: gameState,
                requestId: message.requestId
            });
            // If game completed immediately (blackjack), broadcast leaderboard update
            if (gameState.status === 'completed') {
                this.broadcastTournamentLeaderboardUpdate(state.tournamentId);
                // Check if player busted or completed
                if (gameState.tournamentChips <= 0) {
                    this.sendMessage(ws, {
                        type: 'tournament_busted',
                        payload: {
                            entryId: state.entryId,
                            handsPlayed: gameState.handsPlayed,
                            highestChips: state.highestChips,
                        }
                    });
                }
                else if (gameState.handsRemaining <= 0) {
                    this.sendMessage(ws, {
                        type: 'tournament_completed',
                        payload: {
                            entryId: state.entryId,
                            finalChips: gameState.tournamentChips,
                            handsPlayed: gameState.handsPlayed,
                            currentRank: gameState.currentRank,
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error starting tournament game:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to start tournament game';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentPlayerAction(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload.gameId || !payload.action) {
                return this.sendError(ws, 'Game ID and action required', message.requestId);
            }
            // Get tournament entry
            const state = await this.tournamentService.getTournamentState(ws.playerAddress);
            if (!state) {
                return this.sendError(ws, 'No active tournament entry', message.requestId);
            }
            const gameState = await this.gameService.handleTournamentPlayerAction(payload.gameId, payload.action, state.entryId, payload.handIndex);
            this.sendMessage(ws, {
                type: 'tournament_game_updated',
                payload: gameState,
                requestId: message.requestId
            });
            // If game completed, send additional notifications
            if (gameState.status === 'completed') {
                this.broadcastTournamentLeaderboardUpdate(state.tournamentId);
                // Check for bust or completion
                if (gameState.tournamentChips <= 0) {
                    this.sendMessage(ws, {
                        type: 'tournament_busted',
                        payload: {
                            entryId: state.entryId,
                            handsPlayed: gameState.handsPlayed,
                            highestChips: state.highestChips,
                        }
                    });
                    // Broadcast bust to all clients
                    this.broadcastToAll({
                        type: 'tournament_player_busted',
                        payload: {
                            playerAddress: ws.playerAddress,
                            handsPlayed: gameState.handsPlayed,
                        }
                    });
                }
                else if (gameState.handsRemaining <= 0) {
                    this.sendMessage(ws, {
                        type: 'tournament_completed',
                        payload: {
                            entryId: state.entryId,
                            finalChips: gameState.tournamentChips,
                            handsPlayed: gameState.handsPlayed,
                            currentRank: gameState.currentRank,
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling tournament player action:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentLeaderboard(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            let tournamentId = payload?.tournamentId;
            if (!tournamentId) {
                const tournament = await this.tournamentService.getActiveTournament();
                tournamentId = tournament.id;
            }
            const limit = payload?.limit ?? 50;
            const leaderboard = await this.tournamentService.getLeaderboard(tournamentId, limit);
            // Get player's entry if connected
            let playerEntry;
            if (ws.playerAddress) {
                const state = await this.tournamentService.getTournamentState(ws.playerAddress);
                if (state && state.tournamentId === tournamentId) {
                    playerEntry = leaderboard.find(e => e.entry_id === state.entryId);
                    if (!playerEntry) {
                        // Player might not be in top N, fetch their entry separately
                        playerEntry = {
                            entry_id: state.entryId,
                            player_address: ws.playerAddress,
                            chips_remaining: state.chips,
                            hands_played: state.handsPlayed,
                            highest_chip_count: state.highestChips,
                            status: state.status,
                            current_rank: state.currentRank,
                        };
                    }
                }
            }
            this.sendMessage(ws, {
                type: 'tournament_leaderboard',
                payload: {
                    tournamentId,
                    leaderboard,
                    playerEntry,
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament leaderboard:', error);
            this.sendError(ws, 'Failed to get leaderboard', message.requestId);
        }
    }
    async handleTournamentLeaderboardById(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const { payload } = message;
            const tournamentId = payload?.tournamentId;
            if (!tournamentId) {
                return this.sendError(ws, 'Tournament ID required', message.requestId);
            }
            const limit = payload?.limit ?? 10;
            const leaderboard = await this.tournamentService.getLeaderboard(tournamentId, limit);
            this.sendMessage(ws, {
                type: 'tournament_leaderboard_by_id',
                payload: {
                    tournamentId,
                    leaderboard,
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament leaderboard by ID:', error);
            this.sendError(ws, 'Failed to get leaderboard', message.requestId);
        }
    }
    async handleGetTournamentInfo(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const tournament = await this.tournamentService.getActiveTournament();
            const entryCount = await this.tournamentService.getTournamentEntryCount(tournament.id);
            this.sendMessage(ws, {
                type: 'tournament_info',
                payload: {
                    tournamentId: tournament.id,
                    name: tournament.name,
                    status: tournament.status,
                    buyInAmount: tournament.buy_in_amount.toString(),
                    startingChips: tournament.starting_chips,
                    maxHands: tournament.max_hands,
                    prizePool: tournament.prize_pool.toString(),
                    entryCount,
                    config: {
                        minBet: tournament_service_1.TOURNAMENT_CONFIG.MIN_BET,
                        maxBet: tournament_service_1.TOURNAMENT_CONFIG.MAX_BET,
                        prizePercentages: tournament_service_1.TOURNAMENT_CONFIG.PRIZE_PERCENTAGES,
                    }
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament info:', error);
            this.sendError(ws, 'Failed to get tournament info', message.requestId);
        }
    }
    async broadcastTournamentLeaderboardUpdate(tournamentId) {
        if (!this.tournamentService)
            return;
        try {
            const leaderboard = await this.tournamentService.getLeaderboard(tournamentId, 10);
            this.broadcastToAll({
                type: 'tournament_leaderboard_update',
                payload: {
                    tournamentId,
                    leaderboard,
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error broadcasting tournament leaderboard:', error);
        }
    }
    // ============================================
    // Tournament Creator Handlers
    // ============================================
    async handleTournamentCreate(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            // Convert buyInAmount string to bigint
            let buyInAmount;
            try {
                buyInAmount = BigInt(payload.buyInAmount);
            }
            catch {
                return this.sendError(ws, 'Invalid buy-in amount', message.requestId);
            }
            const tournament = await this.tournamentService.createTournament({
                creatorAddress: ws.playerAddress,
                name: payload.name,
                buyInAmount,
                startingChips: payload.startingChips,
                maxHands: payload.maxHands,
                timeLimitMinutes: payload.timeLimitMinutes,
                rebuyConfig: payload.rebuyConfig,
                tableTheme: payload.tableTheme,
                isPrivate: payload.isPrivate,
                prizeDistributionType: payload.prizeDistributionType,
                customPrizePercentages: payload.customPrizePercentages,
                maxPlayers: payload.maxPlayers,
                customImage: payload.customImage,
                prizeTokenAddress: payload.prizeTokenAddress,
                prizeAmount: payload.prizeAmount,
                prizeTokenDecimals: payload.prizeTokenDecimals,
                pinCode: payload.pinCode,
            });
            // Determine prize percentages for response
            const prizePercentages = this.getPrizePercentagesForType(tournament.prize_distribution_type, tournament.prize_percentages);
            this.sendMessage(ws, {
                type: 'tournament_created',
                payload: {
                    tournamentId: tournament.id,
                    name: tournament.name,
                    pinCode: tournament.is_private ? tournament.pin_code : undefined,
                    buyInAmount: tournament.buy_in_amount.toString(),
                    startingChips: tournament.starting_chips,
                    maxHands: tournament.max_hands,
                    timeLimitMinutes: tournament.time_limit_minutes,
                    endsAt: tournament.ends_at?.toISOString() || null,
                    rebuyConfig: tournament.rebuy_config,
                    tableTheme: tournament.table_theme,
                    isPrivate: tournament.is_private,
                    prizeDistributionType: tournament.prize_distribution_type,
                    prizePercentages,
                    prizeTokenAddress: tournament.prize_token_address ?? undefined,
                    prizeTokenDecimals: tournament.prize_token_decimals ?? undefined,
                },
                requestId: message.requestId
            });
            // Broadcast new tournament to all clients (except private tournaments)
            if (!tournament.is_private) {
                this.broadcastToAll({
                    type: 'tournament_created_global',
                    payload: {
                        tournamentId: tournament.id,
                        name: tournament.name,
                        creatorAddress: tournament.creator_address,
                        buyInAmount: tournament.buy_in_amount.toString(),
                        startingChips: tournament.starting_chips,
                        maxHands: tournament.max_hands,
                        timeLimitMinutes: tournament.time_limit_minutes,
                    }
                });
            }
            // Post a system message to chat so it appears in GlobalChat (Blackjack + Lobby)
            const buyInMorbius = Number(tournament.buy_in_amount) / 1e18;
            const tournamentChatText = tournament.is_private
                ? `New private tournament: "${tournament.name}" — ${buyInMorbius.toLocaleString()} MORBIUS buy-in. Join from Blackjack!`
                : `New tournament: "${tournament.name}" — ${buyInMorbius.toLocaleString()} MORBIUS buy-in. Join from Blackjack!`;
            const chatRooms = ['blackjack', 'main'];
            for (const roomId of chatRooms) {
                try {
                    const row = await this.dbService.insertChatMessage(roomId, null, tournamentChatText);
                    const broadcastPayload = {
                        id: row.id,
                        roomId: row.room_id,
                        senderAddress: row.sender_address,
                        displayName: null,
                        text: row.text,
                        timestamp: row.created_at
                    };
                    this.broadcastToRoom(roomId, {
                        type: 'chat_message',
                        payload: broadcastPayload
                    });
                }
                catch (chatErr) {
                    logger_1.logger.error('Failed to post tournament announcement to chat', { roomId, error: chatErr });
                }
            }
            logger_1.logger.info('Tournament created via WebSocket', {
                tournamentId: tournament.id,
                name: tournament.name,
                creator: ws.playerAddress,
            });
        }
        catch (error) {
            logger_1.logger.error('Error creating tournament:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create tournament';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentList(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            // Include private tournaments so creators see their own and others can discover (with PIN)
            const tournaments = await this.tournamentService.listTournaments(true);
            // Convert to response format
            const tournamentList = tournaments.map(t => ({
                id: t.id,
                name: t.name,
                creatorAddress: t.creator_address,
                buyInAmount: t.buy_in_amount.toString(),
                startingChips: t.starting_chips,
                maxHands: t.max_hands,
                prizePool: t.prize_pool.toString(),
                entryCount: t.entry_count,
                maxPlayers: t.max_players,
                timeLimitMinutes: t.time_limit_minutes,
                endsAt: t.ends_at?.toISOString() || null,
                rebuyConfig: t.rebuy_config,
                tableTheme: t.table_theme,
                isPrivate: t.is_private,
                prizeDistributionType: t.prize_distribution_type,
                prizeTokenAddress: t.prize_token_address ?? null,
                prizeTokenDecimals: t.prize_token_decimals ?? null,
                createdAt: t.created_at.toISOString(),
                customImage: t.custom_image || null,
            }));
            this.sendMessage(ws, {
                type: 'tournament_list',
                payload: { tournaments: tournamentList },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing tournaments:', error);
            this.sendError(ws, 'Failed to list tournaments', message.requestId);
        }
    }
    async handleTournamentJoin(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            // Check if player is self-excluded
            const exclusionStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            if (exclusionStatus.isExcluded) {
                return this.sendError(ws, 'Account is self-excluded. Gaming is disabled.', message.requestId);
            }
            const payload = message.payload;
            if (!payload.tournamentId) {
                return this.sendError(ws, 'Tournament ID required', message.requestId);
            }
            const entry = await this.tournamentService.joinTournament(ws.playerAddress, payload.tournamentId, payload.pinCode);
            // Get tournament details for response
            const tournamentInfo = await this.tournamentService.getTournamentInfoExtended(payload.tournamentId);
            this.sendMessage(ws, {
                type: 'tournament_joined',
                payload: {
                    entryId: entry.id,
                    tournamentId: entry.tournament_id,
                    chips: entry.chips_remaining,
                    handsPlayed: entry.hands_played,
                    handsRemaining: tournamentInfo?.tournament.max_hands ? tournamentInfo.tournament.max_hands - entry.hands_played : 0,
                    maxHands: tournamentInfo?.tournament.max_hands,
                    startingChips: tournamentInfo?.tournament.starting_chips,
                    buyInAmount: tournamentInfo?.tournament.buy_in_amount.toString(),
                    prizePool: tournamentInfo?.tournament.prize_pool.toString(),
                    tableTheme: tournamentInfo?.tournament.table_theme,
                    rebuyConfig: tournamentInfo?.tournament.rebuy_config,
                },
                requestId: message.requestId
            });
            // Broadcast leaderboard update
            this.broadcastTournamentLeaderboardUpdate(entry.tournament_id);
            logger_1.logger.info('Player joined tournament via WebSocket', {
                playerAddress: ws.playerAddress,
                tournamentId: payload.tournamentId,
                entryId: entry.id,
            });
        }
        catch (error) {
            logger_1.logger.error('Error joining tournament:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to join tournament';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentRebuy(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload.tournamentId) {
                return this.sendError(ws, 'Tournament ID required', message.requestId);
            }
            const result = await this.tournamentService.processRebuy(ws.playerAddress, payload.tournamentId);
            // Get tournament for extended info
            const tournamentInfo = await this.tournamentService.getTournamentInfoExtended(payload.tournamentId);
            this.sendMessage(ws, {
                type: 'tournament_rebuy_result',
                payload: {
                    success: true,
                    entryId: result.entry.id,
                    newChips: result.entry.chips_remaining,
                    rebuyCount: result.entry.rebuy_count,
                    totalBuyIn: result.entry.total_buy_in.toString(),
                    newPrizePool: result.newPrizePool.toString(),
                    maxRebuys: tournamentInfo?.tournament.rebuy_config.maxRebuys || 0,
                },
                requestId: message.requestId
            });
            // Broadcast leaderboard update
            this.broadcastTournamentLeaderboardUpdate(payload.tournamentId);
            logger_1.logger.info('Player rebuy processed via WebSocket', {
                playerAddress: ws.playerAddress,
                tournamentId: payload.tournamentId,
                rebuyCount: result.entry.rebuy_count,
            });
        }
        catch (error) {
            logger_1.logger.error('Error processing rebuy:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to process rebuy';
            this.sendError(ws, errorMessage, message.requestId);
        }
    }
    async handleTournamentGetInfo(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload.tournamentId) {
                return this.sendError(ws, 'Tournament ID required', message.requestId);
            }
            const info = await this.tournamentService.getTournamentInfoExtended(payload.tournamentId);
            if (!info) {
                return this.sendError(ws, 'Tournament not found', message.requestId);
            }
            this.sendMessage(ws, {
                type: 'tournament_info_extended',
                payload: {
                    tournamentId: info.tournament.id,
                    name: info.tournament.name,
                    creatorAddress: info.tournament.creator_address,
                    status: info.tournament.status,
                    buyInAmount: info.tournament.buy_in_amount.toString(),
                    startingChips: info.tournament.starting_chips,
                    maxHands: info.tournament.max_hands,
                    prizePool: info.tournament.prize_pool.toString(),
                    entryCount: info.entryCount,
                    maxPlayers: info.tournament.max_players,
                    timeLimitMinutes: info.tournament.time_limit_minutes,
                    endsAt: info.tournament.ends_at?.toISOString() || null,
                    rebuyConfig: info.tournament.rebuy_config,
                    tableTheme: info.tournament.table_theme,
                    isPrivate: info.tournament.is_private,
                    prizeDistributionType: info.tournament.prize_distribution_type,
                    prizePercentages: info.prizePercentages,
                    createdAt: info.tournament.created_at.toISOString(),
                    prizeTokenAddress: info.tournament.prize_token_address ?? null,
                    prizeTokenDecimals: info.tournament.prize_token_decimals ?? null,
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament info:', error);
            this.sendError(ws, 'Failed to get tournament info', message.requestId);
        }
    }
    async handleFreerollList(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload ?? {};
            const includePast = Boolean(payload.includePast);
            const list = await this.tournamentService.listFreerollTournaments(includePast);
            this.sendMessage(ws, {
                type: 'freeroll_list',
                payload: {
                    tournaments: list.map((t) => ({
                        ...t,
                        scheduled_start_at: t.scheduled_start_at?.toISOString() ?? null,
                        registration_opens_at: t.registration_opens_at?.toISOString() ?? null,
                        created_at: t.created_at.toISOString(),
                    })),
                },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error listing freeroll tournaments:', error);
            this.sendError(ws, error instanceof Error ? error.message : 'Failed to list freerolls', message.requestId);
        }
    }
    async handleFreerollRegister(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload?.tournamentId) {
                return this.sendError(ws, 'tournamentId required', message.requestId);
            }
            const entry = await this.tournamentService.registerFreeroll(ws.playerAddress, payload.tournamentId);
            this.sendMessage(ws, {
                type: 'freeroll_registered',
                payload: {
                    tournamentId: payload.tournamentId,
                    entryId: entry.id,
                    chips: entry.chips_remaining,
                    startingChips: entry.chips_remaining,
                },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error registering for freeroll:', error);
            this.sendError(ws, error instanceof Error ? error.message : 'Failed to register', message.requestId);
        }
    }
    async handleFreerollJoin(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload?.tournamentId) {
                return this.sendError(ws, 'tournamentId required', message.requestId);
            }
            const entry = await this.tournamentService.joinFreeroll(ws.playerAddress, payload.tournamentId);
            this.sendMessage(ws, {
                type: 'freeroll_joined',
                payload: {
                    tournamentId: payload.tournamentId,
                    entryId: entry.id,
                    chips: entry.chips_remaining,
                },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error joining freeroll:', error);
            this.sendError(ws, error instanceof Error ? error.message : 'Failed to join', message.requestId);
        }
    }
    async handleFreerollReentry(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload?.tournamentId) {
                return this.sendError(ws, 'tournamentId required', message.requestId);
            }
            const entry = await this.tournamentService.reentryFreeroll(ws.playerAddress, payload.tournamentId);
            this.sendMessage(ws, {
                type: 'freeroll_reentered',
                payload: {
                    tournamentId: payload.tournamentId,
                    entryId: entry.id,
                    chips: entry.chips_remaining,
                },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error re-entering freeroll:', error);
            this.sendError(ws, error instanceof Error ? error.message : 'Failed to re-enter', message.requestId);
        }
    }
    // Helper to get prize percentages from type
    getPrizePercentagesForType(type, custom) {
        switch (type) {
            case 'winner_takes_all':
                return [100];
            case 'top_3':
                return [50, 30, 20];
            case 'top_3_steep':
                return [60, 25, 15];
            case 'top_5':
                return [40, 25, 15, 12, 8];
            case 'custom':
                return custom || [40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
            case 'top_10':
            default:
                return [40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
        }
    }
    // Clean shutdown
    shutdown() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.chatRateLimitCleanupInterval) {
            clearInterval(this.chatRateLimitCleanupInterval);
        }
        this.wss.clients.forEach((client) => {
            client.close(1000, 'Server shutdown');
        });
        this.wss.close();
        logger_1.logger.info('WebSocket service shut down');
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.js.map