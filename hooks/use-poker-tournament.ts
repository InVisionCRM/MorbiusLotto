'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';

// ---------------------------------------------------------------------------
// Types (mirrors poker-tournament.service.ts)
// ---------------------------------------------------------------------------

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  handsPerLevel: number;
}

export interface PokerTournamentConfig {
  startingStack: number;
  minPlayers: number;
  maxPlayers: number;
  blindSchedule: BlindLevel[];
}

export interface PokerTournamentPlayer {
  playerAddress: string;
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
  blindLevel: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  players: PokerTournamentPlayer[];
  prizePool: string;
  buyInAmount: string;
  prizeDistributionType: string;
  /** Present when server returns full snapshot (`getTournamentState`). */
  pokerConfig?: PokerTournamentConfig;
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
  prizePool: string;
  tableId: string | null;
  createdAt: string;
  creatorAddress: string | null;
  prizeDistributionType: string;
  scheduledStartAt: string | null;
  isRegistered: boolean;
  /** Present when server runs migration 093+ / updated API */
  isPrivate?: boolean;
}

export interface CreatePokerTournamentParams {
  name: string;
  buyInAmount: string;
  /** Wei string; when `"0"`, server requires `guaranteedPrizePool`. */
  guaranteedPrizePool?: string;
  /** Admin only: same as creator-funded pool (debits creating wallet); requires admin in `ADMIN_WALLETS`. */
  guaranteedPrizePoolSource?: 'creator' | 'platform_promo';
  prizeDistributionType: string;
  /** With `prizeDistributionType: 'custom'`, length must match `config.maxPlayers` and sum to 100. */
  prizePercentages?: number[];
  config: PokerTournamentConfig;
  isPrivate?: boolean;
  pinCode?: string;
  /** ISO 8601 start time — required; server rejects missing or past times. */
  scheduledStartAt: string;
}

export const DEFAULT_BLIND_SCHEDULE: BlindLevel[] = [
  { level: 1, smallBlind: 25,  bigBlind: 50,   handsPerLevel: 10 },
  { level: 2, smallBlind: 50,  bigBlind: 100,  handsPerLevel: 10 },
  { level: 3, smallBlind: 75,  bigBlind: 150,  handsPerLevel: 8  },
  { level: 4, smallBlind: 100, bigBlind: 200,  handsPerLevel: 8  },
  { level: 5, smallBlind: 150, bigBlind: 300,  handsPerLevel: 6  },
  { level: 6, smallBlind: 200, bigBlind: 400,  handsPerLevel: 6  },
  { level: 7, smallBlind: 300, bigBlind: 600,  handsPerLevel: 5  },
  { level: 8, smallBlind: 500, bigBlind: 1000, handsPerLevel: 999 },
];

export const POKER_TOURNAMENT_DEFAULT_CONFIG: PokerTournamentConfig = {
  startingStack: 5000,
  minPlayers:    2,
  maxPlayers:    6,
  blindSchedule: DEFAULT_BLIND_SCHEDULE,
};

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UsePokerTournamentOptions {
  wsClient: BlackjackWebSocketClient | null;
  onTournamentStarted?: (tournamentId: string, tableId: string) => void;
  onBlindLevelUp?: (level: number, smallBlind: number, bigBlind: number) => void;
  onPlayerEliminated?: (playerAddress: string, rank: number) => void;
  onTournamentCompleted?: (winners: { address: string; rank: number; prizeAmount: string }[]) => void;
}

