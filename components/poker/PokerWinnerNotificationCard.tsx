'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardDisplay } from './CardDisplay';

const SHOWDOWN_DURATION_S = 15;

const GOLD = '#c9a34a';
const GOLD_BRIGHT = '#f0d27a';
const GOLD_DEEP = '#8a6a1f';
const FELT_DEEP = '#0a2419';
const FELT_EDGE = '#041510';

export interface PokerWinnerNotificationCardProps {
  isOpen: boolean;
  handId?: string | null;
  winnerName: string;
  winnerAmount: string;
  winnerHandName?: string;
  winnerAddress?: string;
  winnerAvatarUrl?: string | null;
  winnerHoleCards?: number[];
  communityCards?: number[];
  winningCardIndices?: number[];
  splitLabel?: string;
  splitAmount?: string;
  formatChips: (wei: string | number) => string;
}

/**
 * Selects exactly 5 winning cards from hole + community.
 * winningCardIndices are 0-51 card values (not positional). Falls back to hole + first 3 community if incomplete.
 */
function selectWinningFive(
  hole: number[],
  community: number[],
  winningCardIndices: number[],
): number[] {
  const hand = winningCardIndices.filter((c) => typeof c === 'number' && c >= 0 && c <= 51);
  if (hand.length === 5) return hand;
  const pool = [...hole, ...community].filter((c) => typeof c === 'number' && c >= 0 && c <= 51);
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const c of [...hand, ...pool]) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
    if (unique.length === 5) break;
  }
  return unique;
}

