'use client'

import { useQuery } from '@tanstack/react-query'
import { formatEther } from 'viem'
import type { RiskLevel } from '@/app/PLINKO/types'
import type { PlinkoDrop, PlinkoPlayerStats } from '@/lib/plinko-types'

type ApiDrop = {
  id: string
  player: string
  bucketIndex: number
  multiplierBps: string
  payout: string
  wager: string
  profit: string
  riskLevel: 'GREEN' | 'YELLOW' | 'RED'
  blockNumber: string
  transactionHash: string
  timestamp: number
}

type ApiStats = {
  totalDrops: number
  totalWagered: string
  totalWon: string
  netProfit: string
  biggestWin: string
  biggestMultiplierBps: string
  winRate: number
}

function toMorbiusNumber(wei: string): number {
  return Number(formatEther(BigInt(wei || '0')))
}

function toRiskLevel(level: ApiDrop['riskLevel']): RiskLevel {
  if (level === 'GREEN' || level === 'YELLOW' || level === 'RED') return level
  return 'GREEN'
}

export function usePlinkoPlayerDashboard(playerAddress: string | null, limit: number = 200) {
  const normalizedAddress = playerAddress
    ? (playerAddress.startsWith('0x') ? playerAddress : `0x${playerAddress}`)
    : null

  const statsQuery = useQuery<ApiStats>({
    queryKey: ['plinkoPlayerDashboardStats', normalizedAddress],
    enabled: !!normalizedAddress,
    queryFn: async () => {
      const res = await fetch(`/api/plinko/player/${normalizedAddress}/stats`)
      if (!res.ok) throw new Error('Failed to fetch plinko stats')
      return res.json()
    },
    staleTime: 30_000,
  })

  const dropsQuery = useQuery<ApiDrop[]>({
    queryKey: ['plinkoPlayerDashboardDrops', normalizedAddress, limit],
    enabled: !!normalizedAddress,
    queryFn: async () => {
      const res = await fetch(`/api/plinko/player/${normalizedAddress}/drops?limit=${limit}&offset=0`)
      if (!res.ok) throw new Error('Failed to fetch plinko drops')
      return res.json()
    },
    staleTime: 30_000,
  })

  const drops: PlinkoDrop[] = (dropsQuery.data ?? []).map((d) => ({
    id: d.id,
    timestamp: d.timestamp * 1000,
    player: d.player,
    wager: toMorbiusNumber(d.wager),
    multiplier: Number(d.multiplierBps) / 100,
    winAmount: toMorbiusNumber(d.payout),
    profit: toMorbiusNumber(d.profit),
    riskLevel: toRiskLevel(d.riskLevel),
    bucketIndex: d.bucketIndex,
    blockNumber: Number(d.blockNumber),
    transactionHash: d.transactionHash,
  }))

  const stats: PlinkoPlayerStats | null = statsQuery.data
    ? {
        totalDrops: statsQuery.data.totalDrops,
        totalWagered: toMorbiusNumber(statsQuery.data.totalWagered),
        totalWon: toMorbiusNumber(statsQuery.data.totalWon),
        netProfit: toMorbiusNumber(statsQuery.data.netProfit),
        biggestWin: toMorbiusNumber(statsQuery.data.biggestWin),
        biggestMultiplier: Number(statsQuery.data.biggestMultiplierBps) / 100,
        winRate: statsQuery.data.winRate,
        dropsByRisk: {
          GREEN: drops.filter((d) => d.riskLevel === 'GREEN').length,
          YELLOW: drops.filter((d) => d.riskLevel === 'YELLOW').length,
          RED: drops.filter((d) => d.riskLevel === 'RED').length,
        },
        profitByRisk: {
          GREEN: drops.filter((d) => d.riskLevel === 'GREEN').reduce((acc, d) => acc + d.profit, 0),
          YELLOW: drops.filter((d) => d.riskLevel === 'YELLOW').reduce((acc, d) => acc + d.profit, 0),
          RED: drops.filter((d) => d.riskLevel === 'RED').reduce((acc, d) => acc + d.profit, 0),
        },
        last10Drops: drops.slice(0, 10),
        recentWinRate:
          drops.slice(0, 10).length > 0
            ? (drops.slice(0, 10).filter((d) => d.profit > 0).length / drops.slice(0, 10).length) * 100
            : 0,
      }
    : null

  return {
    drops,
    stats,
    isLoading: statsQuery.isLoading || dropsQuery.isLoading,
  }
}
