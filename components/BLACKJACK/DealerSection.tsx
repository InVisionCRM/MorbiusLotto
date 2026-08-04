'use client';

import React from 'react';
import type { Card, CardValue, Suit } from '@/app/BLACKJACK/types';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import DealerCardsRow from '@/components/BLACKJACK/DealerCardsRow';
import DealerTotalBadge from '@/components/BLACKJACK/DealerTotalBadge';

type DealerSectionProps = {
  cards: Card[];
  visibleCards: number;
  hideHoleCard?: boolean;
  cardsExiting?: boolean;
  cardSize?: 'large' | 'medium' | 'normal' | 'small';

  isPlayingPhase?: boolean;
  showPlayingHoleFallback?: boolean;
  showPredealPlaceholders?: boolean;

  counterValue: number | string;
  counterActive?: boolean;
  isBust: boolean;
  isBlackjack: boolean;
  winnerHighlight?: boolean;
  badgeSize?: 'small' | 'large';
  newDealerCardIndices?: Set<number> | null;
};

export default function DealerSection({
  cards,
  visibleCards,
  hideHoleCard = false,
  cardsExiting = false,
  cardSize = 'normal',
  isPlayingPhase = false,
  showPlayingHoleFallback = false,
  showPredealPlaceholders = false,
  counterValue,
  counterActive = false,
  isBust,
  isBlackjack,
  winnerHighlight = false,
  badgeSize = 'small',
  newDealerCardIndices = null,
}: DealerSectionProps) {
  return (
    <>
      <div className="flex bj-hand-dealer">
        <DealerCardsRow
          cards={cards}
          visibleCards={visibleCards}
          hideHoleCard={hideHoleCard}
          cardsExiting={cardsExiting}
          cardSize={cardSize}
          newDealerCardIndices={newDealerCardIndices}
        />

        {showPlayingHoleFallback && isPlayingPhase && cards.length === 1 && (
          <div className="card-overlap-dealer" style={{ zIndex: 1 }}>
            <PlayingCard
              card={{ value: 1 as CardValue, suit: 'spades' as Suit }}
              hidden
              owner="dealer"
              className=""
              size={cardSize}
            />
          </div>
        )}

        {showPredealPlaceholders && cards.length === 0 && (
          <>
            <div className="w-20 h-28 rounded-lg border border-dashed border-white/10 mr-[-18px]" />
            <div className="w-20 h-28 rounded-lg border border-dashed border-white/10" />
          </>
        )}
      </div>

      {visibleCards > 0 && cards.length > 0 && (
        <DealerTotalBadge
          shown={counterValue}
          isBust={isBust}
          isBlackjack={isBlackjack}
          isActive={counterActive}
          winnerHighlight={winnerHighlight}
          size={badgeSize}
        />
      )}
    </>
  );
}