export interface UsePokerTournamentReturn {
  openTournaments: PokerTournamentSummary[];
  isLoadingTournaments: boolean;
  myTournamentId: string | null;
  myTournamentState: PokerTournamentState | null;
  myEntryStatus: 'playing' | 'busted' | 'completed' | null;
  myTableId: string | null;
  error: string | null;
  refreshTournaments: () => Promise<void>;
  createTournament: (params: CreatePokerTournamentParams) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
  joinTournament: (tournamentId: string, pinCode?: string) => Promise<{ autoStarted: boolean; tableId: string | null } | null>;
  cancelTournament: (tournamentId: string) => Promise<boolean>;
  fetchTournamentState: (tournamentId: string) => Promise<PokerTournamentState | null>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function usePokerTournament({
  wsClient,
  onTournamentStarted,
  onBlindLevelUp,
  onPlayerEliminated,
  onTournamentCompleted,
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
  const myTournamentIdRef = useRef(myTournamentId);

  useEffect(() => { onStartedRef.current    = onTournamentStarted; },  [onTournamentStarted]);
  useEffect(() => { onLevelUpRef.current    = onBlindLevelUp; },        [onBlindLevelUp]);
  useEffect(() => { onEliminatedRef.current = onPlayerEliminated; },    [onPlayerEliminated]);
  useEffect(() => { onCompletedRef.current  = onTournamentCompleted; }, [onTournamentCompleted]);
  useEffect(() => { myTournamentIdRef.current = myTournamentId; },      [myTournamentId]);

  // ---------------------------------------------------------------------------
  // WebSocket event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!wsClient) return;

    const handleStarted = (payload: {
      tournamentId: string; tableId: string; blindLevel: number; smallBlind: number; bigBlind: number;
    }) => {
      setMyTableId(payload.tableId);
      setMyTournamentId((prev) => prev ?? payload.tournamentId);
      onStartedRef.current?.(payload.tournamentId, payload.tableId);
    };

    const handleState = (payload: PokerTournamentState) => {
      if (payload) {
        setMyTournamentState(payload);
        if (payload.tableId) setMyTableId(payload.tableId);
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
              ? { ...p, status: 'busted' as const, finalRank: payload.finalRank }
              : p
          ),
        };
      });
      onEliminatedRef.current?.(payload.playerAddress, payload.finalRank);
    };

    const handleCompleted = (payload: {
      tournamentId: string; winners: { address: string; rank: number; prizeAmount: string }[];
    }) => {
      setMyEntryStatus('completed');
      setMyTournamentId(null);
      setMyTableId(null);
      onCompletedRef.current?.(payload.winners);
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

    return () => {
      wsClient.off('poker_tournament_started');
      wsClient.off('poker_tournament_state');
      wsClient.off('poker_tournament_blind_level_up');
      wsClient.off('poker_tournament_player_eliminated');
      wsClient.off('poker_tournament_completed');
      wsClient.off('poker_tournament_cancelled');
    };
  }, [wsClient]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const refreshTournaments = useCallback(async () => {
    if (!wsClient) return;
    setIsLoading(true);
    try {
      const response = await wsClient.sendRequest('poker_tournament_list', {});
      const tournaments: PokerTournamentSummary[] = response?.tournaments ?? [];
      setOpenTournaments(tournaments);

      // Restore active tournament state from list (handles page refresh)
      const active = tournaments.find((t) => t.isRegistered && t.status === 'active' && t.tableId);
      if (active) {
        setMyTournamentId((prev) => prev ?? active.tournamentId);
        setMyTableId((prev) => prev ?? active.tableId);
        setMyEntryStatus('playing');
      }

      // Re-subscribe to registered tournament rooms so we receive started/cancelled events
      for (const t of tournaments) {
        if (t.isRegistered && t.status === 'registration') {
          wsClient.sendRequest('poker_tournament_join', { tournamentId: t.tournamentId })
            .catch(() => {}); // silently ignore — server handles already-registered case
        }
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
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
      await refreshTournaments();
      return response;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create tournament');
      return null;
    }
  }, [wsClient, refreshTournaments]);

  const joinTournament = useCallback(async (
    tournamentId: string,
    pinCode?: string,
  ): Promise<{ autoStarted: boolean; tableId: string | null } | null> => {
    if (!wsClient) return null;
    try {
      const response = await wsClient.sendRequest('poker_tournament_join', { tournamentId, pinCode });
      setMyTournamentId(tournamentId);
      setMyEntryStatus('playing');
      if (response?.tableId) setMyTableId(response.tableId);
      return response;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to join tournament');
      return null;
    }
  }, [wsClient]);

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

  // Load on mount
  useEffect(() => {
    if (wsClient?.isConnected()) {
      refreshTournaments();
    }
  }, [wsClient, refreshTournaments]);

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
    cancelTournament,
    fetchTournamentState,
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
  /** Current poker hand id — when it changes, refresh tournament snapshot (chips + hand #). */
  pokerHandId: string | null | undefined;
  onTournamentCompleted?: (winners: { address: string; rank: number; prizeAmount: string }[]) => void;
  onTournamentCancelled?: () => void;
  /** Fired on `poker_tournament_blind_level_up` for this table (visual overlay, not sonner). */
  onBlindLevelUp?: (payload: { newLevel: number; smallBlind: number; bigBlind: number }) => void;
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
  pokerHandId,
  onTournamentCompleted,
  onTournamentCancelled,
  onBlindLevelUp,
}: UsePokerTableTournamentHudOptions): PokerTournamentState | null {
  const [state, setState] = useState<PokerTournamentState | null>(null);
  const tid = (tournamentId && String(tournamentId).trim()) || null;

  const onCompletedRef = useRef(onTournamentCompleted);
  const onCancelledRef = useRef(onTournamentCancelled);
  const onBlindUpRef = useRef(onBlindLevelUp);
  useEffect(() => {
    onCompletedRef.current = onTournamentCompleted;
  }, [onTournamentCompleted]);
  useEffect(() => {
    onCancelledRef.current = onTournamentCancelled;
  }, [onTournamentCancelled]);
  useEffect(() => {
    onBlindUpRef.current = onBlindLevelUp;
  }, [onBlindLevelUp]);

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
        if (res?.tableId === tableId) setState(res);
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
      if (payload?.tournamentId === tid && payload.tableId === tableId) setState(payload);
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
              ? { ...p, status: 'busted' as const, finalRank: payload.finalRank }
              : p
          ),
        };
      });
    };

    const onCompleted = (payload: {
      tournamentId: string;
      winners: { address: string; rank: number; prizeAmount: string }[];
    }) => {
      if (payload.tournamentId !== tid) return;
      setState(null);
      onCompletedRef.current?.(payload.winners ?? []);
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

    return () => {
      wsClient.off('poker_tournament_state', onState);
      wsClient.off('poker_tournament_blind_level_up', onBlind);
      wsClient.off('poker_tournament_player_eliminated', onEliminated);
      wsClient.off('poker_tournament_completed', onCompleted);
      wsClient.off('poker_tournament_cancelled', onCancelled);
    };
  }, [wsClient, tid, tableId]);

  // After each new hand, refresh entries + hand_number from DB (WS does not push full state each hand).
  useEffect(() => {
    if (!wsClient || !tid || !wsConnected || !pokerHandId) return;
    const tm = setTimeout(() => {
      wsClient
        .sendRequest('poker_tournament_get_state', { tournamentId: tid })
        .then((res: PokerTournamentState | null) => {
          if (res?.tableId === tableId) setState(res);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(tm);
  }, [pokerHandId, wsClient, tid, tableId, wsConnected]);

  return !tid ? null : state;
}
