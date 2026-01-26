'use client'

import React, { useMemo } from 'react'
import { AnimatedList } from '@/components/ui/animated-list'
import { formatEther } from 'viem'

interface WinEntry {
  id: string
  address: string
  amount: bigint
  game: 'Plinko' | 'Blackjack' | 'Big Wheel' | 'Lottery' | 'Keno'
  timestamp: number
}

// Mock data for demonstration - in production, this would come from an API/WebSocket
const generateMockWins = (): WinEntry[] => {
  const games: WinEntry['game'][] = ['Plinko', 'Blackjack', 'Big Wheel', 'Lottery', 'Keno']
  const mockAddresses = [
    '0x1234...5678',
    '0xabcd...efgh',
    '0x9876...5432',
    '0xfedc...ba98',
    '0x2468...1357',
    '0x1357...2468',
    '0xaced...cafe',
    '0xbeef...dead',
  ]

  return Array.from({ length: 8 }, (_, i) => ({
    id: `win-${i}`,
    address: mockAddresses[i % mockAddresses.length],
    amount: BigInt(Math.floor(Math.random() * 10000 + 100) * 10 ** 18),
    game: games[Math.floor(Math.random() * games.length)],
    timestamp: Date.now() - i * 60000,
  }))
}

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

export function LatestWins() {
  const wins = useMemo(() => generateMockWins(), [])

  return (
    <section className="relative py-16 px-4 overflow-hidden">
      <div className="container mx-auto max-w-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
            Latest Wins
          </h2>
          <p className="text-white/50 text-sm">Real-time winner feed</p>
        </div>

        {/* Animated Win List */}
        <div className="relative h-[400px] overflow-hidden">
          {/* Gradient overlay at top */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />

          {/* Animated list */}
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

          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
        </div>
      </div>
    </section>
  )
}
