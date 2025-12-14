import { useEffect, useState, useMemo } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { parseAbiItem } from 'viem'
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'

export type LotteryTicketWithRound = {
  ticketId: bigint
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
  roundId: number
  transactionHash: string
  purchaseTimestamp: number
  isActive: boolean // Whether the round is still active/not finalized
}

/**
 * Fetches all lottery tickets ever purchased by a player across all rounds
 */
export function useAllPlayerTickets() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [tickets, setTickets] = useState<LotteryTicketWithRound[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [roundsParticipated, setRoundsParticipated] = useState<number[]>([])

  // Fetch all rounds the player participated in
  useEffect(() => {
    if (!publicClient || !address) {
      setRoundsParticipated([])
      return
    }

    let mounted = true
    const fetchRounds = async () => {
      setIsLoading(true)
      try {
        const fromBlock = LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : BigInt(0)

        // Fetch TicketsPurchased events for single-round purchases
        const singleRoundEvent = parseAbiItem(
          'event TicketsPurchased(address indexed player, uint256 indexed roundId, uint256 ticketCount, uint256 freeTicketsUsed, uint256 morbiusSpent)'
        )
        const singleRoundLogs = await publicClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event: singleRoundEvent,
          args: { player: address },
          fromBlock,
          toBlock: 'latest',
        })

        // Fetch TicketsPurchasedForRounds events for multi-round purchases
        const multiRoundEvent = parseAbiItem(
          'event TicketsPurchasedForRounds(address indexed player, uint256[] roundIds, uint256[] ticketCounts, uint256 morbiusSpent)'
        )
        const multiRoundLogs = await publicClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event: multiRoundEvent,
          args: { player: address },
          fromBlock,
          toBlock: 'latest',
        })

        if (!mounted) return

        // Extract unique round IDs from both event types
        const roundSet = new Set<number>()

        // Add rounds from single-round purchases
        singleRoundLogs.forEach(log => {
          if (log.args.roundId !== undefined) {
            roundSet.add(Number(log.args.roundId))
          }
        })

        // Add rounds from multi-round purchases
        multiRoundLogs.forEach(log => {
          if (log.args.roundIds) {
            ;(log.args.roundIds as bigint[]).forEach(roundId => {
              roundSet.add(Number(roundId))
            })
          }
        })

        const rounds = Array.from(roundSet).sort((a, b) => b - a) // Most recent first
        setRoundsParticipated(rounds)
      } catch (error) {
        console.error('Error fetching player rounds:', error)
        if (mounted) {
          setRoundsParticipated([])
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchRounds()

    return () => {
      mounted = false
    }
  }, [publicClient, address])

  // Fetch tickets for each round
  useEffect(() => {
    if (!publicClient || !address || roundsParticipated.length === 0) {
      setTickets([])
      return
    }

    let mounted = true
    const fetchAllTickets = async () => {
      setIsLoading(true)
      try {
        const allTickets: LotteryTicketWithRound[] = []

        // Fetch current round info to determine which rounds are active
        const currentRoundData = await publicClient.readContract({
          address: LOTTERY_ADDRESS as `0x${string}`,
          abi: LOTTERY_6OF55_V2_ABI,
          functionName: 'getCurrentRoundInfo',
        }) as any

        const currentRoundId = Number(currentRoundData[0])

        // Fetch tickets for each round
        for (const roundId of roundsParticipated) {
          try {
            // Get tickets for this round
            const roundTickets = await publicClient.readContract({
              address: LOTTERY_ADDRESS as `0x${string}`,
              abi: LOTTERY_6OF55_V2_ABI,
              functionName: 'getPlayerTickets',
              args: [BigInt(roundId), address],
            }) as any[]

            if (!roundTickets || roundTickets.length === 0) continue

            // Fetch round state to check if active
            const roundData = await publicClient.readContract({
              address: LOTTERY_ADDRESS as `0x${string}`,
              abi: LOTTERY_6OF55_V2_ABI,
              functionName: 'getRound',
              args: [BigInt(roundId)],
            }) as any

            const roundState = Number(roundData.state) // 0=OPEN, 1=FINALIZED
            const isActive = roundId === currentRoundId && roundState === 0

            // Fetch purchase events for this round to get timestamps
            const fromBlock = LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : BigInt(0)
            const singleRoundEvent = parseAbiItem(
              'event TicketsPurchased(address indexed player, uint256 indexed roundId, uint256 ticketCount, uint256 freeTicketsUsed, uint256 morbiusSpent)'
            )
            const purchaseLogs = await publicClient.getLogs({
              address: LOTTERY_ADDRESS as `0x${string}`,
              event: singleRoundEvent,
              args: { player: address, roundId: BigInt(roundId) },
              fromBlock,
              toBlock: 'latest',
            })

            // Get timestamp from first purchase event
            let purchaseTimestamp = Date.now()
            if (purchaseLogs.length > 0) {
              try {
                const block = await publicClient.getBlock({ blockNumber: purchaseLogs[0].blockNumber })
                purchaseTimestamp = Number(block.timestamp) * 1000
              } catch (err) {
                console.error('Failed to fetch block timestamp', err)
              }
            }

            const transactionHash = purchaseLogs[0]?.transactionHash || ''

            // Add all tickets for this round
            roundTickets.forEach((ticket: any) => {
              allTickets.push({
                ticketId: ticket.ticketId,
                numbers: ticket.numbers,
                isFreeTicket: ticket.isFreeTicket,
                roundId,
                transactionHash,
                purchaseTimestamp,
                isActive,
              })
            })
          } catch (err) {
            console.error(`Error fetching tickets for round ${roundId}:`, err)
          }
        }

        if (!mounted) return

        // Sort by round ID descending (most recent first)
        allTickets.sort((a, b) => b.roundId - a.roundId)
        setTickets(allTickets)
      } catch (error) {
        console.error('Error fetching all tickets:', error)
        if (mounted) {
          setTickets([])
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchAllTickets()

    return () => {
      mounted = false
    }
  }, [publicClient, address, roundsParticipated])

  return {
    tickets,
    isLoading,
    roundsParticipated,
  }
}
