'use client'

import React from 'react'
import { AnimatedList } from '@/components/ui/animated-list'
import { formatEther } from 'viem'
import { useLatestWins, WinEntry } from '@/hooks/use-latest-wins'

function WinNotification({ address, amount, game }: { address: string; amount: bigint; game: string }) {
  const formattedAmount = Math.floor(Number(formatEther(amount))).toLocaleString()

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-lg w-full max-w-md"
      style={{
        background: 'rgba(15, 23, 42, 0.5)',
      }}
    >
      <span className="text-white text-sm">
        {address} just won{' '}
        <span className="text-green-500 font-bold">{formattedAmount} MORBIUS</span>
        {' '}playing{' '}
        <span className="text-blue-500 font-bold">{game}</span>!
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
      <p>No recent wins yet. Be the first to win!</p>
    </div>
  )
}

export function LatestWins() {
  const { wins, isLoading } = useLatestWins()

  return (
    <div className="relative flex flex-col overflow-hidden h-full min-h-0">
      {/* Header */}
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
          Latest Wins
        </h2>
        <p className="text-white/50 text-sm">Real-time winner feed</p>
      </div>

      {/* Animated Win List — fills remaining space so no gap at bottom of grid */}
      <div className="relative flex-1 min-h-[280px] overflow-hidden">
        {/* Gradient overlay at top */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : wins.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatedList className="gap-3" delay={2500}>
            {wins.map((win) => (
              <WinNotification
                key={win.id}
                address={win.address}
                amount={win.amount}
                game={win.game}
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
