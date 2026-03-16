'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, MessageCircle, Plus } from 'lucide-react';
import AvatarPreview, { type Emotion } from './avatar/AvatarPreview';
import { DEFAULT_AVATAR_CONFIG } from './avatar/CharacterCreator';
import { FloatingDock } from '@/components/ui/floating-dock';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';

/** 9 emotion emojis for quick reaction above player head */
const EMOTION_EMOJIS = ['😀', '😢', '😡', '😂', '🥳', '😎', '😍', '🤔', '🙏'];
const LONG_PRESS_MS = 500;
const EMOJI_OVERLAY_DURATION_MS = 2000;
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
  { title: 'Love',      emotion: 'love'      },
  { title: 'Money',     emotion: 'money'     },
  { title: 'Cool',      emotion: 'cool'      },
  { title: 'Jackpot',   emotion: 'jackpot'   },
  { title: 'Slouch',    emotion: 'slouch'    },
  { title: 'Yawn',      emotion: 'yawn'      },
  { title: 'Bored',     emotion: 'bored'     },
  { title: 'Nod',       emotion: 'nod'       },
  { title: 'Shrug',     emotion: 'shrug'     },
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
  overlayEmoji?: string | null;
  overlayPhrase?: string | null;
  /** Avatar emotion broadcast from server (visible to all players). */
  overlayEmotion?: Emotion | null;
  onEmojiReaction?: (emoji: string) => void;
  onPhraseReaction?: (phrase: string) => void;
  /** Called when current player selects an avatar emotion (broadcast to table). */
  onAnimationReaction?: (emotion: Emotion) => void;
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, winningCardIndices, lastAction, timeLeft, maxTime = 30, chatBubble, onReUpClick, onMenuClick, overlayEmoji: propsOverlayEmoji, overlayPhrase: propsOverlayPhrase, overlayEmotion: propsOverlayEmotion, onEmojiReaction, onPhraseReaction, onAnimationReaction }: PokerSeatProps) {
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
    if (a === 'check' || a === 'call') return 'neutral';
    if (a === 'bet' || a === 'raise' || a === 'all-in' || a === 'allin') return 'angry';
    return 'neutral';
  }, [lastAction]);

  const badgeRef = useRef<HTMLDivElement>(null);

  // Quick menu + emoji + QuickChat (current player only)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayEmoji, setOverlayEmoji] = useState<string | null>(null);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);

  // Avatar animation picker (current player only)
  const [animationPickerOpen, setAnimationPickerOpen] = useState(false);
  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // Active emotion: broadcast (from server) > local (just clicked) > action-driven (fold/raise etc.)
  const activeEmotion: Emotion = propsOverlayEmotion ?? localEmotion ?? avatarEmotion;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const quickMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases();

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
      setQuickMenuOpen(true);
      setEmojiPickerOpen(false);
      setQuickChatPickerOpen(false);
      setAnimationPickerOpen(false);
    }, LONG_PRESS_MS);
  }, [isCurrentPlayer, clearLongPress]);

  const handleBadgePointerUp = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerLeave = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgePointerCancel = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleBadgeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!isCurrentPlayer) return;
    setQuickMenuOpen(true);
    setEmojiPickerOpen(false);
    setQuickChatPickerOpen(false);
    setAnimationPickerOpen(false);
  }, [isCurrentPlayer]);

  const handleAvatarClick = useCallback((e: React.MouseEvent) => {
    if (!isCurrentPlayer) return;
    e.stopPropagation();
    setAnimationPickerOpen(prev => !prev);
    setQuickMenuOpen(false);
    setEmojiPickerOpen(false);
    setQuickChatPickerOpen(false);
  }, [isCurrentPlayer]);

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    setAnimationPickerOpen(false);
    onAnimationReaction?.(emotion);
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => {
      setLocalEmotion(null);
    }, emotion === 'wink' ? 1200 : LOCAL_EMOTION_DURATION_MS);
  }, [onAnimationReaction]);


  const handleEmojiSelect = useCallback((emoji: string) => {
    setEmojiPickerOpen(false);
    setQuickMenuOpen(false);
    if (onEmojiReaction) {
      onEmojiReaction(emoji);
      return;
    }
    setOverlayEmoji(emoji);
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    overlayTimeoutRef.current = setTimeout(() => {
      setOverlayEmoji(null);
      overlayTimeoutRef.current = null;
    }, EMOJI_OVERLAY_DURATION_MS);
  }, [onEmojiReaction]);

  const handleQuickChatSelect = useCallback((phrase: string) => {
    setQuickChatPickerOpen(false);
    setQuickMenuOpen(false);
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

  const emojiDockItems = useMemo(
    () =>
      EMOTION_EMOJIS.map((emoji) => ({
        title: emoji,
        icon: <span className="text-4xl">{emoji}</span>,
        onClick: () => handleEmojiSelect(emoji),
      })),
    [handleEmojiSelect],
  );

  useEffect(() => () => {
    clearLongPress();
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
  }, [clearLongPress]);

  // Close menus when clicking outside
  useEffect(() => {
    const isOpen = quickMenuOpen || emojiPickerOpen || quickChatPickerOpen || animationPickerOpen;
    if (!isOpen || !isCurrentPlayer) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuContainerRef.current?.contains(target) ||
        quickMenuButtonRef.current?.contains(target) ||
        avatarRef.current?.contains(target)
      ) return;
      setQuickMenuOpen(false);
      setEmojiPickerOpen(false);
      setQuickChatPickerOpen(false);
      setAnimationPickerOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isCurrentPlayer, quickMenuOpen, emojiPickerOpen, quickChatPickerOpen, animationPickerOpen]);

  const activeAction =
    lastAction && lastAction.action !== 'blind' ? lastAction.action :
    isFolded ? 'fold' : null;
  const actionStyle = activeAction ? getActionStyle(activeAction) : null;

  const displayEmoji = propsOverlayEmoji != null && propsOverlayEmoji !== '' ? propsOverlayEmoji : overlayEmoji;
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

      {/* Emoji overlay */}
      <AnimatePresence>
        {displayEmoji && (
          <motion.div
            key={displayEmoji}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-40 text-3xl lg:text-5xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          >
            {displayEmoji}
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
            width: showMyCards ? 'clamp(120px, 30vw, 160px)' : 'clamp(84px, 21vw, 110px)',
            height: showMyCards ? 'clamp(72px, 18vw, 96px)' : 'clamp(50px, 12vw, 66px)',
            marginBottom: -55,
            zIndex: 0,
          }}
        >
          {[0, 1].map((ci) => (
            <div
              key={ci}
              className="absolute"
              style={{
                bottom: 0,
                ...(showMyCards
                  ? { width: 'clamp(54px, 13vw, 70px)', height: 'clamp(70px, 17vw, 90px)', [ci === 0 ? 'left' : 'right']: 'clamp(8px, 2vw, 14px)' }
                  : { width: 'clamp(38px, 9vw, 48px)', height: 'clamp(48px, 12vw, 62px)', [ci === 0 ? 'left' : 'right']: 'clamp(4px, 1vw, 8px)' }),
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

      {/* ── Avatar with circular timer + role badges + animation picker ── */}
      <div className="relative flex-shrink-0" style={{ zIndex: 1 }}>

        {/* Animation picker — above avatar, current player only */}
        <AnimatePresence>
          {isCurrentPlayer && animationPickerOpen && (
            <motion.div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50"
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div
                className="grid grid-cols-4 gap-2 p-3 rounded-2xl"
                style={{
                  background: 'rgba(10,10,10,0.97)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                  width: 280,
                }}
              >
                {AVATAR_ANIMATIONS.map(({ title, emotion }) => (
                  <button
                    key={emotion}
                    type="button"
                    onClick={() => handleAnimationSelect(emotion)}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors"
                  >
                    <AvatarPreview
                      config={seat.avatarConfig ?? DEFAULT_AVATAR_CONFIG}
                      emotion={emotion}
                      compact
                      className="w-14 h-14"
                    />
                    <span className="text-[10px] font-medium text-zinc-300 leading-none">{title}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Circular timer ring around avatar */}
        {isActing && timeLeft != null && (
          <CircularTimerRing size={100} timeLeft={timeLeft} maxTime={maxTime} />
        )}

        {/* Avatar circle */}
        <div
          ref={avatarRef}
          className="relative rounded-full overflow-hidden"
          style={{
            width: 100,
            height: 100,
            border: isActing
              ? '2px solid transparent'
              : isCurrentPlayer
                ? '2px solid rgba(251,191,36,0.6)'
                : '2px solid rgba(255,255,255,0.18)',
            background: 'rgba(0,0,0,0.6)',
            cursor: isCurrentPlayer ? 'pointer' : 'default',
            boxShadow: isCurrentPlayer ? '0 0 0 1px rgba(251,191,36,0.15)' : '0 2px 8px rgba(0,0,0,0.6)',
          }}
          onClick={isCurrentPlayer ? handleAvatarClick : undefined}
          title={isCurrentPlayer ? 'Click to animate' : undefined}
        >
          {seat.avatarConfig ? (
            <AvatarPreview
              config={seat.avatarConfig}
              emotion={activeEmotion}
              compact
              trackMouse={isCurrentPlayer}
              forceAsleep={seat.status === 'sitting_out'}
              className="w-full h-full"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center font-bold"
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
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors rounded-full pointer-events-none" />
          )}
        </div>

        {/* Role badges — bottom of avatar */}
        {(seat.isDealer || seat.isSmallBlind || seat.isBigBlind) && (
          <div className="absolute -bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {seat.isDealer     && <RoleToken label="D"  />}
            {seat.isSmallBlind && <RoleToken label="SB" />}
            {seat.isBigBlind   && <RoleToken label="BB" />}
          </div>
        )}
      </div>

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
          {isCurrentPlayer && (quickMenuOpen || emojiPickerOpen || quickChatPickerOpen || animationPickerOpen) && (
            <motion.div
              className="fixed inset-0 z-[45]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                setQuickMenuOpen(false);
                setEmojiPickerOpen(false);
                setQuickChatPickerOpen(false);
                setAnimationPickerOpen(false);
              }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* Quick menu / emoji / quickchat container */}
        <div
          ref={menuContainerRef}
          className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 w-max min-w-[120px]"
        >
          <AnimatePresence>
            {isCurrentPlayer && quickMenuOpen && !emojiPickerOpen && !quickChatPickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                <div
                  className="rounded-lg overflow-hidden min-w-[120px]"
                  style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                >
                  <button type="button" onClick={() => { setQuickMenuOpen(false); setEmojiPickerOpen(true); }}
                    className="w-full px-4 py-2.5 text-sm font-medium text-left hover:bg-white/10 transition-colors flex items-center gap-2"
                    style={{ color: 'var(--poker-text)' }}>
                    <span className="text-lg">😀</span> Emoji
                  </button>
                  <button type="button" onClick={() => { setQuickMenuOpen(false); setQuickChatPickerOpen(true); }}
                    className="font-grandstander w-full px-4 py-2.5 text-sm font-medium text-left hover:bg-white/10 transition-colors flex items-center gap-2"
                    style={{ color: 'var(--poker-text)' }}>
                    <span className="text-lg">💬</span> QuickChat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isCurrentPlayer && emojiPickerOpen && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                <FloatingDock items={emojiDockItems} desktopClassName="!bg-[rgba(10,10,10,0.96)] !border !border-white/10 !shadow-[0_4px_20px_rgba(0,0,0,0.6)] !rounded-xl !px-3 !pb-2.5 !h-16 [&_.rounded-full]:!bg-transparent [&_button]:!bg-transparent [&_a]:!bg-transparent" mobileClassName="[&_button]:!bg-transparent [&_.rounded-full]:!bg-transparent" />
              </motion.div>
            )}
          </AnimatePresence>
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
                  <button type="button" onClick={() => { setQuickChatPickerOpen(false); setEditQuickChatOpen(true); }}
                    className="font-grandstander w-full px-3 py-2.5 text-sm font-medium text-center hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/10"
                    style={{ color: 'var(--poker-text)' }}>
                    <span className="text-cyan-400">✎</span> Edit QuickChat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <EditQuickChatModal open={editQuickChatOpen} onClose={() => setEditQuickChatOpen(false)} selectedPhrases={quickChatPhrases} onSave={setQuickChatPhrases} />

        {/* Buttons row — current player only */}
        {isCurrentPlayer && (
          <div className="flex flex-row items-center justify-center gap-1 mb-1">
            <button type="button" onClick={(e) => { e.stopPropagation(); onMenuClick?.(); }}
              className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/15 transition-all"
              style={{ color: 'var(--poker-text)' }} aria-label="Menu">
              <Menu className="h-3.5 w-3.5" />
            </button>
            {onReUpClick && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onReUpClick(); }}
                className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/15 transition-all"
                style={{ color: 'var(--poker-text)' }} aria-label="Re-up">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button ref={quickMenuButtonRef} type="button"
              onClick={(e) => { e.stopPropagation(); setQuickMenuOpen(true); setEmojiPickerOpen(false); setQuickChatPickerOpen(false); setAnimationPickerOpen(false); }}
              className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/15 transition-all"
              style={{ color: 'var(--poker-text)' }} aria-label="Quick menu">
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Badge — name + chips */}
        <div
          ref={badgeRef}
          role={isCurrentPlayer ? 'button' : undefined}
          aria-label={isCurrentPlayer ? 'Right-click for quick menu' : undefined}
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
            ...(isCurrentPlayer ? { cursor: 'pointer' } : {}),
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
      </div>
    </div>
  );
}
