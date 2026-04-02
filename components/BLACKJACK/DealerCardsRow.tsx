'use client';

import React from 'react';
import type { Card } from '@/app/BLACKJACK/types';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';

type DealerCardsRowProps = {
  cards: Card[];
  visibleCards: number;
  hideHoleCard?: boolean;
  cardSize?: 'large' | 'medium' | 'normal' | 'small';
  cardsExiting?: boolean;
};

export default function DealerCardsRow({
  cards,
  visibleCards,
  hideHoleCard = false,
  cardSize = 'normal',
  cardsExiting = false,
}: DealerCardsRowProps) {
  return (
    <>
      {cards.map((card, index) => {
        if (index >= visibleCards) return null;
        const isHoleCard = hideHoleCard && index === 1;
        return (
          <div
            key={`dealer-card-${index}`}
            className={index > 0 ? 'card-overlap-dealer' : ''}
            style={{ zIndex: index }}
          >
            <PlayingCard
              card={card}
              owner="dealer"
              hidden={isHoleCard}
              className=""
              size={cardSize}
              index={index}
              isNewCard={index >= 2 && index === visibleCards - 1}
              exiting={cardsExiting}
              exitDelay={0}
            />
          </div>
        );
      })}
    </>
  );
}

