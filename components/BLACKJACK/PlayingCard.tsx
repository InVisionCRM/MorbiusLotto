'use client'

import React from 'react';
import Image from 'next/image';
import { Card } from '@/app/BLACKJACK/types';

interface PlayingCardProps {
  card: Card;
  hidden?: boolean;
  owner: 'dealer' | 'player';
  className?: string;
  index?: number;
  isNewCard?: boolean;
  size?: 'large' | 'medium' | 'normal' | 'small';
  /** When true, play clear-out animation (fade + slide down). */
  exiting?: boolean;
  /** Delay in seconds before clear-out animation (e.g. 0.15 for player stagger). */
  exitDelay?: number;
}

const PlayingCard: React.FC<PlayingCardProps> = ({ card, hidden = false, owner, className = '', index = 0, isNewCard = false, size = 'normal', exiting = false, exitDelay = 0 }) => {
  const isDealer = owner === 'dealer';

  const ownerClass = isDealer ? 'blackjack-card-dealer' : 'blackjack-card-player';

  // Animation classes: slide-in for new card, clear-out when exiting
  const animationClass = exiting ? 'card-clear-out' : (isNewCard ? 'card-slide-in' : '');

  // Staggered animation delay (slide-in); when exiting use exitDelay
  const animationDelay = exiting ? exitDelay : (index * 0.25);

  // Get suit letter for image filename (S=spades, D=diamonds, C=clubs, H=hearts)
  const getSuitLetter = (suit: string) => {
    switch (suit) {
      case 'hearts': return 'H';
      case 'diamonds': return 'D';
      case 'clubs': return 'C';
      case 'spades': return 'S';
      default: return 'S';
    }
  };

  // Get value string for image filename (A, 2-10, J, Q, K)
  const getValueString = (value: number) => {
    if (value === 1) return 'A';
    if (value === 11) return 'J';
    if (value === 12) return 'Q';
    if (value === 13) return 'K';
    return value.toString();
  };

  // Build the card image path
  const getCardImagePath = () => {
    const valueStr = getValueString(card.value);
    const suitLetter = getSuitLetter(card.suit);
    return `/BlackJack/Cards/PNG/${valueStr}${suitLetter}.png`;
  };

  // Simple shadow for card depth
  const getCardShadow = () => {
    return '0 2px 4px rgba(0, 0, 0, 0.2)';
  };

  // Size dimensions: large = 112x160, medium = 108x152, normal = 80x112, small = 56x80
  const sizePx = size === 'large' ? { w: 112, h: 160 } : size === 'medium' ? { w: 108, h: 152 } : size === 'small' ? { w: 56, h: 80 } : { w: 80, h: 112 };
  const imageSize = sizePx;

  // Initial state for new cards: start hidden and offset
  const initialStyle = isNewCard && !exiting ? {
    opacity: 0,
    transform: 'translateX(100px) translateY(-80px)',
  } : {};

  if (hidden) {
    return (
      <div
        className={`blackjack-card blackjack-card-hidden ${ownerClass} ${animationClass} ${className} relative overflow-hidden rounded-lg`}
        style={{
          width: sizePx.w,
          height: sizePx.h,
          boxShadow: getCardShadow(),
          animationDelay: exiting ? `${animationDelay}s` : (isNewCard ? `${animationDelay}s` : '1s'),
          ...initialStyle,
        }}
      >
        <div className="w-full h-full bg-slate-900 overflow-hidden">
          <Image
            src="/Pulse Branding/Logo/ball.png"
            alt="Card back"
            width={imageSize.w}
            height={imageSize.h}
            className="w-full h-full object-cover"
            priority
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`blackjack-card ${ownerClass} ${animationClass} ${className} relative overflow-hidden rounded-lg bg-white`}
      style={{
        width: sizePx.w,
        height: sizePx.h,
        boxShadow: getCardShadow(),
        animationDelay: exiting ? `${animationDelay}s` : (isNewCard ? `${animationDelay}s` : '1s'),
        ...initialStyle,
      }}
    >
      <Image
        src={getCardImagePath()}
        alt={`${getValueString(card.value)} of ${card.suit}`}
        width={imageSize.w}
        height={imageSize.h}
        className="w-full h-full object-cover"
        priority
      />
    </div>
  );
};

export default PlayingCard;