export function PokerWinnerNotificationCard({
  isOpen,
  handId,
  winnerName,
  winnerAmount,
  winnerHandName,
  winnerHoleCards = [],
  communityCards = [],
  winningCardIndices = [],
  splitLabel,
  splitAmount,
  formatChips,
}: PokerWinnerNotificationCardProps) {
  const fiveCards = useMemo(
    () => selectWinningFive(winnerHoleCards, communityCards, winningCardIndices),
    [winnerHoleCards, communityCards, winningCardIndices],
  );

  const [countdown, setCountdown] = useState(SHOWDOWN_DURATION_S);
  const [expired, setExpired] = useState(false);
  const prevHandRef = useRef<string | null | undefined>(handId);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(SHOWDOWN_DURATION_S);
      setExpired(false);
      return;
    }
    if (prevHandRef.current !== handId) {
      setCountdown(SHOWDOWN_DURATION_S);
      setExpired(false);
      prevHandRef.current = handId;
    }
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, handId]);

  const showMedallion = isOpen && !expired;

  return (
    <div
      data-testid="poker-winner-banner"
      data-card="poker-winner-notification-card"
      className="absolute inset-0 z-[80] pointer-events-none flex items-center justify-center"
      style={{ top: '41%', height: '22%' }}
    >
      <AnimatePresence>
        {showMedallion && (
          <motion.div
            key={`winner-medallion-${handId}`}
            className="relative flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10, transition: { duration: 0.35, ease: [0.5, 0, 0.75, 0.2] } }}
            transition={{ duration: 0.55, ease: [0.2, 0.9, 0.3, 1.05] }}
          >
            {/* Radial gold aura behind the medallion */}
            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: 520,
                height: 520,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(closest-side, ${GOLD}44 0%, ${GOLD}18 38%, transparent 70%)`,
                filter: 'blur(4px)',
              }}
              animate={{ opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden
            />

            {/* Winning 5-card fan — above medallion */}
            <div className="relative flex items-end justify-center gap-0 mb-1" style={{ minHeight: 96 }}>
              {fiveCards.map((cardIndex, i) => {
                const total = fiveCards.length;
                const mid = (total - 1) / 2;
                const offset = i - mid;
                const rotate = offset * 7;
                const translateY = Math.abs(offset) * 4;
                return (
                  <motion.div
                    key={`winner-card-${i}-${cardIndex}`}
                    className="relative"
                    style={{
                      marginLeft: i === 0 ? 0 : -14,
                      zIndex: 10 + i,
                      transform: `rotate(${rotate}deg) translateY(${translateY}px)`,
                      transformOrigin: 'bottom center',
                      filter: `drop-shadow(0 6px 12px rgba(0,0,0,0.55)) drop-shadow(0 0 10px ${GOLD}66)`,
                    }}
                    initial={{ opacity: 0, y: -40, scale: 0.6, rotate: 0 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate }}
                    transition={{
                      delay: 0.15 + i * 0.08,
                      duration: 0.5,
                      ease: [0.2, 1.0, 0.35, 1.05],
                    }}
                  >
                    <CardDisplay cardIndex={cardIndex} small />
                  </motion.div>
                );
              })}
            </div>

            {/* Medallion body — ornate shield */}
            <div
              className="relative flex flex-col items-center"
              style={{
                width: 340,
                padding: '14px 22px 16px',
                background: `
                  linear-gradient(180deg, ${FELT_DEEP} 0%, ${FELT_EDGE} 100%)
                `,
                border: `1px solid ${GOLD}`,
                borderRadius: 16,
                boxShadow: `
                  0 0 0 2px rgba(0,0,0,0.55),
                  0 0 0 3px ${GOLD_DEEP},
                  0 18px 50px rgba(0,0,0,0.75),
                  inset 0 1px 0 ${GOLD}55,
                  inset 0 -14px 30px rgba(0,0,0,0.6)
                `,
              }}
            >
              {/* Corner gold flourishes */}
              {([
                { top: 6, left: 6, rotate: 0 },
                { top: 6, right: 6, rotate: 90 },
                { bottom: 6, right: 6, rotate: 180 },
                { bottom: 6, left: 6, rotate: 270 },
              ] as const).map((pos, i) => (
                <div
                  key={`flourish-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    ...pos,
                    width: 16,
                    height: 16,
                    background: `linear-gradient(135deg, ${GOLD_BRIGHT} 0%, ${GOLD} 45%, transparent 55%)`,
                    clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                    opacity: 0.85,
                  }}
                  aria-hidden
                />
              ))}

              {/* Top eyebrow: "WINNER" with gold rules */}
              <div className="flex items-center gap-2 mb-1.5 w-full">
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD}aa)` }} />
                <span
                  className="text-[10px] tracking-[0.4em] font-semibold"
                  style={{ color: GOLD_BRIGHT, textShadow: `0 0 8px ${GOLD}88` }}
                >
                  WINNER
                </span>
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD}aa)` }} />
              </div>

              {/* Winner name — serif, large */}
              <div
                className="font-serif text-center leading-none mb-1 truncate max-w-full"
                style={{
                  fontSize: 'clamp(18px, 2.2vw, 24px)',
                  color: '#f7ecc9',
                  textShadow: `0 1px 0 rgba(0,0,0,0.7), 0 0 14px ${GOLD}55`,
                  letterSpacing: '0.02em',
                }}
              >
                {winnerName}
              </div>

              {/* Hand name — italic serif */}
              <div
                className="font-serif italic text-center mb-2.5"
                style={{
                  fontSize: 'clamp(12px, 1.4vw, 14px)',
                  color: GOLD_BRIGHT,
                  opacity: 0.9,
                }}
              >
                {winnerHandName || '—'}
              </div>

              {/* Amount */}
              <div
                className="flex items-center justify-center gap-1.5 mb-2"
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.45)',
                  border: `1px solid ${GOLD}66`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.6)`,
                }}
              >
                <img
                  src="/morbius/MorbiusLogo%20(3).png"
                  alt=""
                  aria-hidden
                  style={{ height: '1.1em', width: 'auto' }}
                />
                <span
                  className="font-jost tabular-nums"
                  style={{
                    fontSize: 'clamp(16px, 1.9vw, 20px)',
                    color: GOLD_BRIGHT,
                    letterSpacing: '-0.01em',
                    textShadow: `0 0 12px ${GOLD}aa`,
                  }}
                >
                  +{formatChips(winnerAmount)}
                </span>
              </div>

              {/* Split pot sub-line */}
              {splitLabel && splitAmount && (
                <div
                  className="flex items-center justify-between gap-2 w-full px-2 py-1 mb-1.5 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${GOLD}33` }}
                >
                  <span className="font-jost-normal text-[11px] truncate" style={{ color: '#d9cba1' }}>
                    {splitLabel}
                  </span>
                  <span className="font-jost text-[11px] tabular-nums shrink-0" style={{ color: GOLD_BRIGHT }}>
                    {splitAmount}
                  </span>
                </div>
              )}

              {/* Gold hairline countdown — bottom edge */}
              <div
                className="absolute left-3 right-3 overflow-hidden"
                style={{ bottom: 4, height: 1.5, borderRadius: 1 }}
              >
                <motion.div
                  className="h-full"
                  style={{
                    background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD_BRIGHT}, ${GOLD_DEEP})`,
                    boxShadow: `0 0 6px ${GOLD}aa`,
                  }}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: SHOWDOWN_DURATION_S, ease: 'linear' }}
                />
              </div>
            </div>

            {/* Countdown label — subtle, below */}
            <div
              className="mt-1.5 font-jost-normal text-[9px] tracking-[0.25em] tabular-nums"
              style={{ color: `${GOLD}dd`, opacity: 0.7 }}
            >
              NEXT HAND · {countdown}s
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
