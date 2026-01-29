'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Hand, GameState, Action, GameResult } from '@/app/BLACKJACK/types';
import { formatEther } from 'viem';
import PlayingCard from './PlayingCard';
import { SystemTime } from '@/components/ui/system-time';
import BettingPanel from './BettingPanel';
import { NumberTicker } from '@/components/ui/number-ticker';

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
  totalPayout?: bigint;
  onDoubleDownChips?: () => void;
  onSplitChips?: () => void;
  onRebet?: () => void;
  onHalfBet?: () => void;
  onDoubleBet?: () => void;
  canDeal?: boolean;
  // BettingPanel props
  onBetAmountChange?: (betAmount: string, chipValue?: number, clearAll?: boolean) => void;
  currentBetAmount?: string;
  lastBetAmount?: string;
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
  canDeal = false,
  totalPayout = BigInt(0),
  onBetAmountChange,
  currentBetAmount = '0',
  lastBetAmount = '0'
}) => {
  // State for progressive dealer card reveal
  // Industry standard: Show only first card during play, reveal all when game completes
  const [visibleDealerCards, setVisibleDealerCards] = useState(() => {
    // Always start with showing only 1 card (hole card hidden)
    // The reveal animation will progressively show more cards when game completes
    // Never show all cards immediately - always require reveal animation
    return dealerHand.cards.length >= 2 ? 1 : dealerHand.cards.length;
  });
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevGameStateRef = useRef<GameState>(gameState);
  const prevDealerCardCountRef = useRef(dealerHand.cards.length);

  // Chip animation state
  const [chipAnimationState, setChipAnimationState] = useState<'none' | 'win' | 'loss'>('none');
  const prevGameResult = useRef<string | null>(null);
  const tableVideoRef = useRef<HTMLVideoElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Draggable widget state (all screens)
  const [widgetPosition, setWidgetPosition] = useState({ x: 0, y: 0 }); // Will be set from saved or default
  const [isHorizontal, setIsHorizontal] = useState(false); // false = vertical (0deg), true = horizontal (90deg)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Load saved position/orientation from localStorage or set default
  // Position is stored as pixels relative to table container (not viewport)
  useEffect(() => {
    if (tableContainerRef.current) {
      const tableRect = tableContainerRef.current.getBoundingClientRect();
      const saved = localStorage.getItem('blackjack-widget-position');
      if (saved) {
        try {
          const { x, y, horizontal } = JSON.parse(saved);
          // Set initial position - will be validated after widget renders
          setWidgetPosition({ x, y });
          setIsHorizontal(horizontal === true);
        } catch (e) {
          // Fallback to default if parse fails
          setWidgetPosition({ 
            x: 40, 
            y: tableRect.height * 0.6 // 60% down from table top
          });
          setIsHorizontal(false);
        }
      } else {
        // Default position: left side of table, 60% down from table top, vertical orientation
        // Position is relative to table container (not viewport)
        setWidgetPosition({ 
          x: 40, 
          y: tableRect.height * 0.6
        });
        setIsHorizontal(false);
      }
    }
  }, []);

  // Save position/orientation to localStorage
  const saveWidgetState = (x: number, y: number, horizontal: boolean) => {
    localStorage.setItem('blackjack-widget-position', JSON.stringify({ x, y, horizontal }));
  };

  // Toggle between horizontal and vertical orientation
  const toggleOrientation = () => {
    const newOrientation = !isHorizontal;
    setIsHorizontal(newOrientation);
    saveWidgetState(widgetPosition.x, widgetPosition.y, newOrientation);
  };

  // Update widget position when table resizes or widget renders (position is relative to table, so no scroll handler needed)
  useEffect(() => {
    if (!tableContainerRef.current || !widgetRef.current) return;

    const updatePosition = () => {
      const tableRect = tableContainerRef.current?.getBoundingClientRect();
      const widgetRect = widgetRef.current?.getBoundingClientRect();
      if (!tableRect || !widgetRect) return;

      // Get actual widget dimensions from the rendered element
      const widgetWidth = widgetRect.width;
      const widgetHeight = widgetRect.height;

      // Validate current position is still within table bounds
      // Position (x, y) is the center point relative to table container
      // With translate(-50%, -50%), the widget is centered on this point
      // To reach left edge: center at widgetWidth/2 (left edge at 0)
      // To reach right edge: center at tableWidth - widgetWidth/2 (right edge at tableWidth)
      // To reach top edge: center at widgetHeight/2 (top edge at 0)  
      // To reach bottom edge: center at tableHeight - widgetHeight/2 (bottom edge at tableHeight)
      const minX = widgetWidth / 2;
      const maxX = tableRect.width - widgetWidth / 2;
      const minY = widgetHeight / 2;
      const maxY = tableRect.height - widgetHeight / 2;

      // Ensure max values are valid (at least equal to min)
      const validMaxX = Math.max(minX, maxX);
      const validMaxY = Math.max(minY, maxY);

      setWidgetPosition(prev => {
        // Ensure position allows widget to reach all edges of table
        const constrainedX = Math.max(minX, Math.min(prev.x, validMaxX));
        const constrainedY = Math.max(minY, Math.min(prev.y, validMaxY));
        return { x: constrainedX, y: constrainedY };
      });
    };

    window.addEventListener('resize', updatePosition);
    
    // Initial update after delays to ensure table and widget are fully rendered
    const timeout1 = setTimeout(updatePosition, 100);
    const timeout2 = setTimeout(updatePosition, 300);
    const timeout3 = setTimeout(updatePosition, 500);

    return () => {
      window.removeEventListener('resize', updatePosition);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [isHorizontal]);

  // Handle mouse/touch down for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!tableContainerRef.current) return;
    
    // Don't start drag if clicking on a button
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    e.preventDefault();
    const tableRect = tableContainerRef.current.getBoundingClientRect();
    
    // Only drag if clicking on the background/padding area
    // Calculate offset relative to table container
    const mouseXRelativeToTable = e.clientX - tableRect.left;
    const mouseYRelativeToTable = e.clientY - tableRect.top;
    setIsDragging(true);
    setDragStart({
      x: mouseXRelativeToTable - widgetPosition.x,
      y: mouseYRelativeToTable - widgetPosition.y,
    });
  };

  // Handle mouse/touch move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      
      if (!clientX || !clientY) return;
      if (isDragging && tableContainerRef.current) {
        // Get table bounds
        const tableRect = tableContainerRef.current.getBoundingClientRect();
        
        // Convert mouse position to coordinates relative to table container
        const mouseXRelativeToTable = e.clientX - tableRect.left;
        const mouseYRelativeToTable = e.clientY - tableRect.top;
        
        // Calculate new position relative to table
        const newX = mouseXRelativeToTable - dragStart.x;
        const newY = mouseYRelativeToTable - dragStart.y;
        
        // Get widget dimensions to properly constrain
        const rect = widgetRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const widgetWidth = rect.width;
        const widgetHeight = rect.height;
        
        // Constrain to table bounds (accounting for translate(-50%, -50%) which centers the widget)
        // Position (x, y) is the center point of the widget relative to table container
        // To reach left edge: center at widgetWidth/2 (left edge at 0)
        // To reach right edge: center at tableWidth - widgetWidth/2 (right edge at tableWidth)
        // To reach top edge: center at widgetHeight/2 (top edge at 0)
        // To reach bottom edge: center at tableHeight - widgetHeight/2 (bottom edge at tableHeight)
        const minX = widgetWidth / 2;
        const maxX = Math.max(minX, tableRect.width - widgetWidth / 2);
        const minY = widgetHeight / 2;
        const maxY = Math.max(minY, tableRect.height - widgetHeight / 2);
        
        // Clamp to bounds - ensure we can reach all edges
        const constrainedX = Math.max(minX, Math.min(newX, maxX));
        const constrainedY = Math.max(minY, Math.min(newY, maxY));
        
        setWidgetPosition({ x: constrainedX, y: constrainedY });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        saveWidgetState(widgetPosition.x, widgetPosition.y, isHorizontal);
      }
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleMouseMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleMouseMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, widgetPosition, isHorizontal]);

  // Sync glowingTable.mp4 to loop over 24 hours
  // Noon (12:00 PM) = 0% video, Midnight (12:00 AM) = 50% video
  const syncVideoTo24HourLoop = (video: HTMLVideoElement | null) => {
    if (!video || !Number.isFinite(video.duration)) return;
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    
    // Calculate seconds since noon (12:00 PM)
    // Noon = 0 seconds, Midnight = 43200 seconds (12 hours)
    let secondsSinceNoon = (hours - 12) * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    
    // Handle wrap-around: if before noon, add 24 hours
    if (secondsSinceNoon < 0) {
      secondsSinceNoon += 86400;
    }
    
    // Map to video duration:
    // 0 seconds (noon) = 0% video
    // 43200 seconds (midnight) = 50% video
    // 86400 seconds (next noon) = 100% video
    const progress = secondsSinceNoon / 86400;
    video.currentTime = progress * video.duration;
  };

  // Re-sync video position every 60s to stay aligned with 24-hour loop
  useEffect(() => {
    // Initial sync
    if (tableVideoRef.current) {
      syncVideoTo24HourLoop(tableVideoRef.current);
    }
    const interval = setInterval(() => syncVideoTo24HourLoop(tableVideoRef.current), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Handle chip animations when game result changes
  useEffect(() => {
    if (gameResult && gameResult !== prevGameResult.current) {
      if (gameResult === 'win' || gameResult === 'blackjack') {
        setChipAnimationState('win');
        // Reset animation state after all chips complete
        // Each chip has 0.2s stagger delay, animation duration is 3.2s per chip
        // Total = (last chip delay) + (animation duration)
        const totalDuration = (chipStack.length - 1) * 200 + 3200;
        const timer = setTimeout(() => {
          setChipAnimationState('none');
          onChipAnimationComplete?.();
        }, totalDuration);

        return () => clearTimeout(timer);
      } else if (gameResult === 'loss') {
        setChipAnimationState('loss');
        // Reset animation state after animation completes
        const timer = setTimeout(() => {
          setChipAnimationState('none');
          onChipAnimationComplete?.();
        }, 800); // Animation duration

        return () => clearTimeout(timer);
      }
      // Push result for wins is handled like original bet stays (no animation needed for push)
    }
    prevGameResult.current = gameResult;
  }, [gameResult, onChipAnimationComplete, chipStack.length]);

  // Store callback in ref to avoid re-triggering useEffect
  const onDealerRevealCompleteRef = useRef(onDealerRevealComplete);
  useEffect(() => {
    onDealerRevealCompleteRef.current = onDealerRevealComplete;
  }, [onDealerRevealComplete]);

  // Manage dealer card visibility based on game state
  // Industry standard: Show only first card during play, reveal all when complete
  useEffect(() => {
    const totalCards = dealerHand.cards.length;
    const prevCardCount = prevDealerCardCountRef.current;
    const prevState = prevGameStateRef.current;
    
    // Only clear pending reveal timeouts when gameState transitions away from COMPLETE
    // Don't clear during an active reveal sequence (when isRevealing is true or when visibleDealerCards is changing)
    const stateTransitionedAway = prevState === GameState.COMPLETE && gameState !== GameState.COMPLETE;
    if (stateTransitionedAway && revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    // Game completed: Start reveal sequence
    // Trigger if: gameState just became COMPLETE OR gameState is COMPLETE and dealer cards increased
    const gameJustCompleted = gameState === GameState.COMPLETE && prevState !== GameState.COMPLETE;
    const dealerCardsArrived = gameState === GameState.COMPLETE && totalCards > prevCardCount && prevCardCount >= 2;
    const shouldStartReveal = (gameJustCompleted || dealerCardsArrived) && !isRevealing && visibleDealerCards < totalCards;
    
    if (shouldStartReveal) {
      setIsRevealing(true);
      
      if (totalCards > 2) {
        // Dealer drew additional cards: reveal progressively
        // First, reveal the hole card (second card) after a brief delay
        revealTimeoutRef.current = setTimeout(() => {
          setVisibleDealerCards(2);
          
          // Then reveal additional cards one at a time
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
          
          // Start revealing additional cards after showing initial 2
          revealTimeoutRef.current = setTimeout(revealNextCard, 2000);
        }, 1000); // 1 second delay before revealing hole card
      } else {
        // Only 2 cards: reveal hole card after brief delay, then complete
        revealTimeoutRef.current = setTimeout(() => {
          setVisibleDealerCards(2);
          setIsRevealing(false);
          onDealerRevealCompleteRef.current?.();
        }, 1000); // 1 second delay before revealing hole card
      }
    }
    // During play (WAITING, PLAYER_TURN, DEALER_TURN): Show only first card
    else if (gameState !== GameState.COMPLETE && !isRevealing) {
      // Industry standard: Always show only first card during play
      // Hole card (second card) stays hidden until game completes
      // Force reset to 1 card if we're showing more than we should
      if (totalCards >= 2 && visibleDealerCards > 1) {
        setVisibleDealerCards(1);
      } else if (totalCards === 1 && visibleDealerCards > 1) {
        setVisibleDealerCards(1);
      } else if (totalCards === 0) {
        setVisibleDealerCards(0);
      }
      setIsRevealing(false);
    }
    // If transitioning away from COMPLETE (new game starting)
    else if (gameState !== GameState.COMPLETE && prevGameStateRef.current === GameState.COMPLETE) {
      // Reset for new game - always start with only first card visible
      if (totalCards >= 2) {
        setVisibleDealerCards(1);
      } else {
        setVisibleDealerCards(totalCards);
      }
      setIsRevealing(false);
      // Clear any pending reveal timeouts
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    }

    prevGameStateRef.current = gameState;
    prevDealerCardCountRef.current = totalCards;

    return () => {
      // Only clear timeout on unmount or when component is being destroyed
      // Don't clear during normal state updates (especially not when visibleDealerCards changes during reveal)
      // Note: We intentionally DON'T clear the timeout here because it should continue running
      // The timeout will be cleared when:
      // 1. Component unmounts (React will handle this)
      // 2. State transitions away from COMPLETE (handled above)
    };
  }, [gameState, dealerHand.cards.length, isRevealing]);

  // Track visibleDealerCards changes
  useEffect(() => {
    // This effect tracks visibleDealerCards changes but doesn't need to log anything
  }, [visibleDealerCards, dealerHand.cards.length, gameState, isRevealing]);

  // Industry standard: Hide hole card (second card) during play, show when game completes
  // Hide hole card when:
  // - Game is not complete AND
  // - There are exactly 2 cards (initial deal) AND
  // - We're showing only 1 card (hole card is hidden)
  const hideHoleCard = gameState !== GameState.COMPLETE && 
                       dealerHand.cards.length === 2 && 
                       visibleDealerCards === 1;

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

  // Debug logging (removed dealer card exposure)

  return (
    <div
      ref={tableContainerRef}
      className="relative w-full max-w-full sm:max-w-6xl mx-auto overflow-hidden blackjack-table"
      style={{
        minHeight: '500px',
        boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.9), inset 0 -2px 8px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {/* Looping video background (glowingTable.mp4) — loops over 24 hours */}
      <video
        ref={tableVideoRef}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        style={{ zIndex: 0 }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          // Sync to 24-hour loop
          syncVideoTo24HourLoop(el);
          // Ensure it plays
          el.play().catch(() => {
            // Autoplay may be blocked, but that's okay - user interaction will start it
          });
        }}
        onCanPlay={(e) => {
          const el = e.currentTarget;
          // Sync to 24-hour loop
          syncVideoTo24HourLoop(el);
          // Ensure it plays
          el.play().catch(() => {
            // Autoplay may be blocked, but that's okay - user interaction will start it
          });
        }}
        onError={(e) => {
          console.error('Video failed to load:', e.currentTarget.error);
        }}
      >
        <source src="/BlackJack/video%20table/glowingTable.mp4" type="video/mp4" />
      </video>

      {/* Subtle dark overlay to keep text readable */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background:
            'linear-gradient(145deg, rgba(0,0,0,0.45), rgba(0,0,0,0.25))',
        }}
      />

      {/* System Time Display */}
      <SystemTime />

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

      <div className="relative z-10 flex flex-col" style={{ height: '100%', minHeight: '700px' }}>
        {/* Play Area */}
        <div className="flex-1 relative w-full z-10" style={{ minHeight: '600px' }}>
          {/* Dealer Area */}
          <div className="absolute top-35 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div
              className="flex gap-2"
              style={{
                perspective: '800px',
                perspectiveOrigin: 'center center'
              }}
            >
              {/* Industry standard dealer card display:
                  - During play: Show first card face-up, second card (hole card) face-down
                  - When complete: Show all cards face-up */}
              {dealerHand.cards.map((card, index) => {
                // Only render cards up to visibleDealerCards
                // This ensures cards don't appear prematurely
                if (index >= visibleDealerCards) return null;
                
                // Determine if this card should be hidden (hole card during play)
                const isHoleCard = hideHoleCard && index === 1;
                
                return (
                  <PlayingCard
                    key={`dealer-${card.id || `card-${index}`}`}
                    card={card}
                    owner="dealer"
                    hidden={isHoleCard}
                    className=""
                    index={index}
                    isNewCard={index >= 2 && index === visibleDealerCards - 1}
                  />
                );
              })}
            </div>
            {visibleDealerCards > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-white font-black text-4xl">
                  {isRevealing ? getVisibleDealerTotal() : (gameState === GameState.COMPLETE ? dealerHand.total : getVisibleDealerTotal())}
                </span>
                {/* Only show BUST/BJ text when game is COMPLETE, reveal is done, AND all cards are visible */}
                {gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length && dealerHand.isBust && <span className="text-red-400 font-black text-ld">BUST</span>}
                {gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length && dealerHand.isBlackjack && <span className="text-yellow-400 font-black text-ld">BJ</span>}
              </div>
            )}
          </div>

          {/* Player Area */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-4 items-center">
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
                        perspectiveOrigin: 'center center'
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

        {/* Reserve Balance - Top Center */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div 
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-cyan-500/20 backdrop-blur-sm"
            style={{
              background: 'linear-gradient(145deg, rgba(16, 26, 35, 0.9), rgba(35, 36, 41, 0.9))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          >
            <span className="text-cyan-400/80 text-xs font-semibold mr-1">Reserve:</span>
            <NumberTicker
              value={Math.floor(Number(reserveBalance) / 1e18)}
              className="text-white text-sm font-bold"
            />
            <Image
              src="/morbius/MorbiusLogo (3).png"
              alt="Morbius"
              width={16}
              height={16}
              className="object-contain ml-1"
            />
          </div>
        </div>

        {/* Actions Area - Buttons (draggable/orientable on all screens) */}
        <div
          ref={widgetRef}
          className="cursor-move z-20 touch-none"
          style={{
            position: 'absolute',
            left: `${widgetPosition.x}px`,
            top: `${widgetPosition.y}px`,
            transform: `translate(-50%, -50%)`,
            transformOrigin: 'center center',
          }}
        >
          <div
            className={`${isHorizontal ? 'flex-row' : 'flex-col'} flex gap-2 p-2 rounded-2xl relative cursor-move`}
            style={{
              background: 'linear-gradient(145deg, rgba(62, 17, 98, 0.95), rgba(6, 12, 21, 0.6))',
              border: '1px solid rgba(50, 9, 125, 0.81)',
              boxShadow: '0 8px 32px rgba(38, 38, 38, 0.5), inset 0 1px 0 rgba(84, 33, 162, 0.1)',
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={(e) => {
              if (!tableContainerRef.current) return;
              const target = e.target as HTMLElement;
              if (target.tagName === 'BUTTON' || target.closest('button')) {
                return;
              }
              e.preventDefault();
              const tableRect = tableContainerRef.current.getBoundingClientRect();
              const touch = e.touches[0];
              const touchXRelativeToTable = touch.clientX - tableRect.left;
              const touchYRelativeToTable = touch.clientY - tableRect.top;
              setIsDragging(true);
              setDragStart({
                x: touchXRelativeToTable - widgetPosition.x,
                y: touchYRelativeToTable - widgetPosition.y,
              });
            }}
          >
            {/* Rotation toggle button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleOrientation();
              }}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-cyan-500/70 border-2 border-cyan-400 hover:bg-cyan-500/90 active:bg-cyan-500 transition-all z-50 flex items-center justify-center cursor-pointer touch-manipulation"
              style={{
                boxShadow: '0 2px 8px rgba(6, 182, 212, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)',
              }}
              title="Toggle horizontal/vertical orientation"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-cyan-200"
                  style={{
                    transform: isHorizontal ? 'rotate(-45deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <path
                    d="M6 2L10 6L6 10M2 6H10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            {/* HIT Button - Always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canHit) onAction(Action.HIT);
              }}
              disabled={!canHit}
              className={`relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canHit ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ 
                opacity: canHit ? 1 : 0.3,
                transform: isHorizontal ? 'rotate(0deg)' : 'rotate(0deg)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="text-white font-black text-sm tracking-wider">HIT</span>
            </button>
            
            {/* STAND Button - Always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canStand) onAction(Action.STAND);
              }}
              disabled={!canStand}
              className={`relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/50 to-blue-700/50 border-2 border-blue-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canStand ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ 
                opacity: canStand ? 1 : 0.3,
                transform: isHorizontal ? 'rotate(0deg)' : 'rotate(0deg)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="text-white font-black text-sm tracking-wider">STAND</span>
            </button>
            
            {/* DOUBLE Button - Always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canDoubleDown) {
                  onDoubleDownChips?.();
                  onAction(Action.DOUBLE_DOWN);
                }
              }}
              disabled={!canDoubleDown}
              className={`relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-amber-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canDoubleDown ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ 
                opacity: canDoubleDown ? 1 : 0.3,
                transform: isHorizontal ? 'rotate(0deg)' : 'rotate(0deg)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="text-white font-black text-xs tracking-wider">DOUBLE</span>
            </button>
            
            {/* SPLIT Button - Always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canSplit) {
                  onSplitChips?.();
                  onAction(Action.SPLIT);
                }
              }}
              disabled={!canSplit}
              className={`relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canSplit ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ 
                opacity: canSplit ? 1 : 0.3,
                transform: isHorizontal ? 'rotate(0deg)' : 'rotate(0deg)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="text-white font-black text-sm tracking-wider">SPLIT</span>
            </button>
          </div>
        </div>

        {/* Stacked Chip Display with Betting Controls - Bottom Center */}
        {/* Only show center chips when NOT split - split hands show chips under each hand */}
        <div className="absolute bottom-33 left-1/2 transform -translate-x-1/2 z-15 flex items-end">
          {/* Chip Stack - hide when split (chips are shown under each hand) */}
          {chipStack.length > 0 && !hasSplit && (
            <div
              className={`relative ${
                chipAnimationState === 'loss' ? 'chip-stack-lose' :
                chipAnimationState === 'win' ? 'chip-stack-win' : ''
              }`}
              style={{ width: '64px', height: `${Math.max(64, chipStack.length * 3 + 64)}px` }}
            >
              {/* Original bet chips - stay in place during win animation */}
              {chipStack.map((chipValue, index) => {
                const chipImage = getChipImage(chipValue);
                const stackOffset = index * 3; // 3px offset per chip for stacking

                return (
                  <div
                    key={`original-${chipValue}-${index}`}
                    className={`absolute w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${
                      chipAnimationState === 'loss' ? 'chip-lose' : ''
                    }`}
                    style={{
                      background: `url('${chipImage}') center/contain no-repeat`,
                      border: '2px solid rgba(0, 0, 0, 0)',
                      bottom: `${stackOffset}px`,
                      left: '0',
                      zIndex: 10 + index,
                      animationDelay: chipAnimationState === 'loss' ? `${index * 0.05}s` : '0s',
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
              {/* Winning chips - animate in from top during win animation */}
              {chipAnimationState === 'win' && (() => {
                // Calculate winning chips based on payout
                // For blackjack: payout is 1.5x bet (3:2), for regular win: payout is 2x bet (1:1)
                const totalBet = chipStack.reduce((sum, chip) => sum + chip, 0);
                
                // Convert payout from wei to whole tokens, or calculate based on result
                let payoutInTokens: number;
                if (totalPayout > BigInt(0)) {
                  // Use actual payout from server (already includes bet + winnings)
                  // Payout is total returned, so winning amount = payout - bet
                  const payoutWei = Number(totalPayout);
                  const betWei = totalBet * 1e18;
                  const winningWei = payoutWei - betWei;
                  payoutInTokens = Math.floor(winningWei / 1e18);
                } else {
                  // Fallback: calculate based on result type
                  if (gameResult === 'blackjack') {
                    // Blackjack pays 3:2 = 1.5x bet
                    payoutInTokens = Math.floor(totalBet * 1.5);
                  } else {
                    // Regular win pays 1:1 = 1x bet
                    payoutInTokens = totalBet;
                  }
                }
                
                // Calculate how many chips to show for the payout
                // Convert payout to chip stack representation
                const winningChips: number[] = [];
                let remaining = payoutInTokens;
                const chipValues = [1000, 100, 25, 10, 5];
                
                for (const chipValue of chipValues) {
                  while (remaining >= chipValue) {
                    winningChips.push(chipValue);
                    remaining -= chipValue;
                  }
                }
                
                return winningChips.map((chipValue, index) => {
                  const chipImage = getChipImage(chipValue);
                  return (
                    <div
                      key={`win-${chipValue}-${index}`}
                      className="absolute w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden chip-win"
                      style={{
                        background: `url('${chipImage}') center/contain no-repeat`,
                        border: '2px solid rgba(0, 0, 0, 0)',
                        bottom: `${chipStack.length * 3 + 10}px`,
                        left: '0',
                        zIndex: 100 + index,
                        animationDelay: `${index * 0.2}s`,
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
                });
              })()}
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
                  className="font-black text-md text-white"
                  style={{
                    textShadow: '2px 2px 6px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {chipStack.reduce((sum, chip) => sum + chip, 0)}
                </span>
              </div>
            </div>
          )}

          {/* Betting Controls - Right side of chips (Desktop only) */}
          {!isPlaying && (
            <div className="hidden lg:block relative bottom-[-35px] right-[-165px] z-20 gap-02 mb-2">
              {/* DEAL Button */}
              <button
                onClick={onStartGame}
                disabled={!canDeal || chipStack.length === 0}
                className="px-3 py-2 rounded-sm font-bold text-3xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 text-green-500/70 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Betting Controls - Right side, bottom near edge */}
        {!isPlaying && (
          <>
            {/* Right Side Controls - DEAL */}
            <div className="absolute bottom-[140px] right-[70px] z-20 lg:hidden">
              {/* DEAL Button */}
              <button
                onClick={onStartGame}
                disabled={!canDeal || chipStack.length === 0}
                className="px-2 py-2 bg-gradient-to-b from-slate-900/90 to-slate-900/70 rounded-sm font-bold text-sm md:text-base uppercase tracking-wider transition-all hover:scale-105 active:scale-95 text-green-500/80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: canDeal && chipStack.length > 0
                    ? 'linear-gradient(145deg, rgba(7, 66, 77, 0.88), rgba(13, 82, 99, 0.94))'
                    : 'linear-gradient(145deg, rgba(35, 45, 55, 0.9), rgba(25, 35, 45, 0.9))',
                  boxShadow: canDeal && chipStack.length > 0
                    ? 'inset 2px 2px 4px rgba(255, 255, 255, 0.2), inset -2px -2px 4px rgba(0, 0, 0, 0.69), 0 4px 12px rgba(20, 117, 136, 0.3)'
                    : 'inset 2px 2px 4px rgba(0, 0, 0, 0.89), inset -2px -2px 4pxrgba(255, 255, 255, 0))',
                  border: canDeal && chipStack.length > 0
                    ? '1px solid rgba(0, 221, 255, 0.78)'
                    : '1px solid rgba(9, 204, 252, 0.93)',
                }}
              >
                DEAL
              </button>
            </div>
          </>
        )}

        {/* Betting Panel - Bottom of table, under betting controls */}
        <div className="mt-8 w-full">
          <BettingPanel
            onStartGame={onStartGame || (() => {})}
            isPlaying={isPlaying}
            reserveBalance={reserveBalance}
            onBetAmountChange={onBetAmountChange}
            currentBetAmount={currentBetAmount}
            lastBetAmount={lastBetAmount}
            onRebet={onRebet}
            onHalfBet={onHalfBet}
            onDoubleBet={onDoubleBet}
          />
        </div>

        {/* Clear Button - Own row under betting panel */}
        <div className="mt-0.5 w-full flex justify-center">
          <button
            onClick={() => onBetAmountChange?.('', undefined, true)}
            disabled={isPlaying}
            className="px-1.5 py-0.5 md:px-2 md:py-1 lg:px-3 lg:py-1 rounded font-bold text-xs md:text-sm lg:text-lg uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300/70"
            style={{
              background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(60, 60, 60, 0.3)',
            }}
          >
            Clear
          </button>
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

        /* Chip win animation - slides down from top to right of bet, waits 2s, then slides off screen */
        @keyframes chipWin {
          0% {
            /* Start from top of container */
            transform: translateX(-50%) translateY(-600px) scale(1);
            opacity: 1;
          }
          18.75% {
            /* Arrive at position to the right of initial bet (100px to the right of center) */
            transform: translateX(100px) translateY(0) scale(1);
            opacity: 1;
          }
          81.25% {
            /* Hold position for 2 seconds (2.6s into 3.2s total = 0.6s slide + 2s wait) */
            transform: translateX(100px) translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            /* Slide down off screen */
            transform: translateX(100px) translateY(600px) scale(0.8);
            opacity: 0;
          }
        }

        .chip-win {
          animation: chipWin 3.2s ease-in-out forwards;
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
