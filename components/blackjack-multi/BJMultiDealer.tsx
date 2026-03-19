'use client';

import React from 'react';
import { CardValue, Suit } from '@/app/BLACKJACK/types';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';

// Convert integer card index (0-51) to Card object for PlayingCard component
function indexToCard(idx: number) {
  const rank = (idx % 13) + 1; // 1=A, 2-10, 11=J, 12=Q, 13=K
  const suitIdx = Math.floor(idx / 13); // 0=hearts, 1=diamonds, 2=clubs, 3=spades
  const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: SUITS[suitIdx] };
}

interface Props {
  cards: number[];
  cardCount: number; // total cards including hidden
  total: number;
  phase: string;
}

export default function BJMultiDealer({ cards, cardCount, total, phase }: Props) {
  const showTotal = ['dealer_turn', 'completed'].includes(phase);
  const hiddenCount = cardCount - cards.length;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 flex-wrap justify-center min-h-[80px]">
        {cards.map((c, i) => (
          <PlayingCard key={i} card={indexToCard(c)} owner="dealer" className="w-12 h-16 drop-shadow-lg" />
        ))}
        {Array.from({ length: hiddenCount }).map((_, i) => (
          <PlayingCard
            key={`hidden-${i}`}
            card={{ value: 1, suit: 'spades' }}
            hidden
            owner="dealer"
            className="w-12 h-16 drop-shadow-lg"
          />
        ))}
        {cardCount === 0 && (
          <div className="flex gap-1.5">
            {[0, 1].map(i => (
              <div key={i} className="w-12 h-16 rounded-lg border-2 border-dashed border-white/10" />
            ))}
          </div>
        )}
      </div>
      {showTotal && total > 0 && (
        <span className={`text-sm font-bold px-3 py-0.5 rounded-full bg-black/50 ${total > 21 ? 'text-red-400' : 'text-white'}`}>
          {total > 21 ? 'Bust' : total}
        </span>
      )}
    </div>
  );
}
