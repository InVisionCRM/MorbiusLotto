'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, usePublicClient, useSignTypedData } from 'wagmi';
import { useGameLock } from '@/contexts/game-lock-context';
import { toast } from 'sonner';
import { keccak256, toHex, encodePacked } from 'viem';
import BlackjackTable from '@/components/BLACKJACK/BlackjackTable';
import BlackjackTopPlayers from '@/components/BLACKJACK/BlackjackTopPlayers';
import { BlackjackRecentPlays } from '@/components/BLACKJACK/BlackjackRecentPlays';
import { BlackjackRecentGames } from '@/components/BLACKJACK/BlackjackRecentGames';
import { TableTokenProfileCard } from '@/components/BLACKJACK/TableTokenProfileCard';
import { TournamentListSidebar } from '@/components/BLACKJACK/TournamentListSidebar';
import BettingPanelMobile from '@/components/BLACKJACK/BettingPanelMobile';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer'; // Reuse footer
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { GlobalAnalyticsDashboard } from '@/components/BLACKJACK/GlobalAnalyticsDashboard';
// GameVerificationTools removed - use /BLACKJACK/verify page instead
import { GameFAQ } from '@/components/shared/GameFAQ';
import BlackjackRealTimeBetChart, { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart';
import BlackjackMobileActionBar from '@/components/BLACKJACK/BlackjackMobileActionBar';
import BlackjackSidebar from '@/components/BLACKJACK/BlackjackSidebar';
import { useProfileSettingsModal } from '@/components/shared/ProfileSettingsModalContext';
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
import { CreateTournamentRequest, TournamentListItem } from '@/lib/tournament-types';
import { ANIMATION_TIMINGS, BET_LIMITS, BLACKJACK_DEPLOYER_WALLET, DEFAULT_BLACKJACK_IMAGE_ID, BlackjackThemeKind } from './constants';
// import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useBlackjackContract, useWatchDeposits, useWatchDepositsMORBIUS, useWatchWithdrawals } from '@/hooks/use-blackjack-contract';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { usePendingWithdrawal } from '@/hooks/use-pending-withdrawal';
import { BlackjackWebSocketClient, GameState as ServerGameState } from '@/lib/websocket-client';
import { formatEther, parseEther } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { usePlayerStatsEnhanced, useGlobalAnalytics, usePlayerGames } from '@/hooks/use-blackjack-stats';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { useAudio } from '@/hooks/use-audio';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { AdSpace } from '@/components/shared/AdSpace';

// Intro screen component
function IntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500;
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200);
    }, duration);

    return () => clearTimeout(fallbackTimeout);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      {/* Ad just above loading content; single centered column */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6">
        <div className="w-[300px] shrink-0">
          <AdSpace slot="loading" width={300} height={100} showCta={true} />
        </div>
        {/* Cards then text */}
        <div className="flex flex-col items-center gap-[30px]">
        {/* Animated card dealing effect */}
        <div className="relative w-24 h-32 shrink-0 overflow-visible">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute items-center justify-center w-20 h-28 bg-white rounded-lg border-2 border-gray-300 shadow-lg"
              style={{
                transform: `translate(${i * 2}px, ${i * 2}px) rotate(${i * 10}deg)`,
                animation: `dealCard 0.5s ease-out ${i * 0.1}s both`,
                zIndex: 6 - i
              }}
            >
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-purple-700 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">♠</span>
              </div>
            </div>
          ))}
        </div>

        {/* Loading text — separate block, 30px below cards */}
        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            SHUFFLING DECK...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing provably fair blackjack
          </div>
        </div>
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

// Helper: blackjack hand total with correct multi-ace handling (each ace 11 until bust, then soften one at a time)
const calculateHandTotal = (cards: Card[]): { total: number; hasAce: boolean } => {
  let total = 0;
  let aceCount = 0;

  for (const card of cards) {
    if (card.value === 1) {
      aceCount++;
      total += 11;
    } else if (card.value >= 11 && card.value <= 13) {
      total += 10;
    } else {
      total += card.value;
    }
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount--;
  }

  return { total, hasAce: aceCount > 0 };
};

// Helper function to create a card
const createCard = (value: number, suit: string, hidden = false): Card => ({
  value: value as any,
  suit: suit as any,
  hidden
});

