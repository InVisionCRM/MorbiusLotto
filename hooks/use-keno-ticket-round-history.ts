import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { KENO_ABI } from '@/lib/keno-abi'
import { KENO_ADDRESS } from '@/lib/contracts'

interface RoundHistoryEntry {
  roundId: number
  winningNumbers: number[]
  matchedNumbers: number[]
  matchCount: number
  roundWin?: number
  roundPL?: number
}

interface KenoTicket {
  numbers: number[]
  spotSize: number
  wagerPerDraw: string
  firstRoundId: bigint
  roundTo: number
  addons: number
}

// Keno payout tables
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 2: 11 },
  3: { 2: 2, 3: 27 },
  4: { 2: 1, 3: 5, 4: 72 },
  5: { 3: 2, 4: 18, 5: 410 },
  6: { 3: 1, 4: 7, 5: 57, 6: 1100 },
  7: { 3: 1, 4: 5, 5: 11, 6: 100, 7: 2000 },
  8: { 4: 2, 5: 15, 6: 50, 7: 300, 8: 10000 },
  9: { 4: 2, 5: 5, 6: 20, 7: 100, 8: 2000, 9: 25000 },
  10: { 0: 5, 5: 2, 6: 10, 7: 50, 8: 500, 9: 5000, 10: 100000 },
}

const BULLSEYE_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 6 },
  2: { 2: 33 },
  3: { 2: 6, 3: 81 },
  4: { 2: 3, 3: 15, 4: 216 },
  5: { 3: 6, 4: 54, 5: 1230 },
  6: { 3: 3, 4: 21, 5: 171, 6: 3300 },
  7: { 3: 3, 4: 15, 5: 33, 6: 300, 7: 6000 },
  8: { 4: 6, 5: 45, 6: 150, 7: 900, 8: 30000 },
  9: { 4: 6, 5: 15, 6: 60, 7: 300, 8: 6000, 9: 75000 },
  10: { 0: 15, 5: 6, 6: 30, 7: 150, 8: 1500, 9: 15000, 10: 300000 },
}

const ADDON_MULTIPLIER_FLAG = 1 << 0
const ADDON_BULLSEYE_FLAG = 1 << 1

function calculateRoundWin(
  ticketNumbers: number[],
  winningNumbers: number[],
  spotSize: number,
  addons: number,
  wagerPerDraw: string,
  bullsEyeNumber: number,
  drawnMultiplier: number
): { win: number; pl: number } {
  const wager = Number(wagerPerDraw)

  // Count regular matches
  const matchedNumbers = ticketNumbers.filter(num => winningNumbers.includes(num))
  const hits = matchedNumbers.length

  // Get payout multipliers
  const baseMult = PAYTABLE[spotSize]?.[hits] ?? 0
  const bullsMult = (addons & ADDON_BULLSEYE_FLAG) !== 0 && bullsEyeNumber > 0 && ticketNumbers.includes(bullsEyeNumber)
    ? BULLSEYE_PAYTABLE[spotSize]?.[hits] ?? 0
    : 0
  const roundMult = (addons & ADDON_MULTIPLIER_FLAG) !== 0 && drawnMultiplier > 0 ? drawnMultiplier : 1

  const total = (baseMult + bullsMult) * wager * roundMult
  const pl = total - wager

  return { win: total, pl }
}

export function useKenoTicketRoundHistory(ticket: KenoTicket | null) {
  // Generate array of round IDs this ticket participated in
  const roundIds = useMemo(() => {
    if (!ticket) return []
    const rounds: bigint[] = []
    for (let round = Number(ticket.firstRoundId); round <= ticket.roundTo; round++) {
      rounds.push(BigInt(round))
    }
    return rounds
  }, [ticket])

  // Fetch round data for all rounds this ticket participated in
  const { data: roundsData, isLoading, error } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getRounds',
    args: roundIds.length > 0 ? [roundIds] : undefined,
    query: {
      enabled: roundIds.length > 0,
    },
  })

  // Process the round data and calculate wins/losses for this ticket
  const roundHistory: RoundHistoryEntry[] = useMemo(() => {
    if (!ticket || !roundsData || !Array.isArray(roundsData)) return []

    const validRounds: RoundHistoryEntry[] = []

    roundsData.forEach((round: any) => {
      const roundId = Number(round.id)
      const winningNumbers = Array.from(round.winningNumbers || []).filter((n: unknown) => typeof n === 'number' && n > 0) as number[]
      const bullsEyeNumber = Number(round.bullsEyeNumber || 0)
      const drawnMultiplier = Number(round.drawnMultiplier || 1)

      // Only process if round is finalized (has winning numbers)
      if (winningNumbers.length === 0) return

      // Calculate win/loss for this round
      const { win, pl } = calculateRoundWin(
        ticket.numbers,
        winningNumbers,
        ticket.spotSize,
        ticket.addons,
        ticket.wagerPerDraw,
        bullsEyeNumber,
        drawnMultiplier
      )

      // Get matched numbers
      const matchedNumbers = ticket.numbers.filter(num => winningNumbers.includes(num))
      const matchCount = matchedNumbers.length

      validRounds.push({
        roundId,
        winningNumbers,
        matchedNumbers,
        matchCount,
        roundWin: win,
        roundPL: pl,
      })
    })

    return validRounds.sort((a, b) => b.roundId - a.roundId) // Most recent first
  }, [ticket, roundsData])

  return {
    roundHistory,
    isLoading,
    error,
  }
}


