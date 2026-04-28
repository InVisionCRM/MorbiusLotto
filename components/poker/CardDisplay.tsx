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
const SUIT_LETTERS = ['C', 'D', 'H', 'S'];
/** Unicode suit symbols in same order as SUIT_NAMES / floor(idx/13) */
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;

/**
 * Human-readable rank + suit for a 0–51 `cardIndex` (matches server `cardToInt` encoding).
 * Returns empty string for invalid indices.
 */
export function formatPokerCardIndexLabel(cardIndex: number): string {
  if (cardIndex < 0 || cardIndex > 51) return '';
  return `${RANK_NAMES[cardIndex % 13]}${SUIT_SYMBOLS[Math.floor(cardIndex / 13)]}`;
}

/** Suit band index 0–3 for coloring label text (clubs / diamonds / hearts / spades). */
export function pokerCardSuitIndex(cardIndex: number): number | null {
  if (cardIndex < 0 || cardIndex > 51) return null;
  return Math.floor(cardIndex / 13);
}

function getCardAlt(cardIndex: number): string {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`;
}

function getCardImageSrc(cardIndex: number): string {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return `/BlackJack/Cards/PNG/${RANK_NAMES[rank]}${SUIT_LETTERS[suit]}.png`;
}

export interface CardDisplayProps {
  /** Card index 0-51. If null/undefined, show placeholder slot. */
  cardIndex: number | null | undefined;
  /** Smaller card for board/opponent */
  small?: boolean;
  /** Show card back (for opponent hole cards) */
  faceDown?: boolean;
  /** At showdown: highlight this card as part of the winning hand (brightness boost). */
  isWinningCard?: boolean;
  /** At showdown: dim this card because it is not part of the winning hand. */
  isDimmed?: boolean;
  className?: string;
  /** Stagger delay in seconds for deal animation */
  dealDelay?: number;
  /** @deprecated No longer needed — cards are now pure CSS. Kept for API compat. */
  showCenterRankSuitOverlay?: boolean;
  /** Per-role animation preset. Omit for default spring behavior. */
  variant?: 'hole' | 'community';
  /**
   * Pixel offset from the deal origin (pot / deck center) to the card's final position.
   * Card animates in from `(dx, dy)` → `(0, 0)` and exits back to `(dx, dy)`.
   * When omitted, falls back to a fixed offset (`x: -80` for hole, `y: -70` for community).
   */
  dealFromOffset?: { dx: number; dy: number };
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
 * Spin Pitch — hole cards spin in from the pot (deck) and land at their seat position.
 * When no offset is provided, falls back to a fixed left-slide (legacy behavior).
 */
const makeHoleVariants = (dx: number, dy: number): Variants => ({
  hidden: { opacity: 0, x: dx, y: dy, rotate: -360, scale: 0.7 },
  visible: (delay: number) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: { delay, duration: 0.55, ease: [0.25, 0.85, 0.3, 1] },
  }),
  exit: {
    opacity: 0,
    x: dx,
    y: dy,
    rotate: 360,
    scale: 0.7,
    transition: { duration: 0.45, ease: [0.5, 0, 0.75, 0.25] },
  },
});

/**
 * Shockwave Slam — community cards launch from the pot and slam into their board slot.
 * When no offset is provided, falls back to dropping from above (legacy behavior).
 */
const makeCommunityVariants = (dx: number, dy: number): Variants => ({
  hidden: { opacity: 0, x: dx, y: dy, scale: 0.5 },
  visible: (delay: number) => ({
    opacity: 1,
    x: [dx, 0, 0],
    y: [dy, 0, 0],
    scale: [0.5, 1.12, 1],
    transition: { delay, duration: 0.6, ease: [0.2, 1.1, 0.4, 1], times: [0, 0.7, 1] },
  }),
  exit: {
    opacity: 0,
    x: dx,
    y: dy,
    scale: 0.9,
    transition: { duration: 0.25, ease: 'easeIn' },
  },
});

export function CardDisplay({
  cardIndex,
  small,
  faceDown,
  isWinningCard,
  isDimmed,
  className = '',
  dealDelay = 0,
  variant,
  dealFromOffset,
}: CardDisplayProps) {
  const { dx, dy } = dealFromOffset ?? { dx: variant === 'community' ? 0 : -80, dy: variant === 'community' ? -70 : 0 };
  const activeVariants =
    ENABLE_POKER_ANIMS && variant === 'hole'
      ? makeHoleVariants(dx, dy)
      : ENABLE_POKER_ANIMS && variant === 'community'
      ? makeCommunityVariants(dx, dy)
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

  const cardImageSrc = isFaceUp ? getCardImageSrc(cardIndex!) : '';

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
            boxShadow: isWinningCard
              ? `${cardShadow}, 0 12px 28px rgba(0,0,0,0.6), 0 0 22px rgba(255, 245, 200, 0.35)`
              : cardShadow,
            transformStyle: 'preserve-3d',
            filter: isWinningCard
              ? 'brightness(1.18) saturate(1.12)'
              : isDimmed
              ? 'brightness(0.45) saturate(0.7)'
              : undefined,
            zIndex: isWinningCard ? 30 : undefined,
          }}
          transition={hasExit ? undefined : {
            delay: dealDelay,
            type: 'spring',
            stiffness: 260,
            damping: 18,
          }}
          aria-label={getCardAlt(cardIndex!)}
        >
          <Image
            src={cardImageSrc}
            alt={getCardAlt(cardIndex!)}
            width={imageSize.width}
            height={imageSize.height}
            className="w-full h-full object-contain"
            priority
          />
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: innerGlow }} />
        </motion.div>
      )}
    </div>
  );
}
