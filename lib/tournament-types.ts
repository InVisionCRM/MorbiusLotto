// Tournament Creator Types and Constants

// Prize distribution options
export type PrizeDistributionType =
  | 'winner_takes_all'  // 100% to 1st
  | 'top_3'             // 50/30/20
  | 'top_3_steep'       // 60/25/15
  | 'top_5'             // 40/25/15/12/8
  | 'top_10'            // 40/20/10 + 2% each 4th-10th (default)
  | 'custom';

// Prize presets with percentages
export const PRIZE_PRESETS: {
  id: PrizeDistributionType;
  name: string;
  percentages: number[];
  description: string;
}[] = [
  {
    id: 'winner_takes_all',
    name: 'Winner Takes All',
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
    id: 'top_3_steep',
    name: 'Top 3 Steep',
    percentages: [60, 25, 15],
    description: '60% / 25% / 15%'
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
    percentages: [40, 20, 10, 2, 2, 2, 2, 2, 2, 2],
    description: '40% / 20% / 10% + 2% each for 4th-10th'
  },
];

// Table theme types (matches constants.ts)
export type TableThemeKind = 'image' | 'video';

export interface TableTheme {
  kind: TableThemeKind;
  id: string;
}

// Rebuy configuration
export interface RebuyConfig {
  enabled: boolean;
  maxRebuys: number; // 0 = unlimited
}

// Validation constants
export const TOURNAMENT_VALIDATION = {
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 50,
  BUY_IN_MIN: BigInt('100000000000000000000'),           // 100 MORBIUS (18 decimals)
  BUY_IN_MAX: BigInt('1000000000000000000000000'),       // 1,000,000 MORBIUS
  STARTING_CHIPS_OPTIONS: [1000, 5000, 10000, 25000] as const,
  MAX_HANDS_OPTIONS: [25, 50, 100, 200, 500] as const,
  TIME_LIMIT_OPTIONS: [null, 60, 120, 240, 1440] as const, // minutes (null = no limit)
  MAX_REBUYS_OPTIONS: [0, 1, 3, 5] as const, // 0 = unlimited when enabled
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

// Max rebuys labels for display
export const MAX_REBUYS_LABELS: Record<number, string> = {
  0: 'Unlimited',
  1: '1 Rebuy',
  3: '3 Rebuys',
  5: '5 Rebuys',
};

// Create tournament request
export interface CreateTournamentRequest {
  name: string;
  buyInAmount: string; // BigInt as string
  startingChips: number;
  maxHands: number;
  timeLimitMinutes: number | null;
  rebuyConfig: RebuyConfig;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  customPrizePercentages?: number[]; // Only used when type is 'custom'
  maxPlayers?: number | null;
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
  rebuyConfig: RebuyConfig;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  prizePercentages: number[];
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
  rebuyConfig: RebuyConfig;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  createdAt: string;
  timeRemaining?: number; // Computed on client
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
  rebuyConfig: RebuyConfig;
  tableTheme: TableTheme;
  isPrivate: boolean;
  prizeDistributionType: PrizeDistributionType;
  prizePercentages: number[];
  createdAt: string;
}

// Rebuy result
export interface RebuyResult {
  success: boolean;
  newChips: number;
  rebuyCount: number;
  totalBuyIn: string;
  newPrizePool: string;
}

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

// Validate buy-in amount
export function validateBuyInAmount(amount: bigint): { valid: boolean; error?: string } {
  if (amount < TOURNAMENT_VALIDATION.BUY_IN_MIN) {
    return { valid: false, error: 'Minimum buy-in is 100 MORBIUS' };
  }
  if (amount > TOURNAMENT_VALIDATION.BUY_IN_MAX) {
    return { valid: false, error: 'Maximum buy-in is 1,000,000 MORBIUS' };
  }
  return { valid: true };
}

// Calculate prize for a rank given prize pool and distribution
export function calculatePrizeForRank(
  rank: number,
  prizePool: bigint,
  prizePercentages: number[]
): bigint {
  if (rank < 1 || rank > prizePercentages.length) return 0n;
  const percentage = prizePercentages[rank - 1];
  if (!percentage || percentage === 0) return 0n;
  // 84% of pool is distributed, 16% goes to house
  const distributablePool = (prizePool * 84n) / 100n;
  return (distributablePool * BigInt(percentage)) / 100n;
}

// Get example prize distribution for preview
export function getExamplePrizeDistribution(
  prizePool: bigint,
  prizePercentages: number[]
): { rank: number; percentage: number; amount: bigint }[] {
  const result: { rank: number; percentage: number; amount: bigint }[] = [];
  const distributablePool = (prizePool * 84n) / 100n;

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
