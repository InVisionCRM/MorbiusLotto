'use client'

import React, { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { isAddress, getAddress } from 'viem'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { Card } from '@/components/ui/card'
import { PlayerProfileDashboard } from '@/components/shared/PlayerProfileDashboard'

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function PlayerProfilePage() {
  const params = useParams()
  const raw = params?.address as string | undefined

  const normalizedAddress = useMemo(() => {
    if (!raw || !raw.trim()) return null
    const t = raw.trim()
    if (!isAddress(t)) return null
    return getAddress(t)
  }, [raw])

  if (!normalizedAddress) {
    return (
      <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
        <div className="min-h-screen text-white bg-black pt-4 md:pt-2">
          <main className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="text-center py-20">
              <p className="text-white/60">Invalid address</p>
            </div>
          </main>
          <Footer />
        </div>
      </GlobalMainNav>
    )
  }

  return (
    <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
      <div className="min-h-screen text-white bg-black pt-4 md:pt-2">
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-500 to-purple-500 bg-clip-text text-transparent mb-2">
              Player Dashboard
            </h1>
            <p className="text-xl text-white/80 font-mono text-cyan-300">{formatAddress(normalizedAddress)}</p>
          </div>

          <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
            <PlayerProfileDashboard
              address={normalizedAddress}
              initialGame="all"
              gameSelectId="player-page-dashboard-game"
            />
          </Card>
        </main>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
