import { logger } from './logger';
import type { AvatarConfig, AvatarPayload } from './avatar-payload';
import { parseAvatarPayload, mergeV1AvatarPartial, AVATAR_V1_DEFAULTS } from './avatar-payload';
import { WS_KNOWN_EVENT_TYPES, WS_MESSAGE_TYPES } from './websocket-message-types';

export type { AvatarConfig, AvatarPayload };
export { parseAvatarPayload, mergeV1AvatarPartial, AVATAR_V1_DEFAULTS };

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
  /** Legacy uploaded image; used when avatarConfig is absent */
  profileImageUrl?: string | null;
  /** Morbius character avatar (v1 procedural — see parseAvatarPayload) */
  avatarConfig?: Record<string, unknown> | null;
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
    profileImageUrl?: string | null;
    avatarConfig?: Record<string, unknown> | null;
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
  hasPin: boolean;
  /** Lowercase 0x wallet that created the table; omitted on older servers. */
  creatorAddress?: string | null;
  /** ISO8601 table creation time; omitted on older servers. */
  createdAt?: string | null;
}

export interface PokerSeatState {
  position: number;
  playerAddress: string | null;
  stack: string;
  status: string;
  consecutiveTimeouts?: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  folded: boolean;
  currentBet: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: AvatarPayload | null;
  /** Per-player render preference at this seat. Defaults to 'avatar'. */
  profileDisplayMode?: 'avatar' | 'photo';
}

export interface PokerCurrentHand {
  handId: string;
  street: string;
  communityCards: number[];
  /** Sum of all pots (kept as scalar for backward compat). */
  pot: string;
  /**
   * Per-pot breakdown so the client can render main / side / uncalled pots
   * as separately labeled stacks and animate chip flow per-pot at showdown.
   * Missing on legacy backends — fall back to the scalar `pot`.
   */
  pots?: {
    amount: string;
    label: string;
    /** Lowercase player addresses chevtek paid this pot to (set at showdown). */
    winnerAddresses?: string[];
  }[];
  actingPosition: number | null;
  lastAction: { position: number; action: string; amount: string } | null;
  /**
   * Recent non-blind actions across the hand, oldest → newest. Each carries its own
   * `street` and monotonic `order`, so clients can log every action even when rapid
   * server broadcasts are batched into a single React state update.
   */
  recentActions?: {
    order: number;
    street: string;
    position: number;
    action: string;
    amount: string;
  }[];
  streetActions?: Record<number, { action: string; amount: string }>;
  minRaise: string;
  toCall: string;
  /** ISO timestamp when the current player's turn started (for 30s timer). */
  turnStartedAt: string | null;
  /** When set (showdown only), wall-clock ISO when the server auto-starts the next hand. */
  nextHandAt?: string | null;
  /** At showdown: all players' revealed hole cards keyed by lowercase address */
  showdownHands?: Record<string, number[]>;
  /**
   * At showdown: true when at least two dealt-in players did not fold (real showdown).
   * False on fold-out wins — uncalled winners' hole cards are not public.
   */
  handWentToShowdown?: boolean;
  /** At showdown: winner(s), amount each receives, optional hand name, and 5 card indices forming best hand */
  winners?: { address: string; amount: string; handName?: string; winningCardIndices?: number[] }[];
  /**
   * Provably-fair commitment — `SHA-256(serverSeed)` published at hand start.
   * The plaintext seed is hidden until showdown; this hash lets the UI prove
   * "deck was locked in before the deal" while the hand is in progress.
   * After showdown, the verify page (`/poker/verify?handId=...`) reveals the
   * seed and walks through the full proof.
   */
  serverSeedHash?: string;
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
  /** Sponsored gallery logo filename, or null when idle (client shows default Morbius logo). */
  tableLogo?: string | null;
  /** Logo opacity (0–1). Default 0.12. */
  tableLogoOpacity?: number | null;
  /** ISO end of paid logo window, or null. */
  tableLogoSponsoredUntil?: string | null;
  tableLogoSponsorAddress?: string | null;
  /** True when felt uses default Morbius logo (no active sponsorship). */
  tableLogoIsDefault?: boolean;
  /** Whole MORBIUS chips as decimal string for the next logo change. */
  tableLogoPriceMorbiusChips?: string;
  /** Sponsored token's contract address (lowercase) — null when no active sponsorship. */
  tableLogoTokenAddress?: string | null;
  tableLogoTokenName?: string | null;
  tableLogoTokenSymbol?: string | null;
  tableLogoTokenLogoUrl?: string | null;
  /** Present for tournament-mode tables (`poker_tables.tournament_id`). HUD works without `?tournament=` in the URL. */
  tournamentId?: string | null;
}

