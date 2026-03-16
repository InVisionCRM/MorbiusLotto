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
  /** When true, sending is disabled and UI should show "Chat is paused". */
  chatPaused?: boolean;
}

/** Server → client when an admin deletes a message. Use on('chat_message_deleted', handler). */
export interface ChatMessageDeletedPayload {
  roomId: string;
  messageId: string;
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
  elimination_config?: Record<string, unknown> | null; // Legacy; unused
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

// === Poker types (MVP multiplayer Texas Hold'em) ===

export interface PokerTableSummary {
  id: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: string;
  seatedCount: number;
  emptySeats: number;
}

/** Pixel-avatar config for poker table display (skin, hair, eyes, etc.). */
export interface AvatarConfig {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  eyeShape: string;
  eyeColor: string;
  noseShape: string;
  lipShape: string;
  accessory: string;
  shirtColor: string;
  hat: string;
  necklace: string;
  mouthAccessory: string;
  backgroundImage: string;
  faceShape: string;
  customPattern: string;
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
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: AvatarConfig | null;
}

export interface PokerCurrentHand {
  handId: string;
  street: string;
  communityCards: number[];
  pot: string;
  actingPosition: number | null;
  lastAction: { position: number; action: string; amount: string } | null;
  minRaise: string;
  toCall: string;
  /** ISO timestamp when the current player's turn started (for 30s timer). */
  turnStartedAt: string | null;
  /** At showdown: all players' revealed hole cards keyed by lowercase address */
  showdownHands?: Record<string, number[]>;
  /** At showdown: winner(s), amount each receives, optional hand name, and 5 card indices forming best hand */
  winners?: { address: string; amount: string; handName?: string; winningCardIndices?: number[] }[];
}

export interface PokerTableState {
  tableId: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: string;
  seats: PokerSeatState[];
  currentHand: PokerCurrentHand | null;
  myHoleCards: number[] | null;
}

/** EIP-712 domain for WebSocket auth (must match server) */
const AUTH_EIP712_DOMAIN = {
  name: 'MORBlotto Blackjack' as const,
  version: '1' as const,
  chainId: 369,
};

/** EIP-712 types for WebSocket auth (must match server) */
const AUTH_EIP712_TYPES = {
  AuthChallenge: [
    { name: 'nonce', type: 'string' },
  ],
} as const;

/** Function signature that matches wagmi's signTypedDataAsync */
export type SignTypedDataFn = (params: {
  domain: typeof AUTH_EIP712_DOMAIN;
  types: typeof AUTH_EIP712_TYPES;
  primaryType: 'AuthChallenge';
  message: { nonce: string };
}) => Promise<`0x${string}`>;

export class BlackjackWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, Set<(payload: any) => void>> = new Map();
  private requestPromises: Map<string, { resolve: Function; reject: Function }> = new Map();
  private intentionalClose = false;
  private signTypedData: SignTypedDataFn | null = null;

  constructor(
    private serverUrl: string,
    private playerAddress?: string,
    signTypedData?: SignTypedDataFn
  ) {
    if (!serverUrl || serverUrl.trim() === '') {
      throw new Error(
        'BlackjackWebSocketClient requires serverUrl (use getWebSocketUrl() from @/lib/api-urls).'
      );
    }
    this.signTypedData = signTypedData ?? null;
  }

