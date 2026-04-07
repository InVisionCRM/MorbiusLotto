'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, usePublicClient, useSignTypedData } from 'wagmi';
import { useGameLock } from '@/contexts/game-lock-context';
import { toast } from 'sonner';
import { keccak256, toHex, encodePacked } from 'viem';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Footer } from '@/components/shared/footer';
import { useSpeechCommands, type BJSpeechAction } from '@/hooks/use-speech-commands';
import { useSpeechEnabled } from '@/hooks/use-speech-enabled';
import { SophieSplashModal } from '@/components/shared/SophieSplashModal';
import { SpeechHUD } from '@/components/shared/SpeechHUD';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { BlackjackAuxViews } from '@/components/BLACKJACK/BlackjackAuxViews';
// GameVerificationTools removed - use /BLACKJACK/verify page instead
import BlackjackRealTimeBetChart, { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart';
import { BlackjackStatusOverlays } from '@/components/BLACKJACK/BlackjackStatusOverlays';
import { BlackjackTournamentOverlays } from '@/components/BLACKJACK/BlackjackTournamentOverlays';
import { BlackjackGameView } from '@/components/BLACKJACK/BlackjackGameView';
import { BlackjackHowToSection } from '@/components/BLACKJACK/BlackjackHowToSection';
import { useProfileSettingsModal } from '@/components/shared/ProfileSettingsModalContext';
import { Card, Hand, Game, GameState, Action, GameResult, GameStateUI } from './types';
import { useTournament } from '@/hooks/use-tournament';
import {
  TournamentHUD,
} from '@/components/BLACKJACK/Tournament';
import { TournamentListItem } from '@/lib/tournament-types';
import { BET_LIMITS, BET_TIERS, BlackjackTier, BLACKJACK_DEPLOYER_WALLET, DEFAULT_BLACKJACK_IMAGE_ID, BlackjackThemeKind, SOUNDS_TIP } from './constants';
// import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useBlackjackContract, useWatchDeposits, useWatchDepositsMORBIUS, useWatchWithdrawals } from '@/hooks/use-blackjack-contract';
import { useBlackjackServerSync } from '@/hooks/use-blackjack-server-sync';
import { useBlackjackCompletionOrchestrator } from '@/hooks/use-blackjack-completion-orchestrator';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { usePendingWithdrawal } from '@/hooks/use-pending-withdrawal';
import { BlackjackWebSocketClient, GameState as ServerGameState } from '@/lib/websocket-client';
import { formatEther, parseEther } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { usePlayerStatsEnhanced, useGlobalAnalytics, usePlayerGames } from '@/hooks/use-blackjack-stats';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { useAudio, AudioManager } from '@/hooks/use-audio';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[30px]">
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

// Tier picker shown after the intro, before the game
function TierPickerScreen({ onSelect }: { onSelect: (tier: BlackjackTier) => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))' }}
    >
      <div className="flex flex-col items-center gap-8 px-4 w-full max-w-md">
        {/* Header */}
        <div className="text-center">
          <div className="text-white text-2xl font-bold tracking-wide mb-1">Choose Your Table</div>
          <div className="text-slate-400 text-sm">Select a bet range to begin</div>
        </div>

        {/* Tier cards */}
        <div className="flex flex-col gap-4 w-full">
          {(Object.entries(BET_TIERS) as [BlackjackTier, typeof BET_TIERS[BlackjackTier]][]).map(([tier, info]) => (
            <button
              key={tier}
              onClick={() => onSelect(tier)}
              className="group relative w-full rounded-2xl border border-slate-700 bg-slate-900/80 hover:border-cyan-500/60 hover:bg-slate-800/80 transition-all duration-200 overflow-hidden text-left px-6 py-5"
            >
              {/* Subtle gradient accent on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.07) 0%, rgba(147,51,234,0.07) 100%)' }} />

              <div className="relative flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {/* Card suit icon */}
                    <span className="text-base" style={{ color: tier === 'high' ? '#a855f7' : '#06b6d4' }}>
                      {tier === 'high' ? '♠' : '♦'}
                    </span>
                    <span className="text-white font-bold text-base">{info.label}</span>
                  </div>
                  <div className="text-slate-400 text-sm">{info.description} MORBIUS</div>
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors duration-200"
                  style={{
                    borderColor: tier === 'high' ? 'rgba(168,85,247,0.4)' : 'rgba(6,182,212,0.4)',
                    background: tier === 'high' ? 'rgba(168,85,247,0.1)' : 'rgba(6,182,212,0.1)',
                  }}
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="text-slate-600 text-xs">Provably fair · MORBIUS bets</div>
      </div>
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
  // Tier state — null until player picks (or ?tier= param pre-selects)
  const [selectedTier, setSelectedTier] = useState<BlackjackTier | null>(null);
  // Active bet limits derived from selected tier
  const tierLimits = selectedTier ? BET_TIERS[selectedTier] : BET_LIMITS;

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
  const [dealerVoiceEnabled, setDealerVoiceEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const { playSound: playSoundBase } = useAudio(soundEnabled);
  const playSfx = useCallback(
    (path: string, volume?: number) => {
      if (!sfxEnabled) return;
      playSoundBase(path, volume);
    },
    [sfxEnabled, playSoundBase]
  );
  const dealerVoiceRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);

  // Play a dealer voice line on a dedicated channel (stops any currently playing voice)
  const playDealerVoice = useCallback(async (path: string, volume = 0.5) => {
    if (!soundEnabled || !dealerVoiceEnabled) return;
    if (dealerVoiceRef.current) {
      try { dealerVoiceRef.current.source.stop(); } catch { /* already stopped */ }
      dealerVoiceRef.current = null;
    }
    const ctx = AudioManager.getContext();
    if (!ctx || ctx.state !== 'running') { playSoundBase(path, volume); return; }
    try {
      const buf = await AudioManager.loadSound(path);
      if (!buf) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buf;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => { if (dealerVoiceRef.current?.source === source) dealerVoiceRef.current = null; };
      source.start(0);
      dealerVoiceRef.current = { source, gain };
    } catch {
      playSoundBase(path, volume);
    }
  }, [soundEnabled, dealerVoiceEnabled, playSoundBase]);

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
      let imageToUse = apiDefault.themeKind === 'image' ? apiDefault.tableId : DEFAULT_BLACKJACK_IMAGE_ID;
      let videoToUse = apiDefault.themeKind === 'video' ? apiDefault.tableId : 'glowingTable';
      if (key) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const prefs = JSON.parse(raw) as { theme?: string; imageSource?: string; videoSource?: string };
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
      setTheme('image');
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
    isPaused: contractIsPaused,
    emergencyPaused: contractEmergencyPaused,
    contractPaused: contractOzPaused,
  } = useBlackjackContract();

  // Off-chain balance state (like Stake.com)
  const [offChainBalance, setOffChainBalance] = useState<bigint>(BigInt(0));

  // Authoritative playable balance via HTTP — survives refresh; server resolves pending withdrawals; DB is source of truth.
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
  const [currentGameResult, setCurrentGameResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>(null);

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
    const maxBetNum = Number(formatEther(tierLimits.MAX_BET));
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
      if (lastBetWei > tierLimits.MAX_BET) {
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS. Cannot rebet ${lastBet} MORBIUS`
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
    if (doubleAmountWei > tierLimits.MAX_BET) {
      toast.error('Bet limit exceeded', {
        description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS. Cannot double bet of ${Math.floor(current)} MORBIUS`
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
      if (newTotalWei > tierLimits.MAX_BET) {
        const currentMorbius = Number(formatEther(BigInt(currentTotal.toString() + '0'.repeat(18))));
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS. Cannot double down bet of ${currentMorbius.toFixed(0)} MORBIUS`
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
      if (doubleAmountWei > tierLimits.MAX_BET) {
        const currentMorbius = Number(formatEther(BigInt(currentTotal.toString() + '0'.repeat(18))));
        toast.error('Bet limit exceeded', {
          description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS. Cannot split bet of ${currentMorbius.toFixed(0)} MORBIUS`
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

  // Tip dealer state
  const [tipAnimating, setTipAnimating] = useState(false);
  const [tipStats, setTipStats] = useState<{ totalTipAmountWei: string; tipCount: number; tippers: { address: string; displayName: string | null; totalWei: string; count: number }[] } | null>(null);

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
    } catch (error) {
      console.error('Failed to sync balance:', error);
      throw error;
    }
  }, [wsClient, wsConnected]);

  // Win notification state
  const [showWinNotification, setShowWinNotification] = useState(false);
  const [winAmount, setWinAmount] = useState<bigint>(BigInt(0));
  const [isBlackjackWin, setIsBlackjackWin] = useState(false);

  // Pending win data (waits for dealer reveal to complete)
  const [pendingWinData, setPendingWinData] = useState<{ amount: bigint; isBlackjack: boolean } | null>(null);

  // Pending game result for chip animation (waits for dealer reveal to complete)
  const [pendingChipResult, setPendingChipResult] = useState<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>(null);
  // Ref to track result for chip clearing after animation
  const chipResultRef = useRef<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>(null);

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
  // Also read ?tier= to pre-select a tier without showing the picker
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('open') === 'deposit') {
      setShowDepositModal(true);
    }
    const tierParam = searchParams.get('tier');
    if (tierParam === 'standard' || tierParam === 'high') {
      setSelectedTier(tierParam);
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
    // Deployer financial tab needs a bigint; was wrongly wired to on-chain player reserve.
    // Global API has no single “house MORBIUS balance” here — volume is a neutral placeholder for ratio checks.
    reserveBalance: globalAnalyticsData.total_volume || BigInt(0),
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

  // Fetch tip stats on load
  useEffect(() => {
    const base = getApiUrlOptional();
    if (!base) return;
    fetch(`${base}/api/tips/stats`).then(r => r.json()).then(d => setTipStats(d)).catch(() => {});
  }, []);

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

  const { updateGameStateFromServer, applyPhasedBlackjackDeal } = useBlackjackServerSync({
    address,
    clientSeed: gameState.clientSeed,
    setGameState,
    playSfx,
    prevPlayerCardCountRef: prevPlayerCardCount,
    prevDealerCardCountRef: prevDealerCardCount,
    setNewCardIndices,
    createCard,
    calculateHandTotal,
  });

  const handleCardsClearComplete = useCallback(() => {
    setGameState(prev => ({ ...prev, currentGame: null }));
  }, []);
  const { handleGameCompletion, handleDealerRevealComplete } = useBlackjackCompletionOrchestrator({
    currentGame: gameState.currentGame,
    address,
    initialBetRef,
    chipResultRef,
    pendingGameCompletionRef,
    pendingChipResult,
    pendingWinData,
    setPendingChipResult,
    setPendingWinData,
    setCurrentGameResult,
    setWinAmount,
    setIsBlackjackWin,
    setShowWinNotification,
    setLastBetAmount,
    setGameState,
    playDealerVoice,
    fetchBalance,
    tournament,
    queryClient,
    chartRef,
    createCard,
    createEmptyHand,
    calculateHandTotal,
  });

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle tier selection from the picker screen
  const handleTierSelect = useCallback((tier: BlackjackTier) => {
    setSelectedTier(tier);
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

    if (betAmount < tierLimits.MIN_BET) {
      toast.error('Bet too small', { description: `Minimum bet is ${Number(formatEther(tierLimits.MIN_BET)).toLocaleString()} MORBIUS` });
      return;
    }
    if (betAmount > tierLimits.MAX_BET) {
      toast.error('Bet too large', { description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS` });
      return;
    }
    if (sideBet > tierLimits.MAX_BET) {
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
    if (lastBetWei > tierLimits.MAX_BET) {
      toast.error('Bet limit exceeded', {
        description: `Maximum bet is ${Number(formatEther(tierLimits.MAX_BET)).toLocaleString()} MORBIUS. Cannot rebet ${lastBet} MORBIUS`,
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

  // ── Voice commands ────────────────────────────────────────────────────────
  const { enabled: speechEnabled, setEnabled } = useSpeechEnabled(address);
  const [lastSpeechAction, setLastSpeechAction] = useState<string | null>(null);
  const lastSpeechActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSpeechAction = useCallback((label: string) => {
    setLastSpeechAction(label);
    if (lastSpeechActionTimer.current) clearTimeout(lastSpeechActionTimer.current);
    lastSpeechActionTimer.current = setTimeout(() => setLastSpeechAction(null), 3000);
  }, []);

  const handleVoiceBJAction = useCallback((action: BJSpeechAction) => {
    if (action.type === 'hit')         { showSpeechAction('Hit'); handlePlayerAction(Action.HIT); return; }
    if (action.type === 'stand')       { showSpeechAction('Stand'); handlePlayerAction(Action.STAND); return; }
    if (action.type === 'double_down') { showSpeechAction('Double Down'); handlePlayerAction(Action.DOUBLE_DOWN); return; }
    if (action.type === 'split')       { showSpeechAction('Split'); handlePlayerAction(Action.SPLIT); return; }
    if (action.type === 'rebet')       { showSpeechAction('Rebet'); handleRebetAndDeal(); return; }
    if (action.type === 'bet') {
      showSpeechAction(`Bet ${action.amount.toLocaleString()} MORBIUS`);
      manageChipStack(String(Math.floor(action.amount)));
      handleStartGame(BigInt(Math.floor(action.amount)) * BigInt(10 ** 18), clientSeed);
    }
  }, [handlePlayerAction, handleRebetAndDeal, handleStartGame, manageChipStack, clientSeed, showSpeechAction]);

  const speech = useSpeechCommands({
    mode: 'blackjack',
    onBlackjackAction: handleVoiceBJAction,
  });

  // Start/stop listening based on the setting
  useEffect(() => {
    if (speechEnabled) speech.start();
    else speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechEnabled]);

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

  // Show tier picker if no tier selected yet
  if (!selectedTier) {
    return <TierPickerScreen onSelect={handleTierSelect} />;
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
  const canDoubleDownByBetLimit = doubleBetAmount <= tierLimits.MAX_BET;
  
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
  const canSplitByBetLimit = doubleBetAmount <= tierLimits.MAX_BET;
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
            onSave: async (displayName, profileImageUrl, bio, xHandle, tgHandle) => {
              if (!wsClient) return;
              const res = await wsClient.setDisplayName(displayName, profileImageUrl, undefined, bio, xHandle, tgHandle);
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

      <BlackjackStatusOverlays
        showSplash={showSplash}
        onDismissSplash={() => setSplashDismissed(true)}
        onDepositFromSplash={() => {
          handleOpenDepositModal();
          setSplashDismissed(true);
        }}
        pendingJob={pendingJob}
      />

      <SpeechHUD
        listening={speech.listening}
        transcript={speech.transcript}
        lastAction={lastSpeechAction}
        pendingLabel={speech.pendingLabel}
        onToggle={() => setEnabled(!speechEnabled)}
      />

      <main className="w-full max-w-full mx-0 px-2 sm:px-4 pt-2 sm:pt-4 pb-4 sm:pb-8 overflow-x-hidden overflow-y-auto no-scrollbar">
        {/* View-specific content */}
        {currentView === 'game' && (
          <>
        <BlackjackGameView
          contractIsPaused={contractIsPaused}
          contractEmergencyPaused={contractEmergencyPaused}
          contractOzPaused={contractOzPaused}
          tournament={tournament}
          currentGame={currentGame}
          gameState={gameState}
          canHit={canHit}
          canStand={canStand}
          canDoubleDown={canDoubleDown}
          canSplit={canSplit}
          offChainBalance={offChainBalance}
          newCardIndices={newCardIndices}
          tournamentChipStack={tournamentChipStack}
          chipStack={chipStack}
          manageChipStack={manageChipStack}
          handleStartTournamentGame={handleStartTournamentGame}
          handleDealClick={handleDealClick}
          handleDealerRevealComplete={handleDealerRevealComplete}
          currentGameResult={currentGameResult}
          handleChipAnimationComplete={handleChipAnimationComplete}
          handleDoubleDownChips={handleDoubleDownChips}
          handleSplitChips={handleSplitChips}
          handleRebet={handleRebet}
          handleRebetAndDeal={handleRebetAndDeal}
          handleHalfBet={handleHalfBet}
          handleDoubleBet={handleDoubleBet}
          isMusicPlaying={isMusicPlaying}
          toggleMusic={toggleMusic}
          nextTrack={nextTrack}
          musicVolume={musicVolume}
          setMusicVolume={setMusicVolume}
          totalBetAmount={totalBetAmount}
          displayBetAmount={displayBetAmount}
          lastBetAmount={lastBetAmount}
          imageSource={imageSource}
          videoSource={videoSource}
          theme={theme}
          getThemeInfo={getThemeInfo}
          getTableProfile={getTableProfile}
          videoSyncToClock={videoSyncToClock}
          videoPosition={videoPosition}
          handleOpenDepositModal={handleOpenDepositModal}
          setThemeModalOpen={setThemeModalOpen}
          soundEnabled={soundEnabled}
          playSfx={playSfx}
          handleCardsClearComplete={handleCardsClearComplete}
          perfectPairsBet={perfectPairsBet}
          setPerfectPairsBet={setPerfectPairsBet}
          setTournamentBrowserInitialTab={setTournamentBrowserInitialTab}
          setShowTournamentBrowser={setShowTournamentBrowser}
          handleStartGame={handleStartGame}
          clientSeed={clientSeed}
          handleTournamentPlayerAction={handleTournamentPlayerAction}
          handlePlayerAction={handlePlayerAction}
          address={address}
          wsConnected={wsConnected}
          wsClient={wsClient}
          tipAnimating={tipAnimating}
          setTipAnimating={setTipAnimating}
          playDealerVoice={playDealerVoice}
          fetchBalance={fetchBalance}
          setTipStats={setTipStats}
          showWinNotification={showWinNotification}
          winAmount={winAmount}
          isBlackjackWin={isBlackjackWin}
          setShowWinNotification={setShowWinNotification}
          chartRef={chartRef}
          chartSessionStartTime={chartSessionStartTime.current}
          openVerifyView={openVerifyView}
          setSoundEnabled={setSoundEnabled}
          dealerVoiceEnabled={dealerVoiceEnabled}
          setDealerVoiceEnabled={setDealerVoiceEnabled}
          sfxEnabled={sfxEnabled}
          setSfxEnabled={setSfxEnabled}
          BLACKJACK_MUSIC_PLAYLIST={BLACKJACK_MUSIC_PLAYLIST}
          musicTrackIndex={musicTrackIndex}
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
                    fetchBalance().catch(() => {});
                    toast.success('Left tournament successfully');
                  } else {
                    toast.error('Failed to leave tournament');
                  }
                }}
              />
            ) : null
          }
          playerStats={playerStats}
          playerStatsLoading={playerStatsLoading}
          tipStats={tipStats}
          blackjackAddress={BLACKJACK_ADDRESS}
          morbiusTokenAddress={MORBIUS_TOKEN_ADDRESS}
          betLimits={tierLimits}
          speech={speech}
        />

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

        {/* Deposit/Withdraw Modal (available on all views) */}
        <DepositWithdrawModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          balanceLabel="Balance"
          onBalanceSync={async () => {
            await fetchBalanceFromApi();
            await syncBalance().catch(() => {});
          }}
          onRefreshBalance={async () => {
            await fetchBalanceFromApi();
            await fetchBalance().catch(() => {});
          }}
          onWithdrawSuccess={async () => {
            await fetchBalanceFromApi();
            clearPendingJob();
          }}
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

        <BlackjackTournamentOverlays
          tournament={tournament}
          showTournamentEntry={showTournamentEntry}
          setShowTournamentEntry={setShowTournamentEntry}
          showTournamentComplete={showTournamentComplete}
          setShowTournamentComplete={setShowTournamentComplete}
          showTournamentBrowser={showTournamentBrowser}
          setShowTournamentBrowser={setShowTournamentBrowser}
          tournamentBrowserInitialTab={tournamentBrowserInitialTab}
          showTournamentCreator={showTournamentCreator}
          setShowTournamentCreator={setShowTournamentCreator}
          showTournamentPinEntry={showTournamentPinEntry}
          setShowTournamentPinEntry={setShowTournamentPinEntry}
          pendingJoinTournament={pendingJoinTournament}
          setPendingJoinTournament={setPendingJoinTournament}
          setIsTournamentMode={setIsTournamentMode}
          offChainBalance={offChainBalance}
          address={address}
          wsClient={wsClient}
          getThemeInfo={getThemeInfo}
          fetchBalance={fetchBalance}
        />

        {currentView !== 'game' && (
          <BlackjackHowToSection blackjackAddress={BLACKJACK_ADDRESS} />
        )}

        <BlackjackAuxViews
          currentView={currentView}
          isDeployer={isDeployer}
          playerStatsLoading={playerStatsLoading}
          playerStatsError={playerStatsError}
          refetchPlayerStats={refetchPlayerStats}
          playerStats={playerStats}
          address={address}
          wsConnected={wsConnected}
          wsClient={wsClient}
          offChainBalance={offChainBalance}
          globalAnalyticsLoading={globalAnalyticsLoading}
          globalAnalyticsError={globalAnalyticsError}
          refetchGlobalAnalytics={refetchGlobalAnalytics}
          globalAnalytics={globalAnalytics}
        />

      </main>

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

      <SophieSplashModal
        address={address}
        onOpenProfileSettings={() =>
          openProfileSettings({
            displayName: profileDisplayName ?? '',
            profileImageUrl,
            onSave: async (displayName, profileImageUrl, bio, xHandle, tgHandle) => {
              if (!wsClient) return;
              const res = await wsClient.setDisplayName(displayName, profileImageUrl, undefined, bio, xHandle, tgHandle);
              setProfileDisplayName(res.displayName);
              setProfileImageUrl(res.profileImageUrl);
            },
          })
        }
      />
    </div>
  );
}