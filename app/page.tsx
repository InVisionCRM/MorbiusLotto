'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import {
  useCurrentRound,
  useRound,
  useMegaMillionsBank,
  usePlayerTickets,
  useWatchRoundFinalized,
  useWatchMegaMillions,
} from '@/hooks/use-lottery-6of55'
import { Header } from '@/components/lottery/header'
import { NumberPicker } from '@/components/lottery/number-picker'
import { TicketPurchaseV2 as TicketPurchase } from '@/components/lottery/ticket-purchase-v2'
import { CombinedPoolsCard } from '@/components/lottery/combined-pools-card'
import { FreeTicketBadge } from '@/components/lottery/free-ticket-badge'
import { TicketList } from '@/components/lottery/ticket-list'
import { RoundTimer } from '@/components/lottery/round-timer'
import { RoundFinalizedTransactions } from '@/components/lottery/round-finalized-transactions'
import { useNumberHeatmap } from '@/hooks/use-number-heatmap'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { formatUnits } from 'viem'
import { LOTTERY_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import BallDrawSimulator from '@/components/lottery/ball-draw-simulator/BallDrawSimulator'
import { PurchaseSummaryModal } from '@/components/lottery/purchase-summary-modal'

type ContractTicket = {
  ticketId: bigint | number
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
}

export default function Home() {
  const { address } = useAccount()
  const [selectedTickets, setSelectedTickets] = useState<number[][]>([])
  const [ticketQuantities, setTicketQuantities] = useState<Record<number, number>>({})
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [simulatorNumbers, setSimulatorNumbers] = useState<number[]>([])
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)

  // Fetch current round data
  const { data: roundDataRaw, isLoading: isLoadingRound, refetch: refetchRound, error: roundError } = useCurrentRound()
  const { data: megaBankRaw, refetch: refetchMegaBank } = useMegaMillionsBank()
  
  const [roundsToPlay, setRoundsToPlay] = useState(1)

  // Parse round data from getCurrentRoundInfo
  // Returns: [roundId, startTime, endTime, totalPssh, totalTickets, uniquePlayers, timeRemaining, isMegaMillionsRound, state]
  const roundData = Array.isArray(roundDataRaw) && roundDataRaw.length >= 9
    ? (roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, number])
    : undefined
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

  // Fetch full round details (includes brackets and winning numbers) - only if roundId > 0
  const displayRoundId = roundState === 2 ? Number(roundId) : Math.max(Number(roundId) - 1, 0)
  const { data: roundDetailsRaw, isLoading: isLoadingRoundDetails, refetch: refetchRoundDetails } = useRound(displayRoundId > 0 ? displayRoundId : 0)
  const { data: playerTicketsCurrent, isLoading: isLoadingTicketsCurrent, refetch: refetchTicketsCurrent } = usePlayerTickets(Number(roundId), address as `0x${string}` | undefined)
  const { data: playerTicketsFinal, isLoading: isLoadingTicketsFinal, refetch: refetchTicketsFinal } = usePlayerTickets(displayRoundId, address as `0x${string}` | undefined)

  // Extract brackets and winning numbers from round details
  const roundDetails = (roundDetailsRaw ?? {}) as any
  const rawBrackets = roundDetails?.brackets || []
  const brackets = Array.isArray(rawBrackets)
    ? [...rawBrackets].map((b: any, index: number) => ({
        ...b,
        matchCount: Number(b?.matchCount ?? index + 1),
      })).sort((a, b) => b.matchCount - a.matchCount)
    : []
  const winningNumbersRaw = roundDetails?.winningNumbers || []
  const winningNumbers = Array.isArray(winningNumbersRaw) ? winningNumbersRaw.map((n: any) => Number(n)) : []
  const displayIsMegaMillions = roundDetails?.isMegaMillionsRound || false

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
    toast.success(`Round ${roundId.toString()} finalized! Winning numbers: ${winningNums.join(', ')}`)
    // Show simulator with winning numbers
    if (winningNums.length === 6) {
      setSimulatorNumbers(winningNums)
      setShowSimulator(true)
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
    setTicketQuantities({})
    setShowPurchaseModal(false)
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
          backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.67), rgba(2, 6, 23, 0.58)), url('/morbius/Morbiusbg.png')",
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
          <Skeleton className="h-[800px] w-full" />
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.67), rgba(2, 6, 23, 0.68)), url('/morbius/Morbiusbg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <Header
        navigationMenuProps={{
          address: address as `0x${string}` | undefined,
          displayRoundId,
          isLoadingTicketsFinal,
          winningNumbers,
          roundState: Number(roundState),
          winningTickets: winningTickets.map(t => ({
            ...t,
            ticketId: BigInt(t.ticketId),
          })),
          totalWinningPssh,
          formatPssh,
          brackets: brackets.length > 0 ? brackets.map((b: any, index: number) => ({
            bracketId: index,
            poolAmount: BigInt(b.poolAmount || 0),
            winnerCount: Number(b.winnerCount || 0),
            matchCount: Number(b.matchCount || index + 1),
          })) : [],
          isLoadingBrackets: isLoadingRound || isLoadingRoundDetails,
          isMegaMillions: displayIsMegaMillions,
          currentRoundId: Number(roundId),
        }}
        nextDrawEndTime={endTime}
        fallbackRemaining={timeRemaining}
      />

      {/* Ball Draw Simulator Modal */}
      <Dialog open={showSimulator && simulatorNumbers.length === 6} onOpenChange={setShowSimulator}>
        <DialogContent className="max-w-6xl bg-black/95 border-white/10 p-0 overflow-hidden max-h-[95vh]">
          {simulatorNumbers.length === 6 ? (
            <div className="relative">
              <BallDrawSimulator
                winningNumbers={simulatorNumbers}
                ballCount={30}
                drawCount={6}
                autoStart={true}
                onComplete={() => {
                  // Keep it open, let user close manually
                }}
                onClose={() => setShowSimulator(false)}
              />
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-white/60">Loading winning numbers...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Purchase Summary Modal */}
      <PurchaseSummaryModal
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        tickets={selectedTickets.filter(t => t.length === 6)}
        ticketQuantities={ticketQuantities}
        onSuccess={handlePurchaseSuccess}
        onError={(err) => toast.error(err.message)}
        roundsToPlay={roundsToPlay}
        onRoundsChange={setRoundsToPlay}
      />

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
        {/* Round Timer - Centered at Top */}
        <div className="flex justify-center">
          <div className="w-full max-w-2xl">
            <RoundTimer 
              endTime={endTime} 
              fallbackRemaining={timeRemaining} 
              roundId={roundId} 
              totalTickets={totalTickets}
              totalPssh={totalPssh}
              onViewLastDrawing={() => {
                // Use winning numbers from roundDetails (previous finalized round)
                const nums = roundDetails?.winningNumbers || []
                if (nums.length === 6) {
                  setSimulatorNumbers(nums.map((n: number | bigint) => Number(n)))
                  setShowSimulator(true)
                } else {
                  toast.error('No winning numbers available yet. Please wait for the round to finalize.')
                }
              }}
              hasLastDrawing={(roundDetails?.winningNumbers?.length || 0) === 6 && roundDetails?.state === 2}
              previousRoundId={displayRoundId}
            />
          </div>
        </div>

        {/* Combined Pools Card */}
        <CombinedPoolsCard
          currentRoundId={Number(roundId)}
          megaMillionsBank={megaBank || BigInt(0)}
          isLoading={isLoadingRound}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Number Picker */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-black/75">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Pick Your Numbers</h2>
                <div className="flex items-center gap-2">
                  {/* Verify Results Dialog */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Verify Results
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl bg-black max-h-[90vh] flex flex-col">
                      <DialogHeader>
                        <DialogTitle>Verify Winning Numbers on Blockchain</DialogTitle>
                        <DialogDescription>
                          How to verify lottery results on the blockchain explorer
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 text-sm overflow-y-auto flex-1 pr-2">
                        <div>
                          <h4 className="font-semibold mb-2 text-base">Contract Address</h4>
                          <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-xs text-white/80 break-all">
                                {LOTTERY_ADDRESS}
                              </code>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(LOTTERY_ADDRESS)
                                      toast.success('Address copied!')
                                    } catch (err) {
                                      console.error('Failed to copy', err)
                                    }
                                  }}
                                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                  title="Copy address"
                                >
                                  <Copy className="h-4 w-4 text-white/60" />
                                </button>
                                <a
                                  href={`https://scan.pulsechain.box/address/${LOTTERY_ADDRESS}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                  title="View on PulseScan"
                                >
                                  <ExternalLink className="h-4 w-4 text-white/60" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold mb-2 text-base">How to Find Winning Numbers</h4>
                          <ol className="space-y-2 list-decimal list-inside text-muted-foreground">
                            <li>Go to the contract address on <a href={`https://scan.pulsechain.box/address/${LOTTERY_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PulseScan</a></li>
                            <li>Click on the <strong>"Events"</strong> or <strong>"Logs"</strong> tab</li>
                            <li>Look for the <strong>"RoundFinalized"</strong> event for the round you want to verify</li>
                            <li>The winning numbers are stored in the <code className="bg-black/40 px-1 rounded">winningNumbers</code> parameter of the event</li>
                            <li>You can also view all round data by calling the <code className="bg-black/40 px-1 rounded">getRound(roundId)</code> function in the "Read Contract" section</li>
                          </ol>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2 text-base">Event Details</h4>
                          <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-2">The <code className="bg-black/60 px-1 rounded">RoundFinalized</code> event contains:</p>
                            <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                              <li><code>roundId</code> - The round number</li>
                              <li><code>winningNumbers</code> - Array of 6 winning numbers (1-55)</li>
                              <li><code>totalPssh</code> - Total pSSH collected in the round</li>
                              <li><code>totalTickets</code> - Total number of tickets sold</li>
                              <li><code>uniquePlayers</code> - Number of unique players</li>
                            </ul>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2 text-base">RoundFinalized Transactions</h4>
                          <p className="text-xs text-muted-foreground mb-3">
                            All finalized rounds with direct links to their transactions:
                          </p>
                          <RoundFinalizedTransactions />
                        </div>

                        <div className="pt-2 border-t border-white/10">
                          <p className="text-xs text-muted-foreground">
                            All lottery results are permanently recorded on the blockchain and can be verified by anyone at any time.
                          </p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                </div>
              </div>
              <NumberPicker
                onTicketsChange={setSelectedTickets}
                onTicketQuantitiesChange={setTicketQuantities}
                roundsToPlay={roundsToPlay}
                onRoundsChange={setRoundsToPlay}
                maxTickets={100}
                showHeatmap={showHeatmap}
                onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
                getHeatLevel={getHeatLevel}
                isLoadingHeatmap={isLoadingHeatmap}
                hotNumbers={hotNumbers || []}
                coldNumbers={coldNumbers || []}
                onPlayTickets={() => {
                  setShowPurchaseModal(true)
                }}
              />
            </Card>
          </div>

          {/* Right Column - User Tickets */}
          <div>
            {/* User Tickets */}
            <div className="mt-4">
              <TicketList
                tickets={
                      Array.isArray(playerTicketsCurrent)
                    ? (playerTicketsCurrent as readonly ContractTicket[]).map((t) => {
                        // Calculate P/L if round is finalized and we have winning numbers
                        let currentPL = BigInt(0)
                        if (roundState === 2 && winningNumbers.length === 6) {
                          const matches = countMatches(t.numbers ?? [], winningNumbers)
                          const payoutsByMatches: Record<number, bigint> = {}
                          brackets.forEach((b) => {
                            const m = Number(b.matchCount || 0)
                            const winners = Number(b.winnerCount || 0)
                            if (m > 0 && winners > 0) {
                              payoutsByMatches[m] = BigInt(b.poolAmount || 0) / BigInt(winners)
                            }
                          })
                          const payout = payoutsByMatches[matches] || BigInt(0)
                          const ticketCost = t.isFreeTicket ? BigInt(0) : BigInt(1_000_000_000_000_000_000) // 1 Morbius (18 decimals)
                          currentPL = payout - ticketCost
                        }

                        return {
                          ticketId: t.ticketId ?? BigInt(0),
                          numbers: t.numbers ?? [],
                          isFreeTicket: !!t.isFreeTicket,
                          currentPL,
                          roundHistory: recentRoundHistory,
                        }
                      })
                    : []
                }
                roundId={Number(roundId)}
                isLoading={isLoadingTicketsCurrent}
                isConnected={!!address}
              />
            </div>

          </div>
        </div>

      </main>
    </div>
  )
}
