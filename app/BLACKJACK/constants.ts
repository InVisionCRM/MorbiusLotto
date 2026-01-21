// Blackjack Constants

import { CardValue, Suit, Card } from './types';

// Card values mapping
export const CARD_VALUES: Record<CardValue, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K'
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

export const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#e74c3c',
  diamonds: '#e74c3c',
  clubs: '#2c3e50',
  spades: '#2c3e50'
};

// Game rules
export const BLACKJACK_VALUE = 21;
export const DEALER_STAND_VALUE = 17;
export const ACE_LOW_VALUE = 1;
export const ACE_HIGH_VALUE = 11;
export const FACE_CARD_VALUE = 10;

// Payout multipliers (in basis points)
export const PAYOUT_MULTIPLIERS = {
  BLACKJACK: 15000, // 3:2 = 150%
  WIN: 20000,       // 2:1 = 200%
  PUSH: 10000,      // 1:1 = 100%
  LOSS: 0           // 0:1 = 0%
};

// Game configuration
export const DECKS = 6;
export const CARDS_PER_DECK = 52;
export const TOTAL_CARDS = DECKS * CARDS_PER_DECK;

// Bet limits (in MORBIUS, 18 decimals)
export const BET_LIMITS = {
  MIN_BET: BigInt(1_000_000_000_000_000_000),     // 1 MORBIUS
  MAX_BET: BigInt(1_000_000_000_000_000_000_000), // 1000 MORBIUS
};

// Animation timings (in milliseconds)
export const ANIMATION_TIMINGS = {
  CARD_DEAL: 600,
  CARD_FLIP: 400,
  DEALER_TURN_DELAY: 1000,
  RESULT_DELAY: 3000,
  NEW_GAME_DELAY: 3000
};

// UI Constants
export const TABLE_LAYOUT = {
  CARD_WIDTH: 100,
  CARD_HEIGHT: 140,
  CARD_SPACING: 20,
  HAND_SPACING: 40
};

// Dealer rules
export const DEALER_RULES = {
  HITS_SOFT_17: true,
  STAND_VALUE: 17
};

// Provably fair constants
export const PROVABLY_FAIR = {
  SERVER_SEED_LENGTH: 32,
  CLIENT_SEED_MIN_LENGTH: 10,
  NONCE_START: 0
};