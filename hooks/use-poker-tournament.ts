'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { normalizePokerTournamentCompletedPayload, type PokerTournamentCompletedPayload } from '@/lib/poker-tournament-completed';

export type { PokerTournamentCompletedPayload, PokerTournamentStandingRow } from '@/lib/poker-tournament-completed';

// ---------------------------------------------------------------------------
// Types (mirrors poker-tournament.service.ts)
// ---------------------------------------------------------------------------

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  handsPerLevel: number;
}

/** Mirrors server `PokerBlindIncreaseMode`. */
export type PokerBlindIncreaseMode = 'knockout' | 'by_hand' | 'by_time';

/**
 * Mirrors server `PokerStartMode`:
 *  - `time`: classic scheduled tournament (starts at a fixed time).
 *  - `fill`: Sit & Go — no clock, starts when every seat is taken.
 */
export type PokerStartMode = 'time' | 'fill';

/** Mirrors server: wall-clock minutes per blind level in `by_time` mode (inclusive). */
export const BLIND_INTERVAL_MINUTES_MIN = 1;
export const BLIND_INTERVAL_MINUTES_MAX = 60;
export type BlindIntervalMinutes = number;

/** MTT: same constants as server. */
export const POKER_MTT_SEATS_PER_TABLE_MIN = 4;
export const POKER_MTT_SEATS_PER_TABLE_MAX = 10;

export interface PokerTournamentConfig {
  startingStack: number;
  minPlayers: number;
  maxPlayers: number;
  blindSchedule: BlindLevel[];
  /**
   * `knockout`: blinds jump when players bust (legacy).
   * `by_hand`: blinds follow the schedule after each hand (`handsPerLevel`).
   * `by_time`: blinds advance one level every `blindIntervalMinutes` of wall-clock time.
   */
  blindIncreaseMode?: PokerBlindIncreaseMode;
  /** Required when `blindIncreaseMode === 'by_time'`. Integer minutes from `BLIND_INTERVAL_MINUTES_MIN` to `BLIND_INTERVAL_MINUTES_MAX`. */
  blindIntervalMinutes?: BlindIntervalMinutes;
  /** Start mode — defaults to `time` when absent (back-compat with pre-Sit-&-Go rows). */
  startMode?: PokerStartMode;
  /**
   * MTT: max seats per physical table (4–10). When unset / equal to maxPlayers the tournament
   * runs as legacy single-table SNG. When < maxPlayers the server spins up
   * `ceil(playerCount / seatsPerTable)` tables and consolidates as players bust.
   */
  seatsPerTable?: number;
}

/** Server snapshot of one poker_tables row for the tournament. */
export interface PokerTournamentTableSummary {
  tableId: string;
  /** 1-based "Table N" label; null for legacy SNG. */
  seq: number | null;
  isFinalTable: boolean;
  playerCount: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
}

export interface PokerTournamentPlayer {
  playerAddress: string;
  /** Server `chat_display_names`; omit/null = show shortened address in UI. */
  displayName?: string | null;
  entryId: string;
  chipsRemaining: number;
  status: 'playing' | 'busted' | 'completed';
  finalRank: number | null;
  prizeWon: string;
}

export interface PokerTournamentState {
  tournamentId: string;
  name: string;
  status: string;
  tableId: string | null;
  /** MTT: the requesting wallet's current table assignment (null = spectator / busted / pre-activation). */
  myTableId?: string | null;
  /** MTT: live snapshot of every poker_tables row for the tournament. Empty / undefined for SNG. */
  tables?: PokerTournamentTableSummary[];
  blindLevel: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  players: PokerTournamentPlayer[];
  /** Chip-int for chips/promo; token-wei for custom-token (pair with `prizeTokenDecimals`). */
  prizePool: string;
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  prizeTokenName?: string | null;
  buyInAmount: string;
  prizeDistributionType: string;
  /** Present when server returns full snapshot (`getTournamentState`). */
  pokerConfig?: PokerTournamentConfig;
  /** Server `action_timer_seconds`; null = default ~60s turn clock. */
  actionTimerSeconds?: number | null;
  /** % of prize pool per rank (1st = index 0). */
  prizeSplitPercentages?: number[];
  /**
   * `by_time` mode only — ISO timestamp when the current blind level started.
   * Use with `pokerConfig.blindIntervalMinutes` to render a countdown to the next bump.
   */
  currentBlindLevelStartedAt?: string | null;
}

