'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getWebSocketUrlOptional, getApiUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableState, BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Input } from '@/components/ui/input';
import { useChat } from '@/hooks/use-chat';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { BlackjackMobileActionBar } from '@/components/BLACKJACK/BlackjackMobileActionBar';
import { BettingPanelMobile } from '@/components/BLACKJACK/BettingPanelMobile';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { TableTokenProfileCard } from '@/components/BLACKJACK/TableTokenProfileCard';
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal';
import BlackjackMultiRealTimeBetChart, {
  type BlackjackMultiRealTimeBetChartRef,
} from '@/components/BLACKJACK/BlackjackMultiRealTimeBetChart';
import AvatarView from '@/components/poker/avatar/AvatarView';
import type { Emotion } from '@/components/poker/avatar/AvatarView';
import type { AvatarConfig } from '@/lib/websocket-client';
import { UserPlus, MessageCircle, Volume2, VolumeX, BarChart3, HelpCircle, History, Music, Play, Pause, SkipForward, Settings2, Mic, MicOff, ArrowLeft, Flame, Frown, LogOut, Palette, Smile, SmilePlus, Trophy, UserRound, Wallet, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RadialMenuFloating, type RadialMenuItem } from '@/components/ui/radial-menu';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';
import { DEFAULT_BLACKJACK_QUICKCHAT_PHRASES } from '@/components/poker/quickchat-phrases';
import { AnimatePresence, motion } from 'framer-motion';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { CardValue, Suit } from '@/app/BLACKJACK/types';
import Image from 'next/image';
import { BLACKJACK_VIDEO_BACKGROUNDS, BLACKJACK_IMAGE_BACKGROUNDS, SOUNDS_BETTING_OPEN, SOUNDS_BETTING_CLOSED, SOUNDS_DEALER_PHRASE, SOUNDS_PLAYER_WINS, SOUNDS_PLAYER_BLACKJACK, SOUNDS_DEALER_WINS, SOUNDS_DEALER_BLACKJACK, SOUNDS_TIP, SOUND_PUSH, pickRandom } from '@/app/BLACKJACK/constants';
import { useAudio, AudioManager } from '@/hooks/use-audio';
import { usePlayerStatsEnhanced } from '@/hooks/use-blackjack-stats';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';
import { toast } from 'sonner';
import { BLACKJACK_FACTS } from '@/app/blackjack-multi/blackjack-facts';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { BlackjackMultiBetaSplash } from '@/components/BLACKJACK/BlackjackMultiBetaSplash';

const TURN_TIMEOUT = 30;
const BETTING_TIMEOUT = 15;
/** Must match server BJ_MULTI_AFK_KICK_AFTER — shown in seat UI */
const AFK_TIMEOUTS_BEFORE_KICK = 3;

function resolveTheme(kind: 'video' | 'image', id: string) {
  if (kind === 'video') {
    const v = BLACKJACK_VIDEO_BACKGROUNDS.find(v => v.id === id);
    return { kind: 'video' as const, src: v?.src ?? BLACKJACK_VIDEO_BACKGROUNDS[0].src };
  }
  const img = BLACKJACK_IMAGE_BACKGROUNDS.find(i => i.id === id);
  return { kind: 'image' as const, src: img?.src ?? BLACKJACK_IMAGE_BACKGROUNDS[0].src };
}

function CircularTimerRing({ size, timeLeft, maxTime }: { size: number; timeLeft: number; maxTime: number }) {
  const pad = 5;
  const total = size + pad * 2;
  const cx = total / 2;
  const strokeWidth = 3.5;
  const radius = cx - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const hue = progress * 120;
  const color = `hsl(${hue}, 90%, 52%)`;
  return (
    <svg aria-hidden style={{ position: 'absolute', top: -pad, left: -pad, width: total, height: total, pointerEvents: 'none', zIndex: 5, transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }} />
    </svg>
  );
}