// ---------------------------------------------------------------------------
// Multiplayer Blackjack types
// ---------------------------------------------------------------------------

export interface BJMultiHandObj {
  cards: number[];
  total: number;
  hasAce: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  betAmount: string;
  result?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  payout: string;
  actions: any[];
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
}

export interface BJMultiSeatState {
  position: number;
  playerAddress: string | null;
  seatStatus: 'active' | 'sitting_out';
  /** Betting + in-round auto-stand timeouts; kick at 3 (server). */
  consecutiveTimeouts: number;
  pendingBet: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: AvatarPayload | null;
  /** Per-player render preference at this seat. Defaults to 'avatar'. */
  profileDisplayMode?: 'avatar' | 'photo';
  betAmount: string;
  hands: BJMultiHandObj[];
  activeHandIndex: number;
  result?: string | null;
  payout: string;
  isActing: boolean;
}

export interface BJMultiTableState {
  tableId: string;
  status: string;
  minBet: string;
  maxBet: string;
  seats: BJMultiSeatState[];
  dealerCards: number[];
  dealerCardCount: number;
  dealerTotal: number;
  dealerHasAce: boolean;
  currentRoundId: string | null;
  actingSeatPosition: number | null;
  phase: 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed';
  roundNumber: number;
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  themeKind: 'video' | 'image';
  themeId: string;
  stateVersion?: number;
  viewerCount?: number;
}

export interface BJMultiTableSummary {
  id: string;
  status: string;
  minBet: string;
  maxBet: string;
  seatedCount: number;
  emptySeats: number;
  themeKind: 'video' | 'image';
  themeId: string;
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
  /** Last `pokerChipBalance` from `auth_success` / `connection_established` (whole chips as decimal string). */
  private lastPokerChipBalance: string | null = null;

  private static detachWebSocketHandlers(ws: WebSocket): void {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
  }

  /** Fail fast in-flight sendRequest() calls instead of waiting for the timeout timer. */
  private rejectAllPendingRequests(reason: string): void {
    if (this.requestPromises.size === 0) return;
    const pending = [...this.requestPromises.entries()];
    this.requestPromises.clear();
    const err = new Error(reason);
    for (const [, { reject }] of pending) {
      try {
        reject(err);
      } catch {
        /* ignore */
      }
    }
  }

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

      // Replace or drop a prior socket (CONNECTING / half-open / CLOSING) so a second
      // connect() cannot orphan a socket whose onclose would schedule duplicate reconnects.
      if (this.ws) {
        const stale = this.ws;
        this.ws = null;
        BlackjackWebSocketClient.detachWebSocketHandlers(stale);
        try {
          if (
            stale.readyState === WebSocket.CONNECTING ||
            stale.readyState === WebSocket.OPEN
          ) {
            stale.close();
          }
        } catch {
          /* ignore */
        }
      }

      const url = this.playerAddress
        ? `${this.serverUrl}?address=${this.playerAddress}`
        : this.serverUrl;

      const canSign = !!(this.signTypedData && this.playerAddress);

      const socket = new WebSocket(url);
      this.ws = socket;

      // Track whether we've resolved/rejected to avoid double-calls
      let settled = false;

