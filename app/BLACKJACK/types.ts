// Blackjack Types

export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // 1=Ace, 11=Jack, 12=Queen, 13=King
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export interface Card {
  value: CardValue;
  suit: Suit;
  hidden?: boolean;
}

export interface Hand {
  id?: string;
  cards: Card[];
  total: number;
  hasAce: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  betAmount?: bigint;
  result?: 'win' | 'loss' | 'push' | 'blackjack';
  payout?: bigint;
  actions?: any[];
  canHit?: boolean;
  canStand?: boolean;
  canDoubleDown?: boolean;
  canSplit?: boolean;
}

export interface Game {
  id: string;
  player: string;
  totalBetAmount: bigint;
  state: GameState;
  playerHands: Hand[];
  dealerCards: Card[];
  dealerTotal: number;
  dealerHasAce: boolean;
  totalPayout: bigint;
  timestamp: number;
  clientSeed: string;
  currentHandIndex: number;
  canSplit: boolean;

  // Legacy/single-hand fields used in parts of the UI
  playerHand?: Hand;
  dealerHand?: Hand;
  betAmount?: bigint;
  payout?: bigint;
  isBlackjack?: boolean;
  /** Perfect Pairs side bet amount (for display). */
  perfectPairsBetAmount?: bigint;
  /** Perfect Pairs result (exact match only). */
  perfectPairsResult?: 'perfect';
  /** Perfect Pairs payout (stake + winnings). */
  perfectPairsPayout?: bigint;
}

export enum GameState {
  WAITING = 'waiting',
  DEALING = 'dealing',
  PLAYER_TURN = 'player_turn',
  DEALER_TURN = 'dealer_turn',
  COMPLETE = 'complete'
}

export enum Action {
  HIT = 'hit',
  STAND = 'stand',
  DOUBLE_DOWN = 'double_down',
  SPLIT = 'split'
}

export interface GameResult {
  gameId: string;
  playerHand: Hand;
  dealerHand: Hand;
  payout: bigint;
  isBlackjack: boolean;
  timestamp: number;
  /** All player hands (for split games). When present, use this for display; otherwise use playerHand. */
  playerHands?: Hand[];
  /** True if this game involved a split. */
  wasSplit?: boolean;
  /** True if any hand was doubled down. */
  wasDoubleDown?: boolean;
}

export interface GameStateUI {
  balance: bigint;
  currentGame: Game | null;
  playerHands: Hand[];
  dealerCards: Card[];
  dealerTotal: number;
  dealerHasAce: boolean;
  isPlaying: boolean;
  lastResult: GameResult | null;
  history: GameResult[];
  clientSeed: string;
  currentHandIndex: number;
  canSplit: boolean;
}

// UI States
export type BlackjackGamePhase = 'betting' | 'playing' | 'dealer-turn' | 'result';

// Animation states
export type CardAnimationState = 'dealing' | 'flipping' | 'none';