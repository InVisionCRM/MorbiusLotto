'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { MORBIUS_LP_STAKING_ADDRESS, MORBIUS_LP_STAKING_DEPLOY_BLOCK } from '@/lib/contracts'

export type LPStakingAction = 'Stake' | 'Unstake' | 'Claim'

export interface LPStakingHistoryEntry {
  id: string
  action: LPStakingAction
  amount: bigint
  burned: bigint
  blockNumber: bigint
  txHash: string
  timestamp: number
}

const STAKED_EVENT = parseAbiItem('event Staked(address indexed user, uint256 amount)')
const UNSTAKED_EVENT = parseAbiItem('event Unstaked(address indexed user, uint256 amount, uint256 burned)')
const CLAIMED_EVENT = parseAbiItem('event Claimed(address indexed user, uint256 amount)')

const CONTRACT_ADDRESS = MORBIUS_LP_STAKING_ADDRESS as `0x${string}`
const MAX_ENTRIES = 100
const POLL_INTERVAL = 15000
const LOOKBACK_BLOCKS = 2000n

export function useLPStakingHistory(userAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  const [history, setHistory] = useState<LPStakingHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastBlock, setLastBlock] = useState<bigint>(0n)

  const addEntry = useCallback((entry: LPStakingHistoryEntry) => {
    setHistory((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev
      return [entry, ...prev]
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, MAX_ENTRIES)
    })
  }, [])

  const fetchHistory = useCallback(async () => {
    if (!publicClient || !userAddress) {
      setIsLoading(false)
      return
    }

    try {
      const currentBlock = await publicClient.getBlockNumber()
      const deployBlock = BigInt(MORBIUS_LP_STAKING_DEPLOY_BLOCK)
      const fromBlock = lastBlock > 0n
        ? lastBlock + 1n
        : (currentBlock - LOOKBACK_BLOCKS > deployBlock ? currentBlock - LOOKBACK_BLOCKS : deployBlock)

      const [stakeLogs, unstakeLogs, claimLogs] = await Promise.all([
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: STAKED_EVENT,
          args: { user: userAddress },
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: UNSTAKED_EVENT,
          args: { user: userAddress },
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: CLAIMED_EVENT,
          args: { user: userAddress },
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
      ])

      const allLogs: { log: any; action: LPStakingAction }[] = [
        ...stakeLogs.map((log) => ({ log, action: 'Stake' as LPStakingAction })),
        ...unstakeLogs.map((log) => ({ log, action: 'Unstake' as LPStakingAction })),
        ...claimLogs.map((log) => ({ log, action: 'Claim' as LPStakingAction })),
      ]

      const uniqueBlocks = [...new Set(allLogs.map((l) => l.log.blockNumber).filter(Boolean))]
      const blockTimestamps = new Map<bigint, number>()
      await Promise.all(
        uniqueBlocks.map(async (blockNum) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: blockNum })
            blockTimestamps.set(blockNum, Number(block.timestamp) * 1000)
          } catch {
            blockTimestamps.set(blockNum, Date.now() - Number(currentBlock - blockNum) * 2000)
          }
        }),
      )

      for (const { log, action } of allLogs) {
        const args = log.args as any
        const amount = args?.amount as bigint
        if (!amount || amount <= 0n) continue
        const blockNum = log.blockNumber ?? 0n
        addEntry({
          id: `lp-${action.toLowerCase()}-${log.transactionHash}-${log.logIndex}`,
          action,
          amount,
          burned: action === 'Unstake' ? (args?.burned ?? 0n) : 0n,
          blockNumber: blockNum,
          txHash: log.transactionHash ?? '',
          timestamp: blockTimestamps.get(blockNum) ?? Date.now(),
        })
      }

      setLastBlock(currentBlock)
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching LP staking history:', error)
      setIsLoading(false)
    }
  }, [publicClient, userAddress, lastBlock, addEntry])

  useEffect(() => {
    if (!userAddress) {
      setHistory([])
      setIsLoading(false)
      return
    }
    setLastBlock(0n)
    setHistory([])
    setIsLoading(true)
  }, [userAddress])

  useEffect(() => {
    fetchHistory()
    const interval = setInterval(fetchHistory, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchHistory])

  return { history, isLoading, refetch: fetchHistory }
}