export interface PokerTournamentSummary {
  tournamentId: string;
  name: string;
  status: string;
  buyInAmount: string;
  startingStack: number;
  registeredCount: number;
  maxPlayers: number;
  minPlayers: number;
  /**
   * Chip-denominated pool for chips/promo freerolls; token-wei for custom-token
   * freerolls (pair with `prizeTokenDecimals` for display).
   */
  prizePool: string;
  /** ERC-20 address when prize is a custom PRC-20; null = chips. */
  prizeTokenAddress?: string | null;
  /** 1–18 when `prizeTokenAddress` is set. */
  prizeTokenDecimals?: number | null;
  /** Display ticker (e.g. "HEX"); paired with `prizeTokenName` for labels. */
  prizeTokenSymbol?: string | null;
  /** Token contract name for UI when available. */
  prizeTokenName?: string | null;
  tableId: string | null;
  /**
   * MTT: caller's actual seat table. SNG: equals `tableId`. Null when caller isn't seated.
   * Prefer `myTableId ?? tableId` for "go to my table" navigation — bare `tableId` is the
   * lowest-seq table and is wrong for MTT players seated at table 2, 3, ...
   */
  myTableId?: string | null;
  createdAt: string;
  creatorAddress: string | null;
  prizeDistributionType: string;
  scheduledStartAt: string | null;
  isRegistered: boolean;
  /**
   * Server-provided status of the caller's `tournament_entries` row, or `null` when they
   * never registered. Set even when `isRegistered` is false (e.g. busted entries) so the
   * client can restore the table view for spectating after a refresh.
   */
  myEntryStatus?: 'playing' | 'busted' | 'completed' | null;
  /** Present when server runs migration 093+ / updated API */
  isPrivate?: boolean;
  /** Lobby blinds: live table or level 1 from config (chip ints). */
  smallBlind?: number;
  bigBlind?: number;
  blindIncreaseMode?: PokerBlindIncreaseMode;
  /** Creator-chosen fee cut (0–15 integer); falls back to 2 if missing on the row. */
  creatorFeePercent?: number;
  /** `time` = scheduled start; `fill` = Sit & Go. Absent on pre-Sit-&-Go servers. */
  startMode?: PokerStartMode;
}

/**
 * Funding payload supplied when `guaranteedPrizePoolSource === 'custom_token'`.
 * The client deposits to `TournamentPrizeEscrow` BEFORE calling create; the
 * server re-reads on-chain state and rejects if anything doesn't match.
 *
 * `tournamentId` is a client-generated UUID v4 used as both the DB row id and
 * (after `keccak256(uuid)`) the bytes32 escrow key.
 */
export interface CustomTokenEscrowFunding {
  tournamentId: string;
  txHash: string;
  tokenAddress: string;
  /** Wei (smallest unit) deposited. Send as a string to survive JSON serialization. */
  amount: string;
  /** 1–18. */
  decimals: number;
  /** Display ticker (e.g. "HEX"). Server caches it for the lobby/HUD. */
  symbol?: string;
  /** Full token name from picker / scan; stored for history and display. */
  name?: string;
}

/** Metadata only — server assigns UUID and escrow bytes32 at create (no on-chain deposit yet). */
export interface CustomTokenBuyInMeta {
  tokenAddress: string;
  decimals: number;
  symbol?: string;
  name?: string;
}

export interface CreatePokerTournamentParams {
  name: string;
  buyInAmount: string;
  /** Wei string; when `"0"`, server requires `guaranteedPrizePool` unless source is `custom_token`. */
  guaranteedPrizePool?: string;
  /**
   * `creator` (default): debit creator's poker chip wallet for the guarantee or chip buy-in.
   * `platform_promo`: admin only — uses platform promo wallet.
   * `custom_token`: freeroll prize on-chain; `customTokenEscrow` required.
   * `custom_token_buyin`: players pay buy-in into escrow; `customTokenBuyIn` metadata required.
   */
  guaranteedPrizePoolSource?: 'creator' | 'platform_promo' | 'custom_token' | 'custom_token_buyin';
  /** Required when `guaranteedPrizePoolSource === 'custom_token'`. */
  customTokenEscrow?: CustomTokenEscrowFunding;
  /** Required when `guaranteedPrizePoolSource === 'custom_token_buyin'`. */
  customTokenBuyIn?: CustomTokenBuyInMeta;
  prizeDistributionType: string;
  /** With `prizeDistributionType: 'custom'`, length must match `config.maxPlayers` and sum to 100. */
  prizePercentages?: number[];
  config: PokerTournamentConfig;
  isPrivate?: boolean;
  pinCode?: string;
  /**
   * ISO 8601 start time. Required for `time` start mode (server rejects missing
   * or past times); omitted for `fill` mode (a Sit & Go has no scheduled time).
   */
  scheduledStartAt?: string;
  /** Creator's chosen fee percent (0–15 integer). Server clamps + defaults to 2 if missing. */
  creatorFeePercent?: number;
}

