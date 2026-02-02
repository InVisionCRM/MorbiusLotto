import { useQuery } from '@tanstack/react-query';
import { getApiUrlOptional } from '@/lib/api-urls';

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
}

function parsePlatformResponse(data: any): PlatformAnalytics {
  const toBigInt = (v: unknown) => BigInt(String(v ?? 0));
  return {
    blackjack: data.blackjack ?? {},
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
  };
}

function defaultPlatformAnalytics(): PlatformAnalytics {
  return {
    blackjack: {},
    plinko: null,
    keno: null,
    lottery: null,
    bigWheel: null,
    combined: { totalGamesPlayed: '0', totalVolume: '0', totalPayouts: '0' },
  };
}

export function usePlatformAnalytics() {
  const apiUrl = getApiUrlOptional();
  return useQuery<PlatformAnalytics>({
    queryKey: ['platformAnalytics', !!apiUrl],
    queryFn: async () => {
      if (!apiUrl) return defaultPlatformAnalytics();
      const response = await fetch(`${apiUrl}/api/analytics/platform`);
      if (!response.ok) {
        const text = await response.text();
        let msg = 'Failed to fetch platform analytics';
        try {
          const j = JSON.parse(text);
          msg = j.error ?? msg;
        } catch {
          msg = text || msg;
        }
        throw new Error(msg);
      }
      const data = await response.json();
      return parsePlatformResponse(data);
    },
    refetchInterval: 60_000,
    retry: 1,
  });
}
