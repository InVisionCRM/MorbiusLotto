'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Flame,
  Frown,
  Gift,
  LayoutList,
  LogOut,
  MessageCircle,
  Music2,
  Smile,
  SmilePlus,
  Trophy,
  UserCircle,
  UserPlus,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import AvatarView, { type Emotion } from './avatar/AvatarView';
import { RadialMenu, RadialMenuFloating, type RadialMenuItem } from '@/components/ui/radial-menu';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';

const LONG_PRESS_MS = 500;
const PHRASE_OVERLAY_DURATION_MS = 2000;
const LOCAL_EMOTION_DURATION_MS = 3000;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatChips(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)));
    if (!Number.isFinite(num) || num < 0) return '0';
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return typeof wei === 'number' ? wei.toFixed(0) : String(wei);
  }
}

function shortAddr(addr: string): string {
  return addr.slice(-4);
}

// ── Color-coded action system ──────────────────────────────────────────────

const ACTION_STYLE: Record<string, { bg: string; label: string }> = {
  fold:     { bg: '#2d4a6b', label: 'FOLD' },
  check:    { bg: '#0c5f70', label: 'CHECK' },
  call:     { bg: '#14532d', label: 'CALL' },
  bet:      { bg: '#92400e', label: 'BET' },
  raise:    { bg: '#9a3412', label: 'RAISE' },
  'all-in': { bg: '#7f1d1d', label: 'ALL-IN' },
  allin:    { bg: '#7f1d1d', label: 'ALL-IN' },
};

function getActionStyle(action: string) {
  return ACTION_STYLE[action.toLowerCase()] ?? { bg: '#374151', label: action.toUpperCase() };
}

// ── Chip stack (exported for use at table level) ──────────────────────────

const CHIP_SIZE    = 26;
const CHIP_OVERLAP = 5;

const CHIP_SRCS = [
  { min: 1000, src: '/PokerChips/blackpokerchip000.png' },
  { min: 100,  src: '/PokerChips/redpokerchip015.png'   },
  { min: 10,   src: '/PokerChips/greenpokerchip005.png' },
  { min: 0,    src: '/PokerChips/bluepokerchip010.png'  },
] as const;

export function PokerChipStack({ weiAmount }: { weiAmount: string }) {
  let amount = 0;
  try { amount = Number(formatEther(toBigIntSafe(weiAmount))); } catch {}
  if (amount <= 0) return null;

  const count   = Math.min(5, Math.max(1, Math.ceil(Math.log10(Math.max(amount + 1, 2)))));
  const chipSrc = (CHIP_SRCS.find(c => amount >= c.min) ?? CHIP_SRCS[CHIP_SRCS.length - 1]).src;
  const totalH  = CHIP_SIZE + (count - 1) * CHIP_OVERLAP;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ position: 'relative', width: CHIP_SIZE, height: totalH }}>
        {Array.from({ length: count }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={chipSrc}
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              bottom: i * CHIP_OVERLAP,
              left: 0,
              width: CHIP_SIZE,
              height: CHIP_SIZE,
              filter: i > 0 ? 'drop-shadow(0 -2px 3px rgba(0,0,0,0.8))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            }}
          />
        ))}
      </div>
      <span style={{
        color: '#fbbf24', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        background: 'rgba(0,0,0,0.80)', padding: '1px 5px', borderRadius: 3,
      }}>
        {formatChips(weiAmount)}
      </span>
    </div>
  );
}

// ── Role token ────────────────────────────────────────────────────────────

const ROLE_TOKEN_STYLE = {
  D:  { bg: '#ffffff', color: '#1a1a1a', border: '#d4af37', size: 22, fontSize: 11 },
  SB: { bg: '#1d4ed8', color: '#ffffff', border: '#60a5fa', size: 20, fontSize: 9  },
  BB: { bg: '#b45309', color: '#ffffff', border: '#fbbf24', size: 20, fontSize: 9  },
} as const;

