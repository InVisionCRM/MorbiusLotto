// Tournament Creator Types and Constants

// Prize distribution options (Top 1, Top 3, Top 5, Top 10 only)
export type PrizeDistributionType =
  | 'winner_takes_all'  // 100% to 1st
  | 'top_3'             // 50/30/20
  | 'top_5'             // 40/25/15/12/8
  | 'top_10';           // 56/20/10 + 2% each 4th-10th (default)

// Prize presets with percentages (all sum to 100%)
export const PRIZE_PRESETS: {
  id: PrizeDistributionType;
  name: string;
  percentages: number[];
  description: string;
}[] = [
  {
    id: 'winner_takes_all',
    name: 'Top 1',
    percentages: [100],
    description: '100% to 1st place'
  },
  {
    id: 'top_3',
    name: 'Top 3',
    percentages: [50, 30, 20],
    description: '50% / 30% / 20%'
  },
  {
    id: 'top_5',
    name: 'Top 5',
    percentages: [40, 25, 15, 12, 8],
    description: '40% / 25% / 15% / 12% / 8%'
  },
  {
    id: 'top_10',
    name: 'Top 10',
    percentages: [56, 20, 10, 2, 2, 2, 2, 2, 2, 2],
    description: '56% / 20% / 10% + 2% each for 4th-10th'
  },
];

// Table theme types (matches constants.ts)
export type TableThemeKind = 'image' | 'video';

export interface TableTheme {
  kind: TableThemeKind;
  id: string;
}

// ========== FREEROLL Tournament Types ==========

export type TournamentType = 'standard' | 'freeroll';

export type TournamentPhase = 'registration' | 'active' | 'completed';

/** Registration status for freeroll entries */
export type RegistrationStatus = 'registered' | 'joined' | 'no_show';

// FREEROLL validation constants (aligned with migration 015)
export const FREEROLL_VALIDATION = {
  ACTION_TIMER_MIN_SECONDS: 10,
  ACTION_TIMER_MAX_SECONDS: 15,
  DURATION_MIN_MINUTES: 5,
  DURATION_MAX_MINUTES: 1440,      // 24h
  MIN_PLAYERS_MIN: 2,
  MIN_PLAYERS_MAX: 100,
  MAX_PLAYERS_MIN: 2,
  MAX_PLAYERS_MAX: 1000,
  TIEBREAKER_ORDER_DEFAULT: ['highest_chips', 'blackjacks', 'hands_won', 'entry_time'] as string[],
};

/** Min players = number of paid places (don't run without full prize pool). */
export function getMinPlayersFromPrizeDistribution(type: PrizeDistributionType): number {
  switch (type) {
    case 'winner_takes_all': return 1;
    case 'top_3': return 3;
    case 'top_5': return 5;
    case 'top_10':
    default: return 10;
  }
}

export interface CreateFreerollRequest {
  name: string;
  scheduledStartAt: string;        // ISO date string
  registrationOpensAt: string;     // ISO date string
  durationMinutes: number;
  startingChips: number;
  maxHands: number;
  prizeDistributionType: PrizeDistributionType;
  tableTheme: TableTheme;
  isPrivate: boolean;
  maxPlayers?: number | null;     // null = unlimited, else e.g. 2–1000
  customImage?: string | null;
  /** Optional PIN for private freerolls; if not set, server generates one */
  pinCode?: string | null;
  /** When set, prize pool is funded by creator via escrow (custom token). Buy-ins are always MORBIUS. */
  prizeTokenAddress?: string | null;
  prizeAmount?: string; // token smallest unit
  prizeTokenDecimals?: number | null;
}

// Validation constants
export const TOURNAMENT_VALIDATION = {
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 50,
  TIME_LIMIT_OPTIONS: [null, 60, 120, 240, 1440] as const, // minutes (null = no limit)
  PIN_LENGTH: 4,
};

// Time limit labels for display
export const TIME_LIMIT_LABELS: Record<number | 'null', string> = {
  'null': 'No Limit',
  60: '1 Hour',
  120: '2 Hours',
  240: '4 Hours',
  1440: '24 Hours',
};

