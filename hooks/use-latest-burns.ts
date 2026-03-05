'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { formatEther, parseAbiItem } from 'viem'
import {
  KENO_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  KENO_DEPLOY_BLOCK,
  LOTTERY_DEPLOY_BLOCK,
} from '@/lib/contracts'

export interface BurnEntry {
  id: string
  amount: bigint
  timestamp: number
  txHash: string
  source: 'Keno' | 'Lottery'
}

const BURN_EXECUTED_EVENT = parseAbiItem('event BurnExecuted(uint256 amount)')

const MAX_BURNS = 50 // Maximum burns to keep in memory
const POLL_INTERVAL = 15000 // Poll every 15 seconds for new events
const LOOKBACK_BLOCKS = 1000n // How many blocks to look back on initial load

export function useLatestBurns() {
  const publicClient = usePublicClient()
  const [burns, setBurns] = useState<BurnEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastBlock, setLastBlock] = useState<bigint>(0n)

  // Add a new burn to the list
  const addBurn = useCallback((burn: BurnEntry) => {
    setBurns((prev) => {
      // Check for duplicates by id
      if (prev.some((b) => b.id === burn.id)) return prev
      // Add new burn at the beginning and limit total
      const newBurns = [burn, ...prev].slice(0, MAX_BURNS)
      // Sort by timestamp descending
      return newBurns.sort((a, b) => b.timestamp - a.timestamp)
    })
  }, [])

  // Fetch recent burns from all games
  const fetchRecentBurns = useCallback(async () => {
    if (!publicClient) return

    try {
      const currentBlock = await publicClient.getBlockNumber()
      const fromBlock = lastBlock > 0n ? lastBlock + 1n : currentBlock - LOOKBACK_BLOCKS

      // Fetch BurnExecuted events from Keno and Lottery contracts
      const [kenoLogs, lotteryLogs] = await Promise.all([
        // Keno BurnExecuted events
        (KENO_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: KENO_ADDRESS,
              event: BURN_EXECUTED_EVENT,
              fromBlock: fromBlock > BigInt(KENO_DEPLOY_BLOCK) ? fromBlock : BigInt(KENO_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),

        // Lottery BurnExecuted events
        (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: LOTTERY_INSTANT_ADDRESS,
              event: BURN_EXECUTED_EVENT,
              fromBlock: fromBlock > BigInt(LOTTERY_DEPLOY_BLOCK) ? fromBlock : BigInt(LOTTERY_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),
      ])

      // Process Keno burns
      for (const log of kenoLogs) {
        const amount = log.args?.amount as bigint
        if (amount && amount > 0n) {
          addBurn({
            id: `keno-${log.transactionHash}-${log.logIndex}`,
            amount,
            source: 'Keno',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000, // Estimate timestamp
            txHash: log.transactionHash || '',
          })
        }
      }

      // Process Lottery burns
      for (const log of lotteryLogs) {
        const amount = log.args?.amount as bigint
        if (amount && amount > 0n) {
          addBurn({
            id: `lottery-${log.transactionHash}-${log.logIndex}`,
            amount,
            source: 'Lottery',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000,
            txHash: log.transactionHash || '',
          })
        }
      }

      setLastBlock(currentBlock)
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching recent burns:', error)
      setIsLoading(false)
    }
  }, [publicClient, lastBlock, addBurn])

  // Initial fetch and polling
  useEffect(() => {
    fetchRecentBurns()

    const interval = setInterval(fetchRecentBurns, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRecentBurns])

  return {
    burns,
    isLoading,
    refetch: fetchRecentBurns,
  }
}
