'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import BlackjackTable from '@/components/BLACKJACK/BlackjackTable';
import BettingPanel from '@/components/BLACKJACK/BettingPanel';
import MainNav from '@/components/BLACKJACK/MainNav';
import Footer from '@/components/BIG-WHEEL/Footer'; // Reuse footer
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import { GameHistory } from '@/components/BLACKJACK/GameHistory';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { GlobalAnalyticsDashboard } from '@/components/BLACKJACK/GlobalAnalyticsDashboard';
import { GameVerificationTools } from '@/components/BLACKJACK/GameVerificationTools';
import HistoryStrip from '@/components/BLACKJACK/HistoryStrip';
// Note: CustomApprovalModal no longer needed since bets come from reserve
import { ContractAddress } from '@/components/ui/contract-address';
import { Card, Hand, Game, GameState, Action, GameResult, GameStateUI } from './types';
import { ANIMATION_TIMINGS } from './constants';
// import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { BLACKJACK_ADDRESS } from '@/lib/contracts';
import { BlackjackWebSocketClient, GameState as ServerGameState } from '@/lib/websocket-client';
import { formatEther } from 'viem';
import { usePlayerStatsEnhanced, useGlobalAnalytics } from '@/hooks/use-blackjack-stats';

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
              className="absolute w-20 h-28 bg-white rounded-lg border-2 border-gray-300 shadow-lg"
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

  // Intro screen state
  const [showIntro, setShowIntro] = useState(true);

  // Contract hook
  const {
    playerReserve,
    deposit,
    depositMORBIUS,
    withdraw,
    refetchPlayerReserve
  } = useBlackjackContract();

  // Game state
  const [gameState, setGameState] = useState<GameStateUI>({
    balance: BigInt(0),
    currentGame: null,
    isPlaying: false,
    lastResult: null,
    history: [],
    clientSeed: ''
  });

  // Win notification state
  const [showWinNotification, setShowWinNotification] = useState(false);
  const [winAmount, setWinAmount] = useState<bigint>(BigInt(0));
  const [isBlackjackWin, setIsBlackjackWin] = useState(false);

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
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined,
    rank: playerStatsData.rank || 0
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

  // Mock data for dashboards (fallback/legacy)
  const mockPlayerStats = {
    totalGames: 1247,
    totalBet: 2500000000000000000000n, // 2500 PLS
    totalWin: 2375000000000000000000n, // 2375 PLS
    winRate: 48.2,
    blackjackCount: 87,
    currentStreak: 3,
    bestStreak: 12,
    biggestWin: 50000000000000000000n, // 50 PLS
    biggestLoss: 100000000000000000000n, // 100 PLS
    averageBet: 2000000000000000000n, // 2 PLS
    averagePayout: 1900000000000000000n, // 1.9 PLS
    profitLoss: -125000000000000000000n, // -125 PLS
    roi: -5.0,
    gamesToday: 23,
    gamesThisWeek: 156,
    favoriteBetAmount: 1000000000000000000n, // 1 PLS
    lastGameTimestamp: Date.now() - 3600000, // 1 hour ago
    rank: 42
  };

  const mockGlobalAnalytics = {
    totalPlayers: 15420,
    activePlayers: 1247,
    totalGamesPlayed: 892456,
    totalVolume: 150000000000000000000000n, // 150,000 PLS
    totalPayouts: 142500000000000000000000n, // 142,500 PLS
    houseProfit: 7500000000000000000000n, // 7,500 PLS
    gamesLastHour: 234,
    gamesLast24Hours: 5678,
    volumeLast24Hours: 25000000000000000000000n, // 25,000 PLS
    profitLast24Hours: 1250000000000000000000n, // 1,250 PLS
    averageWinRate: 48.7,
    averageBetSize: 168000000000000000n, // 0.168 PLS
    houseEdge: 5.0,
    peakConcurrentUsers: 892,
    serverUptime: 99.7,
    averageResponseTime: 45,
    errorRate: 0.02,
    activeConnections: 756,
    blackjackRate: 4.8,
    splitRate: 12.3,
    doubleDownRate: 23.7,
    surrenderRate: 0.0,
    reserveBalance: 50000000000000000000000n, // 50,000 PLS
    pendingSettlements: 12,
    failedSettlements: 2,
    averageSettlementTime: 3.2,
    highRollerCount: 23,
    suspiciousActivity: 0,
    largestBet: 1000000000000000000000n, // 1,000 PLS
    largestPayout: 1500000000000000000000n, // 1,500 PLS
  };

  const mockGameHistory = [
    {
      id: '1',
      gameId: 'game_123456',
      timestamp: Date.now() - 3600000,
      betAmount: 1000000000000000000n,
      payout: 2000000000000000000n,
      result: 'win' as const,
      playerHands: [{
        cards: [1, 10],
        total: 21,
        result: 'win' as const,
        payout: 2000000000000000000n
      }],
      dealerCards: [7, 9],
      dealerTotal: 16,
      verified: true
    },
    {
      id: '2',
      gameId: 'game_123455',
      timestamp: Date.now() - 7200000,
      betAmount: 2000000000000000000n,
      payout: 4000000000000000000n,
      result: 'win' as const,
      playerHands: [{
        cards: [10, 8],
        total: 18,
        result: 'win' as const,
        payout: 4000000000000000000n
      }],
      dealerCards: [9, 6],
      dealerTotal: 15,
      verified: true
    },
    {
      id: '3',
      gameId: 'game_123454',
      timestamp: Date.now() - 10800000,
      betAmount: 500000000000000000n,
      payout: 0n,
      result: 'loss' as const,
      playerHands: [{
        cards: [5, 7],
        total: 12,
        result: 'loss' as const,
        payout: 0n
      }],
      dealerCards: [10, 8],
      dealerTotal: 18,
      verified: true
    }
  ];

  // Note: Approval modal no longer needed since bets come from reserve
  // Keeping for potential future use
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingBet, setPendingBet] = useState<{ betAmount: bigint; clientSeed: string } | null>(null);

  // Custom approval handler (placeholder - not currently used)
  const handleCustomApproval = useCallback((amount: bigint) => {
    // Approval not needed for reserve-based system
    console.log('Approval requested for amount:', amount);
  }, []);

  // WebSocket client
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

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
      });

      client.on('game_updated', (gameState: ServerGameState) => {
        console.log('Game updated:', gameState);
        updateGameStateFromServer(gameState);
      });

      client.on('game_completed', (data: any) => {
        console.log('Game completed:', data);
        handleGameCompletion(data);
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

  // Convert server game state to local format
  const updateGameStateFromServer = useCallback((serverGameState: ServerGameState) => {
    const localGame: Game = {
      id: serverGameState.gameId,
      player: address!,
      betAmount: serverGameState.betAmount,
      state: serverGameState.status === 'player_turn' ? GameState.PLAYER_TURN :
             serverGameState.status === 'dealer_turn' ? GameState.DEALER_TURN :
             serverGameState.status === 'completed' ? GameState.COMPLETE : GameState.WAITING,
      playerHand: {
        cards: serverGameState.playerCards,
        total: serverGameState.playerTotal,
        hasAce: serverGameState.playerHasAce,
        isBlackjack: serverGameState.isBlackjack,
        isBust: serverGameState.playerTotal > 21
      },
      dealerHand: {
        cards: serverGameState.dealerCards,
        total: serverGameState.dealerTotal,
        hasAce: serverGameState.dealerHasAce,
        isBlackjack: false, // Dealer blackjack is checked differently
        isBust: serverGameState.dealerTotal > 21
      },
      payout: serverGameState.payout,
      timestamp: Date.now(),
      clientSeed: gameState.clientSeed
    };

    setGameState(prev => ({
      ...prev,
      currentGame: localGame,
      isPlaying: serverGameState.status !== 'completed'
    }));
  }, [address, gameState.clientSeed]);

  // Handle game completion
  const handleGameCompletion = useCallback((data: any) => {
    if (data.result === 'win' || data.result === 'blackjack') {
      setWinAmount(data.payout - data.betAmount);
      setIsBlackjackWin(data.result === 'blackjack');
      setShowWinNotification(true);
    }
  }, []);

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle deposit/withdraw modal
  const handleOpenDepositModal = useCallback(() => {
    setShowDepositModal(true);
  }, []);

  // Handle starting a new game
  const handleStartGame = useCallback(async (betAmount: bigint, clientSeed: string) => {
    console.log('Main handleStartGame called with:', { betAmount, clientSeed, isConnected, address });

    if (!wsConnected || !address) {
      console.log('Wallet not connected');
      toast.error('Please connect your wallet first');
      return;
    }

    // Note: No approval needed since bets come from MORBIUS reserve
    // In the future, this will call the server to start a game

    try {
      if (!wsClient || !wsConnected) {
        throw new Error('Not connected to game server');
      }

      setGameState(prev => ({ ...prev, isPlaying: true, clientSeed }));

      // Create game on server
      const serverGameState = await wsClient.createGame(betAmount, clientSeed);
      console.log('Game started:', serverGameState);

      // The game state will be updated via WebSocket events
      return;

      // Mock initial game state - in real implementation this would come from contract events
      const mockPlayerCards = [
        createCard(10, 'hearts'),
        createCard(1, 'spades')
      ];
      const mockDealerCards = [
        createCard(7, 'clubs'),
        createCard(1, 'diamonds', true) // Hidden
      ];

      const playerHand: Hand = {
        cards: mockPlayerCards,
        ...calculateHandTotal(mockPlayerCards),
        isBlackjack: false,
        isBust: false
      };

      const dealerHand: Hand = {
        cards: mockDealerCards,
        ...calculateHandTotal([mockDealerCards[0]]), // Don't count hidden card
        isBlackjack: false,
        isBust: false
      };

      const newGame: Game = {
        id: gameId,
        player: address,
        betAmount,
        state: GameState.PLAYER_TURN,
        playerHand,
        dealerHand,
        payout: BigInt(0),
        timestamp: Date.now(),
        clientSeed
      };

      setGameState(prev => ({
        ...prev,
        currentGame: newGame
      }));

      toast.success('Game started! Good luck!');
    } catch (error) {
      console.error('Failed to start game:', error);
      toast.error('Failed to start game');
      setGameState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [isConnected, address]);

  // Note: Approval handling no longer needed since bets come from reserve

  // Handle player actions
  const handlePlayerAction = useCallback(async (action: Action) => {
    if (!gameState.currentGame || !wsClient || !wsConnected) return;

    try {
      // Send action to server
      const serverGameState = await wsClient.playerAction(gameState.currentGame.id, action);
      console.log('Player action processed:', serverGameState);

      // The game state will be updated via WebSocket events
      return;

      // Mock game progression - in real implementation this would come from contract events
      if (action === Action.HIT) {
        const newCard = createCard(Math.floor(Math.random() * 13) + 1, 'hearts');
        const newCards = [...gameState.currentGame.playerHand.cards, newCard];
        const { total, hasAce } = calculateHandTotal(newCards);

        const updatedHand: Hand = {
          cards: newCards,
          total,
          hasAce,
          isBlackjack: total === 21 && newCards.length === 2,
          isBust: total > 21
        };

        setGameState(prev => ({
          ...prev,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            playerHand: updatedHand,
            state: updatedHand.isBust ? GameState.COMPLETE : GameState.PLAYER_TURN
          } : null
        }));
      } else if (action === Action.SPLIT) {
        // Split the hand into two separate hands
        const [card1, card2] = gameState.currentGame.playerHand.cards;
        const newCard1 = createCard(Math.floor(Math.random() * 13) + 1, 'hearts');
        const newCard2 = createCard(Math.floor(Math.random() * 13) + 1, 'diamonds');

        // For now, just continue with the first hand (simplified split logic)
        const firstHand: Hand = {
          cards: [card1, newCard1],
          ...calculateHandTotal([card1, newCard1]),
          isBlackjack: false,
          isBust: false
        };

        setGameState(prev => ({
          ...prev,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            playerHand: firstHand,
            state: GameState.PLAYER_TURN
          } : null
        }));

        toast.info('Hand split! Playing with first hand.');
      } else if (action === Action.DOUBLE_DOWN) {
        // Double down - double the bet and get exactly one more card
        const newCard = createCard(Math.floor(Math.random() * 13) + 1, 'hearts');
        const newCards = [...gameState.currentGame.playerHand.cards, newCard];
        const { total, hasAce } = calculateHandTotal(newCards);

        const updatedHand: Hand = {
          cards: newCards,
          total,
          hasAce,
          isBlackjack: false, // Can't be blackjack after doubling
          isBust: total > 21
        };

        setGameState(prev => ({
          ...prev,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            playerHand: updatedHand,
            state: GameState.DEALER_TURN // After doubling, dealer plays immediately
          } : null
        }));

        toast.info('Doubled down! Dealer\'s turn.');
      } else if (action === Action.STAND) {
        // Dealer turn
        setGameState(prev => ({
          ...prev,
          currentGame: prev.currentGame ? {
            ...prev.currentGame,
            state: GameState.DEALER_TURN
          } : null
        }));

        // Simulate dealer play
        setTimeout(() => {
          const dealerCards = gameState.currentGame!.dealerHand.cards.map(card =>
            card.hidden ? { ...card, hidden: false } : card
          );

          // Mock dealer hitting until 17
          let finalDealerCards = [...dealerCards];
          while (calculateHandTotal(finalDealerCards).total < 17) {
            const newCard = createCard(Math.floor(Math.random() * 13) + 1, 'diamonds');
            finalDealerCards.push(newCard);
          }

          const { total: dealerTotal, hasAce: dealerHasAce } = calculateHandTotal(finalDealerCards);
          const dealerHand: Hand = {
            cards: finalDealerCards,
            total: dealerTotal,
            hasAce: dealerHasAce,
            isBlackjack: dealerTotal === 21 && finalDealerCards.length === 2,
            isBust: dealerTotal > 21
          };

          const playerTotal = gameState.currentGame!.playerHand.total;
          let payout = BigInt(0);

          if (playerTotal > 21) {
            payout = BigInt(0); // Bust
          } else if (dealerTotal > 21) {
            payout = gameState.currentGame!.betAmount * BigInt(2); // Dealer bust
          } else if (playerTotal > dealerTotal) {
            payout = gameState.currentGame!.betAmount * BigInt(2); // Win
          } else if (playerTotal === dealerTotal) {
            payout = gameState.currentGame!.betAmount; // Push
          } else {
            payout = BigInt(0); // Loss
          }

          const isBlackjack = gameState.currentGame!.playerHand.isBlackjack;
          const isWin = payout > gameState.currentGame!.betAmount;

          setGameState(prev => ({
            ...prev,
            currentGame: prev.currentGame ? {
              ...prev.currentGame,
              dealerHand,
              payout,
              state: GameState.COMPLETE
            } : null,
            isPlaying: false,
            lastResult: {
              gameId: prev.currentGame!.id,
              playerHand: prev.currentGame!.playerHand,
              dealerHand,
              payout,
              isBlackjack,
              timestamp: Date.now()
            }
          }));

          // Show win notification
          if (isWin) {
            setWinAmount(payout - gameState.currentGame!.betAmount);
            setIsBlackjackWin(isBlackjack);
            setShowWinNotification(true);
            toast.success(`You won ${formatEther(payout - gameState.currentGame!.betAmount)} MORBIUS!`);
          } else if (payout === gameState.currentGame!.betAmount) {
            toast.info('Push - bet returned');
          } else {
            toast.error('Dealer wins');
          }
        }, ANIMATION_TIMINGS.DEALER_TURN_DELAY);
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
      toast.error('Failed to perform action');
    }
  }, [gameState.currentGame]);

  // Show intro screen
  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  const currentGame = gameState.currentGame;
  const isPlayerTurn = currentGame?.state === GameState.PLAYER_TURN;
  const canHit = currentGame?.state === GameState.PLAYER_TURN && !currentGame.playerHand.isBust;
  const canStand = currentGame?.state === GameState.PLAYER_TURN;
  const canDoubleDown = currentGame?.state === GameState.PLAYER_TURN && currentGame.playerHand.cards.length === 2;

  // Can split when player has exactly 2 cards of the same value
  const canSplit = currentGame?.state === GameState.PLAYER_TURN &&
    currentGame.playerHand.cards.length === 2 &&
    currentGame.playerHand.cards[0].value === currentGame.playerHand.cards[1].value;

  return (
    <div className="min-h-screen"
      style={{
        background: 'linear-gradient(145deg, rgb(10, 15, 20), rgb(16, 26, 35))',
      }}
    >
      <MainNav
        onOpenDepositModal={handleOpenDepositModal}
        reserveBalance={playerReserve}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      <main className="container mx-auto px-4 py-8">
        {/* View-specific content */}
        {currentView === 'game' && (
          <>
            <div className="text-center mb-8">
              <ContractAddress address={BLACKJACK_ADDRESS} label="Blackjack Contract" />
            </div>

        {/* Game History */}
        {gameState.history.length > 0 && (
          <HistoryStrip history={gameState.history} />
        )}

        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Left Panel - Betting or Action Controls */}
          <div className="lg:col-span-1">
            {currentGame && isPlayerTurn ? (
              /* Action Controls Panel */
              <div className="w-full max-w-md mx-auto space-y-4">
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div className="text-center mb-6">
                    <div className="text-2xl font-bold text-cyan-300 mb-2">Your Turn</div>
                    <div className="text-cyan-300/60 text-sm">Choose your action</div>
                  </div>

                  <div className="space-y-3">
                    {canHit && (
                      <button
                        onClick={() => handlePlayerAction(Action.HIT)}
                        className="w-full py-4 px-6 text-cyan-300 font-bold rounded-lg transition-all hover:scale-105 active:scale-95 text-lg"
                        style={{
                          background: 'linear-gradient(145deg, rgba(220, 38, 38, 0.8), rgba(185, 28, 28, 0.8))',
                          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                          border: '2px solid rgba(220, 38, 38, 0.5)',
                        }}
                      >
                        HIT
                      </button>
                    )}

                    {canStand && (
                      <button
                        onClick={() => handlePlayerAction(Action.STAND)}
                        className="w-full py-4 px-6 text-cyan-300 font-bold rounded-lg transition-all hover:scale-105 active:scale-95 text-lg"
                        style={{
                          background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))',
                          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                          border: '2px solid rgba(6, 182, 212, 0.5)',
                        }}
                      >
                        STAND
                      </button>
                    )}

                    {canDoubleDown && (
                      <button
                        onClick={() => handlePlayerAction(Action.DOUBLE_DOWN)}
                        className="w-full py-4 px-6 text-cyan-300 font-bold rounded-lg transition-all hover:scale-105 active:scale-95 text-lg"
                        style={{
                          background: 'linear-gradient(145deg, rgba(245, 158, 11, 0.8), rgba(217, 119, 6, 0.8))',
                          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                          border: '2px solid rgba(245, 158, 11, 0.5)',
                        }}
                      >
                        DOUBLE DOWN
                      </button>
                    )}

                    {canSplit && (
                      <button
                        onClick={() => handlePlayerAction(Action.SPLIT)}
                        className="w-full py-4 px-6 text-cyan-300 font-bold rounded-lg transition-all hover:scale-105 active:scale-95 text-lg"
                        style={{
                          background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8))',
                          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                          border: '2px solid rgba(16, 185, 129, 0.5)',
                        }}
                      >
                        SPLIT
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <BettingPanel
                onStartGame={handleStartGame}
                isPlaying={gameState.isPlaying}
                reserveBalance={playerReserve || BigInt(0)}
              />
            )}
          </div>

          {/* Game Table */}
          <div className="lg:col-span-2 flex">
              <BlackjackTable
                playerHand={currentGame?.playerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
                dealerHand={currentGame?.dealerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
                gameState={currentGame?.state || GameState.WAITING}
                onAction={handlePlayerAction}
                canHit={canHit}
                canStand={canStand}
                canDoubleDown={canDoubleDown}
                reserveBalance={playerReserve}
                usePLS={false}
              />
          </div>
        </div>

        {/* Game Stats */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl font-bold text-cyan-300">
              {gameState.history.length}
            </div>
            <div className="text-cyan-300/60 text-sm font-bold uppercase tracking-wider">Games Played</div>
          </div>
          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl font-bold text-green-400">
              {gameState.history.filter(r => r.payout > BigInt(0)).length}
            </div>
            <div className="text-cyan-300/60 text-sm font-bold uppercase tracking-wider">Games Won</div>
          </div>
          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl font-bold text-yellow-400">
              {gameState.history.filter(r => r.isBlackjack).length}
            </div>
            <div className="text-cyan-300/60 text-sm font-bold uppercase tracking-wider">Blackjacks</div>
          </div>
          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-2xl font-bold text-blue-400">
              {gameState.history.length > 0 ?
                ((gameState.history.filter(r => r.payout > BigInt(0)).length / gameState.history.length) * 100).toFixed(1) : '0.0'}%
            </div>
            <div className="text-cyan-300/60 text-sm font-bold uppercase tracking-wider">Win Rate</div>
          </div>
        </div>

        {/* Win Notification */}
        {showWinNotification && (
          <WinNotification
            amount={winAmount}
            isBlackjack={isBlackjackWin}
            onComplete={() => setShowWinNotification(false)}
          />
        )}

        {/* Deposit/Withdraw Modal (available on all views) */}
        <DepositWithdrawModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
        />
          </>
        )}

        {currentView === 'history' && (
          <GameHistory 
            games={gameState.history}
            onBack={() => setCurrentView('game')}
          />
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