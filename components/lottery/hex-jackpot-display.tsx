'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUnits } from 'viem'
import { Hexagon, Zap, Award } from 'lucide-react'

interface HexJackpotDisplayProps {
  hexJackpot: bigint
  isLoading?: boolean
  hasActivated?: boolean
  className?: string
}

export function HexJackpotDisplay({
  hexJackpot,
  isLoading = false,
  hasActivated = false,
  className = ''
}: HexJackpotDisplayProps) {
  const formatHex = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 8)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const hasJackpot = hexJackpot > BigInt(0)

  if (isLoading) {
    return (
      <Card className={`p-6 bg-black/40 border-white/10 ${className}`}>
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-white/10 rounded w-1/2" />
          <div className="h-12 bg-white/10 rounded" />
          <div className="h-4 bg-white/10 rounded w-3/4" />
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
            <Hexagon className={`h-6 w-6 ${hasActivated ? 'text-white animate-pulse' : 'text-white/80'}`} />
            <h3 className={`text-xl font-bold ${hasActivated
              ? 'bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent'
              : 'text-white'
            }`}>
              HEX Overlay Jackpot
            </h3>
          </div>
          {hasActivated && (
            <Badge className="bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 text-white font-bold animate-bounce">
              ACTIVATED!
            </Badge>
          )}
        </div>

        {/* Jackpot Amount */}
        <div className="space-y-2">
          {hasJackpot ? (
            <>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                  {formatHex(hexJackpot)}
                </div>
                <div className="text-lg text-white/70">HEX</div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-white/60">
                <Zap className="h-4 w-4" />
                <span>Bonus prize pool</span>
              </div>
            </>
          ) : (
            <div className="py-4">
              <div className="text-2xl font-bold text-white/60">
                No HEX Jackpot
              </div>
              <div className="text-sm text-white/40 mt-1">
                Waiting for deposits
              </div>
            </div>
          )}
        </div>

        {/* Active Message */}
        {hasActivated && hasJackpot ? (
          <div className="p-4 bg-black/40 border border-white/20 rounded-lg">
            <div className="text-center space-y-2">
              <div className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Zap className="h-5 w-5 animate-pulse" />
                HEX OVERLAY ACTIVE!
                <Zap className="h-5 w-5 animate-pulse" />
              </div>
              <p className="text-xs text-white/70">
                70% to all Bracket 6 winners, 30% to jackpot reserve
              </p>
            </div>
          </div>
        ) : hasJackpot ? (
          <div className="p-4 bg-black/40 border border-white/10 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-white/80" />
              <span className="text-white/70">
                Activates when someone matches all 6 numbers
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-black/40 border border-white/10 rounded-lg">
            <div className="text-sm text-white/50 text-center">
              HEX donations can be sent to the lottery contract to create overlay jackpots
            </div>
          </div>
        )}

        {/* Info */}
        <div className="pt-3 border-t border-white/10">
          <div className="space-y-2 text-xs text-white/60">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
              <p>Triggered when Bracket 6 (6 matches) has winners</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
              <p>70% distributed to all Bracket 6 winners</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 mt-1.5 flex-shrink-0" />
              <p>30% goes to the jackpot reserve address</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
