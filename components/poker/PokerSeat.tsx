'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, MessageCircle, Plus } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';

/** 9 emotion emojis for quick reaction above player head */
const EMOTION_EMOJIS = ['😀', '😢', '😡', '😂', '🥳', '😎', '😍', '🤔', '🙏'];
const LONG_PRESS_MS = 500;
const EMOJI_OVERLAY_DURATION_MS = 2000;
const PHRASE_OVERLAY_DURATION_MS = 2000;

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

// ── Timer ring SVG ─────────────────────────────────────────────────────────

function TimerRingSVG({ w, h, timeLeft, maxTime }: { w: number; h: number; timeLeft: number; maxTime: number }) {
  const pad = 3;
  const W   = w + pad * 2;
  const H   = h + pad * 2;
  const r   = 8; // slightly larger than badge border-radius 5

  // Perimeter of the rounded rectangle
  const perimeter = 2 * (W - 2 * r) + 2 * (H - 2 * r) + 2 * Math.PI * r;

  const progress   = Math.max(0, Math.min(1, timeLeft / maxTime));
  const visibleLen = progress * perimeter;

  // Green (hsl 120) → yellow (60) → red (0)
  const hue   = progress * 120;
  const color = `hsl(${hue}, 90%, 52%)`;

  // Clockwise rounded-rect path starting from top-left corner
  const path = [
    `M ${r},0`,
    `H ${W - r}`,
    `A ${r},${r} 0 0 1 ${W},${r}`,
    `V ${H - r}`,
    `A ${r},${r} 0 0 1 ${W - r},${H}`,
    `H ${r}`,
    `A ${r},${r} 0 0 1 0,${H - r}`,
    `V ${r}`,
    `A ${r},${r} 0 0 1 ${r},0`,
  ].join(' ');

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        left: -pad,
        top: -pad,
        width: W,
        height: H,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'visible',
      }}
    >
      {/* Dim track */}
      <path d={path} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={2} />
      {/* Animated progress ring */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${visibleLen} ${perimeter}`}
        style={{
          filter: `drop-shadow(0 0 4px ${color})`,
          transition: 'stroke-dasharray 1s linear, stroke 0.5s ease',
        }}
      />
    </svg>
  );
}

// ── PokerSeat ─────────────────────────────────────────────────────────────

export interface PokerSeatProps {
  seat: SeatState;
  index: number;
  holeCards?: number[];
  isCurrentPlayer?: boolean;
  showCardBacks?: boolean;
  lastAction?: { action: string; amount: string } | null;
  timeLeft?: number;
  maxTime?: number;
  /** Chat message to show above this seat for a few seconds (table chat bubble). */
  chatBubble?: string | null;
  /** When set, current player sees a + (re-up) button that calls this. */
  onReUpClick?: () => void;
  /** When set, current player sees a hamburger menu button on the right that calls this. */
  onMenuClick?: () => void;
  /** Emoji to show above this seat (from broadcast; overrides local when set). */
  overlayEmoji?: string | null;
  /** Phrase to show above this seat (from broadcast; overrides local when set). */
  overlayPhrase?: string | null;
  /** When set, current player's emoji selection is sent to table (public). */
  onEmojiReaction?: (emoji: string) => void;
  /** When set, current player's phrase selection is sent to table (public). */
  onPhraseReaction?: (phrase: string) => void;
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, lastAction, timeLeft, maxTime = 30, chatBubble, onReUpClick, onMenuClick, overlayEmoji: propsOverlayEmoji, overlayPhrase: propsOverlayPhrase, onEmojiReaction, onPhraseReaction }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = !!(holeCards && holeCards.length > 0);
  const showBacks   = !!(showCardBacks && !showMyCards && !empty && !seat.folded);
  const hasCards    = showMyCards || showBacks;

  const isActing  = !!seat.isActing && !empty && !seat.folded;
  const isFolded  = !!seat.folded && !empty;

  const displayName = empty ? 'Open' : (isCurrentPlayer ? 'You' : shortAddr(seat.playerAddress!));

  // Measure badge for timer ring
  const badgeRef = useRef<HTMLDivElement>(null);
  const [badgeSize, setBadgeSize] = useState({ w: 90, h: 50 });
  useEffect(() => {
    const el = badgeRef.current;
    if (!el) return;
    const update = () => setBadgeSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quick menu + emoji + QuickChat (current player only): long-press badge → menu → emoji or QuickChat → show above head 2s
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayEmoji, setOverlayEmoji] = useState<string | null>(null);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);
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
  }, [isCurrentPlayer]);

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
  }, [clearLongPress]);

  // Close menu when clicking outside (backdrop is clipped by seat transform, so use document click)
  useEffect(() => {
    const isOpen = quickMenuOpen || emojiPickerOpen || quickChatPickerOpen;
    if (!isOpen || !isCurrentPlayer) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuContainerRef.current?.contains(target) || quickMenuButtonRef.current?.contains(target)) return;
      setQuickMenuOpen(false);
      setEmojiPickerOpen(false);
      setQuickChatPickerOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isCurrentPlayer, quickMenuOpen, emojiPickerOpen, quickChatPickerOpen]);

  // Resolve active action for color-coded label
  const activeAction =
    lastAction && lastAction.action !== 'blind' ? lastAction.action :
    isFolded ? 'fold' : null;
  const actionStyle = activeAction ? getActionStyle(activeAction) : null;

  /** Display overlay from props (broadcast) when set, else local state (demo/fallback). */
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
      {/* Table chat bubble — above seat, 5s then cleared by parent */}
      <AnimatePresence>
        {chatBubble && chatBubble.trim() && (
          <motion.div
            key={chatBubble}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-30"
            style={{
              maxWidth: 'min(160px, 42vw)',
              minWidth: 48,
            }}
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

      {/* Quick-reaction emoji overlay — above head, 2s (from broadcast or local) */}
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

      {/* QuickChat phrase overlay — above head, 2s (from broadcast or local) */}
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

      {/* Fanned hole cards */}
      {hasCards ? (
        <div
          className="relative"
          style={
            showMyCards
              ? { width: 'clamp(76px, 20vw, 110px)', height: 'clamp(92px, 24vw, 124px)' }
              : { width: 'clamp(48px, 14vw, 58px)',  height: 'clamp(58px, 16vw, 72px)' }
          }
        >
          {[0, 1].map((ci) => (
            <div
              key={ci}
              className="absolute"
              style={{
                bottom: 0,
                [ci === 0 ? 'left' : 'right']: 0,
                zIndex: ci + 1,
                transform: `rotate(${ci === 0 ? -10 : 10}deg)`,
                transformOrigin: 'bottom center',
                filter: isFolded ? 'grayscale(1) opacity(0.5)' : undefined,
              }}
            >
              {showMyCards
                ? <CardDisplay cardIndex={holeCards![ci]} />
                : <CardDisplay cardIndex={null} small faceDown />}
            </div>
          ))}
          {isActing && (
            <div
              className="pointer-events-none absolute -inset-2 rounded-full blur-md opacity-50 animate-pulse"
              style={{ background: 'radial-gradient(circle, var(--poker-accent-muted), transparent 70%)' }}
              aria-hidden
            />
          )}
        </div>
      ) : (
        <div style={{ width: 38, height: 48 }} aria-hidden />
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

      {/* ── Player badge ── */}
      <div style={{ position: 'relative', display: 'inline-block' }}>

        {/* Timer ring — wraps badge perimeter */}
        {isActing && timeLeft != null && (
          <TimerRingSVG w={badgeSize.w} h={badgeSize.h} timeLeft={timeLeft} maxTime={maxTime} />
        )}

        {/* Role tokens — top-right corner overhang */}
        {(seat.isDealer || seat.isSmallBlind || seat.isBigBlind) && (
          <div style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {seat.isDealer     && <RoleToken label="D"  />}
            {seat.isSmallBlind && <RoleToken label="SB" />}
            {seat.isBigBlind   && <RoleToken label="BB" />}
          </div>
        )}

        {/* Backdrop to close quick menu / emoji picker / QuickChat picker when clicking outside */}
        <AnimatePresence>
          {isCurrentPlayer && (quickMenuOpen || emojiPickerOpen || quickChatPickerOpen) && (
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
              }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* Quick menu, emoji picker, QuickChat picker — wrapper ref for outside-click close */}
        <div
          ref={menuContainerRef}
          className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 w-max min-w-[120px]"
        >
          {/* Quick menu (long-press on badge when current player) */}
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
                  style={{
                    background: 'rgba(10,10,10,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setQuickMenuOpen(false); setEmojiPickerOpen(true); }}
                    className="w-full px-4 py-2.5 text-sm font-medium text-left hover:bg-white/10 transition-colors flex items-center gap-2"
                    style={{ color: 'var(--poker-text)' }}
                    aria-label="Emoji"
                  >
                    <span className="text-lg">😀</span>
                    Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQuickMenuOpen(false); setQuickChatPickerOpen(true); }}
                    className="font-grandstander w-full px-4 py-2.5 text-sm font-medium text-left hover:bg-white/10 transition-colors flex items-center gap-2"
                    style={{ color: 'var(--poker-text)' }}
                    aria-label="QuickChat"
                  >
                    <span className="text-lg">💬</span>
                    QuickChat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 9 emotion emojis picker — floating dock */}
          <AnimatePresence>
            {isCurrentPlayer && emojiPickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                <FloatingDock
                  items={emojiDockItems}
                  desktopClassName="!bg-[rgba(10,10,10,0.96)] !border !border-white/10 !shadow-[0_4px_20px_rgba(0,0,0,0.6)] !rounded-xl !px-3 !pb-2.5 !h-16 [&_.rounded-full]:!bg-transparent [&_button]:!bg-transparent [&_a]:!bg-transparent"
                  mobileClassName="[&_button]:!bg-transparent [&_.rounded-full]:!bg-transparent"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* QuickChat phrase picker — current phrases + Edit QuickChat */}
          <AnimatePresence>
            {isCurrentPlayer && quickChatPickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                <div
                  className="rounded-xl overflow-hidden max-h-[min(280px,60vh)] overflow-y-auto min-w-[160px] max-w-[220px]"
                  style={{
                    background: 'rgba(10,10,10,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  }}
                >
                  {quickChatPhrases.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => handleQuickChatSelect(phrase)}
                      className="font-grandstander w-full px-3 py-2 text-sm text-center hover:bg-white/10 transition-colors truncate"
                      style={{ color: 'var(--poker-text)' }}
                    >
                      {phrase}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setQuickChatPickerOpen(false);
                      setEditQuickChatOpen(true);
                    }}
                    className="font-grandstander w-full px-3 py-2.5 text-sm font-medium text-center hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/10"
                    style={{ color: 'var(--poker-text)' }}
                    aria-label="Edit QuickChat"
                  >
                    <span className="text-cyan-400">✎</span>
                    Edit QuickChat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <EditQuickChatModal
          open={editQuickChatOpen}
          onClose={() => setEditQuickChatOpen(false)}
          selectedPhrases={quickChatPhrases}
          onSave={setQuickChatPhrases}
        />

        <div
          ref={badgeRef}
          role={isCurrentPlayer ? 'button' : undefined}
          aria-label={isCurrentPlayer ? 'Press and hold or right-click for quick menu' : undefined}
          title={isCurrentPlayer ? 'Hold or right-click for quick menu' : undefined}
          onPointerDown={isCurrentPlayer ? handleBadgePointerDown : undefined}
          onPointerUp={isCurrentPlayer ? handleBadgePointerUp : undefined}
          onPointerLeave={isCurrentPlayer ? handleBadgePointerLeave : undefined}
          onPointerCancel={isCurrentPlayer ? handleBadgePointerCancel : undefined}
          onContextMenu={isCurrentPlayer ? handleBadgeContextMenu : undefined}
          className="relative flex flex-col items-stretch overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.88)',
            border: `1px solid ${
              isActing        ? 'transparent'               :
              isCurrentPlayer ? 'rgba(251,191,36,0.5)'      :
                                'rgba(255,255,255,0.12)'
            }`,
            borderRadius: 6,
            minWidth: isCurrentPlayer ? 138 : 88,
            boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
            ...(isCurrentPlayer ? { cursor: 'pointer' } : {}),
          }}
        >
          {/* Hamburger, Re-up (+), Quick menu (chat) — left of nametag, vertically centered (current player only) */}
          {isCurrentPlayer && (
            <div className="absolute left-0.5 top-1/2 z-10 flex -translate-y-1/2 flex-row items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuClick?.();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs opacity-90 hover:opacity-100 hover:bg-white/15 transition-all"
                style={{ color: 'var(--poker-text)' }}
                aria-label="Menu"
                title="Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              {onReUpClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReUpClick();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-xs opacity-90 hover:opacity-100 hover:bg-white/15 transition-all"
                  style={{ color: 'var(--poker-text)' }}
                  aria-label="Re-up"
                  title="Re-up"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
              <button
                ref={quickMenuButtonRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickMenuOpen(true);
                  setEmojiPickerOpen(false);
                  setQuickChatPickerOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs opacity-90 hover:opacity-100 hover:bg-white/15 transition-all"
                style={{ color: 'var(--poker-text)' }}
                aria-label="Open quick menu"
                title="Quick menu"
              >
                <MessageCircle className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Name + stack — extra left padding when current player so content clears the buttons */}
          <div className={`py-1.5 sm:py-1 text-center ${isCurrentPlayer ? 'pl-[7rem] pr-2.5 sm:pl-[7rem] sm:pr-2' : 'px-2.5 sm:px-2'}`}>
            <div
              className="font-bold truncate leading-tight"
              style={{
                color: isCurrentPlayer ? '#fde68a' : '#e2e8f0',
                fontSize: isCurrentPlayer ? 'clamp(11px, 2vw, 13px)' : 'clamp(12px, 2.5vw, 14px)',
                maxWidth: isCurrentPlayer ? 96 : 110,
              }}
            >
              {displayName}
            </div>
            <div
              className="font-bold tabular-nums leading-tight flex items-center justify-center gap-1"
              style={{
                color: '#fbbf24',
                fontSize: isCurrentPlayer ? 'clamp(11px, 2.2vw, 13px)' : 'clamp(12px, 2.5vw, 14px)',
              }}
            >
              {formatChips(seat.stack)}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/morbius/MorbiusLogo%20(3).png"
                alt=""
                aria-hidden
                className="shrink-0"
                style={{ height: '1em', width: 'auto', verticalAlign: 'middle' }}
              />
            </div>
          </div>

          {/* Color-coded action label */}
          <AnimatePresence mode="wait">
            {actionStyle && (
              <motion.div
                key={activeAction}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div
                  className="text-center font-bold uppercase tracking-widest py-0.5 sm:py-0.5"
                  style={{ background: actionStyle.bg, color: '#fff', fontSize: 'clamp(9px, 1.6vw, 10px)' }}
                >
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
