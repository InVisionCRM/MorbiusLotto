'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Receipt, Loader2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { TICKET_PRICE, TOKEN_DECIMALS } from '@/lib/contracts'
import { useAccount } from 'wagmi'
import { useLotteryTicketRoundHistory } from '@/hooks/use-lottery-ticket-round-history'
import { useState, useEffect } from 'react'
import { LotteryTicket } from './lottery-ticket'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'

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
  

  // Process tickets to add round information
  useEffect(() => {
    if (!playerTickets.length) {
      setEnrichedTickets([])
      return
    }

    setIsProcessing(true)

    // Convert to PlayerTicket format with round information
    // Tickets fetched for current round are valid for that round
    const currentRoundNum = Number(roundId)

    // NOTE: Each ticket returned from getPlayerTickets is for a SPECIFIC round
    // If user bought a 5-round ticket, the contract creates 5 separate tickets (one per round)
    // So roundsPurchased is always 1 per ticket, and start/end round are the same
    const processed: EnrichedTicket[] = playerTickets.map(ticket => ({
      ticketId: ticket.ticketId,
      numbers: ticket.numbers,
      isFreeTicket: ticket.isFreeTicket,
      roundsPurchased: 1, // Always 1 - each ticket is per-round
      startRound: currentRoundNum,
      endRound: currentRoundNum,
      transactionHash: ticket.transactionHash,
      roundHistory: [], // Will be populated by individual ticket hooks
    }))

    setEnrichedTickets(processed)
    setIsProcessing(false)
  }, [playerTickets, roundId])

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0" title="Your Tickets">
          <Receipt className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/95 border-white/20 text-white max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-center">
            Your Tickets {enrichedTickets.length > 0 && `(${enrichedTickets.length})`}
          </DialogTitle>
          {roundId !== undefined && (
            <DialogDescription className="text-white/60 text-center">
              Round #{Number(roundId)} • {enrichedTickets.length} ticket{enrichedTickets.length !== 1 ? 's' : ''} • Click ticket to flip
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
              {/* Carousel for tickets - centered single view */}
              <Carousel
                opts={{
                  align: "center",
                  loop: true,
                }}
                className="w-full mx-auto mb-6"
              >
                <CarouselContent>
                  {enrichedTickets.map((ticket, idx) => (
                    <CarouselItem key={ticket.ticketId.toString()}>
                      {/* Current ticket indicator */}
                      <div className="text-center text-white/60 text-xs sm:text-sm mb-2">
                        Ticket {idx + 1} of {enrichedTickets.length}
                      </div>
                      <div className="flex items-center justify-center">
                        <LotteryTicketWithHistory
                          ticket={ticket}
                          index={idx}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="bg-slate-800/90 border-white/20 text-white hover:bg-slate-700 h-10 w-10 sm:h-12 sm:w-12" />
                <CarouselNext className="bg-slate-800/90 border-white/20 text-white hover:bg-slate-700 h-10 w-10 sm:h-12 sm:w-12" />
              </Carousel>
              
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






