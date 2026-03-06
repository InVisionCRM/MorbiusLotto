'use client';

import React from 'react';

/** Card index 0-51: rank = (idx % 13) + 1 (A=1..K=13), suit = floor(idx/13) (0=hearts,1=diamonds,2=clubs,3=spades) */
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♥', '♦', '♣', '♠'];
const SUIT_COLOR = ['text-red-400', 'text-red-400', 'text-slate-200', 'text-slate-200'];

export interface CardDisplayProps {
  /** Card index 0-51. If null/undefined, show face-down placeholder. */
  cardIndex: number | null | undefined;
  /** Smaller card for board/opponent */
  small?: boolean;
  /** Show card back (for opponent hole cards) */
  faceDown?: boolean;
  className?: string;
}

export function CardDisplay({ cardIndex, small, faceDown, className = '' }: CardDisplayProps) {
  const smallClasses = small ? 'w-6 h-8 sm:w-8 sm:h-11 text-[10px] sm:text-xs' : 'w-10 h-14 text-sm';
  if (faceDown || (cardIndex != null && (cardIndex < 0 || cardIndex > 51))) {
    return (
      <div
        className={`rounded border border-amber-800/60 bg-gradient-to-br from-amber-900 to-amber-950 flex items-center justify-center ${smallClasses} ${className}`}
        style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)' }}
      >
        <span className="text-amber-700/80 font-bold">♠</span>
      </div>
    );
  }
  if (cardIndex == null) {
    return (
      <div
        className={`rounded border border-cyan-500/30 bg-slate-800 flex items-center justify-center ${smallClasses} ${className}`}
        style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
      >
        <span className="text-slate-500">?</span>
      </div>
    );
  }
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return (
    <div
      className={`rounded border border-cyan-500/30 bg-slate-900 flex flex-col items-center justify-center ${small ? smallClasses : 'w-10 h-14 text-sm'} ${className}`}
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)' }}
    >
      <span className="text-white font-medium">{RANKS[rank]}</span>
      <span className={SUIT_COLOR[suit]}>{SUITS[suit]}</span>
    </div>
  );
}
