'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatUnits } from 'viem'
import { ChevronDown, ChevronUp, Play } from 'lucide-react'
import { TOKEN_DECIMALS } from '@/lib/contracts'

interface RoundTimerProps {
  endTime: bigint
  fallbackRemaining?: bigint // optional timeRemaining from contract
  roundId?: number | bigint
  totalTickets?: number | bigint
  totalPssh?: bigint
  onViewLastDrawing?: () => void // Callback to open simulator
  hasLastDrawing?: boolean // Whether there's a last drawing to view
  previousRoundId?: number // Previous round ID for display
}

function formatSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function RoundTimer({ endTime, fallbackRemaining = BigInt(0), roundId, totalTickets, totalPssh, onViewLastDrawing, hasLastDrawing, previousRoundId }: RoundTimerProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    const fromEnd = Number(endTime) * 1000 - Date.now()
    if (!Number.isNaN(fromEnd) && fromEnd > 0) return Math.floor(fromEnd / 1000)
    return Number(fallbackRemaining)
  })
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const update = () => {
      const ms = Number(endTime) * 1000 - Date.now()
      if (!Number.isNaN(ms)) {
        setRemaining(Math.max(0, Math.floor(ms / 1000)))
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endTime])

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
    <Card className="p-8 bg-black/40 border-white/10 relative">
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
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <div className="text-sm text-white/60 mb-2">Time Remaining</div>
          <div className="text-6xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
            {formatSeconds(remaining)}
          </div>
        </div>
        {totalPssh !== undefined && (
          <div className="text-center mt-4 w-full">
            <div className="text-sm text-white/60 mb-1">Total Pool Amount</div>
            <div className="text-2xl font-bold text-white">
              {formatPssh(totalPssh)} <span className="text-sm text-white/60">Morbius</span>
            </div>
          </div>
        )}
        
        {/* View Last Drawing Button - Always Visible */}
        {onViewLastDrawing && (
          <div className="mt-4">
            <Button
              onClick={onViewLastDrawing}
              disabled={!hasLastDrawing}
              className="bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 text-white font-semibold px-6 py-2 rounded-full hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              View Last Drawing
            </Button>
          </div>
        )}
      </div>
      
      {/* Pool Split Dropdown */}
      {totalPssh !== undefined && split && (
        <>
          {isExpanded && (
            <div className="mt-4 mb-4 space-y-3 text-sm">
              {/* Winners Pool Section */}
              <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">Winners Pool</span>
                  <span className="text-white/80">60%</span>
                </div>
                <div className="text-white/60 mb-2">{formatPssh(BigInt(Math.floor(split.winnersPool)))} Morbius</div>
                <div className="space-y-1.5 pl-2 border-l-2 border-white/10">
                  {split.brackets.map((bracket) => (
                    <div key={bracket.id} className="flex items-center justify-between text-xs">
                      <span className="text-white/70">Match {bracket.id} ({bracket.percentage}%)</span>
                      <span className="text-white/60">{formatPssh(BigInt(Math.floor(bracket.amount)))} Morbius</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Burn Allocation */}
              <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Burn</span>
                  <span className="text-white/80">20%</span>
                </div>
                <div className="text-white/60 mt-1">{formatPssh(BigInt(Math.floor(split.burnAllocation)))} Morbius</div>
              </div>
              
              {/* MegaMorbius Bank */}
              <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">MegaMorbius Bank</span>
                  <span className="text-white/80">20%</span>
                </div>
                <div className="text-white/60 mt-1">{formatPssh(BigInt(Math.floor(split.megaBank)))} Morbius</div>
      </div>
    </div>
          )}
          
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-center hover:bg-white/5 rounded-lg p-2 transition-colors"
            >
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
              ) : (
                <ChevronDown className="h-5 w-5 text-white/80 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
              )}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
