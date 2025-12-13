'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useAllPlayerTickets } from '@/hooks/use-all-player-tickets'
import { useAccount } from 'wagmi'
import { LotteryTicket } from './lottery-ticket'
import { useLotteryTicketRoundHistory } from '@/hooks/use-lottery-ticket-round-history'
import { TICKET_PRICE } from '@/lib/contracts'
import { Loader2 } from 'lucide-react'

// Wrapper component that fetches round history for a lottery ticket
function LotteryTicketWithHistory({
  ticket,
  index,
}: {
  ticket: {
    ticketId: bigint
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
    roundId: number
    transactionHash: string
    purchaseTimestamp: number
    isActive: boolean
  }
  index: number
}) {
  const ticketForHook = {
    numbers: ticket.numbers,
    startRound: ticket.roundId,
    endRound: ticket.roundId,
  }

  const { roundHistory } = useLotteryTicketRoundHistory(ticketForHook)

  return (
    <LotteryTicket
      ticketId={ticket.ticketId}
      numbers={ticket.numbers}
      isFreeTicket={ticket.isFreeTicket}
      rounds={1}
      startRound={ticket.roundId}
      endRound={ticket.roundId}
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
            {!isLoading && tickets.length > 0 && (
              <span className="text-xs text-gray-400 bg-white/10 px-2 py-1 rounded">
                {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} • {roundsParticipated.length} round{roundsParticipated.length !== 1 ? 's' : ''}
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
            ) : !isLoading && tickets.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-4 py-6 text-center">
                <p className="text-sm text-gray-400">No purchased tickets found for this wallet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                {tickets.map((ticket, idx) => (
                  <LotteryTicketWithHistory
                    key={`${ticket.ticketId}-${ticket.roundId}`}
                    ticket={ticket}
                    index={idx}
                  />
                ))}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
