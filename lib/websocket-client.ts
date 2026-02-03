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

/** Single chat message (server → client). Use on('chat_message', handler) to receive. */
export interface ChatMessagePayload {
  id: string;
  roomId: string;
  senderAddress: string | null;
  displayName?: string | null;
  text: string;
  timestamp: string; // ISO
}

/** Response from join_room. Use on('room_joined', handler) for events. */
export interface RoomJoinedPayload {
  roomId: string;
  recentMessages: Array<{
    id: string;
    roomId: string;
    senderAddress: string | null;
    displayName?: string | null;
    text: string;
    timestamp: string;
  }>;
}

/** Freeroll list item (server → client). Request: freeroll_list { includePast?: boolean }. Response: freeroll_list { tournaments: FreerollListItemPayload[] }. */
export interface FreerollListItemPayload {
  id: string;
  name: string;
  creator_address: string | null;
  tournament_type: string;
  freeroll_mode: string;
  scheduled_start_at: string | null;
  registration_opens_at: string | null;
  duration_minutes: number | null;
  starting_chips: number;
  current_phase: string | null;
  registered_count: number;
  action_timer_seconds: number | null;
  elimination_config: Record<string, unknown> | null;
  reentry_config: Record<string, unknown> | null;
  prize_distribution_type: string;
  custom_image: string | null;
  created_at: string;
}

/** freeroll_registered / freeroll_joined / freeroll_reentered payload. */
export interface FreerollEntryPayload {
  tournamentId: string;
  entryId: string;
  chips: number;
  startingChips?: number;
}

export class BlackjackWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, (payload: any) => void> = new Map();
  private requestPromises: Map<string, { resolve: Function; reject: Function }> = new Map();
  private intentionalClose = false;

  constructor(
    private serverUrl: string,
    private playerAddress?: string
  ) {
    if (!serverUrl || serverUrl.trim() === '') {
      throw new Error(
        'BlackjackWebSocketClient requires serverUrl (use getWebSocketUrl() from @/lib/api-urls).'
      );
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Reset intentional close flag for new connection
      this.intentionalClose = false;

      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const url = this.playerAddress
        ? `${this.serverUrl}?address=${this.playerAddress}`
        : this.serverUrl;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        // Skip reconnect attempts if this was an intentional close
        if (this.intentionalClose) {
          return;
        }
        logger.info('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        // Skip logging if this was an intentional close (e.g., during component cleanup)
        if (this.intentionalClose) {
          return;
        }

        const ws = this.ws;
        const errorMessage =
          ws?.readyState === WebSocket.CONNECTING
            ? `Failed to connect to ${url}. Server may be unavailable.`
            : ws?.readyState === WebSocket.CLOSING || ws?.readyState === WebSocket.CLOSED
              ? `Connection closed unexpectedly (state: ${ws?.readyState})`
              : `WebSocket error occurred (state: ${ws?.readyState})`;

        // Log only serializable fields (Event objects stringify as {})
        logger.error('WebSocket error', {
          message: errorMessage,
          readyState: ws?.readyState,
          url,
          eventType: (error as Event)?.type ?? 'error',
        });

        reject(new Error(errorMessage));
      };
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.intentionalClose = true;
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
  async sendRequest(type: string, payload: any): Promise<any> {
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
          const errMessage = error?.message ?? (typeof error === 'string' ? error : String(error));
          logger.error(`Request rejected (${type}, ${requestId}): ${errMessage}`);
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
            // Log only serializable primitives so console never shows {}
            logger.error('Server returned error', {
              requestId: message.requestId,
              message: errorMessage,
              requestType: message.type,
            });
            promise.reject(new Error(errorMessage));
          } else {
            logger.debug('Resolving promise', { requestId: message.requestId, type: message.type });
            promise.resolve(message.payload);
          }
          // Don't invoke generic 'error' handler for request error responses — those are
          // application errors (e.g. insufficient balance); the promise was already rejected.
          // The 'error' handler is for connection/transport errors only.
          if (message.type !== 'error') {
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
              handler(message.payload);
            }
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

  // === Chat API (main + per-game rooms) ===

  /**
   * Join a chat room (e.g. 'main' for home, 'blackjack', 'plinko', etc.).
   * Returns recent messages for that room. Subscribe to 'chat_message' for live messages.
   */
  async joinRoom(roomId: string): Promise<RoomJoinedPayload> {
    return this.sendRequest('join_room', { roomId });
  }

  /**
   * Send a chat message to the current room. Must have called joinRoom(roomId) first.
   * Server broadcasts to room; use on('chat_message', handler) to receive messages.
   */
  sendChatMessage(roomId: string, text: string): void {
    this.send({ type: 'chat_message', payload: { roomId, text } });
  }

  /**
   * Set your display name for chat (3–32 chars, letters/numbers/spaces/hyphens/underscores).
   * Requires connected wallet. Use on('display_name_set', handler) for the response.
   */
  async setDisplayName(displayName: string): Promise<{ displayName: string }> {
    return this.sendRequest('set_display_name', { displayName });
  }

  /**
   * Load older messages before the given message id (for "Load more").
   * Returns messages in chronological order (oldest first).
   */
  async getChatHistory(roomId: string, beforeId: string, limit: number = 50): Promise<{ messages: ChatMessagePayload[] }> {
    return this.sendRequest('get_chat_history', { roomId, beforeId, limit });
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

  // === Responsible Gaming / Self-Exclusion API ===

  /**
   * Check current exclusion status for the connected wallet.
   */
  async checkExclusionStatus(): Promise<{
    isExcluded: boolean;
    exclusionType: 'timeout' | 'permanent' | null;
    expiresAt: string | null;
    durationLabel: string | null;
    createdAt: string | null;
  }> {
    return this.sendRequest('check_exclusion_status', {});
  }

  /**
   * Set self-exclusion (cooling-off period or permanent).
   * @param durationType - '24h' | '7d' | '30d' | '6m' | '1y' | 'permanent'
   * @param reason - Optional reason for self-exclusion
   */
  async setExclusion(
    durationType: '24h' | '7d' | '30d' | '6m' | '1y' | 'permanent',
    reason?: string
  ): Promise<{
    success: boolean;
    isExcluded: boolean;
    exclusionType: 'timeout' | 'permanent' | null;
    expiresAt: string | null;
    durationLabel: string | null;
  }> {
    return this.sendRequest('set_exclusion', { durationType, reason });
  }

  /**
   * Get exclusion history for the connected wallet.
   */
  async getExclusionHistory(): Promise<{
    history: Array<{
      id: string;
      exclusionType: 'timeout' | 'permanent';
      durationLabel: string;
      expiresAt: string | null;
      createdAt: string;
      isActive: boolean;
    }>;
  }> {
    return this.sendRequest('get_exclusion_history', {});
  }
}