      socket.onopen = () => {
        logger.info('WebSocket connected' + (canSign ? ', waiting for auth challenge...' : ' (legacy mode)'));
        this.reconnectAttempts = 0;
        // If we can't sign, we're in legacy mode — don't wait for auth
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          // Server tells us we need a SIWE session before we can connect.
          // Trigger the friendly plain-text SIWE popup via the same handler
          // apiFetch uses for HTTP 401s, then reconnect once the cookie is set.
          if (msg.type === 'siwe_required' && !settled) {
            settled = true;
            logger.info('WebSocket: server requested SIWE sign-in', { reason: msg.payload?.reason });
            // Lazy-import to avoid pulling apiFetch into bundles that don't need it.
            import('./api-auth')
              .then(({ triggerSignIn }) => triggerSignIn())
              .then(() => {
                // Cookie is set. Reconnect; server will accept us via cookie auth.
                logger.info('WebSocket: SIWE sign-in complete, reconnecting');
                this.connect().catch((err) => logger.error('WS reconnect after SIWE failed', err));
                resolve();
              })
              .catch((err) => {
                logger.warn('WebSocket: SIWE sign-in declined or failed', err);
                reject(new Error('SIWE sign-in required to connect'));
              });
            return;
          }

          if (msg.type === WS_MESSAGE_TYPES.authChallenge && !settled) {
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

          if (msg.type === WS_MESSAGE_TYPES.authSuccess && !settled) {
            settled = true;
            logger.info('WebSocket authenticated successfully via EIP-712');
            resolve();
            this.handleMessage(event.data as string);
            return;
          }

          // Legacy servers that don't send auth_challenge send connection_established
          if (msg.type === WS_MESSAGE_TYPES.connectionEstablished && !settled) {
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

      socket.onclose = () => {
        // Ignore closes from sockets we already superseded with a newer connect().
        if (this.ws !== socket && this.ws != null) {
          return;
        }
        this.ws = null;
        if (this.intentionalClose) {
          return;
        }
        logger.info('WebSocket disconnected');
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before authentication completed'));
        }
        this.rejectAllPendingRequests('WebSocket disconnected');
        this.attemptReconnect();
      };

      socket.onerror = (error) => {
        if (this.intentionalClose) {
          return;
        }

        const ws = socket;
        const errorMessage =
          ws?.readyState === WebSocket.CONNECTING
            ? `Failed to connect to ${url}. Server may be unavailable.`
            : ws?.readyState === WebSocket.CLOSING || ws?.readyState === WebSocket.CLOSED
              ? `Connection closed unexpectedly (state: ${ws?.readyState})`
              : `WebSocket error occurred (state: ${ws?.readyState})`;

        const isTransientTransportState =
          ws?.readyState === WebSocket.CONNECTING ||
          ws?.readyState === WebSocket.CLOSING ||
          ws?.readyState === WebSocket.CLOSED;

        const logPayload = {
          message: errorMessage,
          readyState: ws?.readyState,
          url,
          eventType: (error as Event)?.type ?? 'error',
        };

        // Browser WebSocket error events are often empty objects and are common
        // during reconnect/teardown. Keep these as warnings so dev overlay does
        // not treat expected transport churn as a runtime exception.
        if (isTransientTransportState) {
          logger.warn('WebSocket transport warning', logPayload);
        } else {
          logger.error('WebSocket error', logPayload);
        }

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
        type: WS_MESSAGE_TYPES.authResponse,
        payload: {
          address: this.playerAddress,
          signature,
        },
      }));
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.intentionalClose = true;
    this.rejectAllPendingRequests('WebSocket disconnected');
    if (this.ws) {
      const w = this.ws;
      this.ws = null;
      BlackjackWebSocketClient.detachWebSocketHandlers(w);
      try {
        w.close();
      } catch {
        /* ignore */
      }
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
      const timeoutMs = type === WS_MESSAGE_TYPES.pokerGetState ? 60000
        : type === WS_MESSAGE_TYPES.pokerTournamentJoin ? 60000
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
          const isTransportChurn =
            errMessage === 'WebSocket disconnected' ||
            /websocket not connected|websocket closed before authentication/i.test(errMessage);
          if (isTransportChurn) {
            logger.debug(`Request cancelled (${type}, ${requestId}): ${errMessage}`);
          } else {
            logger.error(`Request rejected (${type}, ${requestId}): ${errMessage}`);
          }
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

      if (
        message.type === WS_MESSAGE_TYPES.authSuccess ||
        message.type === WS_MESSAGE_TYPES.connectionEstablished
      ) {
        const b = message.payload?.pokerChipBalance;
        if (typeof b === 'string' && b.length > 0) {
          this.lastPokerChipBalance = b;
          this.emit('poker_chip_balance', b);
        }
      }

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
          if (message.type !== WS_MESSAGE_TYPES.gameCompleted && message.type !== WS_MESSAGE_TYPES.gameUpdated) {
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
        if (!WS_KNOWN_EVENT_TYPES.has(message.type)) {
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
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts, delay });

    setTimeout(() => {
      this.connect()
        .then(() => {
          this.emit('reconnected', {});
        })
        .catch(() => {
          // Connection failed, will retry via onclose -> attemptReconnect
        });
    }, delay);
  }

  /** Emit an event to registered handlers. */
  private emit(event: string, payload: any): void {
    const handlers = this.messageHandlers.get(event);
    if (handlers) handlers.forEach(h => h(payload));
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
    return this.sendRequest(WS_MESSAGE_TYPES.getServerSeedHash, {});
  }

