'use client';

import React from 'react';
import type { Card } from '@/app/BLACKJACK/types';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import { useBlackjackTableLayout } from '@/components/BLACKJACK/BlackjackTableLayoutContext';

type DealerCardsRowProps = {
  cards: Card[];
  visibleCards: number;
  hideHoleCard?: boolean;
  cardSize?: 'large' | 'medium' | 'normal' | 'small';
  cardsExiting?: boolean;
  /** When set, these card indices use deal-in animation (otherwise only the last hit card does). */
  newDealerCardIndices?: Set<number> | null;
};

export default function DealerCardsRow({
  cards,
  visibleCards,
  hideHoleCard = false,
  cardSize = 'normal',
  cardsExiting = false,
  newDealerCardIndices = null,
}: DealerCardsRowProps) {
  const { clearOut } = useBlackjackTableLayout().motion;

  return (
    <>
      {cards.map((card, index) => {
        if (index >= visibleCards) return null;
        const isHoleCard = hideHoleCard && index === 1;
        const isNewCard = newDealerCardIndices
          ? newDealerCardIndices.has(index)
          : index >= 2 && index === visibleCards - 1;
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
              isNewCard={isNewCard}
              exiting={cardsExiting}
              exitDelay={(index * clearOut.dealerStaggerMs) / 1000}
            />
          </div>
        );
      })}
    </>
  );
}

