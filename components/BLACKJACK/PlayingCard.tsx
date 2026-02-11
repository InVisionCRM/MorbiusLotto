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
  size?: 'large' | 'normal' | 'small';
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

  // Size classes: large = w-28 h-40 (112x160), normal = w-20 h-28 (80x112), small = w-14 h-20 (56x80)
  const sizeClasses = size === 'large' ? 'w-28 h-40' : size === 'small' ? 'w-14 h-20' : 'w-20 h-28';
  const imageSize = size === 'large' ? { width: 112, height: 160 } : size === 'small' ? { width: 56, height: 80 } : { width: 80, height: 112 };

  // Initial state for new cards: start hidden and offset
  const initialStyle = isNewCard && !exiting ? {
    opacity: 0,
    transform: 'translateX(100px) translateY(-80px)',
  } : {};

  if (hidden) {
    return (
      <div
        className={`blackjack-card blackjack-card-hidden ${ownerClass} ${animationClass} ${className} relative ${sizeClasses} overflow-hidden rounded-lg`}
        style={{
          boxShadow: getCardShadow(),
          animationDelay: exiting ? `${animationDelay}s` : (isNewCard ? `${animationDelay}s` : '1s'),
          ...initialStyle,
        }}
      >
        <div className="w-full h-full bg-slate-900 overflow-hidden">
          <Image
            src="/Pulse Branding/Logo/ball.png"
            alt="Card back"
            width={imageSize.width}
            height={imageSize.height}
            className="w-full h-full object-cover"
            priority
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`blackjack-card ${ownerClass} ${animationClass} ${className} relative ${sizeClasses} overflow-hidden rounded-lg bg-white`}
      style={{
        boxShadow: getCardShadow(),
        animationDelay: exiting ? `${animationDelay}s` : (isNewCard ? `${animationDelay}s` : '1s'),
        ...initialStyle,
      }}
    >
      <Image
        src={getCardImagePath()}
        alt={`${getValueString(card.value)} of ${card.suit}`}
        width={imageSize.width}
        height={imageSize.height}
        className="w-full h-full object-cover"
        priority
      />
    </div>
  );
};

export default PlayingCard;