export const DEFAULT_BLIND_SCHEDULE: BlindLevel[] = [
  { level: 1,  smallBlind: 25,    bigBlind: 50,     handsPerLevel: 10 },
  { level: 2,  smallBlind: 50,    bigBlind: 100,    handsPerLevel: 10 },
  { level: 3,  smallBlind: 75,    bigBlind: 150,    handsPerLevel: 8  },
  { level: 4,  smallBlind: 100,   bigBlind: 200,    handsPerLevel: 8  },
  { level: 5,  smallBlind: 150,   bigBlind: 300,    handsPerLevel: 6  },
  { level: 6,  smallBlind: 200,   bigBlind: 400,    handsPerLevel: 6  },
  { level: 7,  smallBlind: 300,   bigBlind: 600,    handsPerLevel: 5  },
  { level: 8,  smallBlind: 500,   bigBlind: 1000,   handsPerLevel: 5  },
  { level: 9,  smallBlind: 750,   bigBlind: 1500,   handsPerLevel: 5  },
  { level: 10, smallBlind: 1000,  bigBlind: 2000,   handsPerLevel: 5  },
  { level: 11, smallBlind: 1500,  bigBlind: 3000,   handsPerLevel: 5  },
  { level: 12, smallBlind: 2000,  bigBlind: 4000,   handsPerLevel: 5  },
  { level: 13, smallBlind: 3000,  bigBlind: 6000,   handsPerLevel: 5  },
  { level: 14, smallBlind: 5000,  bigBlind: 10000,  handsPerLevel: 5  },
  { level: 15, smallBlind: 7500,  bigBlind: 15000,  handsPerLevel: 5  },
  { level: 16, smallBlind: 10000, bigBlind: 20000,  handsPerLevel: 5  },
  { level: 17, smallBlind: 15000, bigBlind: 30000,  handsPerLevel: 5  },
  { level: 18, smallBlind: 20000, bigBlind: 40000,  handsPerLevel: 5  },
  { level: 19, smallBlind: 30000, bigBlind: 60000,  handsPerLevel: 5  },
  { level: 20, smallBlind: 50000, bigBlind: 100000, handsPerLevel: 999 },
];

export const POKER_TOURNAMENT_DEFAULT_CONFIG: PokerTournamentConfig = {
  startingStack: 5000,
  minPlayers:    2,
  maxPlayers:    6,
  blindSchedule: DEFAULT_BLIND_SCHEDULE,
  blindIncreaseMode: 'knockout',
};

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UsePokerTournamentOptions {
  wsClient: BlackjackWebSocketClient | null;
  /**
   * Caller's wallet address (lowercase). Required so MTT broadcasts that include
   * `tableAssignments` / `moves` can resolve "which tableId is for me" — the lobby uses
   * this to navigate the current player to their assigned table when an MTT starts or
   * a consolidation happens.
   */
  myAddress?: string | null;
  /** Fires with the tableId the caller should navigate to (their own assignment for MTT). */
  onTournamentStarted?: (tournamentId: string, tableId: string) => void;
  onBlindLevelUp?: (level: number, smallBlind: number, bigBlind: number) => void;
  onPlayerEliminated?: (playerAddress: string, rank: number) => void;
  onTournamentCompleted?: (payload: PokerTournamentCompletedPayload) => void;
  /**
   * MTT: caller was moved to a new table (lone-survivor consolidation or final-table
   * collapse). Passes the new tableId so the caller can `router.replace` to the new URL.
   * Server filters per-player are not used — the hook does the address comparison.
   */
  onMyTableChanged?: (newTableId: string, tournamentId: string) => void;
}

/** Cancelled custom-token poker tournament rows the connected wallet may still reclaim. */
export interface ReclaimableCustomTokenTournament {
  tournamentId: string;
  name: string;
  cancelledAt: string | null;
  prizeTokenAddress: string;
  prizeTokenDecimals: number;
  prizeTokenSymbol: string | null;
  prizeTokenName?: string | null;
  /** Token-wei. Pair with `prizeTokenDecimals` for display. */
  prizePool: string;
  /** Pre-derived bytes32 escrow key (`keccak256(uuid)`). Use directly with `creatorReclaim(bytes32)`. */
  escrowTournamentIdBytes32: string | null;
}

/**
 * Completed custom-token poker tournaments where the connected wallet has unpaid
 * winnings recorded server-side. Surfaced when the on-chain push payout failed
 * (or hasn't fired); winners pull via `claim(bytes32)`.
 */
export interface ClaimableCustomTokenTournament {
  tournamentId: string;
  name: string;
  completedAt: string | null;
  prizeTokenAddress: string;
  prizeTokenDecimals: number;
  prizeTokenSymbol: string | null;
  prizeTokenName?: string | null;
  /** Token-wei the player should be owed. Pair with `prizeTokenDecimals` for display. */
  prizeWon: string;
  /** Pre-derived bytes32 escrow key. */
  escrowTournamentIdBytes32: string | null;
}

