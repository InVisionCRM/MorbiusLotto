'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { formatChips } from '@/lib/format-poker-chips';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
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
  PauseCircle,
  PlayCircle,
  Smile,
  SmilePlus,
  Trophy,
  UserCircle,
  UserPlus,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import { AvatarView, type Emotion } from '@/components/avatar';
import { RadialMenu, RadialMenuFloating, type RadialMenuItem } from '@/components/ui/radial-menu';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';

const LONG_PRESS_MS = 500;
const PHRASE_OVERLAY_DURATION_MS = 2000;
const LOCAL_EMOTION_DURATION_MS = 3000;
const FOLD_CRY_EMOTION_DURATION_MS = 5000;

// ── Helpers ────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return addr.slice(-4);
}

// ── Color-coded action system ──────────────────────────────────────────────

const ACTION_STYLE: Record<string, { bg: string; verb: string }> = {
  fold:     { bg: '#2d4a6b', verb: 'Folded' },
  check:    { bg: '#0c5f70', verb: 'Checked' },
  call:     { bg: '#14532d', verb: 'Called' },
  bet:      { bg: '#92400e', verb: 'Bet' },
  raise:    { bg: '#9a3412', verb: 'Raised' },
  'all-in': { bg: '#7f1d1d', verb: 'All-In' },
  allin:    { bg: '#7f1d1d', verb: 'All-In' },
};

function getActionStyle(action: string) {
  return ACTION_STYLE[action.toLowerCase()] ?? { bg: '#374151', verb: action };
}

function formatActionLabel(action: string, amount?: string): string {
  const style = getActionStyle(action);
  const normalized = action.toLowerCase();
  const showAmount = ['call', 'bet', 'raise', 'all-in', 'allin'].includes(normalized)
    && toBigIntSafe(amount ?? 0) > 0n;
  return showAmount ? `${style.verb} ${formatChips(amount ?? '0')}` : style.verb;
}

// ── Chip stack (exported for use at table level) ──────────────────────────

export function PokerChipStack({ weiAmount }: { weiAmount: string }) {
  let amount = 0;
  try {
    const n = toBigIntSafe(weiAmount);
    amount = n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : Number.MAX_SAFE_INTEGER;
  } catch { /* noop */ }
  if (amount <= 0) return null;

  return (
    <BetChip label={formatChipLabel(amount)} amount={amount} size="clamp(34px, 3vw, 44px)" />
  );
}

const AVATAR_SIZE_PX = 84;
const ROLE_CRESCENT_HEIGHT_PX = Math.round(AVATAR_SIZE_PX * 0.28);

const ROLE_CRESCENT_STYLE = {
  DEALER: { bg: '#f4e7b6', text: '#1a1a1a', rim: '#d4af37' },
  SB: { bg: '#1d4ed8', text: '#ffffff', rim: '#60a5fa' },
  BB: { bg: '#b45309', text: '#ffffff', rim: '#fbbf24' },
  'DEALER/SB': { bg: '#1f2a44', text: '#f8fafc', rim: '#a7b6d9' },
} as const;
const WINNER_CRESCENT_STYLE = {
  bg: '#14532d',
  text: '#ecfccb',
  rim: '#22c55e',
} as const;

// ── Circular timer ring around avatar ──────────────────────────────────────

