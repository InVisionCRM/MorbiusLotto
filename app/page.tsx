'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import {
  useCurrentRound,
  useRound,
  useMegaMillionsBank,
  usePlayerTickets,
  useHouseTicket,
  useWatchRoundFinalized,
  useWatchMegaMillions,
} from '@/hooks/use-lottery-6of55'
import { Header } from '@/components/lottery/header'
import { FreeTicketBadge } from '@/components/lottery/free-ticket-badge'
import { RoundTimer } from '@/components/lottery/round-timer'
import { RoundFinalizedTransactions } from '@/components/lottery/round-finalized-transactions'
import { MorbiusMovementFeed } from '@/components/lottery/morbius-movement-feed'
import { useNumberHeatmap } from '@/hooks/use-number-heatmap'
import { useMorbiusBurned } from '@/hooks/use-morbius-burned'
import { useMultiRoundPurchases, getRoundRangeForTx } from '@/hooks/use-multi-round-purchases'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { formatUnits, parseAbiItem } from 'viem'
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK, TOKEN_DECIMALS } from '@/lib/contracts'
import BallDrawSimulator from '@/components/lottery/ball-draw-simulator/BallDrawSimulator'
import { TicketPurchaseBuilder } from '@/components/lottery/ticket-purchase-builder'
import { TicketPurchaseAccordion } from '@/components/lottery/ticket-purchase-accordion'
import { AllTicketsAccordion } from '@/components/lottery/all-tickets-accordion'
import { ContractAddress } from '@/components/ui/contract-address'
import { WalletDebug } from '@/components/wallet-debug'

type ContractTicket = {
  ticketId: bigint | number
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
}