export interface UsePokerTournamentReturn {
  openTournaments: PokerTournamentSummary[];
  isLoadingTournaments: boolean;
  myTournamentId: string | null;
  myTournamentState: PokerTournamentState | null;
  myEntryStatus: 'playing' | 'busted' | 'completed' | null;
  myTableId: string | null;
  error: string | null;
  refreshTournaments: (opts?: { silent?: boolean }) => Promise<void>;
  createTournament: (params: CreatePokerTournamentParams) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
  joinTournament: (
    tournamentId: string,
    pinCode?: string,
    joinEscrowTxHash?: `0x${string}`,
  ) => Promise<{ autoStarted: boolean; tableId: string | null } | null>;
  leaveTournamentRegistration: (tournamentId: string) => Promise<boolean>;
  cancelTournament: (tournamentId: string) => Promise<boolean>;
  forfeitTournament: (tournamentId: string) => Promise<boolean>;
  fetchTournamentState: (tournamentId: string) => Promise<PokerTournamentState | null>;
  /**
   * One-shot fetch of cancelled custom-token freerolls created by the connected wallet
   * that may still have funds parked in the escrow. Returns [] when wallet is missing.
   */
  fetchReclaimableTournaments: () => Promise<ReclaimableCustomTokenTournament[]>;
  /**
   * One-shot fetch of completed custom-token freerolls where the connected wallet has
   * an unpaid prize. Surfaces the Claim button when the on-chain `unclaimedOf` confirms.
   */
  fetchClaimableTournaments: () => Promise<ClaimableCustomTokenTournament[]>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function usePokerTournament({
  wsClient,
  myAddress,
  onTournamentStarted,
  onBlindLevelUp,
  onPlayerEliminated,
  onTournamentCompleted,
  onMyTableChanged,
}: UsePokerTournamentOptions): UsePokerTournamentReturn {
  const [openTournaments, setOpenTournaments]     = useState<PokerTournamentSummary[]>([]);
  const [isLoadingTournaments, setIsLoading]       = useState(false);
  const [myTournamentId, setMyTournamentId]        = useState<string | null>(null);
  const [myTournamentState, setMyTournamentState]  = useState<PokerTournamentState | null>(null);
  const [myEntryStatus, setMyEntryStatus]          = useState<'playing' | 'busted' | 'completed' | null>(null);
  const [myTableId, setMyTableId]                  = useState<string | null>(null);
  const [error, setError]                          = useState<string | null>(null);

  const onStartedRef    = useRef(onTournamentStarted);
  const onLevelUpRef    = useRef(onBlindLevelUp);
  const onEliminatedRef = useRef(onPlayerEliminated);
  const onCompletedRef  = useRef(onTournamentCompleted);
  const onMyTableChangedRef = useRef(onMyTableChanged);
  const myAddressRef = useRef<string | null>(myAddress?.toLowerCase() ?? null);
  const myTournamentIdRef = useRef(myTournamentId);
  /**
   * Tracks which tournament rooms the current WS connection is already subscribed to.
   * Reset whenever `wsClient` changes (new connection). Prevents `refreshTournaments`
   * from re-firing `poker_tournament_join` (which hits Postgres) on every poll.
   */
  const subscribedTournamentsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    subscribedTournamentsRef.current = new Set();
  }, [wsClient]);

  useEffect(() => { onStartedRef.current    = onTournamentStarted; },  [onTournamentStarted]);
  useEffect(() => { onLevelUpRef.current    = onBlindLevelUp; },        [onBlindLevelUp]);
  useEffect(() => { onEliminatedRef.current = onPlayerEliminated; },    [onPlayerEliminated]);
  useEffect(() => { onCompletedRef.current  = onTournamentCompleted; }, [onTournamentCompleted]);
  useEffect(() => { onMyTableChangedRef.current = onMyTableChanged; },  [onMyTableChanged]);
  useEffect(() => { myAddressRef.current = myAddress?.toLowerCase() ?? null; }, [myAddress]);
  useEffect(() => { myTournamentIdRef.current = myTournamentId; },      [myTournamentId]);

  // ---------------------------------------------------------------------------
  // WebSocket event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!wsClient) return;

    const handleStarted = (payload: {
      tournamentId: string;
      tableId: string;
      blindLevel: number;
      smallBlind: number;
      bigBlind: number;
      /** MTT: address (lowercase) → tableId. Absent / has a single entry for SNG. */
      tableAssignments?: Record<string, string>;
    }) => {
      // MTT: pick the caller's own table assignment when present so they navigate to their own
      // table, not the broadcaster's first table. SNG falls back to the legacy `tableId` field.
      const me = myAddressRef.current;
      const myAssigned =
        me && payload.tableAssignments && payload.tableAssignments[me]
          ? payload.tableAssignments[me]
          : payload.tableId;
      setMyTableId(myAssigned);
      setMyTournamentId((prev) => prev ?? payload.tournamentId);
      onStartedRef.current?.(payload.tournamentId, myAssigned);
    };

    const handlePlayerMoved = (payload: {
      tournamentId: string;
      playerAddress: string;
      fromTableId: string;
      toTableId: string;
    }) => {
      const me = myAddressRef.current;
      if (!me || payload.playerAddress.toLowerCase() !== me) return;
      setMyTableId(payload.toTableId);
      onMyTableChangedRef.current?.(payload.toTableId, payload.tournamentId);
    };

    const handleTableConsolidated = (payload: {
      tournamentId: string;
      finalTableId: string;
      moves: Array<{ address: string; fromTableId: string; toTableId: string }>;
    }) => {
      const me = myAddressRef.current;
      if (!me) return;
      const myMove = payload.moves.find((m) => m.address.toLowerCase() === me);
      if (!myMove) return;
      setMyTableId(myMove.toTableId);
      onMyTableChangedRef.current?.(myMove.toTableId, payload.tournamentId);
    };

    const handleState = (payload: PokerTournamentState) => {
      if (payload) {
        setMyTournamentState(payload);
        // MTT prefers `myTableId` (per-player assignment). SNG / pre-MTT servers will only
        // send `tableId`; treat it as the same when myTableId is absent.
        const mine = payload.myTableId ?? payload.tableId ?? null;
        if (mine) setMyTableId(mine);
      }
    };

    const handleBlindUp = (payload: {
      tournamentId: string; newLevel: number; smallBlind: number; bigBlind: number;
    }) => {
      setMyTournamentState((prev) => prev ? {
        ...prev, blindLevel: payload.newLevel, smallBlind: payload.smallBlind, bigBlind: payload.bigBlind,
      } : prev);
      onLevelUpRef.current?.(payload.newLevel, payload.smallBlind, payload.bigBlind);
    };

    const handleEliminated = (payload: {
      tournamentId: string; playerAddress: string; finalRank: number;
    }) => {
      setMyTournamentState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.playerAddress.toLowerCase() === payload.playerAddress.toLowerCase()
              ? { ...p, status: 'busted' as const, finalRank: payload.finalRank, chipsRemaining: 0 }
              : p
          ),
        };
      });
      onEliminatedRef.current?.(payload.playerAddress, payload.finalRank);
    };

    const handleCompleted = (payload: unknown) => {
      setMyEntryStatus('completed');
      setMyTournamentId(null);
      setMyTableId(null);
      onCompletedRef.current?.(normalizePokerTournamentCompletedPayload(payload));
    };

    const handleCancelled = (payload: { tournamentId: string }) => {
      if (payload.tournamentId === myTournamentIdRef.current) {
        setMyTournamentId(null);
        setMyTableId(null);
        setMyEntryStatus(null);
      }
    };

    wsClient.on('poker_tournament_started', handleStarted);
    wsClient.on('poker_tournament_state', handleState);
    wsClient.on('poker_tournament_blind_level_up', handleBlindUp);
    wsClient.on('poker_tournament_player_eliminated', handleEliminated);
    wsClient.on('poker_tournament_completed', handleCompleted);
    wsClient.on('poker_tournament_cancelled', handleCancelled);
    wsClient.on('poker_tournament_player_moved', handlePlayerMoved);
    wsClient.on('poker_tournament_table_consolidated', handleTableConsolidated);

    return () => {
      wsClient.off('poker_tournament_started');
      wsClient.off('poker_tournament_state');
      wsClient.off('poker_tournament_blind_level_up');
      wsClient.off('poker_tournament_player_eliminated');
      wsClient.off('poker_tournament_completed');
      wsClient.off('poker_tournament_cancelled');
      wsClient.off('poker_tournament_player_moved');
      wsClient.off('poker_tournament_table_consolidated');
    };
  }, [wsClient]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const refreshTournaments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!wsClient) return;
    const silent = opts?.silent === true;
    if (!silent) setIsLoading(true);
    try {
      const response = await wsClient.sendRequest('poker_tournament_list', {});
      const tournaments: PokerTournamentSummary[] = response?.tournaments ?? [];
      setOpenTournaments(tournaments);

      // Restore active tournament state from list (handles page refresh).
      // Includes busted entries so a player who refreshes after busting still rejoins
      // the room for spectator events and can navigate back to the live table.
      // MTT: `myTableId` is the caller's actual seat (set by the server when seated);
      // fall back to `tableId` (lowest-seq) for SNG and spectators.
      const active = tournaments.find((t) =>
        (t.isRegistered || t.myEntryStatus === 'busted')
        && t.status === 'active'
        && (t.myTableId || t.tableId),
      );
      if (active) {
        setMyTournamentId((prev) => prev ?? active.tournamentId);
        setMyTableId((prev) => prev ?? (active.myTableId ?? active.tableId));
        setMyEntryStatus(active.myEntryStatus ?? 'playing');
      }

      // Re-subscribe to registered tournament rooms (registration + active) for WS events.
      // Skip tournaments we've already subscribed to on this WS connection — re-firing
      // `poker_tournament_join` hits Postgres (`SELECT ... FOR UPDATE`, table lookup) and
      // was overloading the server when called on every refresh / poll cycle.
      // Busted entries also subscribe: the server's fast-path returns spectator entries so the
      // room.add succeeds without re-running the join machinery.
      for (const t of tournaments) {
        const canSubscribe = t.isRegistered || t.myEntryStatus === 'busted';
        if (!canSubscribe) continue;
        if (t.status !== 'registration' && t.status !== 'active') continue;
        if (subscribedTournamentsRef.current.has(t.tournamentId)) continue;
        subscribedTournamentsRef.current.add(t.tournamentId);
        wsClient.sendRequest('poker_tournament_join', { tournamentId: t.tournamentId })
          .catch(() => {
            // Re-allow retry on next refresh if the request failed outright.
            subscribedTournamentsRef.current.delete(t.tournamentId);
          });
      }
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to load tournaments';
      const transport =
        /websocket disconnected|websocket not connected|websocket closed|not connected/i.test(msg);
      // Polling uses silent: true — do not surface transport churn as lobby error (it spams on reconnect).
      if (!silent && !transport) {
        setError(msg);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [wsClient]);

  const createTournament = useCallback(async (
    params: CreatePokerTournamentParams
  ): Promise<{ tournamentId: string; pinCode?: string | null } | null> => {
    if (!wsClient) return null;
    try {
      const response = (await wsClient.sendRequest('poker_tournament_create', params)) as {
        tournamentId: string;
        pinCode?: string | null;
      } | null;
      // List refresh can fail during reconnect; creation already succeeded on the server.
      try {
        await refreshTournaments({ silent: true });
      } catch {
        /* next open / manual refresh will repopulate */
      }
      return response;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create tournament');
      return null;
    }
  }, [wsClient, refreshTournaments]);

  const joinTournament = useCallback(async (
    tournamentId: string,
    pinCode?: string,
    joinEscrowTxHash?: `0x${string}`,
  ): Promise<{ autoStarted: boolean; tableId: string | null } | null> => {
    if (!wsClient) return null;
    try {
      const response = await wsClient.sendRequest('poker_tournament_join', {
        tournamentId,
        pinCode,
        ...(joinEscrowTxHash ? { joinEscrowTxHash } : {}),
      });
      setMyTournamentId(tournamentId);
      setMyEntryStatus('playing');
      if (response?.tableId) setMyTableId(response.tableId);
      return response;
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to join tournament';
      setError(msg);
      throw new Error(msg);
    }
  }, [wsClient]);

  const leaveTournamentRegistration = useCallback(async (tournamentId: string): Promise<boolean> => {
    if (!wsClient) return false;
    try {
      await wsClient.sendRequest('poker_tournament_leave_registration', { tournamentId });
      await refreshTournaments();
      return true;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to leave registration');
      return false;
    }
  }, [wsClient, refreshTournaments]);

  const cancelTournament = useCallback(async (tournamentId: string): Promise<boolean> => {
    if (!wsClient) return false;
    try {
      await wsClient.sendRequest('poker_tournament_cancel', { tournamentId });
      return true;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to cancel tournament');
      return false;
    }
  }, [wsClient]);

  /**
   * Voluntarily eliminate the caller from an active poker tournament. Same effect as busting
   * out: rank assigned, seat removed, knockout blind multiplier applied, tournament may complete.
   * No refund — buy-in stays in the prize pool.
   */
  const forfeitTournament = useCallback(async (tournamentId: string): Promise<boolean> => {
    if (!wsClient) return false;
    try {
      await wsClient.sendRequest('poker_tournament_forfeit', { tournamentId });
      // Local state cleanup happens via the broadcast `poker_tournament_player_eliminated` handler.
      return true;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to forfeit tournament');
      return false;
    }
  }, [wsClient]);

  const fetchTournamentState = useCallback(async (
    tournamentId: string
  ): Promise<PokerTournamentState | null> => {
    if (!wsClient) return null;
    try {
      const response = await wsClient.sendRequest('poker_tournament_get_state', { tournamentId });
      if (response) setMyTournamentState(response);
      return response;
    } catch {
      return null;
    }
  }, [wsClient]);

  const fetchReclaimableTournaments = useCallback(async (): Promise<ReclaimableCustomTokenTournament[]> => {
    if (!wsClient) return [];
    try {
      const response = await wsClient.sendRequest('poker_tournament_list_reclaimable', {});
      const list = response?.tournaments;
      return Array.isArray(list) ? (list as ReclaimableCustomTokenTournament[]) : [];
    } catch {
      // Reclaim list is a best-effort sidecar; never surface errors to the lobby.
      return [];
    }
  }, [wsClient]);

  const fetchClaimableTournaments = useCallback(async (): Promise<ClaimableCustomTokenTournament[]> => {
    if (!wsClient) return [];
    try {
      const response = await wsClient.sendRequest('poker_tournament_list_claimable', {});
      const list = response?.tournaments;
      return Array.isArray(list) ? (list as ClaimableCustomTokenTournament[]) : [];
    } catch {
      return [];
    }
  }, [wsClient]);

  // Load on mount
  useEffect(() => {
    if (wsClient?.isConnected()) {
      refreshTournaments();
    }
  }, [wsClient, refreshTournaments]);

  // Scheduled SNG: refresh when start time hits and poll until list shows active + tableId (scheduler/WS can lag)
  useEffect(() => {
    if (!wsClient?.isConnected()) return;

    const poll = () => void refreshTournaments({ silent: true });
    const startTimeouts: ReturnType<typeof setTimeout>[] = [];

    for (const t of openTournaments) {
      if (!t.isRegistered || !t.scheduledStartAt || t.status === 'cancelled') continue;
      const startMs = new Date(t.scheduledStartAt).getTime();
      const delay = startMs - Date.now() + 400;
      if (delay > 0) {
        const capped = Math.min(delay, 2_147_000_000);
        startTimeouts.push(setTimeout(poll, capped));
      }
    }

    const waitingForTable = openTournaments.some((t) => {
      if (!t.isRegistered || !t.scheduledStartAt) return false;
      if (t.status === 'cancelled') return false;
      if (new Date(t.scheduledStartAt).getTime() > Date.now()) return false;
      // MTT: my actual seat table is `myTableId`; SNG: falls back to `tableId`.
      const myAssigned = t.myTableId ?? t.tableId;
      if (t.status === 'active' && myAssigned && myTableId === myAssigned && myTournamentId === t.tournamentId) {
        return false;
      }
      return t.status === 'registration' || (t.status === 'active' && (!myAssigned || myTableId !== myAssigned || myTournamentId !== t.tournamentId));
    });

    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (waitingForTable) {
      intervalId = setInterval(poll, 2000);
      poll();
    }

    return () => {
      for (const tm of startTimeouts) clearTimeout(tm);
      if (intervalId) clearInterval(intervalId);
    };
  }, [wsClient, openTournaments, myTableId, myTournamentId, refreshTournaments]);

  return {
    openTournaments,
    isLoadingTournaments,
    myTournamentId,
    myTournamentState,
    myEntryStatus,
    myTableId,
    error,
    refreshTournaments,
    createTournament,
    joinTournament,
    leaveTournamentRegistration,
    cancelTournament,
    forfeitTournament,
    fetchTournamentState,
    fetchReclaimableTournaments,
    fetchClaimableTournaments,
  };
}

