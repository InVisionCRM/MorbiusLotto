'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWatchContractEvent,
  usePublicClient,
} from 'wagmi'
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55'
import { LOTTERY_INSTANT_ADDRESS } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { getApiUrlOptional } from '@/lib/api-urls'
import { toBigIntSafe } from '@/lib/safe-bigint'

const ZERO = '0x0000000000000000000000000000000000000000'
const isDeployed = (LOTTERY_INSTANT_ADDRESS as string) !== ZERO

export type InstantLotteryResultRow = {
  player: `0x${string}`
  playerNumbers: readonly number[]
  winningNumbers: readonly number[]
  matchCount: number
  wager: bigint
  grossPayout: bigint
  netPayout: bigint
  blockNumber?: bigint
  transactionHash?: `0x${string}`
  /** Unix seconds; set when block is fetched for display */
  timestamp?: number
}

export function useContractReserve() {
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'contractReserve',
    query: { enabled: isDeployed },
  })
}

export function useWagerLimits() {
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'getWagerLimits',
    query: { enabled: isDeployed },
  })
}

export function useMaxPayoutForWager(wager: bigint | undefined) {
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'getMaxPayoutForWager',
    args: wager != null ? [wager] : undefined,
    query: { enabled: isDeployed && wager != null && wager > 0n },
  })
}

export function useInstantLotteryStats() {
  const plays = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'totalPlays',
    query: { enabled: isDeployed },
  })
  const wagered = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'totalWagered',
    query: { enabled: isDeployed },
  })
  const payouts = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'totalPayouts',
    query: { enabled: isDeployed },
  })
  return {
    totalPlays: plays.data ?? 0n,
    totalWagered: wagered.data ?? 0n,
    totalPayouts: payouts.data ?? 0n,
    isLoading: plays.isLoading || wagered.isLoading || payouts.isLoading,
    refetch: () => {
      plays.refetch()
      wagered.refetch()
      payouts.refetch()
    },
  }
}

export function usePlayLottery() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const playLottery = useCallback(
    (numbers: [number, number, number, number, number, number], wager: bigint) => {
      writeContract({
        address: LOTTERY_INSTANT_ADDRESS,
        abi: INSTANT_LOTTERY_6OF55_ABI,
        functionName: 'playLottery',
        args: [numbers, wager],
        chain: pulsechain,
        account: address!,
        maxPriorityFeePerGas: 200_000n,
      })
    },
    [writeContract, address]
  )

  return { playLottery, ...rest }
}

export function usePlayLotteryWithPLS() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const playLotteryWithPLS = useCallback(
    (numbers: [number, number, number, number, number, number], valueWei: bigint) => {
      writeContract({
        address: LOTTERY_INSTANT_ADDRESS,
        abi: INSTANT_LOTTERY_6OF55_ABI,
        functionName: 'playLotteryWithPLS',
        args: [numbers],
        chain: pulsechain,
        account: address!,
        value: valueWei,
        maxPriorityFeePerGas: 200_000n,
      })
    },
    [writeContract, address]
  )

  return { playLotteryWithPLS, ...rest }
}

function parseResultLog(args: {
  player?: unknown
  playerNumbers?: unknown
  winningNumbers?: unknown
  matchCount?: unknown
  wager?: unknown
  grossPayout?: unknown
  netPayout?: unknown
}, blockNumber?: bigint, transactionHash?: `0x${string}`): InstantLotteryResultRow {
  const p = (args.player ?? '') as `0x${string}`
  const pn = Array.isArray(args.playerNumbers) ? [...args.playerNumbers].map(Number) : []
  const wn = Array.isArray(args.winningNumbers) ? [...args.winningNumbers].map(Number) : []
  return {
    player: p,
    playerNumbers: pn,
    winningNumbers: wn,
    matchCount: Number(args.matchCount ?? 0),
    wager: toBigIntSafe(args.wager),
    grossPayout: toBigIntSafe(args.grossPayout),
    netPayout: toBigIntSafe(args.netPayout),
    blockNumber,
    transactionHash,
  }
}

