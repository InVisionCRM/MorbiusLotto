'use client';

import React from 'react';
import { CardDisplay } from './CardDisplay';

export interface PokerBoardProps {
  communityCards: number[];
  pot: string;
}

export function PokerBoard({ communityCards, pot }: PokerBoardProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1 flex-wrap justify-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <CardDisplay key={i} cardIndex={communityCards[i]} small />
        ))}
      </div>
      {pot !== '0' && (
        <div className="text-cyan-400 font-medium">Pot: {pot}</div>
      )}
    </div>
  );
}
