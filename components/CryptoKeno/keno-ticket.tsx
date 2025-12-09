"use client"

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { KenoTicketBarcode } from './keno-ticket-barcode'
import { RotateCcw } from 'lucide-react'

interface RoundHistory {
  roundId: number
  winningNumbers: number[]
  matchedNumbers: number[]
  matchCount: number
  roundWin?: number
  roundPL?: number
}

interface KenoTicketProps {
  ticketId: bigint
  numbers: number[]
  spotSize: number
  wager: string
  draws: number
  drawsRemaining: number
  firstRoundId: bigint
  roundTo: number
  addons: {
    multiplier: boolean
    bullsEye: boolean
    plus3: boolean
    progressive?: boolean
  }
  isActive: boolean
  currentWin: string
  purchaseTimestamp?: number
  index?: number
  roundHistory?: RoundHistory[]
  multiplierCostWei?: bigint
  bullsEyeCostWei?: bigint
  progressiveCostWei?: bigint
  paytableRow?: number[]
  bullsEyeRow?: number[]
}

// Keno payout tables
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 2: 11 },
  3: { 2: 2, 3: 27 },
  4: { 2: 1, 3: 5, 4: 72 },
  5: { 3: 2, 4: 18, 5: 410 },
  6: { 3: 1, 4: 7, 5: 57, 6: 1100 },
  7: { 3: 1, 4: 5, 5: 11, 6: 100, 7: 2000 },
  8: { 4: 2, 5: 15, 6: 50, 7: 300, 8: 10000 },
  9: { 4: 2, 5: 5, 6: 20, 7: 100, 8: 2000, 9: 25000 },
  10: { 0: 5, 5: 2, 6: 10, 7: 50, 8: 500, 9: 5000, 10: 100000 },
}