// Create tournament request
export interface CreateTournamentRequest {
  name: string;
  buyInAmount: string; // BigInt as string
  startingChips: number;
  maxHands: number;
  timeLimitMinutes: number | null;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  maxPlayers?: number | null;
  customImage?: string; // Base64 data URL or null for default
  /** When set, prize pool is funded by creator via escrow (custom token) */
  prizeTokenAddress?: string | null;
  prizeAmount?: string; // token smallest unit
  prizeTokenDecimals?: number | null;
  /** Optional PIN for private tournaments; if not set, server generates one */
  pinCode?: string | null;
}

// Create tournament response
export interface CreateTournamentResponse {
  tournamentId: string;
  name: string;
  pinCode?: string; // Only returned for private tournaments
  buyInAmount: string;
  startingChips: number;
  maxHands: number;
  timeLimitMinutes: number | null;
  endsAt: string | null;
  rebuyConfig: { enabled: boolean; maxRebuys: number };
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  prizePercentages: number[];
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
}

// Join tournament request
export interface JoinTournamentRequest {
  tournamentId: string;
  pinCode?: string; // Required for private tournaments
}

// Rebuy request
export interface RebuyRequest {
  tournamentId: string;
}

// Default tournament card images (from /public/BlackJack/TourCards/)
export const DEFAULT_TOUR_CARDS = [
  '/BlackJack/TourCards/TourCard1.png',
  '/BlackJack/TourCards/TourCard2.png',
  '/BlackJack/TourCards/TourCard3.png',
  '/BlackJack/TourCards/TourCard4.png',
  '/BlackJack/TourCards/TourCard5.png',
] as const;

// Get a deterministic default tour card based on tournament ID
export function getDefaultTourCard(tournamentId: string): string {
  // Simple hash to pick a card consistently
  let hash = 0;
  for (let i = 0; i < tournamentId.length; i++) {
    hash = ((hash << 5) - hash) + tournamentId.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % DEFAULT_TOUR_CARDS.length;
  return DEFAULT_TOUR_CARDS[index];
}

// Tournament list item (for browser)
export interface TournamentListItem {
  id: string;
  name: string;
  creatorAddress: string | null;
  buyInAmount: string;
  startingChips: number;
  maxHands: number;
  prizePool: string;
  entryCount: number;
  maxPlayers: number | null;
  timeLimitMinutes: number | null;
  endsAt: string | null;
  rebuyConfig: { enabled: boolean; maxRebuys: number };
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  createdAt: string;
  timeRemaining?: number; // Computed on client
  customImage?: string | null; // Custom uploaded image or null for default
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  // Timing / phase fields (for freerolls and timer display)
  tournamentType?: string | null;
  scheduledStartAt?: string | null;
  registrationOpensAt?: string | null;
  currentPhase?: string | null;
  durationMinutes?: number | null;
  // Fee fields
  creatorFeePercent?: number;
  platformFeePercent?: number;
  // Escrow funding (custom-token tournaments only)
  escrowFunded?: boolean;
  escrowTotalDeposited?: string;
  escrowToken?: string | null;
  /** uint256 from MorbiusTournament; when set, create/join use on-chain flow */
  onChainTournamentId?: number | null;
  /** Tournament status: registration (waiting for players) or active */
  status?: 'registration' | 'active' | 'completed' | 'cancelled';
  /** Minimum players to start (for registration display) */
  minPlayers?: number;
}

// Extended tournament info
export interface TournamentInfoExtended {
  tournamentId: string;
  name: string;
  creatorAddress: string | null;
  status: 'active' | 'completed' | 'cancelled';
  buyInAmount: string;
  startingChips: number;
  maxHands: number;
  prizePool: string;
  entryCount: number;
  maxPlayers: number | null;
  timeLimitMinutes: number | null;
  endsAt: string | null;
  rebuyConfig: { enabled: boolean; maxRebuys: number };
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  prizePercentages: number[];
  createdAt: string;
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  // Fee fields
  creatorFeePercent?: number;
  platformFeePercent?: number;
}

// Display-friendly labels for prize distribution types
export const PRIZE_DISTRIBUTION_LABELS: Record<PrizeDistributionType, string> = {
  winner_takes_all: 'Top 1',
  top_3: 'Top 3',
  top_5: 'Top 5',
  top_10: 'Top 10',
};

// Validate tournament name
export function validateTournamentName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length < TOURNAMENT_VALIDATION.NAME_MIN_LENGTH) {
    return { valid: false, error: `Name must be at least ${TOURNAMENT_VALIDATION.NAME_MIN_LENGTH} characters` };
  }
  if (trimmed.length > TOURNAMENT_VALIDATION.NAME_MAX_LENGTH) {
    return { valid: false, error: `Name must be at most ${TOURNAMENT_VALIDATION.NAME_MAX_LENGTH} characters` };
  }
  // Allow alphanumeric, spaces, hyphens, underscores
  if (!/^[\w\s-]+$/.test(trimmed)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  return { valid: true };
}

