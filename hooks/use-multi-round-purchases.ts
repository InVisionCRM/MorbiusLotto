import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'

export type MultiRoundPurchase = {
  transactionHash: string
  roundIds: number[]
  ticketCounts: number[]
  startRound: number
  endRound: number
}

/**
 * Fetches historical TicketsPurchasedForRounds events for a player
 * to determine which tickets are part of multi-round purchases
 */
export function useMultiRoundPurchases(playerAddress?: `0x${string}`) {
  const publicClient = usePublicClient()
  const [purchases, setPurchases] = useState<MultiRoundPurchase[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!publicClient || !playerAddress) {
      setPurchases([])
      return
    }

    let mounted = true
    const fetchPurchases = async () => {
      setIsLoading(true)
      try {
        // Fetch TicketsPurchasedForRounds events for this player
        const logs = await publicClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event: {
            type: 'event',
            name: 'TicketsPurchasedForRounds',
            inputs: [
              { type: 'address', name: 'player', indexed: true },
              { type: 'uint256[]', name: 'roundIds', indexed: false },
              { type: 'uint256[]', name: 'ticketCounts', indexed: false },
              { type: 'uint256', name: 'morbiusSpent', indexed: false },
            ],
          },
          args: {
            player: playerAddress,
          },
          fromBlock: 'earliest',
          toBlock: 'latest',
        } as any)

        if (!mounted) return

        const multiRoundPurchases: MultiRoundPurchase[] = logs
          .map((log) => {
            const args = log.args as any
            if (!args?.roundIds || !args?.ticketCounts) return null

            const roundIds = (args.roundIds as bigint[]).map((id) => Number(id))
            const ticketCounts = (args.ticketCounts as bigint[]).map((count) => Number(count))

            return {
              transactionHash: log.transactionHash,
              roundIds,
              ticketCounts,
              startRound: Math.min(...roundIds),
              endRound: Math.max(...roundIds),
            }
          })
          .filter(Boolean)
          .filter(Boolean)
          .filter((p): p is MultiRoundPurchase => p !== null)

        setPurchases(multiRoundPurchases)
      } catch (error) {
        console.error('Error fetching multi-round purchases:', error)
        if (mounted) {
          setPurchases([])
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchPurchases()

    return () => {
      mounted = false
    }
  }, [publicClient, playerAddress])

  return { purchases, isLoading }
}

/**
 * Gets the round range for a specific transaction hash
 */
export function getRoundRangeForTx(
  txHash: string | undefined,
  purchases: MultiRoundPurchase[]
): { startRound: number; endRound: number } | null {
  if (!txHash) return null

  const purchase = purchases.find((p) => p.transactionHash.toLowerCase() === txHash.toLowerCase())
  if (!purchase) return null

  return {
    startRound: purchase.startRound,
    endRound: purchase.endRound,
  }
}
