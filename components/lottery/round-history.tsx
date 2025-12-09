'use client'

import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_ABI } from '@/abi/lottery6of55'
import { Skeleton } from '@/components/ui/skeleton'

interface RoundHistoryProps {
  currentRoundId: number
  maxRounds?: number
}

export function RoundHistory({ currentRoundId, maxRounds = 10 }: RoundHistoryProps) {
  const [roundIds, setRoundIds] = useState<number[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadedRounds, setLoadedRounds] = useState<Map<number, any>>(new Map())

  // Initialize round IDs (from current round backwards, excluding current if not finalized)
  useEffect(() => {
    if (currentRoundId > 0) {
      const rounds: number[] = []
      // Start from currentRoundId - 1 (most recent finalized) going backwards
      const startRound = Math.max(1, currentRoundId - maxRounds)
      for (let i = currentRoundId - 1; i >= startRound; i--) {
        if (i > 0) rounds.push(i)
      }
      setRoundIds(rounds)
      setCurrentIndex(0) // Start with most recent finalized round
    }
  }, [currentRoundId, maxRounds])

  const currentRoundIdToFetch = roundIds[currentIndex] || 0

  // Fetch current round data
  const { data: roundData, isLoading } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_ABI,
    functionName: 'getRound',
    args: currentRoundIdToFetch > 0 ? [BigInt(currentRoundIdToFetch)] : undefined,
    query: {
      enabled: currentRoundIdToFetch > 0 && (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Store loaded round data
  useEffect(() => {
    if (roundData && currentRoundIdToFetch > 0) {
      setLoadedRounds((prev) => {
        const newMap = new Map(prev)
        newMap.set(currentRoundIdToFetch, roundData)
        return newMap
      })
    }
  }, [roundData, currentRoundIdToFetch])

  // Pre-fetch adjacent rounds for smoother navigation
  const prevRoundId = roundIds[currentIndex - 1] || 0
  const nextRoundId = roundIds[currentIndex + 1] || 0

  const { data: prevRoundData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_ABI,
    functionName: 'getRound',
    args: prevRoundId > 0 ? [BigInt(prevRoundId)] : undefined,
    query: {
      enabled: prevRoundId > 0 && (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
    },
  })

  const { data: nextRoundData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_ABI,
    functionName: 'getRound',
    args: nextRoundId > 0 ? [BigInt(nextRoundId)] : undefined,
    query: {
      enabled: nextRoundId > 0 && (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Store pre-fetched round data
  useEffect(() => {
    if (prevRoundData && prevRoundId > 0) {
      setLoadedRounds((prev) => {
        const newMap = new Map(prev)
        newMap.set(prevRoundId, prevRoundData)
        return newMap
      })
    }
  }, [prevRoundData, prevRoundId])

  useEffect(() => {
    if (nextRoundData && nextRoundId > 0) {
      setLoadedRounds((prev) => {
        const newMap = new Map(prev)
        newMap.set(nextRoundId, nextRoundData)
        return newMap
      })
    }
  }, [nextRoundData, nextRoundId])

  const round = loadedRounds.get(currentRoundIdToFetch) || roundData
  const hasNext = currentIndex < roundIds.length - 1
  const hasPrev = currentIndex > 0

  const handleNext = () => {
    if (hasNext) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrev = () => {
    if (hasPrev) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  if (roundIds.length === 0) {
    return null
  }

  const roundId = currentRoundIdToFetch
  const totalPssh = round?.totalPsshCollected || BigInt(0)
  const winnersPool = (totalPssh * BigInt(5500)) / BigInt(10000) // 55%
  const stakeAllocation = (totalPssh * BigInt(2500)) / BigInt(10000) // 25%
  const megaAllocation = (totalPssh * BigInt(2000)) / BigInt(10000) // 20%
  const winningNumbers = round?.winningNumbers || []
  const brackets = round?.brackets || []
  const roundState = round?.state || 0
  const isFinalized = roundState === 2

  return (
    <Card className="p-6 bg-black/50 border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">
          Round History (#{roundId})
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={!hasPrev}
            className="border-white/10 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-white/60 min-w-[80px] text-center">
            {currentIndex + 1} / {roundIds.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={!hasNext}
            className="border-white/10 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && !round ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full bg-white/10" />
          <Skeleton className="h-24 w-full bg-white/10" />
        </div>
      ) : !isFinalized ? (
        <p className="text-sm text-white/60">Round not finalized yet.</p>
      ) : (
        <div className="space-y-6">
          {/* Winning Numbers */}
          {winningNumbers.length === 6 && winningNumbers.some((n: number) => n > 0) && (
            <div>
              <p className="text-sm text-white/60 mb-3">Winning Numbers</p>
              <div className="flex flex-wrap gap-3">
                {winningNumbers.map((num: number | bigint, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-pink-500 text-white font-bold text-xl shadow"
                  >
                    {Number(num)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Round Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-white/60 mb-2">Round Statistics</p>
              <div className="space-y-1 text-sm text-white/80">
                <p>Total Tickets: {Number(round?.totalTickets || BigInt(0)).toLocaleString()}</p>
                <p>Total PSSH: {formatPssh(totalPssh)} pSSH</p>
                <p>Players: {Number(round?.uniquePlayers || BigInt(0)).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-white/60 mb-2">Bracket Winners</p>
              <div className="space-y-1 text-sm text-white/80">
                {brackets.map((b: any, idx: number) => (
                  <p key={idx}>
                    Bracket {idx + 1} ({Number(b.matchCount || idx + 1)} matches): {Number(b.winnerCount || 0)}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Morbius Allocation */}
          <div>
            <p className="text-sm text-white/60 mb-3">Morbius Allocation</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-black/50 border border-white/10 rounded-lg">
                <p className="text-xs text-white/60 mb-1">Winners Pool (60%)</p>
                <p className="text-xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                  {formatPssh(winnersPool)} Morbius
                </p>
              </div>
              <div className="p-4 bg-black/50 border border-white/10 rounded-lg">
                <p className="text-xs text-white/60 mb-1">Burn (20%)</p>
                <p className="text-xl font-bold text-white">
                  {formatPssh(stakeAllocation)} Morbius
                </p>
              </div>
              <div className="p-4 bg-black/50 border border-white/10 rounded-lg">
                <p className="text-xs text-white/60 mb-1">MegaMorbius (20%)</p>
                <p className="text-xl font-bold text-white">
                  {formatPssh(megaAllocation)} Morbius
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
