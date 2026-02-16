'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'

export interface PlayerProfileStats {
  total_games: number
  total_bet: bigint
  total_win: bigint
  profit_loss: bigint
  win_rate: number
  biggest_win: bigint
  biggest_loss: bigint
  favorite_bet_amount: bigint
  blackjack_count?: number
  current_streak?: number
  best_streak?: number
}

export interface PlayerProfileGame {
  id: string
  game_id: string
  result: 'win' | 'loss' | 'push' | 'blackjack' | null
  total_bet_amount: bigint
  total_payout: bigint
  created_at: string
  completed_at: string | null
}

export interface DisplayProfile {
  displayName: string | null
  profileImageUrl: string | null
}

/**
 * Hook to fetch display profile (name + avatar) for the connected wallet.
 * Use for WalletMenu on any nav so avatar and name show consistently.
 */
export function useProfile() {
  const { address } = useAccount()
  const query = useQuery<DisplayProfile>({
    queryKey: ['playerProfile', address],
    queryFn: async () => {
      if (!address) return { displayName: null, profileImageUrl: null }
      const res = await fetch(`/api/player/${address}/profile`)
      if (!res.ok) return { displayName: null, profileImageUrl: null }
      const data = await res.json()
      return {
        displayName: data.displayName ?? null,
        profileImageUrl: data.profileImageUrl ?? null,
      }
    },
    enabled: !!address,
    staleTime: 60_000,
  })
  return {
    profileDisplayName: query.data?.displayName ?? null,
    profileImageUrl: query.data?.profileImageUrl ?? null,
    isLoading: query.isLoading,
  }
}

/**
 * Hook to fetch player stats for any address
 */
export function usePlayerProfileStats(address: string | null) {
  return useQuery<PlayerProfileStats>({
    queryKey: ['playerProfileStats', address],
    queryFn: async () => {
      if (!address) throw new Error('Address required')

      const response = await fetch(`/api/player/${address}/stats`)
      if (!response.ok) {
        throw new Error('Failed to fetch player stats')
      }
      const data = await response.json()
      return {
        total_games: data.total_games || 0,
        total_bet: BigInt(data.total_bet || 0),
        total_win: BigInt(data.total_win || 0),
        profit_loss: BigInt(data.profit_loss || 0),
        win_rate: data.win_rate || 0,
        biggest_win: BigInt(data.biggest_win || 0),
        biggest_loss: BigInt(data.biggest_loss || 0),
        favorite_bet_amount: BigInt(data.favorite_bet_amount || 0),
        blackjack_count: data.blackjack_count || 0,
        current_streak: data.current_streak || 0,
        best_streak: data.best_streak || 0,
      }
    },
    enabled: !!address,
    refetchInterval: 30000,
  })
}

/**
 * Hook to fetch player game history for any address
 */
export function usePlayerProfileGames(address: string | null, limit: number = 50) {
  return useQuery<PlayerProfileGame[]>({
    queryKey: ['playerProfileGames', address, limit],
    queryFn: async () => {
      if (!address) throw new Error('Address required')

      const response = await fetch(`/api/player/${address}/games?limit=${limit}&offset=0`)
      if (!response.ok) {
        throw new Error('Failed to fetch player games')
      }
      const data = await response.json()
      const games = Array.isArray(data) ? data : (data?.games ?? data?.data ?? [])
      return games.map((game: any) => {
        const betRaw = game.total_bet_amount ?? game.totalBetAmount ?? game.bet_amount ?? game.betAmount ?? 0
        const payoutRaw = game.total_payout ?? game.totalPayout ?? game.payout ?? 0
        return {
          id: game.id || game.game_id,
          game_id: game.game_id || game.id,
          result: game.result,
          total_bet_amount: BigInt(typeof betRaw === 'string' ? betRaw : String(betRaw ?? 0)),
          total_payout: BigInt(typeof payoutRaw === 'string' ? payoutRaw : String(payoutRaw ?? 0)),
          created_at: game.created_at || game.createdAt,
          completed_at: game.completed_at || game.completedAt,
        }
      })
    },
    enabled: !!address,
  })
}
