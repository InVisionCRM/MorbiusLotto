"use client"

import { useEffect, useState } from 'react'
import { useReadContract, useAccount } from 'wagmi'
import { KENO_ABI } from '@/lib/keno-abi'
import { KENO_ADDRESS } from '@/lib/contracts'
import { formatEther } from 'viem'

export interface PlayerStats {
  totalWagered: bigint
  totalWon: bigint
  ticketCount: bigint
  winCount: bigint
  winRateBps: bigint
  netPnL: bigint
  // Derived fields
  winRate: number // As percentage
  netProfitLoss: number // As number (can be negative)
  isProfit: boolean
}

export interface GlobalStats {
  totalWagered: bigint
  totalWon: bigint
  ticketCount: bigint
  activeRoundId: bigint
}

export function useKenoStats() {
  const { address } = useAccount()
  const [refreshKey, setRefreshKey] = useState(0)

  // Player stats
  const {
    data: playerStatsRaw,
    isLoading: isLoadingPlayer,
    refetch: refetchPlayer,
  } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  })

  // Global stats
  const {
    data: globalStatsRaw,
    isLoading: isLoadingGlobal,
    refetch: refetchGlobal,
  } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getGlobalStats',
    query: {
      refetchInterval: 10000,
    },
  })

  // Unclaimed winnings
  const {
    data: unclaimedWinnings,
    isLoading: isLoadingUnclaimed,
    refetch: refetchUnclaimed,
  } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getPlayerUnclaimedWinnings',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  })

  // Process player stats
  const playerStats: PlayerStats | null = playerStatsRaw
    ? {
        totalWagered: playerStatsRaw[0],
        totalWon: playerStatsRaw[1],
        ticketCount: playerStatsRaw[2],
        winCount: playerStatsRaw[3],
        winRateBps: playerStatsRaw[4],
        netPnL: playerStatsRaw[5],
        winRate: Number(playerStatsRaw[4]) / 100, // BPS to percentage
        netProfitLoss: Number(formatEther(playerStatsRaw[5])),
        isProfit: playerStatsRaw[5] >= BigInt(0),
      }
    : null

  // Process global stats
  const globalStats: GlobalStats | null = globalStatsRaw
    ? {
        totalWagered: globalStatsRaw[0],
        totalWon: globalStatsRaw[1],
        ticketCount: globalStatsRaw[2],
        activeRoundId: globalStatsRaw[3],
      }
    : null

  // Manual refresh function
  const refresh = async () => {
    await Promise.all([refetchPlayer(), refetchGlobal(), refetchUnclaimed()])
    setRefreshKey((prev) => prev + 1)
  }

  return {
    playerStats,
    globalStats,
    unclaimedWinnings: unclaimedWinnings || BigInt(0),
    isLoading: isLoadingPlayer || isLoadingGlobal || isLoadingUnclaimed,
    refresh,
    refreshKey,
  }
}
