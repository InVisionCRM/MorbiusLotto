'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { formatEther, parseAbiItem } from 'viem'
import {
  PLINKO_ADDRESS,
  BIGWHEEL_ADDRESS,
  BLACKJACK_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_ADDRESS,
  PLINKO_DEPLOY_BLOCK,
  BIGWHEEL_DEPLOY_BLOCK,
  BLACKJACK_DEPLOY_BLOCK,
  KENO_DEPLOY_BLOCK,
  LOTTERY_DEPLOY_BLOCK,
} from '@/lib/contracts'

export type GameType = 'Plinko' | 'Blackjack' | 'Big Wheel' | 'Lottery' | 'Keno'

export interface WinEntry {
  id: string
  address: string
  amount: bigint
  game: GameType
  timestamp: number
  txHash: string
}


// Event signatures for each game
const PLINKO_BALL_DROPPED = parseAbiItem(
  'event BallDropped(address indexed player, uint256 seed, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
)

const BIGWHEEL_BET_PLACED = parseAbiItem(
  'event BetPlaced(address indexed player, uint8 betType, uint256 betAmount, uint8 winningSegment, uint256 payout, bool usedPLS)'
)

// BlackjackV2: amount is int256 (profit/loss); positive = win
const BLACKJACK_GAME_SETTLED = parseAbiItem(
  'event GameSettled(address indexed player, int256 amount, bytes32 indexed gameHash)'
)

const KENO_PRIZE_CLAIMED = parseAbiItem(
  'event PrizeClaimed(uint256 indexed roundId, address indexed player, uint256 ticketId, uint8 hits, uint256 prize, uint256 paidPrize)'
)

const LOTTERY_PRIZES_CLAIMED = parseAbiItem(
  'event PrizesClaimed(address indexed player, uint256 totalAmount)'
)

const MAX_WINS = 50 // Maximum wins to keep in memory
const POLL_INTERVAL = 10000 // Poll every 10 seconds for new events
const LOOKBACK_BLOCKS = 2000n // Look back ~5.5 hours at 10s/block (many RPCs limit eth_getLogs to 2k blocks)