function CircularTimerRing({ size, timeLeft, maxTime }: { size: number; timeLeft: number; maxTime: number }) {
  const pad = 5;
  const total = size + pad * 2;
  const cx = total / 2;
  const strokeWidth = 3.5;
  const radius = cx - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const color = 'hsl(120, 90%, 52%)';

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
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

function RectTimerRing({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const color = 'hsl(120, 90%, 52%)';
  const perimeter = 2 * (96 + 40);
  return (
    <svg
      aria-hidden
      className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] pointer-events-none z-10"
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
    >
      <rect
        x="2"
        y="2"
        width="96"
        height="40"
        rx="8"
        ry="8"
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="2.5"
      />
      <rect
        x="2"
        y="2"
        width="96"
        height="40"
        rx="8"
        ry="8"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={perimeter}
        strokeDashoffset={perimeter * (1 - progress)}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear' }}
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
  /** True only when this seat is in current hand winner list at showdown. */
  isHandWinner?: boolean;
  lastAction?: { action: string; amount: string } | null;
  /** Wei amount the player needs to call (when it's their turn and facing a bet). */
  callAmount?: string | null;
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
  /** Voluntarily sit out of future hands. */
  onSitOut?: () => void;
  /** Return from sitting out. */
  onSitBack?: () => void;
  /** Bump parent Activity feed serial on mobile. */
  onRequestMobileActivity?: () => void;
  /** Show Activity wedge in player radial (typically true when `hideSeatAvatar`). */
  includeActivityInPlayerRadial?: boolean;
  /** During showdown, nudge visible cards toward table center. */
  showdownCardOffset?: { x: number; y: number };
  /** Current best hand name (self: live-updating; opponents: showdown only). */
  handName?: string;
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

export function PokerSeat({ seat, index, holeCards, isCurrentPlayer, showCardBacks, winningCardIndices, isHandWinner = false, lastAction, callAmount, timeLeft, maxTime = 60, chatBubble, onReUpClick, onMenuClick, overlayPhrase: propsOverlayPhrase, overlayEmotion: propsOverlayEmotion, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases: propsQuickChatPhrases, setQuickChatPhrases: propsSetQuickChatPhrases, onOpenEditQuickChat, hideSeatAvatar = false, onLeaveTable, onSitOut, onSitBack, onRequestMobileActivity, includeActivityInPlayerRadial = false, showdownCardOffset, handName }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = !!(holeCards && holeCards.length > 0);
  const showBacks   = !!(showCardBacks && !showMyCards && !empty && !seat.folded);
  const hasCards    = showMyCards || showBacks;

  const isActing  = !!seat.isActing && !empty && !seat.folded;
  const isFolded  = !!seat.folded && !empty;
  const stackEmpty = !empty && toBigIntSafe(seat.stack ?? 0) <= 0n;

  const displayName = empty
    ? 'Open'
    : (isCurrentPlayer ? 'You' : (seat.displayName?.trim() || shortAddr(seat.playerAddress!)));

  const avatarEmotion: Emotion = useMemo(() => {
    if (!lastAction) return 'neutral';
    const a = lastAction.action?.toLowerCase();
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
  const [isFoldCryActive, setIsFoldCryActive] = useState(false);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foldCryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActionRef = useRef<string | null>(null);
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
    if (seat.status === 'sitting_out') {
      if (onSitBack) items.push({ id: 'sitback', label: "I'm Back", icon: PlayCircle });
    } else {
      if (onSitOut) items.push({ id: 'sitout', label: 'Sit Out', icon: PauseCircle });
    }
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
    onSitOut,
    onSitBack,
    seat.status,
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

  useEffect(() => {
    const action = lastAction?.action?.toLowerCase() ?? null;
    const wasAction = prevActionRef.current;
    prevActionRef.current = action;

    if (action === 'fold' && wasAction !== 'fold') {
      setIsFoldCryActive(true);
      if (foldCryTimerRef.current) clearTimeout(foldCryTimerRef.current);
      foldCryTimerRef.current = setTimeout(() => {
        setIsFoldCryActive(false);
        foldCryTimerRef.current = null;
      }, FOLD_CRY_EMOTION_DURATION_MS);
      return;
    }

    if (action !== 'fold') {
      setIsFoldCryActive(false);
      if (foldCryTimerRef.current) {
        clearTimeout(foldCryTimerRef.current);
        foldCryTimerRef.current = null;
      }
    }
  }, [lastAction]);

  // Active emotion: menu-open slouch > broadcast (from server) > local (just clicked) > fold-cry timer > action-driven
  const activeEmotion: Emotion = hasMenuOpen
    ? 'neutral'
    : (propsOverlayEmotion ?? localEmotion ?? (isFoldCryActive ? 'sad' : avatarEmotion));
  const roleLabel: keyof typeof ROLE_CRESCENT_STYLE | null = seat.isBigBlind
    ? 'BB'
    : (seat.isDealer && seat.isSmallBlind)
      ? 'DEALER/SB'
      : seat.isDealer
        ? 'DEALER'
        : seat.isSmallBlind
          ? 'SB'
          : null;
  const roleStyle = roleLabel ? ROLE_CRESCENT_STYLE[roleLabel] : null;

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
      else if (id === 'sitout') onSitOut?.();
      else if (id === 'sitback') onSitBack?.();
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
      onSitOut,
      onSitBack,
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
    if (foldCryTimerRef.current) clearTimeout(foldCryTimerRef.current);
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

  const callWei = toBigIntSafe(callAmount ?? 0);
  const activeAction = isActing
    ? null
    : lastAction && lastAction.action !== 'blind'
      ? lastAction
      : isFolded
        ? { action: 'fold', amount: '0' }
        : null;
  const actionStyle = isActing && callWei > 0n
    ? { bg: 'rgba(74,222,128,0.85)' }
    : activeAction ? getActionStyle(activeAction.action) : null;
  const actionLabel = isActing && callWei > 0n
    ? `Call ${formatChips(callWei)}?`
    : activeAction ? formatActionLabel(activeAction.action, activeAction.amount) : null;

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
      data-testid={`poker-seat-${index}`}
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
                fontSize: 'clamp(9px, 1.9vw, 10px)',
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
        <motion.div
          data-testid={`poker-seat-cards-${index}`}
          className="relative flex-shrink-0"
          animate={{
            x: showdownCardOffset?.x ?? 0,
            y: showdownCardOffset?.y ?? 0,
          }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          style={{
            width: showMyCards ? 'clamp(84px, 20vw, 110px)' : 'clamp(58px, 14vw, 74px)',
            height: showMyCards ? 'clamp(72px, 18vw, 96px)' : 'clamp(50px, 12vw, 66px)',
            marginBottom: hideSeatAvatar ? -10 : -44,
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
                  ? { width: 'clamp(54px, 13vw, 70px)', height: 'clamp(70px, 17vw, 90px)', left: ci === 0 ? '0' : 'clamp(22px, 5.6vw, 30px)' }
                  : { width: 'clamp(38px, 9vw, 48px)', height: 'clamp(48px, 12vw, 62px)', left: ci === 0 ? '0' : 'clamp(14px, 3.8vw, 20px)' }),
                transform: `rotate(${ci === 0 ? -12 : 12}deg)`,
                transformOrigin: 'bottom center',
                filter: isFolded ? 'grayscale(1) opacity(0.5)' : undefined,
                borderRadius: 8,
                boxShadow: isActing
                  ? '0 0 0 2px rgba(34, 211, 238, 0.95), 0 0 14px rgba(34, 211, 238, 0.85), 0 0 22px rgba(56, 189, 248, 0.65)'
                  : undefined,
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
        </motion.div>
      )}

      {/* ── Avatar (desktop) or compact timer + roles (narrow) ── */}
      {!hideSeatAvatar ? (
        <div className="relative flex-shrink-0" style={{ zIndex: 1 }}>

          {/* Circular timer ring around avatar */}
          {isActing && timeLeft != null && (
            <CircularTimerRing size={AVATAR_SIZE_PX} timeLeft={timeLeft} maxTime={maxTime} />
          )}

          {/* Avatar — current player: tap opens action radial; opponent: context radial + click profile */}
          {(() => {
            const avatarCard = (
              <div
                ref={avatarRef}
                className="relative select-none overflow-hidden rounded-full outline-none"
                style={{
                  width: AVATAR_SIZE_PX,
                  height: AVATAR_SIZE_PX,
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
                {isHandWinner && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 flex items-center justify-center"
                    style={{
                      width: '84%',
                      height: Math.max(16, Math.round(ROLE_CRESCENT_HEIGHT_PX * 0.78)),
                      borderRadius: '42px 42px 9999px 9999px / 18px 18px 12px 12px',
                      background: WINNER_CRESCENT_STYLE.bg,
                      borderBottom: `1px solid ${WINNER_CRESCENT_STYLE.rim}`,
                      boxShadow:
                        'inset 0 2px 4px rgba(255,255,255,0.08), inset 0 -7px 12px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.55)',
                    }}
                  >
                    <span
                      style={{
                        color: WINNER_CRESCENT_STYLE.text,
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: '0.5px',
                        lineHeight: 1,
                      }}
                    >
                      WINNER
                    </span>
                  </div>
                )}
                {roleLabel && roleStyle && (
                  <div
                    className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 flex items-center justify-center"
                    style={{
                      width: '92%',
                      height: ROLE_CRESCENT_HEIGHT_PX,
                      borderRadius: '9999px 9999px 42px 42px / 14px 14px 22px 22px',
                      background: roleStyle.bg,
                      borderTop: `1px solid ${roleStyle.rim}`,
                      boxShadow:
                        'inset 0 -3px 6px rgba(0,0,0,0.48), 0 2px 4px rgba(0,0,0,0.26)',
                    }}
                  >
                    <span
                      style={{
                        color: roleStyle.text,
                        fontSize: roleLabel === 'DEALER/SB' ? 8 : roleLabel === 'DEALER' ? 9 : 11,
                        fontWeight: 900,
                        letterSpacing: roleLabel === 'DEALER/SB' ? '-0.4px' : roleLabel === 'DEALER' ? '-0.2px' : '0.2px',
                        lineHeight: 1,
                      }}
                    >
                      {roleLabel}
                    </span>
                  </div>
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
        </div>
      ) : (
        <div className="relative flex flex-col items-center flex-shrink-0 gap-0.5" style={{ zIndex: 1 }} />
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
                width: 112,
                minWidth: 112,
                boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
                ...((isCurrentPlayer || opponentTapProfile) ? { cursor: 'pointer' } : {}),
              }}
            >
          <div className="py-1 px-2.5 flex items-center justify-center">
            <div className="flex flex-col items-center min-w-0 text-center">
              <div className="font-bold truncate leading-tight" style={{ color: isCurrentPlayer ? '#fde68a' : '#e2e8f0', fontSize: 'clamp(11px, 2vw, 13px)', maxWidth: 96 }}>
                {displayName}
              </div>
              <div
                className="font-bold tabular-nums leading-tight flex items-center justify-center gap-0.5"
                style={{ color: '#fbbf24', fontSize: 'clamp(9px, 1.8vw, 11px)', whiteSpace: 'nowrap' }}
              >
                {formatChips(seat.stack)}
                <img src="/morbius/MorbiusLogo%20(3).png" alt="" aria-hidden className="shrink-0" style={{ height: '1em', width: 'auto', verticalAlign: 'middle' }} />
              </div>
            </div>
          </div>
          {handName && !isFolded && (
            <div
              className="text-center leading-tight truncate px-1.5 py-0.5"
              style={{
                background: isCurrentPlayer
                  ? 'linear-gradient(90deg, rgba(6,182,212,0.25), rgba(34,211,238,0.18))'
                  : 'rgba(34,211,238,0.12)',
                color: isCurrentPlayer ? '#67e8f9' : '#a5f3fc',
                fontSize: 'clamp(8px, 1.7vw, 10px)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                borderTop: '1px solid rgba(34,211,238,0.2)',
              }}
            >
              {handName}
            </div>
          )}
          <div className="h-[22px] overflow-hidden">
            <AnimatePresence mode="wait">
              {actionStyle && actionLabel && (
                <motion.div
                  key={`${activeAction?.action}-${actionLabel}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <div
                    data-testid={`poker-seat-action-${index}`}
                    className="h-[22px] text-center font-bold px-2 py-1 leading-tight break-words"
                    style={{ background: actionStyle.bg, color: '#fff', fontSize: 'clamp(8px, 1.55vw, 10px)' }}
                  >
                    {actionLabel}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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

        {isCurrentPlayer && stackEmpty && onReUpClick && (
          <button
            type="button"
            onClick={onReUpClick}
            className="mt-1 w-full rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors"
            style={{
              background: 'linear-gradient(180deg, #0ea5e9 0%, #2563eb 100%)',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
            }}
          >
            Rebuy In
          </button>
        )}

      </div>
    </div>
  );
}
