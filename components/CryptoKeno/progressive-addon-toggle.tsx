"use client"

import { motion } from 'framer-motion'
import { Zap, Info, Trophy } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatUnits } from 'viem'

interface ProgressiveAddonToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  costPerDraw: bigint
  draws: number
  spotSize: number
  currentJackpot: bigint
  disabled?: boolean
}

export function ProgressiveAddonToggle({
  enabled,
  onToggle,
  costPerDraw,
  draws,
  spotSize,
  currentJackpot,
  disabled = false
}: ProgressiveAddonToggleProps) {
  const isEligible = spotSize >= 9
  const totalCost = costPerDraw * BigInt(draws)

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
        enabled
          ? 'border-purple-500 bg-gradient-to-br from-purple-900/30 via-indigo-900/30 to-purple-900/30'
          : 'border-purple-500/20 bg-purple-900/10'
      }`}
    >
      {/* Animated background when enabled */}
      {enabled && (
        <>
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.15),transparent_70%)]" />
        </>
      )}

      <div className="relative z-10 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Header */}
            <div className="flex items-center space-x-2 mb-2">
              <div className="relative">
                <Zap className={`h-5 w-5 ${enabled ? 'text-yellow-400' : 'text-purple-400'}`} />
                {enabled && (
                  <motion.div
                    className="absolute inset-0 bg-yellow-400/30 rounded-full blur-sm"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                )}
              </div>
              <Label
                htmlFor="progressive-toggle"
                className={`font-bold cursor-pointer ${
                  enabled ? 'text-white' : 'text-purple-300'
                }`}
              >
                Pulse Progressive
              </Label>
              {enabled && (
                <Badge className="bg-yellow-500 text-black text-xs px-2 py-0.5">
                  <Trophy className="h-3 w-3 mr-1" />
                  ACTIVE
                </Badge>
              )}
            </div>

            {/* Description */}
            <p className={`text-sm mb-3 ${
              enabled ? 'text-purple-200' : 'text-purple-400'
            }`}>
              Win <span className="font-bold text-yellow-400">{formatNumber(Number(formatUnits(currentJackpot, 18)))} PLS</span> by matching 9+ numbers
            </p>

            {/* Eligibility & Cost */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isEligible ? (
                  <Badge variant="outline" className="text-green-400 border-green-400/50">
                    ✓ Eligible (9-10 Spot)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-orange-400 border-orange-400/50">
                    Requires 9+ Spots
                  </Badge>
                )}

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-purple-400 hover:text-purple-300 transition-colors">
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-2">
                        <p className="font-bold">Pulse Progressive Rules:</p>
                        <ul className="text-xs space-y-1 list-disc list-inside">
                          <li>Must play 9-Spot or 10-Spot game</li>
                          <li>Match 9 or more numbers to win</li>
                          <li>85% of fees go to jackpot pool</li>
                          <li>Multiple winners split the pot</li>
                          <li>Jackpot resets to {formatNumber(Number(formatUnits(BigInt(100_000) * BigInt(10)**BigInt(18), 18)))} PLS after win</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="text-right">
                <p className={`text-xs ${
                  enabled ? 'text-purple-200' : 'text-purple-400'
                }`}>
                  Cost per draw
                </p>
                <p className={`text-sm font-bold ${
                  enabled ? 'text-white' : 'text-purple-300'
                }`}>
                  +{formatNumber(Number(formatUnits(costPerDraw, 18)))} PLS
                </p>
                {draws > 1 && (
                  <p className="text-xs text-purple-400">
                    ({formatNumber(Number(formatUnits(totalCost, 18)))} total)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="ml-4">
            <Switch
              id="progressive-toggle"
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={disabled || !isEligible}
              className={enabled ? 'data-[state=checked]:bg-purple-600' : ''}
            />
          </div>
        </div>

        {/* Warning for ineligible spots */}
        {!isEligible && spotSize > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-purple-500/20"
          >
            <p className="text-xs text-orange-400 flex items-center space-x-2">
              <Info className="h-3 w-3 flex-shrink-0" />
              <span>Select 9 or 10 spots to enable Pulse Progressive</span>
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