  /**
   * Create a new game
   */
  async createGame(
    betAmount: bigint,
    clientSeedCommitment?: string,
    gameHash?: string,
    perfectPairsBetAmount?: bigint,
    /** Required by server when any enabled single-player wager tier exists (UUID). */
    wagerTierId?: string
  ): Promise<GameState> {
    const payload: Record<string, string | undefined> = {
      betAmount: betAmount.toString(),
      clientSeedCommitment,
      gameHash
    };
    if (perfectPairsBetAmount != null && perfectPairsBetAmount > 0n) {
      payload.perfectPairsBetAmount = perfectPairsBetAmount.toString();
    }
    if (wagerTierId?.trim()) {
      payload.wagerTierId = wagerTierId.trim();
    }
    return this.sendRequest(WS_MESSAGE_TYPES.createGame, payload);
  }

  async getBalance(): Promise<{ balance: string }> {
    return this.sendRequest(WS_MESSAGE_TYPES.getBalance, {});
  }

  async syncBalance(): Promise<{ balance: string }> {
    return this.sendRequest(WS_MESSAGE_TYPES.syncBalance, {});
  }

  /**
   * Perform a player action
   */
  async playerAction(gameId: string, action: 'hit' | 'stand' | 'double_down' | 'split', clientSeed?: string): Promise<GameState> {
    return this.sendRequest(WS_MESSAGE_TYPES.playerAction, {
      gameId,
      action,
      clientSeed
    });
  }

  /**
   * Get game result for verification
   */
  async getGameResult(gameId: string): Promise<any> {
    return this.sendRequest(WS_MESSAGE_TYPES.getGameState, { gameId });
  }

  // === Poker API (MVP multiplayer Texas Hold'em) ===

