'use client'

import React from 'react';
import { GameResult, GameState } from '@/app/BLACKJACK/types';

interface HistoryStripProps {
  history: GameResult[];
  gameState?: GameState;
}

const HistoryStrip: React.FC<HistoryStripProps> = ({ history, gameState }) => {
  if (history.length === 0) return null;

  // Only show the most recent result when we're in WAITING state (next game hasn't started yet)
  // Hide it during COMPLETE, DEALING, PLAYER_TURN, DEALER_TURN (while current game is active or showing results)
  const displayHistory = gameState === GameState.WAITING && history.length > 0
    ? history // Show all including latest when waiting for next game
    : history.length > 0
    ? history.slice(0, -1) // Exclude last item during active game or result display
    : history;

  if (displayHistory.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-4">
      <span className="text-xs text-cyan-300/40 flex-shrink-0">Recent:</span>
      {displayHistory.slice(0, 10).map((result, index) => {
        const isWin = result.payout > 0n;
        const isBlackjack = result.isBlackjack;

        return (
          <div
            key={result.gameId}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
              ${index === 0 ? 'history-item-enter' : ''}`}
            style={{
              background: isBlackjack
                ? 'linear-gradient(145deg, rgba(245, 158, 11, 0.8), rgba(217, 119, 6, 0.8))'
                : isWin
                ? 'linear-gradient(145deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.8))'
                : 'linear-gradient(145deg, rgba(220, 38, 38, 0.8), rgba(185, 28, 28, 0.8))',
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
              color: 'rgb(16, 26, 35)',
              border: index === 0 ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(60, 60, 60, 0.3)',
            }}
            title={`${isBlackjack ? 'Blackjack' : isWin ? 'Win' : 'Loss'} - ${result.playerHand.total}/${result.dealerHand.total}`}
          >
            {isBlackjack ? 'BJ' :
             isWin ? 'W' :
             'L'}
          </div>
        );
      })}
    </div>
  );
};

export default HistoryStrip;