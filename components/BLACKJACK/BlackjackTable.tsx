'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Hand, GameState, Action } from '@/app/BLACKJACK/types';
import { formatEther } from 'viem';
import PlayingCard from './PlayingCard';

interface BlackjackTableProps {
  playerHand: Hand;
  playerHands?: Hand[];
  currentHandIndex?: number;
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
  chipStack?: number[];
  onClearBet?: () => void;
  onStartGame?: () => void;
  isPlaying?: boolean;
  onDealerRevealComplete?: () => void;
  gameResult?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  onChipAnimationComplete?: () => void;
}

const BlackjackTable: React.FC<BlackjackTableProps> = ({
  playerHand,
  playerHands,
  currentHandIndex = 0,
  dealerHand,
  gameState,
  onAction,
  canHit,
  canStand,
  canDoubleDown,
  canSplit = false,
  reserveBalance,
  usePLS,
  newCardIndices = { player: new Set(), dealer: new Set() },
  chipStack = [],
  onClearBet,
  onStartGame,
  isPlaying = false,
  onDealerRevealComplete,
  gameResult = null,
  onChipAnimationComplete
}) => {
  // State for progressive dealer card reveal
  const [visibleDealerCards, setVisibleDealerCards] = useState(dealerHand.cards.length);
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevGameStateRef = useRef<GameState>(gameState);
  const prevDealerCardCountRef = useRef(dealerHand.cards.length);

  // Chip animation state
  const [chipAnimationState, setChipAnimationState] = useState<'none' | 'win' | 'loss'>('none');
  const prevGameResult = useRef<string | null>(null);

  // Handle chip animations when game result changes
  useEffect(() => {
    if (gameResult && gameResult !== prevGameResult.current) {
      if (gameResult === 'win' || gameResult === 'blackjack') {
        setChipAnimationState('win');
      } else if (gameResult === 'loss') {
        setChipAnimationState('loss');
      }
      // Push result for wins is handled like original bet stays (no animation needed for push)

      // Reset animation state after animation completes
      const timer = setTimeout(() => {
        setChipAnimationState('none');
        onChipAnimationComplete?.();
      }, 800); // Animation duration

      return () => clearTimeout(timer);
    }
    prevGameResult.current = gameResult;
  }, [gameResult, onChipAnimationComplete]);

  // Store callback in ref to avoid re-triggering useEffect
  const onDealerRevealCompleteRef = useRef(onDealerRevealComplete);
  useEffect(() => {
    onDealerRevealCompleteRef.current = onDealerRevealComplete;
  }, [onDealerRevealComplete]);

  // Start dealer reveal sequence when game completes
  useEffect(() => {
    // Detect transition to COMPLETE state (player stood)
    if (gameState === GameState.COMPLETE && prevGameStateRef.current !== GameState.COMPLETE) {
      const totalCards = dealerHand.cards.length;

      // If there are more than 2 cards (dealer drew), start reveal sequence
      if (totalCards > 2) {
        setIsRevealing(true);
        setVisibleDealerCards(2); // Start with the 2 initial cards (hole card now visible)

        // Reveal additional cards one at a time with 2s delay
        let cardIndex = 2;
        const revealNextCard = () => {
          if (cardIndex < totalCards) {
            setVisibleDealerCards(cardIndex + 1);
            cardIndex++;
            revealTimeoutRef.current = setTimeout(revealNextCard, 2000);
          } else {
            // All cards revealed
            setIsRevealing(false);
            onDealerRevealCompleteRef.current?.();
          }
        };

        // Start revealing after a brief pause (to show hole card first)
        revealTimeoutRef.current = setTimeout(revealNextCard, 2000);
      } else {
        // Only 2 cards, just show them all immediately
        setVisibleDealerCards(totalCards);
        setIsRevealing(false);
        // Brief delay before triggering completion for the hole card flip effect
        setTimeout(() => {
          onDealerRevealCompleteRef.current?.();
          // Trigger card slide-out animation after a brief delay
          setTimeout(() => {
            setGameEnded(true);
          }, 1500);
        }, 500);
      }
    } else if (gameState !== GameState.COMPLETE) {
      // Reset when starting a new game
      setVisibleDealerCards(dealerHand.cards.length);
      setIsRevealing(false);
    }

    prevGameStateRef.current = gameState;

    return () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
    };
  }, [gameState, dealerHand.cards.length]);

  // Update visible cards when new cards are dealt during player's turn
  useEffect(() => {
    if (gameState !== GameState.COMPLETE && !isRevealing) {
      setVisibleDealerCards(dealerHand.cards.length);
    }
    prevDealerCardCountRef.current = dealerHand.cards.length;
  }, [dealerHand.cards.length, gameState, isRevealing]);

  const hideHoleCard = gameState !== GameState.COMPLETE;

  // Determine which player hands to display
  const displayHands = playerHands && playerHands.length > 0 ? playerHands : [playerHand];
  const hasSplit = displayHands.length > 1;

  // Calculate visible dealer total (only count face-up cards)
  const getVisibleDealerTotal = () => {
    const visibleCards = dealerHand.cards.slice(0, visibleDealerCards);
    let total = 0;
    let hasAce = false;

    for (let i = 0; i < visibleCards.length; i++) {
      // Skip hole card if it's hidden
      if (hideHoleCard && i === 1 && dealerHand.cards.length === 2) {
        continue;
      }
      const card = visibleCards[i];
      if (card.value === 1) {
        hasAce = true;
        total += 11;
      } else if (card.value >= 11 && card.value <= 13) {
        total += 10;
      } else {
        total += card.value;
      }
    }

    // Adjust for ace if bust
    if (hasAce && total > 21) {
      total -= 10;
    }

    return total;
  };

  // Map chip values to PNG images for table display
  // Color mapping: Green=5, Blue=10, Red=25, Black=100/1000
  const getChipImage = (value: number) => {
    switch (value) {
      case 5: return '/PokerChips/tablepokerchip006-ezgif.com-gif-maker.png'; // Green chip
      case 10: return '/PokerChips/tablepokerchip011-ezgif.com-gif-maker.png'; // Blue chip
      case 25: return '/PokerChips/tablepokerchip016-ezgif.com-gif-maker.png'; // Red chip
      case 100: return '/PokerChips/tablepokerchip001-ezgif.com-gif-maker.png'; // Black chip
      case 1000: return '/PokerChips/tablepokerchip021-ezgif.com-rotate.png'; // Black chip for 1000
      default: return '/PokerChips/tablepokerchip011-ezgif.com-gif-maker.png';
    }
  };

  // Debug logging
  console.log('BlackjackTable - dealerHand.cards:', dealerHand.cards.length, dealerHand.cards);
  console.log('BlackjackTable - hideHoleCard:', hideHoleCard, 'gameState:', gameState);
  console.log('BlackjackTable - chipStack:', chipStack, 'total chips:', chipStack.length);

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
        <div className="flex-1 relative w-full z-10" style={{ minHeight: '400px' }}>
          {/* Dealer Area */}
          <div className="absolute top-18 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div
              className="flex gap-2"
              style={{
                perspective: '600px',
                perspectiveOrigin: 'center bottom'
              }}
            >
              {dealerHand.cards.slice(0, visibleDealerCards).map((card, index) => (
                <PlayingCard
                  key={`dealer-${index}`}
                  card={card}
                  owner="dealer"
                  hidden={hideHoleCard && index === 1 && dealerHand.cards.length === 2}
                  className=""
                  index={index}
                  isNewCard={index >= 2 && index === visibleDealerCards - 1}
                />
              ))}
            </div>
            {visibleDealerCards > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-white font-black text-4xl">
                  {isRevealing ? getVisibleDealerTotal() : (gameState === GameState.COMPLETE ? dealerHand.total : getVisibleDealerTotal())}
                </span>
                {!isRevealing && dealerHand.isBust && <span className="text-red-400 font-black text-ld">BUST</span>}
              </div>
            )}
          </div>

          {/* Player Area */}
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex flex-col gap-4 items-center">
            {/* Player Scores */}
            <div className="flex items-center gap-4 mb-2">
              {displayHands.map((hand, handIndex) => (
                <div key={`hand-score-${handIndex}`} className="flex items-center gap-2">
                  <span className="text-white font-black text-4xl">{hand.total}</span>
                  {hand.isBlackjack && <span className="text-yellow-400 font-black text-2xl">BLACKJACK!</span>}
                  {hand.isBust && <span className="text-red-400 font-black text-sm">BUST</span>}
                  {hasSplit && <span className="text-cyan-400/60 font-bold text-sm">Hand {handIndex + 1}</span>}
                </div>
              ))}
            </div>

            {/* Player Hands */}
            <div className="flex gap-4">
              {displayHands.map((hand, handIndex) => (
                <div
                  key={`hand-${handIndex}`}
                  className="flex"
                  style={{
                    perspective: '600px',
                    perspectiveOrigin: 'center bottom'
                  }}
                >
                  {hand.cards.map((card, cardIndex) => {
                    // Calculate position for split hands
                    let cardOffset = 0;
                    if (hasSplit && cardIndex >= 2) {
                      // Hit cards after split: stagger 50px from original
                      cardOffset = (cardIndex - 1) * 50;
                    }

                    // Determine if card is new
                    let isNewCard = false;
                    if (Array.isArray(newCardIndices.player)) {
                      // Multiple hands case
                      isNewCard = handIndex < newCardIndices.player.length && newCardIndices.player[handIndex].has(cardIndex);
                    } else {
                      // Single hand case (backward compatibility)
                      isNewCard = newCardIndices.player.has(cardIndex);
                    }

                    return (
                      <div
                        key={`player-${handIndex}-${cardIndex}`}
                        style={{
                          transform: `translateX(${cardOffset}px)`,
                          zIndex: cardIndex
                        }}
                      >
                        <PlayingCard
                          card={card}
                          owner="player"
                          className=""
                          index={cardIndex}
                  isNewCard={isNewCard}
                />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions Area - Left side of player area */}
        {(canHit || canStand || canDoubleDown || canSplit) && (
          <div className="absolute bottom-20 left-8 flex flex-col gap-3 z-20">
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
                className={`blackjack-action-btn blackjack-btn-stand group ${!canStand ? 'blackjack-action-btn-disabled' : ''}`}
                disabled={!canStand}
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
                className={`blackjack-action-btn blackjack-btn-split group ${!canSplit ? 'blackjack-action-btn-disabled' : ''}`}
                disabled={!canSplit}
              >
                <div className="blackjack-btn-inner">SPLIT</div>
              </button>
            )}
          </div>
        )}

        {/* Stacked Chip Display - Bottom Center */}
        {chipStack.length > 0 && (
          <div
            className={`absolute bottom-25 left-1/2 transform -translate-x-1/2 z-15 ${
              chipAnimationState === 'loss' ? 'chip-stack-lose' :
              chipAnimationState === 'win' ? 'chip-stack-win' : ''
            }`}
          >
            {chipStack.map((chipValue, index) => {
              const chipImage = getChipImage(chipValue);
              const stackOffset = index * 3; // 3px offset per chip for stacking

              return (
                <div
                  key={`${chipValue}-${index}`}
                  className={`absolute w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${
                    chipAnimationState === 'loss' ? 'chip-lose' :
                    chipAnimationState === 'win' ? 'chip-win' : ''
                  }`}
                  style={{
                    background: `url('${chipImage}') center/contain no-repeat`,
                    border: '2px solid rgba(0, 0, 0, 0)',
                    bottom: `${stackOffset}px`,
                    left: '50%',
                    transform: 'translateX(-55%)',
                    zIndex: 10 + index,
                    animationDelay: `${index * 0.05}s`,
                  }}
                >
                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <span
                      className="font-bold text-white text-shadow"
                      style={{
                        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9), -1px -1px 2px rgba(0, 0, 0, 0.5)',
                        fontSize: '10px',
                      }}
                    >
                      {chipValue}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Total Bet Amount Display */}
            <div
              className={`absolute left-1/2 transform -translate-x-1/2 z-50 text-center ${
                chipAnimationState !== 'none' ? 'opacity-0' : ''
              }`}
              style={{
                bottom: `${chipStack.length * 3 + 10}px`,
                transition: 'opacity 0.3s ease-out',
              }}
            >
              <span
                className="font-black text-2xl text-white"
                style={{
                  textShadow: '2px 2px 6px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5)',
                }}
              >
                {chipStack.reduce((sum, chip) => sum + chip, 0)}
              </span>
            </div>
          </div>
        )}

        {/* Bet Control Buttons - Right side (mobile only) */}
        <div className="md:hidden absolute right-10 bottom-25 z-20 grid grid-cols-1 gap-2">
          <button
            onClick={onStartGame}
            disabled={isPlaying}
            className="px-4 py-2 rounded font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white"
            style={{
              background: isPlaying
                ? 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))'
                : 'linear-gradient(145deg, rgba(6, 182, 212, 0.4), rgba(8, 145, 178, 0.4))',
              boxShadow: isPlaying
                ? 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)'
                : 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            DEAL
          </button>
          <button
            onClick={onClearBet}
            disabled={isPlaying}
            className="px-4 py-2 rounded font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300/70"
            style={{
              background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(60, 60, 60, 0.3)',
            }}
          >
            CLEAR
          </button>
        </div>
      </div>

      <style jsx global>{`
        /* Simple slide-in animation from top-right */
        @keyframes cardSlideIn {
          0% {
            transform: translate(200px, -150px);
          }
          100% {
            transform: translate(0, 0);
          }
        }

        .card-slide-in {
          animation: cardSlideIn 0.7s ease-out both;
        }

        /* Chip lose animation - slides up and fades out */
        @keyframes chipLose {
          0% {
            transform: translateX(-55%) translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateX(-55%) translateY(-200px);
            opacity: 0;
          }
        }

        .chip-lose {
          animation: chipLose 0.8s ease-in forwards;
        }

        /* Chip win animation - slides up toward reserve balance */
        @keyframes chipWin {
          0% {
            transform: translateX(-55%) translateY(0) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateX(-55%) translateY(-100px) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translateX(calc(50vw - 100px)) translateY(-500px) scale(0.5);
            opacity: 0;
          }
        }

        .chip-win {
          animation: chipWin 0.8s ease-in-out forwards;
        }

        /* Stack container animations for coordinated effects */
        .chip-stack-lose {
          pointer-events: none;
        }

        .chip-stack-win {
          pointer-events: none;
        }

        .blackjack-action-btn-disabled {
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5), inset 0 -2px 4px rgba(255, 255, 255, 0.1);
          background: linear-gradient(145deg, rgba(35, 45, 55, 0.8), rgba(25, 35, 45, 0.6));
          cursor: not-allowed;
        }
        .blackjack-action-btn-disabled .blackjack-btn-inner {
          background: linear-gradient(145deg, rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.05));
          border-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.3);
        }

        .blackjack-action-btn {
          @apply relative rounded-xl transition-all duration-300 ease-out;
          min-width: 100px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            0 4px 8px rgba(0, 0, 0, 0.3),
            0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .blackjack-action-btn:hover {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            0 6px 12px rgba(0, 0, 0, 0.4),
            0 2px 4px rgba(0, 0, 0, 0.5);
          transform: translateY(-2px);
        }
        .blackjack-action-btn:active {
          box-shadow:
            inset 0 2px 4px rgba(0, 0, 0, 0.3),
            inset 0 -1px 0 rgba(255, 255, 255, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.4);
          transform: translateY(1px);
        }
        .blackjack-btn-inner {
          @apply px-6 py-4 rounded-xl text-white font-black text-sm tracking-widest border;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.2));
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.4);
        }
        .blackjack-btn-hit {
          background: linear-gradient(145deg, #ef4444, #b91c1c);
        }
        .blackjack-btn-hit .blackjack-btn-inner {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.25));
        }
        .blackjack-btn-stand {
          background: linear-gradient(145deg, #3b82f6, #1d4ed8);
        }
        .blackjack-btn-stand .blackjack-btn-inner {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.25));
        }
        .blackjack-btn-double {
          background: linear-gradient(145deg, #f59e0b, #b45309);
        }
        .blackjack-btn-double .blackjack-btn-inner {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.25));
        }
        .blackjack-btn-split {
          background: linear-gradient(145deg, #10b981, #047857);
        }
        .blackjack-btn-split .blackjack-btn-inner {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.25));
        }
        .blackjack-card {
          @apply relative;
        }
        .blackjack-card-dealer:hover {
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
        }
        .blackjack-card-player:hover {
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
};

export default BlackjackTable;
