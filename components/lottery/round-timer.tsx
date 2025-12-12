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
import { AnimatedTooltip } from '@/components/ui/animated-tooltip'
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
  const cardDisabledClass = disabled ? 'opacity-60' : ''

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

  const calculateSplit = () => {
    if (!totalPssh) return null
    
    const total = Number(totalPssh)
    // Distribution percentages (of total pot)
    const winnersPool = total * 0.60 // 60%
    const burnAllocation = total * 0.20 // 20% burn
    const megaBank = total * 0.20 // 20% MegaMorbius
    
    // Bracket percentages (of winners pool)
    const bracket6 = winnersPool * 0.45
    const bracket5 = winnersPool * 0.20
    const bracket4 = winnersPool * 0.15
    const bracket3 = winnersPool * 0.10
    const bracket2 = winnersPool * 0.06
    const bracket1 = winnersPool * 0.04
    
    return {
      winnersPool,
      burnAllocation,
      megaBank,
      brackets: [
        { id: 6, percentage: 45, amount: bracket6 },
        { id: 5, percentage: 20, amount: bracket5 },
        { id: 4, percentage: 15, amount: bracket4 },
        { id: 3, percentage: 10, amount: bracket3 },
        { id: 2, percentage: 6, amount: bracket2 },
        { id: 1, percentage: 4, amount: bracket1 },
      ]
    }
  }

  const split = calculateSplit()

  return (
    <>
      <Card className={`p-8 border-white/10 relative min-h-[610px] max-w-3xl w-full mx-auto bg-transparent ${cardDisabledClass}`}>
      {/* House Ticket Numbers - Vertical on left */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        {houseTicketNumbers && houseTicketNumbers.length === 6 ? (
          houseTicketNumbers.map((num, idx) => (
            <div
              key={idx}
              className="w-10 h-10 rounded-full bg-purple-950/20 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white font-bold text-sm shadow-lg"
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
        <div className="absolute top-4 left-4">
          <div className="text-sm text-white/60">Total Tickets</div>
          <div className="text-2xl font-bold text-white">{Number(totalTickets).toLocaleString()}</div>
        </div>
      )}
      {roundId !== undefined && (
        <div className="absolute top-4 right-4">
          <div className="text-sm text-white/60">Round</div>
          <div className="text-2xl font-bold text-white">#{Number(roundId)}</div>
        </div>
      )}

      {/* Total Pool Amount at top-center */}
      {totalPssh !== undefined && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
          <div className="text-sm text-white/60 mb-1">Total Pool Amount</div>
          <div className="text-2xl font-bold text-white">
            {formatPssh(totalPssh)} <span className="text-sm text-white/60">Morbius</span>
          </div>
        </div>
      )}


      {/* Timer at bottom-center */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
        <div className="text-xs text-white/60 mb-2">Time Remaining</div>
        <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
          {formatSeconds(remaining)}
        </div>
      </div>

      {/* History Dropdown Button */}
      <div className="absolute bottom-2 right-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-white border-white/20 bg-black/20 hover:bg-white/10 backdrop-blur-sm"
        >
          <History className="w-4 h-4 mr-1" />
          History
          {showHistory ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
        </Button>
      </div>

      {/* Buy Tickets Button - Bottom Left */}
      {onBuyTicketsClick && (
        <div className="absolute bottom-2 left-2">
          <Button
            variant="outline"
            className="text-white border-white/20 bg-green-500/50 hover:bg-green-600/60 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2"
            title="Buy lottery tickets"
            onClick={onBuyTicketsClick}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium">Buy Tickets</span>
          </Button>
        </div>
      )}

      {/* Buttons - vertical stack on right side */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        {/* Other buttons with tooltips */}
        <AnimatedTooltip
          items={[
            {
              id: 1,
              name: 'Claim winnings',
              designation: 'Claim your lottery prizes',
              render: <MultiClaimModal />,
            },
            {
              id: 2,
              name: 'Player stats',
              designation: 'View your performance',
              render: <PlayerStatsModal />,
            },
            {
              id: 3,
              name: 'Your tickets',
              designation: 'See purchased tickets',
              render: <PlayerTicketsModal roundId={roundId} playerTickets={playerTickets} />,
            },
            ...(totalPssh !== undefined
              ? [
                  {
                    id: 4,
                    name: 'Payouts',
                    designation: 'Pool distribution',
                    render: <PayoutBreakdownDialog totalPssh={totalPssh} />,
                  },
                ]
              : []),
          ]}
        />
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

  const winnersPool = total * 0.60
  const burnAllocation = total * 0.20
  const megaBank = total * 0.20

  const brackets = [
    { id: 6, label: 'Match 6 (45%)', amount: winnersPool * 0.45 },
    { id: 5, label: 'Match 5 (20%)', amount: winnersPool * 0.20 },
    { id: 4, label: 'Match 4 (15%)', amount: winnersPool * 0.15 },
    { id: 3, label: 'Match 3 (10%)', amount: winnersPool * 0.10 },
    { id: 2, label: 'Match 2 (6%)', amount: winnersPool * 0.06 },
    { id: 1, label: 'Match 1 (4%)', amount: winnersPool * 0.04 },
  ]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white z-10 w-10 h-10 p-0" title="Payouts">
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
              <span className="text-white/80">60%</span>
            </div>
            <div className="text-white/60 mb-3">{formatPssh(winnersPool)} Morbius</div>
            <div className="space-y-1.5 pl-2 border-l-2 border-white/10">
              {brackets.map((bracket) => (
                <div key={bracket.id} className="flex items-center justify-between text-xs">
                  <span className="text-white/70">{bracket.label}</span>
                  <span className="text-white/60">{formatPssh(bracket.amount)} Morbius</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Burn</span>
              <span className="text-white/80">20%</span>
            </div>
            <div className="text-white/60 mt-1">{formatPssh(burnAllocation)} Morbius</div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">MegaMorbius Bank</span>
              <span className="text-white/80">20%</span>
            </div>
            <div className="text-white/60 mt-1">{formatPssh(megaBank)} Morbius</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
