'use client';

import React from 'react';
import Image from 'next/image';
import { motion, type Variants } from 'framer-motion';

/**
 * Feature flag for enhanced per-role card animations.
 * - 'hole' = Spin Pitch (spin + slide in, simple slide-down on fold/leave)
 * - 'community' = Shockwave Slam (drop + overshoot + glow pulse, fade-collapse out)
 * Flip off to revert to the prior spring deal-in for everything.
 */
const ENABLE_POKER_ANIMS = true;

/** Card index 0-51: rank = (idx % 13), suit = floor(idx/13) — matches server cardToInt encoding */
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

function getCardAlt(cardIndex: number): string {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`;
}

export interface CardDisplayProps {
  /** Card index 0-51. If null/undefined, show placeholder slot. */
  cardIndex: number | null | undefined;
  /** Smaller card for board/opponent */
  small?: boolean;
  /** Show card back (for opponent hole cards) */
  faceDown?: boolean;
  /** At showdown: highlight this card as part of the winning hand (cyan border) */
  isWinningCard?: boolean;
  className?: string;
  /** Stagger delay in seconds for deal animation */
  dealDelay?: number;
  /** @deprecated No longer needed — cards are now pure CSS. Kept for API compat. */
  showCenterRankSuitOverlay?: boolean;
  /** Per-role animation preset. Omit for default spring behavior. */
  variant?: 'hole' | 'community';
}

const dealVariants = {
  hidden: { opacity: 0, scale: 0.92, rotateX: 12 },
  visible: (delay: number) => ({
    opacity: 1,
    scale: 1,
    rotateX: 0,
    transition: {
      delay,
      type: 'spring' as const,
      stiffness: 220,
      damping: 18,
    },
  }),
};

/**
 * Spin Pitch — hole cards spin in from center-left with a full rotation and slight scale.
 * Exit "fold" = reverse Spin Pitch: spin back toward the dealer (mucked).
 */
const holeVariants: Variants = {
  hidden: { opacity: 0, x: -80, rotate: -360, scale: 0.7 },
  visible: (delay: number) => ({
    opacity: 1,
    x: 0,
    rotate: 0,
    scale: 1,
    transition: { delay, duration: 0.55, ease: [0.25, 0.85, 0.3, 1] },
  }),
  exit: {
    opacity: 0,
    x: -80,
    rotate: 360,
    scale: 0.7,
    transition: { duration: 0.45, ease: [0.5, 0, 0.75, 0.25] },
  },
};

/**
 * Shockwave Slam — community cards drop in from above with overshoot + glow pulse.
 * Exit = simple fade + slight scale-down so a board-clear doesn't pop.
 */
const communityVariants: Variants = {
  hidden: { opacity: 0, y: -70, scale: 0.5 },
  visible: (delay: number) => ({
    opacity: 1,
    y: [-70, 8, 0],
    scale: [0.5, 1.12, 1],
    transition: { delay, duration: 0.6, ease: [0.2, 1.1, 0.4, 1], times: [0, 0.7, 1] },
  }),
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 10,
    transition: { duration: 0.25, ease: 'easeIn' },
  },
};

function getSuitSymbol(suit: number): string {
  switch (suit) {
    case 0:
      return '♣';
    case 1:
      return '♦';
    case 2:
      return '♥';
    default:
      return '♠';
  }
}

function getSuitColor(suit: number): string {
  return suit === 1 || suit === 2 ? '#dc2626' : '#111827';
}

export function CardDisplay({
  cardIndex,
  small,
  faceDown,
  isWinningCard,
  className = '',
  dealDelay = 0,
  variant,
}: CardDisplayProps) {
  const activeVariants =
    ENABLE_POKER_ANIMS && variant === 'hole'
      ? holeVariants
      : ENABLE_POKER_ANIMS && variant === 'community'
      ? communityVariants
      : dealVariants;
  const hasExit = ENABLE_POKER_ANIMS && (variant === 'hole' || variant === 'community');
  const sizeClasses = small
    ? 'w-10 h-14 sm:w-11 sm:h-[62px] md:w-12 md:h-[68px] lg:w-14 lg:h-20 xl:w-16 xl:h-[88px]'
    : 'w-14 h-20 sm:w-16 sm:h-24 lg:w-[72px] lg:h-[100px] xl:w-20 xl:h-28';

  const imageSize = { width: 80, height: 112 };

  const cardShadow = '0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)';
  const innerGlow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15)';

  const isFaceDown = faceDown || (cardIndex != null && (cardIndex < 0 || cardIndex > 51));
  const isEmpty = !isFaceDown && cardIndex == null;
  const isFaceUp = !isFaceDown && !isEmpty;

  const rank = isFaceUp ? (cardIndex! % 13) : 0;
  const suit = isFaceUp ? Math.floor(cardIndex! / 13) : 0;
  const color = getSuitColor(suit);
  const suitChar = getSuitSymbol(suit);
  const rankLabel = RANK_NAMES[rank];

  return (
    <div className={`poker-card-wrapper ${className}`} style={{ perspective: 600 }}>
      {isFaceDown && (
        <motion.div
          key="face-down"
          variants={activeVariants}
          initial="hidden"
          animate="visible"
          exit={hasExit ? 'exit' : undefined}
          custom={dealDelay}
          className={`relative ${sizeClasses} overflow-hidden`}
          style={{ boxShadow: cardShadow, transformStyle: 'preserve-3d' }}
        >
          <div className="absolute inset-0 bg-slate-900 overflow-hidden">
            <Image
              src="/Pulse Branding/Logo/ball.png"
              alt="Card back"
              width={imageSize.width}
              height={imageSize.height}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: innerGlow }} />
        </motion.div>
      )}

      {isEmpty && (
        <div
          className={`relative ${sizeClasses} border border-white/10`}
          style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.6), rgba(15,23,42,0.3))',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
            opacity: 0.05,
          }}
        />
      )}

      {isFaceUp && (
        <motion.div
          key={`card-${cardIndex}`}
          variants={activeVariants}
          initial="hidden"
          animate={hasExit ? 'visible' : {
            opacity: 1,
            scale: isWinningCard ? 1.08 : 1,
            rotateX: 0,
          }}
          exit={hasExit ? 'exit' : undefined}
          custom={dealDelay}
          className={`relative ${sizeClasses} overflow-hidden rounded-md select-none`}
          style={{
            background: 'linear-gradient(160deg, #ffffff 0%, #f8f8f8 50%, #f0f0f0 100%)',
            boxShadow: isWinningCard
              ? `${cardShadow}, 0 10px 24px rgba(0,0,0,0.55), 0 0 0 4px rgba(34, 211, 238, 0.95), 0 0 26px rgba(34, 211, 238, 0.55)`
              : cardShadow,
            transformStyle: 'preserve-3d',
          }}
          transition={hasExit ? undefined : {
            delay: dealDelay,
            type: 'spring',
            stiffness: 260,
            damping: 18,
          }}
          aria-label={getCardAlt(cardIndex!)}
        >
          {/* Top-left rank + suit */}
          <div
            className="absolute flex flex-col items-center leading-none font-bold"
            style={{
              color,
              top: '4%',
              left: '8%',
              fontSize: small ? 'clamp(8px, 1.6vw, 12px)' : 'clamp(11px, 2vw, 16px)',
              lineHeight: 1,
            }}
          >
            <span>{rankLabel}</span>
            <span style={{ fontSize: '0.85em', marginTop: '0.05em' }}>{suitChar}</span>
          </div>

          {/* Center suit */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              color,
              fontSize: small ? 'clamp(16px, 3.2vw, 28px)' : 'clamp(22px, 4vw, 40px)',
            }}
          >
            <span>{suitChar}</span>
          </div>

          {/* Bottom-right rank + suit (rotated) */}
          <div
            className="absolute flex flex-col items-center leading-none font-bold"
            style={{
              color,
              bottom: '4%',
              right: '8%',
              fontSize: small ? 'clamp(8px, 1.6vw, 12px)' : 'clamp(11px, 2vw, 16px)',
              lineHeight: 1,
              transform: 'rotate(180deg)',
            }}
          >
            <span>{rankLabel}</span>
            <span style={{ fontSize: '0.85em', marginTop: '0.05em' }}>{suitChar}</span>
          </div>

          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: innerGlow }} />
          {isWinningCard && (
            <div
              className="absolute inset-0 pointer-events-none rounded-md"
              style={{
                boxShadow: 'inset 0 0 0 2px rgba(34, 211, 238, 0.55)',
              }}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}
