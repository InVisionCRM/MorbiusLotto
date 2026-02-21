'use client'

import React, { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { Card } from '@/components/ui/card'

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function PlayerProfilePage() {
  const params = useParams()
  const address = params?.address as string | undefined
  const { data: stats, isLoading: statsLoading } = usePlayerProfileStats(address)

  // Convert stats to PlayerStatsDashboard format
  const dashboardStats = useMemo(() => {
    if (!stats) return null
    return {
      totalGames: stats.total_games,
      totalBet: stats.total_bet,
      totalWin: stats.total_win,
      winRate: stats.win_rate,
      blackjackCount: stats.blackjack_count || 0,
      currentStreak: stats.current_streak || 0,
      bestStreak: stats.best_streak || 0,
      biggestWin: stats.biggest_win,
      biggestLoss: stats.biggest_loss,
      averageBet: stats.total_games > 0 ? Number(stats.total_bet) / stats.total_games / 1e18 : 0,
      averagePayout: stats.total_games > 0 ? Number(stats.total_win) / stats.total_games / 1e18 : 0,
      profitLoss: Number(stats.profit_loss) / 1e18,
      roi: Number(stats.total_bet) > 0 ? (Number(stats.profit_loss) / Number(stats.total_bet)) * 100 : 0,
      gamesToday: 0,
      gamesThisWeek: 0,
      favoriteBetAmount: Number(stats.favorite_bet_amount) / 1e18,
    }
  }, [stats])

  if (!address) {
    return (
      <GlobalMainNav page="home" showBackArrow backArrowHref="/BLACKJACK" backArrowLabel="Back to Blackjack">
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
    <GlobalMainNav page="home" showBackArrow backArrowHref="/BLACKJACK" backArrowLabel="Back to Blackjack">
      <div className="min-h-screen text-white bg-black pt-4 md:pt-2">
        <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-500 to-purple-500 bg-clip-text text-transparent mb-2">
            Player Stats
          </h1>
          <p className="text-xl text-white/80 font-mono text-cyan-300">
            {formatAddress(address)}
          </p>
        </div>

        {/* Content */}
        <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
          {statsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : dashboardStats ? (
            <PlayerStatsDashboard stats={dashboardStats} isLoading={false} playerAddress={address} />
          ) : (
            <div className="text-center py-12 text-white/60">
              <p>No stats available for this address</p>
            </div>
          )}
        </Card>
      </main>
      <Footer />
    </div>
    </GlobalMainNav>
  )
}
