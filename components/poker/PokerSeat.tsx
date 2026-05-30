'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { formatChips } from '@/lib/format-poker-chips';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { CardDisplay, formatPokerCardIndexLabel, POKER_RANK_SUIT_LABEL_COLORS, pokerCardSuitIndex } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
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
import { usePokerVoicePresenceForAddress } from './voice-presence';
import { POKER_UI_CQW } from '@/lib/poker-table-cqw';

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
    <BetChip label={formatChipLabel(amount)} amount={amount} size={POKER_UI_CQW.betChip} />
  );
}

// ── Animated stack value (count-up + gain flash + floating delta) ──────────
//
// The seat plate "X chips" number used to jump instantly when stacks
// changed — easy to miss whether you won or lost. This wrapper springs
// the displayed number from old to new value, briefly flashes the text
// color on a gain, and floats a "+1,200" pill above the seat that rises
// and fades. Losses count down without the flash/floater because chips
// already animate visibly into the bet area as a player commits them.
function safeChipNumber(value: string): number {
  try {
    const b = toBigIntSafe(value);
    return b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : Number.MAX_SAFE_INTEGER;
  } catch {
    return 0;
  }
}

function AnimatedStackValue({ value, baseColor }: { value: string; baseColor: string }) {
  const targetNum = useMemo(() => safeChipNumber(value), [value]);
  const mv = useMotionValue(targetNum);
  // Slower than the pot spring so the count-up reads clearly; the seat
  // plate has less ink for the eye to track.
  const spring = useSpring(mv, { stiffness: 110, damping: 22, mass: 0.9 });
  const display = useTransform(spring, (v) =>
    Math.max(0, Math.floor(v)).toLocaleString('en-US')
  );

  // Detect a positive delta against the last *target* (not the spring
  // mid-value) to gate the gain flash + floating delta pill.
  const lastTargetRef = useRef<number>(targetNum);
  const [flashKey, setFlashKey] = useState(0);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const prev = lastTargetRef.current;
    if (targetNum > prev) {
      setDelta(targetNum - prev);
      setFlashKey((k) => k + 1);
    }
    lastTargetRef.current = targetNum;
    mv.set(targetNum);
  }, [targetNum, mv]);

  // The flash color rides on top of the seat's existing chip color. We
  // animate to a punchy gold-green then back to baseColor over ~600ms.
  const flashColor = useTransform(
    useSpring(useMotionValue(0), { stiffness: 220, damping: 18 }),
    () => baseColor
  );
  void flashColor; // (motion-value declared to keep API consistent; color animation is keyframed below)

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <motion.span
        key={`flash-${flashKey}`}
        animate={flashKey === 0
          ? { color: baseColor, textShadow: '0 0 0px rgba(0,0,0,0)' }
          : {
              color: [baseColor, '#bbf7d0', '#fde68a', baseColor],
              textShadow: [
                '0 0 0px rgba(0,0,0,0)',
                '0 0 14px rgba(134,239,172,0.9)',
                '0 0 10px rgba(253,224,71,0.75)',
                '0 0 0px rgba(0,0,0,0)',
              ],
            }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="tabular-nums"
      >
        {display}
      </motion.span>
      <AnimatePresence>
        {flashKey > 0 && delta > 0 && (
          <motion.span
            key={`delta-${flashKey}`}
            initial={{ opacity: 0, y: 4, scale: 0.85 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-2, -18, -26, -32], scale: [0.85, 1.1, 1.0, 0.95] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.18, 0.7, 1] }}
            className="absolute font-bold tabular-nums pointer-events-none"
            style={{
              left: '50%',
              top: '-1.2em',
              transform: 'translateX(-50%)',
              color: '#86efac',
              textShadow: '0 0 8px rgba(134,239,172,0.95), 0 1px 3px rgba(0,0,0,0.85)',
              fontSize: '0.85em',
              whiteSpace: 'nowrap',
            }}
          >
            +{formatChipLabel(delta)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

const AVATAR_BOX_STYLE: React.CSSProperties = {
  // Scales with the table (cqw) instead of a hard 128px cap. The table renders
  // wider than the 1300px editor frame on big screens, and the name plate is
  // positioned as a *fraction* of the table size — so a fixed-px avatar drifts
  // away from its plate as the table grows. Keeping the avatar a constant
  // fraction (9.85cqw ≈ 128px at the 1300px reference) makes the plate overlap
  // the avatar's bottom consistently at every screen size.
  width: 'clamp(96px, 9.85cqw, 188px)',
  height: 'clamp(96px, 9.85cqw, 188px)',
};

const ROLE_CRESCENT_STYLE = {
  SB: { bg: '#1d4ed8', text: '#ffffff', rim: '#60a5fa' },
  BB: { bg: '#b45309', text: '#ffffff', rim: '#fbbf24' },
} as const;
// ── Circular timer ring around avatar ──────────────────────────────────────

function CircularTimerRing({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const strokeWidth = 3.5;
  const cx = 50;
  const cy = 50;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const color = 'hsl(120, 90%, 52%)';

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 'calc(100% + 10px)',
        height: 'calc(100% + 10px)',
        transform: 'translate(-50%, -50%) rotate(-90deg)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference * progress} ${circumference}`}
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

function VoiceAvatarCue({
  active,
  audioLevel,
  isLocalParticipant,
}: {
  active: boolean;
  audioLevel: number;
  isLocalParticipant: boolean;
}) {
  if (!active && audioLevel <= 0.03) return null;

  const level = Math.max(active ? 0.22 : 0, Math.min(1, audioLevel));
  const intensity = Math.min(1, level + (active ? 0.18 : 0));
  const glowAlpha = 0.24 + intensity * 0.46;
  const ringAlpha = 0.36 + intensity * 0.54;
  const blur = 9 + intensity * 24;
  const scale = 1 + intensity * 0.035;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-full" aria-hidden>
      <div
        className="absolute inset-[2px] rounded-full transition-all duration-150"
        style={{
          transform: `scale(${scale})`,
          border: `${2 + intensity * 2.5}px solid rgba(96, 165, 250, ${ringAlpha})`,
          boxShadow: [
            `0 0 ${blur}px rgba(59, 130, 246, ${glowAlpha})`,
            `0 0 ${blur * 1.8}px rgba(37, 99, 235, ${glowAlpha * 0.5})`,
            'inset 0 0 14px rgba(255, 255, 255, 0.12)',
          ].join(', '),
        }}
      />
      <div
        className="absolute inset-[6px] rounded-full transition-opacity duration-150"
        style={{
          opacity: 0.18 + intensity * 0.32,
          background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.20), transparent 58%)',
          mixBlendMode: 'screen',
        }}
      />
      {isLocalParticipant && (
        <div
          className="absolute -right-0.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-150"
          style={{
            background: active ? 'rgb(96, 165, 250)' : 'rgba(148, 163, 184, 0.9)',
            boxShadow: active
              ? `0 0 ${10 + intensity * 12}px rgba(59, 130, 246, ${0.55 + intensity * 0.3})`
              : '0 0 6px rgba(148, 163, 184, 0.35)',
          }}
        />
      )}
    </div>
  );
}

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
  /** Pixel offset from the avatar seat anchor to the independently authored player tag anchor. */
  playerTagOffset?: { x: number; y: number };
  /** During showdown, nudge visible cards toward table center. */
  showdownCardOffset?: { x: number; y: number };
  /** Pixel offset from the avatar seat anchor to CARD_ANCHOR_RING[0] (hero). Positions the hero hand like opponent cards. */
  heroCardOffset?: { x: number; y: number };
  /** Current best hand name (self: live-updating; opponents: showdown only). */
  handName?: string;
  /** Pixel offset from pot center to this seat's card origin — so cards deal from the middle of the table. */
  cardDealFromOffset?: { dx: number; dy: number };
  /** Face-down hole card art (table sponsor / default); matches floating felt logo when set by parent. */
  cardBackSrc?: string | null;
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

function offsetTransform(offset?: { x: number; y: number }): string | undefined {
  if (!offset || (Math.abs(offset.x) < 0.01 && Math.abs(offset.y) < 0.01)) return undefined;
  return `translate(${offset.x}px, ${offset.y}px)`;
}

export function PokerSeat({ seat, index, holeCards, isCurrentPlayer, showCardBacks, winningCardIndices, isHandWinner = false, lastAction, callAmount, timeLeft, maxTime = 60, chatBubble, onReUpClick, onMenuClick, overlayPhrase: propsOverlayPhrase, overlayEmotion: propsOverlayEmotion, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases: propsQuickChatPhrases, setQuickChatPhrases: propsSetQuickChatPhrases, onOpenEditQuickChat, hideSeatAvatar = false, onLeaveTable, onSitOut, onSitBack, onRequestMobileActivity, includeActivityInPlayerRadial = false, playerTagOffset, showdownCardOffset, heroCardOffset, handName, cardDealFromOffset, cardBackSrc }: PokerSeatProps) {
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
  const voicePresence = usePokerVoicePresenceForAddress(seat.playerAddress);
  const voiceLevel = voicePresence?.audioLevel ?? 0;
  const voiceActive = !!voicePresence && (voicePresence.isSpeaking || voicePresence.isDominantSpeaker || voiceLevel > 0.12);

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

  const [internalQuickChatPhrases, setInternalQuickChatPhrases] = useQuickChatPhrases();
  const useSharedQuickChat = propsQuickChatPhrases != null && propsSetQuickChatPhrases != null && onOpenEditQuickChat != null;
  const quickChatPhrases = useSharedQuickChat ? propsQuickChatPhrases : internalQuickChatPhrases;
  const setQuickChatPhrases = useSharedQuickChat ? propsSetQuickChatPhrases : setInternalQuickChatPhrases;

  // Slouch while any menu is open
  const hasMenuOpen = (!useSharedQuickChat && quickChatPickerOpen) || playerRadialOpen;

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
    if (onPhraseReaction && !useSharedQuickChat) items.push({ id: 'quickchat', label: 'Chat', icon: MessageCircle });
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
    useSharedQuickChat,
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
  // Dealer position is shown via the physical dealer button on the felt
  // (`DealerButton` rendered by `PokerTable`), not the avatar crescent. Only
  // SB / BB still get a crescent.
  const roleLabel: keyof typeof ROLE_CRESCENT_STYLE | null = seat.isBigBlind
    ? 'BB'
    : seat.isSmallBlind
      ? 'SB'
      : null;
  const roleStyle = roleLabel ? ROLE_CRESCENT_STYLE[roleLabel] : null;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleBadgePointerDown = useCallback(() => {
    if (!isCurrentPlayer || useSharedQuickChat) return;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setQuickChatPickerOpen(true);
    }, LONG_PRESS_MS);
  }, [isCurrentPlayer, useSharedQuickChat, clearLongPress]);

  const handleBadgePointerUp = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerLeave = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerCancel = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!isCurrentPlayer || useSharedQuickChat) return;
    setQuickChatPickerOpen(true);
  }, [isCurrentPlayer, useSharedQuickChat]);

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
    if (!quickChatPickerOpen || !isCurrentPlayer || useSharedQuickChat) return;
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
  }, [isCurrentPlayer, quickChatPickerOpen, useSharedQuickChat]);

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
            style={{ maxWidth: POKER_UI_CQW.chatBubbleMax, minWidth: 48 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28, ease: [0.2, 0.9, 0.2, 1] }}
          >
            <div
              className="font-jost px-2 py-1.5 rounded-lg text-left break-words font-semibold"
              style={{
                background: 'rgba(0,0,0,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
                color: 'var(--poker-text)',
                fontSize: POKER_UI_CQW.chatBubbleFont,
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
            className="font-jost absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-40 text-lg lg:text-xl text-center px-2 font-bold"
            style={{ color: 'var(--poker-text)', maxWidth: POKER_UI_CQW.phraseOverlayMax }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28, ease: [0.2, 0.9, 0.2, 1] }}
          >
            {displayPhrase}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cards — hero only. Opponent cards are rendered by PokerTable via CARD_ANCHOR_RING. ──
          No <AnimatePresence> wrapper: when the hero folds, PokerTable's
          fold flyout flies a copy of these cards from seat to pot. If we
          let this motion.div exit-animate at the same time, the user
          sees two card stacks transitioning at once. Removing the
          wrapper makes the hero cards unmount instantly on fold so the
          flyout is the only visible animation. */}
      {hasCards && showMyCards && isCurrentPlayer && (
        <div
          data-testid={`poker-seat-cards-${index}`}
          className="pointer-events-none absolute"
          style={{
            // Anchored to CARD_ANCHOR_RING[0] (hero) via heroCardOffset, the same
            // offset-from-seat mechanism the name plate uses — so the hero hand is
            // draggable in the layout editor exactly like opponent cards. Falls back
            // to the seat center when no offset is provided.
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${heroCardOffset?.x ?? 0}px, ${heroCardOffset?.y ?? 0}px)`,
            zIndex: 6,
          }}
        >
          <motion.div
            initial={false}
            animate={{
              x: showdownCardOffset?.x ?? 0,
              y: showdownCardOffset?.y ?? 0,
            }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="relative flex items-center justify-center"
          >
            {[0, 1].map((ci) => (
              <div
                key={ci}
                className="relative"
                style={{
                  width: POKER_UI_CQW.heroCardInnerW,
                  height: POKER_UI_CQW.heroCardInnerH,
                  marginLeft: ci === 1 ? '-18px' : 0,
                  transform: `rotate(${ci === 0 ? -11 : 11}deg)`,
                  transformOrigin: 'bottom center',
                  zIndex: ci,
                  filter: [
                    isFolded ? 'grayscale(1) opacity(0.5)' : '',
                    isActing ? 'drop-shadow(0 0 6px rgba(34,211,238,0.95)) drop-shadow(0 0 14px rgba(56,189,248,0.65))' : '',
                  ].filter(Boolean).join(' ') || undefined,
                  borderRadius: 8,
                }}
              >
                <CardDisplay
                  cardIndex={holeCards![ci]}
                  isWinningCard={winningCardIndices?.includes(holeCards![ci])}
                  dealDelay={ci * 0.06}
                />
                {/* Big rank+suit tag off the top of the card — same labels/colors
                    as the community-card row, sized up. Rotates with the card. */}
                {holeCards![ci] != null && holeCards![ci] >= 0 && (
                  <div
                    className="font-jost pointer-events-none absolute left-1/2 -translate-x-1/2 font-black tabular-nums"
                    style={{
                      bottom: 'calc(100% + 4px)',
                      fontSize: 'clamp(20px, 2.4cqw, 36px)',
                      lineHeight: 1,
                      color: POKER_RANK_SUIT_LABEL_COLORS[pokerCardSuitIndex(holeCards![ci]) ?? 0],
                      background: 'rgba(8,11,17,0.92)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      borderRadius: 8,
                      padding: '2px 9px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
                    }}
                    aria-hidden
                  >
                    {formatPokerCardIndexLabel(holeCards![ci])}
                  </div>
                )}
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
        </div>
      )}

      {/* ── Avatar (desktop) or compact timer + roles (narrow) ── */}
      {!hideSeatAvatar ? (
        <div className="relative flex-shrink-0" style={{ zIndex: 1 }}>

          {/* Circular timer ring around avatar */}
          {isActing && timeLeft != null && (
            <CircularTimerRing timeLeft={timeLeft} maxTime={maxTime} />
          )}


          {/* Avatar — current player: tap opens action radial; opponent: context radial + click profile */}
          {(() => {
            const avatarCard = (
              <div
                ref={avatarRef}
                className="relative select-none overflow-hidden rounded-full outline-none"
                style={{
                  ...AVATAR_BOX_STYLE,
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
                <VoiceAvatarCue
                  active={voiceActive}
                  audioLevel={voiceLevel}
                  isLocalParticipant={!!voicePresence?.isLocalParticipant}
                />
                {seat.profileDisplayMode === 'photo' && seat.profileImageUrl ? (
                  <img
                    src={seat.profileImageUrl}
                    alt={seat.displayName ?? 'Player'}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : seat.avatarConfig ? (
                  <AvatarView
                    config={seat.avatarConfig}
                    emotion={activeEmotion}
                    compact
                    trackMouse={isCurrentPlayer && !mouseIdle}
                    forceAsleep={seat.status === 'sitting_out'}
                    roamEyes={(isCurrentPlayer && mouseIdle) || (!isCurrentPlayer && !isActing && seat.status !== 'sitting_out')}
                    className="w-full h-full"
                  />
                ) : seat.profileImageUrl ? (
                  <img
                    src={seat.profileImageUrl}
                    alt={seat.displayName ?? 'Player'}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center font-bold"
                    style={{
                      color: isCurrentPlayer ? '#fde68a' : '#e2e8f0',
                      fontSize: 46,
                      background: 'linear-gradient(135deg, rgba(30,30,50,1), rgba(10,10,20,1))',
                    }}
                  >
                    {(seat.displayName?.trim() || seat.playerAddress?.slice(-2) || '?')[0].toUpperCase()}
                  </div>
                )}
                {isCurrentPlayer && (
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors hover:bg-black/20" />
                )}
                {/* Small/Big blind — colored inner ring inside the avatar rim
                    (replaces the old bottom crescent). SB = blue, BB = gold. */}
                {roleLabel && roleStyle && (
                  <div
                    className="pointer-events-none absolute rounded-full"
                    style={{
                      inset: 3,
                      border: `4px solid ${roleStyle.rim}`,
                      boxShadow: `inset 0 0 8px ${roleStyle.rim}`,
                    }}
                    aria-label={roleLabel === 'BB' ? 'Big blind' : 'Small blind'}
                  />
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

          {/* Last action / winner — pill tucked over the top ~5% of the avatar.
              Sticky: shows the seat's most recent action until they act again.
              Moved here from the name plate so the plate stays name + chips only. */}
          {(isHandWinner || (actionStyle && actionLabel)) && (
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-30" style={{ top: -13 }}>
              {isHandWinner ? (
                <div
                  data-testid={`poker-seat-winner-${index}`}
                  className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold leading-none"
                  style={{
                    background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 100%)',
                    color: '#1a1208',
                    fontSize: POKER_UI_CQW.actionPillFont,
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.55)',
                  }}
                >
                  <Trophy size={10} strokeWidth={2.5} aria-hidden />
                  <span>Winner</span>
                </div>
              ) : (
                <div
                  data-testid={`poker-seat-action-${index}`}
                  className="rounded-full px-2.5 py-0.5 font-bold leading-none text-white"
                  style={{
                    background: actionStyle!.bg,
                    fontSize: POKER_UI_CQW.actionPillFont,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
                  }}
                >
                  {actionLabel}
                </div>
              )}
            </div>
          )}

          {/* AFK badge — soft warning at 1 missed turn, hard AFK at 2+.
              Visible to the whole table so opponents see why this seat is
              folding fast. Positioned above the avatar so it isn't clipped
              by the avatar's overflow-hidden circle. */}
          {(() => {
            const ct = seat.consecutiveTimeouts ?? 0;
            if (ct < 1) return null;
            const hard = ct >= 2;
            return (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-20"
                style={{ top: -32 }}
              >
                <div
                  className="rounded-full px-1.5 py-[2px] text-[9px] font-bold leading-none tracking-wide uppercase shadow-md"
                  style={{
                    background: hard ? 'rgba(220,38,38,0.95)' : 'rgba(245,158,11,0.95)',
                    color: '#fff',
                    border: hard ? '1px solid rgba(255,200,200,0.45)' : '1px solid rgba(255,230,180,0.45)',
                    textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                  }}
                  title={hard ? 'AFK — folding quickly' : '1 turn missed'}
                >
                  {hard ? 'AFK' : 'Idle'}
                </div>
              </div>
            );
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
      <div
        style={
          hideSeatAvatar
            ? { position: 'relative', display: 'inline-block', transform: offsetTransform(playerTagOffset) }
            : {
                // Desktop: anchor the name plate absolutely at PLAYER_TAG_ANCHOR_RING
                // (seat center + authored offset = the tag anchor) so positions dragged
                // in the /poker-layout editor land exactly. Mobile keeps the in-flow layout.
                // zIndex 40 keeps the plate the TOP layer of the seat — above the avatar
                // (z1) and the hero cards (z6) — so name + chips are never buried.
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%)${playerTagOffset ? ` translate(${playerTagOffset.x}px, ${playerTagOffset.y}px)` : ''}`,
                zIndex: 40,
              }
        }
      >

        {/* Backdrop to close all menus */}
        <AnimatePresence>
          {isCurrentPlayer && quickChatPickerOpen && !useSharedQuickChat && (
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
            {isCurrentPlayer && quickChatPickerOpen && !useSharedQuickChat && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                <div className="rounded-xl overflow-hidden max-h-[min(280px,60vh)] overflow-y-auto min-w-[160px] max-w-[220px]"
                  style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                  {quickChatPhrases.map((phrase) => (
                    <button key={phrase} type="button" onClick={() => handleQuickChatSelect(phrase)}
                      className="font-jost w-full px-3 py-2 text-sm text-center font-semibold hover:bg-white/10 transition-colors truncate"
                      style={{ color: 'var(--poker-text)' }}>{phrase}</button>
                  ))}
                  <button type="button" onClick={() => { setQuickChatPickerOpen(false); useSharedQuickChat ? onOpenEditQuickChat?.() : setEditQuickChatOpen(true); }}
                    className="font-jost w-full px-3 py-2.5 text-sm font-medium text-center hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/10"
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
                    ? useSharedQuickChat
                      ? 'Tap for player menu'
                      : 'Tap for player menu · Long-press for QuickChat'
                    : useSharedQuickChat
                      ? 'Tap avatar for player menu'
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
              <div className="font-bold truncate leading-tight" style={{ color: isCurrentPlayer ? '#fde68a' : '#e2e8f0', fontSize: POKER_UI_CQW.playerTagName, maxWidth: 96 }}>
                {displayName}
              </div>
              <div
                className="font-bold tabular-nums leading-tight flex items-center justify-center gap-0.5"
                style={{ color: '#fbbf24', fontSize: POKER_UI_CQW.playerTagChips, whiteSpace: 'nowrap' }}
              >
                <AnimatedStackValue value={String(seat.stack ?? '0')} baseColor="#fbbf24" />
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
                fontSize: POKER_UI_CQW.actionRowFont,
                fontWeight: 700,
                letterSpacing: '0.05em',
                borderTop: '1px solid rgba(34,211,238,0.2)',
              }}
            >
              {handName}
            </div>
          )}
          {/* Action / winner indicator.
              Avatar mode: rendered as a pill over the avatar top (see above).
              Compact mode (mobile landscape — avatars are hidden): no avatar to
              anchor to, so render it inside the plate instead. The two are mutually
              exclusive (global hideSeatAvatar), so the test IDs never collide. */}
          {hideSeatAvatar && ((actionStyle && actionLabel) || isHandWinner) && (
            <div className="relative h-[20px] overflow-hidden">
              {isHandWinner ? (
                <div
                  data-testid={`poker-seat-winner-${index}`}
                  className="h-[20px] flex items-center justify-center gap-1 font-bold leading-tight px-2"
                  style={{
                    background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 100%)',
                    color: '#1a1208',
                    fontSize: POKER_UI_CQW.actionPillFont,
                    letterSpacing: '0.04em',
                  }}
                >
                  <Trophy size={10} strokeWidth={2.5} aria-hidden />
                  <span>Winner</span>
                </div>
              ) : (
                <div
                  data-testid={`poker-seat-action-${index}`}
                  className="h-[20px] text-center font-bold px-2 py-0.5 leading-tight break-words text-white"
                  style={{ background: actionStyle!.bg, fontSize: POKER_UI_CQW.actionPillFont }}
                >
                  {actionLabel}
                </div>
              )}
            </div>
          )}
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