// Validate buy-in amount (no min/max; 0 = freeroll)
export function validateBuyInAmount(amount: bigint): { valid: boolean; error?: string } {
  if (amount < 0n) {
    return { valid: false, error: 'Buy-in cannot be negative' };
  }
  return { valid: true };
}

// Calculate prize for a rank given prize pool and distribution
export function calculatePrizeForRank(
  rank: number,
  prizePool: bigint,
  prizePercentages: number[],
  totalFeePercent: number = 5
): bigint {
  if (rank < 1 || rank > prizePercentages.length) return 0n;
  const percentage = prizePercentages[rank - 1];
  if (!percentage || percentage === 0) return 0n;
  const distributablePool = (prizePool * BigInt(100 - totalFeePercent)) / 100n;
  return (distributablePool * BigInt(percentage)) / 100n;
}

// Get example prize distribution for preview
export function getExamplePrizeDistribution(
  prizePool: bigint,
  prizePercentages: number[],
  totalFeePercent: number = 5
): { rank: number; percentage: number; amount: bigint }[] {
  const result: { rank: number; percentage: number; amount: bigint }[] = [];
  const distributablePool = (prizePool * BigInt(100 - totalFeePercent)) / 100n;

  if (!Array.isArray(prizePercentages) || prizePercentages.length === 0) {
    prizePercentages = [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
  }

  for (let i = 0; i < prizePercentages.length; i++) {
    const percentage = prizePercentages[i];
    if (percentage > 0) {
      result.push({
        rank: i + 1,
        percentage,
        amount: (distributablePool * BigInt(percentage)) / 100n
      });
    }
  }

  return result;
}

// Format time remaining
export function formatTimeRemaining(endsAt: string | null): string | null {
  if (!endsAt) return null;

  const endTime = new Date(endsAt).getTime();
  const now = Date.now();
  const remaining = endTime - now;

  if (remaining <= 0) return 'Ended';

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ========== Creator Dashboard Types ==========

export interface CreatorTournamentItem {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  buyInAmount: string;
  prizePool: string;
  entryCount: number;
  creatorFeePercent: number;
  platformFeePercent: number;
  creatorFeeEarned: string;
  prizeDistributionType: string;
  createdAt: string;
  endedAt: string | null;
  customImage: string | null;
  isPrivate: boolean;
  tournamentType: string;
  maxHands: number;
  startingChips: number;
}

export interface CreatorEarning {
  tournamentId: string;
  tournamentName: string;
  prizePool: string;
  /** When set, prize pool and fee are in this custom token (not MORBIUS) */
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  /** Display ticker for the prize token (e.g. "FLOWT"); null falls back to MORBIUS-default. */
  prizeTokenSymbol?: string | null;
  feePercent: number;
  feeEarned: string;
  /** Tx hash of the on-chain creator-fee payout; null = off-chain or not yet paid. */
  feeTxHash?: string | null;
  completedAt: string;
}

// ========== My History (player's past tournaments) ==========

export interface PlayerTournamentHistoryItem {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: 'active' | 'completed' | 'cancelled';
  tournamentType: string;
  prizeTokenAddress: string | null;
  endedAt: string | null;
  /** When the tournament is scheduled to end (time limit). Used for "time remaining" when in progress. */
  endsAt: string | null;
  entryId: string;
  entryStatus: 'playing' | 'busted' | 'completed';
  finalRank: number | null;
  prizeWon: string;
  boughtInAt: string;
  finishedAt: string | null;
  handsPlayed: number;
  highestChipCount: number;
  chipsRemaining: number;
}
