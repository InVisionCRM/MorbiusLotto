import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { LOTTERY_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import { formatUnits } from 'viem'

interface RoundHistoryEntry {
  roundId: number
  matches: number
  payout: bigint
  winningNumbers: number[]
}

interface LotteryTicket {
  numbers: readonly (number | bigint)[]
  startRound: number
  endRound: number
}

// Lottery payout brackets
const PAYOUT_TABLE = [
  { matches: 6, percentage: 25 },
  { matches: 5, percentage: 10 },
  { matches: 4, percentage: 8 },
  { matches: 3, percentage: 6 },
  { matches: 2, percentage: 4 },
  { matches: 1, percentage: 2 },
]

export function useLotteryTicketRoundHistory(ticket: LotteryTicket | null) {
  // Generate array of round IDs this ticket participated in
  const roundIds = useMemo(() => {
    if (!ticket) return []
    const rounds: number[] = []
    for (let round = ticket.startRound; round <= ticket.endRound; round++) {
      rounds.push(round)
    }
    return rounds
  }, [ticket])

  // Fetch round data for all rounds this ticket participated in
  const roundQueries = useMemo(() => {
    if (roundIds.length === 0) return []
    return roundIds.map(roundId => ({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'getRound',
      args: [BigInt(roundId)],
    }))
  }, [roundIds])

  const { data: roundDataArray, isLoading, error } = useReadContracts({
    contracts: roundQueries,
    query: {
      enabled: roundQueries.length > 0,
    },
  })

  // Process the round data and calculate matches/payouts for this ticket
  const roundHistory: RoundHistoryEntry[] = useMemo(() => {
    if (!ticket || !roundDataArray || !Array.isArray(roundDataArray)) return []

    return roundDataArray
      .map((roundData, index) => {
        const roundId = roundIds[index]
        if (!roundData?.result) return null

        const result = roundData.result as any
        const winningNumbers = Array.from(result.winningNumbers || []).filter((n: unknown) => typeof n === 'number' && n > 0) as number[]

        // Only process if round is finalized (has winning numbers)
        if (winningNumbers.length === 0) return null

        // Count matches between ticket numbers and winning numbers
        const ticketNumbers = Array.from(ticket.numbers).map(n => Number(n))
        const matches = ticketNumbers.filter(num => winningNumbers.includes(num)).length

        // Calculate payout based on matches
        const payoutBracket = PAYOUT_TABLE.find(bracket => bracket.matches === matches)
        const payout = payoutBracket ? BigInt(payoutBracket.percentage) : BigInt(0)

        return {
          roundId,
          matches,
          payout,
          winningNumbers,
        }
      })
      .filter((entry): entry is RoundHistoryEntry => entry !== null)
      .sort((a, b) => b.roundId - a.roundId) // Most recent first
  }, [ticket, roundDataArray, roundIds])

  return {
    roundHistory,
    isLoading,
    error,
  }
}


