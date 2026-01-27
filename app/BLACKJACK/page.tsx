'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { keccak256, toHex, encodePacked } from 'viem';
import BlackjackTable from '@/components/BLACKJACK/BlackjackTable';
import BettingPanel from '@/components/BLACKJACK/BettingPanel';
import BettingDrawer from '@/components/BLACKJACK/BettingDrawer';
import MainNav from '@/components/BLACKJACK/MainNav';
import Footer from '@/components/BIG-WHEEL/Footer'; // Reuse footer
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { GameHistory } from '@/components/BLACKJACK/GameHistory';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { GlobalAnalyticsDashboard } from '@/components/BLACKJACK/GlobalAnalyticsDashboard';
import { GameVerificationTools } from '@/components/BLACKJACK/GameVerificationTools';
import { GlobalWinsFeed } from '@/components/BLACKJACK/GlobalWinsFeed';
import { ContractAddress } from '@/components/ui/contract-address';
import BlackjackRealTimeBetChart, { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart';
import { Card, Hand, Game, GameState, Action, GameResult, GameStateUI } from './types';
import { ANIMATION_TIMINGS } from './constants';
// import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { BlackjackWebSocketClient, GameState as ServerGameState } from '@/lib/websocket-client';
import { formatEther, parseEther } from 'viem';
import { usePlayerStatsEnhanced, useGlobalAnalytics } from '@/hooks/use-blackjack-stats';
import { useTokenApproval } from '@/hooks/use-token-approval';

// Intro screen component
function IntroScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2500;
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      const newProgress = (currentStep / steps) * 100;
      setProgress(Math.min(newProgress, 100));

      if (currentStep >= steps) {
        clearInterval(progressInterval);
        setTimeout(onComplete, 200);
      }
    }, interval);

    const fallbackTimeout = setTimeout(() => {
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(onComplete, 200);
    }, 4000);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      {/* Animated card dealing effect */}
      <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2">
        <div className="relative">
          {/* Stack of cards animation */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute items-center justify-center w-20 h-28 bg-white rounded-lg border-2 border-gray-300 shadow-lg"
              style={{
                transform: `translate(${i * 2}px, ${i * 2}px) rotate(${i * 5}deg)`,
                animation: `dealCard 0.5s ease-out ${i * 0.1}s both`,
                zIndex: 6 - i
              }}
            >
              <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">♠</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 max-w-sm">
        <div
          className="rounded-full h-3 overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgb(25, 35, 45), rgb(16, 26, 35))',
            boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-75 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.6), rgba(6, 182, 212, 0.8))',
              boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
            }}
          />
        </div>
        <div className="text-center mt-4 space-y-2">
          <span className="text-cyan-300/80 text-lg font-semibold">
            Loading... {Math.round(progress)}%
          </span>
          <div>
            <button
              onClick={onComplete}
              className="text-cyan-300/50 text-sm hover:text-cyan-300 underline transition-colors"
            >
              Skip Intro
            </button>
          </div>
        </div>
      </div>

      {/* Loading text */}
      <div className="absolute top-3/4 left-1/2 transform -translate-x-1/2 text-center">
        <div className="text-white text-xl font-bold animate-pulse mb-2">
          SHUFFLING DECK...
        </div>
        <div className="text-gray-400 text-sm">
          Preparing provably fair blackjack
        </div>
      </div>

      <style jsx>{`
        @keyframes dealCard {
          0% {
            transform: translate(0, -100px) rotate(0deg);
            opacity: 0;
          }
          100% {
            transform: translate(${6 * 2}px, ${6 * 2}px) rotate(${6 * 5}deg);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// Helper function to create initial hand
const createEmptyHand = (): Hand => ({
  cards: [],
  total: 0,
  hasAce: false,
  isBlackjack: false,
  isBust: false
});

// Helper function to calculate hand total
const calculateHandTotal = (cards: Card[]): { total: number; hasAce: boolean } => {
  let total = 0;
  let hasAce = false;

  for (const card of cards) {
    if (card.value === 1) { // Ace
      hasAce = true;
      total += 11; // Initially count as 11
    } else if (card.value >= 11 && card.value <= 13) { // Face cards
      total += 10;
    } else {
      total += card.value;
    }
  }

  // Adjust for aces if total > 21
  if (hasAce && total > 21) {
    total -= 10; // Convert ace from 11 to 1
  }

  return { total, hasAce };
};

// Helper function to create a card
const createCard = (value: number, suit: string, hidden = false): Card => ({
  value: value as any,
  suit: suit as any,
  hidden
});

export default function BlackjackPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Intro screen state
  const [showIntro, setShowIntro] = useState(true);

  // Provably Fair Advanced state
  const [clientSeed, setClientSeed] = useState('');
  const [showProvablyFairAdvanced, setShowProvablyFairAdvanced] = useState(false);

  // Generate random client seed
  const generateClientSeed = () => {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const seed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    setClientSeed(seed);
    return seed;
  };

  // Contract hook (for deposits/withdrawals only)
  const {
    deposit,
    depositMORBIUS,
    withdraw,
    playerReserve
  } = useBlackjackContract();

  // Off-chain balance state (like Stake.com)
  const [offChainBalance, setOffChainBalance] = useState<bigint>(BigInt(0));

  // Chip stack for individual bet tracking
  const [chipStack, setChipStack] = useState<number[]>([]);

  // Last bet amount for rebet functionality
  const [lastBetAmount, setLastBetAmount] = useState<string>('0');

  // Game result for chip animations
  const [currentGameResult, setCurrentGameResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | null>(null);

  // Custom chip stack manager
  const manageChipStack = useCallback((betAmount?: string, chipValue?: number, clearAll?: boolean) => {
    if (clearAll) {
      // Clearing all chips
      setChipStack([]);
    } else if (chipValue) {
      // Adding a chip to the stack
      setChipStack(prev => [...prev, chipValue]);
    }
  }, []);

  // Calculate total bet amount from chip stack
  const totalBetAmount = chipStack.reduce((sum, chip) => sum + chip, 0);
  const displayBetAmount = totalBetAmount > 0 ? formatEther(BigInt(totalBetAmount.toString() + '0'.repeat(18))) : '0';

  // Rebet: restore last bet amount
  const handleRebet = useCallback(() => {
    const lastBet = parseFloat(lastBetAmount);
    if (lastBet > 0) {
      // Convert lastBetAmount to chip stack
      // Use optimal chip breakdown
      const chips: number[] = [];
      let remaining = lastBet;
      const chipValues = [1000, 100, 25, 10, 5];
      for (const chipValue of chipValues) {
        while (remaining >= chipValue) {
          chips.push(chipValue);
          remaining -= chipValue;
        }
      }
      setChipStack(chips);
    }
  }, [lastBetAmount]);

  // Half bet: reduce current bet by 50%
  const handleHalfBet = useCallback(() => {
    if (totalBetAmount > 0) {
      const halfAmount = Math.floor(totalBetAmount / 2);
      if (halfAmount > 0) {
        // Rebuild chip stack for half amount
        const chips: number[] = [];
        let remaining = halfAmount;
        const chipValues = [1000, 100, 25, 10, 5];
        for (const chipValue of chipValues) {
          while (remaining >= chipValue) {
            chips.push(chipValue);
            remaining -= chipValue;
          }
        }
        setChipStack(chips);
      } else {
        setChipStack([]);
      }
    }
  }, [totalBetAmount]);

  // Double bet: double current bet
  const handleDoubleBet = useCallback(() => {
    if (totalBetAmount > 0) {
      const doubleAmount = totalBetAmount * 2;
      // Rebuild chip stack for double amount
      const chips: number[] = [];
      let remaining = doubleAmount;
      const chipValues = [1000, 100, 25, 10, 5];
      for (const chipValue of chipValues) {
        while (remaining >= chipValue) {
          chips.push(chipValue);
          remaining -= chipValue;
        }
      }
      setChipStack(chips);
    }
  }, [totalBetAmount]);

  // Reset game result after chip animation completes
  const handleChipAnimationComplete = useCallback(() => {
    setCurrentGameResult(null);
  }, []);

  // Double down chips: duplicate the current chip stack
  const handleDoubleDownChips = useCallback(() => {
    setChipStack(prev => [...prev, ...prev]);
  }, []);

  // Split chips: duplicate the chip stack for the second hand
  const handleSplitChips = useCallback(() => {
    setChipStack(prev => [...prev, ...prev]);
  }, []);

  // Game state
  const [gameState, setGameState] = useState<GameStateUI>({
    balance: BigInt(0), // Will be set from offChainBalance
    currentGame: null,
    playerHands: [],
    dealerCards: [],
    dealerTotal: 0,
    dealerHasAce: false,
    isPlaying: false,
    lastResult: null,
    history: [],
    clientSeed: '',
    currentHandIndex: 0,
    canSplit: false
  });

  // WebSocket client (declare before fetchBalance/syncBalance)
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Real-time P&L chart (Stake-style break-even line)
  const chartRef = useRef<BlackjackRealTimeBetChartRef>(null);
  const chartSessionStartTime = useRef<number>(Date.now());
  
  // Track previous card counts to detect new cards for animations
  const prevPlayerCardCount = useRef<number>(0);
  const prevDealerCardCount = useRef<number>(0);
  const [newCardIndices, setNewCardIndices] = useState<{ player: Set<number>, dealer: Set<number> }>({ player: new Set(), dealer: new Set() });
  
  // Reset chart when switching wallets
  useEffect(() => {
    chartSessionStartTime.current = Date.now();
  }, [address]);

  // Fetch off-chain balance from server
  const fetchBalance = useCallback(async () => {
    const client = wsClient;
    const connected = wsConnected;
    if (!client || !connected) return;
    try {
      const { balance } = await client.getBalance();
      const balanceBigInt = BigInt(balance);
      setOffChainBalance(balanceBigInt);
      setGameState(prev => ({ ...prev, balance: balanceBigInt }));
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }, [wsClient, wsConnected]);

  // Sync balance with contract after deposit/withdraw
  const syncBalance = useCallback(async () => {
    const client = wsClient;
    const connected = wsConnected;
    if (!client || !connected) return;
    try {
      const { balance } = await client.syncBalance();
      const balanceBigInt = BigInt(balance);
      setOffChainBalance(balanceBigInt);
      setGameState(prev => ({ ...prev, balance: balanceBigInt }));
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, [wsClient, wsConnected]);

  // Win notification state
  const [showWinNotification, setShowWinNotification] = useState(false);
  const [winAmount, setWinAmount] = useState<bigint>(BigInt(0));
  const [isBlackjackWin, setIsBlackjackWin] = useState(false);

  // Pending win data (waits for dealer reveal to complete)
  const [pendingWinData, setPendingWinData] = useState<{ amount: bigint; isBlackjack: boolean } | null>(null);

  // Pending game result for chip animation (waits for dealer reveal to complete)
  const [pendingChipResult, setPendingChipResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | null>(null);

  // Note: Payment method state no longer needed since only MORBIUS from reserve

  // Deposit/Withdraw modal state
  const [showDepositModal, setShowDepositModal] = useState(false);

  // View state
  const [currentView, setCurrentView] = useState<'game' | 'history' | 'stats' | 'analytics' | 'verify'>('game');

  // Fetch real analytics data
  const { data: playerStatsData, isLoading: playerStatsLoading, refetch: refetchPlayerStats } = usePlayerStatsEnhanced();
  const { data: globalAnalyticsData, isLoading: globalAnalyticsLoading, refetch: refetchGlobalAnalytics } = useGlobalAnalytics();

  // Transform player stats data to match component interface
  const playerStats = playerStatsData ? {
    totalGames: playerStatsData.total_games || 0,
    totalBet: playerStatsData.total_bet || BigInt(0),
    totalWin: playerStatsData.total_win || BigInt(0),
    winRate: Number(playerStatsData.win_rate) || 0,
    blackjackCount: playerStatsData.blackjack_count || 0,
    currentStreak: playerStatsData.current_streak || 0,
    bestStreak: playerStatsData.best_streak || 0,
    biggestWin: playerStatsData.biggest_win || BigInt(0),
    biggestLoss: playerStatsData.biggest_loss || BigInt(0),
    averageBet: Number(playerStatsData.average_bet) || 0,
    averagePayout: Number(playerStatsData.average_payout) || 0,
    profitLoss: Number(playerStatsData.profit_loss) || 0,
    roi: Number(playerStatsData.roi) || 0,
    gamesToday: playerStatsData.games_today || 0,
    gamesThisWeek: playerStatsData.games_this_week || 0,
    favoriteBetAmount: Number(playerStatsData.favorite_bet_amount) || 0,
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined
  } : null;

  // Transform global analytics data to match component interface
  const globalAnalytics = globalAnalyticsData ? {
    totalPlayers: globalAnalyticsData.total_players || 0,
    activePlayers: globalAnalyticsData.active_players || 0,
    totalGamesPlayed: globalAnalyticsData.total_games_played || 0,
    totalVolume: globalAnalyticsData.total_volume || BigInt(0),
    totalPayouts: globalAnalyticsData.total_payouts || BigInt(0),
    houseProfit: globalAnalyticsData.house_profit || BigInt(0),
    gamesLastHour: globalAnalyticsData.games_last_hour || 0,
    gamesLast24Hours: globalAnalyticsData.games_last_24_hours || 0,
    volumeLast24Hours: globalAnalyticsData.volume_last_24_hours || BigInt(0),
    profitLast24Hours: globalAnalyticsData.profit_last_24_hours || BigInt(0),
    averageWinRate: Number(globalAnalyticsData.average_win_rate) || 0,
    averageBetSize: Number(globalAnalyticsData.average_bet_size) || 0,
    houseEdge: Number(globalAnalyticsData.house_edge) || 0,
    peakConcurrentUsers: 0, // Not available from database
    serverUptime: 0, // Not available from database
    averageResponseTime: 0, // Not available from database
    errorRate: 0, // Not available from database
    activeConnections: globalAnalyticsData.active_connections || 0,
    blackjackRate: Number(globalAnalyticsData.blackjack_rate) || 0,
    splitRate: Number(globalAnalyticsData.split_rate) || 0,
    doubleDownRate: Number(globalAnalyticsData.double_down_rate) || 0,
    surrenderRate: Number(globalAnalyticsData.surrender_rate) || 0,
    reserveBalance: playerReserve || BigInt(0), // From contract
    pendingSettlements: globalAnalyticsData.pending_settlements || 0,
    failedSettlements: globalAnalyticsData.failed_settlements || 0,
    averageSettlementTime: 0, // Not available from database yet
    highRollerCount: 0, // Not available from database yet
    suspiciousActivity: 0, // Not available from database yet
    largestBet: globalAnalyticsData.largest_bet || BigInt(0),
    largestPayout: globalAnalyticsData.largest_payout || BigInt(0)
  } : null;

  // Approval modal state - needed for depositing MORBIUS directly
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  
  // Token approval hook for MORBIUS -> BLACKJACK_ADDRESS
  // Using a large default amount (100,000 MORBIUS) for unlimited-like approval
  const {
    needsApproval,
    approve,
    isApproving,
    isLoadingAllowance,
  } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    spenderAddress: BLACKJACK_ADDRESS as `0x${string}`,
    requiredAmount: parseEther('100000'), // Large default amount
    userAddress: address,
    enabled: !!address,
    defaultToUnlimited: true,
  });

  // Custom approval handler
  const handleCustomApproval = useCallback((amount: bigint) => {
    approve(amount);
  }, [approve]);


  // Initialize WebSocket connection
  useEffect(() => {
    // #region agent log
    const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3001';
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:351',message:'WebSocket useEffect triggered',data:{address,hasWsClient:!!wsClient,wsUrl,envVarSet:!!process.env.NEXT_PUBLIC_WEBSOCKET_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (address && !wsClient) {
      const client = new BlackjackWebSocketClient(
        wsUrl,
        address
      );

      // Set up event handlers
      client.on('game_created', (gameState: ServerGameState) => {
        console.log('Game created:', gameState);
        // Update local game state
        updateGameStateFromServer(gameState);
        // Some games can complete immediately on deal (blackjack/push/dealer blackjack).
        // The server does not emit a separate game_completed event for create_game, so handle it here.
        if (String((gameState as any)?.status) === 'completed') {
          const betAmount = (gameState as any)?.totalBetAmount ?? (gameState as any)?.betAmount;
          const payout = (gameState as any)?.totalPayout ?? (gameState as any)?.payout;
          const result = (gameState as any)?.result;
          handleGameCompletion({
            gameId: (gameState as any)?.gameId ?? (gameState as any)?.id,
            betAmount,
            payout,
            result,
          });
        }
      });

      client.on('game_updated', (gameState: ServerGameState) => {
        console.log('Game updated:', gameState);
        updateGameStateFromServer(gameState);
      });

      client.on('game_completed', (data: any) => {
        console.log('Game completed:', data);
        handleGameCompletion(data);
        // Refresh balance after game completes
        fetchBalance();
      });

      client.on('error', (error: any) => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:377',message:'WebSocket error event handler',data:{errorMessage:error?.message,errorString:String(error),errorType:typeof error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        console.error('WebSocket error:', error);
        setWsConnected(false);
        toast.error(error.message || 'Connection error');
      });

      // Connect
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:381',message:'Calling client.connect()',data:{wsUrl,address},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      client.connect()
        .then(() => {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:383',message:'Connection successful',data:{wsUrl,address},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          setWsConnected(true);
          setWsClient(client);
          console.log('Connected to blackjack server');
          // Fetch initial balance
          fetchBalance();
        })
        .catch((error) => {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:388',message:'Connection failed in catch',data:{errorMessage:error?.message,errorString:String(error),errorStack:error?.stack,errorName:error?.name,wsUrl,address},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          setWsConnected(false);
          const errorMessage = error?.message || 'Failed to connect to game server';
          console.error('Failed to connect to server:', errorMessage, error);
          toast.error(errorMessage);
        });
    }

    return () => {
      if (wsClient) {
        wsClient.disconnect();
        setWsConnected(false);
      }
    };
  }, [address]);

  // Fetch balance when WebSocket connects
  useEffect(() => {
    if (wsConnected && wsClient) {
      fetchBalance();
    }
  }, [wsConnected, wsClient, fetchBalance]);

  // Convert server game state (off-chain) to local UI format
  const updateGameStateFromServer = useCallback((serverGameState: any) => {
    if (!address) return;

    const gameId = String(serverGameState.gameId || serverGameState.id || '');
    const status = String(serverGameState.status || 'waiting');
    const currentHandIndex = Number(serverGameState.currentHandIndex ?? 0);

    const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
    const suitFor = (idx: number) => {
      // Deterministic suit selection (suits don't matter in blackjack)
      const salt = gameId.length;
      return suits[(idx + salt) % suits.length];
    };
    const toCard = (value: number, idx: number, hidden = false): Card =>
      createCard(Number(value), suitFor(idx), hidden);

    const toBigIntSafe = (v: any) => {
      try {
        if (typeof v === 'bigint') return v;
        if (v === null || v === undefined) return BigInt(0);
        return BigInt(String(v));
      } catch {
        return BigInt(0);
      }
    };

    const totalBetAmount = toBigIntSafe(serverGameState.totalBetAmount ?? serverGameState.betAmount);
    const totalPayout = toBigIntSafe(serverGameState.totalPayout ?? serverGameState.payout);

    const rawHands = Array.isArray(serverGameState.playerHands)
      ? serverGameState.playerHands
      : [];

    const playerHands: Hand[] = rawHands.map((h: any, handIdx: number) => {
      const rawCards: number[] = Array.isArray(h.cards) ? h.cards.map((c: any) => Number(c)) : [];
      const cards = rawCards.map((c, idx) => toCard(c, handIdx * 10 + idx));
      const totals = calculateHandTotal(cards);
      return {
        id: String(h.id || `${gameId}-hand-${handIdx}`),
        cards,
        total: Number(h.total ?? totals.total),
        hasAce: Boolean(h.hasAce ?? totals.hasAce),
        isBlackjack: Boolean(h.isBlackjack ?? false),
        isBust: Boolean(h.isBust ?? false),
        betAmount: toBigIntSafe(h.betAmount ?? totalBetAmount),
        result: h.result,
        payout: toBigIntSafe(h.payout),
        actions: Array.isArray(h.actions) ? h.actions : [],
        canHit: Boolean(h.canHit ?? true),
        canStand: Boolean(h.canStand ?? true),
        canDoubleDown: Boolean(h.canDoubleDown ?? false),
        canSplit: Boolean(h.canSplit ?? false),
      };
    });

    const activePlayerHand = playerHands[currentHandIndex] || playerHands[0];

    // Dealer cards - server sends only visible card(s) during player turn for security
    // When game completes, server sends all dealer cards for reveal animation
    const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
      ? serverGameState.dealerCards.map((c: any) => Number(c))
      : [];
    console.log('Dealer cards received:', rawDealerCards.length, rawDealerCards);
    const dealerCards = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
    console.log('Dealer cards after mapping:', dealerCards.length, dealerCards);
    const dealerTotals = calculateHandTotal(dealerCards);
    const dealerHand: Hand = {
      id: `${gameId}-dealer`,
      cards: dealerCards,
      total: Number(serverGameState.dealerTotal ?? dealerTotals.total),
      hasAce: Boolean(serverGameState.dealerHasAce ?? dealerTotals.hasAce),
      isBlackjack: false,
      isBust: Number(serverGameState.dealerTotal ?? dealerTotals.total) > 21,
      betAmount: BigInt(0),
      payout: BigInt(0),
      actions: Array.isArray(serverGameState.dealerActions) ? serverGameState.dealerActions : [],
      canHit: false,
      canStand: false,
      canDoubleDown: false,
      canSplit: false,
    };

    const localGame: any = {
      id: gameId,
      player: address,
      betAmount: totalBetAmount,
      state:
        status === 'player_turn'
          ? GameState.PLAYER_TURN
          : status === 'dealer_turn'
            ? GameState.DEALER_TURN
            : status === 'completed'
              ? GameState.COMPLETE
              : GameState.WAITING,
      // Keep the legacy single-hand fields used throughout the page
      playerHand: activePlayerHand || {
        id: `${gameId}-hand-0`,
        cards: [],
        total: 0,
        hasAce: false,
        isBlackjack: false,
        isBust: false,
        betAmount: BigInt(0),
        payout: BigInt(0),
        actions: [],
        canHit: false,
        canStand: false,
        canDoubleDown: false,
        canSplit: false,
      },
      dealerHand,
      // Also keep multi-hand data for split support
      playerHands,
      currentHandIndex,
      totalBetAmount,
      totalPayout,
      canSplit: Boolean(serverGameState.canSplit ?? activePlayerHand?.canSplit ?? false),
      isBlackjack: Boolean(serverGameState.isBlackjack ?? activePlayerHand?.isBlackjack ?? false),
      timestamp: Date.now(),
      clientSeed: gameState.clientSeed,
    };

    setGameState(prev => ({
      ...prev,
      currentGame: localGame,
      isPlaying: status !== 'completed',
    }));
    
    // Track new cards for animations
    const currentPlayerCardCount = activePlayerHand?.cards.length || 0;
    const currentDealerCardCount = dealerCards.length;
    
    if (currentPlayerCardCount > prevPlayerCardCount.current) {
      const newIndices = new Set<number>();
      for (let i = prevPlayerCardCount.current; i < currentPlayerCardCount; i++) {
        newIndices.add(i);
      }
      setNewCardIndices(prev => ({ ...prev, player: newIndices }));
      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.player);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, player: updated };
        });
      }, 1000);
    }
    
    if (currentDealerCardCount > prevDealerCardCount.current) {
      const newIndices = new Set<number>();
      for (let i = prevDealerCardCount.current; i < currentDealerCardCount; i++) {
        newIndices.add(i);
      }
      setNewCardIndices(prev => ({ ...prev, dealer: newIndices }));
      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.dealer);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, dealer: updated };
        });
      }, 1000);
    }
    
    prevPlayerCardCount.current = currentPlayerCardCount;
    prevDealerCardCount.current = currentDealerCardCount;
  }, [address, gameState.clientSeed]);

  // Handle game completion
  const handleGameCompletion = useCallback((data: any) => {
    try {
      const payout: bigint =
        typeof data?.payout === 'bigint' ? data.payout : BigInt(String(data?.payout || '0'));
      const betAmount: bigint =
        typeof data?.betAmount === 'bigint' ? data.betAmount : BigInt(String(data?.betAmount || '0'));
      const profit: bigint = payout - betAmount;

      // Save last bet amount (in whole MORBIUS tokens)
      const betInMorbius = Math.floor(Number(formatEther(betAmount)));
      setLastBetAmount(betInMorbius.toString());

      // Determine game result for chip animations (will be set after dealer reveal)
      let chipAnimResult: 'win' | 'loss' | 'push' | 'blackjack' | null = null;
      if (data.result === 'blackjack') {
        chipAnimResult = 'blackjack';
      } else if (profit > BigInt(0)) {
        chipAnimResult = 'win';
      } else if (profit < BigInt(0)) {
        chipAnimResult = 'loss';
      } else {
        chipAnimResult = 'push';
      }
      // Store as pending - will be applied after dealer reveal completes
      setPendingChipResult(chipAnimResult);

      // Add to break-even P&L chart (per completed game)
      chartRef.current?.addGameResult(betAmount, payout, {
        gameId: data?.gameId ? String(data.gameId) : undefined,
        result: data?.result ? String(data.result) : undefined,
      });

      // Add to history
      const gameResult: GameResult = {
        gameId: data?.gameId ? String(data.gameId) : `game-${Date.now()}`,
        playerHand: gameState.currentGame?.playerHand || createEmptyHand(),
        dealerHand: gameState.currentGame?.dealerHand || createEmptyHand(),
        payout,
        isBlackjack: data.result === 'blackjack',
        timestamp: Date.now()
      };

      setGameState(prev => ({
        ...prev,
        history: [gameResult, ...prev.history].slice(0, 50), // Keep last 50 games
        lastResult: gameResult
      }));

      if (profit > BigInt(0)) {
        // Store pending win data - will show notification after dealer reveal completes
        setPendingWinData({
          amount: profit,
          isBlackjack: data.result === 'blackjack'
        });
      }
    } catch {
      // ignore malformed payload
    }
  }, [gameState.currentGame]);

  // Handle dealer reveal completion - show win notification and trigger chip animation
  const handleDealerRevealComplete = useCallback(() => {
    // Trigger chip animation now that dealer reveal is complete
    if (pendingChipResult) {
      setCurrentGameResult(pendingChipResult);
      setPendingChipResult(null);
    }

    // Show win notification
    if (pendingWinData) {
      setWinAmount(pendingWinData.amount);
      setIsBlackjackWin(pendingWinData.isBlackjack);
      setShowWinNotification(true);
      setPendingWinData(null);
    }
  }, [pendingWinData, pendingChipResult]);

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle deposit/withdraw modal
  const handleOpenDepositModal = useCallback(() => {
    setShowDepositModal(true);
  }, []);

  // Handle starting a new game
  const handleStartGame = useCallback(async (betAmount: bigint, _clientSeedFromPanel: string) => {
    // Use the clientSeed from page state (Provably Fair Advanced section)
    // If empty, auto-generate one
    const finalClientSeed = clientSeed || generateClientSeed();
    console.log('Main handleStartGame called with:', { betAmount, clientSeed: finalClientSeed, isConnected, address });
    
    // Reset card counts for new game animations
    prevPlayerCardCount.current = 0;
    prevDealerCardCount.current = 0;
    setNewCardIndices({ player: new Set(), dealer: new Set() });

    // Off-chain betting does NOT require a wagmi publicClient (only deposits/withdrawals do).
    // We only need a connected wallet address and a connected websocket client.
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    if (!wsConnected || !wsClient) {
      console.log('Game server not connected yet');
      toast.error('Connecting to game server… try again in a second');
      return;
    }

    try {
      setGameState(prev => ({ ...prev, isPlaying: true, clientSeed }));

      // Step 1: Get server seed hash and nonce from server
      const { serverSeedHash, nonce } = await wsClient.getServerSeedHash();

      // Step 2: Generate game hash on frontend (for provably fair verification)
      // Match server format: `${serverSeed}:${clientSeed}:${nonce}:${betAmount}:${timestamp}`
      const timestamp = Math.floor(Date.now() / 1000);
      // Remove 0x prefix from serverSeedHash for hash calculation (server uses hex string without 0x)
      const serverSeedForHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash;
      const hashInput = `${serverSeedForHash}:${finalClientSeed}:${nonce}:${betAmount.toString()}:${timestamp}`;
      
      // Use Web Crypto API to generate SHA-256 hash (matches server's crypto.createHash('sha256').digest('hex'))
      const encoder = new TextEncoder();
      const data = encoder.encode(hashInput);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const gameHash = ('0x' + hashHex) as `0x${string}`;

      console.log('Generated game hash:', gameHash, { 
        serverSeedHash, 
        serverSeedForHash,
        clientSeed, 
        betAmount: betAmount.toString(), 
        nonce, 
        timestamp,
        hashInput,
        hashHex
      });

      // Step 3: Create game on server (off-chain betting)
      // Server will validate reserves off-chain and create the game
      // No on-chain transaction needed until game ends
      const serverGameState = await wsClient.createGame(betAmount, clientSeed, gameHash);
      console.log('Game started:', serverGameState);

      // Apply returned game state immediately (server response includes requestId so it won't emit as a separate event)
      updateGameStateFromServer(serverGameState);
      // Refresh balance (bet was deducted off-chain)
      fetchBalance();
      return;
    } catch (error: any) {
      console.error('Failed to start game:', error);
      
      // Determine error type for better user feedback
      let errorMessage = 'An error occurred while starting the game';
      if (error?.message?.includes('Insufficient reserve')) {
        errorMessage = 'Insufficient balance in your reserve';
      } else if (error?.message?.includes('Game hash already used')) {
        errorMessage = 'Game hash already used. Please try again.';
      } else if (error?.message?.includes('transaction failed')) {
        errorMessage = 'Transaction failed. Please try again.';
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast.error('Failed to start game', {
        description: errorMessage
      });
      setGameState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [isConnected, address, wsConnected, wsClient, fetchBalance, updateGameStateFromServer]);

  // Note: Approval handling no longer needed since bets come from reserve

  // Handle player actions
  const handlePlayerAction = useCallback(async (action: Action) => {
    if (!gameState.currentGame || !wsClient || !wsConnected) return;

    try {
      // Send action to server
      const serverGameState = await wsClient.playerAction(gameState.currentGame.id, action);
      console.log('Player action processed:', serverGameState);
      updateGameStateFromServer(serverGameState);
      // If the server completed the game, refresh balance
      if (serverGameState?.status === 'completed') {
        fetchBalance();
      }
      return;
    } catch (error) {
      console.error('Failed to perform action:', error);
      toast.error('Failed to perform action');
    }
  }, [gameState.currentGame, wsClient, wsConnected, updateGameStateFromServer, fetchBalance]);

  // Transform GameResult[] to GameHistoryEntry[] for GameHistory component
  // Must be before any early returns to comply with Rules of Hooks
  const gameHistoryEntries = useMemo(() => {
    return gameState.history.map((result) => {
      // Determine overall result
      let gameResult: 'win' | 'loss' | 'push' | 'blackjack' = 'loss';
      if (result.isBlackjack) {
        gameResult = 'blackjack';
      } else if (result.payout > BigInt(0)) {
        gameResult = 'win';
      } else if (result.payout === BigInt(0) && result.playerHand.total === result.dealerHand.total) {
        gameResult = 'push';
      }

      // Convert Card[] to number[] (card value only)
      const playerCards = result.playerHand.cards.map(c => c.value);
      const dealerCards = result.dealerHand.cards.map(c => c.value);

      return {
        id: result.gameId,
        gameId: result.gameId,
        timestamp: result.timestamp,
        betAmount: result.playerHand.betAmount || BigInt(0),
        payout: result.payout,
        result: gameResult,
        playerHands: [{
          cards: playerCards,
          total: result.playerHand.total,
          result: gameResult,
          payout: result.payout
        }],
        dealerCards: dealerCards,
        dealerTotal: result.dealerHand.total,
        verified: false
      };
    });
  }, [gameState.history]);

  // Show intro screen
  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  const currentGame = gameState.currentGame;
  const isPlayerTurn = currentGame?.state === GameState.PLAYER_TURN;

  // Get the current active hand (for split scenarios, use the hand at currentHandIndex)
  const activeHand = currentGame?.playerHands && currentGame.playerHands.length > 0
    ? currentGame.playerHands[currentGame.currentHandIndex || 0]
    : currentGame?.playerHand;

  const canHit = currentGame?.state === GameState.PLAYER_TURN && activeHand && !activeHand.isBust;
  const canStand = currentGame?.state === GameState.PLAYER_TURN && activeHand && !activeHand.isBust;
  const canDoubleDown = currentGame?.state === GameState.PLAYER_TURN && activeHand && activeHand.cards.length === 2;

  // Can split when player has exactly 2 cards of the same value (only on first hand, not after split)
  const canSplit = currentGame?.state === GameState.PLAYER_TURN &&
    activeHand &&
    activeHand.cards.length === 2 &&
    activeHand.cards[0].value === activeHand.cards[1].value &&
    (!currentGame.playerHands || currentGame.playerHands.length <= 1); // Can't split again if already split

  return (
    <div className="min-h-screen overflow-x-hidden w-full"
      style={{
        background: 'linear-gradient(145deg, rgb(10, 15, 20), rgb(16, 26, 35))',
      }}
    >
      <MainNav
        onOpenDepositModal={handleOpenDepositModal}
        onOpenApprovalModal={() => setShowApprovalModal(true)}
        reserveBalance={offChainBalance}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      <main className="w-full max-w-full mx-0 px-2 sm:px-4 pt-16 pb-4 sm:pt-20 sm:pb-8 overflow-x-hidden">
        {/* View-specific content */}
        {currentView === 'game' && (
          <>
        {/* Game Table */}
        <div className="flex gap-1 pb-0">
          <div className="relative w-full">
            <BlackjackTable
              playerHand={currentGame?.playerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              playerHands={currentGame?.playerHands}
              currentHandIndex={currentGame?.currentHandIndex || 0}
              dealerHand={currentGame?.dealerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              gameState={currentGame?.state || GameState.WAITING}
              onAction={handlePlayerAction}
              canHit={canHit}
              canStand={canStand}
              canDoubleDown={canDoubleDown}
              canSplit={canSplit}
              reserveBalance={offChainBalance}
              usePLS={false}
              newCardIndices={newCardIndices}
              chipStack={chipStack}
              onClearBet={() => manageChipStack('', undefined, true)}
              onStartGame={() => handleStartGame(BigInt(totalBetAmount.toString() + '0'.repeat(18)), clientSeed)}
              isPlaying={gameState.isPlaying}
              onDealerRevealComplete={handleDealerRevealComplete}
              gameResult={currentGameResult}
              onChipAnimationComplete={handleChipAnimationComplete}
              history={gameState.history}
              onDoubleDownChips={handleDoubleDownChips}
              onSplitChips={handleSplitChips}
              onRebet={handleRebet}
              onHalfBet={handleHalfBet}
              onDoubleBet={handleDoubleBet}
              canDeal={!gameState.isPlaying && totalBetAmount > 0}
            />
          </div>
        </div>

        {/* Game Stats */}
        <div className="mt-6 sm:mt-6 grid grid-cols-4 md:grid-cols-4 gap-2 sm:gap-2 w-full">
          <div
            className="rounded-md p-6 gap-2 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl pb-6 font-bold text-purple-500">
              {gameState.history.length}
            </div>
            <div className="text-white/60 text-sm font-bold uppercase tracking-wider">Games Played</div>
          </div>
          <div
            className="rounded-md p-6 gap-2 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl pb-6 font-bold text-purple-500">
              {gameState.history.filter(r => r.payout > BigInt(0)).length}
            </div>
            <div className="text-white/60 text-sm font-bold uppercase tracking-wider">Games Won</div>
          </div>
          <div
            className="rounded-md p-6 gap-2 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl pb-6 font-bold text-purple-500">
              {gameState.history.filter(r => r.isBlackjack).length}
            </div>
            <div className="text-white/60 text-md font-bold uppercase tracking-wider">BJs</div>
          </div>
          <div
            className="rounded-md p-6 gap-2 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl pb-6 font-bold text-purple-500">
              {gameState.history.length > 0 ?
                ((gameState.history.filter(r => r.payout > BigInt(0)).length / gameState.history.length) * 100).toFixed(1) : '0.0'}%
            </div>
            <div className="text-white/60 text-sm font-bold uppercase tracking-wider">Win Rate</div>
          </div>
        </div>

        {/* Global Wins Feed */}
        <div
          className="mt-6 rounded-xl p-4 max-w-md mx-auto"
          style={{
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <GlobalWinsFeed
            wsClient={wsClient}
            wsConnected={wsConnected}
          />
        </div>

        {/* Betting Drawer - Always mounted to keep chart ref alive, hidden during player turn */}
        <div style={{ display: (!currentGame || !isPlayerTurn) ? 'block' : 'none' }}>
          <BettingDrawer
            onStartGame={handleStartGame}
            isPlaying={gameState.isPlaying}
            reserveBalance={offChainBalance}
            chartRef={chartRef}
            sessionStartTime={chartSessionStartTime.current}
            onBetAmountChange={manageChipStack}
            currentBetAmount={displayBetAmount}
            lastBetAmount={lastBetAmount}
            onRebet={handleRebet}
            onHalfBet={handleHalfBet}
            onDoubleBet={handleDoubleBet}
          />
        </div>

        {/* Deposit/Withdraw Modal (available on all views) */}
        <DepositWithdrawModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          onBalanceSync={syncBalance}
          contractReserve={playerReserve}
        />
          </>
        )}

        {/* Custom Approval Modal */}
        <CustomApprovalModal
          open={showApprovalModal}
          onOpenChange={setShowApprovalModal}
          onApprove={handleCustomApproval}
          isApproving={isApproving}
          tokenSymbol="MORBIUS"
          spenderName="Blackjack Game"
        />

        {currentView === 'history' && (
          <GameHistory history={gameHistoryEntries} />
        )}

        {currentView === 'stats' && (
          <div className="max-w-7xl mx-auto">
            {playerStatsLoading ? (
              <div className="text-center py-12 text-cyan-300">Loading player statistics...</div>
            ) : playerStats ? (
              <PlayerStatsDashboard stats={playerStats} isLoading={playerStatsLoading} />
            ) : (
              <div className="text-center py-12 text-cyan-300">No statistics available. Play some games to see your stats!</div>
            )}
          </div>
        )}

        {currentView === 'analytics' && (
          <div className="max-w-7xl mx-auto">
            {globalAnalyticsLoading ? (
              <div className="text-center py-12 text-cyan-300">Loading global analytics...</div>
            ) : globalAnalytics ? (
              <GlobalAnalyticsDashboard 
                analytics={globalAnalytics} 
                isLoading={globalAnalyticsLoading}
                onRefresh={() => {
                  refetchPlayerStats();
                  refetchGlobalAnalytics();
                }}
              />
            ) : (
              <div className="text-center py-12 text-cyan-300">No analytics available yet.</div>
            )}
          </div>
        )}

        {currentView === 'verify' && (
          <GameVerificationTools />
        )}

        {/* Provably Fair (Advanced) - Above Contract Addresses */}
        <div className="mt-12 mb-6 px-1">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setShowProvablyFairAdvanced(v => !v)}
              className="w-full flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300/60 hover:text-cyan-300 transition-colors mb-3"
            >
              <span>Provably Fair (Advanced)</span>
              <span aria-hidden className={`transition-transform ${showProvablyFairAdvanced ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {showProvablyFairAdvanced && (
              <div className="mt-3">
                <div className="text-[10px] text-cyan-300/40 text-center mb-2">
                  Optional. Leave blank to auto-generate a seed on "Deal Cards".
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="flex-1 px-3 py-2 text-center font-mono text-cyan-300 rounded border focus:outline-none"
                    style={{
                      background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
                      boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(60, 60, 60, 0.3)',
                    }}
                    placeholder="Client seed (optional)"
                  />
                  <button
                    type="button"
                    onClick={generateClientSeed}
                    className="w-10 h-10 rounded-lg font-black text-base transition-all active:scale-95"
                    title="Generate random client seed"
                    style={{
                      background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.18), rgba(8, 145, 178, 0.18))',
                      boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05)',
                      color: 'rgb(6, 182, 212)',
                      border: '1px solid rgba(6, 182, 212, 0.35)',
                    }}
                  >
                    ↻
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contract Addresses - Above Footer */}
        <div className="mt-6 mb-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          <ContractAddress address={MORBIUS_TOKEN_ADDRESS} label="MORBIUS Token" />
          <ContractAddress address={BLACKJACK_ADDRESS} label="Blackjack Contract" />
        </div>
      </main>

      <Footer />

      <style jsx global>{`
        .history-item-enter {
          animation: historyItemEnter 0.5s ease-out;
        }

        @keyframes historyItemEnter {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}