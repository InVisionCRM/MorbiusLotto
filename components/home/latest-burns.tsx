'use client'

import React, { useEffect, useState, useRef } from 'react'
import { AnimatedList } from '@/components/ui/animated-list'
import { formatEther } from 'viem'
import { useMorbiusBurned } from '@/hooks/use-morbius-burned'

function BurnNotification({ amount }: { amount: bigint }) {
  const formattedAmount = Math.floor(Number(formatEther(amount))).toLocaleString()

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-lg w-full max-w-md"
      style={{
        background: 'rgba(15, 23, 42, 0.5)',
      }}
    >
      <span className="text-white text-sm">
        🔥{' '}
        <span className="text-orange-500 font-bold">{formattedAmount} MORBIUS</span>
        {' '}burned!
      </span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-4 py-3 rounded-lg w-full max-w-md animate-pulse"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
        >
          <div className="h-4 bg-white/10 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[300px] text-white/50">
      <p>No recent burns yet. Burns happen when thresholds are met!</p>
    </div>
  )
}

export function LatestBurns() {
  const { burnedAmount, isLoading } = useMorbiusBurned()
  const [burnHistory, setBurnHistory] = useState<Array<{ id: string; amount: bigint }>>([])
  const previousAmountRef = useRef<bigint>(BigInt(0))

  // Track burn increases and add them to history
  useEffect(() => {
    if (!isLoading && burnedAmount > previousAmountRef.current) {
      const increase = burnedAmount - previousAmountRef.current
      if (increase > 0n) {
        const newBurn = {
          id: `burn-${Date.now()}-${Math.random()}`,
          amount: increase,
        }
        setBurnHistory((prev) => {
          const updated = [newBurn, ...prev].slice(0, 50) // Keep last 50 burns
          return updated
        })
      }
      previousAmountRef.current = burnedAmount
    } else if (!isLoading && previousAmountRef.current === BigInt(0)) {
      // Initialize on first load
      previousAmountRef.current = burnedAmount
    }
  }, [burnedAmount, isLoading])

  return (
    <div className="relative overflow-hidden h-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
          Latest Burns
        </h2>
        <p className="text-white/50 text-sm">Real-time burn feed</p>
      </div>

      {/* Animated Burn List */}
      <div className="relative h-[400px] overflow-hidden">
        {/* Gradient overlay at top */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : burnHistory.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatedList className="gap-3" delay={2500}>
            {burnHistory.map((burn) => (
              <BurnNotification
                key={burn.id}
                amount={burn.amount}
              />
            ))}
          </AnimatedList>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
      </div>
    </div>
  )
}
