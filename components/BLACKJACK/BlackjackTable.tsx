'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Hand, GameState, Action, GameResult } from '@/app/BLACKJACK/types';
import { formatEther } from 'viem';
import PlayingCard from './PlayingCard';
import { Dock, DockIcon } from '@/components/ui/dock';
import HistoryStrip from './HistoryStrip';

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
  displayedResult?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  onChipAnimationComplete?: () => void;
  history?: GameResult[];
  onDoubleDownChips?: () => void;
  onSplitChips?: () => void;
  onRebet?: () => void;
  onHalfBet?: () => void;
  onDoubleBet?: () => void;
  canDeal?: boolean;
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
  displayedResult = null,
  onChipAnimationComplete,
  history = [],
  onDoubleDownChips,
  onSplitChips,
  onRebet,
  onHalfBet,
  onDoubleBet,
  canDeal = false
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
        backgroundImage: "url('/BlackJack/tableBG.png')",
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

      {/* Game Result Banner - Shows when game is complete until next deal */}
      {gameState === GameState.COMPLETE && displayedResult && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center pointer-events-none">
          <div
            className={`
              px-8 py-4 rounded-2xl backdrop-blur-md
              transform transition-all duration-500 ease-out
              animate-result-banner
              ${displayedResult === 'blackjack' ? 'bg-gradient-to-r from-yellow-500/90 via-amber-400/90 to-yellow-500/90 border-2 border-yellow-300' :
                displayedResult === 'win' ? 'bg-gradient-to-r from-green-600/90 via-emerald-500/90 to-green-600/90 border-2 border-green-400' :
                displayedResult === 'loss' ? 'bg-gradient-to-r from-red-600/90 via-red-500/90 to-red-600/90 border-2 border-red-400' :
                'bg-gradient-to-r from-gray-500/90 via-gray-400/90 to-gray-500/90 border-2 border-gray-300'}
            `}
            style={{
              boxShadow: displayedResult === 'blackjack'
                ? '0 0 40px rgba(251, 191, 36, 0.6), 0 0 80px rgba(251, 191, 36, 0.3), inset 0 2px 4px rgba(255,255,255,0.3)'
                : displayedResult === 'win'
                ? '0 0 40px rgba(34, 197, 94, 0.5), 0 0 80px rgba(34, 197, 94, 0.2), inset 0 2px 4px rgba(255,255,255,0.3)'
                : displayedResult === 'loss'
                ? '0 0 40px rgba(239, 68, 68, 0.5), 0 0 80px rgba(239, 68, 68, 0.2), inset 0 2px 4px rgba(255,255,255,0.2)'
                : '0 0 30px rgba(156, 163, 175, 0.4), inset 0 2px 4px rgba(255,255,255,0.2)',
            }}
          >
            <div className="flex flex-col items-center gap-1">
              {/* Result Icon */}
              <div className="text-4xl mb-1">
                {displayedResult === 'blackjack' && '🃏✨'}
                {displayedResult === 'win' && '🎉'}
                {displayedResult === 'loss' && '😔'}
                {displayedResult === 'push' && '🤝'}
              </div>

              {/* Result Text */}
              <h2
                className={`text-4xl font-black uppercase tracking-wider
                  ${displayedResult === 'blackjack' ? 'text-yellow-900' :
                    displayedResult === 'win' ? 'text-white' :
                    displayedResult === 'loss' ? 'text-white' :
                    'text-gray-800'}
                `}
                style={{
                  textShadow: displayedResult === 'blackjack'
                    ? '2px 2px 0 rgba(255,255,255,0.5)'
                    : '2px 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                {displayedResult === 'blackjack' ? 'BLACKJACK!' :
                 displayedResult === 'win' ? 'YOU WIN!' :
                 displayedResult === 'loss' ? 'DEALER WINS' :
                 'PUSH'}
              </h2>

              {/* Subtitle */}
              <p className={`text-sm font-medium mt-1 opacity-80
                ${displayedResult === 'blackjack' ? 'text-yellow-800' :
                  displayedResult === 'win' ? 'text-green-100' :
                  displayedResult === 'loss' ? 'text-red-100' :
                  'text-gray-600'}
              `}>
                {displayedResult === 'blackjack' ? 'Natural 21 - 3:2 Payout!' :
                 displayedResult === 'win' ? 'Congratulations!' :
                 displayedResult === 'loss' ? 'Better luck next time' :
                 'Bet returned'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Win/Loss History - Top Left Overlay */}
      {history.length > 0 && (
        <div
          className="absolute top-2 left-2 z-20 rounded-lg"
          style={{
            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.85))',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          <HistoryStrip history={history} />
        </div>
      )}

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
            {/* Player Hands - Side by Side for Split */}
            <div className={`flex ${hasSplit ? 'gap-2 sm:gap-8' : 'gap-4'} items-end`}>
              {displayHands.map((hand, handIndex) => {
                const isActiveHand = hasSplit && handIndex === currentHandIndex && gameState === GameState.PLAYER_TURN;
                const isCompletedHand = hasSplit && (hand.isBust || (handIndex < currentHandIndex));

                return (
                  <div
                    key={`hand-container-${handIndex}`}
                    className={`flex flex-col items-center transition-all duration-300 ${
                      hasSplit ? 'px-2 py-1 sm:px-4 sm:py-2 rounded-xl' : ''
                    }`}
                    style={hasSplit ? {
                      background: isActiveHand
                        ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.15), rgba(6, 182, 212, 0.05))'
                        : isCompletedHand
                        ? 'linear-gradient(145deg, rgba(100, 100, 100, 0.1), rgba(50, 50, 50, 0.05))'
                        : 'transparent',
                      border: isActiveHand
                        ? '2px solid rgba(6, 182, 212, 0.5)'
                        : isCompletedHand
                        ? '1px solid rgba(100, 100, 100, 0.3)'
                        : '1px solid transparent',
                      boxShadow: isActiveHand
                        ? '0 0 20px rgba(6, 182, 212, 0.3), inset 0 0 10px rgba(6, 182, 212, 0.1)'
                        : 'none',
                      opacity: isCompletedHand ? 0.7 : 1,
                      transform: isActiveHand ? 'scale(1.02)' : 'scale(1)',
                    } : {}}
                  >
                    {/* Hand Label for Split */}
                    {hasSplit && (
                      <div className="mb-0 flex items-center gap-1 sm:gap-2">
                        <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${
                          isActiveHand ? 'text-cyan-400' : 'text-white/40'
                        }`}>
                          Hand {handIndex + 1}
                        </span>
                        {isActiveHand && (
                          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                        )}
                      </div>
                    )}

                    {/* Hand Score */}
                    <div className="flex items-center gap-1 sm:gap-2 mb-0">
                      <span className={`font-black ${hasSplit ? 'text-lg sm:text-2xl' : 'text-4xl'} ${
                        isActiveHand ? 'text-white' : hasSplit ? 'text-white/70' : 'text-white'
                      }`}>
                        {hand.total}
                      </span>
                      {hand.isBlackjack && <span className="text-yellow-400 font-black text-2xl sm:text-2xl">BJ!</span>}
                      {hand.isBust && <span className="text-red-400 font-black text-2xl sm:text-2xl">BUST</span>}
                    </div>

                    {/* Cards - Use smaller cards on mobile when split */}
                    <div
                      className="flex"
                      style={{
                        perspective: '800px',
                        perspectiveOrigin: 'center top'
                      }}
                    >
                      {hand.cards.map((card, cardIndex) => {
                        // Determine if card is new
                        let isNewCard = false;
                        if (Array.isArray(newCardIndices.player)) {
                          isNewCard = handIndex < newCardIndices.player.length && newCardIndices.player[handIndex].has(cardIndex);
                        } else {
                          isNewCard = newCardIndices.player.has(cardIndex);
                        }

                        return (
                          <div
                            key={`player-${handIndex}-${cardIndex}`}
                            style={{
                              marginLeft: cardIndex > 0 ? (hasSplit ? '5px' : '10px') : '0',
                              zIndex: cardIndex
                            }}
                          >
                            {/* Show small cards on mobile (< sm) when split, normal otherwise */}
                            <div className={hasSplit ? 'sm:hidden' : 'hidden'}>
                              <PlayingCard
                                card={card}
                                owner="player"
                                className=""
                                index={cardIndex}
                                isNewCard={isNewCard}
                                size="small"
                              />
                            </div>
                            <div className={hasSplit ? 'hidden sm:block' : 'block'}>
                              <PlayingCard
                                card={card}
                                owner="player"
                                className=""
                                index={cardIndex}
                                isNewCard={isNewCard}
                                size="normal"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Chip Stack Under Each Split Hand */}
                    {hasSplit && chipStack.length > 0 && (
                      <div className="mt-2 flex flex-col items-center">
                        {/* Chips for this hand - show half the total chips */}
                        <div
                          className="relative"
                          style={{
                            width: '40px',
                            height: `${Math.max(40, Math.ceil(chipStack.length / 2) * 2 + 40)}px`
                          }}
                        >
                          {/* Split chips evenly between hands */}
                          {chipStack
                            .slice(
                              handIndex === 0 ? 0 : Math.ceil(chipStack.length / 2),
                              handIndex === 0 ? Math.ceil(chipStack.length / 2) : chipStack.length
                            )
                            .map((chipValue, index) => {
                              const chipImage = getChipImage(chipValue);
                              const stackOffset = index * 2;

                              return (
                                <div
                                  key={`split-chip-${handIndex}-${index}`}
                                  className="absolute w-10 h-10 rounded-full"
                                  style={{
                                    background: `url('${chipImage}') center/contain no-repeat`,
                                    bottom: `${stackOffset}px`,
                                    left: '0',
                                    zIndex: 10 + index,
                                  }}
                                />
                              );
                            })}
                        </div>
                        {/* Bet amount for this hand */}
                        <span
                          className="text-white font-bold text-sm mt-1"
                          style={{
                            textShadow: '1px 1px 3px rgba(0, 0, 0, 0.8)',
                          }}
                        >
                          {chipStack
                            .slice(
                              handIndex === 0 ? 0 : Math.ceil(chipStack.length / 2),
                              handIndex === 0 ? Math.ceil(chipStack.length / 2) : chipStack.length
                            )
                            .reduce((sum, chip) => sum + chip, 0)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions Area - Dock at bottom left */}
        {(canHit || canStand || canDoubleDown || canSplit) && (
          <div className="absolute bottom-0 right-[30px] z-20">
            <Dock
              iconSize={65}
              iconMagnification={80}
              iconDistance={80}
              direction="bottom"
              className="!h-auto !gap-2 !p-2 !mt-0 !rounded-2xl"
              style={{
                background: 'linear-gradient(145deg, rgba(62, 17, 98, 0.95), rgba(6, 12, 21, 0.6))',
                border: '1px solid rgba(50, 9, 125, 0.81)',
                boxShadow: '0 8px 32px rgba(38, 38, 38, 0.5), inset 0 1px 0 rgba(84, 33, 162, 0.1)',
              } as React.CSSProperties}
            >
              {canHit && (
                <DockIcon
                  onClick={() => onAction(Action.HIT)}
                  className="dock-icon-hit !p-0"
                >
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-400/50 shadow-lg">
                    <span className="text-white font-black text-sm tracking-wider">HIT</span>
                  </div>
                </DockIcon>
              )}
              {canStand && (
                <DockIcon
                  onClick={() => onAction(Action.STAND)}
                  className="dock-icon-stand !p-0"
                >
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/50 to-blue-700/50 border-2 border-blue-400/50 shadow-lg">
                    <span className="text-white font-black text-sm tracking-wider">STAND</span>
                  </div>
                </DockIcon>
              )}
              {canDoubleDown && (
                <DockIcon
                  onClick={() => {
                    onDoubleDownChips?.();
                    onAction(Action.DOUBLE_DOWN);
                  }}
                  className="dock-icon-double !p-0"
                >
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-amber-400/50 shadow-lg">
                    <span className="text-white font-black text-xs tracking-wider">DOUBLE</span>
                  </div>
                </DockIcon>
              )}
              {canSplit && (
                <DockIcon
                  onClick={() => {
                    onSplitChips?.();
                    onAction(Action.SPLIT);
                  }}
                  className="dock-icon-split !p-0"
                >
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-400/50 shadow-lg">
                    <span className="text-white font-black text-sm tracking-wider">SPLIT</span>
                  </div>
                </DockIcon>
              )}
            </Dock>
          </div>
        )}

        {/* Stacked Chip Display with Betting Controls - Bottom Center */}
        {/* Only show center chips when NOT split - split hands show chips under each hand */}
        <div className="absolute bottom-27 left-1/2 transform -translate-x-1/2 z-15 flex items-end">
          {/* Chip Stack - hide when split (chips are shown under each hand) */}
          {chipStack.length > 0 && !hasSplit && (
            <div
              className={`relative ${
                chipAnimationState === 'loss' ? 'chip-stack-lose' :
                chipAnimationState === 'win' ? 'chip-stack-win' : ''
              }`}
              style={{ width: '64px', height: `${Math.max(64, chipStack.length * 3 + 64)}px` }}
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
                      left: '0',
                      zIndex: 10 + index,
                      animationDelay: `${index * 0.05}s`,
                    }}
                  >
                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <span
                        className="font-bold text-white text-shadow"
                        style={{
                          textShadow: '2px 2px 4px rgba(0, 0, 0, 0), -1px -1px 2px rgba(0, 0, 0, 0)',
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

          {/* Betting Controls - Right side of chips */}
          {!isPlaying && (
            <div className="relative bottom-[-55px] right-[-150px] z-20 gap-02 mb-2">
              {/* REBET Button */}
              <button
                onClick={onRebet}
                className="px-3 py-1.5 pb-1 pt-3 rounded-sm font-bold text-2xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 text-green-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(145deg, rgba(15, 23, 42, 0), rgba(30, 41, 59, 0))',
                  boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0), 0 2px 8px rgba(0, 0, 0, 0)',
                  border: '1px solid rgba(6, 181, 212, 0)',
                }}
              >
                REBET
              </button>

              {/* 1/2 and 2x Buttons Row */}
              <div className="flex gap-0.5">
                <button
                  onClick={onHalfBet}
                  disabled={chipStack.length === 0}
                  className="flex-1 px-2 py-1.5 rounded-sm font-bold text-2xl transition-all hover:scale-105 active:scale-95 text-green-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(145deg, rgba(15, 23, 42, 0), rgba(30, 41, 59, 0))',
                    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0), 0 2px 8px rgba(0, 0, 0, 0)',
                    border: '1px solid rgba(245, 159, 11, 0)',
                  }}
                >
                  1/2
                </button>
                <button
                  onClick={onDoubleBet}
                  disabled={chipStack.length === 0}
                  className="flex-1 px-2 py-1.5 rounded-sm font-bold text-2xl transition-all hover:scale-105 active:scale-95 text-green-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(145deg, rgba(15, 23, 42, 0), rgba(30, 41, 59, 0.04))',
                    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0), 0 2px 8px rgba(0, 0, 0, 0)',
                    border: '1px solid rgba(34, 197, 94, 0)',
                  }}
                >
                  2x
                </button>
              </div>

              {/* DEAL Button */}
              <button
                onClick={onStartGame}
                disabled={!canDeal || chipStack.length === 0}
                className="px-3 py-2 rounded-sm font-bold text-3xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 text-green-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: canDeal && chipStack.length > 0
                    ? 'linear-gradient(145deg, rgba(6, 181, 212, 0), rgba(8, 144, 178, 0))'
                    : 'linear-gradient(145deg, rgba(35, 45, 55, 0.9), rgba(25, 35, 45, 0.9))',
                  boxShadow: canDeal && chipStack.length > 0
                    ? 'inset 2px 2px 4px rgba(255, 255, 255, 0), inset -2px -2px 4px rgba(0, 0, 0, 0), 0 4px 12px rgba(6, 181, 212, 0)'
                    : 'inset 2px 2px 4px rgba(0, 0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0)',
                  border: canDeal && chipStack.length > 0
                    ? '1px solid rgba(6, 181, 212, 0)'
                    : '1px solid rgba(60, 60, 60, 0)',
                }}
              >
                DEAL
              </button>
            </div>
          )}
        </div>

      </div>

      <style jsx global>{`
        /* Result banner animation */
        @keyframes resultBannerIn {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(-20px);
          }
          50% {
            transform: scale(1.1) translateY(0);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .animate-result-banner {
          animation: resultBannerIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

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

        /* Dock icon styles - make inner wrapper relative for absolute children */
        .dock-icon-hit > div,
        .dock-icon-stand > div,
        .dock-icon-double > div,
        .dock-icon-split > div {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .dock-icon-hit > div > div,
        .dock-icon-stand > div > div,
        .dock-icon-double > div > div,
        .dock-icon-split > div > div {
          transition: all 0.2s ease-out;
        }
        .dock-icon-hit:hover > div > div {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .dock-icon-stand:hover > div > div {
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .dock-icon-double:hover > div > div {
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .dock-icon-split:hover > div > div {
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .dock-icon-hit:active > div > div,
        .dock-icon-stand:active > div > div,
        .dock-icon-double:active > div > div,
        .dock-icon-split:active > div > div {
          transform: scale(0.95);
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
