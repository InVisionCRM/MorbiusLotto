'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUnits } from 'viem'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { TOKEN_DECIMALS } from '@/lib/contracts'

interface CombinedPoolsCardProps {
  currentRoundId: number
  megaMillionsBank: bigint
  isLoading?: boolean
}

export function CombinedPoolsCard({
  currentRoundId,
  megaMillionsBank,
  isLoading = false,
}: CombinedPoolsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate rounds until MegaMorbius
  // Note: interval now dynamic from contract; UI should receive current interval if needed.
  const interval = 5 // displayed default; consider wiring from contract read if desired
  const roundsUntilMega = interval - (currentRoundId % interval)
  const isMegaMillionsRound = roundsUntilMega === interval
  const nextMegaRoundId = isMegaMillionsRound
    ? currentRoundId
    : currentRoundId + roundsUntilMega

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  if (isLoading) {
    return (
      <Card className="p-6 bg-black/40 border-white/10">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-white/10 rounded w-1/2" />
          <div className="h-12 bg-white/10 rounded" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden bg-black/40 border-white/10">
      <div className="relative p-6">
        {/* Main Display: Two Amounts */}
        <div className="grid grid-cols-2 gap-4 items-center">
          {/* Left: MegaMorbius Jackpot */}
          <div className="text-center">
            {!isMegaMillionsRound && (
              <div className="text-xs text-white/50 mb-1">
                {roundsUntilMega} round{roundsUntilMega !== 1 ? 's' : ''} until
              </div>
            )}
            <div className="text-xs text-white/60 mb-1">
              {isMegaMillionsRound ? 'MEGA MORBIUS ACTIVE!' : 'MegaMorbius Jackpot'}
            </div>
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
              {formatPssh(megaMillionsBank)}
            </div>
            <div className="text-xs text-white/50">Morbius</div>
            {isMegaMillionsRound && (
              <Badge className="mt-1 bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 text-white text-xs">
                ACTIVE
              </Badge>
            )}
          </div>

          {/* Right: Morbius Burned (from contract-level burn) */}
          <div className="text-center">
            <div className="text-xs text-white/60 mb-1">Morbius Burned</div>
            <div className="text-2xl font-bold text-white">
              {/* Placeholder: this UI no longer receives a stake balance; hide actual value */}
              --
            </div>
            <div className="text-xs text-white/50">Morbius</div>
          </div>
        </div>

        {/* Dropdown Button */}
        <div className="mt-4 flex justify-center">
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

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 space-y-4 pt-4 border-t border-white/10">
            {/* MegaMorbius Jackpot Details */}
            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className={`h-5 w-5 ${isMegaMillionsRound ? 'text-white animate-pulse' : 'text-white/80'}`} />
                <h4 className="font-semibold text-white">MegaMorbius Jackpot</h4>
              </div>
              {isMegaMillionsRound ? (
                <div className="p-3 bg-black/40 border border-white/20 rounded-lg mb-3">
                  <div className="text-center space-y-2">
                    <div className="text-base font-bold text-white flex items-center justify-center gap-2">
                      <Sparkles className="h-4 w-4 animate-spin" />
                      THIS IS A MEGAMORBIUS ROUND!
                      <Sparkles className="h-4 w-4 animate-spin" />
                    </div>
                    <p className="text-xs text-white/70">
                      All Bracket 1-6 winners will share the entire MegaMorbius bank!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-black/40 border border-white/10 rounded-lg mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <span>Next MegaMorbius</span>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-white">
                        {roundsUntilMega} round{roundsUntilMega !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-white/50">
                        Round #{nextMegaRoundId}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1.5 text-xs text-white/60">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                    <p>Triggers every {interval}th round</p>
                  </div>
                <div className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                  <p>Accumulates 20% of ticket sales + unclaimed brackets</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                  <p>Distributed to all winning brackets (1-6 matches)</p>
                </div>
              </div>
            </div>

            {/* Distribution & Rollover Details */}
            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-white/80" />
                <h4 className="font-semibold text-white">Distribution & Rollover</h4>
              </div>
              <div className="space-y-1.5 text-xs text-white/60">
                <div className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                  <p>60% Winners · 20% MegaMorbius · 20% Burn</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                  <p>Zero-winner bracket: 75% to next-round winners pool, 25% to MegaMorbius</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
                  <p>Triggers every {interval}th round</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}




