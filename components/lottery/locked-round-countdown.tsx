'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { Card } from '@/components/ui/card'
import { Clock, Loader2 } from 'lucide-react'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'

interface LockedRoundCountdownProps {
  roundId: number
  drawBlock: number
}

export function LockedRoundCountdown({ roundId, drawBlock }: LockedRoundCountdownProps) {
  const publicClient = usePublicClient()
  const [currentBlock, setCurrentBlock] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!publicClient) return

    let mounted = true

    const updateBlock = async () => {
      try {
        const block = await publicClient.getBlockNumber()
        if (mounted) {
          setCurrentBlock(Number(block))
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error fetching block number:', error)
      }
    }

    // Initial fetch
    updateBlock()

    // Update every 5 seconds
    const interval = setInterval(updateBlock, 5000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [publicClient])

  if (isLoading) {
    return (
      <Card className="p-4 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/40">
        <div className="flex items-center gap-2 text-amber-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading round status...</span>
        </div>
      </Card>
    )
  }

  const blocksRemaining = Math.max(0, drawBlock - currentBlock)
  const secondsRemaining = blocksRemaining * 5 // ~5 seconds per block on PulseChain
  const canDrawNow = blocksRemaining === 0

  return (
    <Card className="p-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/40 shadow-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-purple-400 animate-pulse" />
            <h3 className="text-lg font-bold text-white">Round {roundId} Drawing Soon</h3>
          </div>
          <div className="px-3 py-1 bg-purple-500/30 border border-purple-400/50 rounded-full">
            <span className="text-xs font-bold text-purple-200">LOCKED</span>
          </div>
        </div>

        {/* Countdown */}
        {canDrawNow ? (
          <div className="flex items-center gap-3 p-4 bg-green-500/20 border border-green-500/40 rounded-lg">
            <Loader2 className="h-6 w-6 text-green-400 animate-spin" />
            <div>
              <div className="text-sm font-bold text-green-300">Drawing Numbers Now...</div>
              <div className="text-xs text-green-200/80">Waiting for keeper to draw winning numbers</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Time Display */}
            <div className="flex items-center justify-center gap-3 p-4 bg-black/40 rounded-lg">
              <Clock className="h-8 w-8 text-purple-400" />
              <div className="text-center">
                <div className="text-3xl font-bold text-white">
                  {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}
                </div>
                <div className="text-xs text-white/60 uppercase tracking-wider">Until Draw</div>
              </div>
            </div>

            {/* Block Info */}
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="p-3 bg-black/30 rounded-lg">
                <div className="text-xs text-white/60 mb-1">Blocks Remaining</div>
                <div className="text-lg font-bold text-purple-300">{blocksRemaining}</div>
              </div>
              <div className="p-3 bg-black/30 rounded-lg">
                <div className="text-xs text-white/60 mb-1">Draw Block</div>
                <div className="text-lg font-bold text-purple-300">{drawBlock}</div>
              </div>
            </div>

            {/* Info Message */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <p className="text-xs text-purple-200 text-center">
                🎲 Numbers will be drawn automatically using blockchain randomness
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
