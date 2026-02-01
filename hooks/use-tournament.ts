'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatEther } from 'viem';

// Tournament configuration (matches server)
export const TOURNAMENT_CONFIG = {
  BUY_IN_AMOUNT: BigInt('1000000000000000000000'), // 1,000 MORBIUS
  BUY_IN_DISPLAY: '1,000',
  STARTING_CHIPS: 5000,
  MAX_HANDS: 50,
  MIN_BET: 50,
  MAX_BET: 5000,
  PRIZE_PERCENTAGES: [40, 20, 10, 2, 2, 2, 2, 2, 2, 2],
};

export interface TournamentState {
  inTournament: boolean;
  entryId: string | null;
  tournamentId: string | null;
  chips: number;
  handsPlayed: number;
  handsRemaining: number;
  highestChips: number;
  currentRank: number;
  status: 'playing' | 'busted' | 'completed' | null;
  maxHands: number;
  startingChips: number;
}

export interface TournamentInfo {
  tournamentId: string;
  name: string;
  status: string;
  buyInAmount: string;
  startingChips: number;
  maxHands: number;
  prizePool: string;
  entryCount: number;
}

export interface LeaderboardEntry {
  entry_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  status: string;
  current_rank: number;
}

export interface TournamentGameState {
  gameId: string;
  sessionId: string;
  playerHands: any[];
  dealerCards: number[];
  dealerTotal: number;
  dealerHasAce: boolean;
  status: 'waiting' | 'player_turn' | 'dealer_turn' | 'completed';
  totalBetAmount: bigint;
  totalPayout: bigint;
  actions: any[];
  dealerActions: any[];
  currentHandIndex: number;
  canSplit: boolean;
  isBlackjack: boolean;
  tournamentEntryId: string;
  tournamentChips: number;
  handsPlayed: number;
  handsRemaining: number;
  currentRank: number;
}

interface UseTournamentOptions {
  wsClient: BlackjackWebSocketClient | null;
  onBusted?: () => void;
  onCompleted?: (finalChips: number, rank: number) => void;
  onLeaderboardUpdate?: (leaderboard: LeaderboardEntry[]) => void;
}

