'use client';

import React from 'react';
import Image from 'next/image';

/** Card index 0-51: rank = (idx % 13), suit = floor(idx/13) */
const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_LETTERS = ['H', 'D', 'C', 'S'];
const SUIT_NAMES = ['hearts', 'diamonds', 'clubs', 'spades'];

function getCardImagePath(cardIndex: number): string {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return `/BlackJack/Cards/PNG/${RANK_NAMES[rank]}${SUIT_LETTERS[suit]}.png`;
}

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
  className?: string;
}

export function CardDisplay({ cardIndex, small, faceDown, className = '' }: CardDisplayProps) {
  const sizeClasses = small
    ? 'w-7 h-10 sm:w-10 sm:h-14 md:w-12 md:h-[68px] lg:w-14 lg:h-20 xl:w-16 xl:h-[88px]'
    : 'w-12 h-[68px] sm:w-14 sm:h-20 lg:w-16 lg:h-24 xl:w-20 xl:h-28';

  const imageSize = small
    ? { width: 80, height: 112 }
    : { width: 80, height: 112 };

  const cardShadow = '0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)';
  const innerGlow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15)';

  const isFaceDown = faceDown || (cardIndex != null && (cardIndex < 0 || cardIndex > 51));
  const isEmpty = !isFaceDown && cardIndex == null;
  const isFaceUp = !isFaceDown && !isEmpty;

  return (
    <div className={`poker-card-wrapper ${className}`}>
      {isFaceDown && (
        <div
          className={`poker-card-deal relative ${sizeClasses} overflow-hidden`}
          style={{ boxShadow: cardShadow }}
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
        </div>
      )}

      {isEmpty && (
        <div
          className={`relative ${sizeClasses} border border-white/10`}
          style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.6), rgba(15,23,42,0.3))',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-white/10" />
          </div>
        </div>
      )}

      {isFaceUp && (
        <div
          className={`poker-card-deal relative ${sizeClasses} overflow-hidden bg-white`}
          style={{ boxShadow: cardShadow }}
        >
          <Image
            src={getCardImagePath(cardIndex!)}
            alt={getCardAlt(cardIndex!)}
            width={imageSize.width}
            height={imageSize.height}
            className="w-full h-full object-cover"
            priority
          />
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: innerGlow }} />
        </div>
      )}

      <style jsx>{`
        @keyframes pokerCardDeal {
          0% {
            opacity: 0;
            transform: translateY(-18px) scale(0.88) rotateX(15deg);
          }
          50% {
            opacity: 1;
            transform: translateY(2px) scale(1.03) rotateX(-2deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotateX(0deg);
          }
        }
        .poker-card-deal {
          animation: pokerCardDeal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .poker-card-wrapper {
          perspective: 600px;
        }
      `}</style>
    </div>
  );
}
