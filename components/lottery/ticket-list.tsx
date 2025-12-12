'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Ticket, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'

export type PlayerTicket = {
  ticketId: bigint | number
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
  transactionHash?: string
  roundHistory?: Array<{
    roundId: number
    matches: number
    payout: bigint
    winningNumbers: number[]
  }>
  currentPL?: bigint // Current P/L for this ticket
  roundsPurchased?: number
  startRound?: number // First round this ticket is valid for
  endRound?: number // Last round this ticket is valid for
}

interface TicketListProps {
  tickets: PlayerTicket[]
  roundId: number
  isLoading?: boolean
  isConnected: boolean
}

const PAYOUT_TABLE = [
  { matches: 6, percentage: 25, description: 'Jackpot' },
  { matches: 5, percentage: 10, description: '5 Matches' },
  { matches: 4, percentage: 8, description: '4 Matches' },
  { matches: 3, percentage: 6, description: '3 Matches' },
  { matches: 2, percentage: 4, description: '2 Matches' },
  { matches: 1, percentage: 2, description: '1 Match' },
]

export function FlippableTicket({ ticket }: { ticket: PlayerTicket }) {
  const [isFlipped, setIsFlipped] = useState(false)
  const pl = ticket.currentPL || BigInt(0)
  const plNumber = Number(pl) / 1e18 // Morbius 18 decimals
  const isPositive = plNumber > 0
  const isNegative = plNumber < 0
  const roundsCovered = ticket.roundsPurchased ?? Math.max(1, ticket.roundHistory?.length || 1)

  const ticketIdStr = ticket.ticketId.toString()
  const shortId = ticketIdStr.length > 6 ? ticketIdStr.slice(-6) : ticketIdStr.padStart(6, '0')

  const formatMorbius = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    })

  return (
    <div className="relative w-full max-w-[17.5rem] sm:max-w-[18.5rem] mx-auto [perspective:1000px]">
      <div
        className={`relative w-full transition-all duration-700 ease-out cursor-pointer [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'} min-h-[320px]`}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front of ticket */}
        <div
          className="absolute inset-0 w-full border border-black overflow-hidden rounded-lg shadow-md [backface-visibility:hidden] [transform-style:preserve-3d] bg-amber-50 bg-[url('/morbius/c718c298-363d-45d3-82bd-e51837b459cb.png')] bg-cover bg-center"
        >
          {/* Left edge vertical text */}
          <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center">
            <div
              className="text-[10px] font-bold text-black writing-vertical-rl transform rotate-180 [writing-mode:vertical-rl] [text-orientation:mixed]"
            >
              morbius.io
            </div>
          </div>

          <div className="ml-6 mr-2 py-3 px-3 flex flex-col min-h-full relative">
            {/* PL badge */}
            {plNumber !== 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 text-center whitespace-nowrap">
                <div className="text-xs font-black text-slate-900/50">Profit / Loss</div>
                <div
                  className={cn(
                    'text-sm font-black whitespace-nowrap',
                    isPositive ? 'text-green-700' : isNegative ? 'text-red-700' : 'text-black'
                  )}
                >
                  {plNumber.toFixed(4)} Morbius
                </div>
              </div>
            )}

            {/* Header / Branding */}
            <div className="text-center mb-2 mt-4">
              <h1 className="text-2xl font-black text-black tracking-tight">MORBIUS LOTTERY</h1>
            </div>

            {/* Ticket ID + badges */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-bold text-black border-black/30">
                  #{shortId}
                </Badge>
                {ticket.isFreeTicket && (
                  <Badge className="bg-green-500/20 text-green-700 border-green-600/30 text-[10px] font-bold">
                    FREE
                  </Badge>
                )}
              </div>
              {ticket.startRound && ticket.endRound && (
                <span className="text-[9px] font-bold text-black/70">
                  {ticket.startRound === ticket.endRound 
                    ? `Round ${ticket.startRound}`
                    : `Rounds ${ticket.startRound}-${ticket.endRound}`
                  }
                </span>
              )}
            </div>

            {/* Numbers */}
            <div className="mb-3">
              <div className="text-sm font-bold text-black mb-1">PICKS</div>
              <div className="text-sm font-bold text-black font-mono flex flex-wrap gap-1">
                {ticket.numbers.map((num, idx) => (
                  <span key={idx}>{Number(num).toString().padStart(2, '0')}</span>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dashed border-black my-2" />

            {/* Cost / info */}
            <div className="flex justify-between items-center text-xs font-bold text-black mb-2">
              <span>TICKET</span>
              <span>ROUND {ticket.roundHistory?.[0]?.roundId ?? '-'}</span>
              <span>Rounds: {roundsCovered}</span>
            </div>

            {/* Transaction Hash Link */}
            {ticket.transactionHash && (
              <div className="mt-2 mb-8">
                <a
                  href={`https://scan.pulsechain.box/tx/${ticket.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[9px] font-bold text-black/70 hover:text-purple-700 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>TX: {ticket.transactionHash.slice(0, 6)}...{ticket.transactionHash.slice(-4)}</span>
                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {/* Flip hint */}
            <div className="absolute bottom-4 right-4 text-black/40 text-xs flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              <span className="font-bold">FLIP</span>
            </div>
          </div>

          {/* Right edge vertical text */}
          <div className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center">
            <div
              className="text-[8px] font-semibold text-black writing-vertical-rl [writing-mode:vertical-rl] [text-orientation:mixed]"
            >
              morbius.io
            </div>
          </div>
        </div>

        {/* Back of ticket */}
        <div
          className="absolute inset-0 w-full border border-black overflow-hidden rounded-lg shadow-md [backface-visibility:hidden] [transform-style:preserve-3d] [transform:rotateY(180deg)] bg-amber-50 bg-[url('/morbius/c718c298-363d-45d3-82bd-e51837b459cb.png')] bg-cover bg-center"
        >
          <div className="p-4 h-full overflow-y-auto text-black">
            <div className="text-center mb-3">
              <h2 className="text-lg font-black mb-1">TICKET DETAILS</h2>
              <p className="text-[10px] font-bold">MORBIUS LOTTERY</p>
            </div>

            {/* Payout table */}
            <div className="border-t-2 border-black pt-3 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black">PAYOUT TABLE</h3>
                <span className="text-[10px] font-bold">Matches</span>
              </div>
              <div className="space-y-1">
                {PAYOUT_TABLE.map((row) => (
                  <div key={row.matches} className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="font-mono">{row.matches} matches</div>
                    <div className="text-right font-bold">{row.percentage}% of winners pool</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Round history (if present) */}
            {ticket.roundHistory && ticket.roundHistory.length > 0 && (
              <div className="border-t-2 border-black pt-3 mt-3 space-y-2">
                <h3 className="text-sm font-black">RECENT ROUNDS</h3>
                <div className="space-y-1">
                  {ticket.roundHistory.slice(0, 5).map((round) => (
                    <div key={round.roundId} className="space-y-1 rounded-md border border-black/10 bg-black/5 p-2">
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <span>Round #{round.roundId}</span>
                        <span className="text-right font-bold">
                          {round.matches} hits · {formatMorbius(round.payout)} Morbius
                        </span>
                      </div>
                      {round.winningNumbers.length === 6 && (
                        <div className="flex flex-wrap gap-1 text-[10px] font-bold text-black/80">
                          {round.winningNumbers.map((n, idx) => (
                            <span key={idx} className="px-1 py-[2px] rounded bg-black/10">
                              {n.toString().padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="absolute bottom-4 right-4 text-black/40 text-xs flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            <span className="font-bold">FLIP</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TicketList({ tickets, roundId, isLoading = false, isConnected }: TicketListProps) {
  return (
    <Card className="p-6 bg-black/40 border-white/10 min-h-[520px]">
      <div className="flex items-center gap-2 mb-4">
        <Ticket className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Your Tickets (Round #{roundId || '-'})</h3>
      </div>

      {!isConnected ? (
        <p className="text-sm text-muted-foreground">Connect your wallet to see your tickets.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your tickets...
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets purchased yet for this round.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[760px] overflow-auto pr-1">
          {tickets.map((t) => (
            <FlippableTicket key={t.ticketId.toString()} ticket={t} />
          ))}
        </div>
      )}
    </Card>
  )
}