export default function BlackjackPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const { pendingJob, clearPendingJob } = usePendingWithdrawal(address, getApiUrlOptional() ?? undefined);

  // Intro screen state
  const [showIntro, setShowIntro] = useState(true);

  // Provably Fair: client seed (auto-generated for player entropy; can be overridden in sidebar)
  const [clientSeed, setClientSeed] = useState(() => {
    if (typeof window !== 'undefined' && window.crypto) {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
    return ''
  });

  // Perfect Pairs side bet (whole MORBIUS units, 0-10000)
  const [perfectPairsBet, setPerfectPairsBet] = useState(0);

  // Background preference state (persisted per wallet). imageSource/videoSource can be static id or API table UUID.
  const { imageOptions, videoOptions, getThemeInfo, getTableProfile } = useBlackjackTables();
  const [theme, setTheme] = useState<BlackjackThemeKind>('image');
  const [imageSource, setImageSource] = useState<string>(DEFAULT_BLACKJACK_IMAGE_ID);
  // True once the initial load effect has finished writing prefs to state — prevents
  // the persist effect from overwriting localStorage with a temporary/default value
  // before the player's saved custom table ID has been validated and applied.
  const prefLoadedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { playSound } = useAudio(soundEnabled);
  const [videoSource, setVideoSource] = useState<string>('glowingTable');
  const [videoSyncToClock, setVideoSyncToClock] = useState(true);
  const [videoPosition, setVideoPosition] = useState(50); // 0-100, used when sync to clock is off
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  // Background music player state (lifted from BlackjackTable)
  const BLACKJACK_MUSIC_PLAYLIST = [
    '/BlackJack/music/Sera-di-Blackjack.mp3',
    '/BlackJack/music/Winning-Big.mp3',
    '/BlackJack/music/Lucky-Ducky.mp3',
    '/BlackJack/music/Smooth-Gains.mp3',
    '/BlackJack/music/Top-Tier.mp3',
    '/BlackJack/music/Chances.mp3',
  ] as const;
  const [musicTrackIndex, setMusicTrackIndex] = useState(0); // Start with first track (Sera di Blackjack)
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(25); // 0–100
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) el.volume = musicVolume / 100;
  }, [musicVolume]);

  useEffect(() => {
    if (musicAudioRef.current && !isMusicPlaying) {
      musicAudioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {});
    }
  }, []);

  const handleMusicEnded = useCallback(() => {
    setMusicTrackIndex((prev) => (prev + 1) % BLACKJACK_MUSIC_PLAYLIST.length);
    setIsMusicPlaying(false);
  }, []);

  useEffect(() => {
    const el = musicAudioRef.current;
    if (!el) return;
    el.volume = musicVolume / 100;
    el.play().then(() => setIsMusicPlaying(true)).catch(() => {});
  }, [musicTrackIndex]);

  const toggleMusic = useCallback(() => {
    const el = musicAudioRef.current;
    if (!el) return;
    if (isMusicPlaying) {
      el.pause();
      setIsMusicPlaying(false);
    } else {
      el.play().then(() => setIsMusicPlaying(true)).catch(() => {});
    }
  }, [isMusicPlaying]);

  const nextTrack = useCallback(() => {
    setMusicTrackIndex((prev) => (prev + 1) % BLACKJACK_MUSIC_PLAYLIST.length);
    setIsMusicPlaying(false);
  }, []);

  const useVideoBackground = theme === 'video';

  const TABLE_PREFS_KEY = 'morb_blackjack_table';
  const validImageIds = useMemo(() => new Set(imageOptions.map((x) => x.id)), [imageOptions]);
  const validVideoIds = useMemo(() => new Set(videoOptions.map((x) => x.id)), [videoOptions]);

  // Load table background: fetch server default, then apply per-wallet localStorage override if present.
  // Depends on validImageIds/validVideoIds so it re-runs once API tables load and can validate UUID-based
  // custom tables that weren't in the static list on first render.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const key = address ? `${TABLE_PREFS_KEY}_${address.toLowerCase()}` : null;
    prefLoadedRef.current = false;
    (async () => {
      const defaultRes = await fetch('/api/blackjack/default-table').catch(() => null);
      const apiDefault: { themeKind: 'image' | 'video'; tableId: string } =
        defaultRes?.ok
          ? await defaultRes.json().catch(() => ({ themeKind: 'image' as const, tableId: DEFAULT_BLACKJACK_IMAGE_ID }))
          : { themeKind: 'image', tableId: DEFAULT_BLACKJACK_IMAGE_ID };
      if (cancelled) return;
      let themeToUse = apiDefault.themeKind;
      let imageToUse = apiDefault.themeKind === 'image' ? apiDefault.tableId : DEFAULT_BLACKJACK_IMAGE_ID;
      let videoToUse = apiDefault.themeKind === 'video' ? apiDefault.tableId : 'glowingTable';
      if (key) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const prefs = JSON.parse(raw) as { theme?: string; imageSource?: string; videoSource?: string };
            if (prefs.theme === 'image' || prefs.theme === 'video') themeToUse = prefs.theme;
            if (prefs.imageSource && validImageIds.has(prefs.imageSource)) imageToUse = prefs.imageSource;
            if (prefs.videoSource && validVideoIds.has(prefs.videoSource)) videoToUse = prefs.videoSource;
          }
        } catch {
          // ignore invalid stored prefs
        }
      }
      if (!validImageIds.has(imageToUse)) imageToUse = DEFAULT_BLACKJACK_IMAGE_ID;
      if (!validVideoIds.has(videoToUse)) videoToUse = 'glowingTable';
      if (cancelled) return;
      prefLoadedRef.current = true;
      setTheme(themeToUse);
      setImageSource(imageToUse);
      setVideoSource(videoToUse);
    })();
    return () => { cancelled = true; };
  }, [address, validImageIds, validVideoIds]);

  // Persist table background preference when it changes.
  // Guard on prefLoadedRef so we don't overwrite localStorage with a temporary
  // default value before the load effect has finished validating the saved UUID.
  useEffect(() => {
    if (!address || typeof window === 'undefined' || !prefLoadedRef.current) return;
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

  const handleVideoSourceChange = useCallback((id: string) => {
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
    refetchPlayerReserve,
    isPaused: contractIsPaused,
    emergencyPaused: contractEmergencyPaused,
    contractPaused: contractOzPaused,
  } = useBlackjackContract();

  // Off-chain balance state (like Stake.com)
  const [offChainBalance, setOffChainBalance] = useState<bigint>(BigInt(0));

  // Authoritative balance via HTTP — survives refresh; server resolves pending withdrawals and syncs from chain.
  const fetchBalanceFromApi = useCallback(async () => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl || !address) return;
    try {
      const res = await fetch(`${apiUrl}/api/player/${address}/balance`);
      if (!res.ok) return;
      const data = await res.json();
      const balance = BigInt(data?.balance ?? 0);
      setOffChainBalance(balance);
    } catch (err) {
      console.error('[Balance] HTTP balance fetch failed:', err);
    }
  }, [address]);

  // Chip stack for individual bet tracking
  const [chipStack, setChipStack] = useState<number[]>([]);

  /** Mobile manual entry: when set, bet comes from this (ether string) instead of chip stack. Cleared when desktop panel adds/clears chips. */
  const [manualBetAmount, setManualBetAmount] = useState<string | null>(null);

  // Last bet amount for rebet functionality
  const [lastBetAmount, setLastBetAmount] = useState<string>('0');


  // Game result for chip animations
  const [currentGameResult, setCurrentGameResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | null>(null);

  // Convert integer MORBIUS amount to chip stack (same denominations as rebet/half/double)
  const CHIP_VALUES = [50000, 25000, 5000, 500];
  const amountToChipStack = useCallback((amount: number): number[] => {
    const chips: number[] = [];
    let remaining = Math.floor(amount);
    for (const chipValue of CHIP_VALUES) {
      while (remaining >= chipValue) {
        chips.push(chipValue);
        remaining -= chipValue;
      }
    }
    return chips;
  }, []);

  // Custom chip stack manager (single betting panel: amount input updates both display and chip stack)
  const manageChipStack = useCallback((betAmount?: string, _chipValue?: number, clearAll?: boolean) => {
    if (clearAll) {
      setChipStack([]);
      setManualBetAmount(null);
      return;
    }
    if (betAmount === undefined) return;
    if (betAmount === '' || betAmount === '0') {
      setManualBetAmount(null);
      setChipStack([]);
      return;
    }
    const amount = Math.floor(parseFloat(betAmount) || 0);
    const maxBetNum = Number(formatEther(BET_LIMITS.MAX_BET));
    const clamped = Math.min(amount, maxBetNum);
    setManualBetAmount(String(clamped));
    setChipStack(amountToChipStack(clamped));
  }, [amountToChipStack]);

  // Total from chip stack
  const totalBetAmountFromChips = chipStack.reduce((sum, chip) => sum + chip, 0);
  // Effective total: manual amount or chip stack
  const effectiveTotalBetWei = manualBetAmount != null
    ? parseEther(manualBetAmount)
    : BigInt(totalBetAmountFromChips.toString() + '0'.repeat(18));
  const totalBetAmount = manualBetAmount != null ? parseFloat(manualBetAmount) || 0 : totalBetAmountFromChips;
  const displayBetAmount = manualBetAmount ?? (totalBetAmountFromChips > 0 ? formatEther(BigInt(totalBetAmountFromChips.toString() + '0'.repeat(18))) : '0');

  // Rebet: restore last bet amount
  const handleRebet = useCallback(() => {
    const lastBet = parseFloat(lastBetAmount);
    if (lastBet > 0) {
      const lastBetWei = BigInt(Math.floor(lastBet).toString() + '0'.repeat(18));
      if (lastBetWei > BET_LIMITS.MAX_BET) {
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is 100,000 MORBIUS. Cannot rebet ${lastBet} MORBIUS`
        });
        return;
      }
      setManualBetAmount(null);
      const chips: number[] = [];
      let remaining = Math.floor(lastBet);
      const chipValues = [50000, 25000, 5000, 500];
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
    const current = totalBetAmount;
    if (current <= 0) return;
    const half = Math.floor(current / 2);
    manageChipStack(half > 0 ? String(half) : '0');
  }, [totalBetAmount, manageChipStack]);

  // Double bet: double current bet
  const handleDoubleBet = useCallback(() => {
    const current = totalBetAmount;
    if (current <= 0) return;
    const doubleAmount = current * 2;
    const doubleAmountWei = BigInt(doubleAmount.toString() + '0'.repeat(18));
    if (doubleAmountWei > BET_LIMITS.MAX_BET) {
      toast.error('Bet limit exceeded', {
        description: `Maximum bet is 100,000 MORBIUS. Cannot double bet of ${Math.floor(current)} MORBIUS`
      });
      return;
    }
    manageChipStack(String(doubleAmount));
  }, [totalBetAmount, manageChipStack]);

  // Reset game result after chip animation completes
  // On loss: clear chips. On win/push/blackjack: restore to initial bet (undoes double-down/split inflation).
  const handleChipAnimationComplete = useCallback(() => {
    if (chipResultRef.current === 'loss') {
      manageChipStack('', undefined, true);
    } else if (initialBetRef.current > 0) {
      // Restore chip stack to the bet placed before double-down/split
      setManualBetAmount(null);
      setChipStack(amountToChipStack(initialBetRef.current));
    }
    chipResultRef.current = null;
    setCurrentGameResult(null);
  }, [manageChipStack, amountToChipStack]);

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

  // Block interactions outside game area while playing
  const { setGameLocked } = useGameLock();
  useEffect(() => {
    setGameLocked(gameState.isPlaying);
    return () => setGameLocked(false);
  }, [gameState.isPlaying, setGameLocked]);

  // Close deposit/withdraw modal when a hand starts (modal is disabled during play)
  useEffect(() => {
    if (gameState.isPlaying) setShowDepositModal(false);
  }, [gameState.isPlaying]);

  // Ref to track current game for callbacks that can't access gameState directly
  const currentGameRef = useRef<Game | null>(null);
  // Tracks the initial bet placed before double-down/split so rebet and chip restore use the correct amount
  const initialBetRef = useRef<number>(0);
  // When createGame is in progress, game_created handler skips (handleStartGame handles it)
  const createGameInProgressRef = useRef(false);
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
  const [tournamentBrowserInitialTab, setTournamentBrowserInitialTab] = useState<'join' | 'my' | 'freeroll' | 'history'>('join');
  const [showTournamentCreator, setShowTournamentCreator] = useState(false);
  const [showTournamentPinEntry, setShowTournamentPinEntry] = useState(false);
  const [pendingJoinTournament, setPendingJoinTournament] = useState<TournamentListItem | null>(null);

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
    },
  });

  // Tournament chip stack - derived from all player hands' bet amounts (supports split)
  // In tournament mode, betAmount is in chips (not MORBIUS), so we use it directly
  const tournamentChipStack = useMemo(() => {
    if (!tournament.tournamentState.inTournament || !gameState.currentGame) {
      return [];
    }
    const hands = gameState.currentGame.playerHands ?? (gameState.currentGame.playerHand ? [gameState.currentGame.playerHand] : []);
    if (hands.length === 0) return [];

    const TOURNAMENT_CHIP_VALUES = [1000, 500, 250, 100, 50];
    const allChips: number[] = [];

    for (const hand of hands) {
      const betAmount = Number(hand.betAmount ?? 0);
      if (betAmount <= 0) continue;
      let remaining = Math.floor(betAmount);
      for (const chipValue of TOURNAMENT_CHIP_VALUES) {
        while (remaining >= chipValue) {
          allChips.push(chipValue);
          remaining -= chipValue;
        }
      }
    }
    return allChips;
  }, [tournament.tournamentState.inTournament, gameState.currentGame]);

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

  // Fetch off-chain balance from server. Pass clientOverride when calling right after connect (before state updates).
  const fetchBalance = useCallback(async (clientOverride?: BlackjackWebSocketClient) => {
    const client = clientOverride ?? wsClient;
    const connected = clientOverride ? true : wsConnected;
    if (!client || !connected) {
      throw new Error('Not connected to game server. Please wait for connection or refresh the page.');
    }
    try {
      const { balance } = await client.getBalance();
      const balanceBigInt = BigInt(balance);
      setOffChainBalance(balanceBigInt);
      setGameState(prev => ({ ...prev, balance: balanceBigInt }));
    } catch (error) {
      console.error('[Balance] Failed to fetch balance:', error);
      throw error;
    }
  }, [wsClient, wsConnected]);

  // Sync balance with contract after deposit/withdraw
  const syncBalance = useCallback(async () => {
    const client = wsClient;
    const connected = wsConnected;
    if (!client || !connected) {
      throw new Error('Not connected to game server. Please wait for connection or refresh the page.');
    }
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
      throw error;
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

  // Pending game completion data — deferred until dealer reveal completes for immersion
  const pendingGameCompletionRef = useRef<{
    gameResult: GameResult;
    chartBetAmount: bigint;
    chartPayout: bigint;
    chartMeta: { gameId?: string; result?: string };
    ppResult?: string;
  } | null>(null);

  // Note: Payment method state no longer needed since only MORBIUS from reserve

  // Deposit/Withdraw modal state
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Profile (display name + avatar) for nav
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const { openProfileSettings } = useProfileSettingsModal();

  // View state
  const [currentView, setCurrentView] = useState<'game' | 'history' | 'stats' | 'analytics'>('game');
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

  // Open deposit modal when arriving with ?open=deposit (e.g. from Poker "Get chips")
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('open') === 'deposit') {
      setShowDepositModal(true);
    }
  }, [searchParams]);

  // Fetch real analytics data
  const { data: playerStatsData, isLoading: playerStatsLoading, refetch: refetchPlayerStats, error: playerStatsError } = usePlayerStatsEnhanced();
  // Only fetch global analytics when deployer is viewing the analytics tab (reduces server cost)
  const { data: globalAnalyticsData, isLoading: globalAnalyticsLoading, refetch: refetchGlobalAnalytics, error: globalAnalyticsError } = useGlobalAnalytics({
    enabled: isDeployer && currentView === 'analytics',
  });
  
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
    reserveBalance: typeof playerReserve === 'bigint' ? playerReserve : BigInt(0), // From contract
    pendingSettlements: Number(globalAnalyticsData.pending_settlements) || 0,
    failedSettlements: Number(globalAnalyticsData.failed_settlements) || 0,
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

  // Watch for deposit/withdrawal events to update balance immediately
  // Callbacks must be wrapped in useCallback to maintain hook order
  const handleDepositEvent = useCallback((player: string, morbiusAmount: bigint, plsAmount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      syncBalance().catch(() => {});
    }
  }, [address, syncBalance]);

  const handleDepositMORBIUSEvent = useCallback((player: string, amount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      syncBalance().catch(() => {});
    }
  }, [address, syncBalance]);

  const handleWithdrawalEvent = useCallback((player: string, amount: bigint) => {
    if (player.toLowerCase() === address?.toLowerCase()) {
      syncBalance().catch(() => {});
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
        normalizedAddress,
        signTypedDataAsync as any
      );

      // Set up event handlers
      client.on('game_created', (gameState: ServerGameState) => {
        // When createGame returns, handleStartGame handles it; skip here to avoid duplicate
        if (createGameInProgressRef.current) return;
        console.log('Game created:', gameState);
        const status = String((gameState as any)?.status);
        const isBlackjack = Array.isArray((gameState as any)?.playerHands) &&
          (gameState as any).playerHands.some((h: any) => h.result === 'blackjack' || h.isBlackjack);
        // Player blackjack: use phased deal so cards animate with same delay as other hands
        if (status === 'completed' && isBlackjack) {
          applyPhasedBlackjackDeal(gameState, (processedGame) => {
            if (processedGame) {
              const betAmount = processedGame.totalBetAmount ?? BigInt(0);
              const payout = processedGame.totalPayout ?? BigInt(0);
              const overallResult = 'blackjack';
              handleGameCompletion({
                gameId: processedGame.id,
                betAmount,
                payout,
                result: overallResult,
                processedGame,
              });
            }
          });
        } else {
          const processedGame = updateGameStateFromServer(gameState);
          if (status === 'completed' && processedGame) {
            const betAmount = processedGame.totalBetAmount ?? BigInt(0);
            const payout = processedGame.totalPayout ?? BigInt(0);
            const hasWin = Array.isArray(processedGame.playerHands) &&
              processedGame.playerHands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
            const allPush = Array.isArray(processedGame.playerHands) &&
              processedGame.playerHands.every((h: any) => h.result === 'push');
            const isBJ = Array.isArray(processedGame.playerHands) &&
              processedGame.playerHands.some((h: any) => h.result === 'blackjack');
            const overallResult = isBJ ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';
            handleGameCompletion({
              gameId: processedGame.id,
              betAmount,
              payout,
              result: overallResult,
              processedGame,
            });
          }
        }
      });

      client.on('game_updated', (payload: ServerGameState) => {
        // Only apply if this update is for the current game (avoid overwriting with another game's or stale state)
        const payloadGameId = String((payload as any)?.gameId ?? (payload as any)?.id ?? '');
        const currentId = currentGameRef.current?.id ?? null;
        if (currentId != null && payloadGameId !== '' && currentId !== payloadGameId) return;
        // Update game state and get the processed localGame
        const processedGame = updateGameStateFromServer(payload);
        
        // If game is completed, handle completion with the processed game data
        if ((payload as any)?.status === 'completed' && processedGame) {
          const betAmount = processedGame.totalBetAmount ?? BigInt(0);
          const payout = processedGame.totalPayout ?? BigInt(0);
          const hasWin = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.every((h: any) => h.result === 'push');
          const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';
          const isBlackjack = Array.isArray(processedGame.playerHands) && 
            processedGame.playerHands.some((h: any) => h.result === 'blackjack');
          
          handleGameCompletion({
            gameId: processedGame.id,
            betAmount,
            payout,
            result: isBlackjack ? 'blackjack' : overallResult,
            processedGame: processedGame // Pass the processed game with cards already extracted
          });
          // Balance refreshes after dealer reveal (handleDealerRevealComplete) for immersion
        }
      });

      client.on('game_completed', (_data: any) => {
        // Don't handle here - we already handle it in game_updated when status is 'completed'
        // Balance refreshes after dealer reveal (handleDealerRevealComplete) for immersion
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
          // Fetch initial balance (pass client - state may not have updated yet)
          fetchBalance(client).catch(() => {});
        })
        .catch((error) => {
          setWsConnected(false);
          const errorMessage = error?.message || 'Failed to connect to game server';
          console.error('[WS Page] Connection/auth failed:', errorMessage, error);
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

  // Track if we've done initial sync check per connection to avoid re-running
  const hasCheckedInitialSync = useRef<string | null>(null);

  // Fetch authoritative balance via HTTP on load / address change (survives refresh; no WebSocket required).
  useEffect(() => {
    if (!address || !getApiUrlOptional()) return;
    fetchBalanceFromApi().catch(() => {});
  }, [address, fetchBalanceFromApi]);

  // On WebSocket connection: sync balance once per connection (not on every wagmi poll).
  // syncBalance is delta-based on the server — safe to call on reconnect; it only
  // credits genuine new deposits and never restores gaming losses.
  useEffect(() => {
    const connectionKey = `${address}-${wsConnected}`;

    if (wsConnected && wsClient && address && hasCheckedInitialSync.current !== connectionKey) {
      hasCheckedInitialSync.current = connectionKey;
      if (!currentGameRef.current) {
        syncBalance().catch((error) => {
          console.error('[Balance] Sync failed on connection, falling back to fetch:', error);
          fetchBalance().catch(() => {});
        });
      } else {
        fetchBalance().catch((error) => {
          console.error('[Balance] Failed to fetch balance on connection:', error);
        });
      }
    }
  }, [wsConnected, wsClient, address, fetchBalance, syncBalance]);

  // Clear profile when wallet changes; fetch when WebSocket connects
  useEffect(() => {
    if (!address) {
      setProfileDisplayName(null);
      setProfileImageUrl(null);
      return;
    }
    if (!wsConnected || !wsClient) return;
    let cancelled = false;
    wsClient.getProfile().then((p) => {
      if (!cancelled) {
        setProfileDisplayName(p.displayName);
        setProfileImageUrl(p.profileImageUrl);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [address, wsConnected, wsClient]);

  // Fetch tournament list when game view is shown (tournaments panel is always visible)
  useEffect(() => {
    if (currentView === 'game' && wsClient) {
      tournament.fetchTournamentList();
    }
  }, [currentView, wsClient]);

  // Load game history from database when wallet connects
  useEffect(() => {
    if (!address || !playerGamesData || !Array.isArray(playerGamesData)) return;

    // Convert database Game[] to GameResult[] format
    const loadHistoryFromDatabase = async () => {
      const API_BASE_URL = getApiUrlOptional();
      if (!API_BASE_URL) return;
      const completedGames = playerGamesData.filter((game: any) => game.result && game.result !== 'ongoing' && game.completed_at);
      // Fetch game hands for all games in parallel
      const gamesWithHands = await Promise.all(
        completedGames
          .map(async (game: any) => {
            try {
              // Fetch game hands for this game
              const handsResponse = await fetch(`${API_BASE_URL}/api/game/${game.id}/hands`);
              const handsData = handsResponse.ok ? await handsResponse.json() : [];
              return { game, hands: Array.isArray(handsData) ? handsData : [] };
            } catch (error) {
              console.error(`Failed to fetch hands for game ${game.id}:`, error);
              return { game, hands: [] };
            }
          })
      );

      const databaseHistory: GameResult[] = gamesWithHands
        .map(({ game, hands }) => {
          const gameId = game.id;
          const gameRngVersion = Number(game.rng_version ?? 1);
          const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
          const suitFor = (idx: number) => {
            const salt = gameId.length;
            return suits[(idx + salt) % suits.length];
          };
          const toCard = (value: number, idx: number): Card => {
            const n = Number(value);
            if (gameRngVersion === 2 && n >= 0 && n <= 51) {
              const rank = (n % 13) + 1;
              const suitIndex = Math.floor(n / 13);
              return createCard(rank, suits[suitIndex % 4], false);
            }
            if (n >= 10 && n <= 133) {
              const v = Math.floor(n / 10);
              const suitIndex = n % 10;
              return createCard(v, suits[suitIndex % 4], false);
            }
            return createCard(n, suitFor(idx), false);
          };

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
              ...(result.isTournament && { isTournament: true }),
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
            ...(result.isTournament && { isTournament: true }),
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
  // Optional maxPlayerCards/maxDealerCards for phased deal (player blackjack) - limits visible cards per phase
  const updateGameStateFromServerCore = useCallback((serverGameState: any, maxPlayerCards?: number, maxDealerCards?: number) => {
    if (!address) return null;

    const gameId = String(serverGameState.gameId || serverGameState.id || '');
    const status = String(serverGameState.status || 'waiting');
    const currentHandIndex = Number(serverGameState.currentHandIndex ?? 0);

    const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
    const suitFor = (idx: number) => {
      const salt = gameId.length;
      return suits[(idx + salt) % suits.length];
    };
    // Detect RNG version from server state to decode card format (default 2 so 0-51 indices decode correctly)
    const isV2 = (serverGameState.rngVersion ?? 2) === 2;
    // V2: card index 0-51 (rank = idx%13+1, suit = floor(idx/13))
    // V1: encoded cards value*10+suit (10-133); or raw value 1-13
    const toCard = (raw: number, idx: number, hidden = false): Card => {
      const n = Number(raw);
      if (isV2 && n >= 0 && n <= 51) {
        const rank = (n % 13) + 1;
        const suitIndex = Math.floor(n / 13);
        return createCard(rank, suits[suitIndex % 4], hidden);
      }
      if (n >= 10 && n <= 133) {
        const value = Math.floor(n / 10);
        const suitIndex = n % 10;
        return createCard(value, suits[suitIndex % 4], hidden);
      }
      return createCard(n, suitFor(idx), hidden);
    };

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
      // Prefer total computed from cards (correct multi-ace logic); derive bust from that total so 15 never shows BUST
      return {
        id: String(h.id || `${gameId}-hand-${handIdx}`),
        cards,
        total: totals.total,
        hasAce: totals.hasAce,
        isBlackjack: Boolean(h.isBlackjack ?? false),
        isBust: totals.total > 21,
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

    // Phased deal: limit visible cards when maxPlayerCards/maxDealerCards provided (player blackjack)
    const playerHandsSliced = maxPlayerCards != null
      ? playerHands.map(h => {
          const slicedCards = h.cards.slice(0, maxPlayerCards);
          const totals = calculateHandTotal(slicedCards);
          return { ...h, cards: slicedCards, total: totals.total, hasAce: totals.hasAce };
        })
      : playerHands;
    const activePlayerHandSliced = playerHandsSliced[currentHandIndex] || playerHandsSliced[0];

    // Dealer cards - server sends only visible card(s) during player turn for security
    // When game completes, server sends all dealer cards for reveal animation
    const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
      ? serverGameState.dealerCards.map((c: any) => Number(c))
      : [];
    
    const dealerCardsRaw = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
    const dealerCards = maxDealerCards != null ? dealerCardsRaw.slice(0, maxDealerCards) : dealerCardsRaw;
    const dealerTotals = calculateHandTotal(dealerCardsRaw);
    const dealerTotalNum = Number(serverGameState.dealerTotal ?? dealerTotals.total);
    const dealerHasBlackjack = status === 'completed' && dealerCardsRaw.length === 2 && dealerTotalNum === 21;
    const dealerHand: Hand = {
      id: `${gameId}-dealer`,
      cards: dealerCards, // Sliced when phased deal
      total: dealerTotalNum,
      hasAce: Boolean(serverGameState.dealerHasAce ?? dealerTotals.hasAce),
      isBlackjack: dealerHasBlackjack,
      isBust: dealerTotalNum > 21,
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
      // Keep the legacy single-hand fields used throughout the page (use sliced for phased deal)
      playerHand: activePlayerHandSliced || {
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
      // Also keep multi-hand data for split support (use sliced for phased deal)
      playerHands: playerHandsSliced,
      currentHandIndex,
      totalBetAmount,
      totalPayout,
      canSplit: Boolean(serverGameState.canSplit ?? activePlayerHand?.canSplit ?? false),
      isBlackjack: Boolean(serverGameState.isBlackjack ?? activePlayerHand?.isBlackjack ?? false),
      perfectPairsBetAmount: serverGameState.perfectPairsBetAmount != null ? toBigIntSafe(serverGameState.perfectPairsBetAmount) : undefined,
      perfectPairsResult: serverGameState.perfectPairsResult ?? undefined,
      perfectPairsPayout: serverGameState.perfectPairsPayout != null ? toBigIntSafe(serverGameState.perfectPairsPayout) : undefined,
      timestamp: Date.now(),
      clientSeed: gameState.clientSeed,
    };

    // Keep isPlaying true when status is 'completed' until dealer reveal finishes (handleDealerRevealComplete)
    setGameState(prev => ({
      ...prev,
      currentGame: localGame,
      isPlaying: status === 'completed' ? true : status === 'player_turn' || status === 'dealer_turn',
    }));
    
    // Track new cards for animations (use sliced counts for phased deal)
    const currentPlayerCardCount = activePlayerHandSliced?.cards.length || 0;
    const currentDealerCardCount = dealerCards.length;
    
    if (currentPlayerCardCount > prevPlayerCardCount.current) {
      const newIndices = new Set<number>();
      for (let i = prevPlayerCardCount.current; i < currentPlayerCardCount; i++) {
        newIndices.add(i);
      }
      if (soundEnabled) playSound('/BlackJack/sounds/cards.wav');
      setNewCardIndices(prev => ({ ...prev, player: newIndices }));
      // Clear animation flags after animation completes
      // Account for staggered delay (250ms per card index) + animation duration (600ms) + buffer (100ms)
      const indicesArray = Array.from(newIndices);
      const maxIndex = indicesArray.length > 0 ? Math.max(...indicesArray) : 0;
      const animationDelay = maxIndex * 250; // Staggered delay in ms
      const animationDuration = ANIMATION_TIMINGS.CARD_DEAL;
      const totalTime = animationDelay + animationDuration + 100; // 100ms buffer
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.player);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, player: updated };
        });
      }, totalTime);
    }
    
    if (currentDealerCardCount > prevDealerCardCount.current) {
      const newIndices = new Set<number>();
      for (let i = prevDealerCardCount.current; i < currentDealerCardCount; i++) {
        newIndices.add(i);
      }
      if (soundEnabled) playSound('/BlackJack/sounds/cards.wav');
      setNewCardIndices(prev => ({ ...prev, dealer: newIndices }));
      // Clear animation flags after animation completes
      // Account for staggered delay (250ms per card index) + animation duration (600ms) + buffer (100ms)
      const indicesArray = Array.from(newIndices);
      const maxIndex = indicesArray.length > 0 ? Math.max(...indicesArray) : 0;
      const animationDelay = maxIndex * 250; // Staggered delay in ms
      const animationDuration = ANIMATION_TIMINGS.CARD_DEAL;
      const totalTime = animationDelay + animationDuration + 100; // 100ms buffer
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.dealer);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, dealer: updated };
        });
      }, totalTime);
    }
    
    prevPlayerCardCount.current = currentPlayerCardCount;
    prevDealerCardCount.current = currentDealerCardCount;
    
    // Return the processed localGame so it can be used immediately
    return localGame;
  }, [address, gameState.clientSeed, soundEnabled, playSound]);

  // Wrapper: normal flow or phased deal for player blackjack (cards animate with same delay as other hands)
  const updateGameStateFromServer = useCallback((serverGameState: any) => {
    return updateGameStateFromServerCore(serverGameState);
  }, [updateGameStateFromServerCore]);

  // Phased deal for player blackjack: simulate deal order (player, dealer, player, dealer)
  const DEAL_PHASE_MS = 250;
  const applyPhasedBlackjackDeal = useCallback((serverGameState: any, onComplete: (localGame: any) => void) => {
    const p1 = updateGameStateFromServerCore(serverGameState, 1, 0);
    if (!p1) { onComplete(null!); return; }
    const t1 = setTimeout(() => {
      updateGameStateFromServerCore(serverGameState, 2, 0);
      const t2 = setTimeout(() => {
        updateGameStateFromServerCore(serverGameState, 2, 1);
        const t3 = setTimeout(() => {
          const final = updateGameStateFromServerCore(serverGameState);
          onComplete(final!);
        }, DEAL_PHASE_MS);
      }, DEAL_PHASE_MS);
    }, DEAL_PHASE_MS);
    return () => { clearTimeout(t1); };
  }, [updateGameStateFromServerCore]);

  // Handle game completion
  const handleGameCompletion = useCallback((data: any) => {
    try {
      const payout: bigint =
        typeof data?.payout === 'bigint' ? data.payout : BigInt(String(data?.payout || '0'));
      const betAmount: bigint =
        typeof data?.betAmount === 'bigint' ? data.betAmount : BigInt(String(data?.betAmount || '0'));
      const profit: bigint = payout - betAmount;

      // Save last bet amount using the initial bet (before double-down/split inflated it)
      const betInMorbius = initialBetRef.current > 0 ? initialBetRef.current : Math.floor(Number(formatEther(betAmount)));
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

      // Chart + history updates are deferred to handleDealerRevealComplete for immersion

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
        
        const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
        const suitFor = (idx: number) => {
          const salt = gameId.length;
          return suits[(idx + salt) % suits.length];
        };
        const completionIsV2 = serverGameState.rngVersion === 2;
        const toCard = (value: number, idx: number, hidden = false): Card => {
          const n = Number(value);
          if (completionIsV2 && n >= 0 && n <= 51) {
            const rank = (n % 13) + 1;
            const suitIndex = Math.floor(n / 13);
            return createCard(rank, suits[suitIndex % 4], hidden);
          }
          if (n >= 10 && n <= 133) {
            const v = Math.floor(n / 10);
            const suitIndex = n % 10;
            return createCard(v, suits[suitIndex % 4], hidden);
          }
          return createCard(n, suitFor(idx), hidden);
        };

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
        } else {
          const currentPlayerHand = gameState.currentGame?.playerHand || createEmptyHand();
          playerHand = {
            ...currentPlayerHand,
            betAmount: currentPlayerHand.betAmount || betAmount
          };
        }
        
        if (extractedDealerHand && extractedDealerHand.cards.length > 0) {
          dealerHand = extractedDealerHand;
        } else {
          dealerHand = gameState.currentGame?.dealerHand || createEmptyHand();
        }
      } else {
        const currentPlayerHand = gameState.currentGame?.playerHand || createEmptyHand();
        playerHand = {
          ...currentPlayerHand,
          betAmount: currentPlayerHand.betAmount || betAmount
        };
        dealerHand = gameState.currentGame?.dealerHand || createEmptyHand();
      }

      // Detect split/double — prefer processedGame (fresh, synchronously returned by updateGameStateFromServer)
      // over gameState.currentGame which is from a stale React closure and will be the *previous* game
      // when the user clicks rebet quickly (setGameState is async, closure captures old value).
      const freshHands = data.processedGame?.playerHands;
      const allPlayerHands = freshHands && freshHands.length > 0
        ? freshHands
        : [playerHand];
      const wasSplit = allPlayerHands.length > 1;
      const wasDoubleDown = allPlayerHands.some((h: Hand) =>
        Array.isArray(h.actions) && h.actions.some((a: any) => a.type === 'double_down'));

      // For tournament: store bet/payout in chips for history display (QuickHistory uses chips, not wei)
      const isTournament = !!data.isTournament;
      // Use `payout` directly — it already holds processedGame.totalPayout (includes Perfect Pairs).
      // currentGame?.totalPayout is from a stale React closure and would be the *previous* game's
      // payout when the user clicks rebet quickly, corrupting the QuickHistory balance column.
      const payoutForHistory = isTournament
        ? BigInt(Math.floor(Number(payout) / 1e18))
        : payout;

      // Add to history
      const gameResult: GameResult = {
        gameId: data?.gameId ? String(data.gameId) : `game-${Date.now()}`,
        playerHand,
        dealerHand,
        payout: payoutForHistory,
        isBlackjack: data.result === 'blackjack',
        timestamp: Date.now(),
        ...(allPlayerHands.length > 0 && { playerHands: allPlayerHands }),
        ...(wasSplit && { wasSplit: true }),
        ...(wasDoubleDown && { wasDoubleDown: true }),
        ...(isTournament && { isTournament: true }),
      };

      // Store game result + chart data in ref — flushed in handleDealerRevealComplete for immersion
      pendingGameCompletionRef.current = {
        gameResult,
        chartBetAmount: betAmount,
        chartPayout: payout,
        chartMeta: {
          gameId: data?.gameId ? String(data.gameId) : undefined,
          result: data?.result ? String(data.result) : undefined,
        },
        ppResult: data.processedGame?.perfectPairsResult,
      };

      if (profit > BigInt(0)) {
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
  const handleCardsClearComplete = useCallback(() => {
    setGameState(prev => ({ ...prev, currentGame: null }));
  }, []);

  const handleDealerRevealComplete = useCallback(() => {
    // Commit displayed tournament state (chips, rank, hands) so sidebar doesn't show change until now
    if (tournament.tournamentState.inTournament) {
      tournament.commitDisplayState();
    }
    // Allow REBET/DEAL only after dealer hand is fully revealed.
    // Do NOT overwrite if user already started a new game (avoids race where DEAL was pressed
    // before reveal timeout fired — we'd incorrectly hide the action buttons).
    setGameState(prev => {
      if (prev.currentGame?.state === GameState.COMPLETE) {
        return { ...prev, isPlaying: false };
      }
      return prev;
    });
    // Trigger chip animation now that dealer reveal is complete
    if (pendingChipResult) {
      chipResultRef.current = pendingChipResult; // Store in ref for use in animation complete callback
      setCurrentGameResult(pendingChipResult);
      setPendingChipResult(null);
      // Play sound: dealer wins (including dealer blackjack)
      if (soundEnabled && pendingChipResult === 'loss') {
        playSound('/BlackJack/sounds/DealerWins.mp3');
      }
      // Play sound: player wins (including player blackjack — same as any other win). Never on push.
      if (soundEnabled && pendingChipResult !== 'push' && (pendingChipResult === 'win' || pendingChipResult === 'blackjack')) {
        playSound('/BlackJack/sounds/PlayerWins.mp3');
      }
    }

    // Show win notification
    if (pendingWinData) {
      setWinAmount(pendingWinData.amount);
      setIsBlackjackWin(pendingWinData.isBlackjack);
      setShowWinNotification(true);
      setPendingWinData(null);
    }

    // Flush pending game completion to history + chart (deferred for immersion)
    const pending = pendingGameCompletionRef.current;
    if (pending) {
      pendingGameCompletionRef.current = null;

      // Update P&L chart
      chartRef.current?.addGameResult(pending.chartBetAmount, pending.chartPayout, pending.chartMeta);

      // PP toasts
      const ppResult = pending.ppResult;
      if (ppResult === 'perfect') toast.success('Perfect Pair! 10:1', { description: 'Exact match — same rank and suit!' });
      else if (ppResult === 'colored') toast.success('Colored Pair! 12:1', { description: 'Same rank, same color!' });
      else if (ppResult === 'mixed') toast.success('Mixed Pair! 5:1', { description: 'Same rank, different color!' });

      // Add to history
      const gameResult = pending.gameResult;
      setGameState(prev => {
        const existingIndex = prev.history.findIndex(h => h.gameId === gameResult.gameId);
        if (existingIndex >= 0) {
          const shouldUpdate = gameResult.playerHand.cards.length > 0 || gameResult.dealerHand.cards.length > 0;
          if (shouldUpdate) {
            const updatedHistory = [...prev.history];
            updatedHistory[existingIndex] = gameResult;
            return { ...prev, history: updatedHistory, lastResult: gameResult };
          }
          return prev;
        }
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
              ...(result.isTournament && { isTournament: true }),
            }));
            localStorage.setItem(storageKey, JSON.stringify(historyToStore));
          } catch (error) {
            console.error('Failed to save history to localStorage:', error);
          }
        }

        return { ...prev, history: newHistory, lastResult: gameResult };
      });
    }

    // Refresh reserve display only after dealer hand is fully revealed (preserves immersion)
    fetchBalance().catch(() => {});
    // Refresh game history lists so Recent Games / Recent Plays update immediately
    queryClient.invalidateQueries({ queryKey: ['playerGames'] });
    queryClient.invalidateQueries({ queryKey: ['blackjackRecentGamesGlobal'] });
  }, [pendingWinData, pendingChipResult, soundEnabled, playSound, fetchBalance, address, tournament, queryClient]);

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle deposit/withdraw modal (disabled while a hand is in play)
  const handleOpenDepositModal = useCallback(() => {
    if (gameState.isPlaying) {
      toast.error('Finish your hand to deposit or withdraw');
      return;
    }
    setShowDepositModal(true);
  }, [gameState.isPlaying]);

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
        const status = String(gameState.status);
        const isPlayerBlackjack = status === 'completed' && Array.isArray(gameState.playerHands) &&
          gameState.playerHands.some((h: any) => h.result === 'blackjack' || h.isBlackjack);
        if (isPlayerBlackjack) {
          applyPhasedBlackjackDeal(gameState, (processedGame) => {
            if (processedGame) {
              const betAmountWei = gameState.totalBetAmount ? gameState.totalBetAmount * BigInt(1e18) : BigInt(betAmount) * BigInt(1e18);
              const payoutWei = gameState.totalPayout ? gameState.totalPayout * BigInt(1e18) : BigInt(0);
              handleGameCompletion({
                gameId: processedGame.id,
                betAmount: betAmountWei,
                payout: payoutWei,
                result: 'blackjack',
                processedGame,
                gameState: gameState,
                isTournament: true,
              });
            }
          });
        } else {
          const processedGame = updateGameStateFromServer(gameState);
          if (status === 'completed' && processedGame) {
            const betAmountWei = gameState.totalBetAmount ? gameState.totalBetAmount * BigInt(1e18) : BigInt(betAmount) * BigInt(1e18);
            const payoutWei = gameState.totalPayout ? gameState.totalPayout * BigInt(1e18) : BigInt(0);
            // For split, compute overall result from all hands (needed for chip animations)
            const hands = processedGame.playerHands ?? (processedGame.playerHand ? [processedGame.playerHand] : []);
            const hasWin = hands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
            const allPush = hands.length > 0 && hands.every((h: any) => h.result === 'push');
            const isBlackjack = hands.some((h: any) => h.result === 'blackjack');
            const overallResult = isBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';

            handleGameCompletion({
              gameId: processedGame.id,
              betAmount: betAmountWei,
              payout: payoutWei,
              result: overallResult,
              processedGame,
              gameState: gameState,
              isTournament: true,
            });
          }
        }
        // If game completed, isPlaying is set to false in handleDealerRevealComplete after dealer reveal
      } else {
        setGameState(prev => ({ ...prev, isPlaying: false }));
      }
    } catch (error: any) {
      console.error('Failed to start tournament game:', error);
      toast.error(error.message || 'Failed to start game');
      setGameState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [tournament, updateGameStateFromServer, applyPhasedBlackjackDeal, handleGameCompletion]);

  // Handle tournament player action
  const handleTournamentPlayerAction = useCallback(async (action: Action) => {
    if (!gameState.currentGame || !tournament.tournamentState.inTournament) return;

    try {
      // Pass currentHandIndex for split/double so server acts on the correct hand
      const handIndex = gameState.currentGame.currentHandIndex ?? 0;
      const gameStateResult = await tournament.performAction(action, handIndex);
      if (gameStateResult) {
        const processedGame = updateGameStateFromServer(gameStateResult);

        // If game completed, handle completion (including chart update)
        if (gameStateResult.status === 'completed' && processedGame) {
          // Tournament games use chips, convert to wei-equivalent for chart (1 chip = 1e18 wei for display)
          const betAmountWei = gameStateResult.totalBetAmount ? gameStateResult.totalBetAmount * BigInt(1e18) : BigInt(0);
          const payoutWei = gameStateResult.totalPayout ? gameStateResult.totalPayout * BigInt(1e18) : BigInt(0);
          
          // For split, compute overall result from all hands (needed for chip animations)
          const hands = processedGame.playerHands ?? (processedGame.playerHand ? [processedGame.playerHand] : []);
          const hasWin = hands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = hands.length > 0 && hands.every((h: any) => h.result === 'push');
          const isBlackjack = hands.some((h: any) => h.result === 'blackjack');
          const overallResult = isBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';

          handleGameCompletion({
            gameId: processedGame.id,
            betAmount: betAmountWei,
            payout: payoutWei,
            result: overallResult,
            processedGame,
            gameState: gameStateResult,
            isTournament: true,
          });
          // Do NOT set isPlaying=false here — wait for handleDealerRevealComplete so DEAL
          // doesn't appear too soon and cause a race (cards deal but action buttons don't show).
        }
      }
    } catch (error: any) {
      console.error('Failed to perform tournament action:', error);
      toast.error(error.message || 'Failed to perform action');
    }
  }, [gameState.currentGame, tournament, updateGameStateFromServer, handleGameCompletion]);

  // Handle starting a new game (optional Perfect Pairs side bet)
  const handleStartGame = useCallback(async (betAmount: bigint, _clientSeedFromPanel: string, perfectPairsBetAmount?: bigint) => {
    const sideBet = perfectPairsBetAmount ?? 0n;
    const totalStake = betAmount + sideBet;

    if (betAmount < BET_LIMITS.MIN_BET) {
      toast.error('Bet too small', { description: `Minimum bet is 1 MORBIUS` });
      return;
    }
    if (betAmount > BET_LIMITS.MAX_BET) {
      toast.error('Bet too large', { description: `Maximum bet is 100,000 MORBIUS` });
      return;
    }
    if (sideBet > BET_LIMITS.MAX_BET) {
      toast.error('Perfect Pairs bet too large');
      return;
    }

    const finalClientSeed = clientSeed || generateClientSeed();

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
      toast.error('Connecting to game server… try again in a second');
      return;
    }

    try {
      // Optimistically deduct the stake from displayed balance immediately so the UI
      // reflects the bet being drawn before the async fetchBalance() round-trip completes.
      setOffChainBalance(prev => prev >= totalStake ? prev - totalStake : BigInt(0));
      setGameState(prev => ({
        ...prev,
        isPlaying: true,
        clientSeed,
        balance: prev.balance >= totalStake ? prev.balance - totalStake : BigInt(0),
      }));

      // Step 1: Get server seed hash and nonce from server
      const { serverSeedHash, nonce } = await wsClient.getServerSeedHash();

      // Step 2: Generate game hash (must use total stake so server lock matches)
      const timestamp = Math.floor(Date.now() / 1000);
      const serverSeedForHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash;
      const hashInput = `${serverSeedForHash}:${finalClientSeed}:${nonce}:${totalStake.toString()}:${timestamp}`;

      const encoder = new TextEncoder();
      const data = encoder.encode(hashInput);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const gameHash = ('0x' + hashHex) as `0x${string}`;

      // Step 3: Create game on server (off-chain betting; total stake = main + Perfect Pairs)
      createGameInProgressRef.current = true;
      let serverGameState: any;
      try {
        serverGameState = await wsClient.createGame(betAmount, clientSeed, gameHash, sideBet > 0n ? sideBet : undefined);
      } finally {
        createGameInProgressRef.current = false;
      }

      // Apply returned game state. Player blackjack: use phased deal so cards animate with same delay as other hands.
      const status = String(serverGameState?.status);
      const isPlayerBlackjack = status === 'completed' && Array.isArray((serverGameState as any)?.playerHands) &&
        (serverGameState as any).playerHands.some((h: any) => h.result === 'blackjack' || h.isBlackjack);
      if (isPlayerBlackjack) {
        applyPhasedBlackjackDeal(serverGameState, (processedGame) => {
          if (processedGame) {
            handleGameCompletion({
              gameId: processedGame.id,
              betAmount: processedGame.totalBetAmount ?? BigInt(0),
              payout: processedGame.totalPayout ?? BigInt(0),
              result: 'blackjack',
              processedGame,
            });
          }
        });
      } else {
        const processedGame = updateGameStateFromServer(serverGameState);
        if (status === 'completed' && processedGame) {
          const completedBetAmount = processedGame.totalBetAmount ?? BigInt(0);
          const completedPayout = processedGame.totalPayout ?? BigInt(0);
          const hasWin = Array.isArray(processedGame.playerHands) &&
            processedGame.playerHands.some((h: any) => h.result === 'win' || h.result === 'blackjack');
          const allPush = Array.isArray(processedGame.playerHands) &&
            processedGame.playerHands.every((h: any) => h.result === 'push');
          const isBlackjack = Array.isArray(processedGame.playerHands) &&
            processedGame.playerHands.some((h: any) => h.result === 'blackjack');
          const overallResult = isBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss';
          handleGameCompletion({
            gameId: processedGame.id,
            betAmount: completedBetAmount,
            payout: completedPayout,
            result: overallResult,
            processedGame,
          });
        }
      }
      // Refresh balance (bet was deducted off-chain)
      fetchBalance().catch(() => {});
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
      // Restore the optimistically-deducted balance — the server never saw this bet.
      fetchBalance().catch(() => {});
    }
  }, [isConnected, address, wsConnected, wsClient, fetchBalance, updateGameStateFromServer, applyPhasedBlackjackDeal, handleGameCompletion]);

  // When Deal is clicked: if bet came from mobile manual entry, convert to chip stack so table shows chips, then start game
  const handleDealClick = useCallback(() => {
    if (manualBetAmount != null) {
      const amount = Math.floor(parseFloat(manualBetAmount) || 0);
      if (amount > 0) {
        setChipStack(amountToChipStack(amount));
        setManualBetAmount(null);
      }
    }
    // Capture initial bet before double-down/split can inflate it
    initialBetRef.current = Math.floor(Number(formatEther(effectiveTotalBetWei)));
    const ppBetWei = perfectPairsBet > 0 ? BigInt(perfectPairsBet) * BigInt(10 ** 18) : undefined;
    handleStartGame(effectiveTotalBetWei, clientSeed, ppBetWei);
  }, [manualBetAmount, effectiveTotalBetWei, clientSeed, handleStartGame, amountToChipStack, perfectPairsBet]);

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
    const chipValues = [50000, 25000, 5000, 500];
    for (const chipValue of chipValues) {
      while (remaining >= chipValue) {
        chips.push(chipValue);
        remaining -= chipValue;
      }
    }
    setChipStack(chips);
    initialBetRef.current = Math.floor(lastBet);
    const ppBetWei = perfectPairsBet > 0 ? BigInt(perfectPairsBet) * BigInt(10 ** 18) : undefined;
    handleStartGame(lastBetWei, clientSeed, ppBetWei);
  }, [lastBetAmount, clientSeed, handleStartGame, perfectPairsBet]);

  // Note: Approval handling no longer needed since bets come from reserve

  const openVerifyView = useCallback((gameId: string) => {
    setInitialVerifyGameId(gameId);
    // Verify view removed - navigation handled elsewhere
  }, []);

  // Stable callback for verification "initial game id consumed" (avoids verify effect re-running every render)
  const handleInitialVerifyGameIdConsumed = useCallback(() => setInitialVerifyGameId(null), []);

  // Handle player actions
  const handlePlayerAction = useCallback(async (action: Action) => {
    if (!gameState.currentGame || !wsClient || !wsConnected) return;

    try {
      // Send action to server
      const serverGameState = await wsClient.playerAction(gameState.currentGame.id, action);
      updateGameStateFromServer(serverGameState);
      // Balance refreshes after dealer reveal (handleDealerRevealComplete) for immersion
      return;
    } catch (error) {
      console.error('Failed to perform action:', error);
      // Show the actual error message from the server (e.g., "Insufficient balance...")
      const errorMessage = error instanceof Error ? error.message : 'Failed to perform action';
      toast.error(errorMessage);

      // Revert optimistic chip stack when double down/split failed (e.g. insufficient funds)
      if ((action === Action.DOUBLE_DOWN || action === Action.SPLIT) && /insufficient/i.test(errorMessage)) {
        setChipStack(prev => (prev.length <= 1 ? prev : prev.slice(0, Math.floor(prev.length / 2))));
      }

      // Refresh balance in case it's a balance-related error
      fetchBalance().catch(() => {});
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

      // Convert card to display rank (1-13). Handles Card objects, raw ranks 1-13, and deck indices 0-51.
      const toDisplayRank = (c: unknown): number => {
        const n = typeof c === 'object' && c !== null && 'value' in c ? (c as { value: number }).value : Number(c);
        if (n >= 0 && n <= 51) return (n % 13) + 1; // deck index → rank
        return Math.max(1, Math.min(13, n)); // clamp rank
      };

      const playerHands = handsToMap.map((hand) => {
        const cards = Array.isArray(hand.cards)
          ? hand.cards.map(c => toDisplayRank(c))
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
        ? result.dealerHand.cards.map(c => toDisplayRank(c))
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
  
  // Player needs handBetAmount remaining AFTER the initial bet was deducted to double/split
  const hasBalanceForDoubleOrSplit = !tournament.tournamentState.inTournament
    ? offChainBalance >= handBetAmount
    : tournament.tournamentState.chips >= Number(handBetAmount);

  const canDoubleDown = currentGame?.state === GameState.PLAYER_TURN &&
    activeHand &&
    activeHand.cards.length === 2 &&
    canDoubleDownByBetLimit &&
    hasBalanceForDoubleOrSplit;

  // Can split when player has exactly 2 cards of the same blackjack value (10/J/Q/K interchangeable)
  // Also check if splitting would exceed MAX_BET (split requires 2x bet)
  const canSplitByBetLimit = doubleBetAmount <= BET_LIMITS.MAX_BET;
  const getSplitValue = (v: number) => (v >= 10 && v <= 13) ? 10 : v;
  const canSplit = currentGame?.state === GameState.PLAYER_TURN &&
    activeHand &&
    activeHand.cards.length === 2 &&
    getSplitValue(activeHand.cards[0].value) === getSplitValue(activeHand.cards[1].value) &&
    (!currentGame.playerHands || currentGame.playerHands.length <= 1) && // Can't split again if already split
    canSplitByBetLimit &&
    hasBalanceForDoubleOrSplit;

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto w-full no-scrollbar"
      style={{
        background: 'linear-gradient(145deg, rgb(10, 15, 20), rgb(16, 26, 35))',
      }}
    >
      {/* Background music audio element - single instance */}
      <audio
        ref={musicAudioRef}
        src={BLACKJACK_MUSIC_PLAYLIST[musicTrackIndex]}
        onEnded={handleMusicEnded}
        loop={false}
        preload="metadata"
        style={{ display: 'none' }}
      />

      <GlobalMainNav
        onOpenDepositModal={handleOpenDepositModal}
        reserveBalance={offChainBalance}
        currentView={currentView}
        onViewChange={setCurrentView}
        theme={theme}
        onThemeChange={setTheme}
        imageSource={imageSource}
        onImageSourceChange={setImageSource}
        videoSource={videoSource}
        onVideoSourceChange={handleVideoSourceChange}
        imageOptions={imageOptions}
        videoOptions={videoOptions}
        videoSyncToClock={videoSyncToClock}
        onVideoSyncToClockChange={setVideoSyncToClock}
        videoPosition={videoPosition}
        onVideoPositionChange={setVideoPosition}
        soundEnabled={soundEnabled}
        onSoundChange={setSoundEnabled}
        themeModalOpen={themeModalOpen}
        onThemeModalOpenChange={setThemeModalOpen}
        onTournamentLobby={() => {
          setTournamentBrowserInitialTab('join');
          setShowTournamentBrowser(true);
        }}
        profileDisplayName={profileDisplayName}
        profileImageUrl={profileImageUrl}
        onOpenProfileSettings={() =>
          openProfileSettings({
            displayName: profileDisplayName ?? '',
            profileImageUrl,
            onSave: async (displayName, profileImageUrl) => {
              if (!wsClient) return;
              const res = await wsClient.setDisplayName(displayName, profileImageUrl);
              setProfileDisplayName(res.displayName);
              setProfileImageUrl(res.profileImageUrl);
              if (address) {
                queryClient.invalidateQueries({ queryKey: ['playerProfile', address] });
              }
            },
          })
        }
        musicTrackName={BLACKJACK_MUSIC_PLAYLIST[musicTrackIndex].split('/').pop()?.replace('.mp3', '') ?? 'Music'}
        isMusicPlaying={isMusicPlaying}
        onToggleMusic={toggleMusic}
        onNextTrack={nextTrack}
      >

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

      <main className="w-full max-w-full mx-0 px-2 sm:px-4 pt-2 sm:pt-4 pb-4 sm:pb-8 overflow-x-hidden overflow-y-auto no-scrollbar">
        {/* View-specific content */}
        {currentView === 'game' && (
          <>
        {/* Show when smart contract is paused (on-chain) */}
        {contractIsPaused && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
            <strong>Blackjack contract is paused.</strong> Deposits, withdrawals, and betting are disabled on-chain.
            {contractEmergencyPaused && ' Emergency pause is active (emergency admin must call setEmergencyPause(false)).'}
            {contractOzPaused && !contractEmergencyPaused && ' Owner has paused the contract (owner must call unpause()).'}
          </div>
        )}
        {/* Show when game server is not configured (so user knows why they can't connect) */}
        {!getWebSocketUrlOptional() && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-sm">
            <strong>Game server not connected.</strong>{' '}
            {typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? (
              <>Set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_WEBSOCKET_URL</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_API_URL</code> in your deployment (e.g. Vercel → Project → Settings → Environment Variables). Use your backend URL: <code className="font-mono text-xs bg-black/30 px-1 rounded">https://your-api.com</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">wss://your-api.com</code>. Then <strong>redeploy</strong> — Next.js bakes these in at build time.</>
            ) : (
              <>Set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_WEBSOCKET_URL</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_API_URL</code> in <code className="font-mono text-xs bg-black/30 px-1 rounded">.env.local</code> (e.g. <code className="font-mono text-xs bg-black/30 px-1 rounded">http://localhost:3001</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">ws://localhost:3001</code>), then restart the dev server. Run the backend with <code className="font-mono text-xs bg-black/30 px-1 rounded">cd server && npm run dev</code>.</>
            )}
          </div>
        )}
        {/* Game layout: table + betting fit when possible; min height so table stays usable */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] grid-rows-[1fr_auto_auto] md:grid-rows-[1fr_auto] gap-2 md:gap-4 min-h-0">
          {/* 1. Table + mobile controls (right of table on mobile) */}
          <div className="min-w-0 flex flex-row md:flex-col min-h-0 pb-0 -mx-2 sm:mx-0 order-1 md:order-none md:row-start-1 md:col-start-1 gap-2 md:gap-0">
          <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
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
              reserveBalance={tournament.tournamentState.inTournament ? BigInt((tournament.displayedTournamentState ?? tournament.tournamentState).chips) : offChainBalance}
              usePLS={false}
              newCardIndices={newCardIndices}
              chipStack={tournament.tournamentState.inTournament ? tournamentChipStack : chipStack}
              onClearBet={tournament.tournamentState.inTournament ? () => {} : () => manageChipStack('', undefined, true)}
              onStartGame={tournament.tournamentState.inTournament
                ? () => handleStartTournamentGame(TOURNAMENT_CONFIG.MIN_BET)
                : handleDealClick}
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
              isMusicPlaying={isMusicPlaying}
              onToggleMusic={toggleMusic}
              onNextTrack={nextTrack}
              musicVolume={musicVolume}
              onMusicVolumeChange={setMusicVolume}
              canDeal={tournament.tournamentState.inTournament
                ? !gameState.isPlaying && (tournament.displayedTournamentState ?? tournament.tournamentState).handsRemaining > 0
                : !gameState.isPlaying && totalBetAmount > 0}
              onBetAmountChange={tournament.tournamentState.inTournament ? () => {} : manageChipStack}
              currentBetAmount={tournament.tournamentState.inTournament ? String(TOURNAMENT_CONFIG.MIN_BET) : displayBetAmount}
              lastBetAmount={lastBetAmount}
              useVideoBackground={useVideoBackground}
              imageSource={imageSource}
              videoSource={videoSource}
              imageSrc={getThemeInfo({ kind: 'image', id: imageSource }).src}
              videoSrc={getThemeInfo({ kind: 'video', id: videoSource }).src}
              videoSyncToClock={videoSyncToClock}
              videoPosition={videoPosition}
              onOpenDepositModal={handleOpenDepositModal}
              onOpenTableThemeSelector={() => setThemeModalOpen(true)}
              soundEnabled={soundEnabled}
              onPlaySfx={playSound}
              hideBettingPanel={true}
              completedGameId={currentGame?.state === GameState.COMPLETE ? currentGame?.id : undefined}
              onCardsClearComplete={handleCardsClearComplete}
              perfectPairsBet={tournament.tournamentState.inTournament ? 0 : perfectPairsBet}
              onPerfectPairsBetChange={tournament.tournamentState.inTournament ? undefined : setPerfectPairsBet}
              perfectPairsResult={tournament.tournamentState.inTournament ? undefined : currentGame?.perfectPairsResult}
              tournamentHandSummary={tournament.tournamentState.inTournament ? tournament.lastHandSummary : null}
              onDismissTournamentSummary={tournament.clearLastHandSummary}
              onOpenTournamentHistory={() => {
                setTournamentBrowserInitialTab('history');
                setShowTournamentBrowser(true);
              }}
              inTournament={tournament.tournamentState.inTournament}
            />

            {/* Win Notification */}
            {showWinNotification && (
              <WinNotification
                amount={winAmount}
                isBlackjack={isBlackjackWin}
                onComplete={() => setShowWinNotification(false)}
              />
            )}

          </div>

        </div>

          {/* 3. Betting panel (always visible) + tabbed sidebar */}
          <div className="min-w-0 order-3 md:order-none md:row-start-1 md:col-start-2 flex flex-col gap-2 overflow-hidden">
          {tournament.tournamentState.inTournament ? (
            <TournamentBetPanel
              chips={(tournament.displayedTournamentState ?? tournament.tournamentState).chips}
              onStartGame={handleStartTournamentGame}
              isPlaying={gameState.isPlaying}
              handsRemaining={(tournament.displayedTournamentState ?? tournament.tournamentState).handsRemaining}
              gameResult={currentGameResult}
              onHit={() => handleTournamentPlayerAction(Action.HIT)}
              onStand={() => handleTournamentPlayerAction(Action.STAND)}
              onDoubleDown={() => handleTournamentPlayerAction(Action.DOUBLE_DOWN)}
              onSplit={() => handleTournamentPlayerAction(Action.SPLIT)}
              canHit={canHit}
              canStand={canStand}
              canDoubleDown={canDoubleDown && (tournament.displayedTournamentState ?? tournament.tournamentState).chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0)}
              canSplit={canSplit && (tournament.displayedTournamentState ?? tournament.tournamentState).chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0)}
            />
          ) : (
            <div className="flex flex-row md:flex-col items-stretch w-full">
              <div className="w-1/2 md:w-full md:border-r-0 md:border-b border-r border-white/10 flex items-center min-w-0">
                <BettingPanelMobile
                  onStartGame={(betBigInt, _clientSeed) => {
                    const ppBetWei = perfectPairsBet > 0 ? BigInt(perfectPairsBet) * BigInt(10 ** 18) : undefined;
                    handleStartGame(betBigInt, clientSeed, ppBetWei);
                  }}
                  isPlaying={gameState.isPlaying}
                  onBetAmountChange={manageChipStack}
                currentBetAmount={displayBetAmount}
                onHalfBet={handleHalfBet}
                  onDoubleBet={handleDoubleBet}
                  playerReserves={offChainBalance}
                />
              </div>
              <div className="w-1/2 md:w-full flex items-stretch min-w-0">
                <BlackjackMobileActionBar
                  onRebetAndDeal={handleRebetAndDeal}
                  onStartGame={handleDealClick}
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
                  onPlaySfx={playSound}
                  alwaysVisible
                  perfectPairsBet={perfectPairsBet}
                  onPerfectPairsBetChange={setPerfectPairsBet}
                />
              </div>
            </div>
          )}
          <div className="md:h-[420px] overflow-hidden rounded-xl">
            <BlackjackSidebar
              history={gameState.history}
            reserveBalance={offChainBalance}
            chartRef={chartRef}
            chartSessionStartTime={chartSessionStartTime.current}
            wsClient={wsClient}
            wsConnected={wsConnected}
            onVerifyGameRequest={openVerifyView}
            inTournament={tournament.tournamentState.inTournament}
            tournamentTabContent={
              tournament.tournamentState.inTournament ? (
                <TournamentHUD
                  state={tournament.displayedTournamentState ?? tournament.tournamentState}
                  onLeave={async () => {
                    if (!confirm('Forfeit tournament? You will not be able to rejoin. This cannot be undone.')) return;
                    const success = await tournament.leaveTournament();
                    if (success) {
                      setShowTournamentComplete(false);
                      setIsTournamentMode(false);
                      fetchBalance().catch(() => {}); // Refresh balance after leaving
                      toast.success('Left tournament successfully');
                    } else {
                      toast.error('Failed to leave tournament');
                    }
                  }}
                />
              ) : null
            }
            />
          </div>
        </div>
        </div>

        {/* Recent Games + Table token: grid 2-col on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <TableTokenProfileCard
            key={`${theme}-${useVideoBackground ? videoSource : imageSource}`}
            themeKind={theme}
            themeId={useVideoBackground ? videoSource : imageSource}
            getThemeInfo={getThemeInfo}
            getTableProfile={getTableProfile}
            onChangeTableClick={() => setThemeModalOpen(true)}
          />
          <BlackjackRecentGames compact title="Recent Games" />
        </div>

        {/* Leaderboard + Recent Play (same as Plinko/Keno/Lottery) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mt-4 px-0 items-stretch">
          <div className="min-w-0 min-h-0 flex flex-col">
            <BlackjackTopPlayers />
          </div>
          <div className="min-w-0 min-h-0 flex flex-col">
            <BlackjackRecentPlays compact title="Recent Play" />
          </div>
        </div>

        {/* Tournament card - commented out
          <div
            className="min-h-[280px] lg:min-h-[340px] rounded-xl overflow-hidden flex flex-col min-w-0"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-cyan-300 font-semibold text-sm">Tournaments</h3>
              <button
                type="button"
                onClick={() => {
                  setTournamentBrowserInitialTab('history');
                  setShowTournamentBrowser(true);
                }}
                className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-slate-700/60 hover:bg-slate-600/60 text-cyan-300 border border-cyan-500/20 transition-colors"
              >
                History
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <TournamentListSidebar
                tournaments={tournament.tournamentList}
                isLoading={tournament.isLoading}
                isJoinLoading={tournament.isJoinLoading}
                onRefresh={() => tournament.fetchTournamentList()}
                onTournamentLobby={() => {
                  setTournamentBrowserInitialTab('join');
                  setShowTournamentBrowser(true);
                }}
                onCreateTournament={() => setShowTournamentCreator(true)}
                onJoin={(t) => {
                  if (tournament.tournamentState.inTournament && tournament.tournamentState.tournamentId === t.id) {
                    toast.success('You\'re already in this tournament');
                    return;
                  }
                  if (t.isPrivate) {
                    setPendingJoinTournament(t);
                    setShowTournamentPinEntry(true);
                  } else {
                    tournament.joinTournament(t.id, undefined, { onChainTournamentId: t.onChainTournamentId ?? undefined, buyInAmount: t.buyInAmount }).then(success => {
                      if (success) {
                        setIsTournamentMode(true);
                        toast.success('Joined tournament!');
                        fetchBalance();
                      }
                    });
                  }
                }}
                playerBalance={offChainBalance}
                playerAddress={address ?? null}
              />
            </div>
          </div>
          */}

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

        {/* Pending withdrawal banner — visible after page refresh without opening modal */}
        {pendingJob && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black text-white text-sm px-4 py-3 rounded-xl shadow-lg border border-white/10 max-w-sm w-full">
            <svg className="animate-spin h-4 w-4 shrink-0 text-white/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="flex-1">
              {pendingJob.status === 'pending_confirmation'
                ? <>Withdrawal confirming on chain&hellip; {pendingJob.txHash && <span className="text-white/50">{pendingJob.txHash.slice(0, 10)}…</span>}</>
                : 'Withdrawal processing\u2026'}
            </span>
          </div>
        )}

        {/* Deposit/Withdraw Modal (available on all views) */}
        <DepositWithdrawModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          balanceLabel="Reserve Balance"
          onBalanceSync={async () => {
            await fetchBalanceFromApi();
            await syncBalance().catch(() => {});
          }}
          onRefreshBalance={async () => {
            await fetchBalanceFromApi();
            await fetchBalance().catch(() => {});
          }}
          onWithdrawSuccess={async () => { await refetchPlayerReserve(); clearPendingJob(); }}
          contractReserve={typeof playerReserve === 'bigint' ? playerReserve : BigInt(0)}
          externalBalance={offChainBalance}
          externalWithdrawLock={!!pendingJob}
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
              fetchBalance().catch(() => {});
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
          onClose={async () => {
            // If still in tournament, actually leave it
            if (tournament.tournamentState.inTournament) {
              const success = await tournament.leaveTournament();
              if (success) {
                toast.success('Left tournament successfully');
              } else {
                toast.error('Failed to leave tournament');
              }
            }
            setShowTournamentComplete(false);
            setIsTournamentMode(false);
            fetchBalance(); // Refresh balance after tournament ends
          }}
          onPlayAgain={() => {
            setShowTournamentComplete(false);
            setShowTournamentEntry(true);
          }}
          onBrowseTournaments={() => {
            setShowTournamentComplete(false);
            setShowTournamentBrowser(true);
            setIsTournamentMode(false);
          }}
          state={tournament.tournamentState}
          tournamentName={tournament.tournamentInfo?.name}
          prizeWon={tournament.tournamentState.status === 'completed' && tournament.tournamentState.currentRank <= 10
            ? tournament.getPrizeForRank(tournament.tournamentState.currentRank, BigInt(tournament.tournamentInfo?.prizePool || '0'))
            : 0n}
          prizePool={tournament.tournamentInfo?.prizePool}
        />

        {/* Tournament Browser Modal */}
        <TournamentBrowser
          isOpen={showTournamentBrowser}
          initialTab={tournamentBrowserInitialTab}
          onClose={() => setShowTournamentBrowser(false)}
          getThemeInfo={getThemeInfo}
          currentTournamentId={tournament.tournamentState.inTournament ? tournament.tournamentState.tournamentId : null}
          onJoin={(t) => {
            // Already in this tournament — resume without re-joining (no sign, no pay)
            if (tournament.tournamentState.inTournament && tournament.tournamentState.tournamentId === t.id) {
              setShowTournamentBrowser(false);
              toast.success('Resuming tournament');
              return;
            }
            if (t.isPrivate) {
              setPendingJoinTournament(t);
              setShowTournamentPinEntry(true);
            } else {
              tournament.joinTournament(t.id, undefined, { onChainTournamentId: t.onChainTournamentId ?? undefined, buyInAmount: t.buyInAmount }).then(success => {
                if (success) {
                  setShowTournamentBrowser(false);
                  setIsTournamentMode(true);
                  toast.success('Joined tournament!');
                  fetchBalance().catch(() => {});
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
          isJoinLoading={tournament.isJoinLoading}
          playerBalance={offChainBalance}
          playerAddress={address ?? null}
          wsClient={wsClient}
          onFreerollJoined={async (tournamentId) => {
            setShowTournamentBrowser(false);
            await tournament.fetchTournamentState();
            await tournament.fetchTournamentInfo();
            setIsTournamentMode(true);
            toast.success('Joined freeroll!');
          }}
          tournamentHistory={tournament.tournamentHistory}
          isHistoryLoading={tournament.isHistoryLoading}
          onFetchHistory={tournament.fetchTournamentHistory}
          onUnregister={async (tournamentId) => {
            const success = await tournament.unregisterTournament(tournamentId);
            if (success) {
              await tournament.fetchTournamentList();
              fetchBalance().catch(() => {});
            }
            return success;
          }}
        />

        {/* Tournament Creator Modal */}
        <TournamentCreator
          isOpen={showTournamentCreator}
          onClose={() => setShowTournamentCreator(false)}
          onCreate={async (params: CreateTournamentRequest) => {
            const result = await tournament.createTournament(params);
            if (result) {
              toast.success('Tournament created!');
              await tournament.fetchTournamentList();
              return result;
            }
            return null;
          }}
          onCreateFreeroll={async (params) => {
            const result = await tournament.createFreeroll(params);
            if (result) {
              toast.success('Freeroll created!');
              await tournament.fetchTournamentList();
              return result;
            }
            return null;
          }}
          isLoading={tournament.isLoading}
          playerBalance={offChainBalance}
        />

        {/* Confirm Join overlay (Phase 2 of buy-in tournament join — fires fresh user gesture for wallet popup) */}
        {tournament.joinApprovalReady && (
          <div className="fixed bottom-6 right-6 z-[200] rounded-2xl border border-cyan-400/60 shadow-2xl shadow-cyan-500/30 p-5 w-72" style={{ background: 'rgba(10,20,40,0.97)' }}>
            <p className="text-cyan-300 font-semibold mb-1">Approval confirmed!</p>
            <p className="text-gray-400 text-sm mb-4">Click below to complete your tournament join.</p>
            <button
              onClick={() => {
                tournament.confirmJoin().then(success => {
                  if (success) {
                    setShowTournamentBrowser(false);
                    setIsTournamentMode(true);
                    toast.success('Joined tournament!');
                    fetchBalance().catch(() => {});
                  }
                });
              }}
              disabled={tournament.isJoinLoading}
              className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {tournament.isJoinLoading ? 'Confirming...' : 'Confirm Join'}
            </button>
          </div>
        )}

        {/* Tournament PIN Entry Modal */}
        <TournamentPinEntry
          isOpen={showTournamentPinEntry}
          onClose={() => {
            setShowTournamentPinEntry(false);
            setPendingJoinTournament(null);
          }}
          onSubmit={async (pin) => {
            if (!pendingJoinTournament) return false;
            const success = await tournament.joinTournament(pendingJoinTournament.id, pin, {
              onChainTournamentId: pendingJoinTournament.onChainTournamentId ?? undefined,
              buyInAmount: pendingJoinTournament.buyInAmount,
            });
            if (success) {
              setShowTournamentPinEntry(false);
              setShowTournamentBrowser(false);
              setPendingJoinTournament(null);
              setIsTournamentMode(true);
              toast.success('Joined private tournament!');
              fetchBalance().catch(() => {});
            }
            return success;
          }}
          isLoading={tournament.isJoinLoading}
        />

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
              <PlayerStatsDashboard stats={playerStats} isLoading={playerStatsLoading} playerAddress={address ?? null} wsClient={wsConnected ? wsClient : null} reserveBalance={offChainBalance} />
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

      </main>

      {/* FAQ (includes contract addresses) */}
      <div className="w-full flex justify-center py-4 px-4">
        <GameFAQ
          game="blackjack"
          addresses={[
            { label: 'Blackjack Contract', address: BLACKJACK_ADDRESS },
            { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
          ]}
        />
      </div>

      <Footer />
      </GlobalMainNav>

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