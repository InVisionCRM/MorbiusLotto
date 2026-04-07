'use client';

import React from 'react';
import DealerSection from '@/components/BLACKJACK/DealerSection';
import type { BJMultiTableState } from '@/lib/websocket-client';
import { CardValue, Suit } from '@/app/BLACKJACK/types';

function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: suits[suitIdx] };
}

/** Blackjack total from server card indices (0–51), using only the first `visibleCount` cards. */
function handTotalFromCardIndices(indices: number[], visibleCount: number): number {
  const n = Math.max(0, Math.min(visibleCount, indices.length));
  let total = 0;
  let hasAce = false;
  for (let i = 0; i < n; i++) {
    const rank = (indices[i] % 13) + 1;
    if (rank === 1) {
      hasAce = true;
      total += 11;
    } else if (rank >= 11) {
      total += 10;
    } else {
      total += rank;
    }
  }
  if (hasAce && total > 21) total -= 10;
  return total;
}

export function BlackjackMultiDealerArea({
  tableViewState,
  visibleDealerCards,
}: {
  tableViewState: BJMultiTableState | null;
  visibleDealerCards: number;
}) {
  const dCards = tableViewState?.dealerCards ?? [];
  const vis = Math.min(visibleDealerCards, dCards.length);
  const shown = dCards.length > 0 ? handTotalFromCardIndices(dCards, vis) : 0;
  const fullReveal = dCards.length > 0 && vis >= dCards.length;
  const naturalBj = fullReveal && dCards.length === 2 && shown === 21;
  const bust = fullReveal && shown > 21;
  const isDealerTurn = tableViewState?.phase === 'dealer_turn';

  return (
    <div className="flex flex-col items-center justify-center">
      <DealerSection
        cards={dCards.map(indexToCard)}
        visibleCards={visibleDealerCards}
        cardSize="normal"
        isPlayingPhase={tableViewState?.phase === 'playing'}
        showPlayingHoleFallback
        showPredealPlaceholders
        counterValue={shown}
        isBust={bust}
        isBlackjack={naturalBj}
        counterActive={isDealerTurn}
        badgeSize="small"
      />
    </div>
  );
}
