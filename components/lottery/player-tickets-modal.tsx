'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Receipt, Loader2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { TICKET_PRICE, TOKEN_DECIMALS } from '@/lib/contracts'
import { useAccount } from 'wagmi'
import { useLotteryTicketRoundHistory } from '@/hooks/use-lottery-ticket-round-history'
import { useMultiRoundPurchases, getRoundRangeForTx } from '@/hooks/use-multi-round-purchases'
import { useState, useEffect } from 'react'
import { LotteryTicket } from './lottery-ticket'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type EnrichedTicket = {
  ticketId: bigint | number
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
  roundsPurchased: number
  startRound: number
  endRound: number
  transactionHash?: string
  roundHistory?: Array<{
    roundId: number
    matches: number
    payout: bigint
    winningNumbers: number[]
  }>
}

interface PlayerTicketsModalProps {
  roundId?: number | bigint
  playerTickets?: Array<{
    ticketId: bigint | number
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
    transactionHash?: string
    startRound?: number
    endRound?: number
  }>
}

// Wrapper component that fetches round history for a lottery ticket
function LotteryTicketWithHistory({
  ticket,
  index,
}: {
  ticket: EnrichedTicket
  index: number
}) {
  const ticketForHook = {
    numbers: ticket.numbers,
    startRound: ticket.startRound,
    endRound: ticket.endRound,
  }

  const { roundHistory, isLoading } = useLotteryTicketRoundHistory(ticketForHook)

  return (
    <LotteryTicket
      ticketId={ticket.ticketId}
      numbers={ticket.numbers}
      isFreeTicket={ticket.isFreeTicket}
      rounds={ticket.roundsPurchased}
      startRound={ticket.startRound}
      endRound={ticket.endRound}
      roundHistory={roundHistory}
      index={index}
      ticketPrice={TICKET_PRICE}
      transactionHash={ticket.transactionHash}
    />
  )
}

