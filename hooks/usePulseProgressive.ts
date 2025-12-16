import { useReadContract } from 'wagmi'
import { KENO_ADDRESS } from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'

export function usePulseProgressive() {
  // Read progressive stats
  const { data: statsData, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getProgressiveStats' as any, // TODO: Update ABI when Keno is deployed
    query: {
      refetchInterval: 300000, // 5 minutes
    }
  })

  // Also read cost per draw directly as a fallback
  const { data: costData } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'progressiveCostPerDraw' as any, // TODO: Update ABI when Keno is deployed
  })

  if (!statsData) {
    return {
      currentPool: BigInt(0),
      baseSeed: BigInt(0),
      costPerDraw: (costData as bigint) || BigInt(0),
      totalCollected: BigInt(0),
      totalPaid: BigInt(0),
      winCount: BigInt(0),
      lastWinRound: BigInt(0),
      isLoading: statsLoading,
      error: statsError,
      refetch: refetchStats
    }
  }

  const [
    currentPool,
    baseSeed,
    costPerDraw,
    totalCollected,
    totalPaid,
    winCount,
    lastWinRound
  ] = statsData as unknown as [bigint, bigint, bigint, bigint, bigint, bigint, bigint]

  return {
    currentPool,
    baseSeed,
    costPerDraw: costPerDraw || (costData as bigint) || BigInt(0),
    totalCollected,
    totalPaid,
    winCount,
    lastWinRound,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats
  }
}

// Hook to check if a ticket is eligible for progressive
export function useProgressiveEligible(spotSize: number) {
  return spotSize >= 9
}

// Hook to calculate progressive cost
export function useProgressiveCost(draws: number) {
  const { data: costPerDraw } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'progressiveCostPerDraw' as any, // TODO: Update ABI when Keno is deployed
  })

  if (!costPerDraw) return BigInt(0)

  return (costPerDraw as bigint) * BigInt(draws)
}