export function KenoTicket({
  ticketId,
  numbers,
  spotSize,
  wager,
  draws,
  drawsRemaining,
  firstRoundId,
  roundTo,
  addons,
  isActive,
  currentWin,
  purchaseTimestamp,
  index = 0,
  roundHistory = [],
  multiplierCostWei = BigInt(0),
  bullsEyeCostWei = BigInt(0),
  progressiveCostWei = BigInt(0),
  paytableRow,
  bullsEyeRow,
}: KenoTicketProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showPaytable, setShowPaytable] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRevealed(true)
    }, index * 150)

    return () => clearTimeout(timer)
  }, [index])

  const formatDate = (timestamp?: number) => {
    const date = timestamp ? new Date(timestamp) : new Date()
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    const day = days[date.getDay()]
    const month = months[date.getMonth()]
    const dateNum = date.getDate()
    const year = date.getFullYear().toString().slice(-2)
    return { day, month, date: dateNum, year, full: `${day} ${month}${dateNum} ${year}` }
  }

  const dateInfo = formatDate(purchaseTimestamp)
  const purchaseDate = purchaseTimestamp ? new Date(purchaseTimestamp) : new Date()
  const printTime = purchaseDate.toLocaleTimeString('en-US', { 
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).toUpperCase()

  const ticketIdStr = ticketId.toString()
  const shortId = ticketIdStr.length > 6 ? ticketIdStr.slice(-6) : ticketIdStr.padStart(6, '0')
  const secondaryId = (BigInt(ticketId) * BigInt(7919)).toString().slice(-7)

  // Calculate total cost
  const totalCost = Number(wager) * draws

  // Add-on cost per draw (approx based on provided costs)
  const addonCostPerDraw =
    (addons.multiplier ? Number(multiplierCostWei ?? 0) / 1e18 : 0) +
    (addons.bullsEye ? Number(bullsEyeCostWei ?? 0) / 1e18 : 0) +
    (addons.plus3 ? Number(wager) : 0) +
    (addons.progressive ? Number(progressiveCostWei ?? 0) / 1e18 : 0)

  // Get add-on labels
  const getAddonLabels = () => {
    const labels: string[] = []
    if (addons.multiplier) labels.push('KICKER')
    if (addons.bullsEye) labels.push('BULLS-EYE')
    if (addons.plus3) labels.push('PLUS 3')
    return labels
  }

  const addonLabels = getAddonLabels()

  // Calculate P/L
  const currentWinNum = Number(currentWin)
  const totalCostNum = totalCost
  const pl = currentWinNum - totalCostNum
  const isPositive = pl > 0
  const isNegative = pl < 0

  // Get payout table for this spot size
  const payoutTable = PAYTABLE[spotSize] || {}
  const payoutEntries = Object.entries(payoutTable).sort((a, b) => Number(b[0]) - Number(a[0]))
  const ticketBackground = {
    backgroundImage: "url('/morbius/c718c298-363d-45d3-82bd-e51837b459cb.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }

  return (
    <div
      className="relative w-80 mx-auto my-4"
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
        className="keno-ticket relative w-80 border border-black overflow-hidden"
        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', ...ticketBackground }}
      >
      {/* Left edge vertical text */}
      <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center">
        <div 
          className="text-[10px] font-bold text-black writing-vertical-rl transform rotate-180"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          cryptokeno
        </div>
      </div>

      {/* Main content */}
      <div className="ml-6 mr-2 py-3 px-3 flex flex-col min-h-full">
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
                  {pl.toFixed(4)} WPLS
                </div>
              </div>
              <div className="w-full border-b border-black/30 my-4" />
            </>
          )}
          {/* Crypto Keno Logo */}
          <div className="mb-2">
            <h1 className="text-2xl font-black text-black tracking-tight">
              CRYPTO KENO
            </h1>
          </div>
          
          {/* Print Timestamp */}
          <div className="text-[10px] font-bold text-black">
            PRINTED {dateInfo.month}{dateInfo.date.toString().padStart(2, '0')} {dateInfo.year} {printTime}
          </div>
        </div>

        {/* Promotional Text */}
        <div className="text-[9px] font-bold text-black text-center mb-2 leading-tight">
          <div>PLAYING FROM ALL 50 STATES</div>
          <div>PULSECHAIN - #1 BLOCKCHAIN FOR DEFI GAMING!</div>
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Game Section - Club Keno */}
        <div className="mb-2">
          {/* Game Type and Numbers */}
          <div className="flex items-start justify-between mb-1 gap-2">
            <div className="flex-1">
              <div className="text-sm font-bold text-black mb-1">
                {spotSize}-SPOT
              </div>
              <div className="text-sm font-bold text-black font-mono flex flex-wrap gap-1">
                {numbers.map((num, idx) => (
                  <span key={idx}>{num.toString().padStart(2, '0')}</span>
                ))}
              </div>
            </div>
            <span className="text-[10px] font-bold text-black">EP</span>
          </div>

          {/* Add-ons */}
          {addonLabels.length > 0 && (
            <div className="text-sm font-bold text-black mb-1">
              {addonLabels.map((label, idx) => (
                <div key={idx}>{label} - YES</div>
              ))}
            </div>
          )}
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* PulseProgressive Section */}
        <div className="py-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-black text-black mb-1">
              PulseProgressive
            </div>
            <div className="text-[10px] font-bold text-black">
              JACKPOT
            </div>
          </div>
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Cost Details - Reduced font size */}
        <div className="flex justify-between items-center text-xs font-bold text-black mb-2">
          <span>{draws} DRAWS</span>
          <span>{Number(wager).toFixed(4)} WPLS/DRAW</span>
          <span>{totalCost.toFixed(4)} WPLS</span>
        </div>

        {/* Bottom Section - Totals and Info */}
        <div className="space-y-1 text-[10px] text-black">
          {/* Total Cost */}
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>{totalCost.toFixed(4)} WPLS</span>
          </div>

          {/* Draw Numbers */}
          <div className="text-[10px]">
            DRAW NUMBER {Number(firstRoundId)} - {Number(roundTo)}
          </div>

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
          cryptokeno.win
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
        className="absolute inset-0 w-80 border border-black overflow-hidden"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          ...ticketBackground,
        }}
      >
        <div className="p-4 h-full overflow-y-auto">
          {/* Header */}
          <div className="text-center mb-3">
            <h2 className="text-lg font-black text-black mb-1">TICKET HISTORY</h2>
            <p className="text-xs font-bold text-black">{spotSize}-SPOT GAME</p>
          </div>

          {/* Round History Table */}
          {roundHistory && roundHistory.length > 0 ? (
            <div className="space-y-1 mb-4">
              <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-black border-b-2 border-black pb-1">
                <div>ROUND</div>
                <div>HITS</div>
                <div className="text-right">P/L (WPLS)</div>
                <div className="text-right">NUMBERS</div>
              </div>
              {roundHistory.map((round) => (
                <div key={round.roundId} className="grid grid-cols-4 gap-1 text-[10px] text-black border-b border-black/20 py-1">
                  <div className="font-mono font-bold">#{round.roundId}</div>
                  <div
                    className={cn(
                      "font-bold",
                      round.matchCount > 0 ? "text-green-700" : "text-red-700"
                    )}
                  >
                    {round.matchCount} of {spotSize}
                  </div>
                  <div className={cn(
                    "text-right font-mono",
                    (round.roundPL ?? 0) > 0 ? "text-green-700" : (round.roundPL ?? 0) < 0 ? "text-red-700" : "text-black"
                  )}>
                    {(round.roundPL ?? 0).toFixed(4)}
                  </div>
                  <div className="text-right font-mono text-[9px]">
                    {round.matchedNumbers.length > 0 ? (
                      round.matchedNumbers.map(n => n.toString().padStart(2, '0')).join(' ')
                    ) : (
                      <span className="text-black/40">NONE</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-black border-t-2 border-black pt-1">
                <div>Total</div>
                <div />
                <div className={cn(
                  "text-right font-mono",
                  roundHistory.reduce((acc, r) => acc + (r.roundPL ?? 0), 0) > 0
                    ? "text-green-700"
                    : roundHistory.reduce((acc, r) => acc + (r.roundPL ?? 0), 0) < 0
                      ? "text-red-700"
                      : "text-black"
                )}>
                  {roundHistory.reduce((acc, r) => acc + (r.roundPL ?? 0), 0).toFixed(4)}
                </div>
                <div />
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-black/60 mb-2">No rounds completed yet</p>
            </div>
          )}

          {/* Payout Table */}
          <div className="border-t-2 border-black pt-3 mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-black">PAYOUT TABLE</h3>
              <span className="text-[10px] font-bold text-black">Spot {spotSize}</span>
            </div>
            <div className="space-y-1">
              {payoutEntries.map(([matches, payout]) => (
                <div key={matches} className="grid grid-cols-2 gap-2 text-[10px] text-black">
                  <div className="font-mono">{matches} of {spotSize}</div>
                  <div className="text-right font-bold">{payout}x</div>
                </div>
              ))}
            </div>
            {paytableRow && paytableRow.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-black">Contract Base Paytable</p>
                <p className="text-[9px] font-mono text-black break-words">
                  {paytableRow.join(', ')}
                </p>
              </div>
            )}
            {bullsEyeRow && bullsEyeRow.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-black">Contract Bulls-Eye Paytable</p>
                <p className="text-[9px] font-mono text-black break-words">
                  {bullsEyeRow.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Add-on cost per draw */}
          <div className="border-t-2 border-black pt-3 mt-3">
            <h3 className="text-sm font-black text-black mb-1">ADD-ON COST</h3>
            <p className="text-[10px] font-mono text-black">
              {addonCostPerDraw.toFixed(4)} WPLS per draw
            </p>
          </div>

          {/* Current Win Display */}
          {currentWinNum > 0 && (
            <div className="border-t-2 border-black pt-3 mt-3">
              <div className="text-center">
                <p className="text-xs font-bold text-black mb-1">CURRENT WIN</p>
                <p className="text-xl font-black text-black">{currentWinNum.toFixed(4)} WPLS</p>
              </div>
            </div>
          )}

          {/* Flip hint */}
          <div className="absolute bottom-4 right-4 text-black/40 text-xs flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            <span className="font-bold">FLIP</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
