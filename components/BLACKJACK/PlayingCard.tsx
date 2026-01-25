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
}

const PlayingCard: React.FC<PlayingCardProps> = ({ card, hidden = false, owner, className = '', index = 0, isNewCard = false }) => {
  const isDealer = owner === 'dealer';

  const ownerClass = isDealer ? 'blackjack-card-dealer' : 'blackjack-card-player';

  // Animation classes
  const animationClass = isNewCard ? 'card-slide-in' : '';

  // Staggered animation delay
  const animationDelay = index * 0.25;

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

  // 3D perspective transform - cards lie flat on table viewed from player's angle
  const getCardTransform = () => {
    if (isDealer) {
      // Dealer cards: tilt back more (further from viewer), slight rotation for natural look
      return 'rotateX(20deg)';
    } else {
      // Player cards: tilt back less (closer to viewer)
      return 'rotateX(15deg)';
    }
  };

  // Shadow that enhances the 3D effect - card lifting off table
  const getCardShadow = () => {
    if (isDealer) {
      return '0 2px 2px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 2px rgba(0, 0, 0, 0.2)';
    } else {
      return '0 2px 2px rgba(0, 0, 0, 0.5), 0 2px 2px rgba(0, 0, 0, 0.3), 0 2px 2px rgba(0, 0, 0, 0.25)';
    }
  };

  if (hidden) {
    return (
      <div
        className={`blackjack-card blackjack-card-hidden ${ownerClass} ${animationClass} ${className} relative w-20 h-28 overflow-hidden`}
        style={{
          borderRadius: '4px',
          boxShadow: getCardShadow(),
          transform: getCardTransform(),
          transformStyle: 'preserve-3d',
          animationDelay: isNewCard ? `${animationDelay}s` : '1s',
        }}
      >
        <Image
          src="/BlackJack/CardBack1.png"
          alt="Card back"
          width={80}
          height={112}
          className="w-full h-full object-cover rounded-sm"
          priority
        />
      </div>
    );
  }

  return (
    <div
      className={`blackjack-card ${ownerClass} ${animationClass} ${className} relative w-20 h-28 overflow-hidden`}
      style={{
        borderRadius: '1px',
        boxShadow: getCardShadow(),
        transform: getCardTransform(),
        transformStyle: 'preserve-3d',
        animationDelay: isNewCard ? `${animationDelay}s` : '1s',
      }}
    >
      <Image
        src={getCardImagePath()}
        alt={`${getValueString(card.value)} of ${card.suit}`}
        width={80}
        height={112}
        className="w-full h-full object-cover rounded-xs"
        priority
      />
    </div>
  );
};

export default PlayingCard;
