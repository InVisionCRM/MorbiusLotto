'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import { KENO_ADDRESS } from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { pulsechain } from '@/lib/chains'

export type KenoResultRow = {
  player: `0x${string}`
  ticketId: bigint
  spotSize: number
  wager: bigint
  hits: number
  grossPayout: bigint
  netPayout: bigint
  paidWithPLS: boolean
  blockNumber?: bigint
  transactionHash?: `0x${string}`
  timestamp?: number
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    try {
      return BigInt(value)
    } catch {
      return 0n
    }
  }
  return 0n
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'bigint' || typeof value === 'string' || typeof value === 'boolean') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toAddress(value: unknown): `0x${string}` {
  return typeof value === 'string' && value.startsWith('0x') ? (value as `0x${string}`) : '0x0'
}

function parseKenoPlayedLog(
  args: Record<string, unknown>,
  blockNumber?: bigint,
  transactionHash?: `0x${string}`
): KenoResultRow {
  return {
    player: toAddress(args.player),
    ticketId: toBigInt(args.ticketId),
    spotSize: toNumber(args.spotSize),
    wager: toBigInt(args.wager),
    hits: toNumber(args.hits),
    grossPayout: toBigInt(args.grossPayout),
    netPayout: toBigInt(args.netPayout),
    paidWithPLS: Boolean(args.paidWithPLS),
    blockNumber,
    transactionHash,
  }
}

export function useKenoResults(options: {
  playerAddress?: `0x${string}` | null
  limit?: number
} = {}) {
  const { playerAddress, limit = 50 } = options
  const [results, setResults] = useState<KenoResultRow[]>([])
  const publicClient = usePublicClient({ chainId: pulsechain.id })

  const append = useCallback(
    (row: KenoResultRow) => {
      setResults((prev) => [row, ...prev].slice(0, limit))
    },
    [limit]
  )

  useWatchContractEvent({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    eventName: 'KenoPlayed',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log.args || {}) as Record<string, unknown>
        if (playerAddress && (args.player as string)?.toLowerCase() !== playerAddress.toLowerCase()) continue
        const row = parseKenoPlayedLog(args, log.blockNumber, log.transactionHash)
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
        const blockWindow = playerAddress ? 50000n : 50000n
        const fromBlock = toBlock - blockWindow > 0n ? toBlock - blockWindow : 0n
        const logs = await publicClient.getContractEvents({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          eventName: 'KenoPlayed',
          fromBlock,
          toBlock,
        })
        let rows: KenoResultRow[] = logs.map((l) =>
          parseKenoPlayedLog((l.args || {}) as Record<string, unknown>, l.blockNumber, l.transactionHash)
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

export type KenoTopPlayerEntry = {
  rank: number
  wallet_address: string
  total_games: number
  total_bet: bigint
  total_win: bigint
  profit_loss: bigint
  win_rate: number
}

function useKenoTopPlayersFromChain(limit: number): KenoTopPlayerEntry[] {
  const { results } = useKenoResults({ playerAddress: undefined, limit: 1000 })
  return useMemo(() => {
    const byPlayer = new Map<string, { plays: number; wagered: bigint; won: bigint; winningPlays: number }>()
    for (const r of results) {
      const addr = (r.player ?? '').toLowerCase()
      if (!addr) continue
      const cur = byPlayer.get(addr) ?? { plays: 0, wagered: 0n, won: 0n, winningPlays: 0 }
      cur.plays += 1
      cur.wagered += r.wager
      cur.won += r.netPayout
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

export function useKenoTopPlayers(limit: number = 25) {
  const fromChain = useKenoTopPlayersFromChain(limit)
  return { data: fromChain, isLoading: false, error: null }
}

export function useKenoPlayerStats(playerAddress: `0x${string}` | undefined) {
  const { results } = useKenoResults({ playerAddress, limit: 500 })
  return useMemo(() => {
    let totalPlays = 0
    let totalWagered = 0n
    let totalWon = 0n
    let winningPlays = 0
    for (const r of results) {
      totalPlays += 1
      totalWagered += r.wager
      totalWon += r.netPayout
      if (r.netPayout > 0n) winningPlays += 1
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
