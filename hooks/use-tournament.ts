'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatEther, decodeEventLog } from 'viem';
import { MORBIUS_TOURNAMENT_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { morbiusTournamentAbi } from '@/abi/morbius-tournament';
import { ERC20_ABI } from '@/abi/erc20';
import { pulsechain } from '@/lib/chains';
import {
  CreateTournamentRequest,
  CreateFreerollRequest,
  TournamentListItem,
  PlayerTournamentHistoryItem,
  TableTheme,
} from '@/lib/tournament-types';
// Tournament configuration (matches server defaults)
export const TOURNAMENT_CONFIG = {
  BUY_IN_AMOUNT: BigInt('1000000000000000000000'), // 1,000 MORBIUS
  BUY_IN_DISPLAY: '1,000',
  STARTING_CHIPS: 5000,
  MAX_HANDS: 25,
  MIN_BET: 50,
  MAX_BET: 5000,
  PRIZE_PERCENTAGES: [56, 20, 10, 2, 2, 2, 2, 2, 2, 2],
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
  // Rebuy info
  rebuyCount: number;
  totalBuyIn: string;
  canRebuy: boolean;
  maxRebuys: number;
  rebuyEnabled: boolean;
  // Session stats
  biggestBet: number;
  biggestWin: number;
  // Custom tournament info
  tableTheme?: TableTheme;
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
  // Extended info for custom tournaments
  creatorAddress?: string;
  maxPlayers?: number | null;
  timeLimitMinutes?: number | null;
  endsAt?: string | null;
  rebuyConfig?: { enabled: boolean; maxRebuys: number };
  tableTheme?: TableTheme;
  isPrivate?: boolean;
  prizeDistributionType?: string;
  prizePercentages?: number[];
}

// Created tournament result
export interface CreatedTournament {
  tournamentId: string;
  name: string;
  pinCode?: string;
  /** uint256 from MorbiusTournament.createTournament; used for Escrow V3 funding */
  onChainTournamentId?: number;
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

/** Summary shown in the table overlay after each tournament hand completes */
export interface TournamentHandSummary {
  chipDelta: number;
  chips: number;
  rank: number;
  handsRemaining: number;
  handsPlayed: number;
  result: 'win' | 'loss' | 'push' | 'blackjack';
}

interface UseTournamentOptions {
  wsClient: BlackjackWebSocketClient | null;
  onBusted?: () => void;
  onCompleted?: (finalChips: number, rank: number) => void;
  onLeaderboardUpdate?: (leaderboard: LeaderboardEntry[]) => void;
}

const MORBIUS_TOURNAMENT_ZERO = '0x0000000000000000000000000000000000000000' as const;

export function useTournament(options: UseTournamentOptions) {
  const { wsClient, onBusted, onCompleted, onLeaderboardUpdate } = options;
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

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
    rebuyCount: 0,
    totalBuyIn: '0',
    canRebuy: false,
    maxRebuys: 0,
    rebuyEnabled: false,
    biggestBet: 0,
    biggestWin: 0,
  });

  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-phase join: after approval tx is mined, joinApprovalReady signals the UI
  // to show a "Confirm Join" button so the second writeContractAsync fires in a fresh user gesture.
  const [joinApprovalReady, setJoinApprovalReady] = useState(false);
  const [pendingJoinState, setPendingJoinState] = useState<{
    tournamentId: string;
    pinCode?: string;
    onChainTournamentId: number;
  } | null>(null);
  const [currentGame, setCurrentGame] = useState<TournamentGameState | null>(null);

  // Tournament creator state
  const [tournamentList, setTournamentList] = useState<TournamentListItem[]>([]);
  const [createdTournament, setCreatedTournament] = useState<CreatedTournament | null>(null);
  // My History (past tournaments this player entered)
  const [tournamentHistory, setTournamentHistory] = useState<PlayerTournamentHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  /** Shown in table overlay after each tournament hand completes; cleared on next deal or after timeout */
  const [lastHandSummary, setLastHandSummary] = useState<TournamentHandSummary | null>(null);
  const lastHandSummaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Displayed state (chips, rank, hands) lags until dealer reveal completes so player doesn't see win/loss early */
  const [displayedTournamentState, setDisplayedTournamentState] = useState<TournamentState>({
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
    rebuyCount: 0,
    totalBuyIn: '0',
    canRebuy: false,
    maxRebuys: 0,
    rebuyEnabled: false,
    biggestBet: 0,
    biggestWin: 0,
  });

  // Track chips before each hand to calculate per-hand win
  const chipsBeforeHandRef = useRef<number>(0);
  const currentHandBetRef = useRef<number>(0);

  // Keep ref in sync with tournamentState so commitDisplayState can read latest
  const tournamentStateRef = useRef<TournamentState>(tournamentState);
  useEffect(() => {
    tournamentStateRef.current = tournamentState;
  }, [tournamentState]);

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
      setTournamentState(prev => {
        const next: TournamentState = {
          ...prev,
          inTournament: false,
          status: 'busted',
          chips: 0,
          canRebuy: prev.rebuyEnabled && (prev.maxRebuys === 0 || prev.rebuyCount < prev.maxRebuys),
        };
        setDisplayedTournamentState(next);
        return next;
      });
      setCurrentGame(null);
      onBustedRef.current?.();
    };

    // New tournament created globally
    const handleTournamentCreatedGlobal = async (payload: any) => {
      // Refresh tournament list when a new public tournament is created
      try {
        const response = await wsClient.sendRequest('tournament_list', {});
        setTournamentList(response.tournaments || []);
      } catch (err) {
        console.error('Failed to refresh tournament list:', err);
      }
    };

    // Tournament completed
    const handleTournamentCompleted = (payload: any) => {
      setTournamentState(prev => {
        const next: TournamentState = {
          ...prev,
          inTournament: false,
          status: 'completed',
          chips: payload.finalChips,
          currentRank: payload.currentRank,
        };
        setDisplayedTournamentState(next);
        return next;
      });
      setCurrentGame(null);
      onCompletedRef.current?.(payload.finalChips, payload.currentRank);
    };

    // Register handlers
    wsClient.on('tournament_leaderboard_update', handleLeaderboardUpdate);
    wsClient.on('tournament_busted', handleTournamentBusted);
    wsClient.on('tournament_completed', handleTournamentCompleted);
    wsClient.on('tournament_created_global', handleTournamentCreatedGlobal);

    return () => {
      wsClient.off('tournament_leaderboard_update');
      wsClient.off('tournament_busted');
      wsClient.off('tournament_completed');
      wsClient.off('tournament_created_global');
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
    if (!wsClient || !wsClient.isConnected()) return;

    try {
      const response = await wsClient.sendRequest('tournament_state', {});

      if (response.inTournament) {
        setTournamentState(prev => {
          const next = {
            ...prev,
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
          };
          setDisplayedTournamentState(next);
          return next;
        });
      } else {
        setTournamentState(prev => {
          const next = { ...prev, inTournament: false };
          setDisplayedTournamentState(next);
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to fetch tournament state:', err);
    }
  }, [wsClient]);

  /**
   * Fetch tournament info
   */
  const fetchTournamentInfo = useCallback(async () => {
    if (!wsClient || !wsClient.isConnected()) return;

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

      const nextState: TournamentState = {
        ...tournamentStateRef.current,
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
        biggestBet: 0,
        biggestWin: 0,
      };
      setTournamentState(nextState);
      setDisplayedTournamentState(nextState);

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

      const leftState: TournamentState = {
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
        rebuyCount: 0,
        totalBuyIn: '0',
        canRebuy: false,
        maxRebuys: 0,
        rebuyEnabled: false,
        biggestBet: 0,
        biggestWin: 0,
      };
      setTournamentState(leftState);
      setDisplayedTournamentState(leftState);
      setCurrentGame(null);
      if (lastHandSummaryTimeoutRef.current) {
        clearTimeout(lastHandSummaryTimeoutRef.current);
        lastHandSummaryTimeoutRef.current = null;
      }
      setLastHandSummary(null);

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to leave tournament');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient]);

  /**
   * Clear the last-hand summary overlay (e.g. when user dismisses or starts next hand)
   */
  const clearLastHandSummary = useCallback(() => {
    if (lastHandSummaryTimeoutRef.current) {
      clearTimeout(lastHandSummaryTimeoutRef.current);
      lastHandSummaryTimeoutRef.current = null;
    }
    setLastHandSummary(null);
  }, []);

  /**
   * Commit displayed tournament state (chips, rank, hands) after dealer reveal completes.
   * Call this from handleDealerRevealComplete so the sidebar doesn't show chip change until then.
   */
  const commitDisplayState = useCallback(() => {
    setDisplayedTournamentState(tournamentStateRef.current);
  }, []);

  /**
   * Start a tournament game
   */
  const startTournamentGame = useCallback(async (betAmount: number): Promise<TournamentGameState | null> => {
    if (!wsClient || !tournamentState.entryId) {
      setError('Not in tournament');
      return null;
    }

    // Clear any previous hand summary when starting a new hand
    clearLastHandSummary();

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

      // Track pre-hand chips and bet for stats
      chipsBeforeHandRef.current = tournamentState.chips;
      currentHandBetRef.current = betAmount;

      // Update tournament state (including biggestBet). Don't update displayed state until dealer reveal (commitDisplayState).
      // Exception: when busted (chips <= 0), update displayed state immediately.
      setTournamentState(prev => {
        const next = {
          ...prev,
          chips: response.tournamentChips,
          handsPlayed: response.handsPlayed,
          handsRemaining: response.handsRemaining,
          currentRank: response.currentRank,
          biggestBet: Math.max(prev.biggestBet, betAmount),
        };
        if (response.status !== 'completed') setDisplayedTournamentState(next);
        else if (response.tournamentChips <= 0) setDisplayedTournamentState(next); // Bust: show 0 chips immediately
        return next;
      });

      // If game completed immediately (e.g. blackjack), show hand summary only when tournament ends for this player
      if (response.status === 'completed' && (response.tournamentChips <= 0 || response.handsRemaining <= 0)) {
        const chipDelta = response.tournamentChips - tournamentState.chips;
        const hasBlackjack = (response.playerHands || []).some((h: any) => h.result === 'blackjack');
        const hasWin = (response.playerHands || []).some((h: any) => h.result === 'win' || h.result === 'blackjack');
        const allPush = Array.isArray(response.playerHands) && response.playerHands.length > 0
          && response.playerHands.every((h: any) => h.result === 'push');
        const result: TournamentHandSummary['result'] = hasBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';
        if (lastHandSummaryTimeoutRef.current) clearTimeout(lastHandSummaryTimeoutRef.current);
        setLastHandSummary({
          chipDelta,
          chips: response.tournamentChips,
          rank: response.currentRank,
          handsRemaining: response.handsRemaining,
          handsPlayed: response.handsPlayed,
          result,
        });
        lastHandSummaryTimeoutRef.current = setTimeout(() => {
          setLastHandSummary(null);
          lastHandSummaryTimeoutRef.current = null;
        }, 10000);
      }

      return gameState;
    } catch (err: any) {
      setError(err.message || 'Failed to start game');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, tournamentState, clearLastHandSummary]);

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

      // Track double-down as a bigger bet
      if (action === 'double_down') {
        currentHandBetRef.current = currentHandBetRef.current * 2;
      }

      // Calculate per-hand win when game completes
      const handWin = gameState.status === 'completed'
        ? Math.max(0, response.tournamentChips - chipsBeforeHandRef.current)
        : 0;
      const chipDelta = gameState.status === 'completed'
        ? response.tournamentChips - chipsBeforeHandRef.current
        : 0;

      // Update tournament state. Don't update displayed state until dealer reveal (commitDisplayState).
      // Exception: when player busts (chips <= 0), update displayed state immediately since the bust is already visible.
      setTournamentState(prev => {
        const next: TournamentState = {
          ...prev,
          chips: response.tournamentChips,
          handsPlayed: response.handsPlayed,
          handsRemaining: response.handsRemaining,
          currentRank: response.currentRank,
          status: (response.tournamentChips <= 0 ? 'busted'
            : response.handsRemaining <= 0 ? 'completed'
            : 'playing') as TournamentState['status'],
          biggestBet: Math.max(prev.biggestBet, currentHandBetRef.current),
          biggestWin: Math.max(prev.biggestWin, handWin),
        };
        if (gameState.status !== 'completed') setDisplayedTournamentState(next);
        else if (response.tournamentChips <= 0) setDisplayedTournamentState(next); // Bust: show 0 chips immediately
        return next;
      });

      // Clear game if completed and set hand summary only when tournament ends for this player
      if (gameState.status === 'completed') {
        setCurrentGame(null);
        if (response.tournamentChips <= 0 || response.handsRemaining <= 0) {
          const hasBlackjack = (response.playerHands || []).some((h: any) => h.result === 'blackjack');
          const hasWin = (response.playerHands || []).some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = Array.isArray(response.playerHands) && response.playerHands.length > 0
            && response.playerHands.every((h: any) => h.result === 'push');
          const result: TournamentHandSummary['result'] = hasBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';
          if (lastHandSummaryTimeoutRef.current) clearTimeout(lastHandSummaryTimeoutRef.current);
          setLastHandSummary({
            chipDelta,
            chips: response.tournamentChips,
            rank: response.currentRank,
            handsRemaining: response.handsRemaining,
            handsPlayed: response.handsPlayed,
            result,
          });
          lastHandSummaryTimeoutRef.current = setTimeout(() => {
            setLastHandSummary(null);
            lastHandSummaryTimeoutRef.current = null;
          }, 10000);
        }
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
   * Fetch leaderboard for current tournament
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
   * Fetch leaderboard for a specific tournament by ID
   */
  const fetchTournamentLeaderboard = useCallback(async (
    tournamentId: string,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> => {
    if (!wsClient) return [];

    try {
      const response = await wsClient.sendRequest('tournament_leaderboard_by_id', {
        tournamentId,
        limit,
      });
      return response.leaderboard || [];
    } catch (err) {
      console.error('Failed to fetch tournament leaderboard:', err);
      return [];
    }
  }, [wsClient]);

  /**
   * Get prize amount for a rank
   */
  const getPrizeForRank = useCallback((rank: number, prizePool: bigint): bigint => {
    if (rank < 1 || rank > 10) return 0n;
    const distributablePool = (prizePool * 95n) / 100n; // 95% after 3% protocol + 2% creator
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

  // ============================================
  // Tournament Creator Methods
  // ============================================

  /**
   * Create a new custom tournament.
   * When MORBIUS_TOURNAMENT_ADDRESS is configured, calls contract first (wallet signature), then registers with server.
   */
  const createTournament = useCallback(async (
    params: CreateTournamentRequest
  ): Promise<CreatedTournament | null> => {
    if (!wsClient || !address) {
      setError('Not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      let onChainTournamentId: number | undefined;

      // Contract address is hardcoded, contract interaction is REQUIRED
      const hasWriteContract = !!writeContractAsync;
      const hasPublicClient = !!publicClient;

      // Contract interaction is always required (address is hardcoded)
      if (MORBIUS_TOURNAMENT_ADDRESS && MORBIUS_TOURNAMENT_ADDRESS !== MORBIUS_TOURNAMENT_ZERO) {
        if (!hasWriteContract) {
          throw new Error('Wallet connection required for on-chain tournament creation. Please connect your wallet.');
        }
        if (!hasPublicClient) {
          throw new Error('Public client required for on-chain tournament creation. Please ensure your wallet is connected.');
        }

        console.log('Creating tournament on-chain...', {
          address: MORBIUS_TOURNAMENT_ADDRESS,
          buyInAmount: params.buyInAmount,
          maxPlayers: params.maxPlayers,
        });

        const buyInAmount = BigInt(params.buyInAmount);
        const maxPlayers = params.maxPlayers ?? 0;
        const prizeToken = (params.prizeTokenAddress?.trim() || MORBIUS_TOURNAMENT_ZERO) as `0x${string}`;
        const prizeAmount = params.prizeAmount ? BigInt(params.prizeAmount) : 0n;

        try {
          const hash = await writeContractAsync({
            address: MORBIUS_TOURNAMENT_ADDRESS,
            abi: morbiusTournamentAbi,
            functionName: 'createTournament',
            args: [buyInAmount, BigInt(maxPlayers), prizeToken, prizeAmount],
            chain: pulsechain,
            maxPriorityFeePerGas: 40_000n, // PulseChain tip
          });

          console.log('Tournament creation transaction sent:', hash);

          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          const matchedLog = receipt.logs.find((l) => {
            try {
              const logEntry = l as unknown as { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] };
              decodeEventLog({
                abi: morbiusTournamentAbi,
                data: logEntry.data,
                topics: logEntry.topics,
              });
              return true;
            } catch {
              return false;
            }
          });
          if (!matchedLog) {
            throw new Error('TournamentCreated event not found in transaction receipt. Tournament may not have been created on-chain.');
          }
          const typedLog = matchedLog as unknown as { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] };
          const decoded = decodeEventLog({
            abi: morbiusTournamentAbi,
            data: typedLog.data,
            topics: typedLog.topics,
          });
          if (decoded.eventName === 'TournamentCreated' && 'tournamentId' in decoded.args) {
            onChainTournamentId = Number(decoded.args.tournamentId);
            console.log('On-chain tournament created with ID:', onChainTournamentId);
          } else {
            throw new Error('Could not parse tournament ID from TournamentCreated event');
          }
        } catch (error: any) {
          // Contract interaction failed - fail loudly
          const errorMessage = error?.message || 'Unknown error during on-chain tournament creation';
          throw new Error(`Failed to create tournament on-chain: ${errorMessage}. Tournament creation cancelled.`);
        }
      } else {
        // This should never happen since address is hardcoded
        throw new Error('MORBIUS_TOURNAMENT_ADDRESS is not configured. This should not happen.');
      }

      const response = await wsClient.sendRequest('tournament_create', {
        ...params,
        onChainTournamentId: onChainTournamentId ?? undefined,
      });

      const result: CreatedTournament = {
        tournamentId: response.tournamentId,
        name: response.name,
        pinCode: response.pinCode,
        onChainTournamentId,
      };

      setCreatedTournament(result);
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to create tournament');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, address, writeContractAsync, publicClient]);

  /**
   * Create a new freeroll tournament
   */
  const createFreeroll = useCallback(async (
    params: CreateFreerollRequest
  ): Promise<CreatedTournament | null> => {
    if (!wsClient || !address) {
      setError('Not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await wsClient.sendRequest('create_freeroll', params);

      const result: CreatedTournament = {
        tournamentId: response.tournamentId,
        name: params.name,
        pinCode: response.pinCode,
      };

      setCreatedTournament(result);
      return result;
    } catch (err: any) {
      setError(err.message ?? 'Failed to create freeroll');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, address]);

  /**
   * Fetch list of active tournaments
   */
  const fetchTournamentList = useCallback(async (): Promise<TournamentListItem[]> => {
    if (!wsClient) return [];

    try {
      const response = await wsClient.sendRequest('tournament_list', {});
      const list = response.tournaments || [];
      setTournamentList(list);
      return list;
    } catch (err) {
      console.error('Failed to fetch tournament list:', err);
      return [];
    }
  }, [wsClient]);

  /**
   * Fetch this player's tournament history (all tournaments they entered + outcome).
   */
  const fetchTournamentHistory = useCallback(async (): Promise<PlayerTournamentHistoryItem[]> => {
    if (!address) return [];
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/tournament/player/${encodeURIComponent(address)}/history`);
      if (!res.ok) return [];
      const data = await res.json();
      setTournamentHistory(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to fetch tournament history:', err);
      return [];
    } finally {
      setIsHistoryLoading(false);
    }
  }, [address]);

  /**
   * Join a specific tournament by ID.
   * When onChainTournamentId and buyInAmount are provided, calls MorbiusTournament.joinTournament first (wallet signature).
   */
  const joinTournament = useCallback(async (
    tournamentId: string,
    pinCode?: string,
    options?: { onChainTournamentId?: number | null; buyInAmount?: string }
  ): Promise<boolean> => {
    if (!wsClient || !address) {
      setError('Not connected');
      return false;
    }

    setIsJoinLoading(true);
    setError(null);

    try {
      const { onChainTournamentId, buyInAmount } = options ?? {};

      // If this is an on-chain tournament, contract interaction is REQUIRED
      if (onChainTournamentId != null) {
        // Address is hardcoded, always available
        if (!writeContractAsync) {
          throw new Error('Wallet connection required for on-chain tournament join. Please connect your wallet.');
        }
        if (!publicClient) {
          throw new Error('Public client required for on-chain tournament join. Please ensure your wallet is connected.');
        }

        const buyInWei = buyInAmount ? BigInt(buyInAmount) : 0n;
        
        try {
          // Approve MORBIUS token if buy-in required (Phase 1 of 2-step join flow)
          if (buyInWei > 0n) {
            const approveHash = await writeContractAsync({
              address: MORBIUS_TOKEN_ADDRESS,
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [MORBIUS_TOURNAMENT_ADDRESS, buyInWei],
              chain: pulsechain,
              maxPriorityFeePerGas: 40_000n, // PulseChain tip
            });
            // Do NOT await receipt here — that would lose the user-gesture context and
            // prevent the join wallet popup from appearing. Instead, wait in the background
            // and signal the UI to show a "Confirm Join" button once approved.
            setPendingJoinState({ tournamentId, pinCode, onChainTournamentId });
            publicClient.waitForTransactionReceipt({ hash: approveHash })
              .then(() => setJoinApprovalReady(true))
              .catch(() => setJoinApprovalReady(true)); // tx was broadcast; let user proceed
            return false; // Phase 1 complete — caller must watch joinApprovalReady and call confirmJoin()
          }

          // No buy-in: join on-chain directly in this gesture (single wallet popup)
          const joinHash = await writeContractAsync({
            address: MORBIUS_TOURNAMENT_ADDRESS,
            abi: morbiusTournamentAbi,
            functionName: 'joinTournament',
            args: [BigInt(onChainTournamentId)],
            chain: pulsechain,
            maxPriorityFeePerGas: 40_000n, // PulseChain tip
          });

          // Wait for join transaction to confirm
          await publicClient.waitForTransactionReceipt({ hash: joinHash });
        } catch (error: any) {
          // Contract interaction failed - fail loudly
          const errorMessage = error?.message || 'Unknown error during on-chain tournament join';
          throw new Error(`Failed to join tournament on-chain: ${errorMessage}. Join cancelled.`);
        }
      }

      const response = await wsClient.sendRequest('tournament_join', {
        tournamentId,
        pinCode,
      });

      const nextState: TournamentState = {
        inTournament: true,
        entryId: response.entryId,
        tournamentId: response.tournamentId,
        chips: response.chips,
        handsPlayed: response.handsPlayed,
        handsRemaining: response.handsRemaining,
        highestChips: response.chips,
        currentRank: 1,
        status: 'playing',
        maxHands: response.maxHands,
        startingChips: response.startingChips,
        rebuyCount: 0,
        totalBuyIn: response.buyInAmount || '0',
        canRebuy: false,
        maxRebuys: response.rebuyConfig?.maxRebuys || 0,
        rebuyEnabled: response.rebuyConfig?.enabled || false,
        biggestBet: 0,
        biggestWin: 0,
        tableTheme: response.tableTheme,
      };
      setTournamentState(nextState);
      setDisplayedTournamentState(nextState);

      // Update tournament info
      if (response.prizePool) {
        setTournamentInfo(prev => prev ? {
          ...prev,
          prizePool: response.prizePool,
        } : null);
      }

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to join tournament');
      return false;
    } finally {
      setIsJoinLoading(false);
    }
  }, [wsClient, address, writeContractAsync, publicClient]);

  /**
   * Phase 2 of the on-chain join flow for buy-in tournaments.
   * MUST be called from a direct button click so the wallet popup can appear.
   */
  const confirmJoin = useCallback(async (): Promise<boolean> => {
    if (!pendingJoinState || !writeContractAsync || !wsClient || !address) return false;

    setIsJoinLoading(true);
    setJoinApprovalReady(false);
    setError(null);

    const { tournamentId, pinCode, onChainTournamentId } = pendingJoinState;

    try {
      const joinHash = await writeContractAsync({
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'joinTournament',
        args: [BigInt(onChainTournamentId)],
        chain: pulsechain,
        maxPriorityFeePerGas: 40_000n, // PulseChain tip
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: joinHash });
      }

      const response = await wsClient.sendRequest('tournament_join', { tournamentId, pinCode });

      const nextState: TournamentState = {
        inTournament: true,
        entryId: response.entryId,
        tournamentId: response.tournamentId,
        chips: response.chips,
        handsPlayed: response.handsPlayed,
        handsRemaining: response.handsRemaining,
        highestChips: response.chips,
        currentRank: 1,
        status: 'playing',
        maxHands: response.maxHands,
        startingChips: response.startingChips,
        rebuyCount: 0,
        totalBuyIn: response.buyInAmount || '0',
        canRebuy: false,
        maxRebuys: response.rebuyConfig?.maxRebuys || 0,
        rebuyEnabled: response.rebuyConfig?.enabled || false,
        biggestBet: 0,
        biggestWin: 0,
        tableTheme: response.tableTheme,
      };
      setTournamentState(nextState);
      setDisplayedTournamentState(nextState);

      if (response.prizePool) {
        setTournamentInfo(prev => prev ? { ...prev, prizePool: response.prizePool } : null);
      }

      setPendingJoinState(null);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to confirm tournament join');
      return false;
    } finally {
      setIsJoinLoading(false);
    }
  }, [pendingJoinState, writeContractAsync, publicClient, wsClient, address]);

  /**
   * Unregister from a tournament during registration phase. MORBIUS platform tournaments only.
   */
  const unregisterTournament = useCallback(async (tournamentId: string): Promise<boolean> => {
    if (!wsClient || !address) {
      setError('Not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      await wsClient.sendRequest('tournament_unregister', { tournamentId });

      const emptyState: TournamentState = {
          inTournament: false,
          entryId: null,
          tournamentId: null,
          chips: 0,
          handsPlayed: 0,
          handsRemaining: 0,
          highestChips: 0,
          currentRank: 0,
          status: null,
          maxHands: 0,
          startingChips: 0,
          rebuyCount: 0,
          totalBuyIn: '0',
          canRebuy: false,
          maxRebuys: 0,
          rebuyEnabled: false,
          biggestBet: 0,
          biggestWin: 0,
        };
      setTournamentState(emptyState);
      setDisplayedTournamentState(emptyState);
      setTournamentInfo(null);

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to unregister from tournament');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wsClient, address]);

  /**
   * Get extended tournament info by ID
   */
  const getTournamentInfo = useCallback(async (
    tournamentId: string
  ): Promise<TournamentInfo | null> => {
    if (!wsClient) return null;

    try {
      const response = await wsClient.sendRequest('tournament_get_info', {
        tournamentId,
      });

      const info: TournamentInfo = {
        tournamentId: response.tournamentId,
        name: response.name,
        status: response.status,
        buyInAmount: response.buyInAmount,
        startingChips: response.startingChips,
        maxHands: response.maxHands,
        prizePool: response.prizePool,
        entryCount: response.entryCount,
        creatorAddress: response.creatorAddress,
        maxPlayers: response.maxPlayers,
        timeLimitMinutes: response.timeLimitMinutes,
        endsAt: response.endsAt,
        rebuyConfig: response.rebuyConfig,
        tableTheme: response.tableTheme,
        isPrivate: response.isPrivate,
        prizeDistributionType: response.prizeDistributionType,
        prizePercentages: response.prizePercentages,
      };

      return info;
    } catch (err) {
      console.error('Failed to get tournament info:', err);
      return null;
    }
  }, [wsClient]);

  /**
   * Clear created tournament state
   */
  const clearCreatedTournament = useCallback(() => {
    setCreatedTournament(null);
  }, []);

  return {
    // State
    tournamentState,
    /** Displayed in sidebar/HUD; lags until dealer reveal (commitDisplayState) so chip/rank don't spoil the hand */
    displayedTournamentState,
    commitDisplayState,
    tournamentInfo,
    leaderboard,
    currentGame,
    isLoading,
    isJoinLoading,
    joinApprovalReady,
    error,

    // Last hand summary (for table overlay when a tournament hand completes)
    lastHandSummary,
    clearLastHandSummary,

    // Tournament Creator State
    tournamentList,
    createdTournament,

    // My History
    tournamentHistory,
    isHistoryLoading,
    fetchTournamentHistory,

    // Actions
    enterTournament,
    leaveTournament,
    startTournamentGame,
    performAction,
    fetchTournamentState,
    fetchTournamentInfo,
    fetchLeaderboard,
    fetchTournamentLeaderboard,

    // Tournament Creator Actions
    createTournament,
    createFreeroll,
    fetchTournamentList,
    joinTournament,
    confirmJoin,
    unregisterTournament,
    getTournamentInfo,
    clearCreatedTournament,

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
