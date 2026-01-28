import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { DatabaseService } from './database.service';
import { BlackjackGameService, GameState, CreateGameRequest, PlayerActionRequest } from './blackjack-game.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { createPublicClient, http } from 'viem';
import { pulsechain } from 'viem/chains';
import { blackjackAbi } from '../abi/blackjack';

interface WebSocketMessage {
  type: string;
  payload: any;
  requestId?: string;
}

interface WebSocketClient extends WebSocket {
  playerAddress?: string;
  connectionId?: string;
  isAlive?: boolean;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout;
  private publicClient: any;
  private contractAddress: `0x${string}`;

  constructor(
    server: any,
    private gameService: BlackjackGameService,
    private dbService: DatabaseService
  ) {
    this.wss = new WebSocketServer({ server });
    
    // Initialize public client for reading contract state
    this.publicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
    });
    
    this.contractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080') as `0x${string}`;

    this.wss.on('connection', this.handleConnection.bind(this));

    // Heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((client: WebSocketClient) => {
        if (!client.isAlive) {
          client.terminate();
          return;
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    logger.info('WebSocket service initialized');
  }

  private async handleConnection(ws: WebSocketClient, request: IncomingMessage) {
    const connectionId = uuidv4();
    ws.connectionId = connectionId;
    ws.isAlive = true;

    // Extract player address from query parameters
    const url = new URL(request.url || '', 'http://localhost');
    const playerAddress = url.searchParams.get('address');

    // IMPORTANT: attach handlers immediately. If we await DB calls before registering
    // ws.on('message'), early client requests (like get_balance right after connect)
    // can be dropped and will timeout client-side.
    ws.on('message', (data: Buffer) => this.handleMessage(ws, data));

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
        logger.info('WebSocket connection closed', { connectionId: ws.connectionId });
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { connectionId: ws.connectionId, error });
    });

    if (playerAddress) {
      ws.playerAddress = playerAddress;
      try {
        // active_connections expects a UUID player_id (players.id), not a wallet address
        const player = await this.dbService.getOrCreatePlayer(playerAddress);
        await this.dbService.addActiveConnection(player.id, connectionId);
        logger.info('WebSocket connection established', { connectionId, playerAddress: player.wallet_address, playerId: player.id });
      } catch (error) {
        // Don't crash the server if connection tracking fails
        logger.error('Failed to track active connection', { connectionId, playerAddress, error });
      }
    } else {
      logger.warn('WebSocket connection without player address', { connectionId });
    }

    // Send welcome message
    this.sendMessage(ws, {
      type: 'connection_established',
      payload: { connectionId, playerAddress }
    });
  }

  private async handleMessage(ws: WebSocketClient, data: Buffer) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      logger.debug('Received WebSocket message', {
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

        default:
          this.sendError(ws, 'Unknown message type', message.requestId);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      this.sendError(ws, 'Invalid message format', undefined);
    }
  }

  private async handleGetServerSeedHash(ws: WebSocketClient, message: WebSocketMessage) {
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

    } catch (error) {
      logger.error('Error getting server seed hash:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleCreateGame(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }

      const payload = message.payload as any;
      
      // Convert betAmount from string to bigint if needed
      let betAmount: bigint;
      try {
        if (typeof payload.betAmount === 'string') {
          betAmount = BigInt(payload.betAmount);
        } else if (typeof payload.betAmount === 'bigint') {
          betAmount = payload.betAmount;
        } else {
          betAmount = BigInt(payload.betAmount || '0');
        }
      } catch (error) {
        logger.error('Invalid betAmount format', { payload, error });
        return this.sendError(ws, 'Invalid bet amount format', message.requestId);
      }

      // Validate player has sufficient off-chain balance
      try {
        const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
        if (balance < betAmount) {
          return this.sendError(ws, `Insufficient balance. You have ${balance.toString()}, but need ${betAmount.toString()}`, message.requestId);
        }
      } catch (error) {
        logger.error('Error checking player balance:', error);
        return this.sendError(ws, 'Failed to verify balance. Please try again.', message.requestId);
      }

      logger.debug('Creating game', {
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

      logger.debug('Game created successfully', {
        gameId: gameState.gameId,
        requestId: message.requestId
      });

      this.sendMessage(ws, {
        type: 'game_created',
        payload: gameState,
        requestId: message.requestId
      });

    } catch (error) {
      logger.error('Error creating game:', {
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

  private async handlePlayerAction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }

      const payload = message.payload as PlayerActionRequest;
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
      }

    } catch (error) {
      logger.error('Error handling player action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleSyncBalance(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }

      // Get contract reserve balance
      const contractBalance = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: blackjackAbi,
        functionName: 'getPlayerReserve',
        args: [ws.playerAddress as `0x${string}`]
      }) as bigint;

      // Sync off-chain balance with contract
      await this.dbService.syncPlayerBalanceWithContract(ws.playerAddress, contractBalance);

      logger.debug('Balance synced', {
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
    } catch (error) {
      logger.error('Error syncing balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync balance';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleGetBalance(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get balance';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleGetGameState(ws: WebSocketClient, message: WebSocketMessage) {
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

    } catch (error) {
      logger.error('Error getting game state:', error);
      this.sendError(ws, 'Failed to get game state', message.requestId);
    }
  }

  private sendMessage(ws: WebSocketClient, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        // Convert BigInt values to strings for JSON serialization
        // This replacer handles nested objects and arrays
        const replacer = (key: string, value: any): any => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          // Handle nested objects/arrays that might contain BigInt
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              return value.map(item => typeof item === 'bigint' ? item.toString() : item);
            }
            // For objects, recursively process
            const processed: any = {};
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
      } catch (error) {
        logger.error('Error sending WebSocket message:', {
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
          } catch (sendError) {
            logger.error('Failed to send error message to client:', sendError);
          }
        }
      }
    }
  }

  private sendError(ws: WebSocketClient, error: string | Error, requestId?: string) {
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
  private broadcastToPlayer(playerAddress: string, message: WebSocketMessage) {
    this.wss.clients.forEach((client: WebSocketClient) => {
      if (client.playerAddress === playerAddress && client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  // Get connection count
  public getConnectionCount(): number {
    return this.wss.clients.size;
  }

  // Get active players count
  public async getActivePlayersCount(): Promise<number> {
    const result = await this.dbService.cleanupOldConnections();
    return this.wss.clients.size;
  }

  // Clean shutdown
  public shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.clients.forEach((client: WebSocketClient) => {
      client.close(1000, 'Server shutdown');
    });

    this.wss.close();
    logger.info('WebSocket service shut down');
  }
}