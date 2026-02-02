import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

import { getApiUrl } from '@/lib/api-urls';

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
      
      try {
        const response = await fetch(`${getApiUrl()}/api/player/${address}/stats/enhanced`);
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to fetch player stats';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          console.error('Player stats API error:', response.status, errorMessage);
          throw new Error(errorMessage);
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
      } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw new Error(`Cannot connect to backend server at ${getApiUrl()}. Make sure the server is running (cd server && npm run dev)`);
        }
        throw error;
      }
    },
    enabled: !!address,
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1, // Only retry once
  });
}

/**
 * Hook to fetch global analytics
 */
export function useGlobalAnalytics() {
  return useQuery<GlobalAnalytics>({
    queryKey: ['globalAnalytics'],
    queryFn: async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/analytics/global`);
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to fetch global analytics';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          console.error('Global analytics API error:', response.status, errorMessage);
          throw new Error(errorMessage);
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
      } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw new Error(`Cannot connect to backend server at ${getApiUrl()}. Make sure the server is running (cd server && npm run dev)`);
        }
        throw error;
      }
    },
    refetchInterval: 60000, // Refetch every minute
    retry: 1, // Only retry once
  });
}

export interface TopPlayerEntry {
  rank: number;
  wallet_address: string;
  total_games: number;
  total_bet: bigint;
  total_win: bigint;
  profit_loss: bigint;
  win_rate: number;
}

/**
 * Hook to fetch top players leaderboard (by total volume)
 */
export function useBlackjackTopPlayers(limit: number = 10) {
  return useQuery<TopPlayerEntry[]>({
    queryKey: ['blackjackTopPlayers', limit],
    queryFn: async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/analytics/top-players?limit=${limit}`);
        if (!response.ok) {
          throw new Error('Failed to fetch top players');
        }
        const data = await response.json();
        return (Array.isArray(data) ? data : []).map((row: any) => ({
          ...row,
          total_bet: BigInt(row.total_bet ?? 0),
          total_win: BigInt(row.total_win ?? 0),
          profit_loss: BigInt(row.profit_loss ?? 0),
        }));
      } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw new Error(`Cannot connect to backend server at ${getApiUrl()}. Make sure the server is running.`);
        }
        throw error;
      }
    },
    refetchInterval: 60000,
    retry: 1,
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
        `${getApiUrl()}/api/player/${address}/games?limit=${limit}&offset=${offset}`
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
      const url = new URL(`${getApiUrl()}/api/settlements`);
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