  /**
   * Connect to the WebSocket server.
   * If a signTypedData function was provided, performs EIP-712 auth and resolves
   * after auth_success. Otherwise falls back to legacy query-param auth and
   * resolves once the server sends any initial message (auth_challenge or
   * connection_established).
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

      const canSign = !!(this.signTypedData && this.playerAddress);

      this.ws = new WebSocket(url);

      // Track whether we've resolved/rejected to avoid double-calls
      let settled = false;

      this.ws.onopen = () => {
        console.log('%c🦇 MORBIUS.IO — socket open. we do not stop.', 'color:#22d3ee;font-weight:bold;font-size:11px;');
        logger.info('WebSocket connected' + (canSign ? ', waiting for auth challenge...' : ' (legacy mode)'));
        this.reconnectAttempts = 0;
        // If we can't sign, we're in legacy mode — don't wait for auth
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === 'auth_challenge' && !settled) {
            const skipAuth = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SKIP_WS_AUTH === 'true';
            if (skipAuth) {
              settled = true;
              logger.info('WebSocket connected (NEXT_PUBLIC_SKIP_WS_AUTH: no sign)');
              resolve();
              return;
            }
            if (canSign) {
              // Full EIP-712 auth: sign the nonce and send auth_response, wait for auth_success
              this.handleAuthChallenge(msg.payload).catch((err) => {
                console.error('[WS Client] handleAuthChallenge failed:', err.message, err);
                if (!settled) {
                  settled = true;
                  reject(new Error(`Auth challenge failed: ${err.message}`));
                }
              });
              return;
            }

            // Can't sign — check if server auto-authenticated us via query param (grace period)
            const isGracePeriodAuth = msg.payload?.claimedAddress &&
                                     this.playerAddress &&
                                     msg.payload.claimedAddress.toLowerCase() === this.playerAddress.toLowerCase();

            if (isGracePeriodAuth) {
              settled = true;
              logger.info('WebSocket connected (grace period auto-auth, skipping EIP-712 signature)');
              resolve();
              return;
            }

            // Legacy mode: server sent challenge but we can't sign and no grace period match.
            settled = true;
            logger.info('WebSocket connected (legacy auth, no EIP-712 signing)');
            resolve();
            return;
          }

          if (msg.type === 'auth_success' && !settled) {
            settled = true;
            logger.info('WebSocket authenticated successfully via EIP-712');
            resolve();
            this.handleMessage(event.data as string);
            return;
          }

          // Legacy servers that don't send auth_challenge send connection_established
          if (msg.type === 'connection_established' && !settled) {
            settled = true;
            logger.info('WebSocket connected (legacy server, no auth challenge)');
            resolve();
            this.handleMessage(event.data as string);
            return;
          }

          // If auth failed (error with no requestId during auth phase)
          if (msg.type === 'error' && !settled) {
            const errMsg = msg.payload?.message || msg.payload?.error || 'Authentication failed';
            settled = true;
            reject(new Error(errMsg));
            return;
          }
        } catch {
          // Not JSON, fall through
        }

        this.handleMessage(event.data as string);
      };

      this.ws.onclose = () => {
        if (this.intentionalClose) {
          return;
        }
        logger.info('WebSocket disconnected');
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before authentication completed'));
        }
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
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

        logger.error('WebSocket error', {
          message: errorMessage,
          readyState: ws?.readyState,
          url,
          eventType: (error as Event)?.type ?? 'error',
        });

        if (!settled) {
          settled = true;
          reject(new Error(errorMessage));
        }
      };
    });
  }

  /**
   * Handle auth challenge from server: sign nonce with EIP-712 and send back
   */
  private async handleAuthChallenge(payload: { nonce: string; claimedAddress?: string }): Promise<void> {
    if (!this.signTypedData) {
      throw new Error('signTypedData function not provided — cannot authenticate');
    }

    if (!this.playerAddress) {
      throw new Error('No player address — cannot authenticate');
    }

    const signature = await this.signTypedData({
      domain: AUTH_EIP712_DOMAIN,
      types: AUTH_EIP712_TYPES,
      primaryType: 'AuthChallenge',
      message: { nonce: payload.nonce },
    });

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'auth_response',
        payload: {
          address: this.playerAddress,
          signature,
        },
      }));
    } else {
      console.error('[WS Client] WebSocket not open when trying to send auth_response, readyState:', this.ws?.readyState);
    }
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

      // Set timeout (poker_get_state and tournament join can be slow on cold DB / many players)
      const timeoutMs = type === 'poker_get_state' ? 60000
        : type === 'poker_tournament_join' ? 60000
        : 30000;
      const timeout = setTimeout(() => {
        this.requestPromises.delete(requestId);
        logger.error('Request timeout', { type, requestId, payload });
        reject(new Error(`Request timeout: ${type} (requestId: ${requestId})`));
      }, timeoutMs);

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
            // Handle various error payload formats — coerce everything to a string
            let errorMessage = 'Unknown server error';
            if (message.payload) {
              if (typeof message.payload === 'string') {
                errorMessage = message.payload;
              } else {
                const raw = message.payload.message ?? message.payload.error;
                if (raw != null) {
                  errorMessage = typeof raw === 'string' ? raw : JSON.stringify(raw);
                } else if (Object.keys(message.payload).length > 0) {
                  errorMessage = JSON.stringify(message.payload);
                }
              }
            }
            // Embed message in the primary string so it's always visible in the console
            logger.error(`Server returned error: ${errorMessage}`, { requestId: message.requestId });
            promise.reject(new Error(errorMessage));
          } else {
            logger.debug('Resolving promise', { requestId: message.requestId, type: message.type });
            promise.resolve(message.payload);
          }
          // Don't invoke generic 'error' handler for request error responses — those are
          // application errors (e.g. insufficient balance); the promise was already rejected.
          // The 'error' handler is for connection/transport errors only.
          if (message.type !== 'error') {
            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
              handlers.forEach((h) => h(message.payload));
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
      const handlers = this.messageHandlers.get(message.type);
      if (handlers && handlers.size > 0) {
        logger.debug('Handling event message', { type: message.type });
        handlers.forEach((h) => h(message.payload));
      } else {
        // Known broadcast types (handled by optional listeners like GlobalWinsFeed) — don't warn.
        const knownEventTypes = new Set([
          'connection_established',
          'pong',
          'global_game_completed',
          'chat_message',
          'chat_message_deleted',
          'room_joined',
          'poker_table_state',
          'poker_table_list',
          'poker_quick_reaction',
          'poker_avatar_emotion',
        ]);
        if (!knownEventTypes.has(message.type)) {
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
   * Register event handler. Multiple handlers per event are supported.
   */
  on(event: string, handler: (payload: any) => void) {
    let set = this.messageHandlers.get(event);
    if (!set) {
      set = new Set();
      this.messageHandlers.set(event, set);
    }
    set.add(handler);
  }

  /**
   * Remove event handler(s). If handler is provided, removes only that handler; otherwise removes all for the event.
   */
  off(event: string, handler?: (payload: any) => void) {
    if (handler) {
      const set = this.messageHandlers.get(event);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this.messageHandlers.delete(event);
      }
    } else {
      this.messageHandlers.delete(event);
    }
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
  async createGame(
    betAmount: bigint,
    clientSeedCommitment?: string,
    gameHash?: string,
    perfectPairsBetAmount?: bigint
  ): Promise<GameState> {
    const payload: Record<string, string | undefined> = {
      betAmount: betAmount.toString(),
      clientSeedCommitment,
      gameHash
    };
    if (perfectPairsBetAmount != null && perfectPairsBetAmount > 0n) {
      payload.perfectPairsBetAmount = perfectPairsBetAmount.toString();
    }
    return this.sendRequest('create_game', payload);
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

  // === Poker API (MVP multiplayer Texas Hold'em) ===

  /** List available poker tables (no auth required). */
  async pokerListTables(): Promise<{ tables: PokerTableSummary[] }> {
    return this.sendRequest('poker_list_tables', {});
  }

  /** Join a table with buy-in chips. Auth required. Subscribe to 'poker_table_state' for broadcasts. */
  async pokerJoinTable(tableId: string, buyInChips: string): Promise<PokerTableState> {
    return this.sendRequest('poker_join_table', { tableId, buyInChips });
  }

  /** Leave a table (stack is credited back to balance). Auth required. */
  async pokerLeaveTable(tableId: string): Promise<PokerTableState | null> {
    return this.sendRequest('poker_leave_table', { tableId });
  }

  /** Add chips to an existing seat (deducted from balance, takes effect immediately). Auth required. */
  async pokerAddChips(tableId: string, amount: string): Promise<PokerTableState> {
    return this.sendRequest('poker_add_chips', { tableId, amount });
  }

  /** Send a poker action: fold, check, call, bet, raise. For bet/raise pass amount as string. Auth required. */
  async pokerAction(tableId: string, handId: string, action: string, amount?: string): Promise<PokerTableState> {
    const payload: { tableId: string; handId: string; action: string; amount?: string } = { tableId, handId, action };
    if (amount != null) payload.amount = amount;
    return this.sendRequest('poker_action', payload);
  }

  /** Get current table state (e.g. after reconnect). Auth required. */
  async pokerGetState(tableId: string): Promise<PokerTableState> {
    return this.sendRequest('poker_get_state', { tableId });
  }

  /** Create a new table. Auth required. Returns the new table id. */
  async pokerCreateTable(smallBlind: string, bigBlind: string, maxSeats: number = 6): Promise<{ tableId: string }> {
    return this.sendRequest('poker_create_table', { smallBlind, bigBlind, maxSeats });
  }

  /**
   * Send a quick reaction (emoji or phrase) to the table. Server broadcasts to all players at the table.
   * Must be seated. Use on('poker_quick_reaction', handler) to receive; payload is { tableId, seatIndex, type: 'emoji'|'phrase', value: string }.
   */
  sendPokerQuickReaction(tableId: string, type: 'emoji' | 'phrase', value: string): void {
    this.send({ type: 'poker_quick_reaction', payload: { tableId, type, value } });
  }

  /**
   * Broadcast avatar emotion to the table so all players see it.
   * Emotion must be one of: happy, sad, angry, surprised, wink.
   */
  sendPokerAvatarEmotion(tableId: string, emotion: string): void {
    this.send({ type: 'poker_avatar_emotion', payload: { tableId, emotion } });
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
   * Set your display name and optional profile image for chat/nav (3–32 chars for name).
   * Requires connected wallet. Use on('display_name_set', handler) for the response.
   * Optionally pass profileImageUrl and/or avatarConfig; get_profile and display_name_set responses include avatarConfig.
   */
  async setDisplayName(displayName: string, profileImageUrl?: string | null, avatarConfig?: AvatarConfig | null): Promise<{ displayName: string; profileImageUrl: string | null; avatarConfig: AvatarConfig | null }> {
    const payload: { displayName: string; profileImageUrl?: string | null; avatarConfig?: AvatarConfig | null } = { displayName };
    if (profileImageUrl !== undefined) payload.profileImageUrl = profileImageUrl;
    if (avatarConfig !== undefined) payload.avatarConfig = avatarConfig;
    return this.sendRequest('set_display_name', payload);
  }

  /**
   * Get current profile (display name, profile image URL, avatar config) for the connected wallet.
   */
  async getProfile(): Promise<{ displayName: string | null; profileImageUrl: string | null; avatarConfig: AvatarConfig | null }> {
    return this.sendRequest('get_profile', {});
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