function useCountdown(startedAt: string | null, maxSeconds: number) {
  const [remaining, setRemaining] = useState(maxSeconds);
  useEffect(() => {
    if (!startedAt) { setRemaining(maxSeconds); return; }
    const start = new Date(startedAt).getTime();
    const tick = () => setRemaining(Math.max(0, maxSeconds - (Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, maxSeconds]);
  return remaining;
}

const POSITIONS = [0, 1, 2] as const;
const AVATAR_SIZE = 68;

// Avatar animation constants — matches poker system
const AVATAR_EMOTION_DURATION_MS = 3000;
const AVATAR_EMOTION_WINK_MS = 1200;
const AVATAR_ANIMATIONS: { title: string; emotion: Emotion }[] = [
  { title: 'Happy',     emotion: 'happy'     },
  { title: 'Wink',      emotion: 'wink'      },
  { title: 'Surprised', emotion: 'surprised' },
  { title: 'Angry',     emotion: 'angry'     },
  { title: 'Sad',       emotion: 'sad'       },
  { title: 'Dance',     emotion: 'dance'     },
  { title: 'Jackpot',   emotion: 'jackpot'   },
];

// Radial menu — emotion icons (matches poker)
const EMOTION_RADIAL_ICONS: Record<string, LucideIcon> = {
  happy: Smile,
  wink: SmilePlus,
  surprised: Zap,
  angry: Flame,
  sad: Frown,
  dance: Trophy,
  jackpot: Trophy,
};

const PHRASE_OVERLAY_DURATION_MS = 2000;
const LOCAL_EMOTION_DURATION_MS_RADIAL = 3000;

// Blackjack celebration text color palettes — matches single-player
const BLACKJACK_COLORS = [
  { encrypted: 'text-amber-400/60', revealed: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent' },
  { encrypted: 'text-purple-400/60', revealed: 'bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-500 bg-clip-text text-transparent' },
  { encrypted: 'text-cyan-400/60', revealed: 'bg-gradient-to-r from-cyan-300 via-teal-400 to-emerald-400 bg-clip-text text-transparent' },
  { encrypted: 'text-rose-400/60', revealed: 'bg-gradient-to-r from-rose-400 via-red-400 to-orange-400 bg-clip-text text-transparent' },
  { encrypted: 'text-emerald-400/60', revealed: 'bg-gradient-to-r from-emerald-300 via-green-400 to-lime-400 bg-clip-text text-transparent' },
];


function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: SUITS[suitIdx] };
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return '0'; }
}

/** Total MORBIUS (wei) shown as chips: pending bet in betting phase, else sum of per-hand bets after deal. */
function seatTableBetWei(seat: BJMultiSeatState): bigint {
  try {
    const pb = BigInt(seat.pendingBet || '0');
    if (pb > 0n) return pb;
    if (seat.hands?.length) {
      return seat.hands.reduce((a, h) => a + BigInt(h.betAmount || '0'), 0n);
    }
    return BigInt(seat.betAmount || '0');
  } catch {
    return 0n;
  }
}

/** Blackjack total from server card indices (0–51), using only the first `visibleCount` cards. */
function handTotalFromCardIndices(indices: number[], visibleCount: number): number {
  const n = Math.max(0, Math.min(visibleCount, indices.length));
  let total = 0;
  let hasAce = false;
  for (let i = 0; i < n; i++) {
    const rank = (indices[i] % 13) + 1;
    if (rank === 1) {
      hasAce = true;
      total += 11;
    } else if (rank >= 11) total += 10;
    else total += rank;
  }
  if (hasAce && total > 21) total -= 10;
  return total;
}


// ──────────────────────────────────────────────────────────────────────────────
// Seat component — cards rendered like BlackjackTable (card-overlap-player)
// ──────────────────────────────────────────────────────────────────────────────
function Seat({
  seat, position, isMe, isEmpty, isActing, phase, onTakeSeat, canTakeSeat, turnStartedAt, bettingStartedAt, balanceLabel, onOpenProfile, showOutcomeLabel,
  onLeaveSeat, onToggleSoundPanel, onSendChatMessage,
}: {
  seat: BJMultiSeatState | null; position: number; isMe: boolean; isEmpty: boolean;
  isActing: boolean; phase: string; onTakeSeat: () => void; canTakeSeat: boolean;
  turnStartedAt: string | null; bettingStartedAt: string | null;
  balanceLabel?: string | null;
  onOpenProfile?: (address: string) => void;
  showOutcomeLabel?: boolean;
  onLeaveSeat?: () => void;
  onToggleSoundPanel?: () => void;
  onSendChatMessage?: (msg: string) => void;
}) {
  // Rotation angle — left seat faces right toward dealer, right seat faces left
  const seatRotation = position === 0 ? 45 : position === 2 ? -45 : 0;
  const turnRemaining = useCountdown(isActing ? turnStartedAt : null, TURN_TIMEOUT);
  const betRemaining = useCountdown(phase === 'betting' && !isEmpty ? bettingStartedAt : null, BETTING_TIMEOUT);
  const resultColor = (r: string | null | undefined) =>
    r === 'win' || r === 'blackjack' ? 'text-green-400' :
    r === 'loss' ? 'text-red-400' :
    r === 'push' ? 'text-yellow-400' : '';

  // Avatar animations — matches poker system
  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // Radial menu state — matches poker pattern
  const [playerRadialOpen, setPlayerRadialOpen] = useState(false);
  const [playerRadialPage, setPlayerRadialPage] = useState<'main' | 'expressions' | 'settings'>('main');

  // Long-press for QuickChat (right-click on desktop, long-press on mobile)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // QuickChat state
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases('morb_blackjack_quickchat', DEFAULT_BLACKJACK_QUICKCHAT_PHRASES);

  // Emotion radial items
  const emotionRadialItems = useMemo(
    () =>
      AVATAR_ANIMATIONS.map(({ title, emotion }) => ({
        id: emotion,
        label: title,
        icon: EMOTION_RADIAL_ICONS[emotion] ?? Smile,
      })),
    [],
  );

  const emotionMenuWithBack = useMemo(
    (): RadialMenuItem[] => [{ id: '_back', label: 'Back', icon: ArrowLeft }, ...emotionRadialItems],
    [emotionRadialItems],
  );

  // Player main menu items — QuickChat moved to right-click/long-press on avatar
  const playerMainMenuItems = useMemo((): RadialMenuItem[] => {
    const items: RadialMenuItem[] = [];
    items.push({ id: 'expressions', label: 'Moves', icon: Smile });
    items.push({ id: 'settings', label: 'Settings', icon: Settings2 });
    if (onLeaveSeat) items.push({ id: 'leave', label: 'Leave', icon: LogOut });
    return items;
  }, [onLeaveSeat]);

  // Settings submenu items
  const settingsMenuItems = useMemo((): RadialMenuItem[] => [
    { id: '_back', label: 'Back', icon: ArrowLeft },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'sounds', label: 'Sounds', icon: Volume2 },
    { id: 'edit_quickchat', label: 'QuickChat', icon: MessageCircle },
  ], []);

  // Auto-emotion based on round result
  const resultEmotion: Emotion = useMemo(() => {
    if (!seat?.result) return 'neutral';
    if (seat.result === 'blackjack') return 'jackpot';
    if (seat.result === 'win') return 'happy';
    if (seat.result === 'loss') return 'sad';
    if (seat.result === 'push') return 'surprised';
    return 'neutral';
  }, [seat?.result]);

  const hasMenuOpen = quickChatPickerOpen || playerRadialOpen;
  // Priority: menu-open neutral > local pick > result-driven > neutral
  const activeEmotion: Emotion = hasMenuOpen ? 'neutral' : (localEmotion ?? (phase === 'completed' ? resultEmotion : 'neutral'));
  const canOpenProfile = !!seat?.playerAddress && !!onOpenProfile && !isMe;
  const seatOutcomeLabel = (() => {
    if (!seat || seat.hands.length === 0) return null;
    const hasBlackjack = seat.hands.some((h) => h.result === 'blackjack');
    const hasWin = seat.hands.some((h) => h.result === 'win' || h.result === 'blackjack');
    const allLoss = seat.hands.every((h) => h.result === 'loss');
    const allPush = seat.hands.every((h) => h.result === 'push');
    if (hasBlackjack || hasWin) return { text: `WON +${formatMorbius(seat.payout || '0')}`, cls: 'text-emerald-300' };
    if (allLoss) return { text: 'LOST', cls: 'text-red-300' };
    if (allPush) return { text: 'PUSH', cls: 'text-yellow-300' };
    return null;
  })();

  // Close radial menu when phase changes
  useEffect(() => { setPlayerRadialOpen(false); setPlayerRadialPage('main'); setQuickChatPickerOpen(false); }, [phase]);

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => {
      setLocalEmotion(null);
    }, emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS);
  }, []);

  const handlePlayerRadialSelect = useCallback(
    (item: RadialMenuItem) => {
      const id = String(item.id);

      // ── Expressions page ──
      if (playerRadialPage === 'expressions') {
        if (id === '_back') { setPlayerRadialPage('main'); return; }
        handleAnimationSelect(item.id as Emotion);
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        return;
      }

      // ── Settings page ──
      if (playerRadialPage === 'settings') {
        if (id === '_back') { setPlayerRadialPage('main'); return; }
        if (id === 'sounds') onToggleSoundPanel?.();
        else if (id === 'edit_quickchat') setEditQuickChatOpen(true);
        else if (id === 'theme') toast.info('Table theme picker coming soon');
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        return;
      }

      // ── Main page ──
      if (id === 'expressions') { setPlayerRadialPage('expressions'); return; }
      if (id === 'settings') { setPlayerRadialPage('settings'); return; }
      if (id === 'leave') onLeaveSeat?.();
      setPlayerRadialOpen(false);
      setPlayerRadialPage('main');
    },
    [playerRadialPage, handleAnimationSelect, onToggleSoundPanel, onLeaveSeat],
  );

  const handleQuickChatSelect = useCallback((phrase: string) => {
    setQuickChatPickerOpen(false);
    if (onSendChatMessage) {
      onSendChatMessage(phrase);
      return;
    }
    setOverlayPhrase(phrase);
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    phraseOverlayTimeoutRef.current = setTimeout(() => {
      setOverlayPhrase(null);
      phraseOverlayTimeoutRef.current = null;
    }, PHRASE_OVERLAY_DURATION_MS);
  }, [onSendChatMessage]);

  return (
    <div
      className="relative flex flex-col items-center gap-0 min-w-0 h-[220px] justify-end pb-[48px]"
      style={{ transform: seatRotation ? `rotate(${seatRotation}deg)` : undefined, transformOrigin: 'center bottom' }}
    >
      {/* Cards area */}
      {isEmpty ? (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-4 min-h-[80px] border-2 border-dashed transition-all ${
            canTakeSeat
              ? 'border-cyan-400/70 bg-cyan-900/20 hover:border-cyan-300 hover:bg-cyan-800/30 cursor-pointer hover:scale-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
              : 'border-white/25 bg-white/[0.03]'
          }`}
          style={position === 1 ? { marginTop: 'auto', marginBottom: '25px' } : undefined}
          onClick={canTakeSeat ? onTakeSeat : undefined}
        >
          {canTakeSeat && (
            <>
              <UserPlus className="w-8 h-8 text-cyan-400/80" />
              <span className="text-xs font-semibold text-cyan-400/80 tracking-wide">Seat {position + 1}</span>
            </>
          )}
          {!canTakeSeat && <span className="text-xs text-white/35 font-medium">Seat {position + 1}</span>}
        </div>
      ) : (
        <>
          {/* Hands */}
          {seat && seat.hands.length > 0 ? (
            <div className={`flex min-h-[80px] justify-center items-start ${seat.hands.length > 1 ? 'flex-row gap-2' : 'flex-col items-center gap-1'}`}>
              {seat.hands.map((hand, hi) => {
                const hasSplit = seat.hands.length > 1;
                const isActiveHand = hasSplit && isActing && seat.activeHandIndex === hi;
                const isCompletedHand = hasSplit && isActing && (hand.isBust || hi < seat.activeHandIndex);
                return (
                  <div
                    key={hi}
                    className={`flex flex-col items-center gap-1 ${hasSplit ? 'px-1.5 py-1 rounded-md transition-all duration-300' : ''}`}
                    style={
                      hasSplit
                        ? {
                            background: isActiveHand
                              ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.15), rgba(6, 182, 212, 0.05))'
                              : isCompletedHand
                                ? 'linear-gradient(145deg, rgba(100, 100, 100, 0.1), rgba(50, 50, 50, 0.05))'
                                : 'transparent',
                            border: isActiveHand
                              ? '2px solid rgba(6, 182, 212, 0.5)'
                              : isCompletedHand
                                ? '1px solid rgba(100, 100, 100, 0.3)'
                                : '1px solid rgba(60, 60, 60, 0.35)',
                            boxShadow: isActiveHand
                              ? '0 0 16px rgba(6, 182, 212, 0.28), inset 0 0 8px rgba(6, 182, 212, 0.08)'
                              : 'none',
                            opacity: isCompletedHand ? 0.72 : 1,
                            transform: isActiveHand ? 'scale(1.02)' : 'scale(1)',
                          }
                        : undefined
                    }
                  >
                    {hasSplit && (
                      <div className="mb-0 flex items-center gap-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${
                            isActiveHand ? 'text-cyan-400' : 'text-white/45'
                          }`}
                        >
                          Hand {hi + 1}
                        </span>
                        {isActiveHand && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" aria-hidden />}
                      </div>
                    )}
                    <div className="flex flex-col items-center">
                      {/* Score counter — above cards, matching single-player glass-counter style */}
                      {hand.cards.length > 0 && (
                        <div className={`flex items-center gap-2 transition-transform duration-300 ${
                          showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'card-counter-winner' : ''
                        }`} style={{ marginBottom: -10, zIndex: 0 }}>
                          <div className={`glass-counter relative w-16 h-16 flex items-center justify-center rounded-full transition-all duration-300 ${
                            isActing && seat.activeHandIndex === hi ? 'card-counter-active' : ''
                          }`}>
                            <span className={`font-black relative z-10 transition-all duration-500 ${
                              hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-400' : showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'text-emerald-400' : isActiveHand ? 'text-white/90' : hasSplit ? 'text-white/50' : 'text-white/90'
                            } ${hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21 ? 'text-xl' : 'text-3xl'}`}>
                              {hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21
                                ? <>{hand.total - 10}<span className="text-white/40">/</span>{hand.total}</>
                                : hand.total}
                            </span>
                          </div>
                          {hand.isBlackjack && <span className="text-yellow-400 font-black text-sm">BJ!</span>}
                          {hand.isBust && <span className="text-red-400 font-black text-sm">BUST</span>}
                        </div>
                      )}
                      <div className="relative flex">
                        {hand.cards.map((c, ci) => (
                          <div key={ci} className={ci > 0 ? 'card-overlap-player' : ''} style={{ zIndex: ci }}>
                            <PlayingCard card={indexToCard(c)} owner="player" className="" size="small" />
                          </div>
                        ))}
                        {/* BetChip — overlays top-right of 2nd hole card */}
                        {!hasSplit && seat && seatTableBetWei(seat) > 0n && hand.cards.length >= 2 && (
                          <div className="absolute -top-2 -right-3" style={{ zIndex: 20 }}>
                            <BetChip
                              label={formatChipLabel(Math.floor(Number(formatEther(seatTableBetWei(seat)))))}
                              size="clamp(32px, 6vw, 40px)"
                              chipSrc="/morbius/MorbiusChip.png"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {hasSplit && phase !== 'betting' && BigInt(hand.betAmount || '0') > 0n && (
                      <span className="text-[10px] font-bold text-white/70 mt-0.5" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                        {formatMorbius(hand.betAmount)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Placeholder cards when seated but no hand yet */
            <div className="flex gap-0 min-h-[80px] items-center justify-center">
              {phase !== 'waiting' && phase !== 'betting' ? null : (
                <div className="w-14 h-20 rounded-lg border border-dashed border-white/10" />
              )}
            </div>
          )}

          {/* BetChip for split hands — shown below cards */}
          {seat && seat.hands.length > 1 && seatTableBetWei(seat) > 0n && (
            <div className="flex flex-col items-center mt-1">
              <BetChip
                label={formatChipLabel(Math.floor(Number(formatEther(seatTableBetWei(seat)))))}
                size="clamp(44px, 8vw, 56px)"
                chipSrc="/morbius/MorbiusChip.png"
              />
            </div>
          )}

          {seat?.seatStatus === 'sitting_out' && (
            <span className="text-[9px] text-white/30">sitting out</span>
          )}

          {/* Player avatar + name — pinned to bottom, overlays cards */}
          <div className="absolute bottom-[4px] left-1/2 -translate-x-1/2 flex items-center gap-2" style={{ zIndex: 25 }}>
            <div className="relative flex-shrink-0" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
              {isActing && <CircularTimerRing size={AVATAR_SIZE} timeLeft={turnRemaining} maxTime={TURN_TIMEOUT} />}
              {!isActing && phase === 'betting' && <CircularTimerRing size={AVATAR_SIZE} timeLeft={betRemaining} maxTime={BETTING_TIMEOUT} />}
              <div
                ref={avatarRef}
                className="w-full h-full rounded-full overflow-hidden bg-slate-800"
                style={{
                  border: isMe ? '2px solid rgba(34,211,238,0.6)' : isActing ? '2px solid transparent' : '2px solid rgba(255,255,255,0.15)',
                  cursor: isMe || canOpenProfile ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                  if (isMe && playerMainMenuItems.length > 0) {
                    setPlayerRadialPage('main');
                    setPlayerRadialOpen(true);
                    return;
                  }
                  if (canOpenProfile && seat?.playerAddress) {
                    onOpenProfile(seat.playerAddress);
                  }
                }}
                onContextMenu={(e) => {
                  if (isMe && onSendChatMessage) {
                    e.preventDefault();
                    setPlayerRadialOpen(false);
                    setQuickChatPickerOpen(true);
                  }
                }}
                onTouchStart={() => {
                  if (!isMe || !onSendChatMessage) return;
                  longPressTriggered.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    longPressTriggered.current = true;
                    setPlayerRadialOpen(false);
                    setQuickChatPickerOpen(true);
                  }, 500);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                }}
                onTouchMove={() => {
                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                }}
                title={isMe ? 'Tap for menu · Right-click for QuickChat' : undefined}
              >
                {seat?.avatarConfig ? (
                  <AvatarView
                    config={seat.avatarConfig as unknown as AvatarConfig}
                    emotion={activeEmotion}
                    trackMouse={isMe}
                    roamEyes={!isMe && !isActing}
                    forceAsleep={seat?.seatStatus === 'sitting_out'}
                    compact
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>

              {showOutcomeLabel && seatOutcomeLabel && (
                <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-[2px] text-[11px] font-bold whitespace-nowrap ${seatOutcomeLabel.cls}`}>
                  {seatOutcomeLabel.text}
                </div>
              )}
            </div>
            <div
              className={`flex flex-col min-w-0 rounded-md px-2 py-1 bg-black/35 backdrop-blur-sm border border-white/10 ${canOpenProfile ? 'cursor-pointer hover:bg-black/45 transition-colors' : ''}`}
              onClick={() => {
                if (canOpenProfile && seat?.playerAddress) onOpenProfile(seat.playerAddress);
              }}
            >
              <span className="text-[12px] font-semibold truncate max-w-[120px] leading-tight text-white/90">
                {seat?.displayName ?? (seat?.playerAddress ? seat.playerAddress.slice(0, 6) + '…' : '—')}
                {isMe && <span className="text-[9px] text-white/90 ml-1">(you)</span>}
              </span>
              {balanceLabel != null && (
                <span className="text-[11px] text-white/90 tabular-nums leading-tight">{balanceLabel}</span>
              )}
              {seat && (seat.consecutiveTimeouts ?? 0) > 0 && (
                <span
                  className={`text-[9px] font-semibold tabular-nums mt-0.5 leading-tight rounded px-1.5 py-0.5 border max-w-[118px] ${
                    (seat.consecutiveTimeouts ?? 0) >= AFK_TIMEOUTS_BEFORE_KICK - 1
                      ? 'border-orange-500/45 bg-orange-950/55 text-orange-100/95'
                      : 'border-cyan-500/30 bg-gradient-to-r from-slate-900/90 to-slate-800/90 text-cyan-100/85'
                  }`}
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)' }}
                  title="Each missed betting window or turn timeout (auto-stand) adds one. At 3 you are removed from the table and mid-round chips are refunded."
                >
                  {(seat.consecutiveTimeouts ?? 0)}/{AFK_TIMEOUTS_BEFORE_KICK} idle
                  {isMe ? ' — act or lose seat' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Radial menu — floats above avatar (current player only) */}
          {isMe && playerMainMenuItems.length > 0 && (
            <RadialMenuFloating
              open={playerRadialOpen}
              onOpenChange={(o) => {
                setPlayerRadialOpen(o);
                if (!o) setPlayerRadialPage('main');
              }}
              anchorRef={avatarRef}
              menuItems={playerRadialPage === 'main' ? playerMainMenuItems : playerRadialPage === 'expressions' ? emotionMenuWithBack : settingsMenuItems}
              onSelect={handlePlayerRadialSelect}
              size={playerRadialPage === 'expressions' ? 220 : playerRadialPage === 'settings' ? 240 : 260}
              iconSize={playerRadialPage === 'expressions' ? 13 : 16}
              bandWidth={playerRadialPage === 'expressions' ? 38 : 44}
              showLabels
            />
          )}

          {/* QuickChat picker — appears above avatar */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2" style={{ zIndex: 50 }}>
            <div ref={menuContainerRef} className="w-max min-w-[120px]">
              <AnimatePresence>
                {isMe && quickChatPickerOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                    <div className="rounded-xl overflow-hidden max-h-[min(280px,60vh)] overflow-y-auto min-w-[160px] max-w-[220px]"
                      style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                      {quickChatPhrases.map((phrase) => (
                        <button key={phrase} type="button" onClick={() => handleQuickChatSelect(phrase)}
                          className="w-full px-3 py-2 text-sm text-center hover:bg-white/10 transition-colors truncate text-white/80">{phrase}</button>
                      ))}
                      <button type="button" onClick={() => { setQuickChatPickerOpen(false); setEditQuickChatOpen(true); }}
                        className="w-full px-3 py-2.5 text-sm font-medium text-center hover:bg-white/10 transition-colors flex items-center justify-center gap-2 border-t border-white/10 text-white/80">
                        <span className="text-cyan-400">✎</span> Edit QuickChat
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* QuickChat backdrop */}
          <AnimatePresence>
            {isMe && quickChatPickerOpen && (
              <motion.div
                className="fixed inset-0 z-[45]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setQuickChatPickerOpen(false)}
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Phrase overlay bubble */}
          <AnimatePresence>
            {overlayPhrase && (
              <motion.div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 rounded-lg bg-black/90 border border-white/15 text-white text-xs font-medium whitespace-nowrap"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{ zIndex: 40 }}
              >
                {overlayPhrase}
              </motion.div>
            )}
          </AnimatePresence>

          <EditQuickChatModal open={editQuickChatOpen} onClose={() => setEditQuickChatOpen(false)} selectedPhrases={quickChatPhrases} onSave={setQuickChatPhrases} />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export default function BlackjackMultiTablePage() {
  const params = useParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [state, setState] = useState<BJMultiTableState | null>(null);
  const stateRef = useRef<BJMultiTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedProfileAddress, setSelectedProfileAddress] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');
  const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipNotification, setTipNotification] = useState<{ name: string } | null>(null);
  const [tipAnimating, setTipAnimating] = useState(false);
  const wsClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

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
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined,
  } : null;

  // Chat dropdown overlay
  const [activeTab, setActiveTab] = useState('chat');
  // Track completed rounds for History tab
  const [roundHistory, setRoundHistory] = useState<Array<{
    roundNumber: number; roundId: string | null; dealerTotal: number; dealerCards: number[];
    seats: Array<{ position: number; playerAddress: string; hands: any[]; payout: string; result: string }>;
    timestamp: number;
  }>>([]);

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

  // Trigger Recharts remeasure when chart tab becomes visible
  useEffect(() => {
    if (activeTab === 'chart') {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  }, [activeTab]);

  /** Outcome audio + win toast — deferred until dealer cards are fully revealed (single-player parity). */
  type PendingDealerOutcome = {
    kind: 'player_blackjack' | 'player_win' | 'push' | 'dealer_blackjack' | 'dealer_win' | 'silent';
    payout: bigint;
  };
  const pendingDealerOutcomeRef = useRef<PendingDealerOutcome | null>(null);

  // Progressive dealer card reveal — matches single-player BlackjackTable behavior
  const [visibleDealerCards, setVisibleDealerCards] = useState(0);
  const prevDealerCardCountRef = useRef(0);
  const dealerRevealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showSeatOutcomeLabels, setShowSeatOutcomeLabels] = useState(false);

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

  // Sound effects + win notification on phase transitions
  useEffect(() => {
    if (!state) return;
    if (state.phase !== 'completed' && showSeatOutcomeLabels) {
      setShowSeatOutcomeLabels(false);
    }
    if (state.phase !== 'completed' && showBlackjackText) {
      setShowBlackjackText(false);
    }
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (!prevPhase) return;

    // ── Betting opens: announce + schedule a random dealer phrase ──
    if (prevPhase !== 'betting' && state.phase === 'betting') {
      playDealerVoice(pickRandom(SOUNDS_BETTING_OPEN));
      // Clear any lingering phrase timer
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      // Play a random dealer phrase only every 5th hand (quieter table pacing).
      const roundNumber = Number(state.roundNumber ?? 0);
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
    if (prevPhase === 'betting' && state.phase === 'playing') {
      if (dealerPhraseTimerRef.current) { clearTimeout(dealerPhraseTimerRef.current); dealerPhraseTimerRef.current = null; }
      playDealerVoice(pickRandom(SOUNDS_BETTING_CLOSED));
      // Card deal sound slightly after the voice starts
      setTimeout(() => playSound('/BlackJack/sounds/cards.wav'), 600);
    }

    // ── Cards dealt sound for non-betting→playing transitions ──
    if (prevPhase !== 'betting' && prevPhase !== 'playing' && state.phase === 'playing') {
      playSound('/BlackJack/sounds/cards.wav');
    }

    // ── Round completes: outcome voice + win toast — deferred until dealer reveal finishes (flushPendingDealerOutcome) ──
    if (prevPhase !== 'completed' && state.phase === 'completed') {
      // Blackjack animation — show if ANY seat at the table got blackjack
      const anyBlackjack = state.seats.some(s =>
        s.playerAddress && s.hands.some(h => h.result === 'blackjack')
      );
      if (anyBlackjack) {
        setBlackjackColorIndex(Math.floor(Math.random() * BLACKJACK_COLORS.length));
        setBlackjackAnimKey(k => k + 1);
        setShowBlackjackText(true);
      }

      const seat = state.seats.find(s =>
        s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
      );
      if (seat && seat.hands.length > 0) {
        const totalPayout = BigInt(seat.payout || '0');
        const hasBlackjack = seat.hands.some(h => h.result === 'blackjack');
        const hasWin = seat.hands.some(h => h.result === 'win' || h.result === 'blackjack');
        const allLoss = seat.hands.every(h => h.result === 'loss');
        const allPush = seat.hands.every(h => h.result === 'push');

        const dealerHadBJ = state.dealerTotal === 21 && (state.dealerCards?.length ?? 0) === 2;

        let kind: PendingDealerOutcome['kind'] = 'silent';
        if (hasBlackjack) kind = 'player_blackjack';
        else if (hasWin) kind = 'player_win';
        else if (allPush) kind = 'push';
        else if (allLoss && dealerHadBJ) kind = 'dealer_blackjack';
        else if (allLoss) kind = 'dealer_win';
        pendingDealerOutcomeRef.current = { kind, payout: totalPayout };

        // Feed multiplayer rounds into realtime chart once per round.
        const roundNo = Number(state.roundNumber ?? 0);
        if (roundNo > 0 && lastChartRoundRef.current !== roundNo) {
          const totalBetWei = seat.hands.reduce((acc, h) => {
            try { return acc + BigInt(h.betAmount || '0'); } catch { return acc; }
          }, 0n);
          chartRef.current?.addGameResult(totalBetWei, totalPayout, {
            gameId: state.currentRoundId ?? undefined,
            result: kind,
          });
          lastChartRoundRef.current = roundNo;

          // Track round for History tab
          setRoundHistory(prev => {
            if (prev.some(r => r.roundNumber === roundNo)) return prev;
            const entry = {
              roundNumber: roundNo,
              roundId: state.currentRoundId,
              dealerTotal: state.dealerTotal,
              dealerCards: [...(state.dealerCards ?? [])],
              seats: state.seats
                .filter(s => s.playerAddress && s.hands.length > 0)
                .map(s => ({
                  position: s.position,
                  playerAddress: s.playerAddress!,
                  hands: s.hands.map(h => ({ ...h })),
                  payout: s.payout || '0',
                  result: s.hands.some(hh => hh.result === 'win' || hh.result === 'blackjack') ? 'win'
                    : s.hands.every(hh => hh.result === 'push') ? 'push' : 'loss',
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, address]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seats]);

  // Progressive dealer card reveal — matches single-player BlackjackTable
  // During 'playing': show 1 card + face-down hole card (server only sends 1)
  // On 'dealer_turn'/'completed': reveal cards one at a time with delays
  useEffect(() => {
    const dealerCards = state?.dealerCards ?? [];
    const totalCards = dealerCards.length;
    const phase = state?.phase ?? 'waiting';
    const prevCount = prevDealerCardCountRef.current;

    // Phase reset: no cards → reset visible count
    if (totalCards === 0) {
      setVisibleDealerCards(0);
      prevDealerCardCountRef.current = 0;
      if (dealerRevealTimerRef.current) {
        clearTimeout(dealerRevealTimerRef.current);
        dealerRevealTimerRef.current = null;
      }
      return;
    }

    // During playing phase: always show just the 1 card server sends
    if (phase === 'playing') {
      setVisibleDealerCards(totalCards); // server sends only 1 during playing
      prevDealerCardCountRef.current = totalCards;
      return;
    }

    // New cards arrived (dealer_turn or completed) — reveal progressively
    if (totalCards > prevCount && (phase === 'dealer_turn' || phase === 'completed')) {
      // Clear any existing reveal timer
      if (dealerRevealTimerRef.current) {
        clearTimeout(dealerRevealTimerRef.current);
        dealerRevealTimerRef.current = null;
      }

      // Start from the hole card (index 1) if we were only showing 1
      const startFrom = Math.max(visibleDealerCards, 1);
      let idx = startFrom;

      const revealNext = () => {
        idx++;
        if (idx <= totalCards) {
          setVisibleDealerCards(idx);
          playSound('/BlackJack/sounds/cards.wav');
          if (idx < totalCards) {
            dealerRevealTimerRef.current = setTimeout(revealNext, 1200);
          }
        }
      };

      // Reveal hole card after 800ms, then each additional card every 1200ms
      dealerRevealTimerRef.current = setTimeout(revealNext, 800);
      prevDealerCardCountRef.current = totalCards;
      return;
    }

    prevDealerCardCountRef.current = totalCards;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.dealerCards?.length, state?.phase]);

  // After dealer cards are fully revealed, play outcome voice + win toast (matches single-player handleDealerRevealComplete)
  useEffect(() => {
    if (state?.phase !== 'completed') return;
    if (!pendingDealerOutcomeRef.current) return;
    const total = state.dealerCards?.length ?? 0;
    if (total === 0) {
      flushPendingDealerOutcome();
      return;
    }
    if (visibleDealerCards >= total) {
      flushPendingDealerOutcome();
    }
  }, [state?.phase, state?.dealerCards?.length, visibleDealerCards, flushPendingDealerOutcome]);

  // Safety: if the table advances before reveal animation finishes, still announce outcome
  useEffect(() => {
    if (state?.phase !== 'betting' && state?.phase !== 'waiting') return;
    if (!pendingDealerOutcomeRef.current) return;
    flushPendingDealerOutcome();
  }, [state?.phase, flushPendingDealerOutcome]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dealerRevealTimerRef.current) clearTimeout(dealerRevealTimerRef.current);
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      if (dealerVoiceRef.current) { try { dealerVoiceRef.current.source.stop(); } catch {} }
    };
  }, []);

  const roomId = `blackjack:table:${tableId}`;
  const { messages: chatMessages, sendMessage: sendChatMessage } = useChat(roomId, { wsClient, wsConnected });

  // ── System chat messages (welcome, FactBot, idle warnings) ──
  const [systemChatMessages, setSystemChatMessages] = useState<SystemChatMessage[]>([]);
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

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !address) return;
    const client = new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync as any);
    client.on('disconnected', () => { setWsConnected(false); setWsStatus('reconnecting'); });
    client.on('reconnecting', (info: any) => { setWsStatus('reconnecting'); setReconnectInfo(info); });
    client.on('reconnected', async () => {
      setWsConnected(true); setWsStatus('connected'); setReconnectInfo(null); setError(null);
      // Re-join room and refresh state after reconnect
      await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
      try { setState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
      catch { /* state will come via broadcast */ }
    });
    client.on('reconnect_failed', () => { setWsStatus('failed'); setReconnectInfo(null); });
    client.on('error', (err: any) => setError(err?.message || 'Connection error'));
    client.on('bj_multi_table_state', (p: BJMultiTableState) => { setState(p); stateRef.current = p; });
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
        try { setState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
        catch { setError('Failed to load table state'); }
      })
      .catch((err: any) => { setError(err?.message || 'Connection failed'); setWsStatus('failed'); });
    wsClientRef.current = client; setWsClient(client);
    return () => { client.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, address]);

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
    playSound('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
    try {
      await wsClient.sendRequest('bj_multi_place_bet', { tableId, amount: parseEther(String(amt)).toString() });
      fetchBalance();
    } catch (e) {
      const msg = (e as Error).message;
      // Suppress race-condition errors that aren't actionable
      if (!msg.includes('not in betting phase')) setError(msg);
    }
  }, [wsClient, tableId, betAmount, fetchBalance, playSound]);

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

  const theme = resolveTheme(state?.themeKind ?? 'video', state?.themeId ?? 'glowingTable');
  const { getThemeInfo, getTableProfile } = useBlackjackTables();

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
    <GlobalMainNav page="blackjack" showBackArrow backArrowHref="/blackjack-multi" backArrowLabel="Lobby">
      <BlackjackMultiBetaSplash />
      <style>{`
        /* Desktop: overlapping card margins — tighter for small cards */
        @media (min-width: 641px) {
          .card-overlap-dealer { margin-left: -15px; }
          .card-overlap-player { margin-left: -18px; }
        }
        /* Mobile: card overlap */
        @media (max-width: 640px) {
          .card-overlap-dealer { margin-left: -12px; }
          .card-overlap-player { margin-left: -14px; }
        }
        .card-slide-in {
          animation: cardSlideIn 0.4s ease-out forwards;
        }
        @keyframes cardSlideIn {
          from { opacity: 0; transform: translateX(60px) translateY(-40px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        .betting-breathe {
          animation: breathe 3s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .tip-chip-fly {
          animation: tipChipFly 0.7s ease-in forwards;
        }
        @keyframes tipChipFly {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; transform: translateY(-80px) scale(0.8); }
          100% { opacity: 0; transform: translateY(-120px) scale(0.3); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Card counter active border animation — matches single-player */
        @keyframes cyanGlow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(34, 211, 238, 0.4),
                        0 0 16px rgba(34, 211, 238, 0.2),
                        inset 0 0 8px rgba(34, 211, 238, 0.1);
            border-color: rgba(34, 211, 238, 0.5);
          }
          50% {
            box-shadow: 0 0 16px rgba(34, 211, 238, 0.6),
                        0 0 24px rgba(34, 211, 238, 0.3),
                        inset 0 0 12px rgba(34, 211, 238, 0.15);
            border-color: rgba(34, 211, 238, 0.7);
          }
        }
        .glass-counter {
          background: rgba(0, 0, 0, 0.2);
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          box-shadow:
            inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .card-counter-active {
          border: 2px solid rgba(34, 211, 238, 0.6);
          animation: cyanGlow 2s ease-in-out infinite;
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.7),
            0 0 12px rgba(34, 211, 238, 0.3);
        }
        .card-counter-winner {
          transform: scale(1.25);
        }
        /* Blackjack celebration animation */
        @keyframes blackjackFloat {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          30% { opacity: 1; transform: translateY(-4px) scale(1.02); }
          50% { transform: translateY(0px) scale(1); }
          100% { transform: translateY(0px) scale(1); }
        }
        .blackjack-text-enter {
          animation: blackjackFloat 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .glass-distort-panel {
          background: rgba(255, 255, 255, 0.1);
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          backdrop-filter: url(#glass-distort-multi) blur(4px);
          -webkit-backdrop-filter: url(#glass-distort-multi) blur(4px);
          box-shadow:
            inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.2);
        }
      `}</style>
      {/* 2-column layout on md+: table (left) + sidebar controls (right) — matches single player */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(360px,1.2fr)] md:items-stretch gap-2 md:gap-4 min-h-0" style={{ scrollbarGutter: 'stable both-edges' }}>

      {/* ── Table container — locked to 16:9 so full table image is always visible ── */}
      <div
        ref={tableRef}
        className="relative w-full blackjack-table overflow-hidden md:row-start-1 md:col-start-1"
        style={{
          aspectRatio: '16 / 9',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.9), inset 0 -2px 8px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.3)',
          border: '1px inset rgba(60,60,60,0.5)',
        }}
      >
        {/* Table background — video or image based on admin theme selection */}
        {theme.kind === 'video' ? (
          <video key={theme.src} autoPlay muted loop playsInline
            className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
            style={{ zIndex: 0 }}>
            <source src={theme.src} type="video/mp4" />
          </video>
        ) : (
          <Image src={theme.src} alt="Table" fill className="absolute inset-0 object-cover object-center pointer-events-none" style={{ zIndex: 0 }} priority unoptimized />
        )}

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
          className="absolute top-0 left-0 z-10 flex flex-col"
          style={{ width: 800, height: 450, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}
        >

          {/* Top bar — phase badge on left, round info centered, controls on right */}
          <div className="relative flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm">
            {/* Phase badge — left */}
            <div className="z-10 shrink-0">
              {state && (
                <span
                  className={`text-sm px-3 py-1 rounded-full font-semibold whitespace-nowrap ${
                    state.phase === 'betting'     ? 'bg-yellow-900/80 text-yellow-300' :
                    state.phase === 'playing'     ? 'bg-green-900/80 text-green-300' :
                    state.phase === 'dealer_turn' ? 'bg-blue-900/80 text-blue-300' :
                    'bg-white/10 text-white/60'
                  }`}
                >
                  {state.phase === 'waiting'     ? 'Waiting for players' :
                   state.phase === 'betting'     ? 'Place your bets' :
                   state.phase === 'playing'     ? 'Players acting' :
                   state.phase === 'dealer_turn' ? 'Dealer turn' : 'Round complete'}
                </span>
              )}
            </div>
            {/* Round counter + min-max — centered */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              <span className="text-sm font-semibold text-white/70 whitespace-nowrap">
                {state ? `Round #${state.roundNumber} · ${formatMorbius(state.minBet ?? '0')}–${formatMorbius(state.maxBet ?? '0')} MORBIUS` : 'Multiplayer Blackjack'}
              </span>
            </div>
            {/* Controls — right */}
            <div className="flex items-center gap-2 z-10 shrink-0">
              {(state as any)?.viewerCount > 0 && (
                <span className="text-[10px] text-white/40 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {(state as any).viewerCount}
                </span>
              )}
              {myPosition !== null && (
                <button onClick={leaveSeat} className="text-xs text-white/90 hover:text-red-400 transition-colors">
                  Leave seat
                </button>
              )}
            </div>
          </div>

          {/* Tip dealer button — top center */}
          {address && wsConnected && wsClient && myPosition !== null && (
            <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 12 }}>
              <IconButton
                variant="tip"
                size="tip"
                onClick={async () => {
                  if (tipAnimating) return;
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
                  } catch (e) { setError((e as Error).message); setTipAnimating(false); }
                }}
                disabled={tipAnimating}
              >
                Tip 2,000
              </IconButton>

              {/* Chip animation — flies up to dealer */}
              {tipAnimating && (
                <div
                  className="absolute pointer-events-none"
                  style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}
                  onAnimationEnd={() => setTipAnimating(false)}
                >
                  <div className="tip-chip-fly">
                    <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                      <span className="text-white text-[8px] font-bold">$</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Thank you message */}
              {tipNotification && (
                <div className="mt-1 px-3 py-1 rounded bg-black/70 border border-amber-600/30 text-amber-300 text-[10px] text-center animate-fade-in whitespace-nowrap">
                  Thanks for the tip! Best of luck to you, {tipNotification.name}
                </div>
              )}
            </div>
          )}

          {!wsConnected && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <MorbiusLoadingChip />
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-6 py-4 text-center max-w-xs">
                {!address ? (
                  <p className="text-amber-400 text-sm">Connect your wallet to play</p>
                ) : wsStatus === 'failed' ? (
                  <>
                    <p className="text-red-400 text-sm font-medium mb-2">Connection lost</p>
                    <p className="text-slate-400 text-xs mb-3">Could not reconnect to the server.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded transition-colors"
                    >
                      Reload Page
                    </button>
                  </>
                ) : wsStatus === 'reconnecting' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-amber-400 text-sm font-medium">Reconnecting...</p>
                    {reconnectInfo && (
                      <p className="text-slate-400 text-xs mt-1">
                        Attempt {reconnectInfo.attempt} of {reconnectInfo.maxAttempts}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-cyan-400 text-sm">Connecting...</p>
                  </>
                )}
              </div>
            </div>
          )}
          {error && wsConnected && <div className="bg-red-900/80 text-red-200 text-xs text-center py-1 px-4">{error}</div>}

          {/* Win notification — reused from single player */}
          {showWin && (
            <WinNotification
              amount={showWin.amount}
              isBlackjack={showWin.isBlackjack}
              onComplete={() => setShowWin(null)}
            />
          )}

          {/* Blackjack celebration animation — EncryptedText with glass panel */}
          {showBlackjackText && (
            <div className="absolute inset-0 z-[35] flex items-center justify-center pointer-events-none blackjack-text-enter">
              <div className="px-8 py-4 sm:px-12 sm:py-5 rounded-2xl glass-distort-panel">
                <div style={{ fontFamily: '"Orbitron", sans-serif' }}>
                  <EncryptedText
                    key={blackjackAnimKey}
                    text="BLACKJACK"
                    revealDelayMs={100}
                    flipDelayMs={35}
                    className="text-4xl sm:text-5xl md:text-6xl font-black tracking-wider"
                    encryptedClassName={BLACKJACK_COLORS[blackjackColorIndex].encrypted}
                    revealedClassName={BLACKJACK_COLORS[blackjackColorIndex].revealed}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Play area ── */}
          <div className="flex-1 flex flex-col justify-center items-center gap-4 px-4 pb-4">

            {/* DEALER — progressive card reveal matching single-player */}
            <div className="flex flex-col items-center justify-center" style={{ transform: 'translateY(-20px)' }}>
              <div className="flex">
                {(state?.dealerCards ?? []).map((c, i) => {
                  // Only render cards up to visibleDealerCards count
                  if (i >= visibleDealerCards) return null;
                  return (
                    <div key={i} className={i > 0 ? 'card-overlap-dealer' : ''} style={{ zIndex: i }}>
                      <PlayingCard
                        card={indexToCard(c)}
                        owner="dealer"
                        className=""
                        size="normal"
                        index={i}
                        isNewCard={i >= 2 && i === visibleDealerCards - 1}
                      />
                    </div>
                  );
                })}
                {/* Face-down hole card during playing phase (server only sends 1 card) */}
                {state?.phase === 'playing' && (state.dealerCards?.length ?? 0) === 1 && (
                  <div className="card-overlap-dealer" style={{ zIndex: 1 }}>
                    <PlayingCard card={{ value: 1 as CardValue, suit: 'spades' }} hidden owner="dealer" className="" size="normal" />
                  </div>
                )}
                {/* Empty placeholders before deal */}
                {(!state || (state.dealerCards?.length ?? 0) === 0) && (
                  <>
                    <div className="w-20 h-28 rounded-lg border border-dashed border-white/10 mr-[-18px]" />
                    <div className="w-20 h-28 rounded-lg border border-dashed border-white/10" />
                  </>
                )}
              </div>
              {/* Dealer total — glass-counter style matching single-player */}
              {state && visibleDealerCards > 0 && (state.dealerCards?.length ?? 0) > 0 && (() => {
                const dCards = state.dealerCards;
                const vis = Math.min(visibleDealerCards, dCards.length);
                const shown = handTotalFromCardIndices(dCards, vis);
                const fullReveal = vis >= dCards.length;
                const naturalBj = fullReveal && dCards.length === 2 && shown === 21;
                const bust = fullReveal && shown > 21;
                const isDealerTurn = state.phase === 'dealer_turn';
                return (
                  <div className={`flex items-center gap-2 transition-transform duration-300`} style={{ marginTop: -14, zIndex: 10 }}>
                    <div className={`glass-counter relative w-20 h-20 flex items-center justify-center rounded-full transition-all duration-300 ${
                      isDealerTurn ? 'card-counter-active' : ''
                    }`}>
                      <span className={`font-black text-4xl relative z-10 transition-all duration-500 ${
                        bust ? 'text-red-400' : naturalBj ? 'text-yellow-400' : 'text-white/90'
                      }`}>
                        {shown}
                      </span>
                    </div>
                    {naturalBj && <span className="text-yellow-400 font-black text-sm">BJ</span>}
                    {bust && <span className="text-red-400 font-black text-sm">BUST</span>}
                  </div>
                );
              })()}
            </div>

            {/* "Place your bets!" — mobile/tablet cue; desktop uses centered header pill */}
            {state?.phase === 'betting' && (
              <div className="betting-breathe rounded-xl px-6 py-2 md:hidden" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <span className="text-white font-bold text-lg tracking-wide" style={{ fontFamily: 'Jost, sans-serif' }}>
                  Place your bets!
                </span>
              </div>
            )}

            {/* 3 SEATS — CSS grid; outer seats inset from edges so they stay visible on mobile */}
            <div
              className="grid w-full max-w-4xl grid-cols-3 gap-2 sm:gap-3 md:gap-4 mx-auto"
              style={{ transform: 'translateY(6px)', padding: '0 4%' }}
            >
              {POSITIONS.map(pos => {
                const seat = state?.seats.find(s => s.position === pos);
                const isEmpty = !seat?.playerAddress;
                const isMe = seat?.playerAddress?.toLowerCase() === address?.toLowerCase();
                const align =
                  pos === 0 ? 'flex justify-start' : pos === 2 ? 'flex justify-end' : 'flex justify-center';
                const seatNudge =
                  pos === 0 ? { transform: 'translate(30px, -36px)' } :
                  pos === 2 ? { transform: 'translate(-30px, -36px)' } : {};
                return (
                  <div key={pos} className={`min-w-0 ${align}`} style={seatNudge}>
                    <Seat
                      seat={seat ?? null}
                      position={pos}
                      isMe={isMe}
                      isEmpty={isEmpty}
                      isActing={state?.actingSeatPosition === pos && state?.phase === 'playing'}
                      phase={state?.phase ?? 'waiting'}
                      onTakeSeat={() => takeSeat(pos)}
                      canTakeSeat={!!address && myPosition === null && isEmpty && wsConnected}
                      turnStartedAt={state?.actingSeatPosition === pos ? state?.turnStartedAt ?? null : null}
                      bettingStartedAt={state?.bettingStartedAt ?? null}
                      balanceLabel={isMe ? formatMorbius(playerBalance.toString()) : null}
                      onOpenProfile={setSelectedProfileAddress}
                      showOutcomeLabel={showSeatOutcomeLabels}
                      onLeaveSeat={isMe ? leaveSeat : undefined}
                      onToggleSoundPanel={isMe ? () => setSoundPanelOpen(o => !o) : undefined}
                      onSendChatMessage={isMe ? sendChatMessage : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>


        </div>

        {/* Sound settings — top-left of table */}
        <div className="absolute left-2 top-10 z-20">
          <button
            type="button"
            onClick={() => setSoundPanelOpen(o => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-black/60 border border-white/15 text-white/70 hover:text-white hover:bg-black/75 transition-colors text-xs backdrop-blur-sm"
            title="Sound settings"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
            <Settings2 className="w-3 h-3" />
          </button>
          {soundPanelOpen && (
            <div
              className="mt-1 bg-black/90 border border-white/15 rounded-lg p-3 backdrop-blur-md w-[220px] space-y-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Master toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Master</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(e => !e)}
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                </button>
              </label>

              {/* Dealer voice toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-white/60 flex items-center gap-1.5">
                  {dealerVoiceEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3 text-red-400" />}
                  Dealer Voice
                </span>
                <button
                  type="button"
                  onClick={() => setDealerVoiceEnabled(e => !e)}
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${dealerVoiceEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
                  disabled={!soundEnabled}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${dealerVoiceEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                </button>
              </label>

              {/* SFX toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-white/60 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3" />
                  Sound Effects
                </span>
                <button
                  type="button"
                  onClick={() => setSfxEnabled(e => !e)}
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${sfxEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
                  disabled={!soundEnabled}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${sfxEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                </button>
              </label>

              {/* Divider */}
              <div className="border-t border-white/10" />

              {/* Music player */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide flex items-center gap-1.5">
                    <Music className="w-3 h-3" />
                    Music
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleMusic}
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      title={isMusicPlaying ? 'Pause' : 'Play'}
                    >
                      {isMusicPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={nextTrack}
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      title="Next track"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Track name */}
                <div className="text-[10px] text-white/40 truncate">
                  {MUSIC_PLAYLIST[musicTrackIndex].split('/').pop()?.replace('.mp3', '').replace(/-/g, ' ') ?? 'Unknown'}
                </div>
                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <VolumeX className="w-3 h-3 text-white/30 shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none bg-white/15 accent-cyan-500 cursor-pointer"
                    style={{ accentColor: '#06b6d4' }}
                  />
                  <Volume2 className="w-3 h-3 text-white/30 shrink-0" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden audio element for background music */}
        <audio
          ref={musicAudioRef}
          src={MUSIC_PLAYLIST[musicTrackIndex]}
          onEnded={handleMusicEnded}
          preload="auto"
        />
      </div>

      {/* ── Controls — sidebar on md+, below table on mobile ── */}
      <div className="px-4 py-4 space-y-3 bg-slate-950 md:row-start-1 md:col-start-2 md:py-0 md:px-0 md:flex md:flex-col md:gap-3 md:overflow-hidden md:pt-4">

        {/* Betting + action controls — 2-col grid on mobile matching single-player, stacked on md+ sidebar */}
        {myPosition !== null && (
          <div className="flex flex-row md:flex-col items-stretch w-full">
            <div className="w-1/2 md:w-full md:border-r-0 md:border-b border-r border-white/10 flex items-center min-w-0">
              <BettingPanelMobile
                onStartGame={() => {}} // not used — confirm bet button below handles this
                isPlaying={state?.phase !== 'betting' || hasBet}
                onBetAmountChange={(val) => setBetAmount(val)}
                currentBetAmount={betAmount}
                onHalfBet={() => {
                  const cur = parseInt(betAmount || '0', 10);
                  const half = Math.max(500, Math.floor(cur / 2));
                  setBetAmount(String(half));
                }}
                onDoubleBet={() => {
                  const cur = parseInt(betAmount || '0', 10);
                  const doubled = Math.min(50000, cur * 2);
                  setBetAmount(String(doubled));
                }}
                playerReserves={BigInt(playerBalance)}
              />
            </div>
            <div className="w-1/2 md:w-full flex items-stretch min-w-0">
              {isMyTurn && activeHand ? (
                <BlackjackMobileActionBar
                  onAction={(action) => doAction(action as 'hit' | 'stand' | 'double_down' | 'split')}
                  isPlaying={true}
                  canHit={activeHand.canHit}
                  canStand={activeHand.canStand}
                  canDoubleDown={activeHand.canDoubleDown}
                  canSplit={activeHand.canSplit}
                  canDeal={false}
                  chipStackLength={0}
                  lastBetAmount="0"
                  soundEnabled={soundEnabled}
                  onPlaySfx={playSound}
                  alwaysVisible
                  hideDealRow
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-2">
                  {state?.phase === 'betting' && !hasBet && (
                    <>
                      {(mySeat?.consecutiveTimeouts ?? 0) > 0 && (
                        <div
                          className={`rounded-lg border px-2.5 py-1.5 text-center text-[11px] font-semibold leading-snug w-full ${
                            (mySeat?.consecutiveTimeouts ?? 0) >= AFK_TIMEOUTS_BEFORE_KICK - 1
                              ? 'border-orange-500/40 bg-orange-950/40 text-orange-100'
                              : 'border-cyan-500/30 bg-slate-900/80 text-cyan-100/90'
                          }`}
                          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                        >
                          Idle {(mySeat?.consecutiveTimeouts ?? 0)}/{AFK_TIMEOUTS_BEFORE_KICK}
                        </div>
                      )}
                      {(() => {
                        const betOk = parseInt(betAmount || '0', 10) >= 500;
                        return (
                          <button
                            type="button"
                            onClick={placeBet}
                            disabled={!betOk}
                            className={`w-full py-2.5 rounded-xl font-black text-sm tracking-wider transition-all border-2 ${
                              betOk
                                ? 'text-white border-emerald-400/45 active:scale-95 enabled:hover:brightness-105'
                                : 'text-white/55 border-cyan-500/35 bg-[rgba(34,211,238,0.07)] cursor-not-allowed shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                            }`}
                            style={
                              betOk
                                ? {
                                    background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
                                    boxShadow: '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)',
                                  }
                                : undefined
                            }
                          >
                            CONFIRM BET
                          </button>
                        );
                      })()}
                    </>
                  )}
                  {state?.phase === 'betting' && hasBet && (
                    <div className="text-center py-1 text-green-400 font-semibold text-sm">
                      Bet placed — waiting
                    </div>
                  )}
                  {state?.phase !== 'betting' && !isMyTurn && (
                    <div className="text-center text-white/30 text-xs py-2">
                      Waiting...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabbed info panel — Chat / Chart / Rules / History — grows to fill remaining sidebar height */}
        <div
          className="w-full min-w-0 md:flex-1 md:min-h-0 rounded-xl border border-cyan-500/25 overflow-hidden md:flex md:flex-col"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.65))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:flex md:flex-col md:flex-1 md:min-h-0">
            <TabsList className="w-full grid grid-cols-4 bg-black/40 rounded-none border-b border-cyan-500/15 h-9 p-0">
              <TabsTrigger value="chat" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chat</span>
              </TabsTrigger>
              <TabsTrigger value="chart" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chart</span>
              </TabsTrigger>
              <TabsTrigger value="rules" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rules</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab content area — relative wrapper so chart can be absolutely positioned when hidden */}
            <div className="relative md:flex-1 md:min-h-0 md:overflow-y-auto">
              {/* Chat tab */}
              <TabsContent value="chat" className="mt-0 flex flex-col h-full">
                <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
                  <h3 className="text-xs font-semibold text-cyan-300/90 uppercase tracking-wide">Table chat</h3>
                  {chatMessages.length > 0 && (
                    <span className="text-[10px] text-white/40 tabular-nums">{chatMessages.length} msgs</span>
                  )}
                </div>
                <ChatMessages messages={chatMessages} systemMessages={systemChatMessages} />
                <div className="px-3 pb-3 pt-1 mt-auto border-t border-white/5">
                  {address && wsConnected ? (
                    <ChatInput onSend={sendChatMessage} />
                  ) : (
                    <p className="text-[11px] text-white/40 text-center py-1">Connect wallet to chat</p>
                  )}
                </div>
              </TabsContent>

              {/* Chart — always mounted so ref survives for addGameResult; hidden via opacity when inactive (visibility:hidden + absolute keeps dimensions for Recharts) */}
              <div
                className={activeTab === 'chart' ? 'p-3' : 'absolute top-0 left-0 right-0 opacity-0 pointer-events-none'}
                aria-hidden={activeTab !== 'chart'}
              >
                <div className="h-64 md:h-72 min-w-0">
                  <BlackjackMultiRealTimeBetChart
                    ref={chartRef}
                    sessionStartTime={chartSessionStartTime.current}
                  />
                </div>
              </div>

              {/* Rules tab */}
              <TabsContent value="rules" className="mt-0 p-3 max-h-80 overflow-y-auto">
                <GameFAQ
                  game="blackjack"
                  addresses={[
                    { label: 'Blackjack Contract', address: BLACKJACK_ADDRESS },
                    { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
                  ]}
                />
              </TabsContent>

              {/* History tab — live round history from this session */}
              <TabsContent value="history" className="mt-0 p-3">
                {roundHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-white/35 text-sm gap-2">
                    <History className="w-8 h-8 text-white/20" />
                    <p>No rounds played yet this session</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {roundHistory.map(r => {
                      const mySeatEntry = r.seats.find(s => s.playerAddress.toLowerCase() === address?.toLowerCase());
                      return (
                        <div key={r.roundNumber} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white/70">Round #{r.roundNumber}</span>
                            <span className="text-[10px] text-white/40">{new Date(r.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-white/50">Dealer:</span>
                            <div className="flex gap-0.5">
                              {r.dealerCards.map((c, ci) => {
                                const suits = ['♠', '♥', '♦', '♣'];
                                const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                                const suit = suits[Math.floor(c / 13)];
                                const rank = ranks[c % 13];
                                const isRed = suit === '♥' || suit === '♦';
                                return (
                                  <span key={ci} className={`px-1 py-0.5 rounded text-[10px] font-bold border border-white/10 bg-black/30 ${isRed ? 'text-red-400' : 'text-white/80'}`}>
                                    {rank}{suit}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="text-white/60 font-bold">{r.dealerTotal}</span>
                          </div>
                          {mySeatEntry && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-white/50">You:</span>
                              {mySeatEntry.hands.map((h: any, hi: number) => (
                                <div key={hi} className="flex gap-0.5">
                                  {(h.cards ?? []).map((c: number, ci: number) => {
                                    const suits = ['♠', '♥', '♦', '♣'];
                                    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                                    const suit = suits[Math.floor(c / 13)];
                                    const rank = ranks[c % 13];
                                    const isRed = suit === '♥' || suit === '♦';
                                    return (
                                      <span key={ci} className={`px-1 py-0.5 rounded text-[10px] font-bold border border-white/10 bg-black/30 ${isRed ? 'text-red-400' : 'text-white/80'}`}>
                                        {rank}{suit}
                                      </span>
                                    );
                                  })}
                                  <span className="text-white/60 font-bold">{h.total}</span>
                                </div>
                              ))}
                              <span className={`font-bold text-[10px] uppercase ${
                                mySeatEntry.result === 'win' ? 'text-emerald-400' : mySeatEntry.result === 'push' ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {mySeatEntry.result === 'win' ? `+${formatMorbius(mySeatEntry.payout)}` : mySeatEntry.result}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* (Action bar is now integrated into the 2-col betting grid above) */}

        {/* Not seated CTA */}
        {state && myPosition === null && address && wsConnected && (
          <div className="text-center text-white/40 text-sm py-2">
            {state.seats.every(s => s.playerAddress) ? 'Table full — spectating' : 'Click an empty seat to join'}
          </div>
        )}

      </div>

      {/* Table token profile + player dashboard */}
      <section className="md:col-span-2 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="flex min-h-0 flex-col lg:h-full">
          <TableTokenProfileCard
            themeKind={(state?.themeKind ?? 'video') as 'image' | 'video'}
            themeId={state?.themeId ?? 'glowingTable'}
            getThemeInfo={getThemeInfo}
            getTableProfile={getTableProfile}
          />
        </div>
        <div className="flex min-h-0 flex-col lg:h-full">
          {address && playerStats ? (
            <PlayerStatsDashboard
              stats={playerStats}
              isLoading={playerStatsLoading}
              playerAddress={address}
              reserveBalance={BigInt(playerBalance)}
            />
          ) : (
            <div
              className="flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-xl px-6 text-center text-white/60 lg:min-h-[520px] lg:h-full"
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
      </section>

      <PlayerProfileModal
        isOpen={!!selectedProfileAddress}
        onClose={() => setSelectedProfileAddress(null)}
        address={selectedProfileAddress}
        game="blackjack"
      />

      </div>{/* close grid */}
    </GlobalMainNav>
  );
}

// ── System chat message types ────────────────────────────────────────────────
type SystemChatMessage = {
  id: string;
  type: 'welcome' | 'factbot' | 'idle_warning';
  text: string;
  sender?: string;
  timestamp: number;
};

/** ChatMessages — renders player messages + system messages merged by timestamp, auto-scrolls */
function ChatMessages({ messages, systemMessages }: { messages: { id: string; displayName?: string | null; senderAddress: string | null; text: string; timestamp: string }[]; systemMessages: SystemChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Check if scrolled to bottom before update
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, systemMessages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  // Merge and sort
  type MergedMsg = { key: string; ts: number } & (
    | { kind: 'player'; displayName?: string | null; senderAddress: string | null; text: string }
    | { kind: 'system'; type: SystemChatMessage['type']; sender?: string; text: string }
  );

  const merged: MergedMsg[] = useMemo(() => {
    const items: MergedMsg[] = [
      ...messages.map(m => ({
        key: m.id,
        ts: new Date(m.timestamp).getTime(),
        kind: 'player' as const,
        displayName: m.displayName,
        senderAddress: m.senderAddress,
        text: m.text,
      })),
      ...systemMessages.map(m => ({
        key: m.id,
        ts: m.timestamp,
        kind: 'system' as const,
        type: m.type,
        sender: m.sender,
        text: m.text,
      })),
    ];
    items.sort((a, b) => a.ts - b.ts);
    return items;
  }, [messages, systemMessages]);

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-0.5 min-h-[100px] px-3 py-1 pr-1.5">
      {merged.map(m => {
        if (m.kind === 'player') {
          return (
            <div key={m.key} className="text-xs text-white/75 break-words">
              <span className="text-cyan-400 font-medium">{m.displayName ?? m.senderAddress?.slice(0, 6)}: </span>
              {m.text}
            </div>
          );
        }
        // system messages
        const isWelcome = m.type === 'welcome';
        const isFactBot = m.type === 'factbot';
        const isIdle = m.type === 'idle_warning';
        return (
          <div key={m.key} className={`text-xs break-words py-0.5 ${isWelcome ? 'text-yellow-300/80' : isFactBot ? 'text-emerald-400/80' : 'text-orange-400/80'}`}>
            {isWelcome && <span className="font-bold text-yellow-400">🎰 Morbius: </span>}
            {isFactBot && <span className="font-bold text-emerald-400">FactBot: </span>}
            {isIdle && <span className="font-bold text-orange-400">⚠ System: </span>}
            {isWelcome ? (
              <span dangerouslySetInnerHTML={{ __html: m.text }} />
            ) : (
              m.text
            )}
          </div>
        );
      })}
      {merged.length === 0 && (
        <div className="text-xs text-white/35 text-center py-6">No messages yet</div>
      )}
    </div>
  );
}

const CHAT_MAX_LENGTH = 150;
const CHAT_BURST_LIMIT = 7;
const CHAT_COOLDOWN_MS = 30_000;
/** Don't spam toast if user keeps tapping Send while on cooldown */
const CHAT_COOLDOWN_TOAST_THROTTLE_MS = 4000;

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const sentTimestamps = useRef<number[]>([]);
  const lastCooldownToastAt = useRef(0);
  const maxLengthToastShownForDraft = useRef(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Tick cooldown display
  useEffect(() => {
    if (cooldownEnd <= Date.now()) { setCooldownLeft(0); return; }
    const tick = () => setCooldownLeft(Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  const handleSend = () => {
    const msg = text.trim();
    if (!msg) return;
    const now = Date.now();
    if (now < cooldownEnd) {
      if (now - lastCooldownToastAt.current >= CHAT_COOLDOWN_TOAST_THROTTLE_MS) {
        lastCooldownToastAt.current = now;
        const s = Math.max(1, Math.ceil((cooldownEnd - now) / 1000));
        toast.message('Chat cooldown', {
          description: `Wait ${s}s — you're sending messages too fast.`,
        });
      }
      return;
    }

    // Prune timestamps older than cooldown window
    sentTimestamps.current = sentTimestamps.current.filter(t => now - t < CHAT_COOLDOWN_MS);

    if (sentTimestamps.current.length >= CHAT_BURST_LIMIT) {
      const end = sentTimestamps.current[0] + CHAT_COOLDOWN_MS;
      setCooldownEnd(end);
      const s = Math.ceil((end - now) / 1000);
      setCooldownLeft(s);
      lastCooldownToastAt.current = now;
      toast.warning('Slow down', {
        description: `${CHAT_BURST_LIMIT} messages in 30s — wait ${s}s before chatting again.`,
      });
      return;
    }

    sentTimestamps.current.push(now);
    onSend(msg);
    setText('');
    maxLengthToastShownForDraft.current = false;
  };

  const onCooldown = cooldownLeft > 0;

  return (
    <form className="flex gap-2 mt-1.5"
      onSubmit={e => { e.preventDefault(); handleSend(); }}>
      <div className="relative flex-1">
        <Input
          value={text}
          onChange={e => {
            const v = e.target.value;
            setText(v);
            if (v.length >= CHAT_MAX_LENGTH && !maxLengthToastShownForDraft.current) {
              maxLengthToastShownForDraft.current = true;
              toast.message('Character limit', {
                description: `${CHAT_MAX_LENGTH} characters max per message.`,
              });
            }
            if (v.length < CHAT_MAX_LENGTH) maxLengthToastShownForDraft.current = false;
          }}
          placeholder={onCooldown ? `Wait ${cooldownLeft}s…` : 'Table chat…'}
          className="h-7 text-xs bg-white/10 border-white/20 text-slate-200 placeholder:text-white/30 pr-8"
          maxLength={CHAT_MAX_LENGTH}
          disabled={onCooldown}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-white/25 tabular-nums pointer-events-none">
          {text.length}/{CHAT_MAX_LENGTH}
        </span>
      </div>
      <button type="submit" disabled={onCooldown || !text.trim()}
        className="px-3 h-7 text-xs rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors disabled:opacity-40 disabled:pointer-events-none">
        Send
      </button>
    </form>
  );
}
