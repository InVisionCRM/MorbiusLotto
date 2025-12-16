'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import { PlayerTicketsModal } from './player-tickets-modal'
import { PlayerStatsModal } from './player-stats-modal'
import { MultiClaimModal } from './modals/multi-claim-modal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RoundHistory } from './round-history'
import { ChevronUp, ChevronDown, History } from 'lucide-react'

interface RoundTimerProps {
  endTime: bigint
  fallbackRemaining?: bigint // optional timeRemaining from contract
  roundId?: number | bigint
  totalTickets?: number | bigint
  totalPssh?: bigint
  previousRoundId?: number // Previous round ID for display
  disabled?: boolean
  houseTicketNumbers?: number[] // Contract's own ticket numbers
  playerTickets?: Array<{
    ticketId: bigint | number
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
    transactionHash?: string
  }> // User's tickets for this round
  onBuyTicketsClick?: () => void // New prop for buy tickets button
}

const DISPLAY_OFFSET_SECONDS = 15

function formatSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function RoundTimer({ endTime, fallbackRemaining = BigInt(0), roundId, totalTickets, totalPssh, previousRoundId, disabled = false, houseTicketNumbers = [], playerTickets = [], onBuyTicketsClick }: RoundTimerProps) {
  // Convert BigInt to number once to avoid recreating dependencies
  const endTimeNum = Number(endTime)
  const fallbackNum = Number(fallbackRemaining)

  const [remaining, setRemaining] = useState<number>(() => {
    const fromEnd = endTimeNum * 1000 - Date.now()
    if (!Number.isNaN(fromEnd) && fromEnd > 0) return Math.floor(fromEnd / 1000) + DISPLAY_OFFSET_SECONDS
    return fallbackNum + DISPLAY_OFFSET_SECONDS
  })

  const [showHistory, setShowHistory] = useState(false)

  // Buttons should always be clickable regardless of disabled state
  const cardDisabledClass = ''

  useEffect(() => {
    const update = () => {
      const ms = endTimeNum * 1000 - Date.now()
      if (!Number.isNaN(ms)) {
        setRemaining(Math.max(0, Math.floor(ms / 1000) + DISPLAY_OFFSET_SECONDS))
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endTimeNum])

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }


  return (
    <>
      <Card className={`p-4 sm:p-6 md:p-8 border-white/10 relative min-h-[600px] sm:min-h-[600px] md:min-h-[610px] max-w-3xl w-full mx-auto bg-Black/10 backdrop-blur-md ${cardDisabledClass}`}>
      {/* House Ticket Numbers - Vertical on left */}
      <div className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 sm:gap-2">
        {houseTicketNumbers && houseTicketNumbers.length === 6 ? (
          houseTicketNumbers.map((num, idx) => (
            <div
              key={idx}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-950/20 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg"
            >
              {num}
            </div>
          ))
        ) : houseTicketNumbers && houseTicketNumbers.length > 0 ? (
          <div className="text-xs text-white/30 text-center">
            {houseTicketNumbers.length}/6
          </div>
        ) : (
          <div className="text-xs text-white/30 text-center">
            -
          </div>
        )}
      </div>

      {totalTickets !== undefined && (
        <div className="absolute top-2 sm:top-4 left-2 sm:left-4">
          <div className="text-xs sm:text-sm text-white/60">Total Tickets</div>
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-white">{Number(totalTickets).toLocaleString()}</div>
        </div>
      )}
      {roundId !== undefined && (
        <div className="absolute top-2 sm:top-4 right-2 sm:right-4">
          <div className="text-xs sm:text-sm text-white/60">Round</div>
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-white">#{Number(roundId)}</div>
        </div>
      )}

      {/* Total Pool Amount at top-center */}
      {totalPssh !== undefined && (
        <div className="absolute top-1 sm:top-2 left-1/2 -translate-x-1/2 text-center">
          <div className="text-xs sm:text-sm text-white/60 mb-0.5 sm:mb-1">Total Pool Amount</div>
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-white">
            {formatPssh(totalPssh)}
          </div>
          <div className="text-sm text-white/60">Morbius</div>
        </div>
      )}


      {/* Timer at bottom-center */}
      <div className="absolute bottom-1 sm:bottom-2 left-1/2 -translate-x-1/2 text-center">
        <div className="text-xs text-white/60 mb-1 sm:mb-2">Time Remaining</div>
        <div className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
          {formatSeconds(remaining)}
        </div>
      </div>

      {/* History Dropdown Button */}
      <div className="absolute bottom-2 right-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-white border-white/20 bg-black/20 hover:bg-white/10 backdrop-blur-sm"
        >
          <History className="w-4 h-4" />
          {showHistory ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
        </Button>
      </div>

      {/* Tickets Button - Bottom Left */}
      {onBuyTicketsClick && (
        <div className="absolute bottom-1 sm:bottom-2 left-1 sm:left-2">
          <Button
            variant="outline"
            className="text-white border-white/20 bg-green-500/50 hover:bg-green-600/60 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
            title="Buy lottery tickets"
            onClick={onBuyTicketsClick}
          >
            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs sm:text-sm font-medium">Tickets</span>
          </Button>
        </div>
      )}

      {/* Buttons - vertical stack on right side */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1 sm:gap-2">
        {/* Claim winnings button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <MultiClaimModal />
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-30">
              <p>Claim your lottery prizes</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Player stats button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <PlayerStatsModal />
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-30">
              <p>View your performance</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Your tickets button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <PlayerTicketsModal roundId={roundId} playerTickets={playerTickets} />
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-30">
              <p>See purchased tickets</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Payouts button (conditional) */}
        {totalPssh !== undefined && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <PayoutBreakdownDialog totalPssh={totalPssh} />
                </div>
              </TooltipTrigger>
              <TooltipContent className="z-30">
                <p>Pool distribution</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </Card>

      {/* Round History Dropdown */}
      {showHistory && roundId && (
        <div className="mt-4">
          <RoundHistory currentRoundId={Number(roundId)} />
        </div>
      )}
    </>
  )
}

interface PayoutBreakdownDialogProps {
  totalPssh?: bigint
}

export function PayoutBreakdownDialog({ totalPssh }: PayoutBreakdownDialogProps) {
  if (totalPssh === undefined) return null

  const total = Number(totalPssh)
  const formatPssh = (amount: number) =>
    parseFloat(formatUnits(BigInt(Math.floor(amount)), TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  const winnersPool = total * 0.70
  const burnAllocation = total * 0.10
  const megaBank = total * 0.10
  const keeperFee = total * 0.05
  const deployerFee = total * 0.05

  const brackets = [
    { id: 6, label: 'Match 6 (15,000 MOR)', amount: 15000, hasMegaBonus: true },
    { id: 5, label: 'Match 5 (5,000 MOR)', amount: 5000, hasMegaBonus: true },
    { id: 4, label: 'Match 4 (2,000 MOR)', amount: 2000, hasMegaBonus: false },
    { id: 3, label: 'Match 3 (750 MOR)', amount: 750, hasMegaBonus: false },
    { id: 2, label: 'Match 2 (375 MOR)', amount: 375, hasMegaBonus: false },
    { id: 1, label: 'Match 1 (125 MOR)', amount: 125, hasMegaBonus: false },
  ]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white z-10 w-10 h-10 p-0 bg-slate-900/50 backdrop-blur-sm border-white/20 hover:bg-slate-800/60" title="Payouts">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-black border-white/10">
        <DialogHeader>
          <DialogTitle>Payout Breakdown</DialogTitle>
          <DialogDescription>Distribution of the current pool</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-white">
          <div className="bg-black/40 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Winners Pool</span>
              <span className="text-white/80">70%</span>
            </div>
            <div className="text-white/60 mb-3">{formatPssh(winnersPool)} Morbius</div>
            <div className="space-y-1.5 pl-2 border-l-2 border-white/10">
              {brackets.map((bracket) => (
                <div key={bracket.id} className="flex items-center justify-between text-xs">
                  <span className="text-white/70">
                    {bracket.label}
                    {bracket.hasMegaBonus && <span className="text-yellow-400 ml-1">🎰</span>}
                  </span>
                  <span className="text-white/60">{bracket.amount.toLocaleString()} Morbius</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Burn</span>
              <span className="text-white/80">10%</span>
            </div>
            <div className="text-white/60 mt-1">{formatPssh(burnAllocation)} Morbius</div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">MegaMorbius Bank</span>
              <span className="text-white/80">10%</span>
            </div>
            <div className="text-white/60 mt-1">{formatPssh(megaBank)} Morbius</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/40 rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-xs">Keeper</span>
                <span className="text-white/80 text-xs">5%</span>
              </div>
              <div className="text-white/60 mt-1 text-xs">{formatPssh(keeperFee)} Morbius</div>
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-xs">Deployer</span>
                <span className="text-white/80 text-xs">5%</span>
              </div>
              <div className="text-white/60 mt-1 text-xs">{formatPssh(deployerFee)} Morbius</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
