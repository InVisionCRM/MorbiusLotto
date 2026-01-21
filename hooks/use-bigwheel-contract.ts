import { useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'

import { BIGWHEEL_ABI } from '@/abi/bigwheel'
import { BIGWHEEL_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { useAccount } from 'wagmi'
import { parseEther, formatEther } from 'viem'

// Extract ABI array from the artifact object
const BIGWHEEL_ABI_ARRAY = BIGWHEEL_ABI.abi || BIGWHEEL_ABI

// BetType enum mapping (matches contract)
export enum BetType {
  ONE = 0,      // 1x multiplier
  TWO = 1,      // 2x multiplier
  FIVE = 2,     // 5x multiplier
  TEN = 3,      // 10x multiplier
  TWENTY = 4,   // 20x multiplier
  JOKER = 5,    // 40x multiplier
  MORBIUS = 6,  // 40x multiplier
}

// Convert frontend BetType string to contract enum
export function betTypeToEnum(betType: string): BetType {
  const mapping: Record<string, BetType> = {
    '1': BetType.ONE,
    '2': BetType.TWO,
    '5': BetType.FIVE,
    '10': BetType.TEN,
    '20': BetType.TWENTY,
    'JOKER': BetType.JOKER,
    'MORBIUS': BetType.MORBIUS,
  }
  return mapping[betType] ?? BetType.ONE
}

// ============ Read Hooks ============

/**
 * Get bet limits (min and max MORBIUS per bet)
 */
export function useBetLimits() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI_ARRAY,
    functionName: 'minBetAmount',
    query: {
      enabled: isValidAddress,
      refetchInterval: 30000,
    },
  })
}

export function useMaxBet() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'maxBetAmount',
    query: {
      enabled: isValidAddress,
      refetchInterval: 30000,
    },
  })
}

/**
 * Get segment counts for each bet type
 */
export function useSegmentCounts() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getSegmentCounts',
    query: {
      enabled: isValidAddress,
    },
  })
}

/**
 * Get multipliers for each bet type
 */
export function useMultipliers() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getMultipliers',
    query: {
      enabled: isValidAddress,
    },
  })
}

/**
 * Get odds for a specific bet type
 */
export function useOdds(betType: BetType) {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getOdds',
    args: [betType],
    query: {
      enabled: isValidAddress,
    },
  })
}

/**
 * Get expected payout for a bet
 */
export function useExpectedPayout(betAmount: bigint, betType: BetType) {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getExpectedPayout',
    args: [betAmount, betType],
    query: {
      enabled: isValidAddress && betAmount > BigInt(0),
    },
  })
}

/**
 * Get contract reserve balance
 */
export function useContractReserve() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'contractReserve',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

/**
 * Get player statistics
 */
export function usePlayerStats(playerAddress?: `0x${string}`) {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getPlayerStats',
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: isValidAddress && !!playerAddress,
      refetchInterval: 5000,
    },
  })
}

/**
 * Get global game statistics
 */
export function useGlobalStats() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'getGlobalStats',
    query: {
      enabled: isValidAddress,
      refetchInterval: 15000,
    },
  })
}

/**
 * Check if contract is paused
 */
export function useIsPaused() {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    functionName: 'paused',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// ============ Write Hooks ============

/**
 * Hook for all write operations (place bet, etc.)
 */
export function useBigWheelWrite() {
  return useWriteContract()
}

// ============ Event Watchers ============

/**
 * Watch for BetPlaced events
 */
export function useWatchBetPlaced(onEvent: (event: any) => void) {
  const isValidAddress = (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  useWatchContractEvent({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_ABI.abi,
    eventName: 'BetPlaced',
    onLogs(logs) {
      logs.forEach((log) => onEvent(log))
    },
    enabled: isValidAddress,
  })
}

// ============ Helper Hooks ============

/**
 * Combined hook for player data (includes connected wallet check)
 */
export function usePlayerData() {
  const { address } = useAccount()
  const playerStats = usePlayerStats(address)

  return {
    address,
    isConnected: !!address,
    playerStats,
  }
}

/**
 * Combined hook for game configuration
 */
export function useGameConfig() {
  const minBet = useBetLimits()
  const maxBet = useMaxBet()
  const segmentCounts = useSegmentCounts()
  const multipliers = useMultipliers()
  const reserve = useContractReserve()
  const globalStats = useGlobalStats()
  const isPaused = useIsPaused()

  return {
    minBet,
    maxBet,
    segmentCounts,
    multipliers,
    reserve,
    globalStats,
    isPaused,
  }
}