export default function Home() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [selectedTickets, setSelectedTickets] = useState<number[][]>([])
  const [showSimulator, setShowSimulator] = useState(false)
  const [simulatorNumbers, setSimulatorNumbers] = useState<number[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [showHowToPlay, setShowHowToPlay] = useState(false)
  const [ticketTxMap, setTicketTxMap] = useState<Map<string, string>>(new Map())
  const [showTicketAccordion, setShowTicketAccordion] = useState(false)


  // Fetch current round data
  const { data: roundDataRaw, isLoading: isLoadingRound, refetch: refetchRound, error: roundError } = useCurrentRound()
  const { data: megaBankRaw, refetch: refetchMegaBank } = useMegaMillionsBank()

  const [roundsToPlay, setRoundsToPlay] = useState(1)

  // Parse round data from getCurrentRoundInfo (memoized to prevent recreating BigInts)
  // V2 Returns: [roundId, startTime, endTime, totalMorbius, totalTickets, uniquePlayers, timeRemaining, state]
  const roundData = useMemo(() => {
    if (Array.isArray(roundDataRaw) && roundDataRaw.length >= 8) {
      return roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number]
    }
    return undefined
  }, [roundDataRaw])

  const roundId = roundData?.[0] ?? BigInt(0)
  const startTime = roundData?.[1] ?? BigInt(0)
  const endTime = roundData?.[2] ?? BigInt(0)
  const totalPssh = roundData?.[3] ?? BigInt(0)
  const totalTickets = roundData?.[4] ?? BigInt(0)
  const uniquePlayers = roundData?.[5] ?? BigInt(0)
  const timeRemaining = roundData?.[6] ?? BigInt(0)
  const roundState = roundData?.[7] || 0
  const isMegaMillionsRound = false // MegaMillions not used in V2

  // Debug round state
  console.log('🎰 Round state:', {
    roundId: roundId.toString(),
    roundState,
    timeRemaining: timeRemaining.toString(),
    isRoundOpen: roundState === 0, // 0 = OPEN, 1 = FINALIZED
    roundData
  })

  const megaBank = (megaBankRaw ?? BigInt(0)) as bigint

  // Fetch number heatmap data for last 25 rounds
  const { getHeatLevel, isLoading: isLoadingHeatmap, hotNumbers, coldNumbers } = useNumberHeatmap(Number(roundId), 25)

  // Fetch total burned Morbius from dead addresses
  const { burnedAmount, isLoading: isLoadingBurned } = useMorbiusBurned()

  // Fetch full round details (includes brackets and winning numbers) - only if roundId > 0
  const displayRoundId = roundState === 2 ? Number(roundId) : Math.max(Number(roundId) - 1, 0)
  const { data: roundDetailsRaw, isLoading: isLoadingRoundDetails, refetch: refetchRoundDetails } = useRound(displayRoundId > 0 ? displayRoundId : 0)
  const { data: playerTicketsCurrent, isLoading: isLoadingTicketsCurrent, refetch: refetchTicketsCurrent } = usePlayerTickets(Number(roundId), address as `0x${string}` | undefined)
  const { data: playerTicketsFinal, isLoading: isLoadingTicketsFinal, refetch: refetchTicketsFinal } = usePlayerTickets(displayRoundId, address as `0x${string}` | undefined)
  const { data: houseTicketRaw } = useHouseTicket(Number(roundId))

  // Fetch multi-round purchase data to determine round ranges for tickets
  const { purchases: multiRoundPurchases } = useMultiRoundPurchases(address as `0x${string}` | undefined)

  // Extract house ticket numbers
  const houseTicketNumbers = useMemo(() => {
    if (Array.isArray(houseTicketRaw) && houseTicketRaw.length > 0) {
      const ticket = houseTicketRaw[0] as ContractTicket
      const numbers = ticket.numbers.map(n => Number(n))
      // Filter out any zeros or invalid numbers
      return numbers.filter(n => n > 0 && n <= 55)
    }
    return []
  }, [houseTicketRaw])

  // Extract brackets and winning numbers from round details (memoized to prevent infinite loops)
  const roundDetails = (roundDetailsRaw ?? {}) as any
  const rawBrackets = roundDetails?.brackets || []
  const brackets = useMemo(() => {
    return Array.isArray(rawBrackets)
      ? [...rawBrackets].map((b: any, index: number) => ({
          ...b,
          matchCount: Number(b?.matchCount ?? index + 1),
        })).sort((a, b) => b.matchCount - a.matchCount)
      : []
  }, [rawBrackets])
  
  const winningNumbersRaw = roundDetails?.winningNumbers || []
  const winningNumbers = useMemo(() => {
    return Array.isArray(winningNumbersRaw) ? winningNumbersRaw.map((n: any) => Number(n)) : []
  }, [winningNumbersRaw])
  
  const displayIsMegaMillions = roundDetails?.isMegaMillionsRound || false

  // Keep simulator numbers in sync with latest finalized round details
  // Use string key to avoid infinite loops from array reference changes
  const winningNumbersKey = winningNumbers.join(',')
  useEffect(() => {
    console.log('📊 Page: winning numbers updated:', {
      displayRoundId,
      winningNumbers,
      winningNumbersKey,
      hasRoundDetails: !!roundDetails,
      roundDetailsState: roundDetails?.state
    })
    
    if (winningNumbers.length === 6) {
      console.log('📊 Page: setting simulator numbers to:', winningNumbers)
      setSimulatorNumbers(winningNumbers)
    } else {
      console.log('📊 Page: not setting simulator numbers (invalid length)')
    }
  }, [winningNumbersKey, displayRoundId]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const countMatches = (ticket: readonly (number | bigint)[], winning: readonly (number | bigint)[]) => {
    let matches = 0
    const t = ticket.map(Number).sort((a, b) => a - b)
    const w = winning.map(Number).sort((a, b) => a - b)
    let wi = 0
    for (let ti = 0; ti < t.length && wi < w.length; ti++) {
      while (wi < w.length && w[wi] < t[ti]) wi++
      if (wi < w.length && w[wi] === t[ti]) {
        matches++
        wi++
      }
    }
    return matches
  }

  // Winning tickets for finalized round
  const winningTickets = (() => {
    if (!Array.isArray(playerTicketsFinal) || winningNumbers.length !== 6) return []
    const payoutsByMatches: Record<number, bigint> = {}
    brackets.forEach((b) => {
      const m = Number(b.matchCount || 0)
      const winners = Number(b.winnerCount || 0)
      if (m > 0 && winners > 0) {
        payoutsByMatches[m] = BigInt(b.poolAmount || 0) / BigInt(winners)
      }
    })
    return (playerTicketsFinal as readonly ContractTicket[])
      .map((t) => {
        const matches = countMatches(t.numbers ?? [], winningNumbers)
        const payout = payoutsByMatches[matches] || BigInt(0)
        return { ticketId: t.ticketId ?? BigInt(0), matches, payout, numbers: t.numbers ?? [] }
      })
      .filter((t) => t.matches > 0)
      .sort((a, b) => b.matches - a.matches)
  })()
  const totalWinningPssh = winningTickets.reduce((acc, t) => acc + t.payout, BigInt(0))

  const yourTicketCount = Array.isArray(playerTicketsCurrent) ? playerTicketsCurrent.length : 0
  const freeTicketsCount = Array.isArray(playerTicketsCurrent) ? playerTicketsCurrent.filter((t: any) => t.isFreeTicket).length : 0

  // Map transaction hashes to tickets for the current round (align order of tickets with purchase logs)
  useEffect(() => {
    if (!publicClient || !address || !Array.isArray(playerTicketsCurrent) || Number(roundId) <= 0) {
      setTicketTxMap(new Map())
      return
    }
    const loadTxs = async () => {
      try {
        const event = parseAbiItem(
          'event TicketsPurchased(address indexed player,uint256 indexed roundId,uint256 ticketCount,uint256 freeTicketsUsed,uint256 morbiusSpent)'
        )
        const fromBlock = LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : BigInt(0)
        const logs = await publicClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event,
          args: { player: address, roundId },
          fromBlock,
          toBlock: 'latest',
        })
        const sortedLogs = [...logs].sort((a, b) => {
          const blockA = typeof a.blockNumber === 'bigint' ? a.blockNumber : BigInt(a.blockNumber || 0)
          const blockB = typeof b.blockNumber === 'bigint' ? b.blockNumber : BigInt(b.blockNumber || 0)
          if (blockA > blockB) return 1
          if (blockA < blockB) return -1
          const logA = typeof a.logIndex === 'bigint' ? a.logIndex : BigInt(a.logIndex || 0)
          const logB = typeof b.logIndex === 'bigint' ? b.logIndex : BigInt(b.logIndex || 0)
          if (logA > logB) return 1
          if (logA < logB) return -1
          return 0
        })
        const sortedTickets = [...(playerTicketsCurrent as any[])].sort((a, b) => {
          const idA = typeof a.ticketId === 'bigint' ? a.ticketId : BigInt(a.ticketId || 0)
          const idB = typeof b.ticketId === 'bigint' ? b.ticketId : BigInt(b.ticketId || 0)
          if (idA > idB) return 1
          if (idA < idB) return -1
          return 0
        })
        const map = new Map<string, string>()
        let ticketCursor = 0
        for (const log of sortedLogs) {
          const count = Number(log.args?.ticketCount ?? 0)
          for (let i = 0; i < count && ticketCursor < sortedTickets.length; i++) {
            const tid = sortedTickets[ticketCursor]?.ticketId
            if (tid !== undefined) {
              map.set(tid.toString(), log.transactionHash)
            }
            ticketCursor++
          }
        }
        setTicketTxMap(map)
      } catch (err) {
        console.error('load lottery ticket tx hashes failed', err)
      }
    }
    loadTxs()
  }, [publicClient, address, playerTicketsCurrent, roundId])

  const playerTicketsWithTx = useMemo(() => {
    if (!Array.isArray(playerTicketsCurrent)) return []
    return playerTicketsCurrent.map((t: any) => {
      const txHash = ticketTxMap.get((t?.ticketId ?? '').toString())
      const roundRange = getRoundRangeForTx(txHash, multiRoundPurchases)

      return {
        ...t,
        transactionHash: txHash,
        startRound: roundRange?.startRound,
        endRound: roundRange?.endRound,
      }
    })
  }, [playerTicketsCurrent, ticketTxMap, multiRoundPurchases])

  const recentRoundHistory = (() => {
    if (!Array.isArray(playerTicketsFinal) || winningNumbers.length !== 6 || displayRoundId <= 0) return []
    const payoutsByMatches: Record<number, bigint> = {}
    brackets.forEach((b) => {
      const m = Number(b.matchCount || 0)
      const winners = Number(b.winnerCount || 0)
      if (m > 0 && winners > 0) {
        payoutsByMatches[m] = BigInt(b.poolAmount || 0) / BigInt(winners)
      }
    })
    return (playerTicketsFinal as readonly ContractTicket[]).map((t) => {
      const matches = countMatches(t.numbers ?? [], winningNumbers)
      const payout = payoutsByMatches[matches] || BigInt(0)
      return {
        roundId: displayRoundId,
        matches,
        payout,
        winningNumbers: winningNumbers.map((n) => Number(n)),
      }
    }).slice(0, 5)
  })()

  // Watch for round finalized events
  useWatchRoundFinalized((roundId, winningNums, totalPssh) => {
    if (winningNums.length === 6) {
      setSimulatorNumbers(winningNums)
    }
    refetchRound()
    refetchRoundDetails()
    refetchTicketsCurrent()
    refetchTicketsFinal()
    refetchMegaBank()
    // refetchHexJackpot not exposed by hook
  })

  // Watch for MegaMorbius events
  useWatchMegaMillions((roundId, bankAmount) => {
    toast.success(`🎰 MEGA MORBIUS! ${formatUnits(bankAmount, TOKEN_DECIMALS)} Morbius added to prizes!`, {
      duration: 5000,
    })
    refetchRound()
    refetchMegaBank()
  })

  const handlePurchaseSuccess = () => {
    setSelectedTickets([])
    refetchRound()
    refetchTicketsCurrent()
    toast.success('Tickets purchased successfully!')
  }

  // Check if contract is deployed
  const isContractDeployed = (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000'

  if (!isContractDeployed) {
    return (
      <div
        className="min-h-screen text-slate-100"
        style={{
          backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.87)), url('/morbius/Morbiusbg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <Header nextDrawEndTime={endTime} fallbackRemaining={timeRemaining} />
        <main className="container mx-auto px-4 py-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Contract Not Deployed</h2>
            <p className="text-muted-foreground mb-4">
              The lottery contract has not been deployed yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Please update the LOTTERY_ADDRESS in <code className="bg-muted px-2 py-1 rounded">lib/contracts.ts</code> after deployment.
            </p>
          </Card>
        </main>
      </div>
    )
  }

  if (isLoadingRound) {
    return (
      <div
        className="min-h-screen text-slate-100"
        style={{
          backgroundImage: "linear-gradient(rgba(1, 3, 15, 0.74), rgba(2, 6, 23, 0.63)), url('/morbius/Morbiusbg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <Header nextDrawEndTime={endTime} fallbackRemaining={timeRemaining} />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-[400px] sm:h-[600px] md:h-[800px] w-full"         />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex justify-center">
            <ContractAddress
              address={LOTTERY_ADDRESS}
              label="Lottery Contract"
            />
          </div>
        </div>
      </footer>
    </div>
  )
}

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.9), rgba(2, 6, 23, 0.88)), url('/morbius/Morbiusbg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <Header
        nextDrawEndTime={endTime}
        fallbackRemaining={timeRemaining}
      />

      {/* Wallet Debug Component - Remove in production */}
      <WalletDebug />

      {/* Hero Section - MegaMorbius */}
      <section className="relative py-12 sm:py-16 md:py-20 lg:py-32 overflow-hidden">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Main MegaMorbius Display */}
          <div className="text-center mb-12 sm:mb-16 md:mb-20 lg:mb-32">
            {/* Animated Title */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl tracking-[0.2em] sm:tracking-[0.25em] md:tracking-[0.3em] lg:tracking-[0.4em] xl:tracking-[0.5em] font-light text-white/90 mb-4 sm:mb-6 md:mb-8 lg:mb-10 xl:mb-12 funnel-display-light">
              {['M', 'E', 'G', 'A', 'M', 'O', 'R', 'B', 'I', 'U', 'S'].map((letter, i) => (
                <span
                  key={i}
                  className="inline-block animate-[fadeInUp_0.6s_ease-out_forwards] opacity-0"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {letter}
                </span>
              ))}
            </h1>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-xs mx-auto">
              {/* Play Now Button */}
              <button
                onClick={() => {
                  const ticketSection = document.querySelector('#ticket-purchase')
                  ticketSection?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="px-3 py-2 bg-purple-900/10 backdrop-blur-sm border border-white/20 text-white text-xs rounded-lg hover:bg-purple-950/20 hover:border-white/30 transition-all funnel-display-medium"
              >
                Play Now
              </button>

              {/* How To Play Button */}
              <Dialog open={showHowToPlay} onOpenChange={setShowHowToPlay}>
                <DialogTrigger asChild>
                  <button className="px-3 py-2 bg-purple-900/10 backdrop-blur-sm border border-white/20 text-white text-xs rounded-lg hover:bg-purple-950/20 hover:border-white/30 transition-all funnel-display-medium">
                    How To Play
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-black/95 border-white/20 text-white max-w-4xl max-h-[85vh] overflow-y-auto funnel-display-regular">
                  <DialogHeader>
                    <div className="text-center mb-8">
                      <DialogTitle className="text-3xl font-bold mb-3 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent funnel-display-bold">
                        How To Play
                      </DialogTitle>
                      <div className="w-20 h-0.5 bg-gradient-to-r from-purple-400 to-pink-400 mx-auto"></div>
                    </div>
                  </DialogHeader>

                  <div className="space-y-8">
                    {/* Game Rules Section */}
                    <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
                      <h3 className="text-xl font-semibold mb-4 text-white border-b border-white/10 pb-2">Game Rules</h3>

                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-300 font-bold text-sm flex-shrink-0 mt-0.5">1</div>
                          <div>
                            <h4 className="text-white font-medium mb-1">Pick Your Numbers</h4>
                            <p className="text-white/70 text-sm leading-relaxed">Select 6 unique numbers between 1-55 for each ticket. You can choose your own lucky numbers or use Quick Pick for random selection.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-green-300 font-bold text-sm flex-shrink-0 mt-0.5">2</div>
                          <div>
                            <h4 className="text-white font-medium mb-1">Purchase Tickets</h4>
                            <p className="text-white/70 text-sm leading-relaxed">Each ticket costs 100 MORBIUS tokens. You can buy multiple tickets per transaction and play across multiple rounds in advance.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-300 font-bold text-sm flex-shrink-0 mt-0.5">3</div>
                          <div>
                            <h4 className="text-white font-medium mb-1">Wait for the Draw</h4>
                            <p className="text-white/70 text-sm leading-relaxed">Rounds last exactly 30 minutes. The draw happens automatically at the end of each round, generating 6 winning numbers.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-300 font-bold text-sm flex-shrink-0 mt-0.5">4</div>
                          <div>
                            <h4 className="text-white font-medium mb-1">Check Results & Win</h4>
                            <p className="text-white/70 text-sm leading-relaxed">Compare your numbers to the winning numbers. The more matches, the bigger your prize share from the winners pool.</p>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Prize Distribution Section */}
                    <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
                      <h3 className="text-xl font-semibold mb-4 text-white border-b border-white/10 pb-2">Prize Distribution</h3>

                      <div className="mb-4">
                        <p className="text-white/80 text-sm mb-4">
                          Every ticket purchase contributes to multiple pools. 70% goes to winners, 10% to MegaMorbius jackpot, 10% burned, and 10% to protocol fees.
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                          <div className="text-center p-3 bg-green-950/30 rounded-lg border border-green-400/20">
                            <div className="text-lg font-bold text-green-400 mb-1">70%</div>
                            <div className="text-white/70 text-xs">Winners Pool</div>
                          </div>
                          <div className="text-center p-3 bg-purple-950/30 rounded-lg border border-purple-400/20">
                            <div className="text-lg font-bold text-purple-400 mb-1">10%</div>
                            <div className="text-white/70 text-xs">MegaMorbius</div>
                          </div>
                          <div className="text-center p-3 bg-red-950/30 rounded-lg border border-red-400/20">
                            <div className="text-lg font-bold text-red-400 mb-1">10%</div>
                            <div className="text-white/70 text-xs">Token Burn</div>
                          </div>
                          <div className="text-center p-3 bg-blue-950/30 rounded-lg border border-blue-400/20">
                            <div className="text-lg font-bold text-blue-400 mb-1">10%</div>
                            <div className="text-white/70 text-xs">Protocol</div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-white font-medium mb-3">Fixed Prize Amounts</h4>
                        <div className="grid gap-2">
                          <div className="flex justify-between items-center p-3 bg-yellow-950/20 rounded border border-yellow-400/10">
                            <span className="text-yellow-300 font-medium">6 Matches</span>
                            <span className="text-white">15,000 MORBIUS</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                            <span className="text-white font-medium">5 Matches</span>
                            <span className="text-white/70">5,000 MORBIUS</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                            <span className="text-white font-medium">4 Matches</span>
                            <span className="text-white/70">2,000 MORBIUS</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                            <span className="text-white font-medium">3 Matches</span>
                            <span className="text-white/70">750 MORBIUS</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                            <span className="text-white font-medium">2 Matches</span>
                            <span className="text-white/70">375 MORBIUS</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                            <span className="text-white font-medium">1 Match</span>
                            <span className="text-white/70">125 MORBIUS</span>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* MegaMorbius Section */}
                    <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
                      <h3 className="text-xl font-semibold mb-4 text-white border-b border-white/10 pb-2">MegaMorbius Jackpot</h3>

                      <div className="mb-4">
                        <div className="bg-gradient-to-r from-purple-950/30 to-pink-950/30 p-4 rounded-lg border border-purple-400/20 mb-4">
                          <div className="flex items-center gap-3 mb-2">
                            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            <span className="text-lg font-semibold text-purple-300">Progressive Jackpot</span>
                          </div>
                          <p className="text-white/80 text-sm mb-3">
                            10% from every ticket purchase grows the MegaMorbius jackpot. When someone matches 5 or 6 numbers, the jackpot is distributed on top of fixed prizes!
                          </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                            <h4 className="text-purple-300 font-medium mb-2">How It Grows</h4>
                            <ul className="text-white/70 text-sm space-y-1">
                              <li>• 10% from each ticket purchase</li>
                              <li>• Donations from the community</li>
                              <li>• Accumulates until won</li>
                            </ul>
                          </div>
                          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                            <h4 className="text-purple-300 font-medium mb-2">Distribution</h4>
                            <ul className="text-white/70 text-sm space-y-1">
                              <li>• <strong className="text-yellow-400">6 matches:</strong> 65% of jackpot</li>
                              <li>• <strong className="text-purple-400">5 matches:</strong> 35% of jackpot</li>
                              <li>• PLUS their fixed prize amounts</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* How to Claim Section */}
                    <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
                      <h3 className="text-xl font-semibold mb-4 text-white border-b border-white/10 pb-2">Claiming Your Prizes</h3>

                      <div className="space-y-4">
                        <p className="text-white/80 text-sm">
                          Winners are automatically detected after each round. You can claim prizes from multiple rounds simultaneously.
                        </p>

                        <div className="bg-green-950/20 p-4 rounded-lg border border-green-400/20">
                          <h4 className="text-green-300 font-medium mb-3">Claiming Process</h4>
                          <ol className="text-white/70 text-sm space-y-2 list-decimal list-inside">
                            <li>Check your tickets after round completion</li>
                            <li>Click the yellow "Claim" button on the timer</li>
                            <li>Select rounds with available prizes</li>
                            <li>Confirm the blockchain transaction</li>
                            <li>Prizes are instantly transferred to your wallet</li>
                          </ol>
                        </div>

                        <div className="bg-blue-950/20 p-3 rounded border border-blue-400/20">
                          <p className="text-blue-300 text-sm font-medium mb-1">Important Notes</p>
                          <ul className="text-white/70 text-xs space-y-1">
                            <li>• Unclaimed prizes roll over to future rounds</li>
                            <li>• You can claim multiple rounds at once</li>
                            <li>• All claims are recorded on-chain for transparency</li>
                            <li>• Gas fees apply for claim transactions</li>
                          </ul>
                        </div>
                      </div>
                    </Card>

                    {/* Timer Controls Section */}
                    <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
                      <h3 className="text-xl font-semibold mb-4 text-white border-b border-white/10 pb-2">Timer Controls</h3>

                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {/* Tickets Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button
                            variant="outline"
                            className="text-white border-white/20 bg-green-500/50 hover:bg-green-600/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs flex-shrink-0"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-xs font-medium">Tickets</span>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">Buy Tickets</div>
                            <div className="text-white/60 text-xs">Opens ticket purchase modal</div>
                          </div>
                        </div>

                        {/* History Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-white border-white/20 bg-black/20 hover:bg-white/10 backdrop-blur-sm flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">History</div>
                            <div className="text-white/60 text-xs">View past round results</div>
                          </div>
                        </div>

                        {/* Claim Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0 flex-shrink-0" title="Claim Winnings">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">Claim Prizes</div>
                            <div className="text-white/60 text-xs">Collect your winnings</div>
                          </div>
                        </div>

                        {/* Stats Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0 flex-shrink-0" title="Stats">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">Player Stats</div>
                            <div className="text-white/60 text-xs">View performance metrics</div>
                          </div>
                        </div>

                        {/* Your Tickets Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0 flex-shrink-0" title="Your Tickets">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-1-1.73l-4-2.27A2 2 0 0014 9H6a2 2 0 00-2-2z" />
                            </svg>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">Your Tickets</div>
                            <div className="text-white/60 text-xs">Review your entries</div>
                          </div>
                        </div>

                        {/* Payouts Button */}
                        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <Button variant="outline" className="text-white z-10 w-10 h-10 p-0 bg-slate-900/50 backdrop-blur-sm border-white/20 hover:bg-slate-800/60 flex-shrink-0" title="Payouts">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </Button>
                          <div>
                            <div className="text-white font-medium text-sm mb-1">Payouts</div>
                            <div className="text-white/60 text-xs">View prize distribution</div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Stats Button */}
              <button
                disabled
                className="px-3 py-2 bg-purple-950/10 backdrop-blur-sm border border-white/20 text-white text-xs rounded-lg opacity-50 cursor-not-allowed funnel-display-medium"
              >
                Stats
              </button>
            </div>
          </div>
          
          {/* Divider */}
          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent mb-8 sm:mb-12 md:mb-16 lg:mb-20 xl:mb-24" />

          {/* Stats Row - 2 columns */}
          <div className="grid grid-cols-2 gap-4 sm:gap-8 md:gap-12 lg:gap-16 xl:gap-24 max-w-4xl mx-auto">
            {/* Burned */}
            <div className="text-center">
              <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white/90 mb-1 sm:mb-2 md:mb-3 lg:mb-4 xl:mb-4 funnel-display-bold">
                {isLoadingBurned ? (
                  <span className="text-white/50">...</span>
                ) : (() => {
                  const burnedNum = parseFloat(formatUnits(burnedAmount, TOKEN_DECIMALS))
                  return burnedNum >= 1_000_000
                    ? (burnedNum / 1_000_000).toFixed(1) + 'M'
                    : burnedNum >= 1_000
                    ? (burnedNum / 1_000).toFixed(1) + 'K'
                    : burnedNum.toFixed(0)
                })()}
              </div>
              <div className="text-lg text-white/50 tracking-[0.2em] uppercase mitr-small">
                Burned
              </div>
            </div>

            {/* Jackpot */}
            <div className="text-center">
              <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white/90 mb-1 sm:mb-2 md:mb-3 lg:mb-4 xl:mb-4 funnel-display-bold">
                {(() => {
                  const megaNum = parseFloat(formatUnits(megaBank, TOKEN_DECIMALS))
                  return megaNum >= 1_000_000
                    ? (megaNum / 1_000_000).toFixed(1) + 'M'
                    : megaNum >= 1_000
                    ? (megaNum / 1_000).toFixed(1) + 'K'
                    : megaNum.toFixed(0)
                })()}
              </div>
              <div className="text-lg text-white/50 tracking-[0.2em] uppercase mitr-small">
                Jackpot
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl">
        {/* Round Timer - Centered at Top */}
        <div className="flex justify-center">
          <div className="w-full max-w-3xl min-h-[400px] sm:min-h-[500px] md:min-h-[610px] relative">
            <div className="absolute inset-0 pointer-events-none z-20">
              <BallDrawSimulator
                winningNumbers={simulatorNumbers}
                roundId={Number(roundId)}
                playerTickets={[]}
                autoStart={false}
                isBackground
                onDrawStart={() => setIsDrawing(true)}
                onDrawEnd={() => setIsDrawing(false)}
                timeRemaining={Number(timeRemaining)}
              />
            </div>
            <div className="relative z-10">
              <RoundTimer
                endTime={endTime}
                fallbackRemaining={timeRemaining}
                roundId={roundId}
                totalTickets={totalTickets}
                totalPssh={totalPssh}
                disabled={isDrawing}
                previousRoundId={displayRoundId}
                houseTicketNumbers={houseTicketNumbers}
                playerTickets={Array.isArray(playerTicketsWithTx) ? playerTicketsWithTx : []}
                onBuyTicketsClick={() => setShowTicketAccordion(!showTicketAccordion)}
              />
            </div>
          </div>
        </div>

        {/* Ticket Purchase Modal */}
        <TicketPurchaseAccordion
          isOpen={showTicketAccordion}
          onOpenChange={setShowTicketAccordion}
          initialRounds={roundsToPlay}
          onSuccess={handlePurchaseSuccess}
          onError={(err) => toast.error(err.message)}
          onStateChange={(t, r) => {
            setSelectedTickets(t)
            setRoundsToPlay(r)
          }}
        />

        {/* All Purchased Tickets Accordion */}
        <div className="container mx-auto px-4 max-w-7xl mt-8">
          <AllTicketsAccordion />
        </div>

      </main>


      {/* Footer */}
      <footer className="border-t border-white/10 py-4 sm:py-6 mt-8 sm:mt-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <ContractAddress
                address={LOTTERY_ADDRESS}
                label="Lottery Contract"
              />
            </div>
            <div className="text-white/60 text-sm">
              Made by{' '}
              <a
                href="https://morbius.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                Morbius.io
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

