"use client"

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { KenoTicketBarcode } from '../CryptoKeno/keno-ticket-barcode'
import { RotateCcw } from 'lucide-react'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'

interface RoundHistory {
  roundId: number
  matches: number
  payout: bigint
  winningNumbers: number[]
}

interface LotteryTicketProps {
  ticketId: bigint | number
  numbers: readonly (number | bigint)[]
  isFreeTicket: boolean
  rounds: number
  roundsRemaining?: number
  startRound: number
  endRound: number
  isActive?: boolean
  currentWin?: bigint
  purchaseTimestamp?: number
  index?: number
  roundHistory?: RoundHistory[]
  ticketPrice?: bigint
  transactionHash?: string
}

// Lottery payout brackets
const PAYOUT_TABLE = [
  { matches: 6, percentage: 25, description: 'Jackpot' },
  { matches: 5, percentage: 10, description: '5 Numbers' },
  { matches: 4, percentage: 8, description: '4 Numbers' },
  { matches: 3, percentage: 6, description: '3 Numbers' },
  { matches: 2, percentage: 4, description: '2 Numbers' },
  { matches: 1, percentage: 2, description: '1 Number' },
]

export function LotteryTicket({
  ticketId,
  numbers,
  isFreeTicket,
  rounds,
  roundsRemaining,
  startRound,
  endRound,
  isActive = true,
  currentWin = BigInt(0),
  purchaseTimestamp,
  index = 0,
  roundHistory = [],
  transactionHash,
  ticketPrice = BigInt(100_000_000_000_000_000_000), // 100 Morbius
}: LotteryTicketProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isFlipped, setIsFlipped] = useState(false)
  
  // Freeze timestamp at component mount - never update it
  const [frozenTimestamp] = useState(() => purchaseTimestamp || Date.now())

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRevealed(true)
    }, index * 150)

    return () => clearTimeout(timer)
  }, [index])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    const day = days[date.getDay()]
    const month = months[date.getMonth()]
    const dateNum = date.getDate()
    const year = date.getFullYear().toString().slice(-2)
    return { day, month, date: dateNum, year, full: `${day} ${month}${dateNum} ${year}` }
  }

  const dateInfo = formatDate(frozenTimestamp)
  const purchaseDate = new Date(frozenTimestamp)
  const printTime = purchaseDate.toLocaleTimeString('en-US', { 
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).toUpperCase()

  const ticketIdStr = ticketId.toString()
  const shortId = ticketIdStr.length > 6 ? ticketIdStr.slice(-6) : ticketIdStr.padStart(6, '0')
  const secondaryId = (BigInt(ticketId) * BigInt(7919)).toString().slice(-7)

  const formatMorbius = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    })

  // Calculate total cost
  const totalCost = isFreeTicket ? BigInt(0) : ticketPrice * BigInt(rounds)
  const totalCostNum = Number(formatUnits(totalCost, TOKEN_DECIMALS))

  // Calculate P/L
  const currentWinNum = Number(formatUnits(currentWin, TOKEN_DECIMALS))
  const pl = currentWinNum - totalCostNum
  const isPositive = pl > 0
  const isNegative = pl < 0

  const ticketBackground = {
    backgroundImage: "url('/morbius/c718c298-363d-45d3-82bd-e51837b459cb.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }

  return (
    <div
      className="relative w-full max-w-[min(100%,280px)] sm:max-w-sm md:max-w-md mx-auto my-4 px-1"
      style={{ perspective: '1000px' }}
    >
      <div
        className={cn(
          "relative w-full transition-all duration-1000 ease-out cursor-pointer",
          isRevealed
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-8 scale-95"
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transitionDuration: '500ms',
        }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
      {/* Front of ticket */}
      <div
        className="lottery-ticket relative w-full border border-black overflow-hidden"
        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', ...ticketBackground }}
      >
      {/* Left edge vertical text */}
      <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-6 flex items-center justify-center">
        <div
          className="text-[8px] sm:text-[10px] font-bold text-black writing-vertical-rl transform rotate-180"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          morbius.io
        </div>
      </div>

      {/* Main content */}
      <div className="ml-4 sm:ml-6 mr-1 sm:mr-2 py-2 sm:py-3 px-2 sm:px-3 flex flex-col min-h-full">
        {/* Top Section - P/L badge and Print Info */}
        <div className="text-center mb-2 relative">
          {pl !== 0 && (
            <>
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 text-center whitespace-nowrap">
                <div className="text-sm font-black text-slate-900/50">Profit and Loss</div>
                <div
                  className={cn(
                    "text-sm font-black whitespace-nowrap",
                    isPositive ? "text-green-700" : isNegative ? "text-red-700" : "text-black"
                  )}
                >
                  {pl.toFixed(4)} Morbius
                </div>
              </div>
              <div className="w-full border-b border-black/30 my-4" />
            </>
          )}
          {/* Morbius Lottery Logo */}
          <div className="mb-2">
            <h1 className="text-2xl font-black text-black tracking-tight">
              MORBIUS LOTTERY
            </h1>
          </div>
          
          {/* Print Timestamp */}
          <div className="text-[10px] font-bold text-black">
            PRINTED {dateInfo.month}{dateInfo.date.toString().padStart(2, '0')} {dateInfo.year} {printTime}
          </div>
        </div>

        {/* Promotional Text */}
        <div className="text-[9px] font-bold text-black text-center mb-2 leading-tight">
          <div>AMAZING THINGS HAPPEN WHEN A LOT OF</div>
          <div>PEOPLE PLAY MORBIUS - IT'S MORBIN TIME!</div>
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Game Section - Lottery */}
        <div className="mb-2">
          {/* Game Type and Numbers */}
          <div className="flex items-start justify-between mb-1 gap-2">
            <div className="flex-1">
              <div className="text-sm font-bold text-black mb-1 flex items-center gap-2">
                PICK 6
                {isFreeTicket && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-700 border border-green-500/30">
                    FREE
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-black font-mono flex flex-wrap gap-1">
                {Array.from(numbers).map((num, idx) => (
                  <span key={idx}>{Number(num).toString().padStart(2, '0')}</span>
                ))}
              </div>
            </div>
            <span className="text-[10px] font-bold text-black">EP</span>
          </div>
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Cost Details */}
        <div className="flex justify-between items-center text-xs font-bold text-black mb-2">
          <span>{rounds} ROUND{rounds > 1 ? 'S' : ''}</span>
          <span>{isFreeTicket ? 'FREE' : `${formatMorbius(ticketPrice)} MORBIUS/ROUND`}</span>
          <span>{isFreeTicket ? '0.0000' : formatMorbius(totalCost)} MORBIUS</span>
        </div>

        {/* Bottom Section - Totals and Info */}
        <div className="space-y-1 text-[10px] text-black">
          {/* Total Cost */}
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>{isFreeTicket ? '0.0000' : formatMorbius(totalCost)} MORBIUS</span>
          </div>

          {/* Round Numbers */}
          <div className="text-[10px]">
            ROUND NUMBER {startRound} - {endRound}
          </div>

          {/* Transaction hash link */}
          {transactionHash && (
            <div className="text-[9px] font-bold text-black">
              <a
                href={`https://scan.pulsechain.box/tx/${transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-purple-700"
                onClick={(e) => e.stopPropagation()}
              >
                TX: {transactionHash.slice(0, 6)}...{transactionHash.slice(-4)}
              </a>
            </div>
          )}

          {/* Timestamp/Serial */}
          <div className="text-[9px] font-mono">
            {shortId}{secondaryId.slice(0, 2)} {dateInfo.month}{dateInfo.date.toString().padStart(2, '0')} {dateInfo.year} {printTime} {secondaryId}
          </div>
        </div>

        {/* Barcode - Moved to bottom */}
        <div className="mt-auto pt-2 border-t border-black">
          <KenoTicketBarcode value={ticketIdStr} />
        </div>
      </div>

      {/* Right edge vertical text */}
      <div className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center">
        <div
          className="text-[8px] font-semibold text-black writing-vertical-rl"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          morbius.io
        </div>
      </div>

      {/* Flip hint - Bottom Right */}
      <div className="absolute bottom-4 right-4 text-black/40 text-xs flex items-center gap-1">
        <RotateCcw className="h-3 w-3" />
        <span className="font-bold">FLIP</span>
      </div>

      {/* Status overlay for expired tickets */}
      {!isActive && (
        <div className="absolute inset-0 bg-amber-50/80 flex items-center justify-center">
          <div className="transform -rotate-12 bg-black text-white px-8 py-2 font-black text-xl tracking-wider">
            EXPIRED
          </div>
        </div>
      )}
      </div>

      {/* Back of ticket */}
      <div
        className="absolute inset-0 w-full border border-black overflow-hidden"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          ...ticketBackground,
        }}
      >
        {/* White overlay for better text readability */}
        <div className="absolute inset-0 bg-white/70" />
        
        <div className="p-4 h-full overflow-y-auto relative z-10">
          {/* Header */}
          <div className="text-center mb-3">
            <h2 className="text-lg font-black text-black mb-1">TICKET HISTORY</h2>
            <p className="text-xs font-bold text-black">PICK 6 GAME</p>
          </div>

          {/* Round History Table */}
          {roundHistory && roundHistory.length > 0 ? (
            <div className="space-y-1 mb-4">
              <div className="grid grid-cols-4 gap-1 text-[9px] sm:text-[10px] font-bold text-black border-b-2 border-black pb-1">
                <div>ROUND</div>
                <div>MATCHES</div>
                <div className="text-right">PAYOUT</div>
                <div className="text-right">NUMBERS</div>
              </div>
              {roundHistory.map((round) => (
                <div key={round.roundId} className="grid grid-cols-4 gap-1 text-[9px] sm:text-[10px] text-black border-b border-black/20 py-1">
                  <div className="font-mono font-bold">#{round.roundId}</div>
                  <div
                    className={cn(
                      "font-bold",
                      round.matches > 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {round.matches} of 6
                  </div>
                  <div className={cn(
                    "text-right font-mono font-bold",
                    round.payout > 0 ? "text-green-600" : "text-black"
                  )}>
                    {formatMorbius(round.payout)}
                  </div>
                  <div className="text-right font-mono text-[9px] font-semibold">
                    {round.winningNumbers.length > 0 ? (
                      round.winningNumbers.map(n => n.toString().padStart(2, '0')).join(' ')
                    ) : (
                      <span className="text-black/50">NONE</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-black border-t-2 border-black pt-1">
                <div>Total</div>
                <div />
                <div className={cn(
                  "text-right font-mono",
                  roundHistory.reduce((acc, r) => acc + Number(formatUnits(r.payout, TOKEN_DECIMALS)), 0) > 0
                    ? "text-green-600"
                    : "text-black"
                )}>
                  {roundHistory.reduce((acc, r) => acc + Number(formatUnits(r.payout, TOKEN_DECIMALS)), 0).toFixed(4)}
                </div>
                <div />
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-black/70 mb-2">No rounds completed yet</p>
            </div>
          )}

          {/* Payout Table */}
          <div className="border-t-2 border-black pt-3 mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-black">PAYOUT TABLE</h3>
              <span className="text-[10px] font-bold text-black">Pick 6</span>
            </div>
            <div className="space-y-1">
              {PAYOUT_TABLE.map((row) => (
                <div key={row.matches} className="grid grid-cols-2 gap-2 text-[10px] text-black">
                  <div className="font-mono font-semibold">{row.matches} of 6</div>
                  <div className="text-right font-bold">{row.percentage}% of winners pool</div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Win Display */}
          {currentWin > 0 && (
            <div className="border-t-2 border-black pt-3 mt-3">
              <div className="text-center">
                <p className="text-xs font-bold text-black mb-1">CURRENT WIN</p>
                <p className="text-xl font-black text-green-600">{formatMorbius(currentWin)} MORBIUS</p>
              </div>
            </div>
          )}

          {/* Flip hint */}
          <div className="absolute bottom-4 right-4 text-black/50 text-xs flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            <span className="font-bold">FLIP</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}






