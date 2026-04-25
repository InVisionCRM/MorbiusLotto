"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const tournament_service_1 = require("./tournament.service");
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
const logger_1 = require("../utils/logger");
const safe_bigint_1 = require("../utils/safe-bigint");
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const viem_1 = require("viem");
const chain_client_1 = require("../utils/chain-client");
const contracts_1 = require("../config/contracts");
const message_routing_1 = require("./websocket/message-routing");
const message_parser_1 = require("./websocket/message-parser");
const message_types_1 = require("./websocket/message-types");
const auth_router_1 = require("./websocket/auth-router");
const chat_router_1 = require("./websocket/chat-router");
const blackjack_router_1 = require("./websocket/blackjack-router");
const tournament_router_1 = require("./websocket/tournament-router");
const poker_router_1 = require("./websocket/poker-router");
const bj_multi_router_1 = require("./websocket/bj-multi-router");
const poker_chip_wallet_1 = require("./poker-chip-wallet");
// EIP-712 domain and types for WebSocket authentication
const AUTH_EIP712_DOMAIN = {
    name: 'MORBlotto Blackjack',
    version: '1',
    chainId: 369,
};
const AUTH_EIP712_TYPES = {
    AuthChallenge: [
        { name: 'nonce', type: 'string' },
    ],
};
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
// Check if a room ID is a tournament chat room (tournament:{uuid})
function isTournamentRoom(room) {
    return room.startsWith('tournament:') && room.length > 'tournament:'.length;
}
// Check if a room ID is a multiplayer blackjack table room (blackjack:table:{uuid})
function isBlackjackTableRoom(room) {
    return room.startsWith('blackjack:table:') && room.length > 'blackjack:table:'.length;
}
function getTournamentIdFromRoom(room) {
    return room.slice('tournament:'.length);
}
// When false, unauthenticated clients fall back to trusting the query-param address (V1 behavior).
const REQUIRE_WS_AUTH = process.env.REQUIRE_WS_AUTH === 'true';
// When true, never send auth_challenge — always trust query-param address (stops sign prompts for testing).
const DISABLE_WS_AUTH = process.env.DISABLE_WS_AUTH === 'true';
const CHAT_MAX_LENGTH = 500;
const CHAT_RATE_LIMIT_MS = 2000; // min 2s between messages per connection
const CHAT_RECENT_MESSAGES_LIMIT = 50;
const CHAT_PER_ADDRESS_MAX = 20; // max messages per wallet per window
const CHAT_PER_ADDRESS_WINDOW_MS = 60_000; // 1 minute
const CHAT_PER_ADDRESS_CLEANUP_MS = 120_000; // prune stale entries every 2 min
const CHAT_DISPLAY_NAME_MIN_LEN = 3;
const CHAT_DISPLAY_NAME_MAX_LEN = 32;
// Rate limit for create_game (1 game per second per connection)
const CREATE_GAME_COOLDOWN_MS = 1000;
// Default bet limits (in MORBIUS, 18 decimals) when admin config is missing
const DEFAULT_BET_LIMITS = {
    MIN_BET: BigInt('1000000000000000000'), // 1 MORBIUS
    MAX_BET: BigInt('100000000000000000000000'), // 100,000 MORBIUS
};
const CONFIG_CACHE_TTL_MS = 60_000; // 1 minute
class WebSocketService {
    gameService;
    dbService;
    wss;
    clients = new Map();
    roomToClients = new Map(); // roomId -> Set<connectionId>
    chatMessageTimestampsByAddress = new Map(); // per-address rate limit
    heartbeatInterval;
    chatRateLimitCleanupInterval;
    pokerAutoFoldInterval = null;
    pokerServerBotInterval = null;
    publicClient;
    contractAddress;
    tournamentService;
    pokerGameService = null;
    pokerTournamentService = null;
    bjMultiService = null;
    bjMultiTimerInterval = null;
    // Per-action rate limiting for BJ multi: address -> timestamp array (5 actions per 3s window)
    bjMultiActionTimestamps = new Map();
    betLimitsCache = null;
    constructor(server, gameService, dbService, tournamentService, pokerGameService, bjMultiService) {
        this.gameService = gameService;
        this.dbService = dbService;
        this.tournamentService = tournamentService;
        this.pokerGameService = pokerGameService ?? null;
        this.bjMultiService = bjMultiService ?? null;
        this.wss = new ws_1.WebSocketServer({ server });
        // Initialize public client for reading contract state
        this.publicClient = (0, chain_client_1.getPublicClient)();
        this.contractAddress = contracts_1.BLACKJACK_ADDRESS;
        logger_1.logger.info('WebSocketService init', { contractAddress: this.contractAddress, REQUIRE_WS_AUTH, DISABLE_WS_AUTH });
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
        // Auto-fold timed-out poker turns (30s timer enforcement)
        // broadcastState is handled internally by PokerGameService via setBroadcastCallback
        if (this.pokerGameService) {
            this.pokerAutoFoldInterval = setInterval(async () => {
                try {
                    await this.pokerGameService.autoFoldTimedOutTurns();
                }
                catch (err) {
                    logger_1.logger.error('Poker auto-fold watchdog error', err);
                }
            }, 5000);
            // In-process tournament bot actions (POKER_BOT_ADDRESSES on game server; no WS child required)
            this.pokerServerBotInterval = setInterval(async () => {
                try {
                    if (typeof this.pokerGameService.tickServerTournamentBots === 'function') {
                        await this.pokerGameService.tickServerTournamentBots();
                    }
                }
                catch (err) {
                    logger_1.logger.error('Poker server tournament bot tick error', err);
                }
            }, 2000);
        }
        // Multiplayer blackjack turn timer + betting timeout enforcement (5s poll)
        if (this.bjMultiService) {
            this.bjMultiTimerInterval = setInterval(async () => {
                try {
                    await this.tickBJMultiTimers();
                }
                catch (err) {
                    logger_1.logger.error('BJMulti timer watchdog error', err);
                }
            }, 5000);
        }
        logger_1.logger.info('WebSocket service initialized');
    }
    /** Wire in the PokerTournamentService after construction. */
    setPokerTournamentService(service) {
        this.pokerTournamentService = service;
        // Wire broadcast so the tournament service can push WS events
        service.setBroadcastCallback((room, message) => {
            this.broadcastToRoom(room, message);
        });
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
    /** Resolve Blackjack min/max bet from admin config (cached). Uses defaults if missing/invalid. */
    async getBetLimits() {
        const now = Date.now();
        if (this.betLimitsCache && now - this.betLimitsCache.cachedAt < CONFIG_CACHE_TTL_MS) {
            return { minBet: this.betLimitsCache.minBet, maxBet: this.betLimitsCache.maxBet };
        }
        try {
            const config = await this.dbService.getAdminGameConfig();
            let minBet = DEFAULT_BET_LIMITS.MIN_BET;
            let maxBet = DEFAULT_BET_LIMITS.MAX_BET;
            const minStr = config.blackjack_min_bet?.trim();
            const maxStr = config.blackjack_max_bet?.trim();
            if (minStr) {
                try {
                    const parsed = BigInt(minStr);
                    if (parsed >= 0n)
                        minBet = parsed;
                }
                catch {
                    /* keep default */
                }
            }
            if (maxStr) {
                try {
                    const parsed = BigInt(maxStr);
                    if (parsed > 0n)
                        maxBet = parsed;
                }
                catch {
                    /* keep default */
                }
            }
            if (minBet > maxBet) {
                minBet = DEFAULT_BET_LIMITS.MIN_BET;
                maxBet = DEFAULT_BET_LIMITS.MAX_BET;
            }
            this.betLimitsCache = { minBet, maxBet, cachedAt: now };
            return { minBet, maxBet };
        }
        catch (err) {
            logger_1.logger.warn('Failed to load admin game config for bet limits, using defaults', { error: err });
            return { minBet: DEFAULT_BET_LIMITS.MIN_BET, maxBet: DEFAULT_BET_LIMITS.MAX_BET };
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
        ws.isAuthenticated = false;
        // Extract player address from query parameters (used as claimed address, verified via EIP-712)
        const url = new URL(request.url || '', 'http://localhost');
        const claimedAddress = url.searchParams.get('address')?.toLowerCase();
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
                // Blackjack-multi: auto-stand if disconnected player is acting
                if (ws.currentRoom?.startsWith('blackjack:table:') && ws.playerAddress && this.bjMultiService) {
                    const tableId = ws.currentRoom.replace('blackjack:table:', '');
                    this.handleBJMultiDisconnect(tableId, ws.playerAddress).catch(err => {
                        logger_1.logger.error('BJMulti disconnect handler error', { tableId, error: err });
                    });
                }
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
        this.clients.set(connectionId, ws);
        const sendAuthChallenge = REQUIRE_WS_AUTH && !DISABLE_WS_AUTH;
        if (sendAuthChallenge) {
            // Strict mode: generate auth challenge, client must sign to proceed
            const authNonce = crypto_1.default.randomBytes(32).toString('hex');
            ws.authNonce = authNonce;
            logger_1.logger.info('WS Auth: sending auth_challenge', { connectionId, claimedAddress, noncePrefix: authNonce.slice(0, 8) });
            this.sendMessage(ws, {
                type: 'auth_challenge',
                payload: { connectionId, nonce: authNonce, claimedAddress }
            });
        }
        else {
            // No challenge: trust query-param address (DISABLE_WS_AUTH or REQUIRE_WS_AUTH=false)
            logger_1.logger.info('WS Auth: no challenge', { reason: DISABLE_WS_AUTH ? 'DISABLE_WS_AUTH' : 'REQUIRE_WS_AUTH=false', claimedAddress, connectionId });
            if (claimedAddress) {
                ws.playerAddress = claimedAddress;
                ws.isAuthenticated = true;
                logger_1.logger.info('WS Auth: auto-auth', { claimedAddress });
                try {
                    const player = await this.dbService.getOrCreatePlayer(claimedAddress);
                    await this.dbService.addActiveConnection(player.id, connectionId);
                    logger_1.logger.info('WebSocket connection established (legacy auth)', { connectionId, playerAddress: claimedAddress, playerId: player.id });
                }
                catch (error) {
                    logger_1.logger.error('Failed to track active connection', { connectionId, playerAddress: claimedAddress, error });
                }
            }
            else {
                logger_1.logger.warn('WebSocket connection without player address', { connectionId });
            }
            let pokerChipBalance = '0';
            if (claimedAddress) {
                try {
                    pokerChipBalance = (await (0, poker_chip_wallet_1.getPokerChipBalance)(this.dbService.getPool(), claimedAddress)).toString();
                }
                catch (_a) { /* ignore */ }
            }
            // Send connection_established so client connects without any auth prompt
            this.sendMessage(ws, {
                type: 'connection_established',
                payload: { connectionId, playerAddress: claimedAddress ?? undefined, pokerChipBalance }
            });
        }
    }
    async handleMessage(ws, data) {
        try {
            const message = (0, message_parser_1.parseIncomingWebSocketMessage)(data);
            logger_1.logger.debug('Received WebSocket message', {
                type: message.type,
                connectionId: ws.connectionId,
                requestId: message.requestId
            });
            if (!(0, message_types_1.isKnownWebSocketMessageType)(message.type)) {
                this.sendError(ws, `Unknown message type: ${message.type}`, message.requestId);
                return;
            }
            const domain = (0, message_routing_1.classifyWebSocketMessageType)(message.type);
            switch (domain) {
                case 'auth':
                    await this.routeAuthMessage(ws, message);
                    return;
                case 'public':
                    await this.routePublicMessage(ws, message);
                    return;
                case 'blackjack':
                    if (!this.requireAuth(ws, message))
                        return;
                    await this.routeBlackjackMessage(ws, message);
                    return;
                case 'chat':
                    if (!this.requireAuth(ws, message))
                        return;
                    await this.routeChatMessage(ws, message);
                    return;
                case 'tournament':
                    if (!this.requireAuth(ws, message))
                        return;
                    await this.routeTournamentMessage(ws, message);
                    return;
                case 'poker':
                    await this.routePokerMessage(ws, message);
                    return;
                case 'bj_multi':
                    await this.routeBJMultiMessage(ws, message);
                    return;
                default:
                    this.sendError(ws, `Unknown message type (routing): ${message.type}`, message.requestId);
                    return;
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling WebSocket message:', error);
            const requestId = (0, message_parser_1.extractRequestIdFromRawMessage)(data);
            this.sendError(ws, error?.message || 'Invalid message format', requestId);
        }
    }
    async routeAuthMessage(ws, message) {
        await this.dispatchDomainMessage(ws, message, auth_router_1.AUTH_MESSAGE_HANDLER_MAP, 'auth');
    }
    async routePublicMessage(ws, message) {
        await this.dispatchDomainMessage(ws, message, chat_router_1.PUBLIC_MESSAGE_HANDLER_MAP, 'public');
    }
    async routeBlackjackMessage(ws, message) {
        await this.dispatchDomainMessage(ws, message, blackjack_router_1.BLACKJACK_MESSAGE_HANDLER_MAP, 'blackjack');
    }
    async routeChatMessage(ws, message) {
        await this.dispatchDomainMessage(ws, message, chat_router_1.CHAT_MESSAGE_HANDLER_MAP, 'chat');
    }
    async routeTournamentMessage(ws, message) {
        await this.dispatchDomainMessage(ws, message, tournament_router_1.TOURNAMENT_MESSAGE_HANDLER_MAP, 'tournament');
    }
    async routePokerMessage(ws, message) {
        const requiresAuth = message.type !== 'poker_tournament_list' && message.type !== 'poker_tournament_get_state';
        if (requiresAuth && !this.requireAuth(ws, message))
            return;
        await this.dispatchDomainMessage(ws, message, poker_router_1.POKER_MESSAGE_HANDLER_MAP, 'poker');
    }
    async routeBJMultiMessage(ws, message) {
        if (!this.requireAuth(ws, message))
            return;
        await this.dispatchDomainMessage(ws, message, bj_multi_router_1.BJ_MULTI_MESSAGE_HANDLER_MAP, 'multiplayer blackjack');
    }
    async dispatchDomainMessage(ws, message, handlerMap, domainName) {
        const handlerName = handlerMap[message.type];
        if (!handlerName) {
            this.sendError(ws, `Unknown ${domainName} message type`, message.requestId);
            return;
        }
        const handler = this[handlerName];
        if (typeof handler !== 'function') {
            logger_1.logger.error('WebSocket handler mapping missing method', { type: message.type, handlerName, domainName });
            this.sendError(ws, 'Handler unavailable', message.requestId);
            return;
        }
        await handler.call(this, ws, message);
    }
    async handlePing(ws, message) {
        this.sendMessage(ws, { type: 'pong', payload: {}, requestId: message.requestId });
    }
    /**
     * Check if client is authenticated. If not, send error and return false.
     * In grace period (REQUIRE_WS_AUTH=false), accepts legacy query-param auth.
     */
    requireAuth(ws, message) {
        if (ws.isAuthenticated) {
            return true;
        }
        // No challenge mode or grace period: trust query-param address
        if ((DISABLE_WS_AUTH || !REQUIRE_WS_AUTH) && ws.playerAddress) {
            return true;
        }
        this.sendError(ws, 'Not authenticated. Please sign the auth challenge first.', message.requestId);
        return false;
    }
    /**
     * Handle EIP-712 auth response from client.
     * Client signs the nonce we sent in auth_challenge to prove wallet ownership.
     */
    async handleAuthResponse(ws, message) {
        try {
            const { address, signature } = message.payload;
            logger_1.logger.info('WS Auth: received auth_response', { connectionId: ws.connectionId, address, signaturePrefix: signature?.slice(0, 10) });
            if (!address || !signature) {
                logger_1.logger.warn('WS Auth: missing address or signature');
                return this.sendError(ws, 'address and signature required', message.requestId);
            }
            if (!ws.authNonce) {
                logger_1.logger.warn('WS Auth: no auth nonce pending', { connectionId: ws.connectionId });
                return this.sendError(ws, 'No auth challenge pending', message.requestId);
            }
            const normalizedAddress = address.toLowerCase();
            logger_1.logger.info('WS Auth: verifying EIP-712 signature', { address: normalizedAddress, noncePrefix: ws.authNonce.slice(0, 8) });
            // Verify EIP-712 typed data signature
            const valid = await (0, viem_1.verifyTypedData)({
                address: normalizedAddress,
                domain: AUTH_EIP712_DOMAIN,
                types: AUTH_EIP712_TYPES,
                primaryType: 'AuthChallenge',
                message: { nonce: ws.authNonce },
                signature,
            });
            if (!valid) {
                logger_1.logger.warn('WS Auth: signature verification failed', { address: normalizedAddress });
                return this.sendError(ws, 'Invalid signature', message.requestId);
            }
            // Auth successful
            logger_1.logger.info('WS Auth: auth successful', { address: normalizedAddress });
            ws.playerAddress = normalizedAddress;
            ws.isAuthenticated = true;
            ws.authNonce = undefined; // consume nonce
            // Track active connection
            try {
                const player = await this.dbService.getOrCreatePlayer(normalizedAddress);
                await this.dbService.addActiveConnection(player.id, ws.connectionId);
                logger_1.logger.info('WebSocket authenticated', { connectionId: ws.connectionId, playerAddress: normalizedAddress, playerId: player.id });
            }
            catch (error) {
                logger_1.logger.error('Failed to track active connection after auth', { connectionId: ws.connectionId, playerAddress: normalizedAddress, error });
            }
            let pokerChipBalance = '0';
            try {
                pokerChipBalance = (await (0, poker_chip_wallet_1.getPokerChipBalance)(this.dbService.getPool(), normalizedAddress)).toString();
            }
            catch (_b) { /* ignore */ }
            this.sendMessage(ws, {
                type: 'auth_success',
                payload: { playerAddress: normalizedAddress, pokerChipBalance },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error handling auth response:', error);
            this.sendError(ws, 'Authentication failed', message.requestId);
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
            // Rate-limit game creation (1 per second per connection)
            const now = Date.now();
            if (ws.lastCreateGameAt && now - ws.lastCreateGameAt < CREATE_GAME_COOLDOWN_MS) {
                return this.sendError(ws, 'Please wait before starting another game', message.requestId);
            }
            ws.lastCreateGameAt = now;
            // Check if player is self-excluded
            const exclusionStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);
            if (exclusionStatus.isExcluded) {
                const expiryMsg = exclusionStatus.expiresAt
                    ? ` until ${exclusionStatus.expiresAt.toISOString()}`
                    : ' (permanent)';
                return this.sendError(ws, `Account is self-excluded${expiryMsg}. Gaming is disabled during this period.`, message.requestId);
            }
            const payload = message.payload;
            const betAmount = (0, safe_bigint_1.toBigIntSafe)(payload.betAmount ?? 0);
            let perfectPairsBetAmount = payload.perfectPairsBetAmount != null && payload.perfectPairsBetAmount !== ''
                ? (0, safe_bigint_1.toBigIntSafe)(payload.perfectPairsBetAmount)
                : 0n;
            if (perfectPairsBetAmount < 0n)
                perfectPairsBetAmount = 0n;
            const PP_MAX_BET = 10000n * 10n ** 18n; // 10,000 MORBIUS
            if (perfectPairsBetAmount > PP_MAX_BET) {
                return this.sendError(ws, 'Perfect Pairs bet too large. Maximum is 10,000 MORBIUS', message.requestId);
            }
            const totalStake = betAmount + perfectPairsBetAmount;
            const { minBet, maxBet } = await this.getBetLimits();
            if (betAmount < minBet) {
                return this.sendError(ws, `Bet amount too small. Minimum bet is ${minBet.toString()}`, message.requestId);
            }
            if (betAmount > maxBet) {
                return this.sendError(ws, `Bet amount too large. Maximum bet is ${maxBet.toString()}`, message.requestId);
            }
            try {
                // Balance pre-check remains a direct read here because create-game authority currently
                // lives in game/WebSocket domains; mutation concentration is tracked separately.
                const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
                if (balance < totalStake) {
                    const fmt = (n) => Number((0, viem_1.formatEther)(n)).toLocaleString(undefined, { maximumFractionDigits: 2 });
                    return this.sendError(ws, `Insufficient balance. You have ${fmt(balance)}, but need ${fmt(totalStake)} (main + Perfect Pairs)`, message.requestId);
                }
            }
            catch (error) {
                logger_1.logger.error('Error checking player balance:', error);
                return this.sendError(ws, 'Failed to verify balance. Please try again.', message.requestId);
            }
            logger_1.logger.debug('Creating game', {
                playerAddress: ws.playerAddress,
                betAmount: betAmount.toString(),
                perfectPairsBetAmount: perfectPairsBetAmount.toString(),
                requestId: message.requestId
            });
            const gameState = await this.gameService.createGame({
                playerAddress: ws.playerAddress,
                betAmount,
                perfectPairsBetAmount: perfectPairsBetAmount > 0n ? perfectPairsBetAmount : undefined,
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
            // If game completed immediately (e.g. dealer blackjack), broadcast to Live Results
            if (gameState.status === 'completed') {
                const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
                const hasBlackjack = gameState.playerHands.some(h => h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? (hasBlackjack ? 'blackjack' : 'win') : allPush ? 'push' : 'loss';
                const playerCardCount = gameState.playerHands.reduce((sum, h) => sum + (h.cards?.length ?? 0), 0);
                const dealerCardCount = gameState.dealerCards?.length ?? 0;
                this.broadcastToAll({
                    type: 'global_game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        playerAddress: ws.playerAddress || '',
                        result: overallResult,
                        payout: gameState.totalPayout.toString(),
                        betAmount: gameState.totalBetAmount.toString(),
                        playerCardCount,
                        dealerCardCount
                    }
                });
            }
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
            // Verify game ownership: the game must belong to this player
            if (payload.gameId) {
                const game = await this.dbService.getGame(payload.gameId);
                if (game) {
                    const gameOwner = await this.dbService.getPlayerAddressFromSession(game.session_id);
                    if (gameOwner.toLowerCase() !== ws.playerAddress.toLowerCase()) {
                        return this.sendError(ws, 'Game does not belong to this player', message.requestId);
                    }
                }
            }
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
                const hasBlackjack = gameState.playerHands.some(h => h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? (hasBlackjack ? 'blackjack' : 'win') : allPush ? 'push' : 'loss';
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
                const playerCardCount = gameState.playerHands.reduce((sum, h) => sum + (h.cards?.length ?? 0), 0);
                const dealerCardCount = gameState.dealerCards?.length ?? 0;
                const globalMessage = {
                    type: 'global_game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        playerAddress: ws.playerAddress || '',
                        result: overallResult,
                        payout: gameState.totalPayout.toString(),
                        betAmount: gameState.totalBetAmount.toString(),
                        playerCardCount,
                        dealerCardCount
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
    /**
     * Resolve any pending withdrawals for a player by checking on-chain nonce usage.
     * If the nonce was used (withdrawal succeeded on-chain), marks it completed (no refund).
     * If the nonce was NOT used, leaves it pending for the expiry cron to refund.
     */
    async resolvePendingWithdrawals(playerAddress) {
        const pending = await this.dbService.getActivePendingWithdrawal(playerAddress);
        if (!pending)
            return;
        try {
            const nonceUsed = await (0, chain_client_1.readUsedWithdrawalNonce)(this.contractAddress, BigInt(pending.nonce), this.publicClient);
            if (nonceUsed) {
                // Withdrawal succeeded on-chain but confirm POST failed — mark completed now
                await this.dbService.markPendingWithdrawalCompleted(playerAddress, BigInt(pending.nonce));
                logger_1.logger.warn('Resolved pending withdrawal as completed (on-chain nonce used)', {
                    playerAddress,
                    nonce: pending.nonce,
                    amount: pending.amount,
                });
            }
        }
        catch (rpcErr) {
            logger_1.logger.warn('Failed to check nonce for pending withdrawal during sync', {
                playerAddress,
                nonce: pending.nonce,
                error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
            });
        }
    }
    async handleSyncBalance(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            // CRITICAL: Before syncing balance, check if there's a pending withdrawal that
            // actually completed on-chain (nonce used). If so, mark it completed to prevent
            // the expiry cron from refunding it (which would duplicate funds).
            await this.resolvePendingWithdrawals(ws.playerAddress);
            // Read-only balance sync path (direct DB read) is intentionally preserved for WS contract parity.
            const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
            logger_1.logger.debug('Balance synced', { playerAddress: ws.playerAddress, balance: balance.toString() });
            this.sendMessage(ws, {
                type: 'balance_synced',
                payload: {
                    balance: balance.toString(),
                },
                requestId: message.requestId,
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
            // CRITICAL: Before reading balance, resolve any pending withdrawals that
            // completed on-chain but weren't confirmed to the server.
            await this.resolvePendingWithdrawals(ws.playerAddress);
            // Deposit credits only through confirmed pending_deposits; DB is source of truth.
            // This WS read path intentionally remains direct during Phase 6.
            const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'balance',
                payload: {
                    balance: balance.toString(),
                },
                requestId: message.requestId,
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
            const isPokerTableRoom = normalized.startsWith('poker:table:');
            const isBJMultiRoom = isBlackjackTableRoom(normalized);
            if (!ALLOWED_CHAT_ROOMS.has(normalized) && !isTournamentRoom(normalized) && !isPokerTableRoom && !isBJMultiRoom) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            // Tournament rooms require participant check
            if (isTournamentRoom(normalized)) {
                if (!ws.playerAddress) {
                    return this.sendError(ws, 'Wallet required for tournament chat', message.requestId);
                }
                if (this.tournamentService) {
                    const entry = await this.tournamentService.getTournamentEntry(ws.playerAddress, getTournamentIdFromRoom(normalized));
                    if (!entry) {
                        return this.sendError(ws, 'Only participants can join tournament chat', message.requestId);
                    }
                }
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
            const recent = (isPokerTableRoom || isBJMultiRoom) ? [] : await this.dbService.getRecentChatMessages(normalized, CHAT_RECENT_MESSAGES_LIMIT);
            const addresses = [...new Set(recent.map(m => m.sender_address).filter(Boolean))];
            const profiles = await this.dbService.getProfiles(addresses);
            const config = await this.dbService.getAdminGameConfig();
            const chatPaused = config['chat_paused'] === 'true';
            this.sendMessage(ws, {
                type: 'room_joined',
                payload: {
                    roomId: normalized,
                    recentMessages: recent.map(m => {
                        const addr = m.sender_address?.toLowerCase();
                        const p = addr ? profiles.get(addr) : undefined;
                        return {
                            id: m.id,
                            roomId: m.room_id,
                            senderAddress: m.sender_address,
                            displayName: p?.displayName ?? null,
                            profileImageUrl: p?.profileImageUrl ?? null,
                            avatarConfig: p?.avatarConfig ?? null,
                            text: m.text,
                            timestamp: m.created_at
                        };
                    }),
                    chatPaused
                },
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error joining room:', error);
            this.sendError(ws, 'Failed to join room', message.requestId);
        }
    }
    async handlePokerListTables(ws, message) {
        try {
            if (!this.pokerGameService) {
                return this.sendError(ws, 'Poker not available', message.requestId);
            }
            const tables = await this.pokerGameService.listTables();
            this.sendMessage(ws, { type: 'poker_table_list', payload: { tables }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error listing poker tables:', error);
            this.sendError(ws, error.message || 'Failed to list tables', message.requestId);
        }
    }
    async handlePokerJoinTable(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const { tableId, buyInChips } = payload ?? {};
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            if (!buyInChips || typeof buyInChips !== 'string') {
                return this.sendError(ws, 'buyInChips required', message.requestId);
            }
            const buyInNorm = buyInChips.trim();
            if (!/^[1-9]\d*$/.test(buyInNorm)) {
                return this.sendError(ws, 'buyInChips must be a positive whole number of chips (integer string)', message.requestId);
            }
            const pinCode = payload?.pinCode && typeof payload.pinCode === 'string' ? payload.pinCode : undefined;
            const state = await this.pokerGameService.joinTable(tableId, ws.playerAddress, buyInNorm, pinCode);
            const roomId = `poker:table:${tableId}`;
            if (ws.currentRoom && ws.connectionId) {
                const prevSet = this.roomToClients.get(ws.currentRoom);
                if (prevSet) {
                    prevSet.delete(ws.connectionId);
                    if (prevSet.size === 0)
                        this.roomToClients.delete(ws.currentRoom);
                }
            }
            ws.currentRoom = roomId;
            if (!this.roomToClients.has(roomId))
                this.roomToClients.set(roomId, new Set());
            this.roomToClients.get(roomId).add(ws.connectionId);
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
            const broadcastState = await this.pokerGameService.getTableState(tableId, null);
            this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('Error joining poker table:', error);
            this.sendError(ws, error.message || 'Failed to join table', message.requestId);
        }
    }
    async handlePokerLeaveTable(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const tableId = payload?.tableId;
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            const state = await this.pokerGameService.leaveTable(tableId, ws.playerAddress);
            const roomId = `poker:table:${tableId}`;
            if (ws.connectionId) {
                const set = this.roomToClients.get(roomId);
                if (set) {
                    set.delete(ws.connectionId);
                    if (set.size === 0)
                        this.roomToClients.delete(roomId);
                }
            }
            ws.currentRoom = undefined;
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
            if (state) {
                const broadcastState = await this.pokerGameService.getTableState(tableId, null);
                this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
            }
        }
        catch (error) {
            logger_1.logger.error('Error leaving poker table:', error);
            this.sendError(ws, error.message || 'Failed to leave table', message.requestId);
        }
    }
    async handlePokerAddChips(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const { tableId, amount } = payload ?? {};
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            if (!amount || typeof amount !== 'string') {
                return this.sendError(ws, 'amount required', message.requestId);
            }
            const amountNorm = amount.trim();
            if (!/^[1-9]\d*$/.test(amountNorm)) {
                return this.sendError(ws, 'amount must be a positive whole number of chips (integer string)', message.requestId);
            }
            const state = await this.pokerGameService.addChips(tableId, ws.playerAddress, amountNorm);
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
            const roomId = `poker:table:${tableId}`;
            const broadcastState = await this.pokerGameService.getTableState(tableId, null);
            this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('Error adding chips to poker table:', error);
            this.sendError(ws, error.message || 'Failed to add chips', message.requestId);
        }
    }
    async handlePokerAction(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const { tableId, handId, action } = payload ?? {};
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            if (!handId || typeof handId !== 'string') {
                return this.sendError(ws, 'handId required', message.requestId);
            }
            if (!action || typeof action !== 'string') {
                return this.sendError(ws, 'action required', message.requestId);
            }
            const amount = payload.amount != null ? String(payload.amount) : undefined;
            const state = await this.pokerGameService.playerAction(tableId, handId, ws.playerAddress, action, amount);
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
            const broadcastState = await this.pokerGameService.getTableState(tableId, null);
            this.broadcastToRoom(`poker:table:${tableId}`, { type: 'poker_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('Error poker action:', error);
            this.sendError(ws, error.message || 'Action failed', message.requestId);
        }
    }
    async handlePokerGetState(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const tableId = payload?.tableId;
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            const state = await this.pokerGameService.getTableState(tableId, ws.playerAddress);
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error getting poker state:', error);
            this.sendError(ws, error.message || 'Failed to get state', message.requestId);
        }
    }
    async handlePokerQuickReaction(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const { tableId, type, value } = payload ?? {};
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            if (type !== 'phrase') {
                return this.sendError(ws, 'type must be phrase', message.requestId);
            }
            const val = typeof value === 'string' ? value.trim() : '';
            if (!val || val.length > 200) {
                return this.sendError(ws, 'value required (max 200 chars)', message.requestId);
            }
            const state = await this.pokerGameService.getTableState(tableId, null);
            const seatIndex = state.seats.findIndex((s) => s.playerAddress && s.playerAddress.toLowerCase() === ws.playerAddress.toLowerCase());
            if (seatIndex < 0) {
                return this.sendError(ws, 'Not seated at this table', message.requestId);
            }
            const roomId = `poker:table:${tableId}`;
            this.broadcastToRoom(roomId, {
                type: 'poker_quick_reaction',
                payload: { tableId, seatIndex, type, value: val },
            });
        }
        catch (error) {
            logger_1.logger.error('Error handling poker quick reaction:', error);
            this.sendError(ws, error.message || 'Failed to send reaction', message.requestId);
        }
    }
    static POKER_AVATAR_EMOTIONS = new Set([
        'neutral', 'happy', 'sad', 'angry', 'surprised', 'wink',
        'dance', 'flex', 'jump', 'spin', 'think', 'love', 'money',
        'sick', 'cool', 'sleepy', 'shock', 'ghost', 'ninja', 'king',
        'poker', 'jackpot', 'chips', 'cards', 'dice',
        'yawn', 'nod', 'shrug',
        'breathe', 'lean', 'tilt',
    ]);
    async handlePokerAvatarEmotion(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const { tableId, emotion } = payload ?? {};
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            const emo = typeof emotion === 'string' ? emotion.toLowerCase().trim() : '';
            if (!WebSocketService.POKER_AVATAR_EMOTIONS.has(emo)) {
                return this.sendError(ws, 'Invalid emotion', message.requestId);
            }
            const state = await this.pokerGameService.getTableState(tableId, null);
            const seatIndex = state.seats.findIndex((s) => s.playerAddress && s.playerAddress.toLowerCase() === ws.playerAddress.toLowerCase());
            if (seatIndex < 0) {
                return this.sendError(ws, 'Not seated at this table', message.requestId);
            }
            const roomId = `poker:table:${tableId}`;
            this.broadcastToRoom(roomId, {
                type: 'poker_avatar_emotion',
                payload: { tableId, seatIndex, emotion: emo },
            });
        }
        catch (error) {
            logger_1.logger.error('Error handling poker avatar emotion:', error);
            this.sendError(ws, error.message || 'Failed to send avatar emotion', message.requestId);
        }
    }
    async handlePokerCreateTable(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            if (!(0, cosmetics_catalog_1.isAdminWallet)(ws.playerAddress)) {
                return this.sendError(ws, 'Only admins can create poker tables', message.requestId);
            }
            const payload = message.payload;
            const smallBlindStr = payload?.smallBlind != null ? String(payload.smallBlind) : undefined;
            const bigBlindStr = payload?.bigBlind != null ? String(payload.bigBlind) : undefined;
            if (!smallBlindStr || !bigBlindStr) {
                return this.sendError(ws, 'smallBlind and bigBlind required', message.requestId);
            }
            // Blinds are chip integers (1 chip = 1 MORBIUS); poker-chip-scale migration 097.
            const smallBlind = Number(smallBlindStr);
            const bigBlind = Number(bigBlindStr);
            if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind <= 0 || bigBlind <= 0 || bigBlind < smallBlind) {
                return this.sendError(ws, 'Invalid blinds: must be positive integer chip counts and bigBlind >= smallBlind', message.requestId);
            }
            const maxSeats = Math.min(10, Math.max(2, Number(payload?.maxSeats) || 10));
            const pinCode = payload?.pinCode && typeof payload.pinCode === 'string' ? payload.pinCode : undefined;
            const tableId = await this.pokerGameService.createTable(smallBlind, bigBlind, maxSeats, pinCode);
            this.sendMessage(ws, { type: 'poker_create_table', payload: { tableId }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error creating poker table:', error);
            this.sendError(ws, error.message || 'Failed to create table', message.requestId);
        }
    }
    async handlePokerUpdateTableLogo(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            if (!(0, cosmetics_catalog_1.isAdminWallet)(ws.playerAddress)) {
                return this.sendError(ws, 'Only admins can update table logo', message.requestId);
            }
            const payload = message.payload;
            const tableId = payload?.tableId;
            if (!tableId) {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            const logo = payload.logo ?? null;
            const opacity = typeof payload.opacity === 'number' ? payload.opacity : 0.12;
            await this.pokerGameService.updateTableLogo(tableId, logo, opacity);
            this.sendMessage(ws, { type: 'poker_update_table_logo', payload: { success: true }, requestId: message.requestId });
            // Broadcast updated state so all players see the new logo
            await this.broadcastPokerTableState(tableId);
        }
        catch (error) {
            logger_1.logger.error('Error updating poker table logo:', error);
            this.sendError(ws, error.message || 'Failed to update table logo', message.requestId);
        }
    }
    async handlePokerPurchaseTableLogo(ws, message) {
        try {
            if (!this.pokerGameService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
            }
            const payload = message.payload;
            const tableId = payload?.tableId;
            const logo = payload?.logo;
            if (!tableId || typeof tableId !== 'string') {
                return this.sendError(ws, 'tableId required', message.requestId);
            }
            if (!logo || typeof logo !== 'string') {
                return this.sendError(ws, 'logo required', message.requestId);
            }
            const state = await this.pokerGameService.purchaseTableLogoSponsorship(tableId, ws.playerAddress, logo.trim());
            this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
            const roomId = `poker:table:${tableId}`;
            const broadcastState = await this.pokerGameService.getTableState(tableId, null);
            this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('Error purchasing poker table logo:', error);
            this.sendError(ws, error.message || 'Failed to purchase table logo', message.requestId);
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
            const isPokerTableRoom = normalized.startsWith('poker:table:');
            if (!ALLOWED_CHAT_ROOMS.has(normalized) && !isTournamentRoom(normalized) && !isPokerTableRoom && !isBlackjackTableRoom(normalized)) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            const limitNum = typeof limit === 'number' && limit > 0 && limit <= CHAT_RECENT_MESSAGES_LIMIT
                ? limit
                : 50;
            const older = await this.dbService.getChatMessagesBefore(normalized, beforeId, limitNum);
            const addresses = [...new Set(older.map(m => m.sender_address).filter(Boolean))];
            const profiles = await this.dbService.getProfiles(addresses);
            const messages = older.map(m => {
                const addr = m.sender_address?.toLowerCase();
                const p = addr ? profiles.get(addr) : undefined;
                return {
                    id: m.id,
                    roomId: m.room_id,
                    senderAddress: m.sender_address,
                    displayName: p?.displayName ?? null,
                    profileImageUrl: p?.profileImageUrl ?? null,
                    avatarConfig: p?.avatarConfig ?? null,
                    text: m.text,
                    timestamp: m.created_at
                };
            });
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
            const avatarConfig = payload.avatarConfig !== undefined
                ? (payload.avatarConfig !== null && typeof payload.avatarConfig === 'object' ? payload.avatarConfig : null)
                : undefined;
            const bio = payload.bio !== undefined ? (typeof payload.bio === 'string' ? payload.bio.trim().slice(0, 200) || null : null) : undefined;
            const xHandle = payload.xHandle !== undefined ? (typeof payload.xHandle === 'string' ? payload.xHandle.trim().replace(/^@/, '').slice(0, 50) || null : null) : undefined;
            const tgHandle = payload.tgHandle !== undefined ? (typeof payload.tgHandle === 'string' ? payload.tgHandle.trim().replace(/^@/, '').slice(0, 50) || null : null) : undefined;
            const profileDisplayMode = payload.profileDisplayMode === 'photo' || payload.profileDisplayMode === 'avatar'
                ? payload.profileDisplayMode
                : undefined;
            await this.dbService.setDisplayName(ws.playerAddress, displayName, profileImageUrl, avatarConfig, bio, xHandle, tgHandle, profileDisplayMode);
            const profile = await this.dbService.getProfile(ws.playerAddress);
            this.sendMessage(ws, {
                type: 'display_name_set',
                payload: {
                    displayName,
                    profileImageUrl: profile?.profileImageUrl ?? null,
                    avatarConfig: profile?.avatarConfig ?? null,
                    bio: profile?.bio ?? null,
                    xHandle: profile?.xHandle ?? null,
                    tgHandle: profile?.tgHandle ?? null,
                    profileDisplayMode: profile?.profileDisplayMode ?? 'avatar',
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
                    ? { displayName: profile.displayName, profileImageUrl: profile.profileImageUrl, avatarConfig: profile.avatarConfig, bio: profile.bio, xHandle: profile.xHandle, tgHandle: profile.tgHandle, profileDisplayMode: profile.profileDisplayMode ?? 'avatar' }
                    : { displayName: null, profileImageUrl: null, avatarConfig: null, bio: null, xHandle: null, tgHandle: null, profileDisplayMode: 'avatar' },
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
            const isPokerTableRoom = normalizedRoom.startsWith('poker:table:');
            if (!ALLOWED_CHAT_ROOMS.has(normalizedRoom) && !isTournamentRoom(normalizedRoom) && !isPokerTableRoom && !isBlackjackTableRoom(normalizedRoom)) {
                return this.sendError(ws, 'Invalid room', message.requestId);
            }
            // Tournament rooms require participant check on send
            if (isTournamentRoom(normalizedRoom) && this.tournamentService && ws.playerAddress) {
                const entry = await this.tournamentService.getTournamentEntry(ws.playerAddress, getTournamentIdFromRoom(normalizedRoom));
                if (!entry) {
                    return this.sendError(ws, 'Only participants can comment', message.requestId);
                }
            }
            if (ws.currentRoom !== normalizedRoom) {
                return this.sendError(ws, 'Not in this room', message.requestId);
            }
            const config = await this.dbService.getAdminGameConfig();
            if (config['chat_paused'] === 'true') {
                return this.sendError(ws, 'Chat is temporarily paused', message.requestId);
            }
            const senderAddress = ws.playerAddress ?? null;
            if (senderAddress && await this.dbService.isAddressBlocked(senderAddress)) {
                return this.sendError(ws, 'Unable to send message', message.requestId);
            }
            const now = Date.now();
            if (ws.lastChatMessageAt != null && now - ws.lastChatMessageAt < CHAT_RATE_LIMIT_MS) {
                return this.sendError(ws, 'Please wait before sending another message', message.requestId);
            }
            ws.lastChatMessageAt = now;
            // Per-address limit (across all tabs/connections) so one wallet can't spam
            if (senderAddress) {
                if (!this.checkPerAddressChatLimit(senderAddress, now)) {
                    return this.sendError(ws, 'Too many messages. Try again in a minute.', message.requestId);
                }
            }
            const row = await this.dbService.insertChatMessage(normalizedRoom, senderAddress, trimmed);
            let displayName = null;
            let profileImageUrl = null;
            let avatarConfig = null;
            if (row.sender_address) {
                const profile = await this.dbService.getProfile(row.sender_address);
                if (profile) {
                    const dn = profile.displayName?.trim();
                    displayName = dn ? dn : null;
                    profileImageUrl = profile.profileImageUrl;
                    avatarConfig = profile.avatarConfig;
                }
            }
            const broadcastPayload = {
                id: row.id,
                roomId: row.room_id,
                senderAddress: row.sender_address,
                displayName,
                profileImageUrl,
                avatarConfig,
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
    /** Called by admin API when a message is soft-deleted; notifies all clients in the room. */
    broadcastChatMessageDeleted(roomId, messageId) {
        this.broadcastToRoom(roomId, {
            type: 'chat_message_deleted',
            payload: { roomId, messageId }
        });
    }
    /** Broadcast current poker table state to room (e.g. after API adds bots so UI updates). */
    async broadcastPokerTableState(tableId) {
        if (!this.pokerGameService)
            return;
        const roomId = `poker:table:${tableId}`;
        if ((this.roomToClients.get(roomId)?.size ?? 0) === 0) {
            return;
        }
        try {
            const state = await this.pokerGameService.getTableState(tableId, null);
            this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: state });
        }
        catch (err) {
            logger_1.logger.error('broadcastPokerTableState failed', { tableId, error: err });
        }
    }
    // ---------------------------------------------------------------------------
    // Poker Tournament handlers
    // ---------------------------------------------------------------------------
    async handlePokerTournamentList(ws, message) {
        try {
            if (!this.pokerTournamentService) {
                return this.sendError(ws, 'Poker tournaments not available', message.requestId);
            }
            const tournaments = await this.pokerTournamentService.listPokerTournaments(ws.playerAddress ?? undefined);
            this.sendMessage(ws, { type: 'poker_tournament_list', payload: { tournaments }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error listing poker tournaments:', error);
            this.sendError(ws, error.message || 'Failed to list tournaments', message.requestId);
        }
    }
    async handlePokerTournamentCreate(ws, message) {
        try {
            if (!this.pokerTournamentService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
            }
            const p = message.payload;
            if (!p.name)
                return this.sendError(ws, 'name required', message.requestId);
            if (p.buyInAmount === undefined || p.buyInAmount === null || p.buyInAmount === '')
                return this.sendError(ws, 'buyInAmount required', message.requestId);
            if (!p.prizeDistributionType)
                return this.sendError(ws, 'prizeDistributionType required', message.requestId);
            if (!p.config)
                return this.sendError(ws, 'config required', message.requestId);
            if (p.scheduledStartAt == null || p.scheduledStartAt === '') {
                return this.sendError(ws, 'scheduledStartAt is required', message.requestId);
            }
            const scheduledStartAt = new Date(p.scheduledStartAt);
            if (isNaN(scheduledStartAt.getTime())) {
                return this.sendError(ws, 'Invalid scheduledStartAt date', message.requestId);
            }
            const buyInAmount = BigInt(String(p.buyInAmount));
            let guaranteedPrizePool = undefined;
            if (p.guaranteedPrizePool !== undefined && p.guaranteedPrizePool !== null && p.guaranteedPrizePool !== '') {
                guaranteedPrizePool = BigInt(String(p.guaranteedPrizePool));
            }
            let guaranteedPrizePoolSource = undefined;
            if (p.guaranteedPrizePoolSource === 'platform_promo') {
                guaranteedPrizePoolSource = 'platform_promo';
            }
            const result = await this.pokerTournamentService.createPokerTournament({
                creatorAddress: ws.playerAddress,
                name: p.name,
                buyInAmount,
                guaranteedPrizePool,
                guaranteedPrizePoolSource,
                prizeDistributionType: p.prizeDistributionType,
                prizePercentages: Array.isArray(p.prizePercentages) ? p.prizePercentages : undefined,
                config: p.config,
                isPrivate: p.isPrivate ?? false,
                pinCode: p.pinCode ?? null,
                scheduledStartAt,
            });
            this.sendMessage(ws, { type: 'poker_tournament_created', payload: result, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error creating poker tournament:', error);
            this.sendError(ws, error.message || 'Failed to create tournament', message.requestId);
        }
    }
    async handlePokerTournamentJoin(ws, message) {
        try {
            if (!this.pokerTournamentService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
            }
            const { tournamentId, pinCode } = message.payload;
            if (!tournamentId)
                return this.sendError(ws, 'tournamentId required', message.requestId);
            let result = null;
            try {
                result = await this.pokerTournamentService.joinPokerTournament(tournamentId, ws.playerAddress, pinCode);
            }
            catch (joinErr) {
                const msg = joinErr.message ?? '';
                // If already registered, just re-subscribe to the room without error
                if (msg.toLowerCase().includes('already registered')) {
                    logger_1.logger.info('Player already registered — re-subscribing to tournament room', { tournamentId, player: ws.playerAddress });
                    // fall through to room subscription below with null result
                }
                else {
                    throw joinErr;
                }
            }
            // Always add client to the tournament room (handles reconnects)
            const roomId = `poker_tournament:${tournamentId}`;
            if (ws.connectionId) {
                if (!this.roomToClients.has(roomId))
                    this.roomToClients.set(roomId, new Set());
                this.roomToClients.get(roomId).add(ws.connectionId);
            }
            this.sendMessage(ws, { type: 'poker_tournament_joined', payload: result ?? { autoStarted: false, tableId: null, alreadyRegistered: true }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error joining poker tournament:', error);
            this.sendError(ws, error.message || 'Failed to join tournament', message.requestId);
        }
    }
    async handlePokerTournamentGetState(ws, message) {
        try {
            if (!this.pokerTournamentService) {
                return this.sendError(ws, 'Poker tournaments not available', message.requestId);
            }
            const { tournamentId } = message.payload;
            if (!tournamentId)
                return this.sendError(ws, 'tournamentId required', message.requestId);
            const state = await this.pokerTournamentService.getTournamentState(tournamentId);
            this.sendMessage(ws, { type: 'poker_tournament_state', payload: state, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error getting poker tournament state:', error);
            this.sendError(ws, error.message || 'Failed to get tournament state', message.requestId);
        }
    }
    async handlePokerTournamentRegistrants(ws, message) {
        try {
            if (!this.pokerTournamentService) {
                return this.sendError(ws, 'Poker tournaments not available', message.requestId);
            }
            const { tournamentId } = message.payload ?? {};
            if (!tournamentId)
                return this.sendError(ws, 'tournamentId required', message.requestId);
            const registrants = await this.pokerTournamentService.getPokerTournamentRegistrants(tournamentId);
            this.sendMessage(ws, {
                type: 'poker_tournament_registrants',
                payload: { registrants },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting poker tournament registrants:', error);
            this.sendError(ws, error.message || 'Failed to get registrants', message.requestId);
        }
    }
    async handlePokerTournamentCancel(ws, message) {
        try {
            if (!this.pokerTournamentService || !ws.playerAddress) {
                return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
            }
            const { tournamentId } = message.payload;
            if (!tournamentId)
                return this.sendError(ws, 'tournamentId required', message.requestId);
            await this.pokerTournamentService.cancelPokerTournament(tournamentId, ws.playerAddress);
            this.sendMessage(ws, { type: 'poker_tournament_cancelled', payload: { tournamentId }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Error cancelling poker tournament:', error);
            this.sendError(ws, error.message || 'Failed to cancel tournament', message.requestId);
        }
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
    /**
     * WebSocket clients currently in each game’s rooms (chat + table rooms).
     * One browser tab ≈ one connection; not deduped by wallet.
     */
    getLivePresenceByGame() {
        let poker = 0;
        let blackjackMulti = 0;
        for (const [roomId, set] of this.roomToClients.entries()) {
            const n = set.size;
            if (roomId.startsWith('poker:table:') || roomId.startsWith('poker_tournament:')) {
                poker += n;
            }
            else if (roomId.startsWith('blackjack:table:')) {
                blackjackMulti += n;
            }
        }
        return {
            poker,
            blackjackMulti,
            blackjack: this.roomToClients.get('blackjack')?.size ?? 0,
            plinko: this.roomToClients.get('plinko')?.size ?? 0,
            keno: this.roomToClients.get('keno')?.size ?? 0,
            lottery: this.roomToClients.get('lottery')?.size ?? 0,
            bigWheel: this.roomToClients.get('bigwheel')?.size ?? 0,
        };
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
            // If game completed immediately (blackjack), broadcast leaderboard update and Live Results
            if (gameState.status === 'completed') {
                this.broadcastTournamentLeaderboardUpdate(state.tournamentId);
                const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
                const hasBlackjack = gameState.playerHands.some(h => h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? (hasBlackjack ? 'blackjack' : 'win') : allPush ? 'push' : 'loss';
                const playerCardCount = gameState.playerHands.reduce((sum, h) => sum + (h.cards?.length ?? 0), 0);
                const dealerCardCount = gameState.dealerCards?.length ?? 0;
                const chipDelta = Number(gameState.totalPayout) - Number(gameState.totalBetAmount);
                this.broadcastToAll({
                    type: 'global_game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        playerAddress: ws.playerAddress || '',
                        result: overallResult,
                        betAmount: gameState.totalBetAmount.toString(),
                        payout: gameState.totalPayout.toString(),
                        playerCardCount,
                        dealerCardCount,
                        isTournament: true,
                        chipDelta,
                    },
                });
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
                // Broadcast to Live Results with chip amounts (tournament games use chips, not MORBIUS)
                const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
                const hasBlackjack = gameState.playerHands.some(h => h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? (hasBlackjack ? 'blackjack' : 'win') : allPush ? 'push' : 'loss';
                const playerCardCount = gameState.playerHands.reduce((sum, h) => sum + (h.cards?.length ?? 0), 0);
                const dealerCardCount = gameState.dealerCards?.length ?? 0;
                const chipDelta = Number(gameState.totalPayout) - Number(gameState.totalBetAmount);
                this.broadcastToAll({
                    type: 'global_game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        playerAddress: ws.playerAddress || '',
                        result: overallResult,
                        betAmount: gameState.totalBetAmount.toString(),
                        payout: gameState.totalPayout.toString(),
                        playerCardCount,
                        dealerCardCount,
                        isTournament: true,
                        chipDelta,
                    },
                });
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
            const buyInAmount = (0, safe_bigint_1.toBigIntSafe)(payload.buyInAmount);
            if (buyInAmount <= 0n) {
                return this.sendError(ws, 'Invalid buy-in amount', message.requestId);
            }
            const tournament = await this.tournamentService.createTournament({
                creatorAddress: ws.playerAddress,
                name: payload.name,
                buyInAmount,
                startingChips: 5000,
                maxHands: 25,
                timeLimitMinutes: payload.timeLimitMinutes,
                tableTheme: payload.tableTheme,
                isPrivate: payload.isPrivate,
                prizeDistributionType: payload.prizeDistributionType,
                maxPlayers: payload.maxPlayers,
                customImage: payload.customImage,
                prizeTokenAddress: payload.prizeTokenAddress,
                prizeAmount: payload.prizeAmount,
                prizeTokenDecimals: payload.prizeTokenDecimals,
                pinCode: payload.pinCode,
                onChainTournamentId: payload.onChainTournamentId != null ? payload.onChainTournamentId : undefined,
            });
            const prizePercentages = this.getPrizePercentagesForType(tournament.prize_distribution_type);
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
    async handleCreateFreeroll(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            const result = await this.tournamentService.createFreeroll({
                creatorAddress: ws.playerAddress,
                name: payload.name,
                scheduledStartAt: payload.scheduledStartAt,
                registrationOpensAt: payload.registrationOpensAt,
                durationMinutes: payload.durationMinutes,
                startingChips: payload.startingChips ?? 5000,
                maxHands: payload.maxHands ?? 25,
                prizeDistributionType: payload.prizeDistributionType,
                tableTheme: payload.tableTheme,
                isPrivate: payload.isPrivate,
                maxPlayers: payload.maxPlayers,
                customImage: payload.customImage,
                pinCode: payload.pinCode,
                prizeTokenAddress: payload.prizeTokenAddress,
                prizeAmount: payload.prizeAmount,
                prizeTokenDecimals: payload.prizeTokenDecimals,
            });
            this.sendMessage(ws, {
                type: 'freeroll_created',
                payload: { tournamentId: result.id, pinCode: result.pinCode ?? undefined },
                requestId: message.requestId,
            });
            logger_1.logger.info('Freeroll created via WebSocket', { tournamentId: result.id, creator: ws.playerAddress });
        }
        catch (error) {
            logger_1.logger.error('Error creating freeroll:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create freeroll';
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
                tournamentType: t.tournament_type ?? 'standard',
                scheduledStartAt: t.scheduled_start_at?.toISOString() ?? null,
                registrationOpensAt: t.registration_opens_at?.toISOString() ?? null,
                currentPhase: t.current_phase ?? null,
                durationMinutes: t.duration_minutes ?? null,
                creatorFeePercent: t.creator_fee_percent ?? 2,
                platformFeePercent: t.platform_fee_percent ?? 3,
                escrowFunded: t.escrow_funded ?? false,
                escrowTotalDeposited: t.escrow_total_deposited ?? '0',
                escrowToken: t.escrow_token ?? null,
                onChainTournamentId: t.on_chain_tournament_id != null ? t.on_chain_tournament_id : null,
                status: t.status ?? 'active',
                minPlayers: t.min_players ?? 2,
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
    async handleTournamentUnregister(ws, message) {
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
            await this.tournamentService.unregisterTournament(ws.playerAddress, payload.tournamentId);
            this.sendMessage(ws, {
                type: 'tournament_unregistered',
                payload: { tournamentId: payload.tournamentId },
                requestId: message.requestId
            });
            this.broadcastTournamentLeaderboardUpdate(payload.tournamentId);
        }
        catch (error) {
            logger_1.logger.error('Error unregistering from tournament:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to unregister from tournament';
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
                    creatorFeePercent: info.tournament.creator_fee_percent ?? 2,
                    platformFeePercent: info.tournament.platform_fee_percent ?? 3,
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
    async handleTournamentEntriesList(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const payload = message.payload;
            if (!payload?.tournamentId) {
                return this.sendError(ws, 'Tournament ID required', message.requestId);
            }
            const entries = await this.tournamentService.getEntries(payload.tournamentId);
            this.sendMessage(ws, {
                type: 'tournament_entries_list',
                payload: { tournamentId: payload.tournamentId, entries },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting tournament entries:', error);
            this.sendError(ws, 'Failed to get entries', message.requestId);
        }
    }
    async handleCreatorTournaments(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const address = ws.playerAddress;
            if (!address) {
                return this.sendError(ws, 'No address', message.requestId);
            }
            const tournaments = await this.tournamentService.getCreatorTournaments(address);
            this.sendMessage(ws, {
                type: 'creator_tournaments',
                payload: { tournaments },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting creator tournaments:', error);
            this.sendError(ws, 'Failed to get creator tournaments', message.requestId);
        }
    }
    async handleCreatorEarnings(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const address = ws.playerAddress;
            if (!address) {
                return this.sendError(ws, 'No address', message.requestId);
            }
            const earnings = await this.tournamentService.getCreatorEarnings(address);
            this.sendMessage(ws, {
                type: 'creator_earnings',
                payload: { earnings },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting creator earnings:', error);
            this.sendError(ws, 'Failed to get creator earnings', message.requestId);
        }
    }
    async handleTournamentCancel(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const address = ws.playerAddress;
            if (!address) {
                return this.sendError(ws, 'No address', message.requestId);
            }
            const { tournamentId } = message.payload || {};
            if (!tournamentId || typeof tournamentId !== 'string') {
                return this.sendError(ws, 'tournamentId is required', message.requestId);
            }
            await this.tournamentService.cancelTournament(tournamentId, address);
            this.sendMessage(ws, {
                type: 'tournament_cancelled',
                payload: { tournamentId, success: true },
                requestId: message.requestId,
            });
            // Broadcast to all clients in the tournament room
            const roomId = `tournament:${tournamentId}`;
            this.broadcastToRoom(roomId, {
                type: 'tournament_cancelled',
                payload: { tournamentId },
            });
        }
        catch (error) {
            logger_1.logger.error('Error cancelling tournament:', error);
            this.sendError(ws, error.message || 'Failed to cancel tournament', message.requestId);
        }
    }
    async handleTournamentReclaim(ws, message) {
        try {
            if (!this.tournamentService) {
                return this.sendError(ws, 'Tournament mode not available', message.requestId);
            }
            const address = ws.playerAddress;
            if (!address) {
                return this.sendError(ws, 'No address', message.requestId);
            }
            const { tournamentId } = message.payload || {};
            if (!tournamentId || typeof tournamentId !== 'string') {
                return this.sendError(ws, 'tournamentId is required', message.requestId);
            }
            const result = await this.tournamentService.creatorReclaimFunds(tournamentId, address);
            if (result.success) {
                this.sendMessage(ws, {
                    type: 'tournament_reclaimed',
                    payload: { tournamentId, txHash: result.txHash, success: true },
                    requestId: message.requestId,
                });
            }
            else {
                this.sendError(ws, result.error || 'Failed to reclaim funds', message.requestId);
            }
        }
        catch (error) {
            logger_1.logger.error('Error reclaiming tournament funds:', error);
            this.sendError(ws, error.message || 'Failed to reclaim funds', message.requestId);
        }
    }
    async handleRecentGlobalWins(ws, message) {
        try {
            const limit = Math.min(parseInt(message.payload?.limit) || 20, 100);
            // Query database for recent completed games (with card counts, tournament chip amounts)
            const query = `
        SELECT 
          g.id as game_id,
          g.total_bet_amount,
          g.total_payout,
          g.result,
          g.completed_at,
          p.wallet_address as player_address,
          COALESCE((
            SELECT SUM(jsonb_array_length(gh.cards))
            FROM game_hands gh
            WHERE gh.game_id = g.id
          ), 0)::int as player_card_count,
          jsonb_array_length(COALESCE(g.dealer_cards, '[]'::jsonb))::int as dealer_card_count,
          tg.bet_amount as tg_bet_amount,
          tg.chips_before as tg_chips_before,
          tg.chips_after as tg_chips_after
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        JOIN players p ON gs.player_id = p.id
        LEFT JOIN tournament_games tg ON tg.game_id = g.id
        WHERE g.result IS NOT NULL 
          AND g.result != 'ongoing'
          AND g.completed_at IS NOT NULL
        ORDER BY g.completed_at DESC
        LIMIT $1
      `;
            const result = await this.dbService.getPool().query(query, [limit]);
            const wins = result.rows.map((row) => {
                const hasWin = row.result === 'win' || row.result === 'blackjack';
                const overallResult = hasWin ? row.result : row.result === 'push' ? 'push' : 'loss';
                const isTournament = row.tg_bet_amount != null;
                const betAmount = isTournament
                    ? String(row.tg_bet_amount ?? 0)
                    : (row.total_bet_amount?.toString() || '0');
                const chipDelta = isTournament
                    ? Number(row.tg_chips_after ?? 0) - Number(row.tg_chips_before ?? 0)
                    : null;
                const payout = isTournament
                    ? String(Number(row.tg_chips_before ?? 0) + (chipDelta ?? 0))
                    : (row.total_payout?.toString() || '0');
                return {
                    gameId: row.game_id,
                    playerAddress: row.player_address || '',
                    result: overallResult,
                    betAmount,
                    payout,
                    timestamp: row.completed_at ? new Date(row.completed_at).getTime() : Date.now(),
                    playerCardCount: row.player_card_count ?? 0,
                    dealerCardCount: row.dealer_card_count ?? 0,
                    isTournament: !!isTournament,
                    chipDelta: isTournament ? chipDelta : undefined,
                };
            });
            this.sendMessage(ws, {
                type: 'recent_global_wins',
                payload: { wins },
                requestId: message.requestId,
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching recent global wins:', error);
            this.sendError(ws, 'Failed to fetch recent wins', message.requestId);
        }
    }
    getPrizePercentagesForType(type) {
        switch (type) {
            case 'winner_takes_all':
                return [100];
            case 'top_3':
                return [50, 30, 20];
            case 'top_5':
                return [40, 25, 15, 12, 8];
            case 'top_10':
            default:
                return [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
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
        if (this.pokerAutoFoldInterval) {
            clearInterval(this.pokerAutoFoldInterval);
        }
        if (this.pokerServerBotInterval) {
            clearInterval(this.pokerServerBotInterval);
        }
        if (this.bjMultiTimerInterval) {
            clearInterval(this.bjMultiTimerInterval);
        }
        this.wss.clients.forEach((client) => {
            client.close(1000, 'Server shutdown');
        });
        this.wss.close();
        logger_1.logger.info('WebSocket service shut down');
    }
    // ---------------------------------------------------------------------------
    // Multiplayer Blackjack handlers
    // ---------------------------------------------------------------------------
    /** Broadcast current BJ multi table state to room. */
    async broadcastBJMultiTableState(tableId) {
        if (!this.bjMultiService)
            return;
        const roomId = `blackjack:table:${tableId}`;
        const roomSize = this.roomToClients.get(roomId)?.size ?? 0;
        if (roomSize === 0) {
            return;
        }
        try {
            const state = await this.bjMultiService.getTableState(tableId);
            const seatedCount = state.seats.filter((s) => s.playerAddress).length;
            state.viewerCount = Math.max(0, roomSize - seatedCount);
            this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: state });
        }
        catch (err) {
            logger_1.logger.error('broadcastBJMultiTableState failed', { tableId, error: err });
        }
    }
    /** Timer tick: check for expired turns and betting timeouts across all active BJ multi tables. */
    async tickBJMultiTimers() {
        if (!this.bjMultiService)
            return;
        const pool = this.dbService.getPool();
        // Find tables with an active round that has an expired turn (playing + turn_started_at + 30s < NOW())
        const timedOutTurns = await pool.query(`
      SELECT DISTINCT r.table_id
      FROM blackjack_multi_rounds r
      WHERE r.status = 'playing'
        AND r.acting_seat_position IS NOT NULL
        AND r.turn_started_at < NOW() - INTERVAL '30 seconds'
    `);
        for (const row of timedOutTurns.rows) {
            try {
                await this.bjMultiService.autoStandTimedOut(row.table_id);
                await this.broadcastBJMultiTableState(row.table_id);
            }
            catch (err) {
                logger_1.logger.error('BJMulti auto-stand error', { tableId: row.table_id, error: err });
            }
        }
        // Find tables in 'betting' status where the round is older than 30s and at least one seat has a bet
        const expiredBetting = await pool.query(`
      SELECT DISTINCT r.table_id
      FROM blackjack_multi_rounds r
      WHERE r.status = 'betting'
        AND r.created_at < NOW() - INTERVAL '15 seconds'
    `);
        for (const row of expiredBetting.rows) {
            try {
                await this.bjMultiService.handleBettingTimeout(row.table_id);
                await this.broadcastBJMultiTableState(row.table_id);
            }
            catch (err) {
                logger_1.logger.error('BJMulti betting timeout error', { tableId: row.table_id, error: err });
            }
        }
        // Also handle tables stuck in 'betting' with no active round (e.g. table.status = 'betting' but no round)
        const stuckBetting = await pool.query(`
      SELECT t.id AS table_id
      FROM blackjack_multi_tables t
      WHERE t.status = 'betting'
        AND NOT EXISTS (
          SELECT 1 FROM blackjack_multi_rounds r WHERE r.table_id = t.id AND r.status = 'betting'
        )
    `);
        for (const row of stuckBetting.rows) {
            try {
                await this.bjMultiService.handleBettingTimeout(row.table_id);
                await this.broadcastBJMultiTableState(row.table_id);
            }
            catch (err) {
                logger_1.logger.error('BJMulti stuck betting error', { tableId: row.table_id, error: err });
            }
        }
        // Transition waiting/completed tables with seated players to betting (so next round can start)
        const waitingWithSeats = await pool.query(`
      SELECT t.id AS table_id
      FROM blackjack_multi_tables t
      WHERE t.status IN ('waiting', 'completed')
        AND EXISTS (SELECT 1 FROM blackjack_multi_seats s WHERE s.table_id = t.id)
    `);
        for (const row of waitingWithSeats.rows) {
            try {
                await this.bjMultiService.startBettingPhase(row.table_id);
                await this.broadcastBJMultiTableState(row.table_id);
            }
            catch (err) {
                logger_1.logger.error('BJMulti start betting phase error', { tableId: row.table_id, error: err });
            }
        }
    }
    async handleBJMultiListTables(ws, message) {
        try {
            if (!this.bjMultiService)
                return this.sendError(ws, 'BJ multi not available', message.requestId);
            const tables = await this.bjMultiService.listTables();
            this.sendMessage(ws, { type: 'bj_multi_table_list', payload: { tables }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('BJ multi list tables error:', error);
            this.sendError(ws, error.message || 'Failed to list tables', message.requestId);
        }
    }
    async handleBJMultiJoinTable(ws, message) {
        try {
            if (!this.bjMultiService || !ws.playerAddress) {
                return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
            }
            const { tableId, seatPosition } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            if (seatPosition === undefined || seatPosition === null) {
                return this.sendError(ws, 'seatPosition required', message.requestId);
            }
            const state = await this.bjMultiService.joinTable(tableId, ws.playerAddress, seatPosition);
            // Assign connection to room
            const roomId = `blackjack:table:${tableId}`;
            if (ws.currentRoom && ws.connectionId) {
                const prev = this.roomToClients.get(ws.currentRoom);
                if (prev) {
                    prev.delete(ws.connectionId);
                    if (prev.size === 0)
                        this.roomToClients.delete(ws.currentRoom);
                }
            }
            ws.currentRoom = roomId;
            if (!this.roomToClients.has(roomId))
                this.roomToClients.set(roomId, new Set());
            this.roomToClients.get(roomId).add(ws.connectionId);
            this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
            const broadcastState = await this.bjMultiService.getTableState(tableId);
            this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('BJ multi join table error:', error);
            this.sendError(ws, error.message || 'Failed to join table', message.requestId);
        }
    }
    async handleBJMultiLeaveTable(ws, message) {
        try {
            if (!this.bjMultiService || !ws.playerAddress) {
                return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
            }
            const { tableId } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            const state = await this.bjMultiService.leaveTable(tableId, ws.playerAddress);
            const roomId = `blackjack:table:${tableId}`;
            if (ws.connectionId) {
                const set = this.roomToClients.get(roomId);
                if (set) {
                    set.delete(ws.connectionId);
                    if (set.size === 0)
                        this.roomToClients.delete(roomId);
                }
            }
            ws.currentRoom = undefined;
            this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
            const broadcastState = await this.bjMultiService.getTableState(tableId);
            this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('BJ multi leave table error:', error);
            this.sendError(ws, error.message || 'Failed to leave table', message.requestId);
        }
    }
    async handleBJMultiPlaceBet(ws, message) {
        try {
            if (!this.bjMultiService || !ws.playerAddress) {
                return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
            }
            const { tableId, amount, clientSeed } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            if (!amount)
                return this.sendError(ws, 'amount required', message.requestId);
            const betAmount = (0, safe_bigint_1.toBigIntSafe)(amount);
            await this.bjMultiService.placeBet(tableId, ws.playerAddress, betAmount, typeof clientSeed === 'string' ? clientSeed : undefined);
            // Skip the betting timer if every seated player has already bet — no one to wait for
            const allBet = await this.bjMultiService.allSeatedPlayersHaveBet(tableId);
            if (allBet) {
                try {
                    await this.bjMultiService.startRound(tableId);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    // Round may already have advanced by watchdog/another action; avoid surfacing a false-negative error.
                    if (!msg.includes('not in betting phase')) {
                        throw err;
                    }
                }
            }
            const roomId = `blackjack:table:${tableId}`;
            const nextState = await this.bjMultiService.getTableState(tableId);
            this.sendMessage(ws, { type: 'bj_multi_table_state', payload: nextState, requestId: message.requestId });
            this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: nextState });
        }
        catch (error) {
            logger_1.logger.error('BJ multi place bet error:', error);
            this.sendError(ws, error.message || 'Failed to place bet', message.requestId);
        }
    }
    async handleBJMultiAction(ws, message) {
        try {
            if (!this.bjMultiService || !ws.playerAddress) {
                return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
            }
            // Per-action rate limit: max 5 actions per 3s sliding window
            const addr = ws.playerAddress.toLowerCase();
            const now = Date.now();
            const timestamps = this.bjMultiActionTimestamps.get(addr) ?? [];
            const windowStart = now - 3000;
            const recent = timestamps.filter(t => t > windowStart);
            if (recent.length >= 5) {
                return this.sendError(ws, 'Too many actions, slow down', message.requestId);
            }
            recent.push(now);
            this.bjMultiActionTimestamps.set(addr, recent);
            const { tableId, action, handIndex, actionId } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            if (!action || !['hit', 'stand', 'double_down', 'split'].includes(action)) {
                return this.sendError(ws, 'action must be hit, stand, double_down, or split', message.requestId);
            }
            const state = await this.bjMultiService.playerAction(tableId, ws.playerAddress, action, handIndex, actionId);
            this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
            const roomId = `blackjack:table:${tableId}`;
            const broadcastState = await this.bjMultiService.getTableState(tableId);
            this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
        }
        catch (error) {
            logger_1.logger.error('BJ multi action error:', error);
            this.sendError(ws, error.message || 'Action failed', message.requestId);
        }
    }
    async handleBJMultiGetState(ws, message) {
        try {
            if (!this.bjMultiService)
                return this.sendError(ws, 'BJ multi not available', message.requestId);
            const { tableId } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            // Inline watchdog: if a turn has been stalled >30s, auto-stand before returning state
            try {
                const pool = this.dbService.getPool();
                const stalled = await pool.query(`
          SELECT id FROM blackjack_multi_rounds
          WHERE table_id = $1 AND status = 'playing'
            AND acting_seat_position IS NOT NULL
            AND turn_started_at < NOW() - INTERVAL '30 seconds'
          LIMIT 1
        `, [tableId]);
                if (stalled.rows.length > 0) {
                    await this.bjMultiService.autoStandTimedOut(tableId);
                    await this.broadcastBJMultiTableState(tableId);
                }
            }
            catch (watchdogErr) {
                logger_1.logger.error('BJMulti inline watchdog error', { tableId, error: watchdogErr });
            }
            const state = await this.bjMultiService.getTableState(tableId);
            const roomId = `blackjack:table:${tableId}`;
            const roomSize = this.roomToClients.get(roomId)?.size ?? 0;
            const seatedCount = state.seats.filter((s) => s.playerAddress).length;
            state.viewerCount = Math.max(0, roomSize - seatedCount);
            this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('BJ multi get state error:', error);
            this.sendError(ws, error.message || 'Failed to get state', message.requestId);
        }
    }
    async handleBJMultiTipDealer(ws, message) {
        try {
            if (!this.bjMultiService || !ws.playerAddress) {
                return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
            }
            const { tableId, amount } = (message.payload ?? {});
            if (!tableId || !amount)
                return this.sendError(ws, 'tableId and amount required', message.requestId);
            const tipAmount = (0, safe_bigint_1.toBigIntSafe)(amount);
            const result = await this.bjMultiService.tipDealer(tableId, ws.playerAddress, tipAmount);
            this.sendMessage(ws, { type: 'bj_multi_tip_result', payload: result, requestId: message.requestId });
            // Broadcast a tip notification to the room
            const roomId = `blackjack:table:${tableId}`;
            this.broadcastToRoom(roomId, {
                type: 'bj_multi_tip_notification',
                payload: { playerAddress: ws.playerAddress, amount: amount },
            });
        }
        catch (error) {
            logger_1.logger.error('BJ multi tip dealer error:', error);
            this.sendError(ws, error.message || 'Tip failed', message.requestId);
        }
    }
    /**
     * Generic tip dealer — works from any game page (solo blackjack, poker, etc.)
     * Deducts from player balance and credits the deployer wallet.
     */
    async handleGenericTipDealer(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Wallet required', message.requestId);
            }
            const { amount } = (message.payload ?? {});
            if (!amount)
                return this.sendError(ws, 'amount required', message.requestId);
            const tipAmount = BigInt(amount);
            if (tipAmount <= 0n)
                return this.sendError(ws, 'Invalid tip amount', message.requestId);
            const deployerWallet = (process.env.NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET || process.env.BLACKJACK_DEPLOYER_WALLET || '').toLowerCase();
            if (!deployerWallet)
                return this.sendError(ws, 'Deployer wallet not configured', message.requestId);
            const normalized = ws.playerAddress.toLowerCase();
            // Generic tip remains a direct transfer in WS domain for now; tracked in money audit docs.
            await this.dbService.deductPlayerBalance(normalized, tipAmount);
            await this.dbService.addPlayerBalance(deployerWallet, tipAmount);
            // Log to audit table so admin can track tips
            const pool = this.dbService.getPool();
            await pool.query(`INSERT INTO blackjack_multi_audit_log (table_id, round_id, player_address, action_type, payload)
         VALUES ('00000000-0000-0000-0000-000000000000', NULL, $1, 'tip_dealer', $2)`, [normalized, JSON.stringify({ amount: amount, recipient: deployerWallet, source: 'generic' })]).catch(() => { }); // don't fail the tip if logging fails
            this.sendMessage(ws, { type: 'tip_dealer_result', payload: { success: true }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('Generic tip dealer error:', error);
            this.sendError(ws, error.message || 'Tip failed', message.requestId);
        }
    }
    async handleBJMultiTableHistory(ws, message) {
        try {
            if (!this.bjMultiService)
                return this.sendError(ws, 'BJ multi not available', message.requestId);
            const { tableId, limit } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            const rounds = await this.bjMultiService.getTableHistory(tableId, Math.min(limit ?? 20, 50));
            this.sendMessage(ws, { type: 'bj_multi_table_history', payload: { rounds }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('BJ multi table history error:', error);
            this.sendError(ws, error.message || 'Failed to get history', message.requestId);
        }
    }
    /** Auto-stand a disconnected player if it's currently their turn. */
    async handleBJMultiDisconnect(tableId, playerAddress) {
        if (!this.bjMultiService)
            return;
        const pool = this.dbService.getPool();
        // Check if there's a playing round where this player is the acting seat
        const result = await pool.query(`
      SELECT r.id AS round_id, r.acting_seat_position, rs.seat_position
      FROM blackjack_multi_rounds r
      JOIN blackjack_multi_round_seats rs ON rs.round_id = r.id
      WHERE r.table_id = $1 AND r.status = 'playing'
        AND LOWER(rs.player_address) = LOWER($2)
        AND r.acting_seat_position = rs.seat_position
      ORDER BY r.round_number DESC LIMIT 1
    `, [tableId, playerAddress]);
        if (result.rows.length === 0)
            return; // not their turn — nothing to do
        logger_1.logger.info('BJMulti: player disconnected during their turn, auto-standing', {
            tableId, playerAddress, seat: result.rows[0].seat_position,
        });
        try {
            await this.bjMultiService.playerAction(tableId, playerAddress, 'stand');
            await this.broadcastBJMultiTableState(tableId);
        }
        catch (err) {
            logger_1.logger.error('BJMulti: disconnect auto-stand failed', { tableId, playerAddress, error: err });
        }
    }
    async handleBJMultiCreateTable(ws, message) {
        try {
            if (!this.bjMultiService)
                return this.sendError(ws, 'BJ multi not available', message.requestId);
            if (!ws.playerAddress || !(0, cosmetics_catalog_1.isAdminWallet)(ws.playerAddress)) {
                return this.sendError(ws, 'Admin required', message.requestId);
            }
            const { minBet, maxBet } = (message.payload ?? {});
            const min = minBet ? (0, safe_bigint_1.toBigIntSafe)(minBet) : BigInt('1000000000000000000');
            const max = maxBet ? (0, safe_bigint_1.toBigIntSafe)(maxBet) : BigInt('50000000000000000000000');
            const table = await this.bjMultiService.createTable(min, max);
            const tables = await this.bjMultiService.listTables();
            this.sendMessage(ws, { type: 'bj_multi_table_created', payload: { tableId: table.id, tables }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('BJ multi create table error:', error);
            this.sendError(ws, error.message || 'Failed to create table', message.requestId);
        }
    }
    async handleBJMultiDeleteTable(ws, message) {
        try {
            if (!this.bjMultiService)
                return this.sendError(ws, 'BJ multi not available', message.requestId);
            if (!ws.playerAddress || !(0, cosmetics_catalog_1.isAdminWallet)(ws.playerAddress)) {
                return this.sendError(ws, 'Admin required', message.requestId);
            }
            const { tableId } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            const ok = await this.bjMultiService.deleteTable(tableId);
            if (!ok)
                return this.sendError(ws, 'Table not found', message.requestId);
            const tables = await this.bjMultiService.listTables();
            this.sendMessage(ws, { type: 'bj_multi_table_deleted', payload: { tableId, tables }, requestId: message.requestId });
        }
        catch (error) {
            logger_1.logger.error('BJ multi delete table error:', error);
            this.sendError(ws, error.message || 'Failed to delete table', message.requestId);
        }
    }
    async handleBJMultiQuickReaction(ws, message) {
        try {
            if (!ws.playerAddress)
                return this.sendError(ws, 'Wallet required', message.requestId);
            const { tableId, type, value } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            this.broadcastToRoom(`blackjack:table:${tableId}`, {
                type: 'bj_multi_quick_reaction',
                payload: { tableId, playerAddress: ws.playerAddress, reactionType: type, value },
            });
        }
        catch (error) {
            logger_1.logger.error('BJ multi quick reaction error:', error);
        }
    }
    async handleBJMultiAvatarEmotion(ws, message) {
        try {
            if (!ws.playerAddress)
                return this.sendError(ws, 'Wallet required', message.requestId);
            const { tableId, emotion } = (message.payload ?? {});
            if (!tableId)
                return this.sendError(ws, 'tableId required', message.requestId);
            this.broadcastToRoom(`blackjack:table:${tableId}`, {
                type: 'bj_multi_avatar_emotion',
                payload: { tableId, playerAddress: ws.playerAddress, emotion },
            });
        }
        catch (error) {
            logger_1.logger.error('BJ multi avatar emotion error:', error);
        }
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.impl.js.map