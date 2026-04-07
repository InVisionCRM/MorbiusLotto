'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getWebSocketUrlOptional, getApiUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableState, BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { useChat } from '@/hooks/use-chat';
import { AvatarView } from '@/components/avatar';
import { BlackjackHowToSection } from '@/components/BLACKJACK/BlackjackHowToSection';
import { BlackjackMultiSeatGrid } from '@/components/BLACKJACK/multi/BlackjackMultiSeatGrid';
import { BlackjackMultiSoundPanel } from '@/components/BLACKJACK/multi/BlackjackMultiSoundPanel';
import { BlackjackMultiConnectionOverlay } from '@/components/BLACKJACK/multi/BlackjackMultiConnectionOverlay';
import { BlackjackMultiTopBar } from '@/components/BLACKJACK/multi/BlackjackMultiTopBar';
import { BlackjackMultiBetActionPanel } from '@/components/BLACKJACK/multi/BlackjackMultiBetActionPanel';
import { BlackjackMultiTipDealerControl } from '@/components/BLACKJACK/multi/BlackjackMultiTipDealerControl';
import { BlackjackMultiDealerArea } from '@/components/BLACKJACK/multi/BlackjackMultiDealerArea';
import {
  BlackjackMultiRoundOverlays,
  BLACKJACK_COLOR_PALETTES,
} from '@/components/BLACKJACK/multi/BlackjackMultiRoundOverlays';
import {
  BlackjackMultiInfoPanel,
  type BlackjackMultiSystemChatMessage,
  type BlackjackMultiRoundHistoryItem,
  DEFAULT_INFO_PANEL_VIEWPORT_HEIGHT_CLASS,
} from '@/components/BLACKJACK/multi/BlackjackMultiInfoPanel';
import { BLACKJACK_MULTI_TABLE_STYLES } from '@/components/BLACKJACK/multi/blackjackMultiTableStyles';
import type { BlackjackMultiRealTimeBetChartRef } from '@/components/BLACKJACK/BlackjackMultiRealTimeBetChart';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { TableTokenProfileCard } from '@/components/BLACKJACK/TableTokenProfileCard';
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import Image from 'next/image';
import { BLACKJACK_IMAGE_BACKGROUNDS, SOUNDS_BETTING_OPEN, SOUNDS_BETTING_CLOSED, SOUNDS_DEALER_PHRASE, SOUNDS_PLAYER_WINS, SOUNDS_PLAYER_BLACKJACK, SOUNDS_DEALER_WINS, SOUNDS_DEALER_BLACKJACK, SOUNDS_TIP, SOUND_PUSH, pickRandom } from '@/app/BLACKJACK/constants';
import { useAudio, AudioManager } from '@/hooks/use-audio';
import { usePlayerStatsEnhanced } from '@/hooks/use-blackjack-stats';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { useBlackjackRevealCompletion } from '@/hooks/use-blackjack-reveal-completion';
import { toast } from 'sonner';
import { BLACKJACK_FACTS } from '@/app/blackjack-multi/blackjack-facts';
import { BlackjackMultiBetaSplash } from '@/components/BLACKJACK/BlackjackMultiBetaSplash';

/** Must match server BJ_MULTI_AFK_KICK_AFTER — shown in seat UI */
const AFK_TIMEOUTS_BEFORE_KICK = 3;
const RESULT_HOLD_MS = 2200;
const DEALER_HOLE_REVEAL_DELAY_MS = 1000;
const DEALER_PER_CARD_REVEAL_DELAY_MS = 2000;
const DEALER_POST_REVEAL_DELAY_MS = 1500;
const WEI_PER_MORBIUS = 10n ** 18n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MULTI_INFO_PANEL_VIEWPORT_HEIGHT_CLASS = DEFAULT_INFO_PANEL_VIEWPORT_HEIGHT_CLASS;

function toSafeInteger(value: bigint): number {
  if (value <= 0n) return 0;
  if (value > MAX_SAFE_BIGINT) return Number.MAX_SAFE_INTEGER;
  return Number(value);
}

function wholeMorbiusFloorFromWei(wei?: string | null): number {
  if (!wei) return 0;
  try {
    return toSafeInteger(BigInt(wei) / WEI_PER_MORBIUS);
  } catch {
    return 0;
  }
}

function wholeMorbiusCeilFromWei(wei?: string | null): number {
  if (!wei) return 0;
  try {
    const value = BigInt(wei);
    if (value <= 0n) return 0;
    return toSafeInteger((value + (WEI_PER_MORBIUS - 1n)) / WEI_PER_MORBIUS);
  } catch {
    return 0;
  }
}

function getStateVersion(state: BJMultiTableState & { stateVersion?: number }): number {
  return typeof state.stateVersion === 'number' && Number.isFinite(state.stateVersion)
    ? state.stateVersion
    : 0;
}

type BJMultiE2ETestApi = {
  setState: (state: BJMultiTableState) => void;
  clearState: () => void;
  getState: () => BJMultiTableState | null;
};

declare global {
  interface Window {
    __BJ_MULTI_E2E_TEST_API?: BJMultiE2ETestApi;
  }
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return '0'; }
}

type SeatResultSummary = 'win' | 'loss' | 'push' | 'mixed' | 'none';

