'use client'

import React from 'react';
import Image from 'next/image';
import { Card } from '@/app/BLACKJACK/types';

interface PlayingCardProps {
  card: Card;
  hidden?: boolean;
  owner: 'dealer' | 'player';
  className?: string;
  index?: number; // For varying angles per card
  isNewCard?: boolean; // Whether this card was just dealt
}

const PlayingCard: React.FC<PlayingCardProps> = ({ card, hidden = false, owner, className = '', index = 0, isNewCard = false }) => {
  const isDealer = owner === 'dealer';
  
  // Base classes for dealer vs player
  const ownerClass = isDealer ? 'blackjack-card-dealer' : 'blackjack-card-player';
  
  // Animation class based on owner and if it's a new card
  const animationClass = isNewCard 
    ? (isDealer ? 'card-deal-dealer' : 'card-deal-player')
    : '';
  
  // Animation delay based on card index (staggered)
  const animationDelay = index * 0.15; // 150ms delay per card
  
  // Create variation per card - alternating rotation pattern like cards laid on table
  const getVariation = (base: number, variation: number) => {
    // Alternating pattern: even index rotates one way, odd rotates the other
    const isEven = index % 2 === 0;
    const offset = isEven ? variation : -variation;
    return base + offset;
  };
  
  if (hidden) {
    // Hidden cards (dealer hole card) also get the 3D effect with variation
    const getHiddenTransform = () => {
      if (isDealer) {
        // Tilted back and rotated on Y-axis (alternating)
        const rotateY = getVariation(-8, 6); // Alternates between -2deg and -14deg
        const rotateX = getVariation(12, 2); // Tilted back, varies slightly
        const rotateZ = getVariation(0, 1); // Slight rotation
        return `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`;
      }
      return 'perspective(1000px)';
    };

    return (
      <div 
        className={`blackjack-card blackjack-card-hidden ${ownerClass} ${className} relative w-20 h-30 overflow-hidden`}
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(0, 0, 0, 0.2)',
          boxShadow: `
            0 2px 4px rgba(0, 0, 0, 0.3),
            0 1px 2px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.3)
          `,
          transform: getHiddenTransform(),
          transformStyle: 'preserve-3d',
          transition: 'all 0.3s ease',
        }}
      >
        <Image
          src="/BlackJack/CardBack.png"
          alt="Card back"
          width={80}
          height={120}
          className="w-full h-full object-cover"
          priority
        />
      </div>
    );
  }

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return suit;
    }
  };

  const getSuitColor = (suit: string) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-black';
  };

  const getCardDisplay = (value: number) => {
    if (value === 1) return 'A';
    if (value === 11) return 'J';
    if (value === 12) return 'Q';
    if (value === 13) return 'K';
    return value.toString();
  };

  const suitColor = getSuitColor(card.suit);
  const isRed = suitColor === 'text-red-600';

  // 3D rotation - Cards laid on table perspective (tilted back, rotated on Y-axis)
  const getCardTransform = () => {
    if (isDealer) {
      // Dealer cards: tilted back, alternating Y-axis rotation
      const rotateY = getVariation(-8, 6); // Alternates: -2deg (clockwise) and -14deg (counter-clockwise)
      const rotateX = getVariation(12, 2); // Tilted back (away from viewer), varies 10-14deg
      const rotateZ = getVariation(0, 1); // Slight rotation for natural look
      return `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`;
    } else {
      // Player cards: also tilted back, alternating Y-axis rotation (mirrored)
      const rotateY = getVariation(8, 6); // Alternates: 2deg (counter-clockwise) and 14deg (clockwise)
      const rotateX = getVariation(12, 2); // Tilted back (away from viewer), varies 10-14deg
      const rotateZ = getVariation(0, 1); // Slight rotation
      return `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`;
    }
  };

  return (
    <div 
      className={`blackjack-card ${ownerClass} ${animationClass} ${className} relative w-20 h-30 overflow-hidden flex flex-col justify-between`}
      style={{
        backgroundImage: "url('/BlackJack/cardfront.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: '8px',
        border: '1px solid rgba(0, 0, 0, 0.15)',
        boxShadow: `
          0 8px 16px rgba(0, 0, 0, 0.4),
          0 4px 8px rgba(0, 0, 0, 0.3),
          0 2px 4px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.3)
        `,
        transform: getCardTransform(),
        transformStyle: 'preserve-3d',
        transition: 'all 0.3s ease',
        animationDelay: isNewCard ? `${animationDelay}s` : '0s',
      }}
    >
      {/* Card flip animation overlay - shows card back during flip */}
      {isNewCard && !hidden && (
        <div 
          className="absolute inset-0 pointer-events-none z-20 card-flip-overlay"
          style={{
            borderRadius: '8px',
            backgroundImage: "url('/BlackJack/CardBack.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backfaceVisibility: 'hidden',
          }}
        />
      )}
      
      {/* Card content wrapper - fades in after flip */}
      <div className="card-content absolute inset-0 flex flex-col justify-between">
        {/* Subtle overlay to ensure text readability */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '8px',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)',
          }}
        />

        {/* Top-left corner - Rank only */}
        <div className={`absolute top-2 left-2 ${suitColor} z-10`} style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8), 0 0 4px rgba(255,255,255,0.5)' }}>
          <div className="font-bold text-3xl" style={{ fontFamily: 'serif', fontWeight: '700' }}>
            {getCardDisplay(card.value)}
          </div>
        </div>

        {/* Center suit symbol */}
        <div className={`flex-1 flex items-center justify-center ${suitColor} z-10`} style={{ fontSize: '48px', textShadow: '0 2px 4px rgba(255,255,255,0.8), 0 0 6px rgba(255,255,255,0.5)' }}>
          {getSuitSymbol(card.suit)}
        </div>

        {/* Bottom-right corner (upside down) - Rank only */}
        <div 
          className={`absolute bottom-2 right-2 ${suitColor} z-10`}
          style={{ 
            transform: 'rotate(180deg)',
            textShadow: '0 1px 2px rgba(255,255,255,0.8), 0 0 4px rgba(255,255,255,0.5)'
          }}
        >
          <div className="font-bold text-3xl" style={{ fontFamily: 'serif', fontWeight: '700' }}>
            {getCardDisplay(card.value)}
          </div>
        </div>

        {/* Subtle inner border for depth */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: 'inset 0 0 8px rgba(0, 0, 0, 0.05)'
          }}
        />
      </div>
    </div>
  );
};

export default PlayingCard;