  /** List available poker tables (no auth required). */
  async pokerListTables(): Promise<{ tables: PokerTableSummary[] }> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerListTables, {});
  }

  /** Join a table; `buyInChips` is a positive whole chip count string (not MORBIUS wei). Auth required. */
  async pokerJoinTable(tableId: string, buyInChips: string, pinCode?: string): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerJoinTable, { tableId, buyInChips, ...(pinCode ? { pinCode } : {}) });
  }

  /** Leave a table (seat stack is credited back to the poker chip wallet). Auth required. */
  async pokerLeaveTable(tableId: string): Promise<PokerTableState | null> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerLeaveTable, { tableId });
  }

  /** Add chips to an existing seat (deducted from poker chip wallet). `amount` is a whole chip count string. Auth required. */
  async pokerAddChips(tableId: string, amount: string): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerAddChips, { tableId, amount });
  }

  /** Send a poker action: fold, check, call, bet, raise. For bet/raise pass amount as string. Auth required. */
  async pokerAction(tableId: string, handId: string, action: string, amount?: string): Promise<PokerTableState> {
    const payload: { tableId: string; handId: string; action: string; amount?: string } = { tableId, handId, action };
    if (amount != null) payload.amount = amount;
    return this.sendRequest(WS_MESSAGE_TYPES.pokerAction, payload);
  }

  /** Voluntarily sit out of future hands. Seat is held; blinds still post. Auth required. */
  async pokerSitOut(tableId: string): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerSitOut, { tableId });
  }

  /** Return from sitting out — re-join the hand rotation. Auth required. */
  async pokerSitBack(tableId: string): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerSitBack, { tableId });
  }

  /** Get current table state (e.g. after reconnect). Auth required. */
  async pokerGetState(tableId: string): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerGetState, { tableId });
  }

  /** Create a new table. Auth required. Returns the new table id. */
  async pokerCreateTable(smallBlind: string, bigBlind: string, maxSeats: number = 10, pinCode?: string): Promise<{ tableId: string }> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerCreateTable, { smallBlind, bigBlind, maxSeats, ...(pinCode ? { pinCode } : {}) });
  }

  /** Admin-only: update the marketing logo displayed on the table felt. */
  async pokerUpdateTableLogo(tableId: string, logo: string | null, opacity: number): Promise<{ success: boolean }> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerUpdateTableLogo, { tableId, logo, opacity });
  }

  /** Seated players: pay off-chain MORBIUS to spotlight a token for 10 minutes (timer restarts). */
  async pokerPurchaseTableLogo(
    tableId: string,
    token: { address: string; name: string; symbol: string; logoUrl: string | null },
  ): Promise<PokerTableState> {
    return this.sendRequest(WS_MESSAGE_TYPES.pokerPurchaseTableLogo, { tableId, token });
  }

  /**
   * Send a QuickChat phrase to the table. Server broadcasts to all players at the table.
   * Must be seated. Use on('poker_quick_reaction', handler) to receive; payload is { tableId, seatIndex, type: 'phrase', value: string }.
   */
  sendPokerQuickPhrase(tableId: string, phrase: string): void {
    this.send({ type: WS_MESSAGE_TYPES.pokerQuickReaction, payload: { tableId, type: 'phrase', value: phrase } });
  }

  /**
   * Broadcast avatar emotion to the table so all players see it.
   * Emotion must be one of: happy, sad, angry, surprised, wink.
   */
  sendPokerAvatarEmotion(tableId: string, emotion: string): void {
    this.send({ type: WS_MESSAGE_TYPES.pokerAvatarEmotion, payload: { tableId, emotion } });
  }

  // === Chat API (main + per-game rooms) ===

  /**
   * Join a chat room (e.g. 'main' for home, 'blackjack', 'plinko', etc.).
   * Returns recent messages for that room. Subscribe to 'chat_message' for live messages.
   */
  async joinRoom(roomId: string): Promise<RoomJoinedPayload> {
    return this.sendRequest(WS_MESSAGE_TYPES.joinRoom, { roomId });
  }

  /**
   * Send a chat message to the current room. Must have called joinRoom(roomId) first.
   * Server broadcasts to room; use on('chat_message', handler) to receive messages.
   */
  sendChatMessage(roomId: string, text: string): void {
    this.send({ type: WS_MESSAGE_TYPES.chatMessage, payload: { roomId, text } });
  }

  /**
   * Set your display name and optional profile image for chat/nav (3–32 chars for name).
   * Requires connected wallet. Use on('display_name_set', handler) for the response.
   * Optionally pass profileImageUrl and/or avatarConfig; get_profile and display_name_set responses include avatarConfig.
   */
  async setDisplayName(displayName: string, profileImageUrl?: string | null, avatarConfig?: AvatarPayload | null, bio?: string | null, xHandle?: string | null, tgHandle?: string | null, profileDisplayMode?: 'avatar' | 'photo'): Promise<{ displayName: string; profileImageUrl: string | null; avatarConfig: AvatarPayload | null; bio: string | null; xHandle: string | null; tgHandle: string | null; profileDisplayMode: 'avatar' | 'photo' }> {
    const payload: Record<string, unknown> = { displayName };
    if (profileImageUrl !== undefined) payload.profileImageUrl = profileImageUrl;
    if (avatarConfig !== undefined) payload.avatarConfig = avatarConfig;
    if (bio !== undefined) payload.bio = bio;
    if (xHandle !== undefined) payload.xHandle = xHandle;
    if (tgHandle !== undefined) payload.tgHandle = tgHandle;
    if (profileDisplayMode !== undefined) payload.profileDisplayMode = profileDisplayMode;
    return this.sendRequest(WS_MESSAGE_TYPES.setDisplayName, payload);
  }

  /**
   * Get current profile (display name, profile image URL, avatar config, bio, social handles, display mode) for the connected wallet.
   */
  async getProfile(): Promise<{ displayName: string | null; profileImageUrl: string | null; avatarConfig: AvatarPayload | null; bio: string | null; xHandle: string | null; tgHandle: string | null; profileDisplayMode: 'avatar' | 'photo' }> {
    return this.sendRequest(WS_MESSAGE_TYPES.getProfile, {});
  }

  /**
   * Load older messages before the given message id (for "Load more").
   * Returns messages in chronological order (oldest first).
   */
  async getChatHistory(roomId: string, beforeId: string, limit: number = 50): Promise<{ messages: ChatMessagePayload[] }> {
    return this.sendRequest(WS_MESSAGE_TYPES.getChatHistory, { roomId, beforeId, limit });
  }

  /**
   * Send ping to keep connection alive
   */
  ping(): void {
    this.send({ type: WS_MESSAGE_TYPES.ping, payload: {} });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Last off-chain poker chip balance from `auth_success` / `connection_established` (decimal string, whole chips). */
  getPokerChipBalanceString(): string | null {
    return this.lastPokerChipBalance;
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
    return this.sendRequest(WS_MESSAGE_TYPES.checkExclusionStatus, {});
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
    return this.sendRequest(WS_MESSAGE_TYPES.setExclusion, { durationType, reason });
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
    return this.sendRequest(WS_MESSAGE_TYPES.getExclusionHistory, {});
  }
}