function summarizeSeatHands(hands: BJMultiHandObj[]): SeatResultSummary {
  if (!hands.length) return 'none';
  const hasWin = hands.some((h) => h.result === 'win' || h.result === 'blackjack');
  const hasLoss = hands.some((h) => h.result === 'loss');
  const hasPush = hands.some((h) => h.result === 'push');
  if (hasWin && !hasLoss && !hasPush) return 'win';
  if (!hasWin && hasLoss && !hasPush) return 'loss';
  if (!hasWin && !hasLoss && hasPush) return 'push';
  return 'mixed';
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export default function BlackjackMultiTablePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const isE2EMock = searchParams.get('e2eMock') === '1';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [state, setState] = useState<BJMultiTableState | null>(null);
  const stateRef = useRef<BJMultiTableState | null>(null);
  const [visualState, setVisualState] = useState<BJMultiTableState | null>(null);
  const visualStateRef = useRef<BJMultiTableState | null>(null);
  const visualPendingStateRef = useRef<BJMultiTableState | null>(null);
  const visualHoldUntilRef = useRef(0);
  const visualHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lock body scroll + Escape key when fullscreen is active
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    if (!isFullscreen) return () => { document.body.style.overflow = ''; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [isFullscreen]);
  const [selectedProfileAddress, setSelectedProfileAddress] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');
  const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipNotification, setTipNotification] = useState<{ name: string } | null>(null);
  const [tipAnimating, setTipAnimating] = useState(false);
  const wsClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const latestStateVersionRef = useRef(0);

  const commitVisualState = useCallback((next: BJMultiTableState) => {
    visualStateRef.current = next;
    setVisualState(next);
  }, []);

  const applyIncomingState = useCallback((next: BJMultiTableState) => {
    const incomingVersion = getStateVersion(next);
    if (incomingVersion > 0 && incomingVersion < latestStateVersionRef.current) {
      return;
    }
    if (incomingVersion > 0) {
      latestStateVersionRef.current = incomingVersion;
    }
    setState(next);
    stateRef.current = next;
    const now = Date.now();
    const prevVisual = visualStateRef.current;
    if (next.phase === 'completed') {
      const dealerCardCount = next.dealerCards?.length ?? 0;
      const revealWindowMs = dealerCardCount <= 2
        ? DEALER_HOLE_REVEAL_DELAY_MS + DEALER_POST_REVEAL_DELAY_MS
        : DEALER_HOLE_REVEAL_DELAY_MS
          + (dealerCardCount - 2) * DEALER_PER_CARD_REVEAL_DELAY_MS
          + DEALER_POST_REVEAL_DELAY_MS;
      visualHoldUntilRef.current = now + Math.max(RESULT_HOLD_MS, revealWindowMs);
    }
    const shouldHoldCompleted =
      prevVisual?.phase === 'completed' &&
      (next.phase === 'betting' || next.phase === 'waiting') &&
      now < visualHoldUntilRef.current;

    if (shouldHoldCompleted) {
      visualPendingStateRef.current = next;
      if (!visualHoldTimerRef.current) {
        const waitMs = Math.max(0, visualHoldUntilRef.current - now);
        visualHoldTimerRef.current = setTimeout(() => {
          visualHoldTimerRef.current = null;
          const pending = visualPendingStateRef.current ?? stateRef.current;
          visualPendingStateRef.current = null;
          if (pending) commitVisualState(pending);
        }, waitMs);
      }
      return;
    }

    if (visualHoldTimerRef.current) {
      clearTimeout(visualHoldTimerRef.current);
      visualHoldTimerRef.current = null;
    }
    visualPendingStateRef.current = null;
    commitVisualState(next);
  }, [commitVisualState]);
  const tableViewState = visualState ?? state;

  useEffect(() => {
    latestStateVersionRef.current = 0;
  }, [tableId]);

  // Bet panel state — string to match BettingPanelMobile interface
  const [betAmount, setBetAmount] = useState('0'); // whole MORBIUS

  // Sound effects
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dealerVoiceEnabled, setDealerVoiceEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const { playSound: _playSound } = useAudio(soundEnabled);
  // Wrap playSound to respect SFX toggle
  const playSound = useCallback((path: string, volume?: number) => {
    if (!sfxEnabled) return;
    _playSound(path, volume);
  }, [sfxEnabled, _playSound]);
  const dealerVoiceRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const prevSeatAddrsRef = useRef<(string | null)[]>([null, null, null]);

  // Background music player
  const MUSIC_PLAYLIST = useMemo(() => [
    '/BlackJack/music/Sera-di-Blackjack.mp3',
    '/BlackJack/music/Winning-Big.mp3',
    '/BlackJack/music/Lucky-Ducky.mp3',
    '/BlackJack/music/Smooth-Gains.mp3',
    '/BlackJack/music/Top-Tier.mp3',
    '/BlackJack/music/Chances.mp3',
  ] as const, []);
  const [musicTrackIndex, setMusicTrackIndex] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(25);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) el.volume = musicVolume / 100;
  }, [musicVolume]);

  const handleMusicEnded = useCallback(() => {
    setMusicTrackIndex((prev) => (prev + 1) % MUSIC_PLAYLIST.length);
    setIsMusicPlaying(false);
  }, [MUSIC_PLAYLIST.length]);

  useEffect(() => {
    const el = musicAudioRef.current;
    if (!el) return;
    el.volume = musicVolume / 100;
    if (isMusicPlaying) el.play().then(() => setIsMusicPlaying(true)).catch(() => {});
  }, [musicTrackIndex, musicVolume, isMusicPlaying]);

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
    setMusicTrackIndex((prev) => (prev + 1) % MUSIC_PLAYLIST.length);
  }, [MUSIC_PLAYLIST.length]);

  // Play a dealer voice line on a dedicated channel (stops any currently playing voice)
  const playDealerVoice = useCallback(async (path: string, volume = 0.5) => {
    if (!soundEnabled || !dealerVoiceEnabled) return;
    // Stop any currently playing dealer voice
    if (dealerVoiceRef.current) {
      try { dealerVoiceRef.current.source.stop(); } catch { /* already stopped */ }
      dealerVoiceRef.current = null;
    }
    // Reuse the global AudioContext from AudioManager
    const ctx = AudioManager.getContext();
    if (!ctx || ctx.state !== 'running') { playSound(path, volume); return; }
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
      playSound(path, volume);
    }
  }, [soundEnabled, dealerVoiceEnabled, playSound]);

  // Dealer random phrase timer during betting
  const dealerPhraseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Player stats — combined single + multiplayer via updated SQL functions
  const { data: playerStatsData, isLoading: playerStatsLoading } = usePlayerStatsEnhanced();
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
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined,
  } : null;

  // Track completed rounds for History tab
  const [roundHistory, setRoundHistory] = useState<BlackjackMultiRoundHistoryItem[]>([]);

  // Win notification — reuses WinNotification from single player
  const [showWin, setShowWin] = useState<{ amount: bigint; isBlackjack: boolean } | null>(null);
  // Blackjack celebration animation (EncryptedText + glass panel)
  const [showBlackjackText, setShowBlackjackText] = useState(false);
  const [blackjackColorIndex, setBlackjackColorIndex] = useState(0);
  const [blackjackAnimKey, setBlackjackAnimKey] = useState(0); // key to force EncryptedText remount for replay
  const prevPhaseRef = useRef<string>('');
  const chartRef = useRef<BlackjackMultiRealTimeBetChartRef>(null);
  const chartSessionStartTime = useRef<number>(Date.now());
  const lastChartRoundRef = useRef<number>(0);

  /** Outcome audio + win toast — deferred until dealer cards are fully revealed (single-player parity). */
  type PendingDealerOutcome = {
    kind: 'player_blackjack' | 'player_win' | 'push' | 'dealer_blackjack' | 'dealer_win' | 'silent';
    payout: bigint;
  };
  const pendingDealerOutcomeRef = useRef<PendingDealerOutcome | null>(null);
  const lastOutcomeAnnouncementAtRef = useRef(0);

  const [showSeatOutcomeLabels, setShowSeatOutcomeLabels] = useState(false);
  const [visibleDealerCards, setVisibleDealerCards] = useState(0);
  const [isDealerRevealing, setIsDealerRevealing] = useState(false);
  const dealerRevealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevDealerPhaseRef = useRef<BJMultiTableState['phase'] | null>(null);
  const prevDealerCardCountRef = useRef(0);

  // Platform balance (for display under avatar when seated)
  const [playerBalance, setPlayerBalance] = useState<bigint>(0n);

  const fetchBalance = useCallback(async () => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl || !address) return;
    try {
      const res = await fetch(`${apiUrl}/api/player/${address}/balance`);
      if (!res.ok) return;
      const data = await res.json();
      setPlayerBalance(BigInt(data?.balance ?? 0));
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const flushPendingDealerOutcome = useCallback(() => {
    const pending = pendingDealerOutcomeRef.current;
    if (!pending) return;
    pendingDealerOutcomeRef.current = null;
    // Unlock seat WON/LOST labels exactly when outcome voice starts.
    setShowSeatOutcomeLabels(true);
    const shouldPlayOutcomeVoice = pending.kind !== 'silent';
    if (shouldPlayOutcomeVoice) {
      lastOutcomeAnnouncementAtRef.current = Date.now();
    }
    if (soundEnabled) {
      switch (pending.kind) {
        case 'player_blackjack':
          playDealerVoice(pickRandom(SOUNDS_PLAYER_BLACKJACK));
          break;
        case 'player_win':
          playDealerVoice(pickRandom(SOUNDS_PLAYER_WINS));
          break;
        case 'push':
          playDealerVoice(SOUND_PUSH);
          break;
        case 'dealer_blackjack':
          playDealerVoice(pickRandom(SOUNDS_DEALER_BLACKJACK));
          break;
        case 'dealer_win':
          if (SOUNDS_DEALER_WINS.length > 0) {
            playDealerVoice(pickRandom(SOUNDS_DEALER_WINS));
          }
          break;
        case 'silent':
          break;
      }
    }
    if (pending.kind === 'player_blackjack' || pending.kind === 'player_win') {
      setShowWin({
        amount: pending.payout,
        isBlackjack: pending.kind === 'player_blackjack',
      });
    }
    fetchBalance();
  }, [soundEnabled, playDealerVoice, fetchBalance]);

  const {
    scheduleRevealComplete: scheduleDealerRevealComplete,
    resetRevealComplete: resetDealerRevealComplete,
  } = useBlackjackRevealCompletion(flushPendingDealerOutcome);

  // Sound effects + win notification on phase transitions
  useEffect(() => {
    const phaseState = tableViewState;
    if (!phaseState) return;
    if (phaseState.phase !== 'completed' && showSeatOutcomeLabels) {
      setShowSeatOutcomeLabels(false);
    }
    if (phaseState.phase !== 'completed' && showBlackjackText) {
      setShowBlackjackText(false);
    }
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phaseState.phase;
    if (!prevPhase) return;

    // ── Betting opens: announce + schedule a random dealer phrase ──
    if (prevPhase !== 'betting' && phaseState.phase === 'betting') {
      const pendingOutcome = pendingDealerOutcomeRef.current;
      const recentlyAnnouncedOutcome = Date.now() - lastOutcomeAnnouncementAtRef.current < 6000;
      // Avoid overlapping winner voice and betting-open voice in the same transition.
      const shouldSuppressBettingOpenVoice =
        (pendingOutcome && pendingOutcome.kind !== 'silent') || recentlyAnnouncedOutcome;

      if (!shouldSuppressBettingOpenVoice) {
        playDealerVoice(pickRandom(SOUNDS_BETTING_OPEN));
      }
      // Clear any lingering phrase timer
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      // Play a random dealer phrase only every 5th hand (quieter table pacing).
      const roundNumber = Number(phaseState.roundNumber ?? 0);
      const shouldPlayMidBetPhrase = roundNumber > 0 && roundNumber % 5 === 0;
      if (shouldPlayMidBetPhrase && SOUNDS_DEALER_PHRASE.length > 0) {
        dealerPhraseTimerRef.current = setTimeout(() => {
          playDealerVoice(pickRandom(SOUNDS_DEALER_PHRASE));
        }, 5000 + Math.random() * 4000); // 5–9s into betting
      } else {
        dealerPhraseTimerRef.current = null;
      }
    }

    // ── Betting closes → dealing: stop any phrase, announce, then deal sound ──
    if (prevPhase === 'betting' && phaseState.phase === 'playing') {
      if (dealerPhraseTimerRef.current) { clearTimeout(dealerPhraseTimerRef.current); dealerPhraseTimerRef.current = null; }
      playDealerVoice(pickRandom(SOUNDS_BETTING_CLOSED));
      // Card deal sound slightly after the voice starts
      setTimeout(() => playSound('/BlackJack/sounds/cards.wav'), 600);
    }

    // ── Cards dealt sound for non-betting→playing transitions ──
    if (prevPhase !== 'betting' && prevPhase !== 'playing' && phaseState.phase === 'playing') {
      playSound('/BlackJack/sounds/cards.wav');
    }

    // ── Round completes: outcome voice + win toast — deferred until dealer reveal finishes (flushPendingDealerOutcome) ──
    if (prevPhase !== 'completed' && phaseState.phase === 'completed') {
      // Blackjack animation — show if ANY seat at the table got blackjack
      const anyBlackjack = phaseState.seats.some(s =>
        s.playerAddress && s.hands.some(h => h.result === 'blackjack')
      );
      if (anyBlackjack) {
        setBlackjackColorIndex(Math.floor(Math.random() * BLACKJACK_COLOR_PALETTES.length));
        setBlackjackAnimKey(k => k + 1);
        setShowBlackjackText(true);
      }

      const seat = phaseState.seats.find(s =>
        s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
      );
      if (seat && seat.hands.length > 0) {
        const totalPayout = BigInt(seat.payout || '0');
        const hasBlackjack = seat.hands.some(h => h.result === 'blackjack');
        const hasWin = seat.hands.some(h => h.result === 'win' || h.result === 'blackjack');
        const allLoss = seat.hands.every(h => h.result === 'loss');
        const allPush = seat.hands.every(h => h.result === 'push');

        const dealerHadBJ = phaseState.dealerTotal === 21 && (phaseState.dealerCards?.length ?? 0) === 2;

        let kind: PendingDealerOutcome['kind'] = 'silent';
        if (hasBlackjack) kind = 'player_blackjack';
        else if (hasWin) kind = 'player_win';
        else if (allPush) kind = 'push';
        else if (allLoss && dealerHadBJ) kind = 'dealer_blackjack';
        else if (allLoss) kind = 'dealer_win';
        pendingDealerOutcomeRef.current = { kind, payout: totalPayout };

        // Feed multiplayer rounds into realtime chart once per round.
        const roundNo = Number(phaseState.roundNumber ?? 0);
        if (roundNo > 0 && lastChartRoundRef.current !== roundNo) {
          const totalBetWei = seat.hands.reduce((acc, h) => {
            try { return acc + BigInt(h.betAmount || '0'); } catch { return acc; }
          }, 0n);
          chartRef.current?.addGameResult(totalBetWei, totalPayout, {
            gameId: phaseState.currentRoundId ?? undefined,
            result: kind,
          });
          lastChartRoundRef.current = roundNo;

          // Track round for History tab
          setRoundHistory(prev => {
            if (prev.some(r => r.roundNumber === roundNo)) return prev;
            const entry = {
              roundNumber: roundNo,
              roundId: phaseState.currentRoundId,
              dealerTotal: phaseState.dealerTotal,
              dealerCards: [...(phaseState.dealerCards ?? [])],
              seats: phaseState.seats
                .filter(s => s.playerAddress && s.hands.length > 0)
                .map(s => ({
                  position: s.position,
                  playerAddress: s.playerAddress!,
                  hands: s.hands.map(h => ({ ...h })),
                  payout: s.payout || '0',
                  result: summarizeSeatHands(s.hands),
                })),
              timestamp: Date.now(),
            };
            return [entry, ...prev].slice(0, 50);
          });
        }
      } else {
        fetchBalance();
      }
    }
   
  }, [tableViewState?.phase, address]);

  // Play join/leave sounds when seat occupancy changes
  useEffect(() => {
    if (!state) return;
    const current = state.seats.map(s => s.playerAddress?.toLowerCase() ?? null);
    const prev = prevSeatAddrsRef.current;
    for (let i = 0; i < 3; i++) {
      if (!prev[i] && current[i]) {
        // Someone joined
        if (current[i] !== address?.toLowerCase()) playSound('/Poker/PokerSounds/OpponentJoined.mp3');
      } else if (prev[i] && !current[i]) {
        // Someone left
        if (prev[i] !== address?.toLowerCase()) playSound('/Poker/PokerSounds/OpponentLeft.mp3');
      }
    }
    prevSeatAddrsRef.current = current;
   
  }, [state?.seats]);

  // Match single-player sequencing: reveal hole card, then extra dealer hits one-by-one.
  useEffect(() => {
    const phase = tableViewState?.phase ?? 'waiting';
    const totalCards = tableViewState?.dealerCards?.length ?? 0;
    const prevPhase = prevDealerPhaseRef.current;
    const prevCount = prevDealerCardCountRef.current;
    const inRevealWindow = phase === 'dealer_turn' || phase === 'completed';
    const enteredCompleted = phase === 'completed' && prevPhase !== 'completed';
    const dealerCardsIncreased = inRevealWindow && totalCards > prevCount;
    const shouldStartReveal =
      (enteredCompleted || dealerCardsIncreased) &&
      !isDealerRevealing &&
      visibleDealerCards < totalCards;

    if (totalCards === 0) {
      if (dealerRevealTimeoutRef.current) {
        clearTimeout(dealerRevealTimeoutRef.current);
        dealerRevealTimeoutRef.current = null;
      }
      if (isDealerRevealing) setIsDealerRevealing(false);
      if (visibleDealerCards !== 0) setVisibleDealerCards(0);
      prevDealerPhaseRef.current = phase;
      prevDealerCardCountRef.current = 0;
      return;
    }

    if (!inRevealWindow) {
      if (dealerRevealTimeoutRef.current) {
        clearTimeout(dealerRevealTimeoutRef.current);
        dealerRevealTimeoutRef.current = null;
      }
      if (isDealerRevealing) setIsDealerRevealing(false);
      if (visibleDealerCards !== totalCards) setVisibleDealerCards(totalCards);
      prevDealerPhaseRef.current = phase;
      prevDealerCardCountRef.current = totalCards;
      return;
    }

    if (shouldStartReveal) {
      if (dealerRevealTimeoutRef.current) {
        clearTimeout(dealerRevealTimeoutRef.current);
        dealerRevealTimeoutRef.current = null;
      }
      setIsDealerRevealing(true);

      if (totalCards > 2) {
        dealerRevealTimeoutRef.current = setTimeout(() => {
          setVisibleDealerCards(2);
          playSound('/BlackJack/sounds/cards.wav');

          let cardIndex = 2;
          const revealNextCard = () => {
            if (cardIndex < totalCards) {
              cardIndex += 1;
              setVisibleDealerCards(cardIndex);
              playSound('/BlackJack/sounds/cards.wav');
              dealerRevealTimeoutRef.current = setTimeout(revealNextCard, DEALER_PER_CARD_REVEAL_DELAY_MS);
              return;
            }
            dealerRevealTimeoutRef.current = setTimeout(() => {
              setIsDealerRevealing(false);
            }, DEALER_POST_REVEAL_DELAY_MS);
          };

          dealerRevealTimeoutRef.current = setTimeout(revealNextCard, DEALER_PER_CARD_REVEAL_DELAY_MS);
        }, DEALER_HOLE_REVEAL_DELAY_MS);
      } else {
        dealerRevealTimeoutRef.current = setTimeout(() => {
          setVisibleDealerCards(totalCards);
          playSound('/BlackJack/sounds/cards.wav');
          dealerRevealTimeoutRef.current = setTimeout(() => {
            setIsDealerRevealing(false);
          }, DEALER_POST_REVEAL_DELAY_MS);
        }, DEALER_HOLE_REVEAL_DELAY_MS);
      }
    } else if (!isDealerRevealing && visibleDealerCards !== totalCards) {
      setVisibleDealerCards(totalCards);
    }

    prevDealerPhaseRef.current = phase;
    prevDealerCardCountRef.current = totalCards;
  }, [
    tableViewState?.phase,
    tableViewState?.dealerCards?.length,
    isDealerRevealing,
    visibleDealerCards,
    playSound,
  ]);

  // After dealer cards are fully revealed, schedule outcome flush (shared reveal-completion contract).
  useEffect(() => {
    if (tableViewState?.phase !== 'completed') {
      resetDealerRevealComplete();
    }
  }, [tableViewState?.phase, resetDealerRevealComplete]);

  useEffect(() => {
    if (!pendingDealerOutcomeRef.current) return;
    const total = tableViewState.dealerCards?.length ?? 0;
    if (total === 0) {
      scheduleDealerRevealComplete(0);
      return;
    }
    if (!isDealerRevealing && visibleDealerCards >= total) {
      scheduleDealerRevealComplete(0);
    }
  }, [
    tableViewState?.dealerCards?.length,
    visibleDealerCards,
    isDealerRevealing,
    scheduleDealerRevealComplete,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      if (visualHoldTimerRef.current) clearTimeout(visualHoldTimerRef.current);
      if (dealerRevealTimeoutRef.current) clearTimeout(dealerRevealTimeoutRef.current);
      if (dealerVoiceRef.current) { try { dealerVoiceRef.current.source.stop(); } catch {} }
    };
  }, []);

  const roomId = `blackjack:table:${tableId}`;
  const { messages: chatMessages, sendMessage: sendChatMessage } = useChat(roomId, { wsClient, wsConnected });

  // ── System chat messages (welcome, FactBot, idle warnings) ──
  const [systemChatMessages, setSystemChatMessages] = useState<BlackjackMultiSystemChatMessage[]>([]);
  const factBotUsedIndices = useRef<Set<number>>(new Set());

  // Welcome message — on first connect
  const welcomeSentRef = useRef(false);
  useEffect(() => {
    if (!wsConnected || !state || welcomeSentRef.current) return;
    welcomeSentRef.current = true;
    const minBet = formatMorbius(state.minBet ?? '0');
    const maxBet = formatMorbius(state.maxBet ?? '0');
    setSystemChatMessages(prev => [...prev, {
      id: 'welcome',
      type: 'welcome',
      text: `Welcome to <b>Morbius.IO</b> — PulseChain's Premier Gaming Platform! 🎲<br/><br/>` +
        `<b>Quick Tips:</b><br/>` +
        `• Tap your avatar to open the player menu (sounds, expressions, settings, leave)<br/>` +
        `• Right-click or long-press your avatar for QuickChat<br/>` +
        `• Min bet: <b>${minBet}</b> · Max bet: <b>${maxBet}</b> MORBIUS<br/><br/>` +
        `<b>Socials:</b><br/>` +
        `• X: <a href="https://x.com/MorbiusIO" target="_blank" rel="noopener" class="underline text-cyan-400">x.com/MorbiusIO</a><br/>` +
        `• Telegram: <a href="https://t.me/MorbiusIO" target="_blank" rel="noopener" class="underline text-cyan-400">t.me/MorbiusIO</a>`,
      timestamp: Date.now(),
    }]);
  }, [wsConnected, state]);

  // FactBot — random fact every 5 minutes
  useEffect(() => {
    if (!wsConnected) return;
    const addFact = () => {
      let idx: number;
      if (factBotUsedIndices.current.size >= BLACKJACK_FACTS.length) {
        factBotUsedIndices.current.clear();
      }
      do { idx = Math.floor(Math.random() * BLACKJACK_FACTS.length); } while (factBotUsedIndices.current.has(idx));
      factBotUsedIndices.current.add(idx);
      setSystemChatMessages(prev => [...prev, {
        id: `factbot-${Date.now()}`,
        type: 'factbot',
        text: BLACKJACK_FACTS[idx],
        timestamp: Date.now(),
      }]);
    };
    const id = setInterval(addFact, 5 * 60 * 1000);
    // First fact after 30 seconds
    const firstTimeout = setTimeout(addFact, 30_000);
    return () => { clearInterval(id); clearTimeout(firstTimeout); };
  }, [wsConnected]);

  // Idle warnings — notify chat when any player has high idle count
  const prevIdleCounts = useRef<Record<number, number>>({});
  useEffect(() => {
    if (!state) return;
    for (const seat of state.seats) {
      if (!seat.playerAddress) continue;
      const ct = seat.consecutiveTimeouts ?? 0;
      const prev = prevIdleCounts.current[seat.position] ?? 0;
      if (ct > prev && ct >= 2) {
        const name = seat.displayName ?? seat.playerAddress.slice(0, 6) + '…';
        setSystemChatMessages(p => [...p, {
          id: `idle-${seat.position}-${Date.now()}`,
          type: 'idle_warning',
          text: `${name} is idle (${ct}/${AFK_TIMEOUTS_BEFORE_KICK}). They will be removed after ${AFK_TIMEOUTS_BEFORE_KICK} timeouts.`,
          timestamp: Date.now(),
        }]);
      }
      prevIdleCounts.current[seat.position] = ct;
    }
  }, [state]);

  const mySeat = state?.seats.find(s =>
    s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
  ) ?? null;
  const myPosition = mySeat?.position ?? null;
  const isMyTurn = mySeat !== null && state?.phase === 'playing' && state?.actingSeatPosition === myPosition;
  const activeHand: BJMultiHandObj | null = mySeat ? mySeat.hands[mySeat.activeHandIndex] ?? null : null;
  const hasBet = mySeat ? BigInt(mySeat.pendingBet) > 0n : false;
  const seatsByPosition = useMemo(() => {
    return [
      tableViewState?.seats.find(s => s.position === 0) ?? null,
      tableViewState?.seats.find(s => s.position === 1) ?? null,
      tableViewState?.seats.find(s => s.position === 2) ?? null,
    ] as [BJMultiSeatState | null, BJMultiSeatState | null, BJMultiSeatState | null];
  }, [tableViewState?.seats]);
  const tableMinBetWhole = useMemo(() => {
    return Math.max(1, wholeMorbiusCeilFromWei(state?.minBet ?? '0'));
  }, [state?.minBet]);
  const tableMaxBetWhole = useMemo(() => {
    const derivedMax = wholeMorbiusFloorFromWei(state?.maxBet ?? '0');
    return Math.max(tableMinBetWhole, derivedMax);
  }, [state?.maxBet, tableMinBetWhole]);

  useEffect(() => {
    if (isE2EMock) {
      setWsConnected(true);
      setWsStatus('connected');
      setError(null);
      return;
    }
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !address) return;
    const client = new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync as any);
    client.on('disconnected', () => { setWsConnected(false); setWsStatus('reconnecting'); });
    client.on('reconnecting', (info: any) => { setWsStatus('reconnecting'); setReconnectInfo(info); });
    client.on('reconnected', async () => {
      setWsConnected(true); setWsStatus('connected'); setReconnectInfo(null); setError(null);
      // Re-join room and refresh state after reconnect
      await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
      try { applyIncomingState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
      catch { /* state will come via broadcast */ }
    });
    client.on('reconnect_failed', () => { setWsStatus('failed'); setReconnectInfo(null); });
    client.on('error', (err: any) => setError(err?.message || 'Connection error'));
    client.on('bj_multi_table_state', (p: BJMultiTableState) => { applyIncomingState(p); });
    client.on('bj_multi_tip_notification', (p: any) => {
      const addr = (p.playerAddress ?? '').toLowerCase();
      // Resolve name from current seat state
      const seatMatch = stateRef.current?.seats.find(
        (s: any) => s.playerAddress?.toLowerCase() === addr
      );
      const name = (seatMatch as any)?.displayName || addr.slice(-4);
      setTipNotification({ name });
      setTimeout(() => setTipNotification(null), 5000);
    });

    setWsStatus('connecting');
    client.connect()
      .then(async () => {
        setWsConnected(true); setWsStatus('connected'); setError(null);
        await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
        try { applyIncomingState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
        catch { setError('Failed to load table state'); }
      })
      .catch((err: any) => { setError(err?.message || 'Connection failed'); setWsStatus('failed'); });
    wsClientRef.current = client; setWsClient(client);
    return () => { client.disconnect(); };
   
  }, [tableId, address, applyIncomingState, isE2EMock]);

  useEffect(() => {
    if (!isE2EMock || typeof window === 'undefined') return;
    const e2eApi: BJMultiE2ETestApi = {
      setState: (nextState: BJMultiTableState) => {
        applyIncomingState(nextState);
      },
      clearState: () => {
        setState(null);
        stateRef.current = null;
        visualStateRef.current = null;
        setVisualState(null);
      },
      getState: () => tableViewState ?? null,
    };
    window.__BJ_MULTI_E2E_TEST_API = e2eApi;
    return () => {
      delete window.__BJ_MULTI_E2E_TEST_API;
    };
  }, [isE2EMock, applyIncomingState, tableViewState]);

  const takeSeat = useCallback(async (pos: number) => {
    if (!wsClient?.isConnected() || !address) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    try { await wsClient.sendRequest('bj_multi_join_table', { tableId, seatPosition: pos }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, address, playSound]);

  const leaveSeat = useCallback(async () => {
    if (!wsClient?.isConnected()) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    try { await wsClient.sendRequest('bj_multi_leave_table', { tableId }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, playSound]);

  const placeBet = useCallback(async () => {
    const amt = parseInt(betAmount || '0', 10);
    if (!wsClient?.isConnected() || amt <= 0) return;
    if (amt < tableMinBetWhole || amt > tableMaxBetWhole) {
      setError(`Bet must be between ${tableMinBetWhole} and ${tableMaxBetWhole} MORBIUS`);
      return;
    }
    playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    try {
      await wsClient.sendRequest('bj_multi_place_bet', { tableId, amount: parseEther(String(amt)).toString() });
      fetchBalance();
    } catch (e) {
      const msg = (e as Error).message;
      // Suppress race-condition errors that aren't actionable
      if (!msg.includes('not in betting phase')) setError(msg);
    }
  }, [wsClient, tableId, betAmount, fetchBalance, playSound, tableMinBetWhole, tableMaxBetWhole]);

  const doAction = useCallback(async (action: 'hit' | 'stand' | 'double_down' | 'split') => {
    if (!wsClient?.isConnected()) return;
    // Sound: knock for hit, click confirmation for everything else
    if (action === 'hit') {
      playSound('/BlackJack/sounds/knock.wav');
    } else {
      playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    }
    try { await wsClient.sendRequest('bj_multi_action', { tableId, action, handIndex: mySeat?.activeHandIndex ?? 0 }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, mySeat, playSound]);

  const tipDealer = useCallback(async () => {
    if (tipAnimating) return;
    if (!wsClient?.isConnected() || !address || myPosition === null) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    setTipAnimating(true);
    try {
      await wsClient.sendRequest('bj_multi_tip_dealer', {
        tableId,
        amount: (BigInt(2000) * BigInt('1000000000000000000')).toString(),
      });
      // Dealer thanks voice line after tip succeeds
      playDealerVoice(pickRandom(SOUNDS_TIP));
      fetchBalance();
    } catch (e) {
      setError((e as Error).message);
      setTipAnimating(false);
    }
  }, [tipAnimating, wsClient, address, myPosition, playSound, tableId, playDealerVoice, fetchBalance]);

  const { getThemeInfo, getTableProfile } = useBlackjackTables();
  const theme = getThemeInfo({
    kind: (state?.themeKind ?? 'video') as 'video' | 'image',
    id: state?.themeId ?? 'glowingTable',
  });
  const tableImageSrc = theme.kind === 'image' ? theme.src : BLACKJACK_IMAGE_BACKGROUNDS[0].src;

  // Scale board content to fill the 16:9 container at any size
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const quantize = (v: number) => Math.round(v / 4) * 4;
    setTableWidth(quantize(el.clientWidth));
    const ro = new ResizeObserver((entries) => {
      const next = quantize(entries[0].contentRect.width);
      setTableWidth((prev) => (Math.abs(prev - next) >= 4 ? next : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardScale = tableWidth > 0 ? tableWidth / 800 : 1;

  if (!tableId) return null;

  return (
    <GlobalMainNav page="blackjackMulti" showBackArrow backArrowHref="/blackjack-multi" backArrowLabel="Lobby">
      {!isE2EMock && <BlackjackMultiBetaSplash />}
      <style>{BLACKJACK_MULTI_TABLE_STYLES}</style>
      <style>{`
        /* Portrait on small screens: show rotate prompt, hide game */
        @media (max-width: 768px) and (orientation: portrait) {
          [data-bj-rotate-prompt] { display: flex !important; }
          [data-bj-main] { display: none !important; }
        }
      `}</style>
      {/* Portrait-only rotate prompt — hidden by default, shown via CSS media query on small portrait screens */}
      <div
        data-bj-rotate-prompt
        className="fixed inset-0 z-[9999] hidden flex-col items-center justify-center gap-6"
        style={{ background: 'rgba(2, 6, 23, 0.97)' }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden>
          <rect x="14" y="8" width="28" height="48" rx="4" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
          <rect x="8" y="18" width="48" height="28" rx="4" stroke="rgba(34,211,238,0.8)" strokeWidth="2.5" />
          <path d="M46 10 L54 18 L46 26" stroke="rgba(34,211,238,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="text-center">
          <p className="text-lg font-bold text-white">Rotate your device</p>
          <p className="mt-1 text-sm text-white/50">Multiplayer Blackjack requires landscape mode</p>
        </div>
      </div>

      <main data-bj-main className="w-full max-w-full mx-0 px-2 sm:px-4 pt-2 sm:pt-4 pb-4 sm:pb-8 overflow-x-hidden overflow-y-auto no-scrollbar">
      {/* 2-column layout on md+: table (left) + sidebar controls (right) — same shell as app/BLACKJACK/page.tsx */}
      <div data-bj-grid className="grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(360px,1.2fr)] md:items-stretch gap-2 md:gap-4 min-h-0" style={{ scrollbarGutter: 'stable both-edges' }}>

      {/* ── Table column: top bar + table (single embossed panel) ── */}
      <div
        className="flex flex-col md:row-start-1 md:col-start-1 md:h-full md:min-h-0 rounded-xl overflow-hidden p-2 sm:p-3 gap-2 min-h-0"
        data-bj-table
        style={{
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <div className="shrink-0">
        <BlackjackMultiTopBar
          tableViewState={tableViewState}
          myPosition={myPosition}
          onLeaveSeat={leaveSeat}
          formatMorbius={formatMorbius}
        />
        </div>

      {/* ── Table container — locked to 16:9 so full table image is always visible ── */}
      <div
        ref={tableRef}
        className="relative w-full blackjack-table overflow-hidden shrink-0"
        style={isFullscreen ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          width: '100dvw',
          height: '100dvh',
          aspectRatio: 'unset',
          borderRadius: 0,
        } : {
          aspectRatio: '16 / 9',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.9), inset 0 -2px 8px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.3)',
          border: '1px inset rgba(60,60,60,0.5)',
        }}
      >
        <Image src={tableImageSrc} alt="Table" fill className="absolute inset-0 object-cover object-center pointer-events-none" style={{ zIndex: 0 }} priority unoptimized />

        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ zIndex: 1, background: 'linear-gradient(145deg, rgba(0,0,0,0.22), rgba(0,0,0,0.12))' }} />

        {/* SVG filter for glass-distort panel (blackjack animation) */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <filter id="glass-distort-multi">
              <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="2" seed="2" result="turbulence" />
              <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="6" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>

        {/* Content — always 800×450, scaled to fill the container */}
        <div
          className="absolute top-0 left-0 z-10"
          style={{ width: 800, height: 450, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}
        >

          <BlackjackMultiTipDealerControl
            visible={!!address && wsConnected && !!wsClient && myPosition !== null}
            tipAnimating={tipAnimating}
            tipNotificationName={tipNotification?.name ?? null}
            onTipDealer={tipDealer}
            onTipAnimationEnd={() => setTipAnimating(false)}
          />

          <BlackjackMultiConnectionOverlay
            wsConnected={wsConnected}
            address={address}
            wsStatus={wsStatus}
            reconnectInfo={reconnectInfo}
            error={error}
            onReload={() => window.location.reload()}
          />

          <BlackjackMultiRoundOverlays
            showWin={showWin}
            onWinComplete={() => setShowWin(null)}
            showBlackjackText={showBlackjackText}
            blackjackAnimKey={blackjackAnimKey}
            blackjackColorIndex={blackjackColorIndex}
          />

          {/* ── Play area ── */}
          {/* DEALER — absolute coords in 800×450 canvas space */}
          <div style={{ position: 'absolute', left: 220, top: 20 }}>
            <BlackjackMultiDealerArea
              tableViewState={tableViewState}
              visibleDealerCards={visibleDealerCards}
            />
          </div>

          {/* 3 SEATS — absolute coords in 800×450 canvas space; edit SEAT_ANCHORS in BlackjackMultiSeatGrid to reposition */}
          <BlackjackMultiSeatGrid
            seats={seatsByPosition}
            addressLower={address?.toLowerCase()}
            phase={tableViewState?.phase ?? 'waiting'}
            actingSeatPosition={tableViewState?.actingSeatPosition ?? null}
            myPosition={myPosition}
            wsConnected={wsConnected}
            afkTimeoutsBeforeKick={AFK_TIMEOUTS_BEFORE_KICK}
            myBalanceLabel={formatMorbius(playerBalance.toString())}
            showOutcomeLabel={showSeatOutcomeLabels}
            turnStartedAt={tableViewState?.turnStartedAt ?? null}
            bettingStartedAt={tableViewState?.bettingStartedAt ?? null}
            onTakeSeat={takeSeat}
            onOpenProfile={setSelectedProfileAddress}
            onLeaveSeat={myPosition !== null ? leaveSeat : undefined}
            onToggleSoundPanel={myPosition !== null ? () => setSoundPanelOpen(o => !o) : undefined}
            onSendChatMessage={myPosition !== null ? sendChatMessage : undefined}
          />

        </div>

        {/* ── Fullscreen toggle button (top-right corner of table) ── */}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="absolute top-2 right-2 z-30 flex items-center justify-center rounded-md bg-black/50 hover:bg-black/75 border border-white/20 text-white/70 hover:text-white transition-all"
          style={{ width: 32, height: 32 }}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8 3 3 3 3 8" /><polyline points="21 8 21 3 16 3" />
              <polyline points="3 16 3 21 8 21" /><polyline points="16 21 21 21 21 16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>

        {/* ── Fullscreen: avatar strip at top-center ── */}
        {isFullscreen && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-end gap-3 px-4 pt-1 pb-1"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.70) 70%, transparent)' }}
          >
            {seatsByPosition.map((seat, pos) => {
              if (!seat?.playerAddress) return null;
              return (
                <div key={pos} className="flex flex-col items-center gap-0.5">
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.25)', flexShrink: 0 }}>
                    <AvatarView config={seat.avatarConfig ?? null} disableAmbientMotion compact />
                  </div>
                  <span className="text-white/60 text-[10px] leading-none truncate max-w-[48px] text-center">
                    {seat.displayName ?? seat.playerAddress.slice(-4)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Fullscreen: betting/action panel — bottom-right ── */}
        {isFullscreen && myPosition !== null && (
          <div
            className="absolute bottom-0 right-0 z-30 flex flex-col gap-1.5 p-3"
            style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.88) 30%)',
              minWidth: 280,
              maxWidth: 340,
            }}
          >
            {/* Betting phase */}
            {state?.phase === 'betting' && !hasBet && (
              <>
                {/* Amount input row */}
                <div className="flex items-stretch rounded-lg border border-white/20 overflow-hidden" style={{ height: 36 }}>
                  <div className="flex-1 flex items-center gap-2 px-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={betAmount === '0' ? '' : betAmount}
                      onChange={e => { if (/^[0-9]*$/.test(e.target.value)) setBetAmount(e.target.value || '0'); }}
                      className="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none placeholder:text-white/30"
                      placeholder={`${tableMinBetWhole}–${tableMaxBetWhole}`}
                      aria-label="Bet amount"
                    />
                    <span className="text-white/40 text-xs flex-shrink-0">MORBIUS</span>
                  </div>
                  <div className="w-px bg-white/20 self-stretch" />
                  <button
                    onClick={() => setBetAmount(String(Math.max(tableMinBetWhole, Math.floor(parseInt(betAmount || '0', 10) / 2))))}
                    className="px-3 text-white font-bold text-sm hover:bg-white/10 transition-colors"
                  >½</button>
                  <div className="w-px bg-white/20 self-stretch" />
                  <button
                    onClick={() => setBetAmount(String(Math.min(tableMaxBetWhole, parseInt(betAmount || '0', 10) * 2)))}
                    className="px-3 text-white font-bold text-sm hover:bg-white/10 transition-colors"
                  >2×</button>
                </div>
                {/* Preset chips row */}
                <div className="grid grid-cols-5 rounded-md border border-white/20 overflow-hidden">
                  {[500, 5000, 25000, 50000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => {
                        const cur = parseInt(betAmount || '0', 10);
                        setBetAmount(String(Math.min(tableMaxBetWhole, cur + amt)));
                      }}
                      className="h-8 text-white/90 text-xs font-semibold hover:bg-white/10 transition-colors border-r border-white/20"
                    >
                      {amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                  <button
                    onClick={() => setBetAmount('0')}
                    className="h-8 text-white/90 text-xs font-semibold hover:bg-white/10 transition-colors"
                  >Clear</button>
                </div>
                {/* Deal button */}
                <button
                  onClick={placeBet}
                  className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
                >Deal</button>
              </>
            )}

            {/* Playing phase — my turn */}
            {isMyTurn && activeHand && (
              <div className="flex gap-2">
                <button onClick={() => doAction('hit')} className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">Hit</button>
                <button onClick={() => doAction('stand')} className="flex-1 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors">Stand</button>
                {activeHand.canDoubleDown && (
                  <button onClick={() => doAction('double_down')} className="flex-1 h-9 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-sm transition-colors">Double</button>
                )}
                {activeHand.canSplit && (
                  <button onClick={() => doAction('split')} className="flex-1 h-9 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors">Split</button>
                )}
              </div>
            )}

            {/* Status messages */}
            {state?.phase === 'betting' && hasBet && (
              <span className="text-white/50 text-xs text-right">Bet placed — waiting for round…</span>
            )}
            {(state?.phase === 'dealer_turn' || (state?.phase === 'playing' && !isMyTurn)) && (
              <span className="text-white/50 text-xs text-right">Waiting…</span>
            )}
          </div>
        )}

        <BlackjackMultiSoundPanel
          open={soundPanelOpen}
          onToggleOpen={() => setSoundPanelOpen((o) => !o)}
          soundEnabled={soundEnabled}
          dealerVoiceEnabled={dealerVoiceEnabled}
          sfxEnabled={sfxEnabled}
          isMusicPlaying={isMusicPlaying}
          musicVolume={musicVolume}
          currentTrackName={MUSIC_PLAYLIST[musicTrackIndex].split('/').pop()?.replace('.mp3', '').replace(/-/g, ' ') ?? 'Unknown'}
          onToggleSoundEnabled={() => setSoundEnabled((e) => !e)}
          onToggleDealerVoiceEnabled={() => setDealerVoiceEnabled((e) => !e)}
          onToggleSfxEnabled={() => setSfxEnabled((e) => !e)}
          onToggleMusic={toggleMusic}
          onNextTrack={nextTrack}
          onMusicVolumeChange={setMusicVolume}
        />

        {/* Hidden audio element for background music */}
        <audio
          ref={musicAudioRef}
          src={MUSIC_PLAYLIST[musicTrackIndex]}
          onEnded={handleMusicEnded}
          preload="auto"
        />
      </div>

      <div className="min-w-0 w-full flex-1 min-h-0 flex flex-col mt-2">
        <TableTokenProfileCard
          key={`image-${state?.themeId ?? BLACKJACK_IMAGE_BACKGROUNDS[0].id}`}
          themeKind={'image'}
          themeId={state?.themeId ?? BLACKJACK_IMAGE_BACKGROUNDS[0].id}
          getThemeInfo={getThemeInfo}
          getTableProfile={getTableProfile}
          onChangeTableClick={() => router.push('/blackjack-multi')}
          fillColumn
        />
      </div>
      {/* ── End table column (table + token profile) ── */}
      </div>

      {/* ── Column 2: controls, stats, how-to — stacked full width, separate blocks; hidden in fullscreen ── */}
      <div
        data-bj-panel
        className={`flex flex-col gap-3 min-w-0 md:row-start-1 md:col-start-2${isFullscreen ? ' hidden' : ''}`}
      >

        <BlackjackMultiBetActionPanel
          myPosition={myPosition}
          phase={state?.phase}
          hasBet={hasBet}
          consecutiveTimeouts={mySeat?.consecutiveTimeouts ?? 0}
          afkTimeoutsBeforeKick={AFK_TIMEOUTS_BEFORE_KICK}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          tableMinBetWhole={tableMinBetWhole}
          tableMaxBetWhole={tableMaxBetWhole}
          playerBalanceWei={playerBalance}
          isMyTurn={isMyTurn}
          activeHand={activeHand}
          doAction={doAction}
          soundEnabled={soundEnabled}
          playSound={playSound}
          placeBet={placeBet}
        />

        <BlackjackMultiInfoPanel
          chatMessages={chatMessages}
          systemChatMessages={systemChatMessages}
          roundHistory={roundHistory}
          address={address}
          wsConnected={wsConnected}
          onSendChatMessage={sendChatMessage}
          chartRef={chartRef}
          chartSessionStartTime={chartSessionStartTime.current}
          blackjackAddress={BLACKJACK_ADDRESS}
          morbiusTokenAddress={MORBIUS_TOKEN_ADDRESS}
          formatMorbius={formatMorbius}
          viewportHeightClassName={MULTI_INFO_PANEL_VIEWPORT_HEIGHT_CLASS}
        />

        {/* (Action bar is now integrated into the 2-col betting grid above) */}

        {/* Not seated CTA */}
        {state && myPosition === null && address && wsConnected && (
          <div className="text-center text-white/40 text-sm py-2">
            {state.seats.every(s => s.playerAddress) ? 'Table full — spectating' : 'Click an empty seat to join'}
          </div>
        )}

        <div className="w-full min-w-0">
          {address && playerStats ? (
            <PlayerStatsDashboard
              stats={playerStats}
              isLoading={playerStatsLoading}
              playerAddress={address}
              wsClient={wsConnected ? wsClient : null}
              reserveBalance={BigInt(playerBalance)}
            />
          ) : (
            <div
              className="flex min-h-[280px] w-full items-center justify-center overflow-hidden rounded-xl px-6 text-center text-white/60 md:min-h-[320px]"
              style={{
                background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              Connect wallet to view your player dashboard.
            </div>
          )}
        </div>

        <BlackjackHowToSection blackjackAddress={BLACKJACK_ADDRESS} layout="panel" />
      </div>
      </div>

      <PlayerProfileModal
        isOpen={!!selectedProfileAddress}
        onClose={() => setSelectedProfileAddress(null)}
        address={selectedProfileAddress}
        game="blackjack"
      />

      </main>
    </GlobalMainNav>
  );
}

