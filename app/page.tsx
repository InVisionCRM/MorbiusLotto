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
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK, TOKEN_DECIMALS, MEGA_MILLIONS_INTERVAL } from '@/lib/contracts'
import BallDrawSimulator from '@/components/lottery/ball-draw-simulator/BallDrawSimulator'
import { TicketPurchaseBuilder } from '@/components/lottery/ticket-purchase-builder'
import { TicketPurchaseAccordion } from '@/components/lottery/ticket-purchase-accordion'
import { ContractAddress } from '@/components/ui/contract-address'

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
  // Returns: [roundId, startTime, endTime, totalPssh, totalTickets, uniquePlayers, timeRemaining, isMegaMillionsRound, state]
  const roundData = useMemo(() => {
    if (Array.isArray(roundDataRaw) && roundDataRaw.length >= 9) {
      return roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, number]
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
  const isMegaMillionsRound = roundData?.[7] || false
  const roundState = roundData?.[8] || 0

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
          <Skeleton className="h-[800px] w-full"         />
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

      {/* Hero Section - MegaMorbius */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Main MegaMorbius Display */}
          <div className="text-center mb-20 md:mb-32">
            {/* Animated Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl tracking-[0.3em] md:tracking-[0.5em] font-light text-white/90 mb-8 md:mb-12 funnel-display-light">
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
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
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
                <DialogContent className="bg-black/95 border-white/20 text-white max-w-2xl funnel-display-regular">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold mb-4 funnel-display-bold">How To Play Morbius Lottery</DialogTitle>
                    <DialogDescription className="text-white/80 space-y-4 text-left funnel-display-regular">
                      <div>
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">1. Pick Your Numbers</h3>
                        <p className="text-sm">Select 6 numbers between 1-55. You can choose your own lucky numbers or use Quick Pick for random selection.</p>
                      </div>

                      <div>
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">2. Purchase Tickets</h3>
                        <p className="text-sm">Each ticket costs 100 Morbius tokens. You can buy multiple tickets (up to 100 per transaction) and play up to 100 rounds in advance.</p>
                      </div>

                      <div>
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">3. Wait For The Draw</h3>
                        <p className="text-sm">Rounds last 30 minutes. Draws happen automatically at the end of each round. Watch the countdown timer!</p>
                      </div>

                      <div>
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">4. Win Prizes</h3>
                        <p className="text-sm">Match numbers to win! The more numbers you match, the bigger your prize. Prize distribution: 70% to winners, 10% to MegaMorbius jackpot, 10% burned, 5% to keeper, 5% to deployer.</p>
                      </div>

                      <div className="pt-4 border-t border-white/10">
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">MegaMorbius Jackpot</h3>
                        <p className="text-sm">Every {MEGA_MILLIONS_INTERVAL} rounds (20, 40, 60...), the accumulated MegaMorbius bank is distributed: 90% to the winners pool for massive prizes, 10% to deployer!</p>
                      </div>

                      <div className="pt-4 border-t border-white/10">
                        <h3 className="font-semibold text-white mb-2 funnel-display-semibold">Unclaimed Prizes</h3>
                        <p className="text-sm">If a bracket has no winners, the prize rolls over: 75% to next round&apos;s winners pool, 10% to MegaMorbius bank, 10% burned, and 5% to deployer.</p>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
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
          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent mb-16 md:mb-24" />
          
          {/* Stats Row - Always 3 columns */}
          <div className="grid grid-cols-3 gap-4 md:gap-8 lg:gap-16 max-w-5xl mx-auto">
            {/* Burned */}
            <div className="text-center">
              <div className="text-3xl md:text-5xl lg:text-6xl font-bold text-white/90 mb-2 md:mb-4 funnel-display-bold">
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

            {/* Player Pool */}
            <div className="text-center">
              <div className="text-3xl md:text-5xl lg:text-6xl font-bold text-white/90 mb-2 md:mb-4 funnel-display-bold">
                {(() => {
                  const pool = (totalPssh * BigInt(7000)) / BigInt(10000)
                  const poolNum = parseFloat(formatUnits(pool, TOKEN_DECIMALS))
                  return poolNum >= 1_000_000
                    ? (poolNum / 1_000_000).toFixed(1) + 'M'
                    : poolNum >= 1_000
                    ? (poolNum / 1_000).toFixed(1) + 'K'
                    : poolNum.toFixed(0)
                })()}
              </div>
              <div className="text-lg text-white/50 tracking-[0.2em] uppercase mitr-small">
                <div>Player</div>
                <div>Pool</div>
              </div>
            </div>

            {/* Jackpot */}
            <div className="text-center">
              <div className="text-3xl md:text-5xl lg:text-6xl font-bold text-white/90 mb-2 md:mb-4 funnel-display-bold">
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

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
        {/* Round Timer - Centered at Top */}
        <div className="flex justify-center">
          <div className="w-full max-w-3xl min-h-[610px] relative">
            <div className="absolute inset-0 pointer-events-none z-20">
              <BallDrawSimulator
                winningNumbers={simulatorNumbers}
                roundId={Number(roundId)}
                playerTickets={[]}
                autoStart={true}
                isBackground
                isMegaMorbius={Number(roundId) % MEGA_MILLIONS_INTERVAL === 0 && Number(roundId) > 0}
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

      </main>


      {/* Footer */}
      <footer className="border-t border-white/10 py-6 mt-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
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

