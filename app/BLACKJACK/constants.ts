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
  MIN_BET: BigInt(1_000_000_000_000_000_000),           // 1 MORBIUS
  MAX_BET: BigInt(100_000_000_000_000_000_000_000),    // 100,000 MORBIUS
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

// Deployer wallet: only this address sees the Global Analytics nav/view (set via NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET)
export const BLACKJACK_DEPLOYER_WALLET = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET
    ? process.env.NEXT_PUBLIC_BLACKJACK_DEPLOYER_WALLET
    : ''
).toLowerCase();

// Table background theme: Image (branded images) or Video
export type BlackjackThemeKind = 'image' | 'video';

// Branded table images (files in /public/BlackJack/BrandedTable/) – keep in sync with folder
export const BLACKJACK_IMAGE_BACKGROUNDS = [
  { id: 'BigRich', label: 'Big Rich', src: '/BlackJack/BrandedTable/BigRich.png' },
  { id: 'CRVE', label: 'CRVE', src: '/BlackJack/BrandedTable/CRVE.png' },
  { id: 'DrDoge', label: 'Dr. Doge', src: '/BlackJack/BrandedTable/Dr.Doge.png' },
  { id: 'EMIT', label: 'EMIT', src: '/BlackJack/BrandedTable/EMIT.png' },
  { id: 'GreenWick', label: 'Green Wick', src: '/BlackJack/BrandedTable/GreenWick.png' },
  { id: 'H9gh-Roller-2', label: 'H9gh Roller 2', src: '/BlackJack/BrandedTable/H9gh-Roller-2.png' },
  { id: 'high-roller-3', label: 'High Roller 3', src: '/BlackJack/BrandedTable/high-roller-3.png' },
  { id: 'High-Roller', label: 'High Roller', src: '/BlackJack/BrandedTable/High-Roller.png' },
  { id: 'InternetMoney', label: 'Internet Money', src: '/BlackJack/BrandedTable/InternetMoney.png' },
  { id: 'Liberty', label: 'Liberty', src: '/BlackJack/BrandedTable/Liberty.png' },
  { id: 'moonlight', label: 'Moonlight', src: '/BlackJack/BrandedTable/moonlight.png' },
  { id: 'PewPew', label: 'PewPew', src: '/BlackJack/BrandedTable/PewPew.png' },
  { id: 'pTGC', label: 'pTGC', src: '/BlackJack/BrandedTable/pTGC.png' },
  { id: 'pTiger', label: 'pTiger', src: '/BlackJack/BrandedTable/pTiger.png' },
  { id: 'SuperStake', label: 'SuperStake', src: '/BlackJack/BrandedTable/SuperStake.png' },
  { id: 'WhaleBay', label: 'Whale Bay', src: '/BlackJack/BrandedTable/WhaleBay.png' },
] as const;
export type BlackjackImageId = (typeof BLACKJACK_IMAGE_BACKGROUNDS)[number]['id'];

// Default table when player has no saved preference (wallet/localStorage)
export const DEFAULT_BLACKJACK_IMAGE_ID: BlackjackImageId = 'High-Roller';

// Table background videos (files in /public/BlackJack/video table/)
export const BLACKJACK_VIDEO_BACKGROUNDS = [
  { id: 'glowingTable', label: 'Glowing Table', src: '/BlackJack/video%20table/glowingTable.mp4' },
  { id: 'glowingTable1', label: 'Glowing Table 1', src: '/BlackJack/video%20table/glowingTable1.mp4' },
  { id: 'glowingLogo', label: 'Glowing Logo', src: '/BlackJack/video%20table/glowingLogo.mp4' },
] as const;
export type BlackjackVideoId = (typeof BLACKJACK_VIDEO_BACKGROUNDS)[number]['id'];

// Resolve a table theme (kind + id) to display info
export function getTableThemeInfo(theme: { kind: 'image' | 'video'; id: string }): { label: string; src: string; kind: 'image' | 'video' } {
  if (theme.kind === 'video') {
    const found = BLACKJACK_VIDEO_BACKGROUNDS.find((v) => v.id === theme.id);
    if (found) return { label: found.label, src: found.src, kind: 'video' };
  }
  const found = BLACKJACK_IMAGE_BACKGROUNDS.find((v) => v.id === theme.id);
  if (found) return { label: found.label, src: found.src, kind: 'image' };
  // Fallback to default
  const def = BLACKJACK_IMAGE_BACKGROUNDS.find((v) => v.id === DEFAULT_BLACKJACK_IMAGE_ID)!;
  return { label: def.label, src: def.src, kind: 'image' };
}
