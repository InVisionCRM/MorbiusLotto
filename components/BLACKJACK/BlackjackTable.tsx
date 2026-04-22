'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward, IconVolume, IconChevronDown } from '@tabler/icons-react';
import Image from 'next/image';
import { Hand, GameState, Action, GameResult, Card } from '@/app/BLACKJACK/types';
import type { CardValue, Suit } from '@/app/BLACKJACK/types';
import PlayingCard from './PlayingCard';
import DealerSection from './DealerSection';
import BettingPanel from './BettingPanel';
import { useBlackjackRevealCompletion } from '@/hooks/use-blackjack-reveal-completion';
import { BLACKJACK_IMAGE_BACKGROUNDS, DEFAULT_BLACKJACK_IMAGE_ID, ANIMATION_TIMINGS } from '@/app/BLACKJACK/constants';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { useAccount } from 'wagmi';
import { isAdminWallet } from '@/lib/admin';
import { truncateTranscriptWords } from '@/lib/speech-display';
import './bet-tier-animations.css';

/**
 * Bet-tier deal animation selector. Applied to player's first 2 cards only.
 * Flip to disable the tier escalation and fall back to the default cardSlideIn.
 */
const ENABLE_BET_TIER_ANIMS = true;
function getBetTierClass(betAmount: string | number | undefined): string {
  if (!ENABLE_BET_TIER_ANIMS) return '';
  const n = typeof betAmount === 'number'
    ? betAmount
    : parseFloat(String(betAmount ?? '0').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n <= 9999) return 'bet-tier-1';
  if (n <= 20000) return 'bet-tier-2';
  if (n <= 29999) return 'bet-tier-3';
  if (n <= 40000) return 'bet-tier-4';
  return 'bet-tier-5';
}

// Background music playlist moved to page.tsx to avoid duplicate audio instances

