'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { LOTTERY_INSTANT_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { Skeleton } from '@/components/ui/skeleton'

interface RoundHistoryProps {
  currentRoundId: number
  maxRounds?: number
}

interface BracketWinnersModalProps {
  roundId: number
  bracket: any
  payoutPerWinner: bigint
}

function BracketWinnersModal({ roundId, bracket, payoutPerWinner }: BracketWinnersModalProps) {
  const winningTicketIds = bracket?.winningTicketIds || []
  const matchCount = bracket?.matchCount || 0
  
  // Fetch all winning ticket details
  const { data: ticketData } = useReadContracts({
    contracts: winningTicketIds.map((ticketId: bigint) => ({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'roundTickets',
      args: [BigInt(roundId), ticketId],
    })),
    query: {
      enabled: winningTicketIds.length > 0,
    },
  })

  const formatMORBIUS = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const openBlockExplorer = (address: string) => {
    window.open(`https://scan.pulsechain.box/address/${address}`, '_blank')
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-left hover:bg-neutral-100 dark:hover:bg-neutral-800/40 p-2 rounded transition-colors w-full border border-neutral-200 dark:border-neutral-700">
          <div className="flex justify-between items-center text-xs font-sans">
            <span className="text-neutral-600 dark:text-neutral-400">{matchCount} matches</span>
            <span className="text-neutral-900 dark:text-neutral-100 font-semibold">{winningTicketIds.length} winners</span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-lg max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-lg">
            Bracket {matchCount} Winners - Round #{roundId}
          </div>
        </div>

        <div className="space-y-2">
          <div className="p-2 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-sans">Payout Per Winner</div>
            <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-sans">{formatMORBIUS(payoutPerWinner)} MORBIUS</div>
          </div>

          {ticketData && ticketData.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-sans">Winners ({ticketData.length})</div>
              {ticketData.map((result: any, idx: number) => {
                if (result.status !== 'success' || !result.result) return null
                const [playerAddress, ticketId, isFreeTicket] = result.result as [string, bigint, boolean]

                return (
                  <div
                    key={idx}
                    className="p-2 bg-neutral-50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <button
                            onClick={() => openBlockExplorer(playerAddress)}
                            className="text-xs font-mono text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors flex items-center gap-1 font-sans"
                            title={playerAddress}
                          >
                            {formatAddress(playerAddress)}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                          {isFreeTicket && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-500 dark:text-cyan-400 border border-cyan-500/30 font-sans">
                              FREE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 font-sans">
                          Ticket #{Number(ticketId)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 font-sans">
                          {formatMORBIUS(payoutPerWinner)}
                        </div>
                        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 font-sans">MORBIUS</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-4 text-neutral-600 dark:text-neutral-400 text-xs font-sans">
              Loading winner details...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RoundHistory({ currentRoundId, maxRounds = 10 }: RoundHistoryProps) {
  const [roundIds, setRoundIds] = useState<number[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadedRounds, setLoadedRounds] = useState<Map<number, any>>(new Map())

  // Initialize round IDs (from current round backwards, including current round)
  useEffect(() => {
    if (currentRoundId > 0) {
      const rounds: number[] = []
      // Start from currentRoundId going backwards
      const startRound = Math.max(1, currentRoundId - maxRounds)
      for (let i = currentRoundId; i >= startRound; i--) {
        rounds.push(i)
      }
      setRoundIds(rounds)
      // Start with previous round if available, otherwise current round
      const defaultIndex = rounds.length > 1 ? 1 : 0
      setCurrentIndex(defaultIndex)
    }
  }, [currentRoundId, maxRounds])

  const currentRoundIdToFetch = roundIds[currentIndex] || 0

  // Fetch current round data
  const { data: roundData, isLoading } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: currentRoundIdToFetch > 0 ? [BigInt(currentRoundIdToFetch)] : undefined,
    query: {
      enabled: currentRoundIdToFetch > 0 && (LOTTERY_INSTANT_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: prevRoundId > 0 ? [BigInt(prevRoundId)] : undefined,
    query: {
      enabled: prevRoundId > 0 && (LOTTERY_INSTANT_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
    },
  })

  const { data: nextRoundData } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: nextRoundId > 0 ? [BigInt(nextRoundId)] : undefined,
    query: {
      enabled: nextRoundId > 0 && (LOTTERY_INSTANT_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
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

  const formatMORBIUS = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  if (roundIds.length === 0) {
    return null
  }

  const roundId = currentRoundIdToFetch
  const totalMORBIUS = round?.totalMORBIUSCollected || BigInt(0)
  const winnersPool = (totalMORBIUS * BigInt(7000)) / BigInt(10000) // 70%
  const burnAllocation = (totalMORBIUS * BigInt(1000)) / BigInt(10000) // 10%
  const megaAllocation = (totalMORBIUS * BigInt(1000)) / BigInt(10000) // 10%
  const winningNumbers = round?.winningNumbers || []
  const brackets = round?.brackets || []
  const roundState = round?.state || 0
  const isFinalized = roundState === 1

  return (
    <div>
      {/* Header with Navigation */}
      <div className="flex items-center justify-between mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-3">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-sans">
          Round #{roundId}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={!hasPrev}
            className="h-7 w-7 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 disabled:opacity-30 font-sans"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs text-neutral-600 dark:text-neutral-400 min-w-[40px] sm:min-w-[50px] text-center font-sans">
            {currentIndex + 1}/{roundIds.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={!hasNext}
            className="h-7 w-7 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 disabled:opacity-30 font-sans"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isLoading && !round ? (
        <Skeleton className="h-16 w-full bg-neutral-100 dark:bg-neutral-800" />
      ) : !isFinalized ? (
        <div className="text-center py-6">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">Round not finalized</p>
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={["overview"]} className="w-full space-y-2">
          {/* Quick Overview */}
          <AccordionItem value="overview" className="border-neutral-200 dark:border-neutral-700">
            <AccordionTrigger className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-neutral-800 dark:hover:text-neutral-200 px-3 py-2 hover:no- [&[data-state=open]>svg]:rotate-180 font-sans">
              Quick Overview
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="space-y-3">
                {/* Winning Numbers */}
                <div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 font-sans">Winning Numbers</p>
                  {winningNumbers.length === 6 && winningNumbers.some((n: number) => n > 0) ? (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {winningNumbers.map((num: number | bigint, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 font-bold text-base sm:text-lg font-sans"
                        >
                          {Number(num)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">None</p>
                  )}
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded p-2 text-center">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">Tickets</p>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-sans">{Number(round?.totalTickets || BigInt(0)).toLocaleString()}</p>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded p-2 text-center">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">Pool</p>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-sans">{formatMORBIUS(totalMORBIUS)}</p>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded p-2 text-center">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">Players</p>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-sans">{Number(round?.uniquePlayers || BigInt(0)).toLocaleString()}</p>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded p-2 text-center">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">Mega</p>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-sans">{round?.isMegaMillionsRound ? '⭐' : '—'}</p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Winners by Bracket */}
          <AccordionItem value="winners" className="border-neutral-200 dark:border-neutral-700">
            <AccordionTrigger className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-neutral-800 dark:hover:text-neutral-200 px-3 py-2 hover:no- [&[data-state=open]>svg]:rotate-180 font-sans">
              Winners by Bracket
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {brackets.map((b: any, idx: number) => {
                  const winnerCount = Number(b.winnerCount || 0)
                  const payoutPerWinner = BigInt(b.payoutPerWinner || 0)

                  if (winnerCount === 0) {
                    return (
                      <div key={idx} className="flex justify-between p-2 bg-white/5 border border-white/10 rounded text-xs opacity-50">
                        <span className="text-white/70">{Number(b.matchCount || idx + 1)} matches</span>
                        <span className="text-white font-semibold">No winners</span>
                      </div>
                    )
                  }

                  return (
                    <div key={idx}>
                      <BracketWinnersModal
                        roundId={roundId}
                        bracket={b}
                        payoutPerWinner={payoutPerWinner}
                      />
                    </div>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Pool Distribution */}
          <AccordionItem value="distribution" className="border-neutral-200 dark:border-neutral-700">
            <AccordionTrigger className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-neutral-800 dark:hover:text-neutral-200 px-3 py-2 hover:no- [&[data-state=open]>svg]:rotate-180 font-sans">
              Pool Distribution
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded-lg text-center">
                  <p className="text-neutral-600 dark:text-neutral-400 text-xs mb-1 font-sans">Winners (70%)</p>
                  <p className="text-neutral-900 dark:text-neutral-100 font-bold text-sm font-sans">{formatMORBIUS(winnersPool)}</p>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded-lg text-center">
                  <p className="text-neutral-600 dark:text-neutral-400 text-xs mb-1 font-sans">Burned (10%)</p>
                  <p className="text-neutral-900 dark:text-neutral-100 font-bold text-sm font-sans">{formatMORBIUS(burnAllocation)}</p>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded-lg text-center">
                  <p className="text-neutral-600 dark:text-neutral-400 text-xs mb-1 font-sans">MegaMORBIUS (10%)</p>
                  <p className="text-neutral-900 dark:text-neutral-100 font-bold text-sm font-sans">{formatMORBIUS(megaAllocation)}</p>
                </div>
              </div>
              <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-blue-600 dark:text-blue-400 text-xs text-center font-sans">
                  Additional: 5% to Keeper + 5% to Deployer fees
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
