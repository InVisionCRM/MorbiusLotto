'use client'

import React, { useState } from 'react'
import { AnimatedList } from '@/components/ui/animated-list'
import { formatEther } from 'viem'
import { useLatestWins, WinEntry } from '@/hooks/use-latest-wins'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return address.slice(-4)
}

function WinNotification({ address, amount, game, timestamp, onAddressClick }: { address: string; amount: bigint; game: string; timestamp: number; onAddressClick: (address: string) => void }) {
  const formattedAmount = Math.floor(Number(formatEther(amount))).toLocaleString()

  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-3 rounded-lg w-full max-w-md"
      style={{
        background: 'rgba(15, 23, 42, 0.5)',
      }}
    >
      <span className="text-white text-sm">
        <button
          onClick={() => onAddressClick(address)}
          className="text-cyan-400 hover:text-cyan-300 underline font-mono transition-colors"
        >
          {formatAddress(address)}
        </button>
        {' won '}
        <span className="text-green-500 font-bold">{formattedAmount} MORBIUS</span>
        {' playing '}
        <span className="text-blue-500 font-bold">{game}</span>
      </span>
      <span className="text-white/40 text-xs whitespace-nowrap">{timeAgo(timestamp)}</span>
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
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)

  return (
    <>
      <div className="relative flex flex-col overflow-hidden h-full min-h-0">
        {/* Header */}
        <div className="text-center mb-4 flex-shrink-0">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
            Latest Wins
          </h2>
          <p className="text-white/50 text-sm">Real-time winner feed</p>
        </div>

        {/* Animated Win List — fills remaining space so no gap at bottom of grid */}
        <div className="relative flex-1 h-200 overflow-hidden">
          {/* Gradient overlay at top */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />

          {/* Content */}
          {isLoading ? (
            <LoadingSkeleton />
          ) : wins.length === 0 ? (
            <EmptyState />
          ) : (
            <AnimatedList className="gap-3" delay={2500}>
              {wins.slice(0, 15).map((win) => (
                <WinNotification
                  key={win.id}
                  address={win.address}
                  amount={win.amount}
                  game={win.game}
                  timestamp={win.timestamp}
                  onAddressClick={setSelectedAddress}
                />
              ))}
            </AnimatedList>
          )}

          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
        </div>
      </div>

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}
