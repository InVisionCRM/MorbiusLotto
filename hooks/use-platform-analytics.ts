import { useQuery } from '@tanstack/react-query';
import { toBigIntSafe } from '@/lib/safe-bigint';

export interface PlinkoChainStats {
  totalDrops: bigint;
  totalBallsSold: bigint;
  totalRevenue: bigint;
  totalPayouts: bigint;
  contractReserve: bigint;
}

export interface KenoChainStats {
  totalWagered: bigint;
  totalWon: bigint;
  ticketCount: bigint;
  activeRoundId: bigint;
}

export interface LotteryChainStats {
  totalTicketsEver: bigint;
  totalCollected: bigint;
  totalClaimed: bigint;
}

export interface BigWheelChainStats {
  spins: bigint;
  volume: bigint;
  payouts: bigint;
  contractBalance: bigint;
  contractReserveBalance: bigint;
}

/** All-time biggest single win from the unified chip ledger (whole chips, 1 chip = 1 MORBIUS). */
export interface BiggestWin {
  amountChips: string;
  game: string;
  address: string;
  username: string | null;
}

export interface PlatformAnalytics {
  blackjack: {
    total_players: number;
    active_players: number;
    total_games_played: number;
    total_volume: string;
    total_payouts: string;
    house_profit: string;
    games_last_hour: number;
    games_last_24_hours: number;
    volume_last_24_hours: string;
    profit_last_24_hours: string;
    average_win_rate: number;
    average_bet_size: number;
    house_edge: number;
    active_connections: number;
    blackjack_rate: number;
    split_rate: number;
    double_down_rate: number;
    surrender_rate: number;
    pending_settlements: number;
    failed_settlements: number;
    largest_bet: string;
    largest_payout: string;
  };
  plinko: PlinkoChainStats | null;
  keno: KenoChainStats | null;
  lottery: LotteryChainStats | null;
  bigWheel: BigWheelChainStats | null;
  combined: {
    totalGamesPlayed: string;
    totalVolume: string;
    totalPayouts: string;
  };
  /** Null when there are no payout rows yet or the backend doesn't return it. */
  biggestWin: BiggestWin | null;
}

const DEFAULT_BLACKJACK_ANALYTICS: PlatformAnalytics['blackjack'] = {
  total_players: 0,
  active_players: 0,
  total_games_played: 0,
  total_volume: '0',
  total_payouts: '0',
  house_profit: '0',
  games_last_hour: 0,
  games_last_24_hours: 0,
  volume_last_24_hours: '0',
  profit_last_24_hours: '0',
  average_win_rate: 0,
  average_bet_size: 0,
  house_edge: 0,
  active_connections: 0,
  blackjack_rate: 0,
  split_rate: 0,
  double_down_rate: 0,
  surrender_rate: 0,
  pending_settlements: 0,
  failed_settlements: 0,
  largest_bet: '0',
  largest_payout: '0',
};

function parsePlatformResponse(data: any): PlatformAnalytics {
  const toBigInt = (v: unknown) => toBigIntSafe(v ?? 0);
  return {
    blackjack: {
      ...DEFAULT_BLACKJACK_ANALYTICS,
      ...(data.blackjack ?? {}),
    },
    plinko: data.plinko
      ? {
          totalDrops: toBigInt(data.plinko.totalDrops),
          totalBallsSold: toBigInt(data.plinko.totalBallsSold),
          totalRevenue: toBigInt(data.plinko.totalRevenue),
          totalPayouts: toBigInt(data.plinko.totalPayouts),
          contractReserve: toBigInt(data.plinko.contractReserve),
        }
      : null,
    keno: data.keno
      ? {
          totalWagered: toBigInt(data.keno.totalWagered),
          totalWon: toBigInt(data.keno.totalWon),
          ticketCount: toBigInt(data.keno.ticketCount),
          activeRoundId: toBigInt(data.keno.activeRoundId),
        }
      : null,
    lottery: data.lottery
      ? {
          totalTicketsEver: toBigInt(data.lottery.totalTicketsEver),
          totalCollected: toBigInt(data.lottery.totalCollected),
          totalClaimed: toBigInt(data.lottery.totalClaimed),
        }
      : null,
    bigWheel: data.bigWheel
      ? {
          spins: toBigInt(data.bigWheel.spins),
          volume: toBigInt(data.bigWheel.volume),
          payouts: toBigInt(data.bigWheel.payouts),
          contractBalance: toBigInt(data.bigWheel.contractBalance),
          contractReserveBalance: toBigInt(data.bigWheel.contractReserveBalance),
        }
      : null,
    combined: {
      totalGamesPlayed: String(data.combined?.totalGamesPlayed ?? 0),
      totalVolume: String(data.combined?.totalVolume ?? 0),
      totalPayouts: String(data.combined?.totalPayouts ?? 0),
    },
    biggestWin:
      data.biggestWin && data.biggestWin.amountChips != null
        ? {
            amountChips: String(data.biggestWin.amountChips),
            game: String(data.biggestWin.game ?? ''),
            address: String(data.biggestWin.address ?? ''),
            username: data.biggestWin.username != null ? String(data.biggestWin.username) : null,
          }
        : null,
  };
}

function defaultPlatformAnalytics(): PlatformAnalytics {
  return {
    blackjack: DEFAULT_BLACKJACK_ANALYTICS,
    plinko: null,
    keno: null,
    lottery: null,
    bigWheel: null,
    combined: { totalGamesPlayed: '0', totalVolume: '0', totalPayouts: '0' },
    biggestWin: null,
  };
}

export function usePlatformAnalytics() {
  // Use same-origin proxy to avoid CORS / "Failed to fetch" when calling backend from the browser
  const url = '/api/analytics/platform';
  return useQuery<PlatformAnalytics>({
    queryKey: ['platformAnalytics'],
    queryFn: async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const text = await response.text();
          let msg = `Failed to fetch platform analytics: ${response.status} ${response.statusText}`;
          try {
            const j = JSON.parse(text);
            msg = (j as { error?: string }).error ?? msg;
          } catch {
            msg = text || msg;
          }
          throw new Error(msg);
        }
        const data = await response.json();
        return parsePlatformResponse(data);
      } catch (error) {
        console.error('Error in usePlatformAnalytics:', error);
        throw error;
      }
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  });
}
