'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';
import { motion, AnimatePresence } from 'framer-motion';

/** 9 emotion emojis for quick reaction above player head */
const EMOTION_EMOJIS = ['😀', '😢', '😡', '😂', '🥳', '😎', '😍', '🤔', '🙏'];
const LONG_PRESS_MS = 500;
const EMOJI_OVERLAY_DURATION_MS = 2000;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
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
  try { amount = Number(formatEther(BigInt(weiAmount))); } catch {}
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
}

const CHAT_BUBBLE_MAX_LENGTH = 80;

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, lastAction, timeLeft, maxTime = 30, chatBubble }: PokerSeatProps) {
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

  // Quick menu + emoji (current player only): long-press badge → menu → 9 emojis → show above head 2s
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [overlayEmoji, setOverlayEmoji] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [isCurrentPlayer]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setOverlayEmoji(emoji);
    setEmojiPickerOpen(false);
    setQuickMenuOpen(false);
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    overlayTimeoutRef.current = setTimeout(() => {
      setOverlayEmoji(null);
      overlayTimeoutRef.current = null;
    }, EMOJI_OVERLAY_DURATION_MS);
  }, []);

  useEffect(() => () => {
    clearLongPress();
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
  }, [clearLongPress]);

  // Resolve active action for color-coded label
  const activeAction =
    lastAction && lastAction.action !== 'blind' ? lastAction.action :
    isFolded ? 'fold' : null;
  const actionStyle = activeAction ? getActionStyle(activeAction) : null;

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

      {/* Quick-reaction emoji overlay — above head, xl on min / 3xl on max, 2s */}
      <AnimatePresence>
        {overlayEmoji && (
          <motion.div
            key={overlayEmoji}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-40 text-xl lg:text-3xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          >
            {overlayEmoji}
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

        {/* Backdrop to close quick menu / emoji picker when clicking outside */}
        <AnimatePresence>
          {isCurrentPlayer && (quickMenuOpen || emojiPickerOpen) && (
            <motion.div
              className="fixed inset-0 z-[45]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => { setQuickMenuOpen(false); setEmojiPickerOpen(false); }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* Quick menu (long-press on badge when current player) */}
        <AnimatePresence>
          {isCurrentPlayer && quickMenuOpen && !emojiPickerOpen && (
            <motion.div
              className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50"
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
                >
                  <span className="text-lg">😀</span>
                  Emoji
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 9 emotion emojis picker */}
        <AnimatePresence>
          {isCurrentPlayer && emojiPickerOpen && (
            <motion.div
              className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div
                className="rounded-xl p-2 grid grid-cols-3 gap-1.5"
                style={{
                  background: 'rgba(10,10,10,0.96)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                }}
              >
                {EMOTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiSelect(emoji)}
                    className="w-12 h-12 lg:w-14 lg:h-14 flex items-center justify-center text-2xl lg:text-3xl rounded-lg hover:bg-white/15 active:scale-95 transition-all"
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={badgeRef}
          role={isCurrentPlayer ? 'button' : undefined}
          aria-label={isCurrentPlayer ? 'Press and hold or right-click for quick menu' : undefined}
          title={isCurrentPlayer ? 'Hold or right-click for emoji menu' : undefined}
          onPointerDown={isCurrentPlayer ? handleBadgePointerDown : undefined}
          onPointerUp={isCurrentPlayer ? handleBadgePointerUp : undefined}
          onPointerLeave={isCurrentPlayer ? handleBadgePointerLeave : undefined}
          onPointerCancel={isCurrentPlayer ? handleBadgePointerCancel : undefined}
          onContextMenu={isCurrentPlayer ? handleBadgeContextMenu : undefined}
          className="flex flex-col items-stretch overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.88)',
            border: `1px solid ${
              isActing        ? 'transparent'               :
              isCurrentPlayer ? 'rgba(251,191,36,0.5)'      :
                                'rgba(255,255,255,0.12)'
            }`,
            borderRadius: 6,
            minWidth: isCurrentPlayer ? 98 : 88,
            boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
            ...(isCurrentPlayer ? { cursor: 'pointer' } : {}),
          }}
        >
          {/* Name + stack */}
          <div className="px-2.5 py-1.5 sm:px-2 sm:py-1 text-center">
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
              className="font-bold tabular-nums leading-tight"
              style={{
                color: '#fbbf24',
                fontSize: isCurrentPlayer ? 'clamp(11px, 2.2vw, 13px)' : 'clamp(12px, 2.5vw, 14px)',
              }}
            >
              ${formatChips(seat.stack)}
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
