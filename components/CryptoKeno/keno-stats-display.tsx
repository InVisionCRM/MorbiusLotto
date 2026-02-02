"use client"

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useKenoStats } from '@/hooks/use-keno-stats'
import { formatEther } from 'viem'
import { TrendingUp, TrendingDown, Target, Trophy, Ticket, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAccount } from 'wagmi'

export function KenoStatsDisplay() {
  const { address } = useAccount()
  const { playerStats, globalStats, unclaimedWinnings, isLoading } = useKenoStats()

  const cardStyle = {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
  }

  if (!address) {
    return (
      <Card className="p-6 relative" style={cardStyle}>
        {/* Radial gradient overlay */}
        <div className="relative z-10">
          <p className="text-center text-gray-400">Connect your wallet to view statistics</p>
        </div>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="p-6 relative" style={cardStyle}>
        {/* Radial gradient overlay */}
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            <p className="text-gray-400">Loading statistics...</p>
          </div>
        </div>
      </Card>
    )
  }

  if (!playerStats) {
    return (
      <Card className="p-6 relative" style={cardStyle}>
        {/* Radial gradient overlay */}
        <div className="relative z-10">
          <p className="text-center text-gray-400">No statistics available</p>
        </div>
      </Card>
    )
  }

  const totalWageredEth = Number(formatEther(playerStats.totalWagered))
  const totalWonEth = Number(formatEther(playerStats.totalWon))
  const unclaimedEth = Number(formatEther(typeof unclaimedWinnings === 'bigint' ? unclaimedWinnings : BigInt(0)))
  const ticketCount = Number(playerStats.ticketCount)
  const winCount = Number(playerStats.winCount)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Your Statistics</h2>
        <Badge className="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
          Live Stats
        </Badge>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Wagered */}
        <Card
          className="relative overflow-hidden p-6"
          style={cardStyle}
        >
          {/* Radial gradient overlay */}
          <div className="absolute top-0 right-0 opacity-10">
            <DollarSign className="h-24 w-24 text-purple-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-purple-400" />
              <p className="text-sm text-purple-200">Total Wagered</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {totalWageredEth.toFixed(0)}
            </p>
            <p className="text-xs text-purple-300 mt-1">Morbius</p>
          </div>
        </Card>

        {/* Claimed */}
        <Card
          className="relative overflow-hidden p-6"
          style={cardStyle}
        >
          {/* Radial gradient overlay */}
          <div className="absolute top-0 right-0 opacity-10">
            <Trophy className="h-24 w-24 text-cyan-500" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-cyan-500" />
              <p className="text-sm text-cyan-200">Claimed</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {totalWonEth.toFixed(0)}
            </p>
            <p className="text-xs text-cyan-300 mt-1">Morbius</p>
          </div>
        </Card>

        {/* Net P/L */}
        <Card
          className="relative overflow-hidden p-6"
          style={cardStyle}
        >
          {/* Radial gradient overlay */}
          <div className="absolute top-0 right-0 opacity-10">
            {playerStats.isProfit ? (
              <TrendingUp className="h-24 w-24 text-cyan-500" />
            ) : (
              <TrendingDown className="h-24 w-24 text-red-400" />
            )}
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              {playerStats.isProfit ? (
                <TrendingUp className="h-5 w-5 text-cyan-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
              <p
                className={cn(
                  'text-sm',
                  playerStats.isProfit ? 'text-cyan-200' : 'text-red-200'
                )}
              >
                Net P/L
              </p>
            </div>
            <p className="text-3xl font-bold text-white">
              {playerStats.isProfit ? '+' : ''}
              {playerStats.netProfitLoss.toFixed(0)}
            </p>
            <p
              className={cn(
                'text-xs mt-1',
                playerStats.isProfit ? 'text-cyan-300' : 'text-red-300'
              )}
            >
              Morbius
            </p>
          </div>
        </Card>

        {/* Unclaimed */}
        <Card
          className="relative overflow-hidden p-6"
          style={cardStyle}
        >
          {/* Radial gradient overlay */}
          <div className="absolute top-0 right-0 opacity-10">
            <Target className="h-24 w-24 text-blue-300" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-blue-300" />
              <p className="text-sm text-blue-200">Unclaimed</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {unclaimedEth.toFixed(0)}
            </p>
            <p className="text-xs text-blue-200 mt-1">Morbius</p>
          </div>
        </Card>
      </div>

    </div>
  )
}