// ---------------------------------------------------------------------------
// Table page: tournament HUD (room subscribe + snapshot + live events)
// ---------------------------------------------------------------------------

export interface UsePokerTableTournamentHudOptions {
  wsClient: BlackjackWebSocketClient | null;
  wsConnected: boolean;
  tournamentId: string | null | undefined;
  tableId: string;
  /**
   * Caller's wallet (lowercase). When provided, MTT events (`poker_tournament_player_moved`,
   * `poker_tournament_table_consolidated`) trigger `onMyTableChanged` so the page can
   * navigate to the new tableId URL. Optional — when absent the hook ignores MTT moves.
   */
  myAddress?: string | null;
  /** Current poker hand id — when it changes, refresh tournament snapshot (chips + hand #). */
  pokerHandId: string | null | undefined;
  onTournamentCompleted?: (payload: PokerTournamentCompletedPayload) => void;
  onTournamentCancelled?: () => void;
  /** Fired on `poker_tournament_blind_level_up` for this table (visual overlay, not sonner). */
  onBlindLevelUp?: (payload: { newLevel: number; smallBlind: number; bigBlind: number }) => void;
  /** Fired on `poker_tournament_player_eliminated` for this tournament (any player). */
  onPlayerEliminated?: (playerAddress: string, finalRank: number) => void;
  /**
   * MTT: caller was moved to a new table while sitting at `tableId`. Page should `router.replace`
   * to `/poker/${newTableId}?tournament=${tournamentId}`. The bridge from the old WS connection
   * is implicit — the page remount picks up the new tableId in `usePokerConnection`.
   */
  onMyTableChanged?: (newTableId: string) => void;
}

