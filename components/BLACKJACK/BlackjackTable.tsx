'use client'

import React from 'react';
import { Hand, GameState, Action } from '@/app/BLACKJACK/types';
import { formatEther } from 'viem';
import PlayingCard from './PlayingCard';

interface BlackjackTableProps {
  playerHand: Hand;
  dealerHand: Hand;
  gameState: GameState;
  onAction: (action: Action) => void;
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit?: boolean;
  reserveBalance: bigint;
  usePLS: boolean;
  newCardIndices?: { player: Set<number>, dealer: Set<number> };
}

const BlackjackTable: React.FC<BlackjackTableProps> = ({
  playerHand,
  dealerHand,
  gameState,
  onAction,
  canHit,
  canStand,
  canDoubleDown,
  canSplit = false,
  reserveBalance,
  usePLS,
  newCardIndices = { player: new Set(), dealer: new Set() }
}) => {
  const hideHoleCard = gameState !== GameState.COMPLETE;
  
  // Debug logging
  console.log('BlackjackTable - dealerHand.cards:', dealerHand.cards.length, dealerHand.cards);
  console.log('BlackjackTable - hideHoleCard:', hideHoleCard, 'gameState:', gameState);

  return (
    <div
      className="relative w-full max-w-4xl mx-auto rounded-3xl overflow-hidden p-4 sm:p-6 lg:p-8 blackjack-table"
      style={{
        backgroundImage: "url('/BlackJack/TableBackground.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '500px',
        boxShadow: 'inset 0 3px 10px rgba(0, 0, 0, 0.7), 0 12px 30px rgba(0, 0, 0, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.25)',
      }}
    >
      {/* Subtle dark overlay to keep text readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(145deg, rgba(0,0,0,0.45), rgba(0,0,0,0.25))',
        }}
      />
      
      <div className="relative z-10 flex flex-col" style={{ height: '100%', minHeight: '600px' }}>
        {/* Play Area */}
        <div className="flex-1 relative w-full z-10" style={{ minHeight: '400px', perspective: '1000px', perspectiveOrigin: 'center center' }}>
          {/* Dealer Area */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center">
            <div className="flex gap-[3px]" style={{ transformStyle: 'preserve-3d' }}>
              {dealerHand.cards.map((card, index) => (
                <PlayingCard
                  key={`dealer-${index}`}
                  card={card}
                  owner="dealer"
                  hidden={hideHoleCard && index === 1 && dealerHand.cards.length === 2}
                  className="transition-all duration-300 hover:-translate-y-2"
                  index={index}
                />
              ))}
            </div>
            {dealerHand.cards.length > 0 && (
              <div className="ml-3 flex items-center gap-2">
                <span className="text-white/50 font-black text-xl">
                  {hideHoleCard && dealerHand.cards.length === 2 ? "?" : dealerHand.total}
                </span>
                {dealerHand.isBust && <span className="text-red-400 font-black text-xs">BUST</span>}
              </div>
            )}
          </div>

          {/* Player Area */}
          <div className="absolute bottom-46 left-1/2 -translate-x-1/2 flex items-center">
            <div className="flex gap-[3px]" style={{ transformStyle: 'preserve-3d' }}>
              {playerHand.cards.map((card, index) => (
                <PlayingCard
                  key={`player-${index}`}
                  card={card}
                  owner="player"
                  className="transition-all duration-300 hover:-translate-y-2"
                  index={index}
                  isNewCard={newCardIndices.player.has(index)}
                />
              ))}
            </div>
            {playerHand.cards.length > 0 && (
              <div className="ml-3 flex items-center gap-2">
                <span className="text-white/50 font-black text-xl">{playerHand.total}</span>
                {playerHand.isBlackjack && <span className="text-yellow-400 font-black text-xs">BLACKJACK!</span>}
                {playerHand.isBust && <span className="text-red-400 font-black text-xs">BUST</span>}
              </div>
            )}
          </div>
        </div>

        {/* Actions Area - Centered at bottom */}
        {(canHit || canStand || canDoubleDown || canSplit) && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 items-center z-20">
            {canHit && (
              <button
                onClick={() => onAction(Action.HIT)}
                className="blackjack-action-btn blackjack-btn-hit group"
              >
                <div className="blackjack-btn-inner">HIT</div>
              </button>
            )}
            {canStand && (
              <button
                onClick={() => onAction(Action.STAND)}
                className="blackjack-action-btn blackjack-btn-stand group"
              >
                <div className="blackjack-btn-inner">STAND</div>
              </button>
            )}
            {canDoubleDown && (
              <button
                onClick={() => onAction(Action.DOUBLE_DOWN)}
                className="blackjack-action-btn blackjack-btn-double group"
              >
                <div className="blackjack-btn-inner">DOUBLE</div>
              </button>
            )}
            {canSplit && (
              <button
                onClick={() => onAction(Action.SPLIT)}
                className="blackjack-action-btn blackjack-btn-split group"
              >
                <div className="blackjack-btn-inner">SPLIT</div>
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes cardSlideDown {
          0% {
            transform: perspective(1000px) rotateY(-8deg) rotateX(12deg) translateY(-120px) scale(0.7);
            opacity: 0;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: perspective(1000px) rotateY(-8deg) rotateX(12deg) translateY(0) scale(1);
            opacity: 1;
          }
        }
        
        @keyframes cardSlideUp {
          0% {
            transform: perspective(1000px) rotateY(8deg) rotateX(12deg) translateY(120px) scale(0.7);
            opacity: 0;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: perspective(1000px) rotateY(8deg) rotateX(12deg) translateY(0) scale(1);
            opacity: 1;
          }
        }
        
        @keyframes flipOverlay {
          0% {
            transform: perspective(1000px) rotateY(0deg);
            opacity: 1;
          }
          50% {
            transform: perspective(1000px) rotateY(90deg);
            opacity: 0.3;
          }
          100% {
            transform: perspective(1000px) rotateY(180deg);
            opacity: 0;
            pointer-events: none;
          }
        }
        
        @keyframes cardContentFadeIn {
          0% {
            opacity: 0;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        
        .card-deal-dealer {
          animation: cardSlideDown 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .card-deal-player {
          animation: cardSlideUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .card-flip-overlay {
          animation: flipOverlay 0.6s ease-in-out 0.1s forwards;
        }
        
        .card-deal-dealer .card-content,
        .card-deal-player .card-content {
          animation: cardContentFadeIn 0.6s ease-in-out 0.35s forwards;
          opacity: 0;
        }
        
        .blackjack-action-btn {
          @apply relative p-[2px] rounded-xl transition-all duration-200 hover:scale-105 active:scale-95;
          min-width: 100px;
        }
        .blackjack-btn-inner {
          @apply bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-xl text-white font-black text-sm tracking-widest border border-white/10;
        }
        .blackjack-btn-hit {
          background: linear-gradient(145deg, #ef4444, #b91c1c);
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.3);
        }
        .blackjack-btn-stand {
          background: linear-gradient(145deg, #3b82f6, #1d4ed8);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
        }
        .blackjack-btn-double {
          background: linear-gradient(145deg, #f59e0b, #b45309);
          box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
        }
        .blackjack-btn-split {
          background: linear-gradient(145deg, #10b981, #047857);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        .blackjack-card {
          @apply relative transition-all duration-300;
        }
        .blackjack-card-dealer:hover {
          transform: perspective(1000px) rotateY(-8deg) rotateX(12deg) rotateZ(0deg) translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 24px rgba(0, 0, 0, 0.5),
            0 6px 12px rgba(0, 0, 0, 0.4),
            0 2px 4px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .blackjack-card-player:hover {
          transform: perspective(1000px) rotateY(8deg) rotateX(12deg) rotateZ(0deg) translateY(-4px) scale(1.02);
          box-shadow: 
            0 12px 24px rgba(0, 0, 0, 0.5),
            0 6px 12px rgba(0, 0, 0, 0.4),
            0 2px 4px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .blackjack-card-dealer {
          /* Specific dealer card styles if any */
        }
        .blackjack-card-player {
          /* Specific player card styles if any */
        }
      `}</style>
    </div>
  );
};

export default BlackjackTable;