/** Recent instant lottery results (last N from chain + live new events). Optional filter by player. */
export function useInstantLotteryResults(options: {
  playerAddress?: `0x${string}` | null
  limit?: number
} = {}) {
  const { playerAddress, limit = 50 } = options
  const [results, setResults] = useState<InstantLotteryResultRow[]>([])
  const publicClient = usePublicClient({ chainId: pulsechain.id })

  const append = useCallback((row: InstantLotteryResultRow) => {
    setResults((prev) => [row, ...prev].slice(0, limit))
  }, [limit])

  useWatchContractEvent({
    address: isDeployed ? LOTTERY_INSTANT_ADDRESS : undefined,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    eventName: 'InstantLotteryResult',
    onLogs(logs) {
      for (const log of logs) {
        if (playerAddress && (log.args as { player?: string }).player?.toLowerCase() !== playerAddress.toLowerCase()) continue
        const row = parseResultLog(
          log.args as Record<string, unknown>,
          log.blockNumber,
          log.transactionHash
        )
        append(row)
      }
    },
  })

  useEffect(() => {
    if (!publicClient || !isDeployed) return
    let cancelled = false
    const fetchRecent = async () => {
      try {
        const toBlock = await publicClient.getBlockNumber()
        // When showing a specific player's history, fetch more blocks so "My Recent Plays" is full history
        const blockWindow = playerAddress ? 50000n : 50000n
        const fromBlock = toBlock - blockWindow > 0n ? toBlock - blockWindow : 0n
        const logs = await publicClient.getContractEvents({
          address: LOTTERY_INSTANT_ADDRESS,
          abi: INSTANT_LOTTERY_6OF55_ABI,
          eventName: 'InstantLotteryResult',
          args: playerAddress ? { player: playerAddress } : undefined,
          fromBlock,
          toBlock,
        })
        const rows: InstantLotteryResultRow[] = logs.map((l) =>
          parseResultLog(
            (l.args || {}) as Record<string, unknown>,
            l.blockNumber,
            l.transactionHash
          )
        )

        const recentRows = rows.slice(-limit).reverse()
        const blockNumbers = [...new Set(recentRows.map((r) => r.blockNumber).filter((b): b is bigint => b != null))]
        if (blockNumbers.length > 0) {
          const blocks = await Promise.all(blockNumbers.map((b) => publicClient.getBlock({ blockNumber: b })))
          const blockToTime = Object.fromEntries(blocks.map((b) => [String(b.number), Number(b.timestamp)]))
          const withTimestamps = recentRows.map((r) => ({
            ...r,
            timestamp: r.blockNumber != null ? blockToTime[String(r.blockNumber)] : undefined,
          }))
          if (!cancelled) setResults(withTimestamps)
        } else {
          if (!cancelled) setResults(recentRows)
        }
      } catch {
        if (!cancelled) setResults([])
      }
    }
    fetchRecent()
    return () => { cancelled = true }
  }, [publicClient, playerAddress, limit])

  return { results, append }
}

/** Aggregated entry for leaderboard (matches Blackjack top-player shape) */
export type LotteryTopPlayerEntry = {
  rank: number
  wallet_address: string
  total_games: number
  total_bet: bigint
  total_win: bigint
  profit_loss: bigint
  win_rate: number
}

/** Top players from chain only (recent ~5000 blocks). Used when backend is not configured. */
function useLotteryTopPlayersFromChain(limit: number): LotteryTopPlayerEntry[] {
  const { results } = useInstantLotteryResults({ playerAddress: undefined, limit: 1000 })
  return useMemo(() => {
    const byPlayer = new Map<string, { plays: number; wagered: bigint; won: bigint; winningPlays: number }>()
    for (const r of results) {
      const addr = (r.player ?? '').toLowerCase()
      if (!addr) continue
      const cur = byPlayer.get(addr) ?? { plays: 0, wagered: 0n, won: 0n, winningPlays: 0 }
      cur.plays += 1
      cur.wagered += r.wager
      cur.won += r.grossPayout
      if (r.netPayout > 0n) cur.winningPlays += 1
      byPlayer.set(addr, cur)
    }
    const list = Array.from(byPlayer.entries())
      .map(([wallet_address, agg]) => ({
        wallet_address,
        total_games: agg.plays,
        total_bet: agg.wagered,
        total_win: agg.won,
        profit_loss: agg.won - agg.wagered,
        win_rate: agg.plays ? (agg.winningPlays / agg.plays) * 100 : 0,
      }))
      .filter((e) => e.total_games > 0)
      .sort((a, b) => (b.total_bet > a.total_bet ? 1 : b.total_bet < a.total_bet ? -1 : 0))
      .slice(0, limit)
    return list.map((e, i) => ({ ...e, rank: i + 1 }))
  }, [results, limit])
}

/**
 * Top players from instant lottery (by total wagered).
 * Uses backend API when NEXT_PUBLIC_API_URL is set (all-time indexed plays); otherwise derives from recent chain events.
 */
