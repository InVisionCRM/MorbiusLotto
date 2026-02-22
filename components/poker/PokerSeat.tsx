'use client';

import React from 'react';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';

export interface PokerSeatProps {
  seat: SeatState;
  /** Index for layout (e.g. position around table) */
  index: number;
  /** Show hole cards (only for current player when visible) */
  holeCards?: number[];
  isCurrentPlayer?: boolean;
}

export function PokerSeat({ seat, holeCards, isCurrentPlayer }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  return (
    <div
      className={`rounded-xl border p-3 min-w-[100px] ${
        seat.isActing ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-cyan-500/30'
      } ${empty ? 'border-dashed border-slate-500' : ''}`}
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div className="flex flex-col items-center gap-1">
        {seat.isDealer && (
          <span className="text-xs bg-cyan-600/50 text-cyan-200 px-1.5 py-0.5 rounded">D</span>
        )}
        {seat.isSmallBlind && <span className="text-xs text-amber-400">SB</span>}
        {seat.isBigBlind && <span className="text-xs text-amber-400">BB</span>}
        <span className="text-slate-300 text-sm truncate max-w-full">
          {empty ? 'Empty' : `${seat.playerAddress!.slice(0, 6)}…${seat.playerAddress!.slice(-4)}`}
        </span>
        <span className="text-cyan-400 text-sm font-medium">{seat.stack}</span>
        {seat.folded && <span className="text-xs text-red-400">Folded</span>}
        {holeCards && holeCards.length > 0 && isCurrentPlayer && (
          <div className="flex gap-0.5 mt-1">
            <CardDisplay cardIndex={holeCards[0]} small />
            <CardDisplay cardIndex={holeCards[1]} small />
          </div>
        )}
      </div>
    </div>
  );
}
