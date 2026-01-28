import { logger } from './logger';

export interface WebSocketMessage {
  type: string;
  payload: any;
  requestId?: string;
}

export interface GameState {
  gameId: string;
  sessionId: string;
  playerCards: number[];
  dealerCards: number[];
  playerTotal: number;
  dealerTotal: number;
  status: 'waiting' | 'player_turn' | 'dealer_turn' | 'completed';
  betAmount: bigint;
  result?: 'win' | 'loss' | 'push' | 'blackjack';
  payout: bigint;
  actions: any[];
  dealerActions: any[];
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  isBlackjack: boolean;
}

export class BlackjackWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, (payload: any) => void> = new Map();
  private requestPromises: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor(
    private serverUrl: string = 'ws://localhost:3001',
    private playerAddress?: string
  ) {}

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:44',message:'connect() called',data:{serverUrl:this.serverUrl,playerAddress:this.playerAddress,existingWsState:this.ws?.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (this.ws?.readyState === WebSocket.OPEN) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:47',message:'WebSocket already open',data:{readyState:this.ws.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        resolve();
        return;
      }

      const url = this.playerAddress
        ? `${this.serverUrl}?address=${this.playerAddress}`
        : this.serverUrl;

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:54',message:'Creating WebSocket with URL',data:{url,serverUrl:this.serverUrl,hasPlayerAddress:!!this.playerAddress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:60',message:'WebSocket onopen fired',data:{readyState:this.ws?.readyState,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        logger.info('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:70',message:'WebSocket onclose fired',data:{code:event.code,reason:event.reason,wasClean:event.wasClean,readyState:this.ws?.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        logger.info('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        // #region agent log
        const errorDetails = {
          type: error?.type,
          target: error?.target ? {
            readyState: (error.target as WebSocket)?.readyState,
            url: (error.target as WebSocket)?.url,
            protocol: (error.target as WebSocket)?.protocol,
            extensions: (error.target as WebSocket)?.extensions
          } : null,
          timeStamp: (error as any)?.timeStamp,
          errorString: String(error),
          errorKeys: error ? Object.keys(error) : []
        };
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'websocket-client.ts:75',message:'WebSocket onerror fired',data:errorDetails,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const ws = this.ws;
        const errorMessage =
          ws?.readyState === WebSocket.CONNECTING
            ? `Failed to connect to ${url}. Server may be unavailable.`
            : ws?.readyState === WebSocket.CLOSING || ws?.readyState === WebSocket.CLOSED
              ? `Connection closed unexpectedly (state: ${ws.readyState})`
              : `WebSocket error occurred (state: ${ws?.readyState})`;

        // Log a plain object so the console doesn't show {}
        logger.error('WebSocket error', {
          message: errorMessage,
          readyState: ws?.readyState,
          url,
          event: error,
        });

        // Extract meaningful error information
        reject(new Error(errorMessage));
      };
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a message to the server
   */
  private send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * Send a request and wait for response
   */
  private async sendRequest(type: string, payload: any): Promise<any> {
    // Use a collision-resistant id. Short Math.random() ids can collide under load and
    // cause "Request timeout" even when the server responded.
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      // Check if websocket is connected
      if (!this.isConnected()) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.requestPromises.delete(requestId);
        logger.error('Request timeout', { type, requestId, payload });
        reject(new Error(`Request timeout: ${type} (requestId: ${requestId})`));
      }, 30000);

      this.requestPromises.set(requestId, {
        resolve: (data: any) => {
          clearTimeout(timeout);
          logger.debug('Request resolved', { type, requestId });
          resolve(data);
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          logger.error('Request rejected', { type, requestId, error });
          reject(error);
        }
      });

      try {
        logger.debug('Sending request', { type, requestId, payload });
        this.send({ type, payload, requestId });
      } catch (error) {
        clearTimeout(timeout);
        this.requestPromises.delete(requestId);
        logger.error('Failed to send request', { type, requestId, error });
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string) {
    try {
      const message: WebSocketMessage = JSON.parse(data);
      logger.debug('Received message', { type: message.type, requestId: message.requestId });

      // Handle request responses
      if (message.requestId) {
        const promise = this.requestPromises.get(message.requestId);
        if (promise) {
          this.requestPromises.delete(message.requestId);
          logger.debug('Found promise for request', { requestId: message.requestId, type: message.type });

          if (message.type === 'error') {
            // Handle various error payload formats
            let errorMessage = 'Unknown server error';
            if (message.payload) {
              if (typeof message.payload === 'string') {
                errorMessage = message.payload;
              } else if (message.payload.message) {
                errorMessage = message.payload.message;
              } else if (message.payload.error) {
                errorMessage = message.payload.error;
              } else if (Object.keys(message.payload).length > 0) {
                errorMessage = JSON.stringify(message.payload);
              }
            }
            
            logger.error('Server returned error', { 
              requestId: message.requestId, 
              error: errorMessage,
              payload: message.payload,
              payloadType: typeof message.payload,
              payloadKeys: message.payload ? Object.keys(message.payload) : []
            });
            promise.reject(new Error(errorMessage));
          } else {
            logger.debug('Resolving promise', { requestId: message.requestId, type: message.type });
            promise.resolve(message.payload);
          }
          // Also allow consumers to subscribe to the response message type (e.g. 'game_updated')
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message.payload);
          }
          return;
        } else {
          // Only warn if it's not an event type that shouldn't have requestId
          // Some events might incorrectly include requestId - handle gracefully
          if (message.type !== 'game_completed' && message.type !== 'game_updated') {
            logger.warn('Received response for unknown request', { requestId: message.requestId, type: message.type });
          }
          // Fall through to event handling even if requestId exists but no promise found
        }
      }

      // Handle event messages
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        logger.debug('Handling event message', { type: message.type });
        handler(message.payload);
      } else {
        // These are informational server events; ignore if the app didn't register a handler.
        if (message.type !== 'connection_established' && message.type !== 'pong') {
          logger.warn('Unhandled message type:', message.type);
        }
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Connection failed, will retry
      });
    }, delay);
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (payload: any) => void) {
    this.messageHandlers.set(event, handler);
  }

  /**
   * Remove event handler
   */
  off(event: string) {
    this.messageHandlers.delete(event);
  }

  // === Game API ===

  /**
   * Get server seed hash for current session (to generate game hash)
   */
  async getServerSeedHash(): Promise<{ serverSeedHash: string; nonce: number }> {
    return this.sendRequest('get_server_seed_hash', {});
  }

  /**
   * Create a new game
   */
  async createGame(betAmount: bigint, clientSeedCommitment?: string, gameHash?: string): Promise<GameState> {
    return this.sendRequest('create_game', {
      betAmount: betAmount.toString(),
      clientSeedCommitment,
      gameHash
    });
  }

  async getBalance(): Promise<{ balance: string }> {
    return this.sendRequest('get_balance', {});
  }

  async syncBalance(): Promise<{ balance: string }> {
    return this.sendRequest('sync_balance', {});
  }

  /**
   * Perform a player action
   */
  async playerAction(gameId: string, action: 'hit' | 'stand' | 'double_down' | 'split', clientSeed?: string): Promise<GameState> {
    return this.sendRequest('player_action', {
      gameId,
      action,
      clientSeed
    });
  }

  /**
   * Get game result for verification
   */
  async getGameResult(gameId: string): Promise<any> {
    return this.sendRequest('get_game_state', { gameId });
  }

  /**
   * Send ping to keep connection alive
   */
  ping(): void {
    this.send({ type: 'ping', payload: {} });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}