export function PlayerTicketsModal({ roundId, playerTickets = [] }: PlayerTicketsModalProps) {
  const { address } = useAccount()
  const [enrichedTickets, setEnrichedTickets] = useState<EnrichedTicket[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ticketsPerPage = 10

  // Fetch multi-round purchase data to get actual round ranges
  const { purchases: multiRoundPurchases } = useMultiRoundPurchases(address)

  // Process tickets to add round information
  useEffect(() => {
    if (!playerTickets.length) {
      setEnrichedTickets([])
      return
    }

    setIsProcessing(true)

    // Convert to PlayerTicket format with round information
    const currentRoundNum = Number(roundId)

    // Enrich tickets with multi-round purchase data if available
    const processed: EnrichedTicket[] = playerTickets.map(ticket => {
      // Use existing round data if already provided (from page.tsx), otherwise look it up
      let startRound: number
      let endRound: number

      if (ticket.startRound !== undefined && ticket.endRound !== undefined) {
        // Round data already provided
        startRound = ticket.startRound
        endRound = ticket.endRound
      } else {
        // Try to get round range from multi-round purchase data
        const roundRange = getRoundRangeForTx(ticket.transactionHash, multiRoundPurchases)
        startRound = roundRange?.startRound ?? currentRoundNum
        endRound = roundRange?.endRound ?? currentRoundNum
      }

      const roundsPurchased = endRound - startRound + 1

      console.log('🎫 Processing ticket:', {
        ticketId: ticket.ticketId.toString(),
        txHash: ticket.transactionHash?.slice(0, 10) + '...',
        startRound,
        endRound,
        roundsPurchased,
        multiRoundPurchasesCount: multiRoundPurchases.length
      })

      return {
        ticketId: ticket.ticketId,
        numbers: ticket.numbers,
        isFreeTicket: ticket.isFreeTicket,
        roundsPurchased,
        startRound,
        endRound,
        transactionHash: ticket.transactionHash,
        roundHistory: [], // Will be populated by individual ticket hooks
      }
    })

    // Sort tickets: non-expired tickets first (endRound >= current round), then by most recent endRound
    const sorted = processed.sort((a, b) => {
      // Non-expired tickets get highest priority (still valid for future/current rounds)
      const aIsActive = a.endRound >= currentRoundNum
      const bIsActive = b.endRound >= currentRoundNum

      if (aIsActive && !bIsActive) return -1  // Active tickets first
      if (!aIsActive && bIsActive) return 1   // Active tickets first

      // Within active/inactive groups, sort by most recent endRound (highest first)
      return b.endRound - a.endRound
    })

    setEnrichedTickets(sorted)
    setIsProcessing(false)
  }, [playerTickets, roundId, multiRoundPurchases])

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  // Pagination calculations
  const totalPages = Math.ceil(enrichedTickets.length / ticketsPerPage)
  const startIndex = (currentPage - 1) * ticketsPerPage
  const endIndex = startIndex + ticketsPerPage
  const currentTickets = enrichedTickets.slice(startIndex, endIndex)

  // Reset to first page when tickets change
  useEffect(() => {
    setCurrentPage(1)
  }, [enrichedTickets.length])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0" title="Your Tickets">
          <Receipt className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/95 border-white/20 text-white max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-white text-center">
            Your Tickets {enrichedTickets.length > 0 && `(${enrichedTickets.length})`}
          </DialogTitle>
          {roundId !== undefined && (
            <DialogDescription className="text-white/60 text-center text-sm break-words">
              Round #{Number(roundId)} • {enrichedTickets.length} ticket{enrichedTickets.length !== 1 ? 's' : ''} • Click tickets to flip
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-4">
          {!address ? (
            <div className="text-center py-12 text-white/60 text-sm">
              <p>Connect your wallet to view your tickets</p>
            </div>
          ) : isProcessing ? (
            <div className="flex items-center justify-center py-12 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span>Loading your tickets...</span>
            </div>
          ) : enrichedTickets.length === 0 ? (
            <div className="text-center py-12 text-white/60 text-sm">
              <p>No tickets purchased for this round</p>
            </div>
          ) : (
            <>
              {/* Grid layout for tickets - 2 wide on desktop, 1 wide on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 max-h-[60vh] overflow-y-auto">
                {currentTickets.map((ticket, idx) => {
                  const globalIndex = startIndex + idx
                  return (
                    <div key={ticket.ticketId.toString()} className="flex flex-col items-center">
                      {/* Ticket indicator */}
                      <div className="text-center text-white/60 text-xs sm:text-sm mb-2 w-full">
                        Ticket {globalIndex + 1} of {enrichedTickets.length}
                      </div>
                      {/* Ticket component - scalable to fit grid */}
                      <div className="w-full max-w-[320px] mx-auto">
                        <LotteryTicketWithHistory
                          ticket={ticket}
                          index={globalIndex}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mb-4 px-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="text-white bg-slate-900 border-white/10 hover:bg-black/60 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <span className="text-white/40 text-xs">
                      ({startIndex + 1}-{Math.min(endIndex, enrichedTickets.length)} of {enrichedTickets.length})
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="text-white bg-slate-900 border-white/10 hover:bg-black/60 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
              
              {/* Total summary - always shows full ticket count and cost */}
              <div className="border-t border-white/10 pt-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold">Total Cost:</span>
                  <span className="font-bold text-base">
                    {formatPssh(
                      BigInt(enrichedTickets.filter(t => !t.isFreeTicket).length) * TICKET_PRICE
                    )}{' '}
                    <span className="text-white/60 text-xs">Morbius</span>
                  </span>
                </div>
                <div className="text-[11px] text-white/60 mt-1 text-right">
                  {enrichedTickets.length} ticket{enrichedTickets.length !== 1 ? 's' : ''} purchased
                  {enrichedTickets.filter(t => t.isFreeTicket).length > 0 && (
                    <span className="ml-1">
                      ({enrichedTickets.filter(t => t.isFreeTicket).length} free)
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}






