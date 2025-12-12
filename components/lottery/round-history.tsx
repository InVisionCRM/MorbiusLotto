'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { LOTTERY_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
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
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'roundTickets',
      args: [BigInt(roundId), ticketId],
    })),
    query: {
      enabled: winningTicketIds.length > 0,
    },
  })

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const openBlockExplorer = (address: string) => {
    window.open(`https://scan.pulsechain.com/address/${address}`, '_blank')
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-left hover:bg-white/5 p-2 rounded transition-colors w-full">
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/70">{matchCount} matches</span>
            <span className="text-white font-semibold">{winningTicketIds.length} winners</span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-black/95 border-white/20 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Bracket {matchCount} Winners - Round #{roundId}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
            <div className="text-sm text-white/60 mb-1">Payout Per Winner</div>
            <div className="text-xl font-bold text-white">{formatPssh(payoutPerWinner)} Morbius</div>
          </div>

          {ticketData && ticketData.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-white/60 mb-2">Winners ({ticketData.length})</div>
              {ticketData.map((result: any, idx: number) => {
                if (result.status !== 'success' || !result.result) return null
                const [playerAddress, ticketId, isFreeTicket] = result.result as [string, bigint, boolean]
                
                return (
                  <div
                    key={idx}
                    className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => openBlockExplorer(playerAddress)}
                            className="text-sm font-mono text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                            title={playerAddress}
                          >
                            {formatAddress(playerAddress)}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          {isFreeTicket && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                              FREE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/50">
                          Ticket #{Number(ticketId)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          {formatPssh(payoutPerWinner)}
                        </div>
                        <div className="text-xs text-white/50">Morbius</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-white/60 text-sm">
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
    abi: LOTTERY_6OF55_V2_ABI,
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
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: prevRoundId > 0 ? [BigInt(prevRoundId)] : undefined,
    query: {
      enabled: prevRoundId > 0 && (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000',
    },
  })

  const { data: nextRoundData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
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
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  if (roundIds.length === 0) {
    return null
  }

  const roundId = currentRoundIdToFetch
  const totalPssh = round?.totalMorbiusCollected || BigInt(0)
  const winnersPool = (totalPssh * BigInt(6000)) / BigInt(10000) // 60%
  const burnAllocation = (totalPssh * BigInt(2000)) / BigInt(10000) // 20%
  const megaAllocation = (totalPssh * BigInt(2000)) / BigInt(10000) // 20%
  const winningNumbers = round?.winningNumbers || []
  const brackets = round?.brackets || []
  const roundState = round?.state || 0
  const isFinalized = roundState === 2

  return (
    <Card className="p-4 bg-white/5 backdrop-blur-sm border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Round #{roundId}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={!hasPrev}
            className="h-8 w-8 border-white/10 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs text-white/60 min-w-[60px] text-center">
            {currentIndex + 1}/{roundIds.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={!hasNext}
            className="h-8 w-8 border-white/10 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isLoading && !round ? (
        <Skeleton className="h-24 w-full bg-white/10" />
      ) : !isFinalized ? (
        <p className="text-xs text-white/50 text-center py-4">Round not finalized</p>
      ) : (
        <div className="space-y-4">
          {/* Compact 3-Column Layout */}
          <div className="grid grid-cols-3 gap-3">
            {/* Winning Numbers Column */}
            <div className="col-span-2">
              <p className="text-xs text-white/50 mb-2">Winning Numbers</p>
              {winningNumbers.length === 6 && winningNumbers.some((n: number) => n > 0) ? (
                <div className="flex flex-wrap gap-1.5">
                  {winningNumbers.map((num: number | bigint, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black font-bold text-sm"
                    >
                      {Number(num)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50">None</p>
              )}
            </div>

            {/* Quick Stats Column */}
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-white/50">Tickets</p>
                <p className="text-white font-semibold">{Number(round?.totalTickets || BigInt(0)).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-white/50">Pool</p>
                <p className="text-white font-semibold">{formatPssh(totalPssh)}</p>
              </div>
            </div>
          </div>

          {/* Details Dropdown */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-white/10 text-white text-xs hover:bg-white/5"
              >
                View Details <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent
              className="bg-gradient-to-br from-gray-900 via-black to-gray-800 border-white/20 text-white max-w-2xl"
            >
              <DialogHeader>
                <DialogTitle className="text-xl">Round #{roundId} Details</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 text-sm">
                {/* Winning Numbers - Full Size */}
                {winningNumbers.length === 6 && winningNumbers.some((n: number) => n > 0) && (
                  <div>
                    <p className="text-white/60 mb-3">Winning Numbers</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {winningNumbers.map((num: number | bigint, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-center w-12 h-12 rounded-full bg-white text-black font-bold text-lg"
                        >
                          {Number(num)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-white/60 text-xs mb-1">Total Tickets</p>
                    <p className="text-white font-bold text-lg">{Number(round?.totalTickets || BigInt(0)).toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-white/60 text-xs mb-1">Unique Players</p>
                    <p className="text-white font-bold text-lg">{Number(round?.uniquePlayers || BigInt(0)).toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-white/60 text-xs mb-1">Total Pool</p>
                    <p className="text-white font-bold text-lg">{formatPssh(totalPssh)} Morbius</p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-white/60 text-xs mb-1">MegaMorbius</p>
                    <p className="text-white font-bold text-lg">{round?.isMegaMillionsRound ? '⭐ Yes' : 'No'}</p>
                  </div>
                </div>

                {/* Bracket Winners */}
                <div>
                  <p className="text-white/60 mb-3">Winners by Bracket (click to view details)</p>
                  <div className="grid grid-cols-2 gap-2">
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
                </div>

                {/* Allocation Breakdown */}
                <div>
                  <p className="text-white/60 mb-3">Pool Distribution</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center">
                      <p className="text-white/60 text-xs mb-1">Winners (60%)</p>
                      <p className="text-white font-bold">{formatPssh(winnersPool)}</p>
                    </div>
                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center">
                      <p className="text-white/60 text-xs mb-1">Burned (20%)</p>
                      <p className="text-white font-bold">{formatPssh(burnAllocation)}</p>
                    </div>
                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center">
                      <p className="text-white/60 text-xs mb-1">MegaMorbius (20%)</p>
                      <p className="text-white font-bold">{formatPssh(megaAllocation)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </Card>
  )
}