export function useLatestWins() {
  const publicClient = usePublicClient()
  const [wins, setWins] = useState<WinEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastBlock, setLastBlock] = useState<bigint>(0n)

  // Add a new win to the list
  const addWin = useCallback((win: WinEntry) => {
    setWins((prev) => {
      // Check for duplicates by id
      if (prev.some((w) => w.id === win.id)) return prev
      // Add new win at the beginning and limit total
      const newWins = [win, ...prev].slice(0, MAX_WINS)
      // Sort by timestamp descending
      return newWins.sort((a, b) => b.timestamp - a.timestamp)
    })
  }, [])

  // Fetch recent wins: chain events (if client) + API (Blackjack from DB)
  const fetchRecentWins = useCallback(async () => {
    try {
      if (publicClient) {
        const currentBlock = await publicClient.getBlockNumber()
        const fromBlock = lastBlock > 0n ? lastBlock + 1n : currentBlock - LOOKBACK_BLOCKS

        // Fetch events from all games in parallel
      const [plinkoLogs, bigwheelLogs, blackjackLogs, kenoLogs, lotteryLogs] = await Promise.all([
        // Plinko BallDropped events
        (PLINKO_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: PLINKO_ADDRESS,
              event: PLINKO_BALL_DROPPED,
              fromBlock: fromBlock > BigInt(PLINKO_DEPLOY_BLOCK) ? fromBlock : BigInt(PLINKO_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),

        // BigWheel BetPlaced events
        (BIGWHEEL_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: BIGWHEEL_ADDRESS,
              event: BIGWHEEL_BET_PLACED,
              fromBlock: fromBlock > BigInt(BIGWHEEL_DEPLOY_BLOCK) ? fromBlock : BigInt(BIGWHEEL_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),

        // Blackjack GameSettled events
        (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: BLACKJACK_ADDRESS,
              event: BLACKJACK_GAME_SETTLED,
              fromBlock: fromBlock > BigInt(BLACKJACK_DEPLOY_BLOCK) ? fromBlock : BigInt(BLACKJACK_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),

        // Keno PrizeClaimed events
        (KENO_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: KENO_ADDRESS,
              event: KENO_PRIZE_CLAIMED,
              fromBlock: fromBlock > BigInt(KENO_DEPLOY_BLOCK) ? fromBlock : BigInt(KENO_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),

        // Lottery PrizesClaimed events
        (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
          ? publicClient.getLogs({
              address: LOTTERY_ADDRESS,
              event: LOTTERY_PRIZES_CLAIMED,
              fromBlock: fromBlock > BigInt(LOTTERY_DEPLOY_BLOCK) ? fromBlock : BigInt(LOTTERY_DEPLOY_BLOCK),
              toBlock: currentBlock,
            }).catch(() => [])
          : Promise.resolve([]),
      ])

      // Process Plinko wins (payout > 0)
      for (const log of plinkoLogs) {
        const payout = log.args?.payout as bigint
        if (payout && payout > 0n) {
          addWin({
            id: `plinko-${log.transactionHash}-${log.logIndex}`,
            address: (log.args?.player as string) ?? '',
            amount: payout,
            game: 'Plinko',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000, // Estimate timestamp
            txHash: log.transactionHash || '',
          })
        }
      }

      // Process BigWheel wins (payout > 0)
      for (const log of bigwheelLogs) {
        const payout = log.args?.payout as bigint
        if (payout && payout > 0n) {
          addWin({
            id: `bigwheel-${log.transactionHash}-${log.logIndex}`,
            address: (log.args?.player as string) ?? '',
            amount: payout,
            game: 'Big Wheel',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000,
            txHash: log.transactionHash || '',
          })
        }
      }

      // Process BlackjackV2 wins (amount > 0 = profit)
      for (const log of blackjackLogs) {
        const amount = log.args?.amount as bigint | undefined
        if (amount != null && amount > 0n) {
          addWin({
            id: `blackjack-${log.transactionHash}-${log.logIndex}`,
            address: (log.args?.player as string) ?? '',
            amount,
            game: 'Blackjack',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000,
            txHash: log.transactionHash || '',
          })
        }
      }

      // Process Keno wins (prize > 0)
      for (const log of kenoLogs) {
        const prize = log.args?.paidPrize as bigint
        if (prize && prize > 0n) {
          addWin({
            id: `keno-${log.transactionHash}-${log.logIndex}`,
            address: (log.args?.player as string) ?? '',
            amount: prize,
            game: 'Keno',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000,
            txHash: log.transactionHash || '',
          })
        }
      }

      // Process Lottery wins (totalAmount > 0)
      for (const log of lotteryLogs) {
        const totalAmount = log.args?.totalAmount as bigint
        if (totalAmount && totalAmount > 0n) {
          addWin({
            id: `lottery-${log.transactionHash}-${log.logIndex}`,
            address: (log.args?.player as string) ?? '',
            amount: totalAmount,
            game: 'Lottery',
            timestamp: Date.now() - Number(currentBlock - (log.blockNumber || 0n)) * 2000,
            txHash: log.transactionHash || '',
          })
        }
      }

        setLastBlock(currentBlock)
      }

      // Always fetch API recent wins (Blackjack from DB) so feed works without wallet/chain
      try {
        const res = await fetch(`/api/analytics/recent-wins?limit=20`)
        if (res.ok) {
          const { wins: apiWins } = await res.json()
          for (const w of apiWins || []) {
            if (w.payout && BigInt(w.payout) > 0n) {
              addWin({
                id: `bj-${w.gameId}`,
                address: w.playerAddress ?? '',
                amount: BigInt(w.payout),
                game: 'Blackjack',
                timestamp: typeof w.timestamp === 'number' ? w.timestamp : Date.now(),
                txHash: '',
              })
            }
          }
        }
      } catch (e) {
        console.error('Error fetching API recent wins:', e)
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching recent wins:', error)
      setIsLoading(false)
    }
  }, [publicClient, lastBlock, addWin])

  // Initial fetch and polling
  useEffect(() => {
    fetchRecentWins()

    const interval = setInterval(fetchRecentWins, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRecentWins])

  return {
    wins,
    isLoading,
    refetch: fetchRecentWins,
  }
}
