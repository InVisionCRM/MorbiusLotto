import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { DatabaseService } from './database.service';
import { BlackjackGameService, GameState, CreateGameRequest, PlayerActionRequest, TournamentGameState } from './blackjack-game.service';
import { TournamentService, TournamentState, LeaderboardEntry, TOURNAMENT_CONFIG } from './tournament.service';
import { PokerGameService, PokerTableState } from './poker-game.service';
import { PokerTournamentService } from './poker-tournament.service';
import { BlackjackMultiGameService } from './blackjack-multi-game.service';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { logger } from '../utils/logger';
import { toBigIntSafe } from '../utils/safe-bigint';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createPublicClient, http, verifyTypedData, getAddress, formatEther } from 'viem';
import { pulsechain } from 'viem/chains';
import { blackjackAbi } from '../abi/blackjack';
import { getPublicClient } from '../utils/chain-client';
import { BLACKJACK_ADDRESS } from '../config/contracts';

// Minimal ABI for getPlayerReserve - avoids full ABI parse issues in readContract
const GET_PLAYER_RESERVE_ABI = [
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'getPlayerReserve',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Minimal ABI for usedNonces - check if a withdrawal nonce was used on-chain
const USED_NONCES_ABI = [
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'usedNonces',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// EIP-712 domain and types for WebSocket authentication
const AUTH_EIP712_DOMAIN = {
  name: 'MORBlotto Blackjack',
  version: '1',
  chainId: 369,
} as const;

const AUTH_EIP712_TYPES = {
  AuthChallenge: [
    { name: 'nonce', type: 'string' },
  ],
} as const;

interface WebSocketMessage {
  type: string;
  payload: any;
  requestId?: string;
}

interface WebSocketClient extends WebSocket {
  playerAddress?: string;
  connectionId?: string;
  isAlive?: boolean;
  isAuthenticated?: boolean;
  authNonce?: string;
  currentRoom?: string;
  lastChatMessageAt?: number;
  lastCreateGameAt?: number;
}

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
function isTournamentRoom(room: string): boolean {
  return room.startsWith('tournament:') && room.length > 'tournament:'.length;
}

// Check if a room ID is a multiplayer blackjack table room (blackjack:table:{uuid})
function isBlackjackTableRoom(room: string): boolean {
  return room.startsWith('blackjack:table:') && room.length > 'blackjack:table:'.length;
}

function getTournamentIdFromRoom(room: string): string {
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
  MIN_BET: BigInt('1000000000000000000'),         // 1 MORBIUS
  MAX_BET: BigInt('100000000000000000000000'),    // 100,000 MORBIUS
};

const CONFIG_CACHE_TTL_MS = 60_000; // 1 minute

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private roomToClients: Map<string, Set<string>> = new Map(); // roomId -> Set<connectionId>
  private chatMessageTimestampsByAddress: Map<string, number[]> = new Map(); // per-address rate limit
  private heartbeatInterval: NodeJS.Timeout;
  private chatRateLimitCleanupInterval: NodeJS.Timeout;
  private pokerAutoFoldInterval: NodeJS.Timeout | null = null;
  private publicClient: any;
  private contractAddress: `0x${string}`;
  private tournamentService?: TournamentService;
  private pokerGameService: PokerGameService | null = null;
  private pokerTournamentService: PokerTournamentService | null = null;
  private bjMultiService: BlackjackMultiGameService | null = null;
  private bjMultiTimerInterval: NodeJS.Timeout | null = null;
  private betLimitsCache: { minBet: bigint; maxBet: bigint; cachedAt: number } | null = null;

  constructor(
    server: any,
    private gameService: BlackjackGameService,
    private dbService: DatabaseService,
    tournamentService?: TournamentService,
    pokerGameService?: PokerGameService | null,
    bjMultiService?: BlackjackMultiGameService | null,
  ) {
    this.tournamentService = tournamentService;
    this.pokerGameService = pokerGameService ?? null;
    this.bjMultiService = bjMultiService ?? null;
    this.wss = new WebSocketServer({ server });
    
    // Initialize public client for reading contract state
    this.publicClient = getPublicClient();
    
    this.contractAddress = BLACKJACK_ADDRESS;
    console.log('[WebSocketService] Using BLACKJACK_ADDRESS:', this.contractAddress);
    console.log('[WebSocketService] REQUIRE_WS_AUTH:', REQUIRE_WS_AUTH, 'DISABLE_WS_AUTH:', DISABLE_WS_AUTH);

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

    // Periodic cleanup of per-address chat rate limit (prune stale entries)
    this.chatRateLimitCleanupInterval = setInterval(() => {
      this.cleanupChatRateLimitMap();
    }, CHAT_PER_ADDRESS_CLEANUP_MS);

    // Auto-fold timed-out poker turns (30s timer enforcement)
    // broadcastState is handled internally by PokerGameService via setBroadcastCallback
    if (this.pokerGameService) {
      this.pokerAutoFoldInterval = setInterval(async () => {
        try {
          await this.pokerGameService!.autoFoldTimedOutTurns();
        } catch (err) {
          logger.error('Poker auto-fold watchdog error', err);
        }
      }, 5000);
    }

    // Multiplayer blackjack turn timer + betting timeout enforcement (5s poll)
    if (this.bjMultiService) {
      this.bjMultiTimerInterval = setInterval(async () => {
        try {
          await this.tickBJMultiTimers();
        } catch (err) {
          logger.error('BJMulti timer watchdog error', err);
        }
      }, 5000);
    }

    logger.info('WebSocket service initialized');
  }

  /** Wire in the PokerTournamentService after construction. */
  setPokerTournamentService(service: PokerTournamentService): void {
    this.pokerTournamentService = service;
    // Wire broadcast so the tournament service can push WS events
    service.setBroadcastCallback((room, message) => {
      this.broadcastToRoom(room, message as any);
    });
  }

  /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
  private cleanupChatRateLimitMap(): void {
    const now = Date.now();
    const cutoff = now - CHAT_PER_ADDRESS_WINDOW_MS;
    for (const [address, timestamps] of this.chatMessageTimestampsByAddress.entries()) {
      const kept = timestamps.filter(t => t > cutoff);
      if (kept.length === 0) {
        this.chatMessageTimestampsByAddress.delete(address);
      } else {
        this.chatMessageTimestampsByAddress.set(address, kept);
      }
    }
  }

  /** Resolve Blackjack min/max bet from admin config (cached). Uses defaults if missing/invalid. */
  private async getBetLimits(): Promise<{ minBet: bigint; maxBet: bigint }> {
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
          if (parsed >= 0n) minBet = parsed;
        } catch {
          /* keep default */
        }
      }
      if (maxStr) {
        try {
          const parsed = BigInt(maxStr);
          if (parsed > 0n) maxBet = parsed;
        } catch {
          /* keep default */
        }
      }
      if (minBet > maxBet) {
        minBet = DEFAULT_BET_LIMITS.MIN_BET;
        maxBet = DEFAULT_BET_LIMITS.MAX_BET;
      }
      this.betLimitsCache = { minBet, maxBet, cachedAt: now };
      return { minBet, maxBet };
    } catch (err) {
      logger.warn('Failed to load admin game config for bet limits, using defaults', { error: err });
      return { minBet: DEFAULT_BET_LIMITS.MIN_BET, maxBet: DEFAULT_BET_LIMITS.MAX_BET };
    }
  }

  /** Returns false if over per-address limit; otherwise records the message and returns true. */
  private checkPerAddressChatLimit(address: string, now: number): boolean {
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

  private async handleConnection(ws: WebSocketClient, request: IncomingMessage) {
    const connectionId = uuidv4();
    ws.connectionId = connectionId;
    ws.isAlive = true;
    ws.isAuthenticated = false;

    // Extract player address from query parameters (used as claimed address, verified via EIP-712)
    const url = new URL(request.url || '', 'http://localhost');
    const claimedAddress = url.searchParams.get('address')?.toLowerCase();

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
        if (ws.currentRoom) {
          const set = this.roomToClients.get(ws.currentRoom);
          if (set) {
            set.delete(ws.connectionId);
            if (set.size === 0) this.roomToClients.delete(ws.currentRoom);
          }
        }
        this.clients.delete(ws.connectionId);
        this.dbService.removeActiveConnection(ws.connectionId);
        logger.info('WebSocket connection closed', { connectionId: ws.connectionId });
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { connectionId: ws.connectionId, error });
    });

    this.clients.set(connectionId, ws);

    const sendAuthChallenge = REQUIRE_WS_AUTH && !DISABLE_WS_AUTH;
    if (sendAuthChallenge) {
      // Strict mode: generate auth challenge, client must sign to proceed
      const authNonce = crypto.randomBytes(32).toString('hex');
      ws.authNonce = authNonce;
      console.log('[WS Auth] Strict mode: sending auth_challenge', { connectionId, claimedAddress, noncePrefix: authNonce.slice(0, 8) });

      this.sendMessage(ws, {
        type: 'auth_challenge',
        payload: { connectionId, nonce: authNonce, claimedAddress }
      });
    } else {
      // No challenge: trust query-param address (DISABLE_WS_AUTH or REQUIRE_WS_AUTH=false)
      console.log('[WS Auth] No challenge:', DISABLE_WS_AUTH ? 'DISABLE_WS_AUTH' : 'REQUIRE_WS_AUTH=false', 'claimedAddress=', claimedAddress, 'connectionId=', connectionId);

      if (claimedAddress) {
        ws.playerAddress = claimedAddress;
        ws.isAuthenticated = true;
        console.log('[WS Auth] Auto-auth for', claimedAddress);

        try {
          const player = await this.dbService.getOrCreatePlayer(claimedAddress);
          await this.dbService.addActiveConnection(player.id, connectionId);
          logger.info('WebSocket connection established (legacy auth)', { connectionId, playerAddress: claimedAddress, playerId: player.id });
        } catch (error) {
          logger.error('Failed to track active connection', { connectionId, playerAddress: claimedAddress, error });
        }
      } else {
        logger.warn('WebSocket connection without player address', { connectionId });
      }

      // Send connection_established so client connects without any auth prompt
      this.sendMessage(ws, {
        type: 'connection_established',
        payload: { connectionId, playerAddress: claimedAddress ?? undefined }
      });
    }
  }

  private async handleMessage(ws: WebSocketClient, data: Buffer) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      logger.debug('Received WebSocket message', {
        type: message.type,
        connectionId: ws.connectionId,
        requestId: message.requestId
      });
      if (
        message.type === 'get_balance' ||
        message.type === 'sync_balance' ||
        message.type === 'tournament_info' ||
        message.type === 'tournament_list'
      ) {
      }

      switch (message.type) {
        // Auth response is always allowed (unauthenticated clients need it)
        case 'auth_response':
          await this.handleAuthResponse(ws, message);
          break;

        case 'ping':
          this.sendMessage(ws, { type: 'pong', payload: {}, requestId: message.requestId });
          break;

        // All handlers below require authentication
        case 'get_server_seed_hash':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetServerSeedHash(ws, message);
          break;

        case 'create_game':
          if (!this.requireAuth(ws, message)) return;
          await this.handleCreateGame(ws, message);
          break;

        case 'player_action':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePlayerAction(ws, message);
          break;

        case 'get_game_state':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetGameState(ws, message);
          break;

        case 'sync_balance':
          if (!this.requireAuth(ws, message)) return;
          await this.handleSyncBalance(ws, message);
          break;

        case 'get_balance':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetBalance(ws, message);
          break;

        case 'join_room':
          // No auth required for viewing chat; handleJoinRoom enforces wallet for tournament rooms
          await this.handleJoinRoom(ws, message);
          break;

        case 'chat_message':
          if (!this.requireAuth(ws, message)) return;
          await this.handleChatMessage(ws, message);
          break;

        case 'set_display_name':
          if (!this.requireAuth(ws, message)) return;
          await this.handleSetDisplayName(ws, message);
          break;

        case 'get_profile':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetProfile(ws, message);
          break;

        case 'get_chat_history':
          // No auth required for viewing chat history (load more)
          await this.handleGetChatHistory(ws, message);
          break;

        // Responsible Gaming / Self-Exclusion
        case 'check_exclusion_status':
          if (!this.requireAuth(ws, message)) return;
          await this.handleCheckExclusionStatus(ws, message);
          break;

        case 'set_exclusion':
          if (!this.requireAuth(ws, message)) return;
          await this.handleSetExclusion(ws, message);
          break;

        case 'get_exclusion_history':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetExclusionHistory(ws, message);
          break;

        // Tournament Mode
        case 'tournament_enter':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentEnter(ws, message);
          break;

        case 'tournament_leave':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentLeave(ws, message);
          break;

        case 'tournament_state':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetTournamentState(ws, message);
          break;

        case 'tournament_game_start':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentGameStart(ws, message);
          break;

        case 'tournament_player_action':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentPlayerAction(ws, message);
          break;

        case 'tournament_leaderboard':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentLeaderboard(ws, message);
          break;

        case 'tournament_leaderboard_by_id':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentLeaderboardById(ws, message);
          break;

        case 'tournament_info':
          if (!this.requireAuth(ws, message)) return;
          await this.handleGetTournamentInfo(ws, message);
          break;

        // Tournament Creator - New handlers
        case 'tournament_create':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentCreate(ws, message);
          break;

        case 'create_freeroll':
          if (!this.requireAuth(ws, message)) return;
          await this.handleCreateFreeroll(ws, message);
          break;

        case 'tournament_list':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentList(ws, message);
          break;

        case 'tournament_join':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentJoin(ws, message);
          break;

        case 'tournament_unregister':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentUnregister(ws, message);
          break;

        case 'tournament_get_info':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentGetInfo(ws, message);
          break;

        case 'freeroll_list':
          if (!this.requireAuth(ws, message)) return;
          await this.handleFreerollList(ws, message);
          break;

        case 'freeroll_register':
          if (!this.requireAuth(ws, message)) return;
          await this.handleFreerollRegister(ws, message);
          break;

        case 'freeroll_join':
          if (!this.requireAuth(ws, message)) return;
          await this.handleFreerollJoin(ws, message);
          break;

        case 'tournament_entries_list':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentEntriesList(ws, message);
          break;

        case 'creator_tournaments':
          if (!this.requireAuth(ws, message)) return;
          await this.handleCreatorTournaments(ws, message);
          break;

        case 'creator_earnings':
          if (!this.requireAuth(ws, message)) return;
          await this.handleCreatorEarnings(ws, message);
          break;

        case 'tournament_cancel':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentCancel(ws, message);
          break;

        case 'tournament_reclaim':
          if (!this.requireAuth(ws, message)) return;
          await this.handleTournamentReclaim(ws, message);
          break;

        case 'recent_global_wins':
          // No auth required for public global wins feed
          await this.handleRecentGlobalWins(ws, message);
          break;

        // Poker
        case 'poker_list_tables':
          await this.handlePokerListTables(ws, message);
          break;

        case 'poker_join_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerJoinTable(ws, message);
          break;

        case 'poker_leave_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerLeaveTable(ws, message);
          break;

        case 'poker_add_chips':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerAddChips(ws, message);
          break;

        case 'poker_action':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerAction(ws, message);
          break;

        case 'poker_get_state':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerGetState(ws, message);
          break;

        case 'poker_create_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerCreateTable(ws, message);
          break;

        case 'poker_quick_reaction':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerQuickReaction(ws, message);
          break;

        case 'poker_avatar_emotion':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerAvatarEmotion(ws, message);
          break;

        // Poker Tournaments
        case 'poker_tournament_list':
          await this.handlePokerTournamentList(ws, message);
          break;

        case 'poker_tournament_create':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerTournamentCreate(ws, message);
          break;

        case 'poker_tournament_join':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerTournamentJoin(ws, message);
          break;

        case 'poker_tournament_get_state':
          await this.handlePokerTournamentGetState(ws, message);
          break;

        case 'poker_tournament_cancel':
          if (!this.requireAuth(ws, message)) return;
          await this.handlePokerTournamentCancel(ws, message);
          break;

        // Multiplayer Blackjack
        case 'bj_multi_list_tables':
          await this.handleBJMultiListTables(ws, message);
          break;

        case 'bj_multi_join_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiJoinTable(ws, message);
          break;

        case 'bj_multi_leave_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiLeaveTable(ws, message);
          break;

        case 'bj_multi_place_bet':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiPlaceBet(ws, message);
          break;

        case 'bj_multi_action':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiAction(ws, message);
          break;

        case 'bj_multi_get_state':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiGetState(ws, message);
          break;

        case 'bj_multi_create_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiCreateTable(ws, message);
          break;

        case 'bj_multi_delete_table':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiDeleteTable(ws, message);
          break;

        case 'bj_multi_quick_reaction':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiQuickReaction(ws, message);
          break;

        case 'bj_multi_avatar_emotion':
          if (!this.requireAuth(ws, message)) return;
          await this.handleBJMultiAvatarEmotion(ws, message);
          break;

        default:
          this.sendError(ws, 'Unknown message type', message.requestId);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      let requestId: string | undefined;
      try {
        const parsed = JSON.parse(data.toString());
        requestId = parsed?.requestId;
      } catch {
        // ignore
      }
      this.sendError(ws, (error as Error)?.message || 'Invalid message format', requestId);
    }
  }

  /**
   * Check if client is authenticated. If not, send error and return false.
   * In grace period (REQUIRE_WS_AUTH=false), accepts legacy query-param auth.
   */
  private requireAuth(ws: WebSocketClient, message: WebSocketMessage): boolean {
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
  private async handleAuthResponse(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      const { address, signature } = message.payload as { address?: string; signature?: `0x${string}` };
      console.log('[WS Auth] Received auth_response', { connectionId: ws.connectionId, address, signaturePrefix: signature?.slice(0, 10) });

      if (!address || !signature) {
        console.log('[WS Auth] Missing address or signature');
        return this.sendError(ws, 'address and signature required', message.requestId);
      }

      if (!ws.authNonce) {
        console.log('[WS Auth] No auth nonce pending for connection', ws.connectionId);
        return this.sendError(ws, 'No auth challenge pending', message.requestId);
      }

      const normalizedAddress = address.toLowerCase() as `0x${string}`;
      console.log('[WS Auth] Verifying EIP-712 signature for', normalizedAddress, 'nonce:', ws.authNonce.slice(0, 8));

      // Verify EIP-712 typed data signature
      const valid = await verifyTypedData({
        address: normalizedAddress as `0x${string}`,
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'AuthChallenge',
        message: { nonce: ws.authNonce },
        signature,
      });

      if (!valid) {
        console.log('[WS Auth] Signature verification FAILED for', normalizedAddress);
        return this.sendError(ws, 'Invalid signature', message.requestId);
      }

      // Auth successful
      console.log('[WS Auth] Signature verified, auth successful for', normalizedAddress);
      ws.playerAddress = normalizedAddress;
      ws.isAuthenticated = true;
      ws.authNonce = undefined; // consume nonce

      // Track active connection
      try {
        const player = await this.dbService.getOrCreatePlayer(normalizedAddress);
        await this.dbService.addActiveConnection(player.id, ws.connectionId!);
        logger.info('WebSocket authenticated', { connectionId: ws.connectionId, playerAddress: normalizedAddress, playerId: player.id });
      } catch (error) {
        logger.error('Failed to track active connection after auth', { connectionId: ws.connectionId, playerAddress: normalizedAddress, error });
      }

      this.sendMessage(ws, {
        type: 'auth_success',
        payload: { playerAddress: normalizedAddress },
        requestId: message.requestId
      });
    } catch (error) {
      logger.error('Error handling auth response:', error);
      this.sendError(ws, 'Authentication failed', message.requestId);
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

      const payload = message.payload as any;
      
      const betAmount = toBigIntSafe(payload.betAmount ?? 0);
      let perfectPairsBetAmount = payload.perfectPairsBetAmount != null && payload.perfectPairsBetAmount !== ''
        ? toBigIntSafe(payload.perfectPairsBetAmount)
        : 0n;
      if (perfectPairsBetAmount < 0n) perfectPairsBetAmount = 0n;
      const PP_MAX_BET = 10_000n * 10n ** 18n; // 10,000 MORBIUS
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
        const balance = await this.dbService.getPlayerBalance(ws.playerAddress);
        if (balance < totalStake) {
          const fmt = (n: bigint) => Number(formatEther(n)).toLocaleString(undefined, { maximumFractionDigits: 2 });
          return this.sendError(ws, `Insufficient balance. You have ${fmt(balance)}, but need ${fmt(totalStake)} (main + Perfect Pairs)`, message.requestId);
        }
      } catch (error) {
        logger.error('Error checking player balance:', error);
        return this.sendError(ws, 'Failed to verify balance. Please try again.', message.requestId);
      }

      logger.debug('Creating game', {
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

      logger.debug('Game created successfully', {
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
        const globalMessage: WebSocketMessage = {
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

    } catch (error) {
      logger.error('Error handling player action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  /**
   * Resolve any pending withdrawals for a player by checking on-chain nonce usage.
   * If the nonce was used (withdrawal succeeded on-chain), marks it completed (no refund).
   * If the nonce was NOT used, leaves it pending for the expiry cron to refund.
   */
  private async resolvePendingWithdrawals(playerAddress: string): Promise<void> {
    const pending = await this.dbService.getActivePendingWithdrawal(playerAddress);
    if (!pending) return;

    try {
      const nonceUsed = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: USED_NONCES_ABI,
        functionName: 'usedNonces',
        args: [BigInt(pending.nonce)],
      }) as boolean;

      if (nonceUsed) {
        // Withdrawal succeeded on-chain but confirm POST failed — mark completed now
        await this.dbService.markPendingWithdrawalCompleted(playerAddress, BigInt(pending.nonce));
        logger.warn('Resolved pending withdrawal as completed (on-chain nonce used)', {
          playerAddress,
          nonce: pending.nonce,
          amount: pending.amount,
        });
      }
    } catch (rpcErr) {
      logger.warn('Failed to check nonce for pending withdrawal during sync', {
        playerAddress,
        nonce: pending.nonce,
        error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
      });
    }
  }

  private async handleSyncBalance(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }

      // CRITICAL: Before syncing balance, check if there's a pending withdrawal that
      // actually completed on-chain (nonce used). If so, mark it completed to prevent
      // the expiry cron from refunding it (which would duplicate funds).
      await this.resolvePendingWithdrawals(ws.playerAddress);

      // Normalize address (checksum) to avoid viem encodeFunctionData issues
      const playerAddress = getAddress(ws.playerAddress) as `0x${string}`;

      // Delta-based deposit sync: we track the last on-chain reserve value we
      // saw at sync time (last_synced_reserve). A new deposit means the reserve
      // has grown since then — we add only that delta to the DB balance.
      // This prevents the "bounce-back" bug where gaming losses (which lower
      // DB balance but never touch the on-chain reserve) were mistakenly
      // treated as uncredited deposits.
      const currentDbBalance = await this.dbService.getPlayerBalance(ws.playerAddress);
      const lastSyncedReserve = await this.dbService.getLastSyncedReserve(ws.playerAddress);

      // Read contract reserve, retrying once if the RPC returns a stale value.
      let contractBalance = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: GET_PLAYER_RESERVE_ABI,
        functionName: 'getPlayerReserve',
        args: [playerAddress],
      }) as bigint;

      if (lastSyncedReserve !== null && contractBalance <= lastSyncedReserve) {
        // Possibly stale node — wait 1s and retry once
        await new Promise(resolve => setTimeout(resolve, 1000));
        contractBalance = await this.publicClient.readContract({
          address: this.contractAddress,
          abi: GET_PLAYER_RESERVE_ABI,
          functionName: 'getPlayerReserve',
          args: [playerAddress],
        }) as bigint;
      }

      let newBalance = currentDbBalance;

      if (lastSyncedReserve === null) {
        // First sync ever (migration just ran, or brand-new player):
        // baseline without crediting so we don't double-credit existing balance.
        await this.dbService.updateLastSyncedReserve(ws.playerAddress, contractBalance);
        logger.debug('Balance sync: baselined last_synced_reserve', {
          playerAddress: ws.playerAddress,
          contractBalance: contractBalance.toString(),
        });
      } else if (contractBalance > lastSyncedReserve) {
        // Reserve grew — a real deposit occurred. Credit the delta only.
        const depositDelta = contractBalance - lastSyncedReserve;
        newBalance = currentDbBalance + depositDelta;
        await this.dbService.addPlayerBalance(ws.playerAddress, depositDelta);
        await this.dbService.updateLastSyncedReserve(ws.playerAddress, contractBalance);
        logger.info('Balance sync: deposit detected', {
          playerAddress: ws.playerAddress,
          depositDelta: depositDelta.toString(),
          newBalance: newBalance.toString(),
        });
      } else if (contractBalance < lastSyncedReserve) {
        // Reserve shrank (on-chain withdrawal confirmed) — update snapshot so
        // the next deposit delta is computed correctly.
        await this.dbService.updateLastSyncedReserve(ws.playerAddress, contractBalance);
      }
      // contractBalance === lastSyncedReserve → no change needed.

      logger.debug('Balance synced', {
        playerAddress: ws.playerAddress,
        contractBalance: contractBalance.toString(),
        lastSyncedReserve: lastSyncedReserve?.toString() ?? 'null',
        previousDbBalance: currentDbBalance.toString(),
        newBalance: newBalance.toString(),
      });

      this.sendMessage(ws, {
        type: 'balance_synced',
        payload: {
          balance: newBalance.toString()
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

      // CRITICAL: Before reading balance, resolve any pending withdrawals that
      // completed on-chain but weren't confirmed to the server.
      await this.resolvePendingWithdrawals(ws.playerAddress);

      // Deposits trigger an explicit sync_balance call which handles reserve
      // sync. Never overwrite the DB balance here — doing so restores gaming
      // losses whenever the on-chain reserve (unchanged by gameplay) exceeds
      // the post-loss DB balance (the "bounce-back" exploit).
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

  private async handleJoinRoom(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      const { roomId } = message.payload as { roomId?: string };
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
          if (prevSet.size === 0) this.roomToClients.delete(ws.currentRoom);
        }
      }

      ws.currentRoom = normalized;
      if (!this.roomToClients.has(normalized)) {
        this.roomToClients.set(normalized, new Set());
      }
      this.roomToClients.get(normalized)!.add(ws.connectionId!);

      const recent = (isPokerTableRoom || isBJMultiRoom) ? [] : await this.dbService.getRecentChatMessages(normalized, CHAT_RECENT_MESSAGES_LIMIT);
      const addresses = [...new Set(recent.map(m => m.sender_address).filter(Boolean) as string[])];
      const displayNames = await this.dbService.getDisplayNames(addresses);
      const config = await this.dbService.getAdminGameConfig();
      const chatPaused = config['chat_paused'] === 'true';

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
          })),
          chatPaused
        },
        requestId: message.requestId
      });
    } catch (error) {
      logger.error('Error joining room:', error);
      this.sendError(ws, 'Failed to join room', message.requestId);
    }
  }

  private async handlePokerListTables(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService) {
        return this.sendError(ws, 'Poker not available', message.requestId);
      }
      const tables = await this.pokerGameService.listTables();
      this.sendMessage(ws, { type: 'poker_table_list', payload: { tables }, requestId: message.requestId });
    } catch (error) {
      logger.error('Error listing poker tables:', error);
      this.sendError(ws, (error as Error).message || 'Failed to list tables', message.requestId);
    }
  }

  private async handlePokerJoinTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string; buyInChips?: string };
      const { tableId, buyInChips } = payload ?? {};
      if (!tableId || typeof tableId !== 'string') {
        return this.sendError(ws, 'tableId required', message.requestId);
      }
      if (!buyInChips || typeof buyInChips !== 'string') {
        return this.sendError(ws, 'buyInChips required', message.requestId);
      }
      const state = await this.pokerGameService.joinTable(tableId, ws.playerAddress, buyInChips);

      const roomId = `poker:table:${tableId}`;
      if (ws.currentRoom && ws.connectionId) {
        const prevSet = this.roomToClients.get(ws.currentRoom);
        if (prevSet) {
          prevSet.delete(ws.connectionId);
          if (prevSet.size === 0) this.roomToClients.delete(ws.currentRoom);
        }
      }
      ws.currentRoom = roomId;
      if (!this.roomToClients.has(roomId)) this.roomToClients.set(roomId, new Set());
      this.roomToClients.get(roomId)!.add(ws.connectionId!);

      this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
      const broadcastState = await this.pokerGameService.getTableState(tableId, null);
      this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('Error joining poker table:', error);
      this.sendError(ws, (error as Error).message || 'Failed to join table', message.requestId);
    }
  }

  private async handlePokerLeaveTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string };
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
          if (set.size === 0) this.roomToClients.delete(roomId);
        }
      }
      ws.currentRoom = undefined;

      this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
      if (state) {
        const broadcastState = await this.pokerGameService.getTableState(tableId, null);
        this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
      }
    } catch (error) {
      logger.error('Error leaving poker table:', error);
      this.sendError(ws, (error as Error).message || 'Failed to leave table', message.requestId);
    }
  }

  private async handlePokerAddChips(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string; amount?: string };
      const { tableId, amount } = payload ?? {};
      if (!tableId || typeof tableId !== 'string') {
        return this.sendError(ws, 'tableId required', message.requestId);
      }
      if (!amount || typeof amount !== 'string') {
        return this.sendError(ws, 'amount required', message.requestId);
      }
      const state = await this.pokerGameService.addChips(tableId, ws.playerAddress, amount);
      this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
      const roomId = `poker:table:${tableId}`;
      const broadcastState = await this.pokerGameService.getTableState(tableId, null);
      this.broadcastToRoom(roomId, { type: 'poker_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('Error adding chips to poker table:', error);
      this.sendError(ws, (error as Error).message || 'Failed to add chips', message.requestId);
    }
  }

  private async handlePokerAction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string; handId?: string; action?: string; amount?: string };
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
    } catch (error) {
      logger.error('Error poker action:', error);
      this.sendError(ws, (error as Error).message || 'Action failed', message.requestId);
    }
  }

  private async handlePokerGetState(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string };
      const tableId = payload?.tableId;
      if (!tableId || typeof tableId !== 'string') {
        return this.sendError(ws, 'tableId required', message.requestId);
      }
      const state = await this.pokerGameService.getTableState(tableId, ws.playerAddress);
      this.sendMessage(ws, { type: 'poker_table_state', payload: state, requestId: message.requestId });
    } catch (error) {
      logger.error('Error getting poker state:', error);
      this.sendError(ws, (error as Error).message || 'Failed to get state', message.requestId);
    }
  }

  private async handlePokerQuickReaction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string; type?: string; value?: string };
      const { tableId, type, value } = payload ?? {};
      if (!tableId || typeof tableId !== 'string') {
        return this.sendError(ws, 'tableId required', message.requestId);
      }
      if (type !== 'emoji' && type !== 'phrase') {
        return this.sendError(ws, 'type must be emoji or phrase', message.requestId);
      }
      const val = typeof value === 'string' ? value.trim() : '';
      if (!val || val.length > 200) {
        return this.sendError(ws, 'value required (max 200 chars)', message.requestId);
      }
      const state = await this.pokerGameService.getTableState(tableId, null);
      const seatIndex = state.seats.findIndex(
        (s) => s.playerAddress && s.playerAddress.toLowerCase() === ws.playerAddress!.toLowerCase()
      );
      if (seatIndex < 0) {
        return this.sendError(ws, 'Not seated at this table', message.requestId);
      }
      const roomId = `poker:table:${tableId}`;
      this.broadcastToRoom(roomId, {
        type: 'poker_quick_reaction',
        payload: { tableId, seatIndex, type, value: val },
      });
    } catch (error) {
      logger.error('Error handling poker quick reaction:', error);
      this.sendError(ws, (error as Error).message || 'Failed to send reaction', message.requestId);
    }
  }

  private static readonly POKER_AVATAR_EMOTIONS = new Set<string>([
    'neutral', 'happy', 'sad', 'angry', 'surprised', 'wink',
    'dance', 'flex', 'jump', 'spin', 'think', 'love', 'money',
    'sick', 'cool', 'sleepy', 'shock', 'ghost', 'ninja', 'king',
    'poker', 'jackpot', 'chips', 'cards', 'dice',
    'slouch', 'yawn', 'bored', 'nod', 'shrug',
    'drift', 'sink', 'breathe', 'lean', 'tilt',
  ]);

  private async handlePokerAvatarEmotion(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { tableId?: string; emotion?: string };
      const { tableId, emotion } = payload ?? {};
      if (!tableId || typeof tableId !== 'string') {
        return this.sendError(ws, 'tableId required', message.requestId);
      }
      const emo = typeof emotion === 'string' ? emotion.toLowerCase().trim() : '';
      if (!WebSocketService.POKER_AVATAR_EMOTIONS.has(emo)) {
        return this.sendError(ws, 'Invalid emotion', message.requestId);
      }
      const state = await this.pokerGameService.getTableState(tableId, null);
      const seatIndex = state.seats.findIndex(
        (s) => s.playerAddress && s.playerAddress.toLowerCase() === ws.playerAddress!.toLowerCase()
      );
      if (seatIndex < 0) {
        return this.sendError(ws, 'Not seated at this table', message.requestId);
      }
      const roomId = `poker:table:${tableId}`;
      this.broadcastToRoom(roomId, {
        type: 'poker_avatar_emotion',
        payload: { tableId, seatIndex, emotion: emo },
      });
    } catch (error) {
      logger.error('Error handling poker avatar emotion:', error);
      this.sendError(ws, (error as Error).message || 'Failed to send avatar emotion', message.requestId);
    }
  }

  private async handlePokerCreateTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerGameService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker not available or wallet required', message.requestId);
      }
      const payload = message.payload as { smallBlind?: string; bigBlind?: string; maxSeats?: number };
      const smallBlindStr = payload?.smallBlind != null ? String(payload.smallBlind) : undefined;
      const bigBlindStr = payload?.bigBlind != null ? String(payload.bigBlind) : undefined;
      if (!smallBlindStr || !bigBlindStr) {
        return this.sendError(ws, 'smallBlind and bigBlind required', message.requestId);
      }
      const smallBlind = toBigIntSafe(smallBlindStr);
      const bigBlind = toBigIntSafe(bigBlindStr);
      if (smallBlind <= 0n || bigBlind <= 0n || bigBlind < smallBlind) {
        return this.sendError(ws, 'Invalid blinds: must be positive and bigBlind >= smallBlind', message.requestId);
      }
      const maxSeats = Math.min(10, Math.max(2, Number(payload?.maxSeats) || 6));
      const tableId = await this.pokerGameService.createTable(smallBlind, bigBlind, maxSeats);
      this.sendMessage(ws, { type: 'poker_create_table', payload: { tableId }, requestId: message.requestId });
    } catch (error) {
      logger.error('Error creating poker table:', error);
      this.sendError(ws, (error as Error).message || 'Failed to create table', message.requestId);
    }
  }

  private async handleGetChatHistory(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      const payload = message.payload as { roomId?: string; beforeId?: string; limit?: number };
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
      const addresses = [...new Set(older.map(m => m.sender_address).filter(Boolean) as string[])];
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
    } catch (error) {
      logger.error('Error getting chat history:', error);
      this.sendError(ws, 'Failed to load older messages', message.requestId);
    }
  }

  private async handleSetDisplayName(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required to set display name', message.requestId);
      }

      const payload = message.payload as { displayName?: string; profileImageUrl?: string | null; avatarConfig?: Record<string, unknown> | null; bio?: string | null; xHandle?: string | null; tgHandle?: string | null };
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
      const bio      = payload.bio      !== undefined ? (typeof payload.bio      === 'string' ? payload.bio.trim().slice(0, 200) || null      : null) : undefined;
      const xHandle  = payload.xHandle  !== undefined ? (typeof payload.xHandle  === 'string' ? payload.xHandle.trim().replace(/^@/, '').slice(0, 50) || null  : null) : undefined;
      const tgHandle = payload.tgHandle !== undefined ? (typeof payload.tgHandle === 'string' ? payload.tgHandle.trim().replace(/^@/, '').slice(0, 50) || null : null) : undefined;
      await this.dbService.setDisplayName(ws.playerAddress, displayName, profileImageUrl, avatarConfig, bio, xHandle, tgHandle);
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
        },
        requestId: message.requestId
      });
    } catch (error) {
      logger.error('Error setting display name:', error);
      this.sendError(ws, 'Failed to set display name', message.requestId);
    }
  }

  private async handleGetProfile(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required to get profile', message.requestId);
      }
      const profile = await this.dbService.getProfile(ws.playerAddress);
      this.sendMessage(ws, {
        type: 'profile',
        payload: profile
          ? { displayName: profile.displayName, profileImageUrl: profile.profileImageUrl, avatarConfig: profile.avatarConfig, bio: profile.bio, xHandle: profile.xHandle, tgHandle: profile.tgHandle }
          : { displayName: null, profileImageUrl: null, avatarConfig: null, bio: null, xHandle: null, tgHandle: null },
        requestId: message.requestId
      });
    } catch (error) {
      logger.error('Error getting profile:', error);
      this.sendError(ws, 'Failed to get profile', message.requestId);
    }
  }

  private async handleChatMessage(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      const payload = message.payload as { roomId?: string; text?: string };
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
    } catch (error) {
      logger.error('Error sending chat message:', error);
      this.sendError(ws, 'Failed to send message', message.requestId);
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

  // Broadcast to all connected clients
  private broadcastToAll(message: WebSocketMessage) {
    this.wss.clients.forEach((client: WebSocketClient) => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  // Broadcast to all clients in a chat room
  public broadcastToRoom(roomId: string, message: WebSocketMessage) {
    const connectionIds = this.roomToClients.get(roomId);
    if (!connectionIds) return;
    connectionIds.forEach((connectionId) => {
      const client = this.clients.get(connectionId);
      if (client?.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  /** Called by admin API when a message is soft-deleted; notifies all clients in the room. */
  public broadcastChatMessageDeleted(roomId: string, messageId: string) {
    this.broadcastToRoom(roomId, {
      type: 'chat_message_deleted',
      payload: { roomId, messageId }
    });
  }

  /** Broadcast current poker table state to room (e.g. after API adds bots so UI updates). */
  public async broadcastPokerTableState(tableId: string): Promise<void> {
    if (!this.pokerGameService) return;
    try {
      const state = await this.pokerGameService.getTableState(tableId, null);
      this.broadcastToRoom(`poker:table:${tableId}`, { type: 'poker_table_state', payload: state });
    } catch (err) {
      logger.error('broadcastPokerTableState failed', { tableId, error: err });
    }
  }

  // ---------------------------------------------------------------------------
  // Poker Tournament handlers
  // ---------------------------------------------------------------------------

  private async handlePokerTournamentList(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerTournamentService) {
        return this.sendError(ws, 'Poker tournaments not available', message.requestId);
      }
      const tournaments = await this.pokerTournamentService.listPokerTournaments(ws.playerAddress ?? undefined);
      this.sendMessage(ws, { type: 'poker_tournament_list', payload: { tournaments }, requestId: message.requestId });
    } catch (error) {
      logger.error('Error listing poker tournaments:', error);
      this.sendError(ws, (error as Error).message || 'Failed to list tournaments', message.requestId);
    }
  }

  private async handlePokerTournamentCreate(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerTournamentService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
      }
      const p = message.payload as {
        name?: string;
        buyInAmount?: string;
        prizeDistributionType?: string;
        config?: unknown;
        isPrivate?: boolean;
        pinCode?: string;
        scheduledStartAt?: string;
      };
      if (!p.name) return this.sendError(ws, 'name required', message.requestId);
      if (!p.buyInAmount) return this.sendError(ws, 'buyInAmount required', message.requestId);
      if (!p.prizeDistributionType) return this.sendError(ws, 'prizeDistributionType required', message.requestId);
      if (!p.config) return this.sendError(ws, 'config required', message.requestId);

      const scheduledStartAt = p.scheduledStartAt ? new Date(p.scheduledStartAt) : null;
      if (scheduledStartAt && isNaN(scheduledStartAt.getTime())) {
        return this.sendError(ws, 'Invalid scheduledStartAt date', message.requestId);
      }

      const result = await this.pokerTournamentService.createPokerTournament({
        creatorAddress:       ws.playerAddress,
        name:                 p.name,
        buyInAmount:          BigInt(p.buyInAmount),
        prizeDistributionType: p.prizeDistributionType,
        config:               p.config as any,
        isPrivate:            p.isPrivate ?? false,
        pinCode:              p.pinCode ?? null,
        scheduledStartAt,
      });
      this.sendMessage(ws, { type: 'poker_tournament_created', payload: result, requestId: message.requestId });
    } catch (error) {
      logger.error('Error creating poker tournament:', error);
      this.sendError(ws, (error as Error).message || 'Failed to create tournament', message.requestId);
    }
  }

  private async handlePokerTournamentJoin(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerTournamentService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
      }
      const { tournamentId, pinCode } = message.payload as { tournamentId?: string; pinCode?: string };
      if (!tournamentId) return this.sendError(ws, 'tournamentId required', message.requestId);

      let result: { autoStarted: boolean; tableId: string | null; entryId: string } | null = null;
      try {
        result = await this.pokerTournamentService.joinPokerTournament(
          tournamentId, ws.playerAddress, pinCode
        );
      } catch (joinErr) {
        const msg = (joinErr as Error).message ?? '';
        // If already registered, just re-subscribe to the room without error
        if (msg.toLowerCase().includes('already registered')) {
          logger.info('Player already registered — re-subscribing to tournament room', { tournamentId, player: ws.playerAddress });
          // fall through to room subscription below with null result
        } else {
          throw joinErr;
        }
      }

      // Always add client to the tournament room (handles reconnects)
      const roomId = `poker_tournament:${tournamentId}`;
      if (ws.connectionId) {
        if (!this.roomToClients.has(roomId)) this.roomToClients.set(roomId, new Set());
        this.roomToClients.get(roomId)!.add(ws.connectionId);
      }

      this.sendMessage(ws, { type: 'poker_tournament_joined', payload: result ?? { autoStarted: false, tableId: null, alreadyRegistered: true }, requestId: message.requestId });
    } catch (error) {
      logger.error('Error joining poker tournament:', error);
      this.sendError(ws, (error as Error).message || 'Failed to join tournament', message.requestId);
    }
  }

  private async handlePokerTournamentGetState(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerTournamentService) {
        return this.sendError(ws, 'Poker tournaments not available', message.requestId);
      }
      const { tournamentId } = message.payload as { tournamentId?: string };
      if (!tournamentId) return this.sendError(ws, 'tournamentId required', message.requestId);

      const state = await this.pokerTournamentService.getTournamentState(tournamentId);
      this.sendMessage(ws, { type: 'poker_tournament_state', payload: state, requestId: message.requestId });
    } catch (error) {
      logger.error('Error getting poker tournament state:', error);
      this.sendError(ws, (error as Error).message || 'Failed to get tournament state', message.requestId);
    }
  }

  private async handlePokerTournamentCancel(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.pokerTournamentService || !ws.playerAddress) {
        return this.sendError(ws, 'Poker tournaments not available or wallet required', message.requestId);
      }
      const { tournamentId } = message.payload as { tournamentId?: string };
      if (!tournamentId) return this.sendError(ws, 'tournamentId required', message.requestId);

      await this.pokerTournamentService.cancelPokerTournament(tournamentId, ws.playerAddress);
      this.sendMessage(ws, { type: 'poker_tournament_cancelled', payload: { tournamentId }, requestId: message.requestId });
    } catch (error) {
      logger.error('Error cancelling poker tournament:', error);
      this.sendError(ws, (error as Error).message || 'Failed to cancel tournament', message.requestId);
    }
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

  // ============================================
  // Responsible Gaming / Self-Exclusion Handlers
  // ============================================

  private async handleCheckExclusionStatus(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error checking exclusion status:', error);
      this.sendError(ws, 'Failed to check exclusion status', message.requestId);
    }
  }

  private async handleSetExclusion(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }

      const payload = message.payload as {
        durationType: '24h' | '7d' | '30d' | '6m' | '1y' | 'permanent';
        reason?: string;
      };

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
      let expiresAt: Date | null = null;
      let exclusionType: 'timeout' | 'permanent' = 'timeout';

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

      await this.dbService.setExclusion(
        ws.playerAddress,
        exclusionType,
        payload.durationType,
        expiresAt,
        payload.reason
      );

      const newStatus = await this.dbService.checkExclusionStatus(ws.playerAddress);

      this.sendMessage(ws, {
        type: 'exclusion_set',
        payload: {
          success: true,
          ...newStatus
        },
        requestId: message.requestId
      });

      logger.info('Player self-excluded', {
        playerAddress: ws.playerAddress,
        exclusionType,
        durationType: payload.durationType,
        expiresAt
      });
    } catch (error) {
      logger.error('Error setting exclusion:', error);
      this.sendError(ws, 'Failed to set exclusion', message.requestId);
    }
  }

  private async handleGetExclusionHistory(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting exclusion history:', error);
      this.sendError(ws, 'Failed to get exclusion history', message.requestId);
    }
  }

  // Helper to check if a player is excluded (call before allowing game actions)
  public async isPlayerExcluded(playerAddress: string): Promise<boolean> {
    const status = await this.dbService.checkExclusionStatus(playerAddress);
    return status.isExcluded;
  }

  // ============================================
  // Tournament Mode Handlers
  // ============================================

  private async handleTournamentEnter(ws: WebSocketClient, message: WebSocketMessage) {
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

      logger.info('Player entered tournament', {
        playerAddress: ws.playerAddress,
        entryId: entry.id,
        tournamentId: entry.tournament_id,
      });
    } catch (error) {
      logger.error('Error entering tournament:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to enter tournament';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentLeave(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error leaving tournament:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to leave tournament';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleGetTournamentState(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting tournament state:', error);
      this.sendError(ws, 'Failed to get tournament state', message.requestId);
    }
  }

  private async handleTournamentGameStart(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }

      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as { betAmount: number; clientSeedCommitment?: string };

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
        return this.sendError(ws, validation.error!, message.requestId);
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
        } else if (gameState.handsRemaining <= 0) {
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
    } catch (error) {
      logger.error('Error starting tournament game:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start tournament game';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentPlayerAction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }

      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as {
        gameId: string;
        action: 'hit' | 'stand' | 'double_down' | 'split';
        handIndex?: number;
      };

      if (!payload.gameId || !payload.action) {
        return this.sendError(ws, 'Game ID and action required', message.requestId);
      }

      // Get tournament entry
      const state = await this.tournamentService.getTournamentState(ws.playerAddress);
      if (!state) {
        return this.sendError(ws, 'No active tournament entry', message.requestId);
      }

      const gameState = await this.gameService.handleTournamentPlayerAction(
        payload.gameId,
        payload.action,
        state.entryId,
        payload.handIndex
      );

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
        } else if (gameState.handsRemaining <= 0) {
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
    } catch (error) {
      logger.error('Error handling tournament player action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process action';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentLeaderboard(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as { tournamentId?: string; limit?: number };

      let tournamentId = payload?.tournamentId;
      if (!tournamentId) {
        const tournament = await this.tournamentService.getActiveTournament();
        tournamentId = tournament.id;
      }

      const limit = payload?.limit ?? 50;
      const leaderboard = await this.tournamentService.getLeaderboard(tournamentId, limit);

      // Get player's entry if connected
      let playerEntry: LeaderboardEntry | undefined;
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
    } catch (error) {
      logger.error('Error getting tournament leaderboard:', error);
      this.sendError(ws, 'Failed to get leaderboard', message.requestId);
    }
  }

  private async handleTournamentLeaderboardById(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting tournament leaderboard by ID:', error);
      this.sendError(ws, 'Failed to get leaderboard', message.requestId);
    }
  }

  private async handleGetTournamentInfo(ws: WebSocketClient, message: WebSocketMessage) {
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
            minBet: TOURNAMENT_CONFIG.MIN_BET,
            maxBet: TOURNAMENT_CONFIG.MAX_BET,
            prizePercentages: TOURNAMENT_CONFIG.PRIZE_PERCENTAGES,
          }
        },
        requestId: message.requestId
      });
    } catch (error) {
      logger.error('Error getting tournament info:', error);
      this.sendError(ws, 'Failed to get tournament info', message.requestId);
    }
  }

  private async broadcastTournamentLeaderboardUpdate(tournamentId: string) {
    if (!this.tournamentService) return;

    try {
      const leaderboard = await this.tournamentService.getLeaderboard(tournamentId, 10);

      this.broadcastToAll({
        type: 'tournament_leaderboard_update',
        payload: {
          tournamentId,
          leaderboard,
        }
      });
    } catch (error) {
      logger.error('Error broadcasting tournament leaderboard:', error);
    }
  }

  // ============================================
  // Tournament Creator Handlers
  // ============================================

  private async handleTournamentCreate(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }

      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as {
        name: string;
        buyInAmount: string;
        startingChips: number;
        maxHands: number;
        timeLimitMinutes: number | null;
        tableTheme: { kind: 'image' | 'video'; id: string };
        isPrivate: boolean;
        prizeDistributionType: string;
        maxPlayers?: number | null;
        customImage?: string | null;
        prizeTokenAddress?: string | null;
        prizeAmount?: string;
        prizeTokenDecimals?: number | null;
        pinCode?: string | null;
        onChainTournamentId?: number | bigint | null;
      };

      const buyInAmount = toBigIntSafe(payload.buyInAmount);
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
      const chatRooms = ['blackjack', 'main'] as const;
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
        } catch (chatErr) {
          logger.error('Failed to post tournament announcement to chat', { roomId, error: chatErr });
        }
      }

      logger.info('Tournament created via WebSocket', {
        tournamentId: tournament.id,
        name: tournament.name,
        creator: ws.playerAddress,
      });
    } catch (error) {
      logger.error('Error creating tournament:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create tournament';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleCreateFreeroll(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }
      const payload = message.payload as {
        name: string;
        scheduledStartAt: string;
        registrationOpensAt: string;
        durationMinutes: number;
        startingChips: number;
        maxHands: number;
        prizeDistributionType: string;
        tableTheme: { kind: 'image' | 'video'; id: string };
        isPrivate: boolean;
        maxPlayers?: number | null;
        customImage?: string | null;
        pinCode?: string | null;
        prizeTokenAddress?: string | null;
        prizeAmount?: string;
        prizeTokenDecimals?: number | null;
      };

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
      logger.info('Freeroll created via WebSocket', { tournamentId: result.id, creator: ws.playerAddress });
    } catch (error) {
      logger.error('Error creating freeroll:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create freeroll';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentList(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error listing tournaments:', error);
      this.sendError(ws, 'Failed to list tournaments', message.requestId);
    }
  }

  private async handleTournamentJoin(ws: WebSocketClient, message: WebSocketMessage) {
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

      const payload = message.payload as { tournamentId: string; pinCode?: string };

      if (!payload.tournamentId) {
        return this.sendError(ws, 'Tournament ID required', message.requestId);
      }

      const entry = await this.tournamentService.joinTournament(
        ws.playerAddress,
        payload.tournamentId,
        payload.pinCode
      );

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

      logger.info('Player joined tournament via WebSocket', {
        playerAddress: ws.playerAddress,
        tournamentId: payload.tournamentId,
        entryId: entry.id,
      });
    } catch (error) {
      logger.error('Error joining tournament:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to join tournament';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentUnregister(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Wallet required', message.requestId);
      }

      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as { tournamentId: string };

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
    } catch (error) {
      logger.error('Error unregistering from tournament:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to unregister from tournament';
      this.sendError(ws, errorMessage, message.requestId);
    }
  }

  private async handleTournamentGetInfo(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as { tournamentId: string };

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
    } catch (error) {
      logger.error('Error getting tournament info:', error);
      this.sendError(ws, 'Failed to get tournament info', message.requestId);
    }
  }

  private async handleFreerollList(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }
      const payload = (message.payload as { includePast?: boolean }) ?? {};
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
    } catch (error) {
      logger.error('Error listing freeroll tournaments:', error);
      this.sendError(ws, error instanceof Error ? error.message : 'Failed to list freerolls', message.requestId);
    }
  }

  private async handleFreerollRegister(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }
      const payload = message.payload as { tournamentId: string };
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
    } catch (error) {
      logger.error('Error registering for freeroll:', error);
      this.sendError(ws, error instanceof Error ? error.message : 'Failed to register', message.requestId);
    }
  }

  private async handleFreerollJoin(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) {
        return this.sendError(ws, 'Player address not authenticated', message.requestId);
      }
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }
      const payload = message.payload as { tournamentId: string };
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
    } catch (error) {
      logger.error('Error joining freeroll:', error);
      this.sendError(ws, error instanceof Error ? error.message : 'Failed to join', message.requestId);
    }
  }

  private async handleTournamentEntriesList(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.tournamentService) {
        return this.sendError(ws, 'Tournament mode not available', message.requestId);
      }

      const payload = message.payload as { tournamentId: string };
      if (!payload?.tournamentId) {
        return this.sendError(ws, 'Tournament ID required', message.requestId);
      }

      const entries = await this.tournamentService.getEntries(payload.tournamentId);

      this.sendMessage(ws, {
        type: 'tournament_entries_list',
        payload: { tournamentId: payload.tournamentId, entries },
        requestId: message.requestId,
      });
    } catch (error) {
      logger.error('Error getting tournament entries:', error);
      this.sendError(ws, 'Failed to get entries', message.requestId);
    }
  }

  private async handleCreatorTournaments(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting creator tournaments:', error);
      this.sendError(ws, 'Failed to get creator tournaments', message.requestId);
    }
  }

  private async handleCreatorEarnings(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error) {
      logger.error('Error getting creator earnings:', error);
      this.sendError(ws, 'Failed to get creator earnings', message.requestId);
    }
  }

  private async handleTournamentCancel(ws: WebSocketClient, message: WebSocketMessage) {
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
    } catch (error: any) {
      logger.error('Error cancelling tournament:', error);
      this.sendError(ws, error.message || 'Failed to cancel tournament', message.requestId);
    }
  }

  private async handleTournamentReclaim(ws: WebSocketClient, message: WebSocketMessage) {
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
      } else {
        this.sendError(ws, result.error || 'Failed to reclaim funds', message.requestId);
      }
    } catch (error: any) {
      logger.error('Error reclaiming tournament funds:', error);
      this.sendError(ws, error.message || 'Failed to reclaim funds', message.requestId);
    }
  }

  private async handleRecentGlobalWins(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      const limit = Math.min(parseInt(message.payload?.limit) || 20, 100)
      
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
      `
      
      const result = await this.dbService.getPool().query(query, [limit])
      
      const wins = result.rows.map((row: any) => {
        const hasWin = row.result === 'win' || row.result === 'blackjack'
        const overallResult = hasWin ? row.result : row.result === 'push' ? 'push' : 'loss'
        const isTournament = row.tg_bet_amount != null
        const betAmount = isTournament
          ? String(row.tg_bet_amount ?? 0)
          : (row.total_bet_amount?.toString() || '0')
        const chipDelta = isTournament
          ? Number(row.tg_chips_after ?? 0) - Number(row.tg_chips_before ?? 0)
          : null
        const payout = isTournament
          ? String(Number(row.tg_chips_before ?? 0) + (chipDelta ?? 0))
          : (row.total_payout?.toString() || '0')
        
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
        }
      })
      
      this.sendMessage(ws, {
        type: 'recent_global_wins',
        payload: { wins },
        requestId: message.requestId,
      })
    } catch (error) {
      logger.error('Error fetching recent global wins:', error)
      this.sendError(ws, 'Failed to fetch recent wins', message.requestId)
    }
  }

  private getPrizePercentagesForType(type: string): number[] {
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
  public shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.chatRateLimitCleanupInterval) {
      clearInterval(this.chatRateLimitCleanupInterval);
    }
    if (this.pokerAutoFoldInterval) {
      clearInterval(this.pokerAutoFoldInterval);
    }
    if (this.bjMultiTimerInterval) {
      clearInterval(this.bjMultiTimerInterval);
    }

    this.wss.clients.forEach((client: WebSocketClient) => {
      client.close(1000, 'Server shutdown');
    });

    this.wss.close();
    logger.info('WebSocket service shut down');
  }

  // ---------------------------------------------------------------------------
  // Multiplayer Blackjack handlers
  // ---------------------------------------------------------------------------

  /** Broadcast current BJ multi table state to room. */
  public async broadcastBJMultiTableState(tableId: string): Promise<void> {
    if (!this.bjMultiService) return;
    try {
      const state = await this.bjMultiService.getTableState(tableId);
      this.broadcastToRoom(`blackjack:table:${tableId}`, { type: 'bj_multi_table_state', payload: state });
    } catch (err) {
      logger.error('broadcastBJMultiTableState failed', { tableId, error: err });
    }
  }

  /** Timer tick: check for expired turns and betting timeouts across all active BJ multi tables. */
  private async tickBJMultiTimers(): Promise<void> {
    if (!this.bjMultiService) return;
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
      } catch (err) {
        logger.error('BJMulti auto-stand error', { tableId: row.table_id, error: err });
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
      } catch (err) {
        logger.error('BJMulti betting timeout error', { tableId: row.table_id, error: err });
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
      } catch (err) {
        logger.error('BJMulti stuck betting error', { tableId: row.table_id, error: err });
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
      } catch (err) {
        logger.error('BJMulti start betting phase error', { tableId: row.table_id, error: err });
      }
    }
  }

  private async handleBJMultiListTables(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService) return this.sendError(ws, 'BJ multi not available', message.requestId);
      const tables = await this.bjMultiService.listTables();
      this.sendMessage(ws, { type: 'bj_multi_table_list', payload: { tables }, requestId: message.requestId });
    } catch (error) {
      logger.error('BJ multi list tables error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to list tables', message.requestId);
    }
  }

  private async handleBJMultiJoinTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService || !ws.playerAddress) {
        return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
      }
      const { tableId, seatPosition } = (message.payload ?? {}) as { tableId?: string; seatPosition?: number };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);
      if (seatPosition === undefined || seatPosition === null) {
        return this.sendError(ws, 'seatPosition required', message.requestId);
      }

      const state = await this.bjMultiService.joinTable(tableId, ws.playerAddress, seatPosition);

      // Assign connection to room
      const roomId = `blackjack:table:${tableId}`;
      if (ws.currentRoom && ws.connectionId) {
        const prev = this.roomToClients.get(ws.currentRoom);
        if (prev) { prev.delete(ws.connectionId); if (prev.size === 0) this.roomToClients.delete(ws.currentRoom); }
      }
      ws.currentRoom = roomId;
      if (!this.roomToClients.has(roomId)) this.roomToClients.set(roomId, new Set());
      this.roomToClients.get(roomId)!.add(ws.connectionId!);

      this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
      const broadcastState = await this.bjMultiService.getTableState(tableId);
      this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('BJ multi join table error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to join table', message.requestId);
    }
  }

  private async handleBJMultiLeaveTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService || !ws.playerAddress) {
        return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
      }
      const { tableId } = (message.payload ?? {}) as { tableId?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);

      const state = await this.bjMultiService.leaveTable(tableId, ws.playerAddress);

      const roomId = `blackjack:table:${tableId}`;
      if (ws.connectionId) {
        const set = this.roomToClients.get(roomId);
        if (set) { set.delete(ws.connectionId); if (set.size === 0) this.roomToClients.delete(roomId); }
      }
      ws.currentRoom = undefined;

      this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
      const broadcastState = await this.bjMultiService.getTableState(tableId);
      this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('BJ multi leave table error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to leave table', message.requestId);
    }
  }

  private async handleBJMultiPlaceBet(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService || !ws.playerAddress) {
        return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
      }
      const { tableId, amount } = (message.payload ?? {}) as { tableId?: string; amount?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);
      if (!amount) return this.sendError(ws, 'amount required', message.requestId);

      const betAmount = toBigIntSafe(amount);
      const state = await this.bjMultiService.placeBet(tableId, ws.playerAddress, betAmount);

      this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
      const roomId = `blackjack:table:${tableId}`;
      const broadcastState = await this.bjMultiService.getTableState(tableId);
      this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('BJ multi place bet error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to place bet', message.requestId);
    }
  }

  private async handleBJMultiAction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService || !ws.playerAddress) {
        return this.sendError(ws, 'BJ multi not available or wallet required', message.requestId);
      }
      const { tableId, action, handIndex } = (message.payload ?? {}) as {
        tableId?: string; action?: string; handIndex?: number;
      };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);
      if (!action || !['hit', 'stand', 'double_down', 'split'].includes(action)) {
        return this.sendError(ws, 'action must be hit, stand, double_down, or split', message.requestId);
      }

      const state = await this.bjMultiService.playerAction(
        tableId, ws.playerAddress, action as 'hit' | 'stand' | 'double_down' | 'split', handIndex,
      );

      this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
      const roomId = `blackjack:table:${tableId}`;
      const broadcastState = await this.bjMultiService.getTableState(tableId);
      this.broadcastToRoom(roomId, { type: 'bj_multi_table_state', payload: broadcastState });
    } catch (error) {
      logger.error('BJ multi action error:', error);
      this.sendError(ws, (error as Error).message || 'Action failed', message.requestId);
    }
  }

  private async handleBJMultiGetState(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService) return this.sendError(ws, 'BJ multi not available', message.requestId);
      const { tableId } = (message.payload ?? {}) as { tableId?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);

      const state = await this.bjMultiService.getTableState(tableId);
      this.sendMessage(ws, { type: 'bj_multi_table_state', payload: state, requestId: message.requestId });
    } catch (error) {
      logger.error('BJ multi get state error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to get state', message.requestId);
    }
  }

  private async handleBJMultiCreateTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService) return this.sendError(ws, 'BJ multi not available', message.requestId);
      if (!ws.playerAddress || !isAdminWallet(ws.playerAddress)) {
        return this.sendError(ws, 'Admin required', message.requestId);
      }
      const { minBet, maxBet } = (message.payload ?? {}) as { minBet?: string; maxBet?: string };
      const min = minBet ? toBigIntSafe(minBet) : BigInt('1000000000000000000');
      const max = maxBet ? toBigIntSafe(maxBet) : BigInt('100000000000000000000000');

      const table = await this.bjMultiService.createTable(min, max);
      const tables = await this.bjMultiService.listTables();
      this.sendMessage(ws, { type: 'bj_multi_table_created', payload: { tableId: table.id, tables }, requestId: message.requestId });
    } catch (error) {
      logger.error('BJ multi create table error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to create table', message.requestId);
    }
  }

  private async handleBJMultiDeleteTable(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!this.bjMultiService) return this.sendError(ws, 'BJ multi not available', message.requestId);
      if (!ws.playerAddress || !isAdminWallet(ws.playerAddress)) {
        return this.sendError(ws, 'Admin required', message.requestId);
      }
      const { tableId } = (message.payload ?? {}) as { tableId?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);

      const ok = await this.bjMultiService.deleteTable(tableId);
      if (!ok) return this.sendError(ws, 'Table not found', message.requestId);
      const tables = await this.bjMultiService.listTables();
      this.sendMessage(ws, { type: 'bj_multi_table_deleted', payload: { tableId, tables }, requestId: message.requestId });
    } catch (error) {
      logger.error('BJ multi delete table error:', error);
      this.sendError(ws, (error as Error).message || 'Failed to delete table', message.requestId);
    }
  }

  private async handleBJMultiQuickReaction(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) return this.sendError(ws, 'Wallet required', message.requestId);
      const { tableId, type, value } = (message.payload ?? {}) as { tableId?: string; type?: string; value?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);

      this.broadcastToRoom(`blackjack:table:${tableId}`, {
        type: 'bj_multi_quick_reaction',
        payload: { tableId, playerAddress: ws.playerAddress, reactionType: type, value },
      });
    } catch (error) {
      logger.error('BJ multi quick reaction error:', error);
    }
  }

  private async handleBJMultiAvatarEmotion(ws: WebSocketClient, message: WebSocketMessage) {
    try {
      if (!ws.playerAddress) return this.sendError(ws, 'Wallet required', message.requestId);
      const { tableId, emotion } = (message.payload ?? {}) as { tableId?: string; emotion?: string };
      if (!tableId) return this.sendError(ws, 'tableId required', message.requestId);

      this.broadcastToRoom(`blackjack:table:${tableId}`, {
        type: 'bj_multi_avatar_emotion',
        payload: { tableId, playerAddress: ws.playerAddress, emotion },
      });
    } catch (error) {
      logger.error('BJ multi avatar emotion error:', error);
    }
  }
}