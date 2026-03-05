'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { PLINKO_ADDRESS } from '@/lib/contracts'
import { PLINKO_ABI } from '@/abi/plinko'
import { pulsechain } from '@/lib/chains'

/** Risk level from contract: 0 = LOW (GREEN), 1 = MEDIUM (YELLOW), 2 = HIGH (RED) */
export const RISK_LEVEL_NAMES: Record<number, string> = {
  0: 'GREEN',
  1: 'YELLOW',
  2: 'RED',
}

export type PlinkoResultRow = {
  player: `0x${string}`
  seed: bigint
  bucket: number
  multiplier: bigint
  payout: bigint
  /** Derived: payout * 100 / multiplier (contract uses payout = wager * multiplier / 100) */
  wager: bigint
  /** payout - wager */
  profit: bigint
  riskLevel: number
  riskLevelName: string
  blockNumber?: bigint
  transactionHash?: `0x${string}`
  timestamp?: number
}

function parseBallDroppedLog(
  args: Record<string, unknown>,
  blockNumber?: bigint,
  transactionHash?: `0x${string}`
): PlinkoResultRow {
  const multiplier = BigInt(args.multiplier ?? 0)
  const payout = BigInt(args.payout ?? 0)
  const wager = multiplier > 0n ? (payout * 100n) / multiplier : 0n
  const riskLevel = Number(args.riskLevel ?? 0)
  return {
    player: (args.player as `0x${string}`) ?? '0x0',
    seed: BigInt(args.seed ?? 0),
    bucket: Number(args.bucket ?? 0),
    multiplier,
    payout,
    wager,
    profit: payout - wager,
    riskLevel,
    riskLevelName: RISK_LEVEL_NAMES[riskLevel] ?? 'GREEN',
    blockNumber,
    transactionHash,
  }
}

export function usePlinkoResults(options: {
  playerAddress?: `0x${string}` | null
  limit?: number
} = {}) {
  const { playerAddress, limit = 50 } = options
  const [results, setResults] = useState<PlinkoResultRow[]>([])
  const publicClient = usePublicClient({ chainId: pulsechain.id })

  const append = useCallback(
    (row: PlinkoResultRow) => {
      setResults((prev) => [row, ...prev].slice(0, limit))
    },
    [limit]
  )

  useWatchContractEvent({
    address: PLINKO_ADDRESS,
    abi: PLINKO_ABI,
    eventName: 'BallDropped',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log.args || {}) as Record<string, unknown>
        if (playerAddress && (args.player as string)?.toLowerCase() !== playerAddress.toLowerCase()) continue
        const row = parseBallDroppedLog(args, log.blockNumber, log.transactionHash)
        append(row)
      }
    },
  })

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false
    const fetchRecent = async () => {
      try {
        const toBlock = await publicClient.getBlockNumber()
        const blockWindow = playerAddress ? 50000n : 5000n
        const fromBlock = toBlock - blockWindow > 0n ? toBlock - blockWindow : 0n
        const logs = await publicClient.getContractEvents({
          address: PLINKO_ADDRESS,
          abi: PLINKO_ABI,
          eventName: 'BallDropped',
          fromBlock,
          toBlock,
        })
        let rows: PlinkoResultRow[] = logs.map((l) =>
          parseBallDroppedLog((l.args || {}) as Record<string, unknown>, l.blockNumber, l.transactionHash)
        )
        const blockNumbers = [...new Set(rows.map((r) => r.blockNumber).filter((b): b is bigint => b != null))]
        if (blockNumbers.length > 0) {
          const blocks = await Promise.all(blockNumbers.map((b) => publicClient.getBlock({ blockNumber: b })))
          const blockToTime = Object.fromEntries(blocks.map((b) => [String(b.number), Number(b.timestamp)]))
          rows = rows.map((r) => ({
            ...r,
            timestamp: r.blockNumber != null ? blockToTime[String(r.blockNumber)] : undefined,
          }))
        }
        if (playerAddress) {
          const addr = playerAddress.toLowerCase()
          const filtered = rows.filter((r) => r.player?.toLowerCase() === addr)
          if (!cancelled) setResults(filtered.slice(-limit).reverse())
        } else {
          if (!cancelled) setResults(rows.slice(-limit).reverse())
        }
      } catch {
        if (!cancelled) setResults([])
      }
    }
    fetchRecent()
    return () => {
      cancelled = true
    }
  }, [publicClient, playerAddress, limit])

  return { results, append }
}

export type PlinkoTopPlayerEntry = {
  rank: number
  wallet_address: string
  total_games: number
  total_bet: bigint
  total_win: bigint
  profit_loss: bigint
  win_rate: number
}

function usePlinkoTopPlayersFromChain(limit: number): PlinkoTopPlayerEntry[] {
  const { results } = usePlinkoResults({ playerAddress: undefined, limit: 1000 })
  return useMemo(() => {
    const byPlayer = new Map<string, { plays: number; wagered: bigint; won: bigint; winningPlays: number }>()
    for (const r of results) {
      const addr = (r.player ?? '').toLowerCase()
      if (!addr) continue
      const cur = byPlayer.get(addr) ?? { plays: 0, wagered: 0n, won: 0n, winningPlays: 0 }
      cur.plays += 1
      cur.wagered += r.wager
      cur.won += r.payout
      if (r.profit > 0n) cur.winningPlays += 1
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

export function usePlinkoTopPlayers(limit: number = 25) {
  const fromChain = usePlinkoTopPlayersFromChain(limit)
  return { data: fromChain, isLoading: false, error: null }
}

export function usePlinkoPlayerStats(playerAddress: `0x${string}` | undefined) {
  const { results } = usePlinkoResults({ playerAddress, limit: 500 })
  return useMemo(() => {
    let totalPlays = 0
    let totalWagered = 0n
    let totalWon = 0n
    let winningPlays = 0
    for (const r of results) {
      totalPlays += 1
      totalWagered += r.wager
      totalWon += r.payout
      if (r.profit > 0n) winningPlays += 1
    }
    return {
      totalPlays: BigInt(totalPlays),
      totalWagered,
      totalWon,
      profitLoss: totalWon - totalWagered,
      winRate: totalPlays ? (winningPlays / totalPlays) * 100 : 0,
      results,
    }
  }, [results])
}