const SPEECH_LIVE_TRANSCRIPT_MAX_WORDS = 4;

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
  /** Rebet and deal in one action: same bet as last hand, then start game */
  onRebetAndDeal?: () => void;
  onHalfBet?: () => void;
  onDoubleBet?: () => void;
  canDeal?: boolean;
  // BettingPanel props
  onBetAmountChange?: (betAmount: string, chipValue?: number, clearAll?: boolean) => void;
  currentBetAmount?: string;
  lastBetAmount?: string;
  useVideoBackground?: boolean;
  imageSource?: string;
  videoSource?: string;
  /** When set, overrides lookup from constants (e.g. when using API table list). */
  imageSrc?: string;
  /** When set, overrides lookup from constants (e.g. when using API table list). */
  videoSrc?: string;
  videoSyncToClock?: boolean;
  videoPosition?: number;
  onOpenDepositModal?: () => void;
  onOpenTableThemeSelector?: () => void;
  soundEnabled?: boolean;
  /** Play a sound effect via Web Audio API (avoids interrupting background music). When provided, SFX use this instead of new Audio().play() */
  onPlaySfx?: (path: string) => void;
  /** When true (e.g. tournament mode), the betting panel is hidden; controls move to sidebar tab */
  hideBettingPanel?: boolean;
  /** When game is COMPLETE, pass current game id so dealer-reveal completion can reset for each new game (fixes freeze when back-to-back blackjack). */
  completedGameId?: string;
  /** Called after cards clear animation (2s hold + exit animation). Parent should clear currentGame so table resets. */
  onCardsClearComplete?: () => void;
  /** Perfect Pairs side bet amount in whole MORBIUS (0-10000). */
  perfectPairsBet?: number;
  /** Callback when PP bet changes (cycles 0→1k→2k→...→10k→0). */
  onPerfectPairsBetChange?: (amount: number) => void;
  /** Perfect Pairs result from the completed game — drives PP chip animation. */
  perfectPairsResult?: 'perfect' | 'colored' | 'mixed';
  /** Music player controls (passed from parent to avoid duplicate audio instances) */
  musicTrackName?: string;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  onNextTrack?: () => void;
  musicVolume?: number;
  onMusicVolumeChange?: (value: number) => void;
  /** When set, show a centered tournament hand summary (rank, winnings, stats) after a hand completes */
  tournamentHandSummary?: {
    chipDelta: number;
    chips: number;
    rank: number;
    handsRemaining: number;
    handsPlayed: number;
    result: 'win' | 'loss' | 'push' | 'blackjack';
  } | null;
  /** Dismiss the tournament hand summary overlay */
  onDismissTournamentSummary?: () => void;
  /** Open tournament history (e.g. from summary overlay) */
  onOpenTournamentHistory?: () => void;
  /** When true (tournament mode), use longer delay before DEAL/REBET appears to avoid race where pressing DEAL too soon causes action buttons to not show */
  inTournament?: boolean;
  /** Active tier limits — passed to BettingPanel */
  betLimits?: { MIN_BET: bigint; MAX_BET: bigint };
  /** Speech toggle — renders inline in the top-right button row with readbacks below */
  speechToggle?: { listening: boolean; onToggle: () => void; transcript: string; lastAction: string | null; pendingLabel: string | null };
  /** Opens in new tab — "How it works" next to voice when speech is shown */
  voiceTutorialVideoUrl?: string;
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
  newCardIndices = { player: new Set(), dealer: new Set() },
  chipStack = [],
  onStartGame,
  isPlaying = false,
  onDealerRevealComplete,
  gameResult = null,
  displayedResult = null,
  onChipAnimationComplete,
  musicTrackName,
  isMusicPlaying,
  onToggleMusic,
  onNextTrack,
  musicVolume = 20,
  onMusicVolumeChange,
  onDoubleDownChips,
  onSplitChips,
  onRebet,
  onRebetAndDeal,
  onHalfBet,
  onDoubleBet,
  canDeal = false,
  totalPayout = BigInt(0),
  onBetAmountChange,
  currentBetAmount = '0',
  lastBetAmount = '0',
  useVideoBackground: _useVideoBackground = true,
  imageSource = DEFAULT_BLACKJACK_IMAGE_ID,
  videoSource: _videoSource = 'glowingTable',
  imageSrc: imageSrcProp,
  videoSrc: _videoSrcProp,
  videoSyncToClock: _videoSyncToClock = true,
  videoPosition: _videoPosition = 50,
  onOpenDepositModal,
  onOpenTableThemeSelector,
  soundEnabled = true,
  onPlaySfx,
  hideBettingPanel = false,
  completedGameId,
  onCardsClearComplete,
  perfectPairsBet = 0,
  onPerfectPairsBetChange,
  perfectPairsResult,
  tournamentHandSummary,
  onDismissTournamentSummary,
  onOpenTournamentHistory,
  inTournament = false,
  betLimits,
  speechToggle,
  voiceTutorialVideoUrl,
}) => {
  // ── Admin layout test: cycle through preset hands ───────────────────────────
  const { address: adminCheckAddress } = useAccount();
  const isAdmin = isAdminWallet(adminCheckAddress);
  const [testHandIndex, setTestHandIndex] = useState<number | null>(null);

  const TEST_SCENARIOS: { label: string; player: Hand; dealer: Hand; bet: number; split?: Hand[] }[] = [
    {
      label: '2 cards vs 2',
      player: { cards: [{ value: 10 as CardValue, suit: 'spades' as Suit }, { value: 8 as CardValue, suit: 'hearts' as Suit }], total: 18, hasAce: false, isBlackjack: false, isBust: false },
      dealer: { cards: [{ value: 7 as CardValue, suit: 'clubs' as Suit }, { value: 10 as CardValue, suit: 'diamonds' as Suit }], total: 17, hasAce: false, isBlackjack: false, isBust: false },
      bet: 500,
    },
    {
      label: '4 cards (hit)',
      player: { cards: [{ value: 3 as CardValue, suit: 'hearts' as Suit }, { value: 5 as CardValue, suit: 'clubs' as Suit }, { value: 4 as CardValue, suit: 'diamonds' as Suit }, { value: 7 as CardValue, suit: 'spades' as Suit }], total: 19, hasAce: false, isBlackjack: false, isBust: false },
      dealer: { cards: [{ value: 9 as CardValue, suit: 'spades' as Suit }, { value: 8 as CardValue, suit: 'hearts' as Suit }], total: 17, hasAce: false, isBlackjack: false, isBust: false },
      bet: 2500,
    },
    {
      label: 'Soft hand (A+8)',
      player: { cards: [{ value: 1 as CardValue, suit: 'hearts' as Suit }, { value: 8 as CardValue, suit: 'diamonds' as Suit }], total: 19, hasAce: true, isBlackjack: false, isBust: false },
      dealer: { cards: [{ value: 7 as CardValue, suit: 'clubs' as Suit }, { value: 10 as CardValue, suit: 'spades' as Suit }], total: 17, hasAce: false, isBlackjack: false, isBust: false },
      bet: 3000,
    },
    {
      label: 'Blackjack',
      player: { cards: [{ value: 1 as CardValue, suit: 'spades' as Suit }, { value: 13 as CardValue, suit: 'hearts' as Suit }], total: 21, hasAce: true, isBlackjack: true, isBust: false },
      dealer: { cards: [{ value: 6 as CardValue, suit: 'clubs' as Suit }, { value: 10 as CardValue, suit: 'diamonds' as Suit }], total: 16, hasAce: false, isBlackjack: false, isBust: false },
      bet: 10000,
    },
    {
      label: 'Bust (5 cards)',
      player: { cards: [{ value: 6 as CardValue, suit: 'hearts' as Suit }, { value: 5 as CardValue, suit: 'diamonds' as Suit }, { value: 4 as CardValue, suit: 'clubs' as Suit }, { value: 3 as CardValue, suit: 'spades' as Suit }, { value: 7 as CardValue, suit: 'hearts' as Suit }], total: 25, hasAce: false, isBlackjack: false, isBust: true },
      dealer: { cards: [{ value: 10 as CardValue, suit: 'spades' as Suit }, { value: 9 as CardValue, suit: 'clubs' as Suit }], total: 19, hasAce: false, isBlackjack: false, isBust: false },
      bet: 75000,
    },
    {
      label: 'Split hand',
      player: { cards: [{ value: 8 as CardValue, suit: 'hearts' as Suit }, { value: 5 as CardValue, suit: 'clubs' as Suit }], total: 13, hasAce: false, isBlackjack: false, isBust: false },
      dealer: { cards: [{ value: 10 as CardValue, suit: 'diamonds' as Suit }, { value: 6 as CardValue, suit: 'spades' as Suit }], total: 16, hasAce: false, isBlackjack: false, isBust: false },
      bet: 1500,
      split: [
        { cards: [{ value: 8 as CardValue, suit: 'hearts' as Suit }, { value: 5 as CardValue, suit: 'clubs' as Suit }], total: 13, hasAce: false, isBlackjack: false, isBust: false },
        { cards: [{ value: 8 as CardValue, suit: 'diamonds' as Suit }, { value: 10 as CardValue, suit: 'spades' as Suit }], total: 18, hasAce: false, isBlackjack: false, isBust: false },
      ],
    },
  ];

  const activeTest = testHandIndex !== null ? TEST_SCENARIOS[testHandIndex] : null;
  // Show blackjack text when the Blackjack test scenario is active
  useEffect(() => {
    if (activeTest?.label === 'Blackjack') {
      setBlackjackColorIndex(Math.floor(Math.random() * 5));
      setShowBlackjackText(true);
    } else if (activeTest) {
      setShowBlackjackText(false);
    }
  }, [testHandIndex]);
  // ── End admin layout test ───────────────────────────────────────────────────

  const imageSrc = imageSrcProp ?? BLACKJACK_IMAGE_BACKGROUNDS.find((img) => img.id === imageSource)?.src ?? BLACKJACK_IMAGE_BACKGROUNDS.find((img) => img.id === DEFAULT_BLACKJACK_IMAGE_ID)?.src ?? BLACKJACK_IMAGE_BACKGROUNDS[0].src;
  const isExternalImage = /^https?:\/\//.test(imageSrc);
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
  const [cardsExiting, setCardsExiting] = useState(false);
  const cardsClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardsClearCompleteRef = useRef<NodeJS.Timeout | null>(null);
  const CARD_CLEAR_HOLD_MS = 2000;
  const CARD_CLEAR_ANIMATION_MS = 450;
  const prevGameStateRef = useRef<GameState>(gameState);
  const prevDealerCardCountRef = useRef(dealerHand.cards.length);
  const lastCompletedGameIdRef = useRef<string | undefined>(undefined);

  // Music player state is now managed by parent (page.tsx) to avoid duplicate audio instances
  // Use props if provided
  const hasMusicProps = onToggleMusic !== undefined;

  // Chip animation state
  const [chipAnimationState, setChipAnimationState] = useState<'none' | 'win' | 'loss'>('none');
  const prevGameResult = useRef<string | null>(null);

  // PP chip animation state — resolves on initial deal (fires when game completes)
  const [ppChipAnimationState, setPpChipAnimationState] = useState<'none' | 'win' | 'loss'>('none');
  const prevPpResult = useRef<string | undefined>(undefined);

  // Convert PP bet amount into chip denominations for the stack
  const ppChipStack: number[] = [];
  if (perfectPairsBet > 0) {
    let remaining = perfectPairsBet;
    const ppChipValues = [10000, 2500, 1000];
    for (const cv of ppChipValues) {
      while (remaining >= cv) {
        ppChipStack.push(cv);
        remaining -= cv;
      }
    }
  }
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [showBlackjackText, setShowBlackjackText] = useState(false);
  const [blackjackColorIndex, setBlackjackColorIndex] = useState(0);

  // Draggable widget state (all screens)
  const [widgetPosition, setWidgetPosition] = useState({ x: 0, y: 0 }); // Will be set from saved or default
  const [isHorizontal, setIsHorizontal] = useState(false); // false = vertical (0deg), true = horizontal (90deg)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  // Action buttons layout: REBET+DEAL always separate from HIT/STAND/DOUBLE/SPLIT in non-default layouts
  type ActionButtonsLayout = 'default' | 'grouped' | 'deal-top' | 'deal-left' | 'deal-bottom';
  const LAYOUT_ORDER: ActionButtonsLayout[] = ['default', 'grouped', 'deal-top', 'deal-left', 'deal-bottom'];
  const [actionButtonsLayout, setActionButtonsLayout] = useState<ActionButtonsLayout>('deal-top');

  // Load saved position/orientation and action-buttons layout from localStorage or set default
  // Position is stored as pixels relative to table container (not viewport)
  useEffect(() => {
    const layoutSaved = localStorage.getItem('blackjack-action-buttons-layout');
    if (LAYOUT_ORDER.includes(layoutSaved as ActionButtonsLayout)) {
      setActionButtonsLayout(layoutSaved as ActionButtonsLayout);
    }
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

  // Cycle action buttons layout (all variants keep REBET+DEAL separate from the other 4 except default)
  const cycleActionButtonsLayout = () => {
    const idx = LAYOUT_ORDER.indexOf(actionButtonsLayout);
    const next = LAYOUT_ORDER[(idx + 1) % LAYOUT_ORDER.length];
    setActionButtonsLayout(next);
    localStorage.setItem('blackjack-action-buttons-layout', next);
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
        const mouseXRelativeToTable = clientX - tableRect.left;
        const mouseYRelativeToTable = clientY - tableRect.top;
        
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
      } else if (gameResult === 'push') {
        // Push: bet stays on the table (no chip animation), but still signal completion
        // so parent can reset state (e.g. clear currentGameResult)
        const timer = setTimeout(() => {
          onChipAnimationComplete?.();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    prevGameResult.current = gameResult;
  }, [gameResult, onChipAnimationComplete, chipStack.length]);

  // Handle blackjack celebration text
  const BLACKJACK_COLORS = [
    { encrypted: 'text-amber-400/60', revealed: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent' },
    { encrypted: 'text-purple-400/60', revealed: 'bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-500 bg-clip-text text-transparent' },
    { encrypted: 'text-cyan-400/60', revealed: 'bg-gradient-to-r from-cyan-300 via-teal-400 to-emerald-400 bg-clip-text text-transparent' },
    { encrypted: 'text-rose-400/60', revealed: 'bg-gradient-to-r from-rose-400 via-red-400 to-orange-400 bg-clip-text text-transparent' },
    { encrypted: 'text-emerald-400/60', revealed: 'bg-gradient-to-r from-emerald-300 via-green-400 to-lime-400 bg-clip-text text-transparent' },
  ];

  useEffect(() => {
    if (gameResult === 'blackjack') {
      setBlackjackColorIndex(Math.floor(Math.random() * BLACKJACK_COLORS.length));
      setShowBlackjackText(true);
    } else {
      setShowBlackjackText(false);
    }
  }, [gameResult]);

  // PP chip animation — triggers alongside main gameResult when there's a PP bet
  useEffect(() => {
    if (gameResult && gameResult !== prevPpResult.current && ppChipStack.length > 0) {
      if (perfectPairsResult === 'perfect' || perfectPairsResult === 'colored' || perfectPairsResult === 'mixed') {
        setPpChipAnimationState('win');
        const totalDuration = (ppChipStack.length - 1) * 200 + 3200;
        const timer = setTimeout(() => setPpChipAnimationState('none'), totalDuration);
        prevPpResult.current = gameResult;
        return () => clearTimeout(timer);
      } else {
        setPpChipAnimationState('loss');
        const timer = setTimeout(() => setPpChipAnimationState('none'), 800);
        prevPpResult.current = gameResult;
        return () => clearTimeout(timer);
      }
    }
    prevPpResult.current = gameResult ?? undefined;
  }, [gameResult, perfectPairsResult, ppChipStack.length]);

  const { revealComplete, scheduleRevealComplete, resetRevealComplete } = useBlackjackRevealCompletion(onDealerRevealComplete);

  // Manage dealer card visibility based on game state
  // Industry standard: Show only first card during play, reveal all when complete
  useEffect(() => {
    const totalCards = dealerHand.cards.length;
    const prevCardCount = prevDealerCardCountRef.current;
    const prevState = prevGameStateRef.current;
    
    // Reset "called" flag when leaving COMPLETE so next completion can trigger
    const stateTransitionedAway = prevState === GameState.COMPLETE && gameState !== GameState.COMPLETE;
    if (stateTransitionedAway) {
      resetRevealComplete();
      lastCompletedGameIdRef.current = undefined;
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    }

    // New completed game (e.g. back-to-back blackjack): reset so we run reveal completion for this game
    if (gameState === GameState.COMPLETE && completedGameId && completedGameId !== lastCompletedGameIdRef.current) {
      lastCompletedGameIdRef.current = completedGameId;
      resetRevealComplete();
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    }

    // Game completed: Start reveal sequence
    // Trigger if: gameState just became COMPLETE OR gameState is COMPLETE and dealer cards increased
    // Note: dealerCardsArrived must NOT require prevCardCount>=2 — phased blackjack deal sends 0->1->2 cards,
    // so we need to trigger when going from 1 to 2 cards (prevCardCount=1)
    const gameJustCompleted = gameState === GameState.COMPLETE && prevState !== GameState.COMPLETE;
    const dealerCardsArrived = gameState === GameState.COMPLETE && totalCards > prevCardCount;
    const shouldStartReveal = (gameJustCompleted || dealerCardsArrived) && !isRevealing && visibleDealerCards < totalCards;
    
    // When game is COMPLETE and all dealer cards are already visible, signal completion immediately so REBET/DEAL unlock.
    // Do NOT run this when totalCards < 2 — phased blackjack deal sends 0 then 1 then 2 cards; calling early would
    // freeze the reveal (hole card never shown, cards never clear).
    const noRevealNeeded = gameState === GameState.COMPLETE && totalCards >= 2 && visibleDealerCards >= totalCards;
    if (noRevealNeeded && !revealComplete) {
      // Delay to ensure dealer hand animation is fully visible before unlocking DEAL/REBET buttons.
      // Tournament: longer delay (2.5s) to avoid race where pressing DEAL too soon causes cards to deal but action buttons not to appear.
      const delayMs = inTournament ? 2500 : 1500;
      scheduleRevealComplete(delayMs);
    }
    else if (shouldStartReveal) {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
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
              // All cards revealed — wait for last card animation to finish
              // before signaling completion (which unlocks DEAL/REBET buttons)
              const postRevealDelayMs = inTournament ? 2500 : 1500;
              revealTimeoutRef.current = setTimeout(() => {
                setIsRevealing(false);
                scheduleRevealComplete(postRevealDelayMs);
              }, postRevealDelayMs);
            }
          };
          
          // Start revealing additional cards after showing initial 2
          revealTimeoutRef.current = setTimeout(revealNextCard, 2000);
        }, 1000); // 1 second delay before revealing hole card
      } else {
        // Only 2 cards (blackjack scenario): show both cards immediately when dealer has blackjack
        if (dealerHand.isBlackjack) {
          setVisibleDealerCards(totalCards);
          setIsRevealing(false);
          const delayMs = inTournament ? 1000 : 500;
          scheduleRevealComplete(delayMs);
        } else {
          // Player blackjack or other 2-card complete: ensure first card visible, then reveal hole card
          if (visibleDealerCards < 1 && totalCards >= 1) {
            setVisibleDealerCards(1);
          }
          const postRevealDelayMs = inTournament ? 2500 : 1500;
          revealTimeoutRef.current = setTimeout(() => {
            setVisibleDealerCards(2);
            revealTimeoutRef.current = setTimeout(() => {
              setIsRevealing(false);
              scheduleRevealComplete(postRevealDelayMs);
            }, postRevealDelayMs);
          }, 1000);
        }
      }
    }
    // During play (WAITING, PLAYER_TURN, DEALER_TURN): Show only first card
    else if (gameState !== GameState.COMPLETE && !isRevealing) {
      // Industry standard: Always show only first card during play
      // Hole card (second card) stays hidden until game completes
      // Ensure at least 1 card is visible when cards are available
      if (totalCards >= 2) {
        // Two or more cards: show only first card (hole card hidden)
        if (visibleDealerCards !== 1) {
          setVisibleDealerCards(1);
        }
      } else if (totalCards === 1) {
        // Only one card: show it
        if (visibleDealerCards !== 1) {
          setVisibleDealerCards(1);
        }
      } else if (totalCards === 0) {
        // No cards: hide all
        if (visibleDealerCards !== 0) {
          setVisibleDealerCards(0);
        }
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
  }, [
    gameState,
    dealerHand.cards.length,
    isRevealing,
    visibleDealerCards,
    completedGameId,
    inTournament,
    revealComplete,
    scheduleRevealComplete,
    resetRevealComplete,
  ]);

  // Track visibleDealerCards changes
  useEffect(() => {
    // This effect tracks visibleDealerCards changes but doesn't need to log anything
  }, [visibleDealerCards, dealerHand.cards.length, gameState, isRevealing]);

  // 2s after game complete (reveal done), start card exit animation; then call onCardsClearComplete
  // For blackjack (player or dealer): keep cards on table until user clicks DEAL/REBET — never auto-clear
  useEffect(() => {
    const revealDone = gameState === GameState.COMPLETE && !isRevealing &&
      dealerHand.cards.length > 0 && visibleDealerCards >= dealerHand.cards.length &&
      revealComplete; // Wait for dealer reveal callback to have fired before starting card clear
    if (!revealDone || !onCardsClearComplete || cardsExiting) return;

    // Blackjack: cards stay visible until user clicks DEAL/REBET
    const isBlackjack = gameResult === 'blackjack' || dealerHand.isBlackjack;
    if (isBlackjack) return;

    // Additional check: ensure cards have been visible for at least a brief moment
    const minDisplayTime = dealerHand.cards.length === 2 ? 1500 : CARD_CLEAR_HOLD_MS;

    if (cardsClearTimeoutRef.current) return; // already scheduled
    cardsClearTimeoutRef.current = setTimeout(() => {
      cardsClearTimeoutRef.current = null;
      setCardsExiting(true);
      cardsClearCompleteRef.current = setTimeout(() => {
        cardsClearCompleteRef.current = null;
        onCardsClearComplete();
      }, CARD_CLEAR_ANIMATION_MS);
    }, minDisplayTime);

    return () => {
      if (cardsClearTimeoutRef.current) {
        clearTimeout(cardsClearTimeoutRef.current);
        cardsClearTimeoutRef.current = null;
      }
      if (cardsClearCompleteRef.current) {
        clearTimeout(cardsClearCompleteRef.current);
        cardsClearCompleteRef.current = null;
      }
    };
  }, [gameState, isRevealing, dealerHand.cards.length, dealerHand.isBlackjack, visibleDealerCards, onCardsClearComplete, cardsExiting, gameResult, revealComplete]);

  // Reset cardsExiting when leaving COMPLETE (new game)
  useEffect(() => {
    if (gameState !== GameState.COMPLETE) {
      setCardsExiting(false);
      if (cardsClearTimeoutRef.current) {
        clearTimeout(cardsClearTimeoutRef.current);
        cardsClearTimeoutRef.current = null;
      }
      if (cardsClearCompleteRef.current) {
        clearTimeout(cardsClearCompleteRef.current);
        cardsClearCompleteRef.current = null;
      }
    }
  }, [gameState]);

  // Industry standard: Hide hole card (second card) during play, show when game completes
  // Hide hole card when:
  // - Game is not complete AND
  // - There are exactly 2 cards (initial deal) AND
  // - We're showing only 1 card (hole card is hidden)
  const hideHoleCard = gameState !== GameState.COMPLETE && 
                       dealerHand.cards.length === 2 && 
                       visibleDealerCards === 1;

  // Determine which player hands to display
  const displayHands = activeTest
    ? (activeTest.split ?? [activeTest.player])
    : (playerHands && playerHands.length > 0 ? playerHands : [playerHand]);
  const hasSplit = displayHands.length > 1;
  const testDealerHand = activeTest ? activeTest.dealer : null;
  const testChipStack = activeTest ? [activeTest.bet] : null;

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

  // Use MorbiusChip for all table chip displays
  const getChipImage = (_value: number) => '/morbius/MorbiusChip.png';

  // Debug logging (removed dealer card exposure)

  return (
    <div
      ref={tableContainerRef}
      className="relative isolate w-full max-w-full mx-auto blackjack-table flex flex-col flex-1 min-h-[420px] sm:min-h-[680px]"
      style={{
        boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.9), inset 0 -2px 8px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {/* Table surface: flex-1 with min height so table stays a good size */}
      <div className="flex-1 min-h-[420px] sm:min-h-[680px] relative">
      <Image
        src={imageSrc}
        alt="Table Background"
        fill
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        style={{ zIndex: 0 }}
        priority
        unoptimized={isExternalImage}
      />

      {/* Subtle dark overlay to keep text readable */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background:
            'linear-gradient(145deg, rgba(0,0,0,0.22), rgba(0,0,0,0.12))',
        }}
      />

      {/* Background music player at bottom-left - Desktop only (mobile shows in MainNav dropdown) */}
      {hasMusicProps && onToggleMusic && (
        <div
          className="hidden sm:flex absolute bottom-4 left-4 z-20 flex-col gap-1.5 rounded-xl border border-cyan-500/30 px-3 py-2 shadow-lg pointer-events-auto"
          style={{
            background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.8))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMusic}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors"
              aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}
            >
              {isMusicPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
            </button>
            {onNextTrack && (
              <button
                type="button"
                onClick={onNextTrack}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                aria-label="Next track"
              >
                <IconPlayerSkipForward size={16} />
              </button>
            )}
            {onMusicVolumeChange !== undefined && (
              <div className="flex items-center gap-1.5">
                <IconVolume size={14} className="text-cyan-400/80 w-4" aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={musicVolume}
                  onChange={(e) => onMusicVolumeChange(Number(e.target.value))}
                  className="w-16 h-1.5 rounded-full appearance-none bg-slate-600 accent-cyan-500 cursor-pointer"
                  aria-label="Music volume"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blackjack Celebration — Encrypted Text */}
      {showBlackjackText && (
        <div className="absolute inset-0 z-[35] flex items-center justify-center pointer-events-none blackjack-text-enter">
          <div
            className="px-8 py-4 sm:px-12 sm:py-5 rounded-2xl glass-distort-panel"
          >
            <div className="font-sans">
              <EncryptedText
                text="BLACKJACK"
                revealDelayMs={100}
                flipDelayMs={35}
                className="text-4xl sm:text-5xl md:text-6xl font-black tracking-wider"
                encryptedClassName={BLACKJACK_COLORS[blackjackColorIndex].encrypted}
                revealedClassName={BLACKJACK_COLORS[blackjackColorIndex].revealed}
              />
            </div>
          </div>
        </div>
      )}

      {/* Game Result Banner - Shows when game is complete and dealer reveal is done (not for blackjack — has its own animation) */}
      {gameState === GameState.COMPLETE && gameResult && gameResult !== 'blackjack' && !isRevealing && visibleDealerCards >= dealerHand.cards.length && !cardsExiting && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center pointer-events-none">
          <div
            className={`
              px-4 py-2 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl backdrop-blur-md
              transform transition-all duration-500 ease-out
              animate-result-banner
              ${gameResult === 'win' ? 'bg-gradient-to-r from-green-600/90 via-emerald-500/90 to-green-600/90 border-2 border-green-400' :
                gameResult === 'loss' ? 'bg-gradient-to-r from-red-600/90 via-red-500/90 to-red-600/90 border-2 border-red-400' :
                'bg-gradient-to-r from-blue-600/90 via-blue-500/90 to-blue-600/90 border-2 border-blue-400'}
            `}
            style={{
              boxShadow: gameResult === 'win'
                ? '0 0 40px rgba(34, 197, 94, 0.5), 0 0 80px rgba(34, 197, 94, 0.2), inset 0 2px 4px rgba(255,255,255,0.3)'
                : gameResult === 'loss'
                ? '0 0 40px rgba(239, 68, 68, 0.5), 0 0 80px rgba(239, 68, 68, 0.2), inset 0 2px 4px rgba(255,255,255,0.2)'
                : '0 0 30px rgba(4, 92, 170, 0.4), inset 0 2px 4px rgba(32, 32, 157, 0.2).2)',
            }}
          >
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              {/* Result Icon */}
              <div className="text-2xl sm:text-4xl mb-0.5 sm:mb-1">
                {gameResult === 'win' && '🎉'}
                {gameResult === 'loss' && '😔'}
                {gameResult === 'push' && '🤝'}
              </div>

              {/* Result Text */}
              <h2
                className={`text-2xl sm:text-4xl font-black uppercase tracking-wider
                  ${gameResult === 'win' ? 'text-white' :
                    gameResult === 'loss' ? 'text-white' :
                    'text-blue-800'}
                `}
                style={{
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                {gameResult === 'win' ? 'YOU WIN!' :
                 gameResult === 'loss' ? 'DEALER WINS' :
                 'PUSH'}
              </h2>

              {/* Subtitle */}
              <p className={`text-sm font-medium mt-1 opacity-80
                ${gameResult === 'win' ? 'text-green-500' :
                  gameResult === 'loss' ? 'text-red-500' :
                  'text-blue-600'}
              `}>
                {gameResult === 'win' ? 'Congratulations!' :
                 gameResult === 'loss' ? 'Better luck next time' :
                 'Bet returned'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tournament hand summary — rank, winnings, stats (centered below result banner) */}
      {tournamentHandSummary && (
        <div className="absolute inset-x-0 top-[58%] -translate-y-1/2 z-30 flex justify-center px-4 pointer-events-auto">
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-cyan-500/30 shadow-2xl overflow-hidden animate-result-banner"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.85))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 0 24px rgba(34, 211, 238, 0.25), 0 4px 20px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(34, 211, 238, 0.35)',
            }}
          >
            <div className="p-4 sm:p-5 space-y-3">
              <div className="text-center">
                <p className="text-cyan-400/90 text-xs font-medium uppercase tracking-wider">Tournament hand</p>
                <p className="text-white font-bold text-lg mt-0.5">
                  Rank #{tournamentHandSummary.rank}
                </p>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-gray-400">This hand:</span>
                <span className={
                  tournamentHandSummary.chipDelta > 0 ? 'text-green-400 font-semibold' :
                  tournamentHandSummary.chipDelta < 0 ? 'text-red-400 font-semibold' :
                  'text-gray-300'
                }>
                  {tournamentHandSummary.chipDelta > 0 ? '+' : ''}{tournamentHandSummary.chipDelta} chips
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <span className="text-gray-500 text-xs">Chips</span>
                  <p className="font-semibold text-white">{tournamentHandSummary.chips.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <span className="text-gray-500 text-xs">Hands</span>
                  <p className="font-semibold text-white">{tournamentHandSummary.handsPlayed} played · {tournamentHandSummary.handsRemaining} left</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {onOpenTournamentHistory && (
                  <button
                    type="button"
                    onClick={onOpenTournamentHistory}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-slate-700/80 hover:bg-slate-600/80 text-cyan-300 border border-cyan-500/30 transition-colors"
                  >
                    View tournament history
                  </button>
                )}
                {onDismissTournamentSummary && (
                  <button
                    type="button"
                    onClick={onDismissTournamentSummary}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition-colors"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-10 flex flex-col">
        {/* Play Area — cards absolutely positioned on the table surface */}
        <div className="absolute inset-0">
          {/* Dealer row — upper third of table */}
          {testDealerHand ? (
            /* ── Admin test: render dealer cards directly (no reveal logic) ── */
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className="flex gap-1 sm:gap-0">
                {testDealerHand.cards.map((card, index) => (
                  <div key={`dealer-card-${index}`} className={index > 0 ? 'card-overlap-dealer' : ''} style={{ zIndex: index }}>
                    <PlayingCard card={card} owner="dealer" hidden={index === 1} className="" index={index} isNewCard={false} exiting={false} exitDelay={0} size="normal" />
                  </div>
                ))}
              </div>
              <div className="glass-counter relative w-24 h-24 flex items-center justify-center rounded-full" style={{ marginTop: -14, zIndex: 10 }}>
                <span className="text-white/90 font-black text-6xl relative z-10">{testDealerHand.cards[0].value >= 10 ? 10 : testDealerHand.cards[0].value}</span>
              </div>
            </div>
          ) : (() => {
            const gameCompleteAndRevealed = gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length;
            const dealerIsWinner = gameCompleteAndRevealed && gameResult === 'loss';
            return (
              <div className="absolute top-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center justify-center">
                <DealerSection
                  cards={dealerHand.cards}
                  visibleCards={visibleDealerCards}
                  hideHoleCard={hideHoleCard}
                  cardsExiting={cardsExiting}
                  cardSize="normal"
                  counterValue={dealerHand.isBlackjack ? dealerHand.total : (isRevealing ? getVisibleDealerTotal() : (gameState === GameState.COMPLETE ? dealerHand.total : getVisibleDealerTotal()))}
                  isBust={gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length && dealerHand.isBust}
                  isBlackjack={gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length && dealerHand.isBlackjack}
                  counterActive={gameState === GameState.DEALER_TURN}
                  winnerHighlight={dealerIsWinner}
                  badgeSize="large"
                />
              </div>
            );
          })()}

          {/* Player row — near bottom of table */}
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center justify-center">
            <div className={`flex ${hasSplit ? 'gap-2' : 'gap-0'} items-end`}>
              {displayHands.map((hand, handIndex) => {
                const isActiveHand = hasSplit && handIndex === currentHandIndex && gameState === GameState.PLAYER_TURN;
                const isCompletedHand = hasSplit && (hand.isBust || (handIndex < currentHandIndex));

                return (
                  <div
                    key={`hand-container-${handIndex}`}
                    className={`flex flex-col items-center transition-all duration-300 ${
                      hasSplit ? 'px-2 py-1 sm:px-4 sm:py-2 rounded-md' : ''
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
                      <div className={`mb-0 flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full transition-all duration-300 ${
                        isActiveHand ? 'bg-cyan-500/20 border border-cyan-400/50' : 'bg-transparent'
                      }`}>
                        {isActiveHand && (
                          <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                        )}
                        <span className={`font-bold uppercase tracking-wider transition-all duration-300 ${
                          isActiveHand ? 'text-cyan-300 text-xs sm:text-sm' : isCompletedHand ? 'text-white/25 text-[10px] sm:text-xs' : 'text-white/40 text-[10px] sm:text-xs'
                        }`}>
                          {isActiveHand ? '▸ Hand ' : 'Hand '}{handIndex + 1}
                        </span>
                      </div>
                    )}

                    {/* Cards + counter on one row; chips then bet under cards (non-split) */}
                    {(() => {
                      const gameCompleteAndRevealed = gameState === GameState.COMPLETE && !isRevealing && visibleDealerCards >= dealerHand.cards.length;
                      const handIsWinner = gameCompleteAndRevealed && (hand.result === 'win' || hand.result === 'blackjack');
                      return (
                        <div className="flex flex-col items-center">
                          {/* Score — above cards, only when cards are dealt */}
                          {hand.cards.length > 0 && <div className={`flex items-center gap-2 transition-transform duration-300 ${handIsWinner ? 'card-counter-winner' : ''}`} style={{ marginBottom: -10, zIndex: 0 }}>
                            <div className={`glass-counter backdrop-blur-xl relative w-24 h-24 flex items-center justify-center rounded-full transition-all duration-300 ${
                              gameState === GameState.PLAYER_TURN && (hasSplit ? isActiveHand : true) ? 'card-counter-active' : ''
                            }`}>
                              <span className={`font-black relative z-10 transition-all duration-500 ${
                                handIsWinner ? 'text-emerald-400' : isActiveHand ? 'text-white/90' : hasSplit ? 'text-white/50' : 'text-white/90'
                              } ${hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21 ? 'text-4xl' : 'text-6xl'}`}>
                                {hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21
                                  ? <>{hand.total - 10}<span className="text-white/40">/</span>{hand.total}</>
                                  : hand.total}
                              </span>
                            </div>
                            {hand.isBlackjack && <span className="text-yellow-400 font-black text-base sm:text-xl">BJ!</span>}
                            {hand.isBust && <span className="text-red-400 font-black text-base sm:text-xl">BUST</span>}
                          </div>}
                          <div className="relative flex gap-0">
                            {hand.cards.map((card, cardIndex) => {
                              let isNewCard = false;
                              if (Array.isArray(newCardIndices.player)) {
                                isNewCard = handIndex < newCardIndices.player.length && newCardIndices.player[handIndex].has(cardIndex);
                              } else {
                                isNewCard = newCardIndices.player.has(cardIndex);
                              }
                              const cardSize = 'normal';
                              return (
                                <div
                                  key={`player-${handIndex}-${cardIndex}`}
                                  className={!hasSplit && cardIndex > 0 ? 'card-overlap-player' : ''}
                                  style={{ zIndex: cardIndex }}
                                >
                                  <PlayingCard
                                    card={card}
                                    owner="player"
                                    className={isNewCard && cardIndex < 2 ? getBetTierClass(currentBetAmount) : ''}
                                    index={cardIndex}
                                    isNewCard={isNewCard}
                                    size={cardSize}
                                    exiting={cardsExiting}
                                    exitDelay={0.25}
                                  />
                                </div>
                              );
                            })}
                            {!hasSplit && handIndex === 0 && (testChipStack || chipStack).length > 0 && (
                              <div className="absolute -top-2 -right-15" style={{ zIndex: 20 }}>
                                <BetChip
                                  label={!testChipStack && chipAnimationState !== 'none' ? '' : formatChipLabel((testChipStack || chipStack).reduce((sum, chip) => sum + chip, 0))}
                                  amount={(testChipStack || chipStack).reduce((sum, chip) => sum + chip, 0)}
                                  size="clamp(56px, 10vw, 80px)"
                                  chipSrc={getChipImage(0)}
                                />
                              </div>
                            )}
                          </div>
                          {/* Bet chip moved to absolute position at bottom: 80px (same as Perfect Pairs) */}
                        </div>
                      );
                    })()}

                    {/* Bet chip under each split hand */}
                    {hasSplit && (testChipStack || chipStack).length > 0 && (() => {
                      const handResult = hand.result;
                      const isHandWin = handResult === 'win' || handResult === 'blackjack';
                      const isHandLoss = handResult === 'loss';
                      const showHandAnimation = gameState === GameState.COMPLETE && chipAnimationState !== 'none';
                      const handChips = chipStack.slice(
                        handIndex === 0 ? 0 : Math.ceil(chipStack.length / 2),
                        handIndex === 0 ? Math.ceil(chipStack.length / 2) : chipStack.length
                      );
                      const handBetTotal = handChips.reduce((sum, chip) => sum + chip, 0);

                      return (
                        <div className={`mt-2 flex flex-col items-center ${
                          showHandAnimation && isHandLoss ? 'chip-stack-lose' :
                          showHandAnimation && isHandWin ? 'chip-stack-win' : ''
                        }`}>
                          <BetChip
                            label={showHandAnimation ? '' : formatChipLabel(handBetTotal)}
                            amount={handBetTotal}
                            size="clamp(48px, 8vw, 64px)"
                            chipSrc={getChipImage(0)}
                          />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions Area - Hidden; actions are in sidebar Bet tab (desktop) and in mobile block below table (mobile) */}
        <div
          ref={widgetRef}
          className="hidden cursor-move z-20 touch-none p-1"
          style={{
            position: 'absolute',
            left: `${widgetPosition.x}px`,
            top: `${widgetPosition.y}px`,
            transform: `translate(-50%, -50%)`,
            transformOrigin: 'center center',
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
          <div
            className={`${isHorizontal ? 'flex-row' : 'flex-col'} flex gap-2 p-0 relative cursor-move ${actionButtonsLayout !== 'default' ? 'rounded-lg' : 'rounded-2xl'}`}
            style={{
              background: 'linear-gradient(145deg, rgba(17, 5, 27, 0.14), rgb(0, 0, 0))',
              border: '1px solid rgba(255, 255, 255, 0.42)',
              boxShadow: '0 8px 32px rgba(38, 38, 38, 0.5), inset 0 1px 0 rgba(84, 33, 162, 0.1)',
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
                  className="text-cyan-500"
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
            {/* Layout cycle: default → grouped → deal-top → deal-left → deal-bottom (all except default keep REBET+DEAL separate) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                cycleActionButtonsLayout();
              }}
              className="absolute -top-2 left-0 w-6 h-6 rounded-full bg-slate-500/70 border-2 border-slate-400 hover:bg-slate-500/90 active:bg-slate-500 transition-all z-50 flex items-center justify-center cursor-pointer touch-manipulation"
              style={{
                boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)',
              }}
              title={`Layout: ${actionButtonsLayout}. Click to cycle.`}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span className="text-white text-[10px] font-bold leading-none">{LAYOUT_ORDER.indexOf(actionButtonsLayout) + 1}</span>
            </button>
            {actionButtonsLayout !== 'default' ? (
              (() => {
                const groupStyle = { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.15)' };
                const outerCol = actionButtonsLayout === 'deal-top' || actionButtonsLayout === 'deal-bottom';
                const outerRow = actionButtonsLayout === 'grouped' && isHorizontal || actionButtonsLayout === 'deal-left';
                const dealFirst = actionButtonsLayout !== 'deal-bottom';
                const dealGroupRow = actionButtonsLayout === 'deal-top' || actionButtonsLayout === 'deal-bottom' || (actionButtonsLayout === 'grouped' && isHorizontal);
                const gameGroupRow = actionButtonsLayout === 'deal-top' || actionButtonsLayout === 'deal-bottom' || (actionButtonsLayout === 'grouped' && isHorizontal);
                const dealGroupClass = `flex gap-2 p-0 rounded-lg ${dealGroupRow ? 'flex-row' : 'flex-col'}`;
                const gameGroupClass = `flex gap-2 p-0 rounded-lg ${gameGroupRow ? 'flex-row' : 'flex-col'}`;
                const outerClass = `flex gap-2 p-0 ${outerCol ? 'flex-col' : 'flex-row'}`;
                const dealGroup = (
                  <div className={`flex overflow-hidden rounded-xl border-2 border-white/10 shadow-lg ${dealGroupRow ? 'flex-row' : 'flex-col'}`} style={groupStyle}>
                    {onRebetAndDeal && (
                      <button onClick={(e) => { e.stopPropagation(); if (!isPlaying && parseFloat(lastBetAmount || '0') > 0) { if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); } onRebetAndDeal(); } }} disabled={isPlaying || parseFloat(lastBetAmount || '0') <= 0} className={`flex-1 min-w-[4rem] h-16 flex items-center justify-center bg-gradient-to-br from-violet-500 to-violet-700 border-r border-violet-400/50 transition-all hover:scale-[1.02] active:scale-[0.98] ${isPlaying || parseFloat(lastBetAmount || '0') <= 0 ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: !isPlaying && parseFloat(lastBetAmount || '0') > 0 ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                        <span className="text-white font-black text-xs tracking-wider">REBET</span>
                      </button>
                    )}
                    {!isPlaying && (
                      <button onClick={(e) => { e.stopPropagation(); if (canDeal && chipStack.length > 0) { if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); } onStartGame?.(); } }} disabled={!canDeal || chipStack.length === 0} className={`flex-1 min-w-[4rem] h-16 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-700 transition-all hover:scale-[1.02] active:scale-[0.98] ${!canDeal || chipStack.length === 0 ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: canDeal && chipStack.length > 0 ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                        <span className="text-white font-black text-sm tracking-wider">DEAL</span>
                      </button>
                    )}
                  </div>
                );
                const gameGroup = (
                  <div className={gameGroupClass} style={groupStyle}>
                    <button onClick={(e) => { e.stopPropagation(); if (canHit) { if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); } onAction(Action.HIT); } }} disabled={!canHit} className={`relative w-16 h-16 flex items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canHit ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: canHit ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      <span className="text-white font-black text-sm tracking-wider">HIT</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (canStand) onAction(Action.STAND); }} disabled={!canStand} className={`relative w-16 h-16 flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/50 to-blue-700/50 border-2 border-blue-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canStand ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: canStand ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      <span className="text-white font-black text-sm tracking-wider">STAND</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (canDoubleDown) { onDoubleDownChips?.(); onAction(Action.DOUBLE_DOWN); } }} disabled={!canDoubleDown} className={`relative w-16 h-16 flex items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-amber-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canDoubleDown ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: canDoubleDown ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      <span className="text-white font-black text-xs tracking-wider">DOUBLE</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (canSplit) { onSplitChips?.(); onAction(Action.SPLIT); } }} disabled={!canSplit} className={`relative w-16 h-16 flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-400/50 shadow-lg transition-all hover:scale-105 active:scale-95 ${!canSplit ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`} style={{ opacity: canSplit ? 1 : 0.3 }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      <span className="text-white font-black text-sm tracking-wider">SPLIT</span>
                    </button>
                  </div>
                );
                return (
                  <div className={outerClass}>
                    {dealFirst ? <>{dealGroup}{gameGroup}</> : <>{gameGroup}{dealGroup}</>}
                  </div>
                );
              })()
            ) : (
              <>
            {/* Default layout: Deal button with two options — REBET | DEAL */}
            {!isPlaying && (
              <div className="flex rounded-full overflow-hidden border-2 border-white/10 shadow-lg" style={{ minWidth: '8rem' }}>
                {onRebetAndDeal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (parseFloat(lastBetAmount || '0') > 0) {
                        if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); }
                        onRebetAndDeal();
                      }
                    }}
                    disabled={parseFloat(lastBetAmount || '0') <= 0}
                    className={`flex-1 min-w-[4rem] h-16 flex items-center justify-center bg-gradient-to-br from-violet-500 to-violet-700 border-r border-violet-400/50 transition-all hover:scale-105 active:scale-95 ${parseFloat(lastBetAmount || '0') <= 0 ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{
                      opacity: parseFloat(lastBetAmount || '0') > 0 ? 1 : 0.3,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <span className="text-white font-black text-xs tracking-wider">REBET</span>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canDeal && chipStack.length > 0) {
                      if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); }
                      onStartGame?.();
                    }
                  }}
                  disabled={!canDeal || chipStack.length === 0}
                  className={`flex-1 min-w-[4rem] h-16 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-700 transition-all hover:scale-105 active:scale-95 ${!canDeal || chipStack.length === 0 ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}`}
                  style={{
                    opacity: canDeal && chipStack.length > 0 ? 1 : 0.3,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <span className="text-white font-black text-sm tracking-wider">DEAL</span>
                </button>
              </div>
            )}
            {/* HIT Button - Always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canHit) {
                  if (soundEnabled) { if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav'); else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {}); }
                  onAction(Action.HIT);
                }
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
              </>
            )}
          </div>
        </div>
        </div>
      {/* End Play Area */}

      {/* Perfect Pairs chip stack + bet circle — left of main chip stack */}
      {onPerfectPairsBetChange && (
        <div
          className="absolute z-[5] pointer-events-auto flex flex-col items-center"
          style={{
            left: 'calc(50% - 80px)',
            bottom: '80px',
            transform: 'translateX(-100%)',
          }}
        >
          {/* Red X button to remove PP bet - shown above PP bet circle when bet is placed */}
          {perfectPairsBet > 0 && !isPlaying && ppChipAnimationState === 'none' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPerfectPairsBetChange(0);
              }}
              className="mb-2 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{
                background: 'linear-gradient(145deg, #ef4444, #dc2626)',
                border: '2px solid rgba(239, 68, 68, 0.8)',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
              }}
              title="Remove Perfect Pairs bet"
            >
              <span className="text-white font-black text-xs leading-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>×</span>
            </button>
          )}
          {/* PP bet chip (visible when bet is placed and game is active or animation is running) */}
          {ppChipStack.length > 0 && (isPlaying || ppChipAnimationState !== 'none') && (
            <div className="flex flex-col items-center" style={{ marginBottom: '4px' }}>
              <div
                className={`${
                  ppChipAnimationState === 'loss' ? 'chip-stack-lose' :
                  ppChipAnimationState === 'win' ? 'chip-stack-win' : ''
                }`}
              >
                <BetChip
                  label={ppChipAnimationState !== 'none' ? '' : `PP ${formatChipLabel(perfectPairsBet)}`}
                  amount={perfectPairsBet}
                  size="clamp(44px, 7vw, 56px)"
                  chipSrc={getChipImage(0)}
                />
              </div>
              {ppChipAnimationState === 'win' && perfectPairsResult && (
                <span className="font-black text-xs text-green-300 animate-pulse mt-1" style={{ textShadow: '0 0 8px rgba(74, 222, 128, 0.6), 2px 2px 6px rgba(0, 0, 0, 0.9)' }}>
                  {perfectPairsResult === 'colored' ? 'COLORED 12:1' : perfectPairsResult === 'mixed' ? 'MIXED 5:1' : 'PERFECT 10:1'}
                </span>
              )}
            </div>
          )}
          {/* PP bet circle button (visible when not playing and no animation running) */}
          {!isPlaying && ppChipAnimationState === 'none' && (
            <button
              type="button"
              onClick={() => {
                const next = perfectPairsBet >= 10000 ? 0 : perfectPairsBet + 1000;
                onPerfectPairsBetChange(next);
              }}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: perfectPairsBet > 0
                  ? 'linear-gradient(145deg,rgb(24, 124, 177),rgb(24, 148, 190))'
                  : 'linear-gradient(145deg, rgba(40, 8, 43, 0.9), rgba(141, 42, 207, 0.9))',
                border: perfectPairsBet > 0 ? '2px solid rgba(66, 42, 161, 0.7)' : '2px dashed rgba(100,116,139,0.5)',
                boxShadow: perfectPairsBet > 0
                  ? '0 0 12px rgba(11, 46, 245, 0.4), inset 0 1px 2px rgba(255,255,255,0.2)'
                  : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.05em', color: perfectPairsBet > 0 ? '#fff' : 'rgb(255, 255, 255)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                PERFECT
              </span>
              <span style={{ fontSize: perfectPairsBet >= 10000 ? '11px' : '13px', fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgb(16, 103, 197)', lineHeight: 1 }}>
                {perfectPairsBet > 0 ? `${(perfectPairsBet / 1000).toFixed(0)}K` : '—'}
              </span>
              <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.05em', color: perfectPairsBet > 0 ? 'rgb(255, 255, 255)' : 'rgb(255, 255, 255)', marginTop: '1px' }}>
                PAIRS
              </span>
            </button>
          )}
        </div>
      )}

      {/* Result Text Overlay removed — the Game Result Banner above handles all result display */}

      {/* Betting Panel - Overlay at bottom of table (hidden in tournament mode; controls in sidebar tab) */}
      {!hideBettingPanel && (
        <div className="absolute bottom-1 left-0 right-0 z-50 flex justify-center pointer-events-auto">
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
            betLimits={betLimits}
          />
        </div>
      )}

        {/* Reserve - top left of table (desktop and mobile) */}
        <div className="absolute top-2 left-2 z-50 pointer-events-auto flex">
          <button
            type="button"
            onClick={onOpenDepositModal}
            aria-label={`Reserve balance: ${Math.floor(Number(reserveBalance) / 1e18)} MORBIUS. Open deposit and withdraw.`}
            className="flex relative items-center justify-start rounded-md py-1 px-2.5 pr-6 gap-1 text-sm flex-shrink min-w-0 hover:brightness-110 transition-all cursor-pointer"
            style={{
              background: 'linear-gradient(145deg, rgb(0, 0, 0), rgb(1, 2, 3))',
              boxShadow: 'inset 2px 2px 4px rgb(0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgb(16, 137, 217)',
            }}
          >
            <div className="flex items-center gap-1">
              <span className="text-white/80 font-bold whitespace-nowrap text-sm tabular-nums">
                {Math.floor(Number(reserveBalance) / 1e18).toLocaleString()}
              </span>
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="Morbius Logo"
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
            <IconChevronDown size={10} className="text-white/60 absolute right-1.5 top-1/2 transform -translate-y-1/2" />
          </button>
        </div>

        {/* Change Table - top right of table */}
        {onOpenTableThemeSelector && (
          <div className="absolute top-2 right-2 z-50 pointer-events-auto flex gap-1.5 items-center">
            {speechToggle && (
              <div className="relative flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={speechToggle.onToggle}
                  className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors bg-slate-900/80 hover:bg-slate-800/80"
                  style={{
                    borderColor: speechToggle.listening ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)',
                    color: speechToggle.listening ? '#fca5a5' : '#9ca3af',
                  }}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${speechToggle.listening ? 'bg-red-500 animate-pulse' : 'bg-neutral-500'}`} />
                  {speechToggle.listening ? 'Voice ON' : 'Voice OFF'}
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
                  </svg>
                </button>
                {voiceTutorialVideoUrl ? (
                  <a
                    href={voiceTutorialVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
                  >
                    How it works
                  </a>
                ) : null}
                {speechToggle.listening && (
                  <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/70 px-2 py-1 backdrop-blur-md max-w-[180px] pointer-events-none">
                    <span className="text-[10px] text-white/40 shrink-0">Hearing:</span>
                    <span className="text-[10px] text-white truncate">
                      {truncateTranscriptWords(speechToggle.transcript, SPEECH_LIVE_TRANSCRIPT_MAX_WORDS) || (
                        <span className="text-white/25 italic">listening…</span>
                      )}
                    </span>
                  </div>
                )}
                {speechToggle.pendingLabel && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 backdrop-blur-md max-w-[180px] pointer-events-none">
                    <span className="text-[10px] text-amber-300 font-semibold shrink-0">Confirm:</span>
                    <span className="text-[10px] text-amber-200 truncate">{speechToggle.pendingLabel}</span>
                  </div>
                )}
                {speechToggle.lastAction && !speechToggle.pendingLabel && (
                  <div className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 backdrop-blur-md max-w-[180px] pointer-events-none">
                    <span className="text-[10px] text-cyan-400 font-semibold">▶</span>
                    <span className="text-[10px] text-cyan-300 truncate">{speechToggle.lastAction}</span>
                  </div>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setTestHandIndex(prev => {
                  if (prev === null) return 0;
                  if (prev >= TEST_SCENARIOS.length - 1) return null;
                  return prev + 1;
                })}
                className="text-yellow-300/90 hover:text-yellow-200 text-[10px] font-medium py-1 px-2 rounded-md border border-yellow-500/40 hover:border-yellow-400/60 bg-slate-900/80 hover:bg-slate-800/80 transition-colors"
              >
                {testHandIndex === null ? 'Test' : `${TEST_SCENARIOS[testHandIndex].label} ▸`}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenTableThemeSelector}
              className="text-cyan-300/90 hover:text-cyan-200 text-xs font-medium py-1.5 px-2.5 rounded-md border border-cyan-500/40 hover:border-cyan-400/60 bg-slate-900/80 hover:bg-slate-800/80 transition-colors"
            >
              Change Table
            </button>
          </div>
        )}

      </div>
      {/* End table surface */}

      <style jsx global>{`
        /* Result banner animation */
        @keyframes resultBannerIn {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(-20px);
          }
          50% {
            transform: scale(1) translateY(0);
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
            transform: translateX(100px) translateY(-80px);
            opacity: 0;
          }
          100% {
            transform: translateX(0) translateY(0);
            opacity: 1;
          }
        }

        .card-slide-in {
          animation: cardSlideIn 0.6s ease-out both;
        }

        /* Card clear: fade + slide down (collect) */
        @keyframes cardClearOut {
          to {
            opacity: 0;
            transform: translate(-80px, -120px) scale(0.6);
          }
        }
        .card-clear-out {
          animation: cardClearOut 0.45s ease-in forwards;
          pointer-events: none;
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

        /* Desktop: overlapping card margins */
        @media (min-width: 641px) {
          .card-overlap-dealer {
            margin-left: -15px;
          }
          .card-overlap-player {
            margin-left: -25px;
          }
        }

        /* Mobile: cards larger size with xs border radius + overlap so cards stay close */
        @media (max-width: 640px) {
          .blackjack-table .blackjack-card-player,
          .blackjack-table .blackjack-card-dealer {
            width: 56px !important;
            height: 80px !important;
            border-radius: 0.125rem !important; /* rounded-xs */
          }
          .card-overlap-dealer {
            margin-left: -12px;
          }
          .card-overlap-player {
            margin-left: -18px;
          }
        }

        /* Card counter active border animation */
        @keyframes cyanGlow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(34, 211, 238, 0.4),
                        0 0 16px rgba(34, 211, 238, 0.2),
                        inset 0 0 8px rgba(34, 211, 238, 0.1);
            border-color: rgba(34, 211, 238, 0.5);
          }
          50% {
            box-shadow: 0 0 16px rgba(34, 211, 238, 0.6),
                        0 0 24px rgba(34, 211, 238, 0.3),
                        inset 0 0 12px rgba(34, 211, 238, 0.15);
            border-color: rgba(34, 211, 238, 0.7);
          }
        }

        .glass-counter {
          background: rgba(255, 255, 255, 0.1);
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          backdrop-filter: url(#glass-distort) blur(4px);
          -webkit-backdrop-filter: url(#glass-distort) blur(4px);
          box-shadow:
            inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .glass-distort-panel {
          background: rgba(255, 255, 255, 0.1);
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          backdrop-filter: url(#glass-distort) blur(4px);
          -webkit-backdrop-filter: url(#glass-distort) blur(4px);
          box-shadow:
            inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .card-counter-active {
          border: 2px solid rgba(34, 211, 238, 0.6);
          animation: cyanGlow 2s ease-in-out infinite;
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.7),
            0 0 12px rgba(34, 211, 238, 0.3);
        }

        .card-counter-winner {
          transform: scale(1.25);
        }

        @keyframes blackjackFloat {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          30% {
            opacity: 1;
            transform: translateY(-4px) scale(1.02);
          }
          50% {
            transform: translateY(0px) scale(1);
          }
          100% {
            transform: translateY(0px) scale(1);
          }
        }

        .blackjack-text-enter {
          animation: blackjackFloat 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      {/* SVG filter for thick glass distortion on counters */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="glass-distort">
            <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="2" seed="2" result="turbulence" />
            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default BlackjackTable;
