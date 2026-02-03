'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { GameVerificationTools, type GameVerificationData } from '@/components/BLACKJACK/GameVerificationTools';
import { ContractAddress } from '@/components/ui/contract-address';
import BlackjackRealTimeBetChart, { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart';
import BlackjackMobileActionBar from '@/components/BLACKJACK/BlackjackMobileActionBar';
import BlackjackSidebar from '@/components/BLACKJACK/BlackjackSidebar';
import { Card, Hand, Game, GameState, Action, GameResult, GameStateUI } from './types';
import { useTournament, TOURNAMENT_CONFIG } from '@/hooks/use-tournament';
import {
  TournamentEntry,
  TournamentHUD,
  TournamentLeaderboard,
  TournamentComplete,
  TournamentBetPanel,
  TournamentCreator,
  TournamentBrowser,
  TournamentPinEntry,
} from '@/components/BLACKJACK/Tournament';
import { CreateTournamentRequest } from '@/lib/tournament-types';
import { ANIMATION_TIMINGS, BET_LIMITS, BLACKJACK_DEPLOYER_WALLET, BLACKJACK_IMAGE_BACKGROUNDS, BLACKJACK_VIDEO_BACKGROUNDS, DEFAULT_BLACKJACK_IMAGE_ID, BlackjackImageId, BlackjackThemeKind, BlackjackVideoId } from './constants';
// import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useBlackjackContract, useWatchDeposits, useWatchDepositsMORBIUS, useWatchWithdrawals } from '@/hooks/use-blackjack-contract';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient, GameState as ServerGameState } from '@/lib/websocket-client';
import { formatEther, parseEther } from 'viem';
import { usePlayerStatsEnhanced, useGlobalAnalytics, usePlayerGames } from '@/hooks/use-blackjack-stats';
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

  // Provably Fair: client seed (optional, used when starting a game; UI is in sidebar tab)
  const [clientSeed, setClientSeed] = useState('');

  // Background preference state (persisted per wallet)
  const [theme, setTheme] = useState<BlackjackThemeKind>('video');
  const [imageSource, setImageSource] = useState<BlackjackImageId>(DEFAULT_BLACKJACK_IMAGE_ID);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [videoSource, setVideoSource] = useState<BlackjackVideoId>('glowingTable');
  const [videoSyncToClock, setVideoSyncToClock] = useState(true);
  const [videoPosition, setVideoPosition] = useState(50); // 0-100, used when sync to clock is off
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  const useVideoBackground = theme === 'video';

  const TABLE_PREFS_KEY = 'morb_blackjack_table';
  const validImageIds = useMemo(() => new Set(BLACKJACK_IMAGE_BACKGROUNDS.map((x) => x.id)), []);
  const validVideoIds = useMemo(() => new Set(BLACKJACK_VIDEO_BACKGROUNDS.map((x) => x.id)), []);

  // Load table background preference for this wallet
  useEffect(() => {
    if (!address || typeof window === 'undefined') return;
    const key = `${TABLE_PREFS_KEY}_${address.toLowerCase()}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const prefs = JSON.parse(raw) as { theme?: string; imageSource?: string; videoSource?: string };
      if (prefs.theme === 'image' || prefs.theme === 'video') setTheme(prefs.theme);
      if (prefs.imageSource && validImageIds.has(prefs.imageSource as BlackjackImageId)) {
        setImageSource(prefs.imageSource as BlackjackImageId);
      }
      if (prefs.videoSource && validVideoIds.has(prefs.videoSource as BlackjackVideoId)) {
        setVideoSource(prefs.videoSource as BlackjackVideoId);
      }
    } catch {
      // ignore invalid stored prefs
    }
  }, [address, validImageIds, validVideoIds]);

  // Persist table background preference when it changes
  useEffect(() => {
    if (!address || typeof window === 'undefined') return;
    const key = `${TABLE_PREFS_KEY}_${address.toLowerCase()}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ theme, imageSource, videoSource })
      );
    } catch {
      // ignore quota / private mode
    }
  }, [address, theme, imageSource, videoSource]);

  const handleVideoSourceChange = useCallback((id: BlackjackVideoId) => {
    setVideoSource(id);
    toast.info('Video background updated.');
  }, []);

  // Splash screen dismissal state
  const [splashDismissed, setSplashDismissed] = useState(false);

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
    playerReserve,
    refetchPlayerReserve
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
      // Check if adding this chip would exceed MAX_BET
      setChipStack(prev => {
        const currentTotal = prev.reduce((sum, chip) => sum + chip, 0);
        const newTotal = currentTotal + chipValue;
        // Convert to wei: chip values are in MORBIUS, need to add 18 decimals
        const newTotalWei = BigInt(newTotal.toString() + '0'.repeat(18));
        
        if (newTotalWei > BET_LIMITS.MAX_BET) {
          const currentTotalWei = BigInt(currentTotal.toString() + '0'.repeat(18));
          const currentMorbius = Number(formatEther(currentTotalWei));
          toast.error('Bet limit exceeded', {
            description: `Maximum bet is 100,000 MORBIUS. Current bet: ${currentMorbius.toFixed(0)} MORBIUS`
          });
          return prev; // Don't add the chip
        }
        
        // Adding a chip to the stack
        return [...prev, chipValue];
      });
    }
  }, []);

  // Calculate total bet amount from chip stack
  const totalBetAmount = chipStack.reduce((sum, chip) => sum + chip, 0);
  const displayBetAmount = totalBetAmount > 0 ? formatEther(BigInt(totalBetAmount.toString() + '0'.repeat(18))) : '0';

  // Rebet: restore last bet amount
  const handleRebet = useCallback(() => {
    const lastBet = parseFloat(lastBetAmount);
    if (lastBet > 0) {
      // Check if rebet would exceed MAX_BET
      const lastBetWei = BigInt(lastBet.toString() + '0'.repeat(18));
      if (lastBetWei > BET_LIMITS.MAX_BET) {
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is 100,000 MORBIUS. Cannot rebet ${lastBet} MORBIUS`
        });
        return;
      }
      
      // Convert lastBetAmount to chip stack
      // Use optimal chip breakdown
      const chips: number[] = [];
      let remaining = lastBet;
      const chipValues = [100000, 10000, 2500, 1000, 500];
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
        const chipValues = [100000, 10000, 2500, 1000, 500];
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
      const doubleAmountWei = BigInt(doubleAmount.toString() + '0'.repeat(18));
      
      // Check if doubling would exceed MAX_BET
      if (doubleAmountWei > BET_LIMITS.MAX_BET) {
        const currentMorbius = Number(formatEther(BigInt(totalBetAmount.toString() + '0'.repeat(18))));
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is 100,000 MORBIUS. Cannot double bet of ${currentMorbius.toFixed(0)} MORBIUS`
        });
        return;
      }
      
      // Rebuild chip stack for double amount
      const chips: number[] = [];
      let remaining = doubleAmount;
      const chipValues = [100000, 10000, 2500, 1000, 500];
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
  // Clear chips on loss AFTER animation completes (chips stay on win/blackjack/push)
  const handleChipAnimationComplete = useCallback(() => {
    // Clear chips on loss after animation completes
    // Use ref to avoid stale closure issues
    if (chipResultRef.current === 'loss') {
      manageChipStack('', undefined, true);
      chipResultRef.current = null; // Reset ref
    }
    setCurrentGameResult(null);
  }, [manageChipStack]);

  // Double down chips: add chips only for the current hand's bet
  // If split, only add chips for half the stack (current hand)
  // If not split, double the entire stack
  const handleDoubleDownChips = useCallback(() => {
    const currentGame = currentGameRef.current;
    const isSplit = currentGame?.playerHands && currentGame.playerHands.length > 1;

    setChipStack(prev => {
      // Calculate chips to add: if split, only add for current hand (half); if not split, add all
      const chipsToAdd = isSplit
        ? prev.slice(0, Math.ceil(prev.length / 2)) // Only current hand's chips
        : prev; // All chips

      const currentTotal = prev.reduce((sum, chip) => sum + chip, 0);
      const addAmount = chipsToAdd.reduce((sum, chip) => sum + chip, 0);
      const newTotal = currentTotal + addAmount;
      const newTotalWei = BigInt(newTotal.toString() + '0'.repeat(18));

      // Check if doubling would exceed MAX_BET
      if (newTotalWei > BET_LIMITS.MAX_BET) {
        const currentMorbius = Number(formatEther(BigInt(currentTotal.toString() + '0'.repeat(18))));
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is 100,000 MORBIUS. Cannot double down bet of ${currentMorbius.toFixed(0)} MORBIUS`
        });
        return prev; // Don't double
      }

      return [...prev, ...chipsToAdd];
    });
  }, []);

  // Split chips: duplicate the chip stack for the second hand
  const handleSplitChips = useCallback(() => {
    setChipStack(prev => {
      const currentTotal = prev.reduce((sum, chip) => sum + chip, 0);
      const doubleAmount = currentTotal * 2;
      const doubleAmountWei = BigInt(doubleAmount.toString() + '0'.repeat(18));
      
      // Check if splitting would exceed MAX_BET
      if (doubleAmountWei > BET_LIMITS.MAX_BET) {
        const currentMorbius = Number(formatEther(BigInt(currentTotal.toString() + '0'.repeat(18))));
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is 100,000 MORBIUS. Cannot split bet of ${currentMorbius.toFixed(0)} MORBIUS`
        });
        return prev; // Don't split
      }
      
      return [...prev, ...prev];
    });
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

  // Ref to track current game for callbacks that can't access gameState directly
  const currentGameRef = useRef<Game | null>(null);
  useEffect(() => {
    currentGameRef.current = gameState.currentGame;
  }, [gameState.currentGame]);

  // WebSocket client (declare before fetchBalance/syncBalance)
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Tournament mode state
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [showTournamentEntry, setShowTournamentEntry] = useState(false);
  const [showTournamentComplete, setShowTournamentComplete] = useState(false);

  // Tournament creator/browser state
  const [showTournamentBrowser, setShowTournamentBrowser] = useState(false);
  const [showTournamentCreator, setShowTournamentCreator] = useState(false);
  const [showTournamentPinEntry, setShowTournamentPinEntry] = useState(false);
  const [pendingJoinTournamentId, setPendingJoinTournamentId] = useState<string | null>(null);

  // Tournament hook
  const tournament = useTournament({
    wsClient,
    onBusted: () => {
      setShowTournamentComplete(true);
      toast.error('Tournament Busted! Your chips ran out.');
    },
    onCompleted: (finalChips, rank) => {
      setShowTournamentComplete(true);
      toast.success(`Tournament Complete! Final rank: #${rank}`);
    },
    onLeaderboardUpdate: (leaderboard) => {
      console.log('Leaderboard updated:', leaderboard);
    },
  });

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
      
      // Also refetch contract reserve to ensure it's in sync
      if (refetchPlayerReserve) {
        await refetchPlayerReserve();
      }
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, [wsClient, wsConnected, refetchPlayerReserve]);

  // Win notification state
  const [showWinNotification, setShowWinNotification] = useState(false);
  const [winAmount, setWinAmount] = useState<bigint>(BigInt(0));
  const [isBlackjackWin, setIsBlackjackWin] = useState(false);

  // Pending win data (waits for dealer reveal to complete)
  const [pendingWinData, setPendingWinData] = useState<{ amount: bigint; isBlackjack: boolean } | null>(null);

  // Pending game result for chip animation (waits for dealer reveal to complete)
  const [pendingChipResult, setPendingChipResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | null>(null);
  // Ref to track result for chip clearing after animation
  const chipResultRef = useRef<'win' | 'loss' | 'push' | 'blackjack' | null>(null);

  // Note: Payment method state no longer needed since only MORBIUS from reserve

  // Deposit/Withdraw modal state
  const [showDepositModal, setShowDepositModal] = useState(false);

  // View state
  const [currentView, setCurrentView] = useState<'game' | 'history' | 'stats' | 'analytics' | 'verify'>('game');
  // When user clicks "Verify Game" in History, open Verify tab with this game ID pre-filled
  const [initialVerifyGameId, setInitialVerifyGameId] = useState<string | null>(null);

  const isDeployer = Boolean(
    address && BLACKJACK_DEPLOYER_WALLET && address.toLowerCase() === BLACKJACK_DEPLOYER_WALLET
  );

  // If non-deployer has analytics view open (e.g. from before), switch to game
  useEffect(() => {
    if (currentView === 'analytics' && !isDeployer) {
      setCurrentView('game');
    }
  }, [currentView, isDeployer]);

  // Fetch real analytics data
  const { data: playerStatsData, isLoading: playerStatsLoading, refetch: refetchPlayerStats, error: playerStatsError } = usePlayerStatsEnhanced();
  const { data: globalAnalyticsData, isLoading: globalAnalyticsLoading, refetch: refetchGlobalAnalytics, error: globalAnalyticsError } = useGlobalAnalytics();
  
  // Fetch player game history from database
  const { data: playerGamesData, isLoading: playerGamesLoading } = usePlayerGames(50, 0);

  // Transform player stats data to match component interface
  const playerStats = playerStatsData ? {
    totalGames: Number(playerStatsData.total_games) || 0,
    totalBet: playerStatsData.total_bet || BigInt(0),
    totalWin: playerStatsData.total_win || BigInt(0),
    winRate: Number(playerStatsData.win_rate) || 0,
    blackjackCount: Number(playerStatsData.blackjack_count) || 0,
    currentStreak: Number(playerStatsData.current_streak) || 0,
    bestStreak: Number(playerStatsData.best_streak) || 0,
    biggestWin: playerStatsData.biggest_win || BigInt(0),
    biggestLoss: playerStatsData.biggest_loss || BigInt(0),
    averageBet: Number(playerStatsData.average_bet) || 0,
    averagePayout: Number(playerStatsData.average_payout) || 0,
    profitLoss: Number(formatEther(playerStatsData.profit_loss || BigInt(0))),
    roi: Number(playerStatsData.roi) || 0,
    gamesToday: Number(playerStatsData.games_today) || 0,
    gamesThisWeek: Number(playerStatsData.games_this_week) || 0,
    favoriteBetAmount: Number(formatEther(playerStatsData.favorite_bet_amount || BigInt(0))),
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined
  } : null;

  // Transform global analytics data to match component interface
  const globalAnalytics = globalAnalyticsData ? {
    totalPlayers: Number(globalAnalyticsData.total_players) || 0,
    activePlayers: Number(globalAnalyticsData.active_players) || 0,
    totalGamesPlayed: Number(globalAnalyticsData.total_games_played) || 0,
    totalVolume: globalAnalyticsData.total_volume || BigInt(0),
    totalPayouts: globalAnalyticsData.total_payouts || BigInt(0),
    houseProfit: globalAnalyticsData.house_profit || BigInt(0),
    gamesLastHour: Number(globalAnalyticsData.games_last_hour) || 0,
    gamesLast24Hours: Number(globalAnalyticsData.games_last_24_hours) || 0,
    volumeLast24Hours: globalAnalyticsData.volume_last_24_hours || BigInt(0),
    profitLast24Hours: globalAnalyticsData.profit_last_24_hours || BigInt(0),
    averageWinRate: Number(globalAnalyticsData.average_win_rate) || 0,
    averageBetSize: Number(globalAnalyticsData.average_bet_size) || 0,
    houseEdge: Number(globalAnalyticsData.house_edge) || 0,
    peakConcurrentUsers: 0, // Not available from database
    serverUptime: 0, // Not available from database
    averageResponseTime: 0, // Not available from database
    errorRate: 0, // Not available from database
    activeConnections: Number(globalAnalyticsData.active_connections) || 0,
    blackjackRate: Number(globalAnalyticsData.blackjack_rate) || 0,
    splitRate: Number(globalAnalyticsData.split_rate) || 0,
    doubleDownRate: Number(globalAnalyticsData.double_down_rate) || 0,
    surrenderRate: Number(globalAnalyticsData.surrender_rate) || 0,
    reserveBalance: playerReserve || BigInt(0), // From contract
    pendingSettlements: Number(globalAnalyticsData.pending_settlements) || 0,
    failedSettlements: Number(globalAnalyticsData.failed_settlements) || 0,
    averageSettlementTime: 0, // Not available from database yet
    highRollerCount: 0, // Not available from database yet
    suspiciousActivity: 0, // Not available from database yet
    largestBet: globalAnalyticsData.largest_bet || BigInt(0),
    largestPayout: globalAnalyticsData.largest_payout || BigInt(0)
  } : null;

  // Debug: Log errors and data (moved after variable declarations)
  useEffect(() => {
    if (playerStatsError) {
      console.error('Player stats error:', playerStatsError);
    }
    if (globalAnalyticsError) {
      console.error('Global analytics error:', globalAnalyticsError);
    }
    if (globalAnalyticsData) {
      console.log('Global analytics data received:', globalAnalyticsData);
    }
    if (globalAnalytics) {
      console.log('Global analytics transformed:', globalAnalytics);
    }
  }, [playerStatsError, globalAnalyticsError, globalAnalyticsData, globalAnalytics]);

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

  // Watch for deposit/withdrawal events to update balance immediately
  // Callbacks must be wrapped in useCallback to maintain hook order
  const handleDepositEvent = useCallback((player: string, morbiusAmount: bigint, plsAmount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      console.log('Deposit event detected, syncing balance...', { player, morbiusAmount });
      // Immediately sync balance after deposit
      syncBalance();
    }
  }, [address, syncBalance]);

  const handleDepositMORBIUSEvent = useCallback((player: string, amount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      console.log('MORBIUS deposit event detected, syncing balance...', { player, amount });
      // Immediately sync balance after deposit
      syncBalance();
    }
  }, [address, syncBalance]);

  const handleWithdrawalEvent = useCallback((player: string, amount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      console.log('Withdrawal event detected, syncing balance...', { player, amount });
      // Immediately sync balance after withdrawal
      syncBalance();
    }
  }, [address, syncBalance]);

  // Listen for deposit events (PLS deposits)
  useWatchDeposits(handleDepositEvent);

  // Listen for MORBIUS deposit events
  useWatchDepositsMORBIUS(handleDepositMORBIUSEvent);

  // Listen for withdrawal events
  useWatchWithdrawals(handleWithdrawalEvent);


  // Initialize WebSocket connection
  // Track the address the current WebSocket is connected with
  const wsAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) return;

    // If address changed and we have an existing client, disconnect it first
    if (wsClient && address && wsAddressRef.current !== address.toLowerCase()) {
      console.log('Wallet changed, disconnecting old WebSocket...', {
        oldAddress: wsAddressRef.current,
        newAddress: address.toLowerCase()
      });
      wsClient.disconnect();
      setWsClient(null);
      setWsConnected(false);
      setOffChainBalance(BigInt(0)); // Reset balance when switching wallets
      wsAddressRef.current = null;
      // Return early - the next render will create a new client since wsClient will be null
      return;
    }

    if (address && !wsClient) {
      // Normalize address to lowercase for consistency
      const normalizedAddress = address.toLowerCase();
      wsAddressRef.current = normalizedAddress;
      const client = new BlackjackWebSocketClient(
        wsUrl,
        normalizedAddress
      );

      // Set up event handlers
      client.on('game_created', (gameState: ServerGameState) => {
        console.log('Game created:', gameState);
        // Update local game state and get the processed game
        const processedGame = updateGameStateFromServer(gameState);
        // Some games can complete immediately on deal (blackjack/push/dealer blackjack).
        // The server does not emit a separate game_completed event for create_game, so handle it here.
        if (String((gameState as any)?.status) === 'completed' && processedGame) {
          const betAmount = processedGame.totalBetAmount ?? BigInt(0);
          const payout = processedGame.totalPayout ?? BigInt(0);
          const hasWin = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.every((h: any) => h.result === 'push');
          const isBlackjack = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'blackjack');
          const overallResult = isBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';
          
          handleGameCompletion({
            gameId: processedGame.id,
            betAmount,
            payout,
            result: overallResult,
            processedGame: processedGame // Pass the processed game with cards already extracted
          });
        }
      });

      client.on('game_updated', (gameState: ServerGameState) => {
        // Update game state and get the processed localGame
        const processedGame = updateGameStateFromServer(gameState);
        
        // If game is completed, handle completion with the processed game data
        if ((gameState as any)?.status === 'completed' && processedGame) {
          const betAmount = processedGame.totalBetAmount ?? BigInt(0);
          const payout = processedGame.totalPayout ?? BigInt(0);
          const hasWin = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.every((h: any) => h.result === 'push');
          const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';
          const isBlackjack = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'blackjack');
          
          console.log('Game completed in game_updated handler:', {
            gameId: processedGame.id,
            playerHands: processedGame.playerHands,
            dealerHand: processedGame.dealerHand,
            betAmount: betAmount.toString(),
            payout: payout.toString()
          });
          
          handleGameCompletion({
            gameId: processedGame.id,
            betAmount,
            payout,
            result: isBlackjack ? 'blackjack' : overallResult,
            processedGame: processedGame // Pass the processed game with cards already extracted
          });
          // Refresh balance after game completes
          fetchBalance();
        }
      });

      client.on('game_completed', (data: any) => {
        console.log('Game completed event received:', data);
        // Don't handle here - we already handle it in game_updated when status is 'completed'
        // This event is just for notification purposes, the actual data comes from game_updated
        // Refresh balance after game completes
        fetchBalance();
      });

      client.on('error', (error: any) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
        toast.error(error.message || 'Connection error');
      });

      // Connect
      client.connect()
        .then(() => {
          setWsConnected(true);
          setWsClient(client);
          console.log('Connected to blackjack server');
          // Fetch initial balance
          fetchBalance();
        })
        .catch((error) => {
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
  }, [address, wsClient]);

  // Fetch balance when WebSocket connects
  useEffect(() => {
    if (wsConnected && wsClient) {
      fetchBalance();
    }
  }, [wsConnected, wsClient, fetchBalance]);

  // Load game history from database when wallet connects
  useEffect(() => {
    if (!address || !playerGamesData || !Array.isArray(playerGamesData)) return;

    // Convert database Game[] to GameResult[] format
    const loadHistoryFromDatabase = async () => {
      const API_BASE_URL = getApiUrlOptional();
      if (!API_BASE_URL) return;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:loadHistoryFromDatabase:start',message:'loadHistoryFromDatabase',data:{playerGamesDataLength:playerGamesData.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      const completedGames = playerGamesData.filter((game: any) => game.result && game.result !== 'ongoing' && game.completed_at);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:loadHistoryFromDatabase:filter',message:'completed games count',data:{completedCount:completedGames.length,totalGames:playerGamesData.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      // Fetch game hands for all games in parallel
      const gamesWithHands = await Promise.all(
        completedGames
          .map(async (game: any) => {
            try {
              // Fetch game hands for this game
              const handsResponse = await fetch(`${API_BASE_URL}/api/game/${game.id}/hands`);
              const handsData = handsResponse.ok ? await handsResponse.json() : [];
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:loadHistoryFromDatabase:handsFetch',message:'hands fetch per game',data:{gameId:game.id,ok:handsResponse.ok,handsCount:Array.isArray(handsData)?handsData.length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
              // #endregion
              return { game, hands: Array.isArray(handsData) ? handsData : [] };
            } catch (error) {
              console.error(`Failed to fetch hands for game ${game.id}:`, error);
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:loadHistoryFromDatabase:handsFetchError',message:'hands fetch failed',data:{gameId:game.id,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
              // #endregion
              return { game, hands: [] };
            }
          })
      );

      const databaseHistory: GameResult[] = gamesWithHands
        .map(({ game, hands }) => {
          const gameId = game.id;
          const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
          const suitFor = (idx: number) => {
            const salt = gameId.length;
            return suits[(idx + salt) % suits.length];
          };
          const toCard = (value: number, idx: number): Card =>
            createCard(Number(value), suitFor(idx), false);

          // Dealer cards
          const dealerCards: Card[] = Array.isArray(game.dealer_cards)
            ? game.dealer_cards.map((c: any, idx: number) => toCard(Number(c), 100 + idx))
            : [];
          const dealerTotals = calculateHandTotal(dealerCards);
          const dealerHand: Hand = {
            id: `${gameId}-dealer`,
            cards: dealerCards,
            total: game.dealer_total ?? dealerTotals.total,
            hasAce: dealerTotals.hasAce,
            isBlackjack: false,
            isBust: (game.dealer_total ?? dealerTotals.total) > 21,
            betAmount: BigInt(0),
            payout: BigInt(0),
            actions: Array.isArray(game.dealer_actions) ? game.dealer_actions : [],
            canHit: false,
            canStand: false,
            canDoubleDown: false,
            canSplit: false,
          };

          // Build all player hands (for split support)
          const playerHandsFromDb: Hand[] = hands.length > 0
            ? hands.map((firstHand: any, handIdx: number) => {
                const playerCards: Card[] = Array.isArray(firstHand.cards)
                  ? firstHand.cards.map((c: any, idx: number) => toCard(Number(c), handIdx * 10 + idx))
                  : [];
                const playerTotals = calculateHandTotal(playerCards);
                return {
                  id: firstHand?.id || `${gameId}-hand-${handIdx}`,
                  cards: playerCards,
                  total: firstHand?.total ?? playerTotals.total ?? 0,
                  hasAce: firstHand?.has_ace ?? playerTotals.hasAce ?? false,
                  isBlackjack: firstHand?.is_blackjack ?? (game.result === 'blackjack' && handIdx === 0),
                  isBust: firstHand?.is_bust ?? false,
                  betAmount: BigInt(String(firstHand?.bet_amount || game.total_bet_amount || '0')),
                  payout: BigInt(String(firstHand?.payout || '0')),
                  result: firstHand?.result ||
                    (game.result === 'blackjack' ? 'blackjack' :
                     game.result === 'win' ? 'win' :
                     game.result === 'push' ? 'push' : 'loss'),
                  actions: Array.isArray(firstHand?.actions) ? firstHand.actions : [],
                  canHit: false,
                  canStand: false,
                  canDoubleDown: false,
                  canSplit: false,
                };
              })
            : [];

          const wasSplit = playerHandsFromDb.length > 1;
          const wasDoubleDown = playerHandsFromDb.some((h: Hand) =>
            Array.isArray(h.actions) && h.actions.some((a: any) => a.type === 'double_down'));

          // First hand for backward compat (playerHand)
          const firstHand = hands.length > 0 ? hands[0] : null;
          const singleHandCards: Card[] = firstHand && Array.isArray(firstHand.cards)
            ? firstHand.cards.map((c: any, idx: number) => toCard(Number(c), idx))
            : [];
          const singleHandTotals = calculateHandTotal(singleHandCards);
          const playerHand: Hand = playerHandsFromDb.length > 0
            ? playerHandsFromDb[0]
            : {
                id: firstHand?.id || `${gameId}-hand-0`,
                cards: singleHandCards,
                total: firstHand?.total ?? singleHandTotals.total ?? 0,
                hasAce: firstHand?.has_ace ?? singleHandTotals.hasAce ?? false,
                isBlackjack: firstHand?.is_blackjack ?? game.result === 'blackjack',
                isBust: firstHand?.is_bust ?? false,
                betAmount: firstHand ? BigInt(String(firstHand.bet_amount || '0')) : BigInt(String(game.total_bet_amount || '0')),
                payout: firstHand ? BigInt(String(firstHand.payout || '0')) : BigInt(String(game.total_payout || '0')),
                result: firstHand?.result ||
                  (game.result === 'blackjack' ? 'blackjack' :
                   game.result === 'win' ? 'win' :
                   game.result === 'push' ? 'push' : 'loss'),
                actions: Array.isArray(firstHand?.actions) ? firstHand.actions : Array.isArray(game.actions) ? game.actions : [],
                canHit: false,
                canStand: false,
                canDoubleDown: false,
                canSplit: false,
              };

          return {
            gameId,
            playerHand,
            dealerHand,
            payout: BigInt(String(game.total_payout || '0')),
            isBlackjack: game.result === 'blackjack',
            timestamp: game.completed_at ? new Date(game.completed_at).getTime() : Date.now(),
            ...(playerHandsFromDb.length > 0 && { playerHands: playerHandsFromDb }),
            ...(wasSplit && { wasSplit: true }),
            ...(wasDoubleDown && { wasDoubleDown: true }),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:loadHistoryFromDatabase:done',message:'databaseHistory built',data:{databaseHistoryLength:databaseHistory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      // Merge with existing in-memory history, avoiding duplicates
      setGameState(prev => {
        const existingGameIds = new Set(prev.history.map(h => h.gameId));
        const newHistory = databaseHistory.filter(h => !existingGameIds.has(h.gameId));
        
        // Combine: new from database + existing in-memory, sorted by timestamp
        const combined = [...newHistory, ...prev.history]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50); // Keep last 50 games

        // Persist to localStorage as backup (keyed by wallet address)
        if (address && typeof window !== 'undefined') {
          try {
            const storageKey = `blackjack_history_${address.toLowerCase()}`;
            const historyToStore = combined.map(result => ({
              gameId: result.gameId,
              playerHand: {
                id: result.playerHand.id,
                cards: result.playerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.playerHand.total,
                hasAce: result.playerHand.hasAce,
                isBlackjack: result.playerHand.isBlackjack,
                isBust: result.playerHand.isBust,
                betAmount: result.playerHand.betAmount.toString(),
                payout: result.playerHand.payout.toString(),
                result: result.playerHand.result,
                actions: result.playerHand.actions,
              },
              dealerHand: {
                id: result.dealerHand.id,
                cards: result.dealerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.dealerHand.total,
                hasAce: result.dealerHand.hasAce,
                isBlackjack: result.dealerHand.isBlackjack,
                isBust: result.dealerHand.isBust,
                betAmount: result.dealerHand.betAmount.toString(),
                payout: result.dealerHand.payout.toString(),
                actions: result.dealerHand.actions,
              },
              payout: result.payout.toString(),
              isBlackjack: result.isBlackjack,
              timestamp: result.timestamp,
              ...(result.playerHands && { playerHands: result.playerHands.map((h: Hand) => ({
                id: h.id,
                cards: h.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: h.total,
                hasAce: h.hasAce,
                isBlackjack: h.isBlackjack,
                isBust: h.isBust,
                betAmount: h.betAmount.toString(),
                payout: h.payout.toString(),
                result: h.result,
                actions: h.actions,
              })) }),
              ...(result.wasSplit && { wasSplit: true }),
              ...(result.wasDoubleDown && { wasDoubleDown: true }),
            }));
            localStorage.setItem(storageKey, JSON.stringify(historyToStore));
          } catch (error) {
            console.error('Failed to save history to localStorage:', error);
          }
        }

        return {
          ...prev,
          history: combined,
        };
      });
    };

    loadHistoryFromDatabase();
  }, [address, playerGamesData]);

  // Load history from localStorage on mount (as backup/fallback)
  useEffect(() => {
    if (!address || typeof window === 'undefined') return;

    try {
      const storageKey = `blackjack_history_${address.toLowerCase()}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const parsedHistory: GameResult[] = parsed.map((result: any) => {
          const gameId = result.gameId;
          const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
          const suitFor = (idx: number) => {
            const salt = gameId.length;
            return suits[(idx + salt) % suits.length];
          };
          
          // Convert stored card data back to Card objects
          const playerCards: Card[] = Array.isArray(result.playerHand?.cards)
            ? result.playerHand.cards.map((c: any, idx: number) => {
                if (typeof c === 'object' && 'value' in c) {
                  return createCard(c.value, c.suit || suitFor(idx), false);
                }
                return createCard(Number(c), suitFor(idx), false);
              })
            : [];
          
          const dealerCards: Card[] = Array.isArray(result.dealerHand?.cards)
            ? result.dealerHand.cards.map((c: any, idx: number) => {
                if (typeof c === 'object' && 'value' in c) {
                  return createCard(c.value, c.suit || suitFor(100 + idx), false);
                }
                return createCard(Number(c), suitFor(100 + idx), false);
              })
            : [];
          
          const playerTotals = calculateHandTotal(playerCards);
          const dealerTotals = calculateHandTotal(dealerCards);
          
          return {
            gameId: result.gameId,
            playerHand: {
              id: result.playerHand?.id || `${gameId}-hand-0`,
              cards: playerCards,
              total: result.playerHand?.total ?? playerTotals.total ?? 0,
              hasAce: result.playerHand?.hasAce ?? playerTotals.hasAce ?? false,
              isBlackjack: result.playerHand?.isBlackjack ?? result.isBlackjack ?? false,
              isBust: result.playerHand?.isBust ?? false,
              betAmount: BigInt(result.playerHand?.betAmount || '0'),
              payout: BigInt(result.playerHand?.payout || '0'),
              result: result.playerHand?.result,
              actions: Array.isArray(result.playerHand?.actions) ? result.playerHand.actions : [],
              canHit: false,
              canStand: false,
              canDoubleDown: false,
              canSplit: false,
            },
            dealerHand: {
              id: result.dealerHand?.id || `${gameId}-dealer`,
              cards: dealerCards,
              total: result.dealerHand?.total ?? dealerTotals.total ?? 0,
              hasAce: result.dealerHand?.hasAce ?? dealerTotals.hasAce ?? false,
              isBlackjack: false,
              isBust: (result.dealerHand?.total ?? dealerTotals.total ?? 0) > 21,
              betAmount: BigInt(result.dealerHand?.betAmount || '0'),
              payout: BigInt(result.dealerHand?.payout || '0'),
              actions: Array.isArray(result.dealerHand?.actions) ? result.dealerHand.actions : [],
              canHit: false,
              canStand: false,
              canDoubleDown: false,
              canSplit: false,
            },
            payout: BigInt(result.payout || '0'),
            isBlackjack: result.isBlackjack ?? false,
            timestamp: result.timestamp ?? Date.now(),
            ...(Array.isArray(result.playerHands) && result.playerHands.length > 0 && {
              playerHands: result.playerHands.map((h: any, handIdx: number) => {
                const cards: Card[] = Array.isArray(h.cards)
                  ? h.cards.map((c: any, idx: number) =>
                      typeof c === 'object' && 'value' in c
                        ? createCard(c.value, c.suit || suitFor(handIdx * 10 + idx), false)
                        : createCard(Number(c), suitFor(handIdx * 10 + idx), false))
                  : [];
                const totals = calculateHandTotal(cards);
                return {
                  id: h.id || `${gameId}-hand-${handIdx}`,
                  cards,
                  total: h.total ?? totals.total ?? 0,
                  hasAce: h.hasAce ?? totals.hasAce ?? false,
                  isBlackjack: h.isBlackjack ?? false,
                  isBust: h.isBust ?? false,
                  betAmount: BigInt(h.betAmount || '0'),
                  payout: BigInt(h.payout || '0'),
                  result: h.result,
                  actions: Array.isArray(h.actions) ? h.actions : [],
                  canHit: false,
                  canStand: false,
                  canDoubleDown: false,
                  canSplit: false,
                };
              }),
            }),
            ...(result.wasSplit && { wasSplit: true }),
            ...(result.wasDoubleDown && { wasDoubleDown: true }),
          };
        });

        // Only load if we don't have history yet (don't overwrite database-loaded history)
        setGameState(prev => {
          if (prev.history.length === 0 && parsedHistory.length > 0) {
            return {
              ...prev,
              history: parsedHistory.slice(0, 50),
            };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to load history from localStorage:', error);
    }
  }, [address]);

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

    const mappedState = status === 'player_turn'
      ? GameState.PLAYER_TURN
      : status === 'dealer_turn'
        ? GameState.DEALER_TURN
        : status === 'completed'
          ? GameState.COMPLETE
          : GameState.WAITING;
    
    const localGame: any = {
      id: gameId,
      player: address,
      betAmount: totalBetAmount,
      state: mappedState,
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

    // Keep isPlaying true when status is 'completed' until dealer reveal finishes (handleDealerRevealComplete)
    setGameState(prev => ({
      ...prev,
      currentGame: localGame,
      isPlaying: status === 'completed' ? true : status === 'player_turn' || status === 'dealer_turn',
    }));
    
    // Track new cards for animations
    const currentPlayerCardCount = activePlayerHand?.cards.length || 0;
    const currentDealerCardCount = dealerCards.length;
    
    if (currentPlayerCardCount > prevPlayerCardCount.current) {
      const newIndices = new Set<number>();
      for (let i = prevPlayerCardCount.current; i < currentPlayerCardCount; i++) {
        newIndices.add(i);
      }
      if (soundEnabled) new Audio('/BlackJack/sounds/cards.wav').play().catch(() => {});
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
      if (soundEnabled) new Audio('/BlackJack/sounds/cards.wav').play().catch(() => {});
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
    
    // Return the processed localGame so it can be used immediately
    return localGame;
  }, [address, gameState.clientSeed, soundEnabled]);

  // Handle game completion
  const handleGameCompletion = useCallback((data: any) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:handleGameCompletion:entry',message:'handleGameCompletion',data:{gameId:data?.gameId,payloadKeys:data?Object.keys(data):[],hasProcessedGame:!!data?.processedGame,hasGameState:!!data?.gameState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
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
      } else if (data.result === 'loss' || (payout === BigInt(0) && betAmount > BigInt(0))) {
        // Explicitly check for loss result OR payout = 0 with bet > 0 (dealer blackjack case)
        chipAnimResult = 'loss';
      } else if (profit > BigInt(0)) {
        chipAnimResult = 'win';
      } else if (profit < BigInt(0)) {
        chipAnimResult = 'loss';
      } else {
        chipAnimResult = 'push';
      }
      
      // Don't clear chips here - wait until after animation completes
      // Store as pending - will be applied after dealer reveal completes
      setPendingChipResult(chipAnimResult);

      // Add to break-even P&L chart (per completed game)
      chartRef.current?.addGameResult(betAmount, payout, {
        gameId: data?.gameId ? String(data.gameId) : undefined,
        result: data?.result ? String(data.result) : undefined,
      });

      // Extract player and dealer hands from the provided processedGame or gameState or use currentGame
      let playerHand: Hand = createEmptyHand();
      let dealerHand: Hand = createEmptyHand();
      
      // Prefer processedGame (from updateGameStateFromServer) as it has cards already extracted
      if (data.processedGame) {
        console.log('handleGameCompletion: Using processedGame', {
          gameId: data.processedGame.id,
          playerHand: data.processedGame.playerHand,
          dealerHand: data.processedGame.dealerHand,
          playerHandCards: data.processedGame.playerHand?.cards.map(c => c.value),
          dealerHandCards: data.processedGame.dealerHand?.cards.map(c => c.value)
        });
        
        if (data.processedGame.playerHand && data.processedGame.playerHand.cards.length > 0) {
          playerHand = {
            ...data.processedGame.playerHand,
            betAmount: data.processedGame.playerHand.betAmount || betAmount
          };
        }
        if (data.processedGame.dealerHand && data.processedGame.dealerHand.cards.length > 0) {
          dealerHand = data.processedGame.dealerHand;
        }
      } else if (data.gameState) {
        // Try to get cards from gameState first, then fallback to currentGame
        // Use a ref to get the latest currentGame state since React state updates are async
        let extractedPlayerHand: Hand | null = null;
        let extractedDealerHand: Hand | null = null;
        // Use the fresh gameState data passed from game_updated event
        const serverGameState = data.gameState;
        const gameId = String(serverGameState.gameId || serverGameState.id || '');
        const currentHandIndex = Number(serverGameState.currentHandIndex ?? 0);
        
        console.log('handleGameCompletion: Extracting cards from gameState', {
          gameId,
          playerHands: serverGameState.playerHands,
          dealerCards: serverGameState.dealerCards,
          hasPlayerHands: Array.isArray(serverGameState.playerHands),
          hasDealerCards: Array.isArray(serverGameState.dealerCards),
          playerHandsLength: Array.isArray(serverGameState.playerHands) ? serverGameState.playerHands.length : 0,
          dealerCardsLength: Array.isArray(serverGameState.dealerCards) ? serverGameState.dealerCards.length : 0
        });
        
        const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
        const suitFor = (idx: number) => {
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
        
        const rawHands = Array.isArray(serverGameState.playerHands) ? serverGameState.playerHands : [];
        console.log('handleGameCompletion: Processing playerHands', {
          rawHandsLength: rawHands.length,
          rawHands: rawHands.map((h: any) => ({
            cards: h.cards,
            cardsLength: Array.isArray(h.cards) ? h.cards.length : 0,
            cardsType: Array.isArray(h.cards) && h.cards.length > 0 ? typeof h.cards[0] : 'none'
          }))
        });
        
        if (rawHands.length > 0) {
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
              betAmount: toBigIntSafe(h.betAmount ?? betAmount),
              result: h.result,
              payout: toBigIntSafe(h.payout),
              actions: Array.isArray(h.actions) ? h.actions : [],
              canHit: false,
              canStand: false,
              canDoubleDown: false,
              canSplit: false,
            };
          });
          
          const activePlayerHand = playerHands[currentHandIndex] || playerHands[0];
          if (activePlayerHand && activePlayerHand.cards.length > 0) {
            extractedPlayerHand = {
              ...activePlayerHand,
              betAmount: activePlayerHand.betAmount || betAmount
            };
          }
        }
        
        // Dealer cards
        const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
          ? serverGameState.dealerCards.map((c: any) => Number(c))
          : [];
        
        if (rawDealerCards.length > 0) {
          const dealerCards = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
          const dealerTotals = calculateHandTotal(dealerCards);
          extractedDealerHand = {
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
        }
        
        // Use extracted hands if available, otherwise fallback to currentGame
        if (extractedPlayerHand && extractedPlayerHand.cards.length > 0) {
          playerHand = extractedPlayerHand;
          console.log('handleGameCompletion: Using extracted playerHand from gameState', {
            cards: playerHand.cards.map(c => c.value),
            total: playerHand.total
          });
        } else {
          // Fallback: use currentGame (which should be updated by updateGameStateFromServer)
          const currentPlayerHand = gameState.currentGame?.playerHand || createEmptyHand();
          playerHand = {
            ...currentPlayerHand,
            betAmount: currentPlayerHand.betAmount || betAmount
          };
          console.log('handleGameCompletion: Using currentGame playerHand (fallback)', {
            cards: playerHand.cards.map(c => c.value),
            cardsLength: playerHand.cards.length,
            hasCurrentGame: !!gameState.currentGame
          });
        }
        
        if (extractedDealerHand && extractedDealerHand.cards.length > 0) {
          dealerHand = extractedDealerHand;
        } else {
          dealerHand = gameState.currentGame?.dealerHand || createEmptyHand();
        }
      } else {
        // Final fallback: use currentGame
        const currentPlayerHand = gameState.currentGame?.playerHand || createEmptyHand();
        playerHand = {
          ...currentPlayerHand,
          betAmount: currentPlayerHand.betAmount || betAmount
        };
        dealerHand = gameState.currentGame?.dealerHand || createEmptyHand();
        console.log('handleGameCompletion: Using currentGame (final fallback)', {
          playerCards: playerHand.cards.map(c => c.value),
          dealerCards: dealerHand.cards.map(c => c.value)
        });
      }
      
      // If we still don't have cards, schedule an update after state settles
      if ((playerHand.cards.length === 0 || dealerHand.cards.length === 0) && gameState.currentGame) {
        // Use requestAnimationFrame to wait for React state to update
        requestAnimationFrame(() => {
          setGameState(prev => {
            const currentGame = prev.currentGame;
            if (!currentGame) return prev;
            
            const existingIndex = prev.history.findIndex(h => h.gameId === String(data?.gameId));
            if (existingIndex >= 0) {
              const existingEntry = prev.history[existingIndex];
              const needsUpdate = 
                (existingEntry.playerHand.cards.length === 0 && currentGame.playerHand?.cards.length > 0) ||
                (existingEntry.dealerHand.cards.length === 0 && currentGame.dealerHand?.cards.length > 0);
              
              if (needsUpdate) {
                console.log('handleGameCompletion: Updating history entry with cards from currentGame', {
                  gameId: data?.gameId,
                  playerCards: currentGame.playerHand?.cards.map(c => c.value),
                  dealerCards: currentGame.dealerHand?.cards.map(c => c.value)
                });
                
                const updatedHistory = [...prev.history];
                updatedHistory[existingIndex] = {
                  ...existingEntry,
                  playerHand: currentGame.playerHand || existingEntry.playerHand,
                  dealerHand: currentGame.dealerHand || existingEntry.dealerHand
                };
                return {
                  ...prev,
                  history: updatedHistory
                };
              }
            }
            return prev;
          });
        });
      }
      
      console.log('handleGameCompletion: Final hands before creating GameResult', {
        playerHandCards: playerHand.cards.map(c => c.value),
        dealerHandCards: dealerHand.cards.map(c => c.value),
        playerHandTotal: playerHand.total,
        dealerHandTotal: dealerHand.total,
        playerHandCardsLength: playerHand.cards.length,
        dealerHandCardsLength: dealerHand.cards.length
      });

      // Detect split/double from currentGame or from gameState
      const currentGame = gameState.currentGame;
      const allPlayerHands = currentGame?.playerHands && currentGame.playerHands.length > 0
        ? currentGame.playerHands
        : [playerHand];
      const wasSplit = allPlayerHands.length > 1;
      const wasDoubleDown = allPlayerHands.some((h: Hand) =>
        Array.isArray(h.actions) && h.actions.some((a: any) => a.type === 'double_down'));

      // Add to history
      const gameResult: GameResult = {
        gameId: data?.gameId ? String(data.gameId) : `game-${Date.now()}`,
        playerHand,
        dealerHand,
        payout: currentGame?.totalPayout ?? payout,
        isBlackjack: data.result === 'blackjack',
        timestamp: Date.now(),
        ...(allPlayerHands.length > 0 && { playerHands: allPlayerHands }),
        ...(wasSplit && { wasSplit: true }),
        ...(wasDoubleDown && { wasDoubleDown: true }),
      };

      console.log('handleGameCompletion: Adding to history', {
        gameId: gameResult.gameId,
        playerHandCards: gameResult.playerHand.cards.map(c => c.value),
        dealerHandCards: gameResult.dealerHand.cards.map(c => c.value),
        playerHandTotal: gameResult.playerHand.total,
        dealerHandTotal: gameResult.dealerHand.total,
        betAmount: gameResult.playerHand.betAmount?.toString(),
        payout: gameResult.payout.toString()
      });
      
      setGameState(prev => {
        // Prevent duplicate entries by checking if gameId already exists
        const existingIndex = prev.history.findIndex(h => h.gameId === gameResult.gameId);
        if (existingIndex >= 0) {
          // Update existing entry instead of adding duplicate
          // Only update if the new entry has cards (to avoid overwriting with empty cards)
          const shouldUpdate = gameResult.playerHand.cards.length > 0 || gameResult.dealerHand.cards.length > 0;
          if (shouldUpdate) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:handleGameCompletion:updateExisting',message:'updating existing history entry',data:{gameId:gameResult.gameId,existingIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            console.log('handleGameCompletion: Updating existing history entry', {
              existingIndex,
              oldPlayerCards: prev.history[existingIndex].playerHand.cards.map(c => c.value),
              newPlayerCards: gameResult.playerHand.cards.map(c => c.value)
            });
            const updatedHistory = [...prev.history];
            updatedHistory[existingIndex] = gameResult;
            return {
              ...prev,
              history: updatedHistory,
              lastResult: gameResult
            };
          } else {
            // Don't update if new entry has no cards (keep existing)
            console.log('handleGameCompletion: Skipping update - new entry has no cards');
            return prev;
          }
        }
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/BLACKJACK/page.tsx:handleGameCompletion:addNew',message:'adding new history entry',data:{gameId:gameResult.gameId,prevHistoryLength:prev.history.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        console.log('handleGameCompletion: Adding new history entry');
        const newHistory = [gameResult, ...prev.history].slice(0, 50);
        
        // Persist to localStorage as backup (keyed by wallet address)
        if (address && typeof window !== 'undefined') {
          try {
            const storageKey = `blackjack_history_${address.toLowerCase()}`;
            const historyToStore = newHistory.map(result => ({
              gameId: result.gameId,
              playerHand: {
                id: result.playerHand.id,
                cards: result.playerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.playerHand.total,
                hasAce: result.playerHand.hasAce,
                isBlackjack: result.playerHand.isBlackjack,
                isBust: result.playerHand.isBust,
                betAmount: result.playerHand.betAmount.toString(),
                payout: result.playerHand.payout.toString(),
                result: result.playerHand.result,
                actions: result.playerHand.actions,
              },
              dealerHand: {
                id: result.dealerHand.id,
                cards: result.dealerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.dealerHand.total,
                hasAce: result.dealerHand.hasAce,
                isBlackjack: result.dealerHand.isBlackjack,
                isBust: result.dealerHand.isBust,
                betAmount: result.dealerHand.betAmount.toString(),
                payout: result.dealerHand.payout.toString(),
                actions: result.dealerHand.actions,
              },
              payout: result.payout.toString(),
              isBlackjack: result.isBlackjack,
              timestamp: result.timestamp,
              ...(result.playerHands && { playerHands: result.playerHands.map(h => ({
                id: h.id,
                cards: h.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: h.total,
                hasAce: h.hasAce,
                isBlackjack: h.isBlackjack,
                isBust: h.isBust,
                betAmount: h.betAmount.toString(),
                payout: h.payout.toString(),
                result: h.result,
                actions: h.actions,
              })) }),
              ...(result.wasSplit && { wasSplit: true }),
              ...(result.wasDoubleDown && { wasDoubleDown: true }),
            }));
            localStorage.setItem(storageKey, JSON.stringify(historyToStore));
          } catch (error) {
            console.error('Failed to save history to localStorage:', error);
          }
        }
        
        return {
          ...prev,
          history: newHistory,
          lastResult: gameResult
        };
      });

      if (profit > BigInt(0)) {
        // Store pending win data - will show notification after dealer reveal completes
        setPendingWinData({
          amount: profit,
          isBlackjack: data.result === 'blackjack'
        });
      }
    } catch (error) {
      console.error('Error in handleGameCompletion:', error);
      // ignore malformed payload
    }
  }, [gameState.currentGame, manageChipStack]);

  // Handle dealer reveal completion - show win notification and trigger chip animation
  const handleDealerRevealComplete = useCallback(() => {
    // Allow REBET/DEAL only after dealer hand is fully revealed
    setGameState(prev => ({ ...prev, isPlaying: false }));
    // Trigger chip animation now that dealer reveal is complete
    if (pendingChipResult) {
      chipResultRef.current = pendingChipResult; // Store in ref for use in animation complete callback
      setCurrentGameResult(pendingChipResult);
      setPendingChipResult(null);
      // Play sound: dealer wins (including dealer blackjack)
      if (soundEnabled && pendingChipResult === 'loss') {
        const audio = new Audio('/BlackJack/sounds/DealerWins.mp3');
        audio.play().catch(() => {});
      }
      // Play sound: player wins (including player blackjack — same as any other win)
      if (soundEnabled && (pendingChipResult === 'win' || pendingChipResult === 'blackjack')) {
        const audio = new Audio('/BlackJack/sounds/PlayerWins.mp3');
        audio.play().catch(() => {});
      }
    }

    // Show win notification
    if (pendingWinData) {
      setWinAmount(pendingWinData.amount);
      setIsBlackjackWin(pendingWinData.isBlackjack);
      setShowWinNotification(true);
      setPendingWinData(null);
    }
  }, [pendingWinData, pendingChipResult, soundEnabled]);

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle deposit/withdraw modal
  const handleOpenDepositModal = useCallback(() => {
    setShowDepositModal(true);
  }, []);

  // Handle starting a tournament game
  const handleStartTournamentGame = useCallback(async (betAmount: number) => {
    if (!tournament.tournamentState.inTournament) {
      toast.error('Not in tournament');
      return;
    }

    // Reset card counts for new game animations
    prevPlayerCardCount.current = 0;
    prevDealerCardCount.current = 0;
    setNewCardIndices({ player: new Set(), dealer: new Set() });

    setGameState(prev => ({ ...prev, isPlaying: true }));

    try {
      const gameState = await tournament.startTournamentGame(betAmount);
      if (gameState) {
        // Convert tournament game state to local game state format
        updateGameStateFromServer(gameState);
        // If game completed, isPlaying is set to false in handleDealerRevealComplete after dealer reveal
      } else {
        setGameState(prev => ({ ...prev, isPlaying: false }));
      }
    } catch (error: any) {
      console.error('Failed to start tournament game:', error);
      toast.error(error.message || 'Failed to start game');
      setGameState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [tournament, updateGameStateFromServer]);

  // Handle tournament player action
  const handleTournamentPlayerAction = useCallback(async (action: Action) => {
    if (!gameState.currentGame || !tournament.tournamentState.inTournament) return;

    try {
      const gameStateResult = await tournament.performAction(action);
      if (gameStateResult) {
        updateGameStateFromServer(gameStateResult);

        // If game completed, update playing state
        if (gameStateResult.status === 'completed') {
          setGameState(prev => ({ ...prev, isPlaying: false }));
        }
      }
    } catch (error: any) {
      console.error('Failed to perform tournament action:', error);
      toast.error(error.message || 'Failed to perform action');
    }
  }, [gameState.currentGame, tournament, updateGameStateFromServer]);

  // Handle starting a new game
  const handleStartGame = useCallback(async (betAmount: bigint, _clientSeedFromPanel: string) => {
    // Validate bet amount is within limits
    if (betAmount < BET_LIMITS.MIN_BET) {
      toast.error('Bet too small', {
        description: `Minimum bet is 1 MORBIUS`
      });
      return;
    }
    if (betAmount > BET_LIMITS.MAX_BET) {
      toast.error('Bet too large', {
        description: `Maximum bet is 100,000 MORBIUS`
      });
      return;
    }
    
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
    if (!getWebSocketUrlOptional()) {
      toast.error('Game server not configured. Set NEXT_PUBLIC_WEBSOCKET_URL in your environment.');
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

  // Rebet and deal: same bet as last hand, then start game in one action (must be after handleStartGame)
  const handleRebetAndDeal = useCallback(() => {
    const lastBet = parseFloat(lastBetAmount);
    if (lastBet <= 0) return;
    const lastBetWei = BigInt(lastBet.toString() + '0'.repeat(18));
    if (lastBetWei > BET_LIMITS.MAX_BET) {
      toast.error('Bet limit exceeded', {
        description: `Maximum bet is 100,000 MORBIUS. Cannot rebet ${lastBet} MORBIUS`,
      });
      return;
    }
    // Set chip stack to last bet (visual sync)
    const chips: number[] = [];
    let remaining = lastBet;
    const chipValues = [100000, 10000, 2500, 1000, 500];
    for (const chipValue of chipValues) {
      while (remaining >= chipValue) {
        chips.push(chipValue);
        remaining -= chipValue;
      }
    }
    setChipStack(chips);
    handleStartGame(lastBetWei, clientSeed);
  }, [lastBetAmount, clientSeed, handleStartGame]);

  // Note: Approval handling no longer needed since bets come from reserve

  // Fetch game result for verification (Verify tab)
  const handleVerifyGame = useCallback(async (id: string): Promise<GameVerificationData | null> => {
    try {
      const apiUrl = getApiUrlOptional();
      if (!apiUrl) return null;
      const res = await fetch(`${apiUrl}/api/game/${id}/verify`);
      if (!res.ok) return null;
      const raw = await res.json();
      if (!raw || !raw.gameId) return null;
      const hands = raw.playerHands || [];
      const playerCards = hands.flatMap((h: { cards?: number[] }) => h.cards || []);
      const firstResult = hands[0]?.result ?? raw.result ?? 'push';
      return {
        gameId: raw.gameId,
        serverSeedHash: raw.serverSeedHash ?? '',
        serverSeed: raw.serverSeed,
        clientSeed: raw.clientSeed ?? 'default',
        nonce: typeof raw.nonce === 'number' ? raw.nonce : Number(raw.baseNonce ?? 0),
        betAmount: BigInt(raw.betAmount ?? raw.total_bet_amount ?? 0),
        playerCards,
        dealerCards: Array.isArray(raw.dealerCards) ? raw.dealerCards : [],
        result: raw.result ?? firstResult,
        payout: BigInt(raw.totalPayout ?? raw.total_payout ?? 0),
        timestamp: raw.timestamp ?? 0,
        actions: raw.actions ?? [],
      };
    } catch {
      return null;
    }
  }, []);

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
      // Show the actual error message from the server (e.g., "Insufficient balance...")
      const errorMessage = error instanceof Error ? error.message : 'Failed to perform action';
      toast.error(errorMessage);

      // Refresh balance in case it's a balance-related error
      fetchBalance();
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

      // Use all player hands when present (split), otherwise single hand
      const handsToMap = result.playerHands && result.playerHands.length > 0
        ? result.playerHands
        : [result.playerHand];

      const playerHands = handsToMap.map((hand) => {
        const cards = Array.isArray(hand.cards)
          ? hand.cards.map(c => typeof c === 'object' && 'value' in c ? c.value : Number(c))
          : [];
        const handResult: 'win' | 'loss' | 'push' | 'blackjack' =
          hand.result === 'blackjack' ? 'blackjack' :
          hand.result === 'win' ? 'win' :
          hand.result === 'push' ? 'push' : 'loss';
        return {
          cards,
          total: hand.total,
          result: handResult,
          payout: hand.payout ?? result.payout
        };
      });

      const dealerCards = Array.isArray(result.dealerHand.cards)
        ? result.dealerHand.cards.map(c => typeof c === 'object' && 'value' in c ? c.value : Number(c))
        : [];

      const totalBet = result.playerHands && result.playerHands.length > 0
        ? result.playerHands.reduce((sum, h) => sum + (h.betAmount || BigInt(0)), BigInt(0))
        : (result.playerHand.betAmount || BigInt(0));

      return {
        id: result.gameId,
        gameId: result.gameId,
        timestamp: result.timestamp,
        betAmount: totalBet,
        payout: result.payout,
        result: gameResult,
        playerHands,
        dealerCards,
        dealerTotal: result.dealerHand.total,
        verified: false,
        ...(result.wasSplit && { wasSplit: true }),
        ...(result.wasDoubleDown && { wasDoubleDown: true }),
      };
    });
  }, [gameState.history]);

  // Show intro screen
  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  // Check if user has no reserve balance (less than 1 MORBIUS)
  const hasNoReserve = offChainBalance < BigInt('1000000000000000000'); // Less than 1 MORBIUS (1e18)
  const showSplash = hasNoReserve && isConnected && !splashDismissed;

  const currentGame = gameState.currentGame;
  const isPlayerTurn = currentGame?.state === GameState.PLAYER_TURN;

  // Get the current active hand (for split scenarios, use the hand at currentHandIndex)
  const activeHand = currentGame?.playerHands && currentGame.playerHands.length > 0
    ? currentGame.playerHands[currentGame.currentHandIndex || 0]
    : currentGame?.playerHand;

  const canHit = currentGame?.state === GameState.PLAYER_TURN && activeHand && !activeHand.isBust;
  const canStand = currentGame?.state === GameState.PLAYER_TURN && activeHand && !activeHand.isBust;
  
  // Check if doubling down would exceed MAX_BET
  const handBetAmount = activeHand?.betAmount || currentGame?.totalBetAmount || BigInt(0);
  const doubleBetAmount = handBetAmount * BigInt(2);
  const canDoubleDownByBetLimit = doubleBetAmount <= BET_LIMITS.MAX_BET;
  
  const canDoubleDown = currentGame?.state === GameState.PLAYER_TURN && 
    activeHand && 
    activeHand.cards.length === 2 &&
    canDoubleDownByBetLimit; // Also check bet limit

  // Can split when player has exactly 2 cards of the same value (only on first hand, not after split)
  // Also check if splitting would exceed MAX_BET (split requires 2x bet)
  const canSplitByBetLimit = doubleBetAmount <= BET_LIMITS.MAX_BET;
  
  const canSplit = currentGame?.state === GameState.PLAYER_TURN &&
    activeHand &&
    activeHand.cards.length === 2 &&
    activeHand.cards[0].value === activeHand.cards[1].value &&
    (!currentGame.playerHands || currentGame.playerHands.length <= 1) && // Can't split again if already split
    canSplitByBetLimit; // Also check bet limit

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto w-full no-scrollbar"
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
        theme={theme}
        onThemeChange={setTheme}
        imageSource={imageSource}
        onImageSourceChange={setImageSource}
        videoSource={videoSource}
        onVideoSourceChange={handleVideoSourceChange}
        videoSyncToClock={videoSyncToClock}
        onVideoSyncToClockChange={setVideoSyncToClock}
        videoPosition={videoPosition}
        onVideoPositionChange={setVideoPosition}
        soundEnabled={soundEnabled}
        onSoundChange={setSoundEnabled}
        themeModalOpen={themeModalOpen}
        onThemeModalOpenChange={setThemeModalOpen}
      />

      {/* Splash Screen Overlay - Dismissible */}
      {showSplash && (
        <div className="fixed inset-0 z-[150] p-4 bg-black/80 backdrop-blur-sm">
          <div className="absolute top-[50px] left-1/2 -translate-x-1/2 bg-black border border-white/20 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
            {/* Close Button */}
            <button
              onClick={() => setSplashDismissed(true)}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <i className="fas fa-times text-xl"></i>
            </button>

            <div className="text-center space-y-4">
              {/* Beta Badge */}
              <div className="inline-block px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                <span className="text-yellow-400 font-bold text-xs uppercase tracking-wider">BETA</span>
              </div>

              {/* Main Heading */}
              <h2 className="text-2xl font-bold text-white">
                Welcome to Blackjack
              </h2>

              {/* Instructions */}
              <div className="text-white/90 text-sm leading-relaxed space-y-2 text-left">
                <p className="text-center">
                  Blackjack is currently in <span className="font-semibold text-yellow-400">BETA</span>.
                </p>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Bet only the <span className="font-semibold text-white">minimum amount</span> while testing</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Always <span className="font-semibold text-white">withdraw your entire balance</span> when done playing</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Withdrawals via <span className="font-semibold text-white">game menu</span> or <span className="font-semibold text-white">clicking reserve balance</span> at top</p>
                  </div>
                </div>
              </div>

              {/* Deposit Button */}
              <button
                onClick={() => {
                  handleOpenDepositModal();
                  setSplashDismissed(true);
                }}
                className="w-full px-6 py-3 bg-white text-black font-bold text-sm rounded-lg hover:bg-white/90 transition-colors shadow-lg"
              >
                Deposit MORBIUS to Play
              </button>

              {/* Footer Note */}
              <p className="text-white/60 text-xs">
                Deposit MORBIUS to your reserve to start playing
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="w-full max-w-full mx-0 px-2 sm:px-4 pt-12 pb-4 sm:pb-8 overflow-x-hidden overflow-y-auto no-scrollbar">
        {/* View-specific content */}
        {currentView === 'game' && (
          <>
        {/* Game layout: table + betting fit when possible; min height so table stays usable */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] grid-rows-[1fr_auto_auto] md:grid-rows-[1fr_auto] gap-2 md:gap-4 min-h-0">
          {/* 1. Table — mobile first, desktop row1 col1; flex so it fills and shrinks */}
          <div className="min-w-0 flex flex-col min-h-0 pb-0 -mx-2 sm:mx-0 order-1 md:order-none md:row-start-1 md:col-start-1">
          <div className="relative w-full flex-1 min-h-0 flex flex-col">
            <BlackjackTable
              playerHand={currentGame?.playerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              playerHands={currentGame?.playerHands}
              currentHandIndex={currentGame?.currentHandIndex || 0}
              dealerHand={currentGame?.dealerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              gameState={currentGame?.state || GameState.WAITING}
              onAction={tournament.tournamentState.inTournament ? handleTournamentPlayerAction : handlePlayerAction}
              canHit={canHit}
              canStand={canStand}
              canDoubleDown={canDoubleDown && (!tournament.tournamentState.inTournament || tournament.tournamentState.chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0))}
              canSplit={canSplit && (!tournament.tournamentState.inTournament || tournament.tournamentState.chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0))}
              reserveBalance={tournament.tournamentState.inTournament ? BigInt(tournament.tournamentState.chips) : offChainBalance}
              usePLS={false}
              newCardIndices={newCardIndices}
              chipStack={tournament.tournamentState.inTournament ? [] : chipStack}
              onClearBet={tournament.tournamentState.inTournament ? () => {} : () => manageChipStack('', undefined, true)}
              onStartGame={tournament.tournamentState.inTournament
                ? () => handleStartTournamentGame(TOURNAMENT_CONFIG.MIN_BET)
                : () => handleStartGame(BigInt(totalBetAmount.toString() + '0'.repeat(18)), clientSeed)}
              isPlaying={gameState.isPlaying}
              onDealerRevealComplete={handleDealerRevealComplete}
              gameResult={currentGameResult}
              onChipAnimationComplete={handleChipAnimationComplete}
              history={gameState.history}
              totalPayout={currentGame?.totalPayout || BigInt(0)}
              onDoubleDownChips={tournament.tournamentState.inTournament ? () => {} : handleDoubleDownChips}
              onSplitChips={tournament.tournamentState.inTournament ? () => {} : handleSplitChips}
              onRebet={tournament.tournamentState.inTournament ? () => {} : handleRebet}
              onRebetAndDeal={tournament.tournamentState.inTournament ? undefined : handleRebetAndDeal}
              onHalfBet={tournament.tournamentState.inTournament ? () => {} : handleHalfBet}
              onDoubleBet={tournament.tournamentState.inTournament ? () => {} : handleDoubleBet}
              canDeal={tournament.tournamentState.inTournament
                ? !gameState.isPlaying && tournament.tournamentState.handsRemaining > 0
                : !gameState.isPlaying && totalBetAmount > 0}
              onBetAmountChange={tournament.tournamentState.inTournament ? () => {} : manageChipStack}
              currentBetAmount={tournament.tournamentState.inTournament ? String(TOURNAMENT_CONFIG.MIN_BET) : displayBetAmount}
              lastBetAmount={lastBetAmount}
              useVideoBackground={useVideoBackground}
              imageSource={imageSource}
              videoSource={videoSource}
              videoSyncToClock={videoSyncToClock}
              videoPosition={videoPosition}
              onOpenDepositModal={handleOpenDepositModal}
              onOpenTableThemeSelector={() => setThemeModalOpen(true)}
              soundEnabled={soundEnabled}
              hideBettingPanel={true}
            />

            {/* Win Notification */}
            {showWinNotification && (
              <WinNotification
                amount={winAmount}
                isBlackjack={isBlackjackWin}
                onComplete={() => setShowWinNotification(false)}
              />
            )}

            {/* Tournament HUD (overlay on top of table when in tournament mode) */}
            {tournament.tournamentState.inTournament && (
              <div className="absolute top-4 right-4 z-30">
                <TournamentHUD
                  state={tournament.tournamentState}
                  onLeave={() => {
                    if (confirm('Are you sure you want to leave the tournament? You will forfeit your remaining chips.')) {
                      tournament.leaveTournament();
                      setIsTournamentMode(false);
                    }
                  }}
                  onRebuy={async () => {
                    const success = await tournament.requestRebuy();
                    if (success) {
                      toast.success('Rebuy successful! Good luck!');
                      fetchBalance();
                    }
                  }}
                  isRebuyLoading={tournament.isLoading}
                />
              </div>
            )}
          </div>
        </div>

          {/* 2. Mobile only: betting panel + quick actions below table */}
          {currentView === 'game' && !tournament.tournamentState.inTournament && (
            <div className="order-2 md:hidden flex flex-col gap-2 w-full min-w-0">
              <div className="px-2">
                <BettingPanel
                  onStartGame={(betBigInt, _clientSeed) => handleStartGame(betBigInt, clientSeed)}
                  isPlaying={gameState.isPlaying}
                  reserveBalance={offChainBalance}
                  onBetAmountChange={manageChipStack}
                  currentBetAmount={displayBetAmount}
                  lastBetAmount={lastBetAmount}
                  onRebet={handleRebet}
                  onHalfBet={handleHalfBet}
                  onDoubleBet={handleDoubleBet}
                />
              </div>
              <BlackjackMobileActionBar
                onRebetAndDeal={handleRebetAndDeal}
                onStartGame={() => handleStartGame(BigInt(totalBetAmount.toString() + '0'.repeat(18)), clientSeed)}
                onAction={handlePlayerAction}
                onDoubleDownChips={handleDoubleDownChips}
                onSplitChips={handleSplitChips}
                isPlaying={gameState.isPlaying}
                canHit={canHit}
                canStand={canStand}
                canDoubleDown={canDoubleDown}
                canSplit={canSplit}
                canDeal={!gameState.isPlaying && totalBetAmount > 0}
                chipStackLength={chipStack.length}
                lastBetAmount={lastBetAmount}
                soundEnabled={soundEnabled}
              />
            </div>
          )}

          {/* 3. Tabbed sidebar — mobile after controls; desktop row1 col2 (Bet tab = betting + quick actions) */}
          <div className="min-w-0 order-3 md:order-none md:row-start-1 md:col-start-2">
          <BlackjackSidebar
            history={gameState.history}
            reserveBalance={offChainBalance}
            onQuickJoinTournament={() => setShowTournamentEntry(true)}
            onTournamentLobby={() => setShowTournamentBrowser(true)}
            chartRef={chartRef}
            chartSessionStartTime={chartSessionStartTime.current}
            wsClient={wsClient}
            wsConnected={wsConnected}
            clientSeed={clientSeed}
            onClientSeedChange={setClientSeed}
            onGenerateClientSeed={generateClientSeed}
            inTournament={tournament.tournamentState.inTournament}
            betTabContent={
              !tournament.tournamentState.inTournament ? (
                <>
                  <BettingPanel
                    onStartGame={(betBigInt, _clientSeed) => handleStartGame(betBigInt, clientSeed)}
                    isPlaying={gameState.isPlaying}
                    reserveBalance={offChainBalance}
                    onBetAmountChange={manageChipStack}
                    currentBetAmount={displayBetAmount}
                    lastBetAmount={lastBetAmount}
                    onRebet={handleRebet}
                    onHalfBet={handleHalfBet}
                    onDoubleBet={handleDoubleBet}
                  />
                  <BlackjackMobileActionBar
                    onRebetAndDeal={handleRebetAndDeal}
                    onStartGame={() => handleStartGame(BigInt(totalBetAmount.toString() + '0'.repeat(18)), clientSeed)}
                    onAction={handlePlayerAction}
                    onDoubleDownChips={handleDoubleDownChips}
                    onSplitChips={handleSplitChips}
                    isPlaying={gameState.isPlaying}
                    canHit={canHit}
                    canStand={canStand}
                    canDoubleDown={canDoubleDown}
                    canSplit={canSplit}
                    canDeal={!gameState.isPlaying && totalBetAmount > 0}
                    chipStackLength={chipStack.length}
                    lastBetAmount={lastBetAmount}
                    soundEnabled={soundEnabled}
                    alwaysVisible
                  />
                </>
              ) : null
            }
            tournamentTabContent={
              tournament.tournamentState.inTournament ? (
                <>
                  <TournamentHUD
                    state={tournament.tournamentState}
                    onLeave={() => {
                      if (confirm('Are you sure you want to leave the tournament? You will forfeit your remaining chips.')) {
                        tournament.leaveTournament();
                        setIsTournamentMode(false);
                      }
                    }}
                    onRebuy={async () => {
                      const success = await tournament.requestRebuy();
                      if (success) {
                        toast.success('Rebuy successful! Good luck!');
                        fetchBalance();
                      }
                    }}
                    isRebuyLoading={tournament.isLoading}
                  />
                  <TournamentBetPanel
                    chips={tournament.tournamentState.chips}
                    onStartGame={handleStartTournamentGame}
                    isPlaying={gameState.isPlaying}
                    isLoading={tournament.isLoading}
                    handsRemaining={tournament.tournamentState.handsRemaining}
                    gameResult={currentGameResult}
                  />
                </>
              ) : null
            }
          />
        </div>
        </div>

        {/* Tournament Leaderboard (shown when in tournament) */}
        {tournament.tournamentState.inTournament && (
          <div className="mt-4">
            <TournamentLeaderboard
              leaderboard={tournament.leaderboard}
              playerAddress={address}
              playerEntry={tournament.leaderboard.find(e =>
                e.player_address.toLowerCase() === address?.toLowerCase()
              )}
              onRefresh={() => tournament.fetchLeaderboard()}
            />
          </div>
        )}

        {/* Deposit/Withdraw Modal (available on all views) */}
        <DepositWithdrawModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          onBalanceSync={syncBalance}
          contractReserve={playerReserve}
          offChainBalance={offChainBalance}
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

        {/* Tournament Entry Modal */}
        <TournamentEntry
          isOpen={showTournamentEntry}
          onClose={() => setShowTournamentEntry(false)}
          onEnter={async () => {
            const success = await tournament.enterTournament();
            if (success) {
              setShowTournamentEntry(false);
              setIsTournamentMode(true);
              toast.success('Welcome to the tournament!');
              // Sync balance after buy-in
              fetchBalance();
            }
          }}
          isLoading={tournament.isLoading}
          playerBalance={offChainBalance}
          prizePool={tournament.tournamentInfo?.prizePool}
          entryCount={tournament.tournamentInfo?.entryCount}
        />

        {/* Tournament Complete Modal */}
        <TournamentComplete
          isOpen={showTournamentComplete}
          onClose={() => {
            setShowTournamentComplete(false);
            setIsTournamentMode(false);
            fetchBalance(); // Refresh balance after tournament ends
          }}
          onPlayAgain={() => {
            setShowTournamentComplete(false);
            setShowTournamentEntry(true);
          }}
          state={tournament.tournamentState}
          prizeWon={tournament.tournamentState.status === 'completed' && tournament.tournamentState.currentRank <= 10
            ? tournament.getPrizeForRank(tournament.tournamentState.currentRank, BigInt(tournament.tournamentInfo?.prizePool || '0'))
            : 0n}
        />

        {/* Tournament Browser Modal */}
        <TournamentBrowser
          isOpen={showTournamentBrowser}
          onClose={() => setShowTournamentBrowser(false)}
          onJoin={(tournamentId, isPrivate) => {
            if (isPrivate) {
              setPendingJoinTournamentId(tournamentId);
              setShowTournamentPinEntry(true);
            } else {
              // Join directly
              tournament.joinTournament(tournamentId).then(success => {
                if (success) {
                  setShowTournamentBrowser(false);
                  setIsTournamentMode(true);
                  toast.success('Joined tournament!');
                  fetchBalance();
                }
              });
            }
          }}
          onCreateNew={() => {
            setShowTournamentBrowser(false);
            setShowTournamentCreator(true);
          }}
          onRefresh={() => tournament.fetchTournamentList()}
          onFetchLeaderboard={(tournamentId) => tournament.fetchTournamentLeaderboard(tournamentId)}
          tournaments={tournament.tournamentList}
          isLoading={tournament.isLoading}
          playerBalance={offChainBalance}
        />

        {/* Tournament Creator Modal */}
        <TournamentCreator
          isOpen={showTournamentCreator}
          onClose={() => setShowTournamentCreator(false)}
          onCreate={async (params: CreateTournamentRequest) => {
            const result = await tournament.createTournament(params);
            if (result) {
              toast.success('Tournament created!');
              // Refresh tournament list
              tournament.fetchTournamentList();
              return result;
            }
            return null;
          }}
          isLoading={tournament.isLoading}
          playerBalance={offChainBalance}
        />

        {/* Tournament PIN Entry Modal */}
        <TournamentPinEntry
          isOpen={showTournamentPinEntry}
          onClose={() => {
            setShowTournamentPinEntry(false);
            setPendingJoinTournamentId(null);
          }}
          onSubmit={async (pin) => {
            if (!pendingJoinTournamentId) return false;
            const success = await tournament.joinTournament(pendingJoinTournamentId, pin);
            if (success) {
              setShowTournamentPinEntry(false);
              setShowTournamentBrowser(false);
              setPendingJoinTournamentId(null);
              setIsTournamentMode(true);
              toast.success('Joined private tournament!');
              fetchBalance();
            }
            return success;
          }}
          isLoading={tournament.isLoading}
        />

        {currentView === 'history' && (
          <div className="max-w-7xl mx-auto">
            <GameHistory
              history={gameHistoryEntries}
              onVerifyGame={(gameId) => {
                setInitialVerifyGameId(gameId);
                setCurrentView('verify');
              }}
            />
          </div>
        )}

        {currentView === 'stats' && (
          <div className="max-w-7xl mx-auto">
            {playerStatsLoading ? (
              <div className="text-center py-12 text-cyan-300">Loading player statistics...</div>
            ) : playerStatsError ? (
              <div className="text-center py-12">
                <div className="text-red-400 mb-2">Error loading statistics</div>
                <div className="text-gray-400 text-sm">{playerStatsError instanceof Error ? playerStatsError.message : 'Unknown error'}</div>
                <button
                  onClick={() => refetchPlayerStats()}
                  className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
                >
                  Retry
                </button>
              </div>
            ) : playerStats ? (
              <PlayerStatsDashboard stats={playerStats} isLoading={playerStatsLoading} />
            ) : (
              <div className="text-center py-12 text-cyan-300">No statistics available. Play some games to see your stats!</div>
            )}
          </div>
        )}

        {currentView === 'analytics' && isDeployer && (
          <div className="max-w-7xl mx-auto">
            {globalAnalyticsLoading ? (
              <div className="text-center py-12 text-cyan-300">Loading global analytics...</div>
            ) : globalAnalyticsError ? (
              <div className="text-center py-12">
                <div className="text-red-400 mb-2">Error loading analytics</div>
                <div className="text-gray-400 text-sm">{globalAnalyticsError instanceof Error ? globalAnalyticsError.message : 'Unknown error'}</div>
                <button
                  onClick={() => refetchGlobalAnalytics()}
                  className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
                >
                  Retry
                </button>
              </div>
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
          <div className="max-w-4xl mx-auto space-y-4">
            <p className="text-center text-cyan-300/80 text-sm">
              Provably fair seeds (server seed hash, server seed, client seed, nonce) for any hand. Enter a game ID below or open <span className="text-white font-medium">History</span> and click <span className="text-white font-medium">Verify Game</span> on a hand to load it here.
            </p>
            <GameVerificationTools
              onVerify={handleVerifyGame}
              initialGameId={initialVerifyGameId ?? undefined}
              onInitialGameIdConsumed={() => setInitialVerifyGameId(null)}
            />
          </div>
        )}

      </main>

      {/* Contract Addresses - Above Footer */}
      <div className="w-full py-4 px-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 bg-transparent">
        <ContractAddress address={MORBIUS_TOKEN_ADDRESS} label="MORBIUS Token" />
        <ContractAddress address={BLACKJACK_ADDRESS} label="Blackjack Contract" />
      </div>

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