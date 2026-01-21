'use client'

import React from 'react';
import { Hand, GameState, Action } from '@/app/BLACKJACK/types';
import { Card } from '@/app/BLACKJACK/types';
import { formatEther } from 'viem';

interface BlackjackTableProps {
  playerHand: Hand;
  dealerHand: Hand;
  gameState: GameState;
  onAction: (action: Action) => void;
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  reserveBalance: bigint;
  usePLS: boolean;
}

const CardComponent: React.FC<{ card: Card; hidden?: boolean }> = ({ card, hidden = false }) => {
  if (hidden) {
    return (
      <div className="w-16 h-24 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg border-2 border-purple-400 flex items-center justify-center shadow-lg">
        <div className="text-white font-bold text-lg">?</div>
      </div>
    );
  }

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return suit;
    }
  };

  const getSuitColor = (suit: string) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-black';
  };

  const getCardDisplay = (value: number) => {
    if (value === 1) return 'A';
    if (value === 11) return 'J';
    if (value === 12) return 'Q';
    if (value === 13) return 'K';
    return value.toString();
  };

  return (
    <div className="w-16 h-24 bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-center shadow-md">
      <div className={`text-sm font-bold ${getSuitColor(card.suit)}`}>
        {getCardDisplay(card.value)}
      </div>
      <div className={`text-lg ${getSuitColor(card.suit)}`}>
        {getSuitSymbol(card.suit)}
      </div>
    </div>
  );
};

const HandComponent: React.FC<{ hand: Hand; label: string; showScore?: boolean }> = ({ hand, label, showScore = true }) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="text-white font-bold text-lg">{label}</div>
      <div className="flex space-x-2">
        {hand.cards.map((card, index) => (
          <CardComponent
            key={index}
            card={card}
            hidden={label === 'Dealer' && index === 1 && hand.cards.length === 2}
          />
        ))}
      </div>
      {showScore && hand.cards.length > 0 && (
        <div className="text-white font-semibold">
          Score: {hand.total}
          {hand.isBlackjack && <span className="text-yellow-400 ml-2">BLACKJACK!</span>}
          {hand.isBust && <span className="text-red-400 ml-2">BUST</span>}
        </div>
      )}
    </div>
  );
};

const BlackjackTable: React.FC<BlackjackTableProps> = ({
  playerHand,
  dealerHand,
  gameState,
  onAction,
  canHit,
  canStand,
  canDoubleDown,
  reserveBalance,
  usePLS
}) => {
  const getGameStatus = () => {
    switch (gameState) {
      case GameState.WAITING: return 'Place your bet to start';
      case GameState.DEALING: return 'Dealing cards...';
      case GameState.PLAYER_TURN: return 'Your turn';
      case GameState.DEALER_TURN: return 'Dealer\'s turn';
      case GameState.COMPLETE: return 'Game finished';
      default: return '';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-gradient-to-b from-green-800 to-green-900 rounded-lg p-8 shadow-2xl">
      {/* Game Status */}
      <div className="text-center mb-6">
        <div className="text-white text-xl font-bold mb-2">{getGameStatus()}</div>
        <div className="text-green-200 text-sm">
          Balance: {formatEther(reserveBalance)} {usePLS ? 'PLS' : 'MORBIUS'}
        </div>
      </div>

      {/* Dealer Hand */}
      <div className="mb-8">
        <HandComponent hand={dealerHand} label="Dealer" />
      </div>

      {/* Game Actions */}
      {(canHit || canStand || canDoubleDown) && (
        <div className="flex justify-center space-x-4 mb-6">
          {canHit && (
            <button
              onClick={() => onAction(Action.HIT)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
            >
              HIT
            </button>
          )}
          {canStand && (
            <button
              onClick={() => onAction(Action.STAND)}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              STAND
            </button>
          )}
          {canDoubleDown && (
            <button
              onClick={() => onAction(Action.DOUBLE_DOWN)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors"
            >
              DOUBLE DOWN
            </button>
          )}
        </div>
      )}

      {/* Player Hand */}
      <div className="mt-8">
        <HandComponent hand={playerHand} label="Player" />
      </div>
    </div>
  );
};

export default BlackjackTable;