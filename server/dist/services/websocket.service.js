"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
class WebSocketService {
    gameService;
    dbService;
    wss;
    clients = new Map();
    heartbeatInterval;
    constructor(server, gameService, dbService) {
        this.gameService = gameService;
        this.dbService = dbService;
        this.wss = new ws_1.WebSocketServer({ server });
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
        logger_1.logger.info('WebSocket service initialized');
    }
    async handleConnection(ws, request) {
        const connectionId = (0, uuid_1.v4)();
        ws.connectionId = connectionId;
        ws.isAlive = true;
        // Extract player address from query parameters
        const url = new URL(request.url || '', 'http://localhost');
        const playerAddress = url.searchParams.get('address');
        if (playerAddress) {
            ws.playerAddress = playerAddress;
            await this.dbService.addActiveConnection(playerAddress, connectionId);
            logger_1.logger.info('WebSocket connection established', { connectionId, playerAddress });
        }
        else {
            logger_1.logger.warn('WebSocket connection without player address', { connectionId });
        }
        // Handle messages
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
                this.clients.delete(ws.connectionId);
                this.dbService.removeActiveConnection(ws.connectionId);
                logger_1.logger.info('WebSocket connection closed', { connectionId: ws.connectionId });
            }
        });
        // Handle errors
        ws.on('error', (error) => {
            logger_1.logger.error('WebSocket error', { connectionId: ws.connectionId, error });
        });
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
                case 'create_game':
                    await this.handleCreateGame(ws, message);
                    break;
                case 'player_action':
                    await this.handlePlayerAction(ws, message);
                    break;
                case 'get_game_state':
                    await this.handleGetGameState(ws, message);
                    break;
                case 'ping':
                    this.sendMessage(ws, { type: 'pong', payload: {}, requestId: message.requestId });
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
    async handleCreateGame(ws, message) {
        try {
            if (!ws.playerAddress) {
                return this.sendError(ws, 'Player address not authenticated', message.requestId);
            }
            const payload = message.payload;
            const gameState = await this.gameService.createGame({
                playerAddress: ws.playerAddress,
                betAmount: payload.betAmount,
                clientSeedCommitment: payload.clientSeedCommitment
            });
            this.sendMessage(ws, {
                type: 'game_created',
                payload: gameState,
                requestId: message.requestId
            });
        }
        catch (error) {
            logger_1.logger.error('Error creating game:', error);
            this.sendError(ws, 'Failed to create game', message.requestId);
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
            // If game is completed, also send settlement info
            if (gameState.status === 'completed') {
                // Calculate overall result from hands
                const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
                const allPush = gameState.playerHands.every(h => h.result === 'push');
                const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';
                this.sendMessage(ws, {
                    type: 'game_completed',
                    payload: {
                        gameId: gameState.gameId,
                        result: overallResult,
                        payout: gameState.totalPayout,
                        betAmount: gameState.totalBetAmount
                    },
                    requestId: message.requestId
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling player action:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
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
    sendMessage(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            }
            catch (error) {
                logger_1.logger.error('Error sending WebSocket message:', error);
            }
        }
    }
    sendError(ws, error, requestId) {
        this.sendMessage(ws, {
            type: 'error',
            payload: { message: error },
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
    // Get connection count
    getConnectionCount() {
        return this.wss.clients.size;
    }
    // Get active players count
    async getActivePlayersCount() {
        const result = await this.dbService.cleanupOldConnections();
        return this.wss.clients.size;
    }
    // Clean shutdown
    shutdown() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
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