export function useTournament(options: UseTournamentOptions) {
  const { wsClient, onBusted, onCompleted, onLeaderboardUpdate } = options;
  const { address, isConnected } = useAccount();

  // Tournament state
  const [tournamentState, setTournamentState] = useState<TournamentState>({
    inTournament: false,
    entryId: null,
    tournamentId: null,
    chips: 0,
    handsPlayed: 0,
    handsRemaining: TOURNAMENT_CONFIG.MAX_HANDS,
    highestChips: 0,
    currentRank: 0,
    status: null,
    maxHands: TOURNAMENT_CONFIG.MAX_HANDS,
    startingChips: TOURNAMENT_CONFIG.STARTING_CHIPS,
  });

  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGame, setCurrentGame] = useState<TournamentGameState | null>(null);

  // Refs for callbacks
  const onBustedRef = useRef(onBusted);
  const onCompletedRef = useRef(onCompleted);
  const onLeaderboardUpdateRef = useRef(onLeaderboardUpdate);

  useEffect(() => {
    onBustedRef.current = onBusted;
    onCompletedRef.current = onCompleted;
    onLeaderboardUpdateRef.current = onLeaderboardUpdate;
  }, [onBusted, onCompleted, onLeaderboardUpdate]);

  // Set up WebSocket event handlers
  useEffect(() => {
    if (!wsClient) return;

    // Leaderboard updates
    const handleLeaderboardUpdate = (payload: any) => {
      setLeaderboard(payload.leaderboard || []);
      onLeaderboardUpdateRef.current?.(payload.leaderboard || []);
    };

    // Tournament busted
    const handleTournamentBusted = (payload: any) => {
      setTournamentState(prev => ({
        ...prev,
        status: 'busted',
        chips: 0,
      }));
      setCurrentGame(null);
      onBustedRef.current?.();
    };

    // Tournament completed
    const handleTournamentCompleted = (payload: any) => {
      setTournamentState(prev => ({
        ...prev,
        status: 'completed',
        chips: payload.finalChips,
        currentRank: payload.currentRank,
      }));
      setCurrentGame(null);
      onCompletedRef.current?.(payload.finalChips, payload.currentRank);
    };

    // Register handlers
    wsClient.on('tournament_leaderboard_update', handleLeaderboardUpdate);
    wsClient.on('tournament_busted', handleTournamentBusted);
    wsClient.on('tournament_completed', handleTournamentCompleted);

    return () => {
      wsClient.off('tournament_leaderboard_update');
      wsClient.off('tournament_busted');
      wsClient.off('tournament_completed');
    };
  }, [wsClient]);

  // Fetch tournament state on mount
  useEffect(() => {
    if (wsClient && address) {
      fetchTournamentState();
      fetchTournamentInfo();
    }
  }, [wsClient, address]);

  /**
   * Fetch current tournament state
   */
  const fetchTournamentState = useCallback(async () => {
    if (!wsClient) return;

    try {
      const response = await wsClient.sendRequest('tournament_state', {});

      if (response.inTournament) {
        setTournamentState({
          inTournament: true,
          entryId: response.entryId,
          tournamentId: response.tournamentId,
          chips: response.chips,
          handsPlayed: response.handsPlayed,
          handsRemaining: response.handsRemaining,
          highestChips: response.highestChips,
          currentRank: response.currentRank,
          status: response.status,
          maxHands: response.maxHands,
          startingChips: response.startingChips,
        });
      } else {
        setTournamentState(prev => ({ ...prev, inTournament: false }));
      }
    } catch (err) {
      console.error('Failed to fetch tournament state:', err);
    }
  }, [wsClient]);

  /**
   * Fetch tournament info
   */
  const fetchTournamentInfo = useCallback(async () => {
    if (!wsClient) return;

    try {
      const response = await wsClient.sendRequest('tournament_info', {});
      setTournamentInfo({
        tournamentId: response.tournamentId,
        name: response.name,
        status: response.status,
        buyInAmount: response.buyInAmount,
        startingChips: response.startingChips,
        maxHands: response.maxHands,
        prizePool: response.prizePool,
        entryCount: response.entryCount,
      });
    } catch (err) {
      console.error('Failed to fetch tournament info:', err);
    }
  }, [wsClient]);

  /**
   * Enter tournament
   */
  const enterTournament = useCallback(async (): Promise<boolean> => {
    if (!wsClient || !address) {
      setError('Not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await wsClient.sendRequest('tournament_enter', {});

      setTournamentState({
        inTournament: true,
        entryId: response.entryId,
        tournamentId: response.tournamentId,
        chips: response.chips,
        handsPlayed: response.handsPlayed,
        handsRemaining: response.handsRemaining,
        highestChips: response.chips,
        currentRank: response.currentRank,
        status: 'playing',
        maxHands: response.maxHands,
        startingChips: response.startingChips,
      });

      // Update tournament info with new prize pool
      if (response.prizePool) {
        setTournamentInfo(prev => prev ? {
          ...prev,
          prizePool: response.prizePool,
        } : null);
      }

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to enter tournament');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, address]);

  /**
   * Leave tournament
   */
  const leaveTournament = useCallback(async (): Promise<boolean> => {
    if (!wsClient) {
      setError('Not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      await wsClient.sendRequest('tournament_leave', {});

      setTournamentState({
        inTournament: false,
        entryId: null,
        tournamentId: null,
        chips: 0,
        handsPlayed: 0,
        handsRemaining: TOURNAMENT_CONFIG.MAX_HANDS,
        highestChips: 0,
        currentRank: 0,
        status: null,
        maxHands: TOURNAMENT_CONFIG.MAX_HANDS,
        startingChips: TOURNAMENT_CONFIG.STARTING_CHIPS,
      });
      setCurrentGame(null);

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to leave tournament');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient]);

  /**
   * Start a tournament game
   */
  const startTournamentGame = useCallback(async (betAmount: number): Promise<TournamentGameState | null> => {
    if (!wsClient || !tournamentState.entryId) {
      setError('Not in tournament');
      return null;
    }

    // Validate bet
    if (betAmount < TOURNAMENT_CONFIG.MIN_BET) {
      setError(`Minimum bet is ${TOURNAMENT_CONFIG.MIN_BET} chips`);
      return null;
    }
    if (betAmount > tournamentState.chips) {
      setError(`Cannot bet more than your chip count (${tournamentState.chips})`);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await wsClient.sendRequest('tournament_game_start', {
        betAmount,
      });

      const gameState: TournamentGameState = {
        ...response,
        totalBetAmount: BigInt(response.totalBetAmount || 0),
        totalPayout: BigInt(response.totalPayout || 0),
      };

      setCurrentGame(gameState);

      // Update tournament state
      setTournamentState(prev => ({
        ...prev,
        chips: response.tournamentChips,
        handsPlayed: response.handsPlayed,
        handsRemaining: response.handsRemaining,
        currentRank: response.currentRank,
      }));

      return gameState;
    } catch (err: any) {
      setError(err.message || 'Failed to start game');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, tournamentState]);

  /**
   * Perform player action in tournament game
   */
  const performAction = useCallback(async (
    action: 'hit' | 'stand' | 'double_down' | 'split',
    handIndex?: number
  ): Promise<TournamentGameState | null> => {
    if (!wsClient || !currentGame) {
      setError('No active game');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await wsClient.sendRequest('tournament_player_action', {
        gameId: currentGame.gameId,
        action,
        handIndex,
      });

      const gameState: TournamentGameState = {
        ...response,
        totalBetAmount: BigInt(response.totalBetAmount || 0),
        totalPayout: BigInt(response.totalPayout || 0),
      };

      setCurrentGame(gameState);

      // Update tournament state
      setTournamentState(prev => ({
        ...prev,
        chips: response.tournamentChips,
        handsPlayed: response.handsPlayed,
        handsRemaining: response.handsRemaining,
        currentRank: response.currentRank,
        status: response.tournamentChips <= 0 ? 'busted'
          : response.handsRemaining <= 0 ? 'completed'
          : 'playing',
      }));

      // Clear game if completed
      if (gameState.status === 'completed') {
        setCurrentGame(null);
      }

      return gameState;
    } catch (err: any) {
      setError(err.message || 'Failed to perform action');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, currentGame]);

  /**
   * Fetch leaderboard
   */
  const fetchLeaderboard = useCallback(async (limit: number = 50): Promise<LeaderboardEntry[]> => {
    if (!wsClient) return [];

    try {
      const response = await wsClient.sendRequest('tournament_leaderboard', { limit });
      setLeaderboard(response.leaderboard || []);
      return response.leaderboard || [];
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      return [];
    }
  }, [wsClient]);

  /**
   * Get prize amount for a rank
   */
  const getPrizeForRank = useCallback((rank: number, prizePool: bigint): bigint => {
    if (rank < 1 || rank > 10) return 0n;
    const distributablePool = (prizePool * 84n) / 100n;
    const percentage = TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[rank - 1];
    return (distributablePool * BigInt(percentage)) / 100n;
  }, []);

  /**
   * Format prize pool display
   */
  const formatPrizePool = useCallback((prizePool: string): string => {
    try {
      const formatted = formatEther(BigInt(prizePool));
      return Number(formatted).toLocaleString();
    } catch {
      return '0';
    }
  }, []);

  return {
    // State
    tournamentState,
    tournamentInfo,
    leaderboard,
    currentGame,
    isLoading,
    error,

    // Actions
    enterTournament,
    leaveTournament,
    startTournamentGame,
    performAction,
    fetchTournamentState,
    fetchTournamentInfo,
    fetchLeaderboard,

    // Utilities
    getPrizeForRank,
    formatPrizePool,

    // Config
    config: TOURNAMENT_CONFIG,
  };
}

// Extend WebSocket client type declarations
declare module '@/lib/websocket-client' {
  interface BlackjackWebSocketClient {
    sendRequest(type: string, payload: any): Promise<any>;
    on(event: string, handler: (payload: any) => void): void;
    off(event: string): void;
  }
}