function RoleToken({ label }: { label: keyof typeof ROLE_TOKEN_STYLE }) {
  const s = ROLE_TOKEN_STYLE[label];
  return (
    <div style={{
      width: s.size, height: s.size,
      borderRadius: '50%',
      background: s.bg,
      border: `2px solid ${s.border}`,
      color: s.color,
      fontSize: s.fontSize,
      fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 1px 6px rgba(0,0,0,0.8)',
      letterSpacing: '-0.5px',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

// ── Circular timer ring around avatar ──────────────────────────────────────

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
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        top: -pad,
        left: -pad,
        width: total,
        height: total,
        pointerEvents: 'none',
        zIndex: 5,
        transform: 'rotate(-90deg)',
      }}
    >
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cx} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  );
}

// ── Avatar animation dock items ────────────────────────────────────────────

const AVATAR_ANIMATIONS: { title: string; emotion: Emotion }[] = [
  { title: 'Happy',     emotion: 'happy'     },
  { title: 'Wink',      emotion: 'wink'      },
  { title: 'Surprised', emotion: 'surprised' },
  { title: 'Angry',     emotion: 'angry'     },
  { title: 'Sad',       emotion: 'sad'       },
  { title: 'Dance',     emotion: 'dance'     },
  { title: 'Jackpot',   emotion: 'jackpot'   },
];

const EMOTION_RADIAL_ICONS: Partial<Record<Emotion, LucideIcon>> = {
  happy: Smile,
  wink: SmilePlus,
  surprised: Zap,
  angry: Flame,
  sad: Frown,
  dance: Music2,
  jackpot: Trophy,
};

const OPPONENT_RADIAL_ITEMS: RadialMenuItem[] = [
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'follow', label: 'Follow', icon: UserPlus },
  { id: 'gift', label: 'Gift', icon: Gift },
];

// ── PokerSeat ─────────────────────────────────────────────────────────────