/**
 * Subscribe to `poker_tournament:{id}`, keep `PokerTournamentState` in sync for the in-table HUD.
 * Pass `tournamentId` from `PokerTableState.tournamentId` when available; callers may fall back to `?tournament=` only until the first table snapshot loads.
 */
export function usePokerTableTournamentHud({
  wsClient,
  wsConnected,
  tournamentId,
  tableId,
  myAddress,
  pokerHandId,
  onTournamentCompleted,
  onTournamentCancelled,
  onBlindLevelUp,
  onPlayerEliminated,
  onMyTableChanged,
}: UsePokerTableTournamentHudOptions): PokerTournamentState | null {
  const [state, setState] = useState<PokerTournamentState | null>(null);
  const tid = (tournamentId && String(tournamentId).trim()) || null;
  const me = (myAddress ?? '').toLowerCase();

  const onCompletedRef = useRef(onTournamentCompleted);
  const onCancelledRef = useRef(onTournamentCancelled);
  const onBlindUpRef = useRef(onBlindLevelUp);
  const onPlayerEliminatedRef = useRef(onPlayerEliminated);
  const onMyTableChangedRef = useRef(onMyTableChanged);
  useEffect(() => {
    onCompletedRef.current = onTournamentCompleted;
  }, [onTournamentCompleted]);
  useEffect(() => {
    onCancelledRef.current = onTournamentCancelled;
  }, [onTournamentCancelled]);
  useEffect(() => {
    onBlindUpRef.current = onBlindLevelUp;
  }, [onBlindLevelUp]);
  useEffect(() => {
    onPlayerEliminatedRef.current = onPlayerEliminated;
  }, [onPlayerEliminated]);
  useEffect(() => {
    onMyTableChangedRef.current = onMyTableChanged;
  }, [onMyTableChanged]);

  // Join room + load snapshot when connected
  useEffect(() => {
    if (!tid) {
      setState(null);
      return;
    }
    if (!wsClient || !wsConnected) return;

    let cancelled = false;

    const bootstrap = async () => {
      try {
        await wsClient.sendRequest('poker_tournament_join', { tournamentId: tid });
        const res: PokerTournamentState | null = await wsClient.sendRequest('poker_tournament_get_state', {
          tournamentId: tid,
        });
        if (cancelled) return;
        // MTT: server's primary `tableId` is the final-table id (post-consolidation) or the
        // lowest-seq table; the caller's actual table may be different. Match `myTableId` first,
        // then fall back to `tableId` for legacy SNG payloads / pre-MTT servers.
        const matchesMine = res?.myTableId === tableId || res?.tableId === tableId;
        if (matchesMine) setState(res);
        else setState(null);
      } catch {
        if (!cancelled) setState(null);
      }
    };

    void bootstrap();

    const onReconnect = () => {
      void bootstrap();
    };
    wsClient.on('reconnected', onReconnect);

    return () => {
      cancelled = true;
      wsClient.off('reconnected', onReconnect);
    };
  }, [wsClient, wsConnected, tid, tableId]);

  // Live tournament events (same connection as table)
  useEffect(() => {
    if (!wsClient || !tid) return;

    const onState = (payload: PokerTournamentState) => {
      if (payload?.tournamentId !== tid) return;
      // MTT: only accept the payload if it's for this client's current table — the same
      // tournament has multiple tables, but the HUD is per-table.
      const matchesMine = payload.myTableId === tableId || payload.tableId === tableId;
      if (matchesMine) setState(payload);
    };

    const onPlayerMoved = (payload: {
      tournamentId: string;
      playerAddress: string;
      fromTableId: string;
      toTableId: string;
    }) => {
      if (payload.tournamentId !== tid) return;
      if (!me || payload.playerAddress.toLowerCase() !== me) return;
      if (payload.fromTableId !== tableId) return;
      onMyTableChangedRef.current?.(payload.toTableId);
    };

    const onTableConsolidated = (payload: {
      tournamentId: string;
      finalTableId: string;
      moves: Array<{ address: string; fromTableId: string; toTableId: string }>;
    }) => {
      if (payload.tournamentId !== tid) return;
      if (!me) return;
      const myMove = payload.moves.find((m) => m.address.toLowerCase() === me && m.fromTableId === tableId);
      if (myMove) onMyTableChangedRef.current?.(myMove.toTableId);
    };

    const onBlind = (payload: {
      tournamentId: string;
      tableId?: string;
      newLevel: number;
      smallBlind: number;
      bigBlind: number;
      handNumber?: number;
    }) => {
      if (payload.tournamentId !== tid) return;
      if (payload.tableId != null && payload.tableId !== tableId) return;
      onBlindUpRef.current?.({
        newLevel: payload.newLevel,
        smallBlind: payload.smallBlind,
        bigBlind: payload.bigBlind,
      });
      setState((prev) => {
        if (!prev || prev.tournamentId !== tid) return prev;
        return {
          ...prev,
          blindLevel: payload.newLevel,
          smallBlind: payload.smallBlind,
          bigBlind: payload.bigBlind,
          handNumber: payload.handNumber ?? prev.handNumber,
        };
      });
    };

    const onEliminated = (payload: { tournamentId: string; playerAddress: string; finalRank: number }) => {
      if (payload.tournamentId !== tid) return;
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.playerAddress.toLowerCase() === payload.playerAddress.toLowerCase()
              ? { ...p, status: 'busted' as const, finalRank: payload.finalRank, chipsRemaining: 0 }
              : p
          ),
        };
      });
      onPlayerEliminatedRef.current?.(payload.playerAddress, payload.finalRank);
    };

    const onCompleted = (payload: unknown) => {
      const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      if (typeof p.tournamentId !== 'string' || p.tournamentId !== tid) return;
      setState(null);
      onCompletedRef.current?.(normalizePokerTournamentCompletedPayload(payload));
    };

    const onCancelled = (payload: { tournamentId: string }) => {
      if (payload.tournamentId !== tid) return;
      setState(null);
      onCancelledRef.current?.();
    };

    wsClient.on('poker_tournament_state', onState);
    wsClient.on('poker_tournament_blind_level_up', onBlind);
    wsClient.on('poker_tournament_player_eliminated', onEliminated);
    wsClient.on('poker_tournament_completed', onCompleted);
    wsClient.on('poker_tournament_cancelled', onCancelled);
    wsClient.on('poker_tournament_player_moved', onPlayerMoved);
    wsClient.on('poker_tournament_table_consolidated', onTableConsolidated);

    return () => {
      wsClient.off('poker_tournament_state', onState);
      wsClient.off('poker_tournament_blind_level_up', onBlind);
      wsClient.off('poker_tournament_player_eliminated', onEliminated);
      wsClient.off('poker_tournament_completed', onCompleted);
      wsClient.off('poker_tournament_cancelled', onCancelled);
      wsClient.off('poker_tournament_player_moved', onPlayerMoved);
      wsClient.off('poker_tournament_table_consolidated', onTableConsolidated);
    };
  }, [wsClient, tid, tableId, me]);

  // After each new hand, refresh entries + hand_number from DB (WS does not push full state each hand).
  useEffect(() => {
    if (!wsClient || !tid || !wsConnected || !pokerHandId) return;
    const tm = setTimeout(() => {
      wsClient
        .sendRequest('poker_tournament_get_state', { tournamentId: tid })
        .then((res: PokerTournamentState | null) => {
          if (!res) return;
          const matchesMine = res.myTableId === tableId || res.tableId === tableId;
          if (matchesMine) setState(res);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(tm);
  }, [pokerHandId, wsClient, tid, tableId, wsConnected]);

  return !tid ? null : state;
}
