'use client'

import React from 'react';
import Image from 'next/image';
import { Card } from '@/app/BLACKJACK/types';
import { useBlackjackTableLayout } from '@/components/BLACKJACK/BlackjackTableLayoutContext';
import { cardFacePath } from '@/lib/blackjack-table-layout';
import { cardBackById } from '@/lib/table-card-backs';
import './blackjack-cards.css';

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
  const layout = useBlackjackTableLayout();
  const isDealer = owner === 'dealer';

  const ownerClass = isDealer ? 'blackjack-card-dealer' : 'blackjack-card-player';

  // Animation classes: slide-in for new card, clear-out when exiting
  const animationClass = exiting ? 'card-clear-out' : (isNewCard ? 'card-slide-in' : '');

  // Staggered animation delay (slide-in); when exiting use exitDelay
  const animationDelay = exiting ? exitDelay : (index * (layout.motion.dealIn.staggerMs / 1000));

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
  const getCardImagePath = () =>
    cardFacePath(layout, `${getValueString(card.value)}${getSuitLetter(card.suit)}`);

  const sizePx = layout.cards.sizes[size];
  const imageSize = sizePx;

  // Initial state for new cards: parked at the shoe until the deal animation
  // picks it up, so there is no flash at the resting position first.
  const { fromX, fromY, fromRot, fromScale } = layout.motion.dealIn;
  const initialStyle = isNewCard && !exiting ? {
    opacity: 0,
    transform: `translateX(${fromX}px) translateY(${fromY}px) rotate(${fromRot}deg) scale(${fromScale})`,
  } : {};

  const back = cardBackById(layout.cards.backDesign);

  if (hidden) {
    return (
      <div
        className={`blackjack-card blackjack-card-hidden ${ownerClass} ${animationClass} ${className} overflow-hidden`}
        style={{
          width: sizePx.w,
          height: sizePx.h,
          animationDelay: exiting ? `${animationDelay}s` : (isNewCard ? `${animationDelay}s` : '1s'),
          ...initialStyle,
        }}
      >
        <div
          className="blackjack-card-back"
          style={{ background: back.background, boxShadow: back.boxShadow }}
        >
          {/* A real card back has a margin: the pattern runs to the edge, the
              mark sits inside a rule. Before this, the table's logo was simply
              stretched edge to edge by object-cover and read as a logo tile. */}
          <span className="blackjack-card-back-rule" />
          {layout.cards.backImage ? (
            /* Plain <img>, not next/image: a table's mark can be a token logo
               served from any host a creator picks, and next/image would
               reject every hostname that isn't in next.config's allowlist.
               The mark is small and decorative, so there's nothing to
               optimise away. */
            <img src={layout.cards.backImage} alt="Card back" className="blackjack-card-back-mark" />
          ) : (
            back.glyph && (
              <span className="blackjack-card-back-glyph" style={{ color: back.glyphColor }}>
                {back.glyph}
              </span>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`blackjack-card ${ownerClass} ${animationClass} ${className} overflow-hidden bg-white`}
      style={{
        width: sizePx.w,
        height: sizePx.h,
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