export function useLotteryTopPlayers(limit: number = 25) {
  const apiUrl = getApiUrlOptional()
  const fromChain = useLotteryTopPlayersFromChain(limit)
  const fromApi = useQuery<LotteryTopPlayerEntry[]>({
    queryKey: ['lotteryTopPlayers', limit],
    queryFn: async () => {
      if (!apiUrl) return []
      const res = await fetch(`${apiUrl}/api/lottery/top-players?limit=${limit}`)
      if (!res.ok) throw new Error(`Lottery top players: ${res.status}`)
      const data = await res.json()
      return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
        rank: Number(row.rank ?? 0),
        wallet_address: String(row.wallet_address ?? ''),
        total_games: Number(row.total_games ?? 0),
        total_bet: toBigIntSafe(row.total_bet),
        total_win: toBigIntSafe(row.total_win),
        profit_loss: toBigIntSafe(row.profit_loss),
        win_rate: Number(row.win_rate ?? 0),
      }))
    },
    enabled: !!apiUrl,
    refetchInterval: 60_000,
    retry: 1,
  })
  if (apiUrl) {
    // When API errors (e.g. server not restarted, migration not run), fall back to chain data so leaderboard still shows
    const useFallback = fromApi.isError && fromApi.error
    return {
      data: useFallback ? fromChain : (fromApi.data ?? []),
      isLoading: fromApi.isLoading && !useFallback,
      error: useFallback ? null : fromApi.error,
    }
  }
  return { data: fromChain, isLoading: false, error: null }
}

/** Per-player stats from chain (contract view). All-time from contract. */
export function usePlayerInstantLotteryStats(playerAddress: `0x${string}` | undefined) {
  const plays = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'playerTotalPlays',
    args: playerAddress ? [playerAddress] : undefined,
    query: { enabled: isDeployed && !!playerAddress },
  })
  const wagered = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'playerTotalWagered',
    args: playerAddress ? [playerAddress] : undefined,
    query: { enabled: isDeployed && !!playerAddress },
  })
  const won = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'playerTotalWon',
    args: playerAddress ? [playerAddress] : undefined,
    query: { enabled: isDeployed && !!playerAddress },
  })
  return {
    totalPlays: toBigIntSafe(plays.data),
    totalWagered: toBigIntSafe(wagered.data),
    totalWon: toBigIntSafe(won.data),
    isLoading: plays.isLoading || wagered.isLoading || won.isLoading,
  }
}

/** Normalized lottery player stats (from API or chain). Prefer backend when available (indexed plays: win_rate, profit_loss). */
export interface LotteryPlayerStatsResult {
  totalPlays: bigint
  totalWagered: bigint
  totalWon: bigint
  profitLoss: bigint
  winRate: number
  isLoading: boolean
  error: Error | null
}

/**
 * Per-player instant lottery stats. Uses backend when NEXT_PUBLIC_API_URL is set (indexed plays with win_rate/profit_loss); else chain (totalPlays, totalWagered, totalWon only).
 */
export function useLotteryPlayerStats(playerAddress: `0x${string}` | undefined): LotteryPlayerStatsResult {
  const apiUrl = getApiUrlOptional()
  const fromChain = usePlayerInstantLotteryStats(playerAddress)
  const fromApi = useQuery<{ total_games: number; total_bet: string; total_win: string; profit_loss: string; win_rate: number }>({
    queryKey: ['lotteryPlayerStats', playerAddress],
    queryFn: async () => {
      if (!apiUrl || !playerAddress) throw new Error('Missing API URL or address')
      const res = await fetch(`${apiUrl}/api/lottery/player/${playerAddress}/stats`)
      if (!res.ok) throw new Error(`Lottery player stats: ${res.status}`)
      return res.json()
    },
    enabled: !!apiUrl && !!playerAddress,
    retry: 1,
  })
  if (apiUrl && playerAddress) {
    const d = fromApi.data
    return {
      totalPlays: d ? BigInt(d.total_games) : 0n,
      totalWagered: d ? BigInt(d.total_bet ?? 0) : 0n,
      totalWon: d ? BigInt(d.total_win ?? 0) : 0n,
      profitLoss: d ? BigInt(d.profit_loss ?? 0) : 0n,
      winRate: d?.win_rate ?? 0,
      isLoading: fromApi.isLoading,
      error: fromApi.error as Error | null,
    }
  }
  return {
    totalPlays: fromChain.totalPlays,
    totalWagered: fromChain.totalWagered,
    totalWon: fromChain.totalWon,
    profitLoss: fromChain.totalWon - fromChain.totalWagered,
    winRate: 0,
    isLoading: fromChain.isLoading,
    error: null,
  }
}
