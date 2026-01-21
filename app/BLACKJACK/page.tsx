'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { keccak256, toHex, encodePacked } from 'viem';
import BlackjackTable from '@/components/BLACKJACK/BlackjackTable';
import BettingPanel from '@/components/BLACKJACK/BettingPanel';
import MainNav from '@/components/BLACKJACK/MainNav';
import Footer from '@/components/BIG-WHEEL/Footer'; // Reuse footer
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { GameHistory } from '@/components/BLACKJACK/GameHistory';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { GlobalAnalyticsDashboard } from '@/components/BLACKJACK/GlobalAnalyticsDashboard';
import { GameVerificationTools } from '@/components/BLACKJACK/GameVerificationTools';
import HistoryStrip from '@/components/BLACKJACK/HistoryStrip';
import { ContractAddress } from '@/components/ui/contract-address';
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
  const publicClient = usePublicClient();

  // Intro screen state
  const [showIntro, setShowIntro] = useState(true);

  // Contract hook (for deposits/withdrawals only)
  const {
    deposit,
    depositMORBIUS,
    withdraw,
    playerReserve
  } = useBlackjackContract();

  // Off-chain balance state (like Stake.com)
  const [offChainBalance, setOffChainBalance] = useState<bigint>(BigInt(0));

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

    // Dealer cards are already "hidden" by the server (usually only 1 card until completion).
    const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
      ? serverGameState.dealerCards.map((c: any) => Number(c))
      : [];
    const dealerCards = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
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
  }, [address, gameState.clientSeed]);

  // Handle game completion
  const handleGameCompletion = useCallback((data: any) => {
    try {
      const payout: bigint =
        typeof data?.payout === 'bigint' ? data.payout : BigInt(String(data?.payout || '0'));
      const betAmount: bigint =
        typeof data?.betAmount === 'bigint' ? data.betAmount : BigInt(String(data?.betAmount || '0'));
      const profit: bigint = payout - betAmount;
      if (profit > BigInt(0)) {
        setWinAmount(profit);
        setIsBlackjackWin(data.result === 'blackjack');
        setShowWinNotification(true);
      }
    } catch {
      // ignore malformed payload
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
      toast.info('Preparing game...', { description: 'Getting server seed hash' });
      const { serverSeedHash, nonce } = await wsClient.getServerSeedHash();

      // Step 2: Generate game hash on frontend (for provably fair verification)
      // Match server format: `${serverSeed}:${clientSeed}:${nonce}:${betAmount}:${timestamp}`
      const timestamp = Math.floor(Date.now() / 1000);
      // Remove 0x prefix from serverSeedHash for hash calculation (server uses hex string without 0x)
      const serverSeedForHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash;
      const hashInput = `${serverSeedForHash}:${clientSeed}:${nonce}:${betAmount.toString()}:${timestamp}`;
      
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
      toast.info('Starting game...', { description: 'Creating game (off-chain)' });
      const serverGameState = await wsClient.createGame(betAmount, clientSeed, gameHash);
      console.log('Game started:', serverGameState);

      toast.success('Game started!', { description: 'Good luck!' });
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
        reserveBalance={offChainBalance}
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
                reserveBalance={offChainBalance}
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
                reserveBalance={offChainBalance}
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
          <GameHistory history={gameState.history as any} />
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