export interface PokerSeatProps {
  seat: SeatState;
  index: number;
  holeCards?: number[];
  isCurrentPlayer?: boolean;
  showCardBacks?: boolean;
  /** At showdown: 5 card indices that form this seat's winning hand (for cyan highlight on hole cards) */
  winningCardIndices?: number[];
  lastAction?: { action: string; amount: string } | null;
  timeLeft?: number;
  maxTime?: number;
  chatBubble?: string | null;
  onReUpClick?: () => void;
  onMenuClick?: () => void;
  overlayPhrase?: string | null;
  /** Avatar emotion broadcast from server (visible to all players). */
  overlayEmotion?: Emotion | null;
  onPhraseReaction?: (phrase: string) => void;
  /** Called when current player selects an avatar emotion (broadcast to table). */
  onAnimationReaction?: (emotion: Emotion) => void;
  /** Called when any player clicks an opponent's avatar. */
  onOpponentClick?: (address: string) => void;
  /** Right-click radial on opponent: profile, follow/unfollow, gift (wired in table page). */
  onOpponentRadialAction?: (action: 'profile' | 'follow' | 'gift', address: string) => void;
  /** When provided with setQuickChatPhrases and onOpenEditQuickChat, QuickChat uses this state and Edit QuickChat is opened by parent (e.g. header Settings). */
  quickChatPhrases?: string[];
  setQuickChatPhrases?: (phrases: string[]) => void;
  onOpenEditQuickChat?: () => void;
  /** When true (narrow viewport from table), skip AvatarView and large avatar chrome to save space. */
  hideSeatAvatar?: boolean;
  /** Leave table (confirm flow); from player radial. */
  onLeaveTable?: () => void;
  /** Bump parent Activity feed serial on mobile. */
  onRequestMobileActivity?: () => void;
  /** Show Activity wedge in player radial (typically true when `hideSeatAvatar`). */
  includeActivityInPlayerRadial?: boolean;
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, winningCardIndices, lastAction, timeLeft, maxTime = 30, chatBubble, onReUpClick, onMenuClick, overlayPhrase: propsOverlayPhrase, overlayEmotion: propsOverlayEmotion, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases: propsQuickChatPhrases, setQuickChatPhrases: propsSetQuickChatPhrases, onOpenEditQuickChat, hideSeatAvatar = false, onLeaveTable, onRequestMobileActivity, includeActivityInPlayerRadial = false }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = !!(holeCards && holeCards.length > 0);
  const showBacks   = !!(showCardBacks && !showMyCards && !empty && !seat.folded);
  const hasCards    = showMyCards || showBacks;

  const isActing  = !!seat.isActing && !empty && !seat.folded;
  const isFolded  = !!seat.folded && !empty;

  const displayName = empty
    ? 'Open'
    : (isCurrentPlayer ? 'You' : (seat.displayName?.trim() || shortAddr(seat.playerAddress!)));

  const avatarEmotion: Emotion = useMemo(() => {
    if (!lastAction) return 'neutral';
    const a = lastAction.action?.toLowerCase();
    if (a === 'fold') return 'sad';
    if (a === 'all-in' || a === 'allin') return 'angry';
    return 'neutral';
  }, [lastAction]);

  const badgeRef = useRef<HTMLDivElement>(null);

  // QuickChat picker (current player only)
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);

  /** Player action radial (click avatar): main menu vs expression submenu. */
  const [playerRadialOpen, setPlayerRadialOpen] = useState(false);
  const [playerRadialPage, setPlayerRadialPage] = useState<'main' | 'expressions'>('main');
  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // Mouse idle detection — after 5s of no movement, current player's eyes roam
  const [mouseIdle, setMouseIdle] = useState(false);
  const mouseIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isCurrentPlayer) return;
    const resetTimer = () => {
      setMouseIdle(false);
      if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
      mouseIdleTimerRef.current = setTimeout(() => setMouseIdle(true), 5000);
    };
    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
    };
  }, [isCurrentPlayer]);

  // Slouch while any menu is open
  const hasMenuOpen = quickChatPickerOpen || playerRadialOpen;

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

  const playerMainMenuItems = useMemo((): RadialMenuItem[] => {
    const items: RadialMenuItem[] = [];
    if (onMenuClick) items.push({ id: 'avatar', label: 'Avatar', icon: UserRound });
    if (onReUpClick) items.push({ id: 'bank', label: 'Bank', icon: Wallet });
    if (onPhraseReaction) items.push({ id: 'quickchat', label: 'Chat', icon: MessageCircle });
    if (onAnimationReaction) items.push({ id: 'expressions', label: 'Moves', icon: Smile });
    if (onLeaveTable) items.push({ id: 'leave', label: 'Leave', icon: LogOut });
    if (includeActivityInPlayerRadial && onRequestMobileActivity) {
      items.push({ id: 'activity', label: 'Activity', icon: LayoutList });
    }
    return items;
  }, [
    onMenuClick,
    onReUpClick,
    onPhraseReaction,
    onAnimationReaction,
    onLeaveTable,
    includeActivityInPlayerRadial,
    onRequestMobileActivity,
  ]);

  const handleOpponentRadialSelect = useCallback(
    (item: RadialMenuItem) => {
      const addr = seat.playerAddress;
      if (!addr || !onOpponentRadialAction) return;
      const id = String(item.id);
      if (id === 'profile' || id === 'follow' || id === 'gift') {
        onOpponentRadialAction(id, addr);
      }
    },
    [onOpponentRadialAction, seat.playerAddress],
  );

  // Active emotion: menu-open slouch > broadcast (from server) > local (just clicked) > action-driven
  const activeEmotion: Emotion = hasMenuOpen ? 'neutral' : (propsOverlayEmotion ?? localEmotion ?? avatarEmotion);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [internalQuickChatPhrases, setInternalQuickChatPhrases] = useQuickChatPhrases();
  const useSharedQuickChat = propsQuickChatPhrases != null && propsSetQuickChatPhrases != null && onOpenEditQuickChat != null;
  const quickChatPhrases = useSharedQuickChat ? propsQuickChatPhrases : internalQuickChatPhrases;
  const setQuickChatPhrases = useSharedQuickChat ? propsSetQuickChatPhrases : setInternalQuickChatPhrases;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleBadgePointerDown = useCallback(() => {
    if (!isCurrentPlayer) return;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setQuickChatPickerOpen(true);
    }, LONG_PRESS_MS);
  }, [isCurrentPlayer, clearLongPress]);

  const handleBadgePointerUp = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerLeave = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerCancel = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!isCurrentPlayer) return;
    setQuickChatPickerOpen(true);
  }, [isCurrentPlayer]);

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    onAnimationReaction?.(emotion);
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => {
      setLocalEmotion(null);
    }, emotion === 'wink' ? 1200 : LOCAL_EMOTION_DURATION_MS);
  }, [onAnimationReaction]);

  const handlePlayerRadialSelect = useCallback(
    (item: RadialMenuItem) => {
      const id = String(item.id);
      if (playerRadialPage === 'expressions') {
        if (id === '_back') {
          setPlayerRadialPage('main');
          return;
        }
        handleAnimationSelect(item.id as Emotion);
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        return;
      }
      if (id === 'expressions') {
        setPlayerRadialPage('expressions');
        return;
      }
      if (id === 'avatar') onMenuClick?.();
      else if (id === 'bank') onReUpClick?.();
      else if (id === 'quickchat') {
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        setQuickChatPickerOpen(true);
        return;
      }
      else if (id === 'leave') onLeaveTable?.();
      else if (id === 'activity') onRequestMobileActivity?.();
      setPlayerRadialOpen(false);
      setPlayerRadialPage('main');
    },
    [
      playerRadialPage,
      handleAnimationSelect,
      onMenuClick,
      onReUpClick,
      onLeaveTable,
      onRequestMobileActivity,
    ],
  );

  const handleQuickChatSelect = useCallback((phrase: string) => {
    setQuickChatPickerOpen(false);
    if (onPhraseReaction) {
      onPhraseReaction(phrase);
      return;
    }
    setOverlayPhrase(phrase);
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    phraseOverlayTimeoutRef.current = setTimeout(() => {
      setOverlayPhrase(null);
      phraseOverlayTimeoutRef.current = null;
    }, PHRASE_OVERLAY_DURATION_MS);
  }, [onPhraseReaction]);

  useEffect(() => () => {
    clearLongPress();
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
  }, [clearLongPress]);

  // Close QuickChat picker when clicking outside (player radial uses its own overlay)
  useEffect(() => {
    if (!quickChatPickerOpen || !isCurrentPlayer) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuContainerRef.current?.contains(target) ||
        avatarRef.current?.contains(target) ||
        badgeRef.current?.contains(target)
      ) return;
      setQuickChatPickerOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isCurrentPlayer, quickChatPickerOpen]);

  const activeAction =
    lastAction && lastAction.action !== 'blind' ? lastAction.action :
    isFolded ? 'fold' : null;
  const actionStyle = activeAction ? getActionStyle(activeAction) : null;

  const displayPhrase = propsOverlayPhrase != null && propsOverlayPhrase !== '' ? propsOverlayPhrase : overlayPhrase;

  /* ── Empty seat ── */
  if (empty) {
    return (
      <div className="flex flex-col items-center select-none opacity-25">
        <div
          className="rounded px-2.5 py-1 text-[9px] border border-dashed"
          style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)' }}
        >
          Open
        </div>
      </div>
    );
  }

  /* ── Occupied seat ── */
  return (
    <div
      className={`poker-seat relative flex flex-col items-center gap-0.5 select-none transition-opacity ${isFolded ? 'opacity-50' : 'opacity-100'}`}
      aria-label={`Seat ${displayName}`}
    >
      {/* Table chat bubble */}
      <AnimatePresence>
        {chatBubble && chatBubble.trim() && (
          <motion.div
            key={chatBubble}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-30"
            style={{ maxWidth: 'min(160px, 42vw)', minWidth: 48 }}
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <div
              className="px-2 py-1.5 rounded-lg text-left break-words"
              style={{
                background: 'rgba(0,0,0,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
                color: 'var(--poker-text)',
                fontSize: 'clamp(10px, 2.2vw, 12px)',
                lineHeight: 1.3,
              }}
            >
              <span className="line-clamp-3">
                {chatBubble.length > CHAT_BUBBLE_MAX_LENGTH
                  ? `${chatBubble.slice(0, CHAT_BUBBLE_MAX_LENGTH)}…`
                  : chatBubble}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QuickChat phrase overlay */}
      <AnimatePresence>
        {displayPhrase && (
          <motion.div
            key={displayPhrase}
            className="font-grandstander absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-40 text-lg lg:text-xl max-w-[min(180px,50vw)] text-center px-2"
            style={{ color: 'var(--poker-text)' }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          >
            {displayPhrase}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cards — peek out from behind avatar ── */}
      {hasCards && (
        <div
          className="relative flex-shrink-0"
          style={{
            width: showMyCards ? 'clamp(84px, 20vw, 110px)' : 'clamp(58px, 14vw, 74px)',
            height: showMyCards ? 'clamp(72px, 18vw, 96px)' : 'clamp(50px, 12vw, 66px)',
            marginBottom: hideSeatAvatar ? -10 : -55,
            zIndex: 0,
          }}
        >
          {[0, 1].map((ci) => (
            <div
              key={ci}
              className="absolute"
              style={{
                bottom: 0,
                zIndex: ci,
                ...(showMyCards
                  ? { width: 'clamp(54px, 13vw, 70px)', height: 'clamp(70px, 17vw, 90px)', left: ci === 0 ? '0' : 'clamp(30px, 7vw, 40px)' }
                  : { width: 'clamp(38px, 9vw, 48px)', height: 'clamp(48px, 12vw, 62px)', left: ci === 0 ? '0' : 'clamp(20px, 5vw, 26px)' }),
                transform: `rotate(${ci === 0 ? -12 : 12}deg)`,
                transformOrigin: 'bottom center',
                filter: isFolded ? 'grayscale(1) opacity(0.5)' : undefined,
              }}
            >
              {showMyCards
                ? (
                    <CardDisplay
                      cardIndex={holeCards![ci]}
                      isWinningCard={winningCardIndices?.includes(holeCards![ci])}
                    />
                  )
                : <CardDisplay cardIndex={null} small faceDown />}
            </div>
          ))}
          {isActing && (
            <div
              className="pointer-events-none absolute -inset-2 rounded-full blur-md opacity-40 animate-pulse"
              style={{ background: 'radial-gradient(circle, var(--poker-accent-muted), transparent 70%)' }}
              aria-hidden
            />
          )}
        </div>
      )}

      {/* ── Avatar (desktop) or compact timer + roles (narrow) ── */}
      {!hideSeatAvatar ? (
        <div className="relative flex-shrink-0" style={{ zIndex: 1 }}>

          {/* Circular timer ring around avatar */}
          {isActing && timeLeft != null && (
            <CircularTimerRing size={100} timeLeft={timeLeft} maxTime={maxTime} />
          )}

          {/* Avatar — current player: tap opens action radial; opponent: context radial + click profile */}
          {(() => {
            const avatarCard = (
              <div
                ref={avatarRef}
                className="relative select-none overflow-hidden rounded-full outline-none"
                style={{
                  width: 100,
                  height: 100,
                  border: isActing
                    ? '2px solid transparent'
                    : isCurrentPlayer
                      ? '2px solid rgba(251,191,36,0.6)'
                      : '2px solid rgba(255,255,255,0.18)',
                  background: 'rgba(0,0,0,0.6)',
                  cursor: (isCurrentPlayer || (!isCurrentPlayer && onOpponentClick && seat.playerAddress)) ? 'pointer' : 'default',
                  boxShadow: isCurrentPlayer ? '0 0 0 1px rgba(251,191,36,0.15)' : '0 2px 8px rgba(0,0,0,0.6)',
                }}
                onClick={
                  isCurrentPlayer
                    ? playerMainMenuItems.length > 0
                      ? () => {
                          setPlayerRadialPage('main');
                          setPlayerRadialOpen(true);
                        }
                      : undefined
                    : onOpponentClick && seat.playerAddress
                      ? () => onOpponentClick(seat.playerAddress!)
                      : undefined
                }
                title={
                  isCurrentPlayer
                    ? 'Tap for player menu'
                    : onOpponentClick && seat.playerAddress
                      ? onOpponentRadialAction
                        ? 'Tap: profile · Right-click: actions'
                        : 'View profile'
                      : undefined
                }
              >
                {seat.avatarConfig ? (
                  <AvatarView
                    config={seat.avatarConfig}
                    emotion={activeEmotion}
                    compact
                    trackMouse={isCurrentPlayer && !mouseIdle}
                    forceAsleep={seat.status === 'sitting_out'}
                    roamEyes={(isCurrentPlayer && mouseIdle) || (!isCurrentPlayer && !isActing && seat.status !== 'sitting_out')}
                    className="w-full h-full"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center font-bold"
                    style={{
                      color: isCurrentPlayer ? '#fde68a' : '#e2e8f0',
                      fontSize: 32,
                      background: 'linear-gradient(135deg, rgba(30,30,50,1), rgba(10,10,20,1))',
                    }}
                  >
                    {(seat.displayName?.trim() || seat.playerAddress?.slice(-2) || '?')[0].toUpperCase()}
                  </div>
                )}
                {isCurrentPlayer && (
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors hover:bg-black/20" />
                )}
              </div>
            );

            if (!isCurrentPlayer && onOpponentRadialAction && seat.playerAddress) {
              return (
                <RadialMenu
                  menuItems={OPPONENT_RADIAL_ITEMS}
                  onSelect={handleOpponentRadialSelect}
                  size={200}
                  iconSize={16}
                  bandWidth={44}
                >
                  {avatarCard}
                </RadialMenu>
              );
            }
            return avatarCard;
          })()}

          {/* Role badges — bottom of avatar */}
          {(seat.isDealer || seat.isSmallBlind || seat.isBigBlind) && (
            <div className="absolute -bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
              {seat.isDealer     && <RoleToken label="D"  />}
              {seat.isSmallBlind && <RoleToken label="SB" />}
              {seat.isBigBlind   && <RoleToken label="BB" />}
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-col items-center flex-shrink-0 gap-0.5" style={{ zIndex: 1 }}>
          {(seat.isDealer || seat.isSmallBlind || seat.isBigBlind) && (
            <div className="flex justify-center gap-0.5">
              {seat.isDealer     && <RoleToken label="D"  />}
              {seat.isSmallBlind && <RoleToken label="SB" />}
              {seat.isBigBlind   && <RoleToken label="BB" />}
            </div>
          )}
          {isActing && timeLeft != null && (
            <div className="relative mx-auto flex items-center justify-center" style={{ width: 50, height: 50 }}>
              <CircularTimerRing size={40} timeLeft={timeLeft} maxTime={maxTime} />
            </div>
          )}
        </div>
      )}

      {isCurrentPlayer && playerMainMenuItems.length > 0 && (
        <RadialMenuFloating
          open={playerRadialOpen}
          onOpenChange={(o) => {
            setPlayerRadialOpen(o);
            if (!o) setPlayerRadialPage('main');
          }}
          anchorRef={hideSeatAvatar ? badgeRef : avatarRef}
          menuItems={playerRadialPage === 'main' ? playerMainMenuItems : emotionMenuWithBack}
          onSelect={handlePlayerRadialSelect}
          size={playerRadialPage === 'expressions' ? 220 : 260}
          iconSize={playerRadialPage === 'expressions' ? 13 : 16}
          bandWidth={playerRadialPage === 'expressions' ? 38 : 44}
          showLabels
        />
      )}

      {/* "Your Turn" banner */}
      <AnimatePresence>
        {isActing && isCurrentPlayer && (
          <motion.div
            key="your-turn"
            initial={{ opacity: 0, scale: 0.7, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <span
              className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
              style={{ color: 'var(--poker-bg)', background: 'var(--poker-accent)', boxShadow: '0 0 8px var(--poker-accent-muted)' }}
            >
              Your Turn
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Buttons + badge ── */}
      <div style={{ position: 'relative', display: 'inline-block' }}>

        {/* Backdrop to close all menus */}
        <AnimatePresence>
          {isCurrentPlayer && quickChatPickerOpen && (
            <motion.div
              className="fixed inset-0 z-[45]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                setQuickChatPickerOpen(false);
              }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* QuickChat picker */}
        <div
          ref={menuContainerRef}
          className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 w-max min-w-[120px]"
        >
          <AnimatePresence>
            {isCurrentPlayer && quickChatPickerOpen && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                <div className="rounded-xl overflow-hidden max-h-[min(280px,60vh)] overflow-y-auto min-w-[160px] max-w-[220px]"
                  style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                  {quickChatPhrases.map((phrase) => (
                    <button key={phrase} type="button" onClick={() => handleQuickChatSelect(phrase)}
                      className="font-grandstander w-full px-3 py-2 text-sm text-center hover:bg-white/10 transition-colors truncate"
                      style={{ color: 'var(--poker-text)' }}>{phrase}</button>
                  ))}
                  <button type="button" onClick={() => { setQuickChatPickerOpen(false); useSharedQuickChat ? onOpenEditQuickChat?.() : setEditQuickChatOpen(true); }}
                    className="font-grandstander w-full px-3 py-2.5 text-sm font-medium text-center hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/10"
                    style={{ color: 'var(--poker-text)' }}>
                    <span className="text-cyan-400">✎</span> Edit QuickChat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!useSharedQuickChat && (
          <EditQuickChatModal open={editQuickChatOpen} onClose={() => setEditQuickChatOpen(false)} selectedPhrases={quickChatPhrases} onSave={setQuickChatPhrases} />
        )}

        {/* Badge — name + chips */}
        {(() => {
          const opponentTapProfile =
            hideSeatAvatar && !isCurrentPlayer && onOpponentClick && seat.playerAddress
              ? () => onOpponentClick(seat.playerAddress!)
              : undefined;
          const badgeEl = (
            <div
              ref={badgeRef}
              role={isCurrentPlayer ? 'button' : opponentTapProfile ? 'button' : undefined}
              onClick={
                isCurrentPlayer && hideSeatAvatar && playerMainMenuItems.length > 0
                  ? (e) => {
                      e.stopPropagation();
                      setPlayerRadialPage('main');
                      setPlayerRadialOpen(true);
                    }
                  : opponentTapProfile
              }
              aria-label={
                isCurrentPlayer
                  ? hideSeatAvatar
                    ? 'Tap for player menu · Long-press for QuickChat'
                    : 'Long-press or right-click for QuickChat'
                  : opponentTapProfile
                    ? 'Tap for profile, long-press or right-click for actions'
                    : undefined
              }
              onPointerDown={isCurrentPlayer ? handleBadgePointerDown : undefined}
              onPointerUp={isCurrentPlayer ? handleBadgePointerUp : undefined}
              onPointerLeave={isCurrentPlayer ? handleBadgePointerLeave : undefined}
              onPointerCancel={isCurrentPlayer ? handleBadgePointerCancel : undefined}
              onContextMenu={isCurrentPlayer ? handleBadgeContextMenu : undefined}
              className="relative flex flex-col items-stretch overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.88)',
                border: `1px solid ${isActing ? 'transparent' : isCurrentPlayer ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 6,
                minWidth: 88,
                boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
                ...((isCurrentPlayer || opponentTapProfile) ? { cursor: 'pointer' } : {}),
              }}
            >
          <div className="py-1 px-2.5 flex items-center justify-center">
            <div className="flex flex-col items-center min-w-0 text-center">
              <div className="font-bold truncate leading-tight" style={{ color: isCurrentPlayer ? '#fde68a' : '#e2e8f0', fontSize: 'clamp(11px, 2vw, 13px)', maxWidth: 96 }}>
                {displayName}
              </div>
              <div className="font-bold tabular-nums leading-tight flex items-center justify-center gap-1" style={{ color: '#fbbf24', fontSize: 'clamp(11px, 2.2vw, 13px)' }}>
                {formatChips(seat.stack)}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/morbius/MorbiusLogo%20(3).png" alt="" aria-hidden className="shrink-0" style={{ height: '1em', width: 'auto', verticalAlign: 'middle' }} />
              </div>
            </div>
          </div>
          <AnimatePresence mode="wait">
            {actionStyle && (
              <motion.div key={activeAction} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                <div className="text-center font-bold uppercase tracking-widest py-0.5" style={{ background: actionStyle.bg, color: '#fff', fontSize: 'clamp(9px, 1.6vw, 10px)' }}>
                  {actionStyle.label}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          );

          if (hideSeatAvatar && !isCurrentPlayer && onOpponentRadialAction && seat.playerAddress) {
            return (
              <RadialMenu
                menuItems={OPPONENT_RADIAL_ITEMS}
                onSelect={handleOpponentRadialSelect}
                size={200}
                iconSize={16}
                bandWidth={44}
              >
                {badgeEl}
              </RadialMenu>
            );
          }
          return badgeEl;
        })()}

      </div>
    </div>
  );
}
