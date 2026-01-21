import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface EnhancedPlayerStats {
  total_games: number;
  total_bet: bigint;
  total_win: bigint;
  win_rate: number;
  blackjack_count: number;
  current_streak: number;
  best_streak: number;
  biggest_win: bigint;
  biggest_loss: bigint;
  average_bet: number;
  average_payout: number;
  profit_loss: bigint;
  roi: number;
  games_today: number;
  games_this_week: number;
  favorite_bet_amount: bigint;
  last_game_timestamp?: string;
  rank: number;
}

export interface GlobalAnalytics {
  total_players: number;
  active_players: number;
  total_games_played: number;
  total_volume: bigint;
  total_payouts: bigint;
  house_profit: bigint;
  games_last_hour: number;
  games_last_24_hours: number;
  volume_last_24_hours: bigint;
  profit_last_24_hours: bigint;
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
  largest_bet: bigint;
  largest_payout: bigint;
}

/**
 * Hook to fetch enhanced player statistics
 */
export function usePlayerStatsEnhanced() {
  const { address } = useAccount();

  return useQuery<EnhancedPlayerStats>({
    queryKey: ['playerStatsEnhanced', address],
    queryFn: async () => {
      if (!address) throw new Error('Wallet not connected');
      
      const response = await fetch(`${API_BASE_URL}/api/player/${address}/stats/enhanced`);
      if (!response.ok) {
        throw new Error('Failed to fetch player stats');
      }
      const data = await response.json();
      
      // Convert string bigints to BigInt
      return {
        ...data,
        total_bet: BigInt(data.total_bet || 0),
        total_win: BigInt(data.total_win || 0),
        biggest_win: BigInt(data.biggest_win || 0),
        biggest_loss: BigInt(data.biggest_loss || 0),
        profit_loss: BigInt(data.profit_loss || 0),
        favorite_bet_amount: BigInt(data.favorite_bet_amount || 0),
      };
    },
    enabled: !!address,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Hook to fetch global analytics
 */
export function useGlobalAnalytics() {
  return useQuery<GlobalAnalytics>({
    queryKey: ['globalAnalytics'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/analytics/global`);
      if (!response.ok) {
        throw new Error('Failed to fetch global analytics');
      }
      const data = await response.json();
      
      // Convert string bigints to BigInt
      return {
        ...data,
        total_volume: BigInt(data.total_volume || 0),
        total_payouts: BigInt(data.total_payouts || 0),
        house_profit: BigInt(data.house_profit || 0),
        volume_last_24_hours: BigInt(data.volume_last_24_hours || 0),
        profit_last_24_hours: BigInt(data.profit_last_24_hours || 0),
        largest_bet: BigInt(data.largest_bet || 0),
        largest_payout: BigInt(data.largest_payout || 0),
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Hook to fetch player game history
 */
export function usePlayerGames(limit: number = 50, offset: number = 0) {
  const { address } = useAccount();

  return useQuery({
    queryKey: ['playerGames', address, limit, offset],
    queryFn: async () => {
      if (!address) throw new Error('Wallet not connected');
      
      const response = await fetch(
        `${API_BASE_URL}/api/player/${address}/games?limit=${limit}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch player games');
      }
      return response.json();
    },
    enabled: !!address,
  });
}

/**
 * Hook to fetch settlements
 */
export function useSettlements(status?: string, limit: number = 100) {
  return useQuery({
    queryKey: ['settlements', status, limit],
    queryFn: async () => {
      const url = new URL(`${API_BASE_URL}/api/settlements`);
      if (status) url.searchParams.set('status', status);
      url.searchParams.set('limit', limit.toString());
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch settlements');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
