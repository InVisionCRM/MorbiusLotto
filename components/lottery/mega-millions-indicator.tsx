'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUnits } from 'viem'
import { Sparkles, TrendingUp, Calendar } from 'lucide-react'
import { MEGA_MILLIONS_INTERVAL } from '@/lib/contracts'

interface MegaMillionsIndicatorProps {
  currentRoundId: number
  megaMillionsBank: bigint
  isLoading?: boolean
  className?: string
}

export function MegaMillionsIndicator({
  currentRoundId,
  megaMillionsBank,
  isLoading = false,
  className = ''
}: MegaMillionsIndicatorProps) {
  // Calculate rounds until MegaMillions
  const roundsUntilMega = MEGA_MILLIONS_INTERVAL - (currentRoundId % MEGA_MILLIONS_INTERVAL)
  const isMegaMillionsRound = roundsUntilMega === MEGA_MILLIONS_INTERVAL
  const nextMegaRoundId = isMegaMillionsRound
    ? currentRoundId
    : currentRoundId + roundsUntilMega

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  if (isLoading) {
    return (
      <Card className={`p-6 bg-black/40 border-white/10 ${className}`}>
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-muted/50 rounded w-1/2" />
          <div className="h-12 bg-muted/50 rounded" />
          <div className="h-4 bg-muted/50 rounded w-3/4" />
        </div>
      </Card>
    )
  }

  return (
    <Card className={`
      relative overflow-hidden bg-black/40 border-white/10
      ${className}
    `}>
      <div className="relative p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className={`h-6 w-6 ${isMegaMillionsRound ? 'text-white animate-pulse' : 'text-white/80'}`} />
            <h3 className={`text-xl font-bold ${isMegaMillionsRound 
              ? 'bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent' 
              : 'text-white'
            }`}>
              {isMegaMillionsRound ? 'MEGA MILLIONS ACTIVE!' : 'MegaMillions Bank'}
            </h3>
          </div>
          {isMegaMillionsRound && (
            <Badge className="bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 text-white font-bold animate-bounce">
              ACTIVE NOW
            </Badge>
          )}
        </div>

        {/* Bank Amount */}
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
              {formatPssh(megaMillionsBank)}
            </div>
            <div className="text-lg text-white/70">pSSH</div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-white/60">
            <TrendingUp className="h-4 w-4" />
            <span>Grows with every round</span>
          </div>
        </div>

        {/* Countdown or Active Message */}
        {isMegaMillionsRound ? (
          <div className="p-4 bg-black/40 border border-white/20 rounded-lg">
            <div className="text-center space-y-2">
              <div className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 animate-spin bg-gradient-to-r from-purple-400 to-pink-400" />
                THIS IS A MEGAMILLIONS ROUND!
                <Sparkles className="h-5 w-5 animate-spin bg-gradient-to-r from-purple-400 to-pink-400" />
              </div>
              <p className="text-xs text-white/70">
                All Bracket 1-6 winners will share the entire MegaMillions bank!
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-black/40 border border-white/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Calendar className="h-4 w-4" />
                <span>Next MegaMillions</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-white">
                  {roundsUntilMega} round{roundsUntilMega !== 1 ? 's' : ''}
                </div>
                <div className="text-xs text-white/50">
                  Round #{nextMegaRoundId}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="pt-3 border-t border-white/10">
          <div className="space-y-2 text-xs text-white/60">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
              <p>Triggers every {MEGA_MILLIONS_INTERVAL}th round</p>
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
      </div>
    </Card>
  )
}
