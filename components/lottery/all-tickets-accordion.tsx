'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { useAllPlayerTickets } from '@/hooks/use-all-player-tickets'
import { useAccount } from 'wagmi'
import { LotteryTicket } from './lottery-ticket'
import { useLotteryTicketRoundHistory } from '@/hooks/use-lottery-ticket-round-history'
import { TICKET_PRICE } from '@/lib/contracts'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMultiRoundPurchases, getRoundRangeForTx } from '@/hooks/use-multi-round-purchases'
import { useMemo, useState, useEffect } from 'react'

type GroupedTicket = {
  ticketId: bigint
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
  startRound: number
  endRound: number
  rounds: number
  transactionHash: string
  purchaseTimestamp: number
  isActive: boolean
}

// Wrapper component that fetches round history for a lottery ticket
function LotteryTicketWithHistory({
  ticket,
  index,
}: {
  ticket: GroupedTicket
  index: number
}) {
  const ticketForHook = {
    numbers: ticket.numbers,
    startRound: ticket.startRound,
    endRound: ticket.endRound,
  }

  const { roundHistory } = useLotteryTicketRoundHistory(ticketForHook)

  return (
    <LotteryTicket
      ticketId={ticket.ticketId}
      numbers={ticket.numbers}
      isFreeTicket={ticket.isFreeTicket}
      rounds={ticket.rounds}
      startRound={ticket.startRound}
      endRound={ticket.endRound}
      roundHistory={roundHistory}
      index={index}
      ticketPrice={TICKET_PRICE}
      transactionHash={ticket.transactionHash}
      purchaseTimestamp={ticket.purchaseTimestamp}
      isActive={ticket.isActive}
    />
  )
}

export function AllTicketsAccordion() {
  const { address } = useAccount()
  const { tickets, isLoading, roundsParticipated } = useAllPlayerTickets()
  const { purchases: multiRoundPurchases } = useMultiRoundPurchases(address)
  const [currentPage, setCurrentPage] = useState(1)
  const ticketsPerPage = 10

  // Group tickets by transaction hash to combine multi-round purchases into single display
  const groupedTickets = useMemo(() => {
    // Group tickets by transaction hash
    const ticketGroups = new Map<string, typeof tickets>()

    tickets.forEach(ticket => {
      const txHash = ticket.transactionHash || 'unknown'
      if (!ticketGroups.has(txHash)) {
        ticketGroups.set(txHash, [])
      }
      ticketGroups.get(txHash)!.push(ticket)
    })

    // Convert groups to single ticket entries with round ranges
    const grouped: GroupedTicket[] = []

    ticketGroups.forEach((ticketsInGroup, txHash) => {
      // Try to get round range from multi-round purchase data
      const roundRange = getRoundRangeForTx(txHash, multiRoundPurchases)

      if (roundRange) {
        // Multi-round purchase - show as single ticket with round range
        const firstTicket = ticketsInGroup[0]
        grouped.push({
          ticketId: firstTicket.ticketId,
          numbers: firstTicket.numbers,
          isFreeTicket: firstTicket.isFreeTicket,
          startRound: roundRange.startRound,
          endRound: roundRange.endRound,
          rounds: roundRange.endRound - roundRange.startRound + 1,
          transactionHash: firstTicket.transactionHash,
          purchaseTimestamp: firstTicket.purchaseTimestamp,
          isActive: firstTicket.isActive,
        })
      } else {
        // Single-round tickets or couldn't find multi-round data - show each separately
        ticketsInGroup.forEach(ticket => {
          grouped.push({
            ticketId: ticket.ticketId,
            numbers: ticket.numbers,
            isFreeTicket: ticket.isFreeTicket,
            startRound: ticket.roundId,
            endRound: ticket.roundId,
            rounds: 1,
            transactionHash: ticket.transactionHash,
            purchaseTimestamp: ticket.purchaseTimestamp,
            isActive: ticket.isActive,
          })
        })
      }
    })

    // Sort by most recent startRound first
    return grouped.sort((a, b) => b.startRound - a.startRound)
  }, [tickets, multiRoundPurchases])

  // Pagination calculations
  const totalPages = Math.ceil(groupedTickets.length / ticketsPerPage)
  const startIndex = (currentPage - 1) * ticketsPerPage
  const endIndex = startIndex + ticketsPerPage
  const currentTickets = groupedTickets.slice(startIndex, endIndex)

  // Reset to first page when tickets change
  useEffect(() => {
    setCurrentPage(1)
  }, [groupedTickets.length])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="my-tickets" className="border-white/10">
        <AccordionTrigger className="text-white hover:text-emerald-400 px-6">
          <div className="flex items-center justify-between w-full mr-4">
            <p className="text-sm text-gray-300">My Purchased Tickets</p>
            {isLoading && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span className="text-xs text-gray-400">Loading...</span>
              </div>
            )}
            {!isLoading && groupedTickets.length > 0 && (
              <span className="text-xs text-gray-400 bg-white/10 px-2 py-1 rounded">
                {groupedTickets.length} ticket{groupedTickets.length !== 1 ? 's' : ''} • {roundsParticipated.length} round{roundsParticipated.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="text-gray-300 px-6 pb-6">
          <div className="mt-3">
            {!address ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-4 py-6 text-center">
                <p className="text-sm text-gray-400">Connect your wallet to view your tickets.</p>
              </div>
            ) : !isLoading && groupedTickets.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-4 py-6 text-center">
                <p className="text-sm text-gray-400">No purchased tickets found for this wallet.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center max-h-[60vh] overflow-y-auto">
                  {currentTickets.map((ticket, idx) => {
                    const globalIndex = startIndex + idx
                    return (
                      <LotteryTicketWithHistory
                        key={`${ticket.ticketId}-${ticket.startRound}`}
                        ticket={ticket}
                        index={globalIndex}
                      />
                    )
                  })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 px-2">
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
                        ({startIndex + 1}-{Math.min(endIndex, groupedTickets.length)} of {groupedTickets.length})
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
              </>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
