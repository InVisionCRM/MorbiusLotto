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

  if (!address) {
    return (
      <Card className="border border-white/10 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-6">
        <p className="text-center text-gray-400">Connect your wallet to view statistics</p>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="border border-white/10 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-6">
        <div className="flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-gray-400">Loading statistics...</p>
        </div>
      </Card>
    )
  }

  if (!playerStats) {
    return (
      <Card className="border border-white/10 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-6">
        <p className="text-center text-gray-400">No statistics available</p>
      </Card>
    )
  }

  const totalWageredEth = Number(formatEther(playerStats.totalWagered))
  const totalWonEth = Number(formatEther(playerStats.totalWon))
  const unclaimedEth = Number(formatEther(unclaimedWinnings || BigInt(0)))
  const ticketCount = Number(playerStats.ticketCount)
  const winCount = Number(playerStats.winCount)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Your Statistics</h2>
        <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
          Live Stats
        </Badge>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Wagered */}
        <Card className="relative overflow-hidden border border-purple-500/30 bg-gradient-to-br from-purple-900/40 to-purple-950/30 p-6">
          <div className="absolute top-0 right-0 opacity-10">
            <DollarSign className="h-24 w-24 text-purple-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-purple-400" />
              <p className="text-sm text-purple-200">Total Wagered</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {totalWageredEth.toFixed(4)}
            </p>
            <p className="text-xs text-purple-300 mt-1">WPLS</p>
          </div>
        </Card>

        {/* Claimed */}
        <Card className="relative overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-900/40 to-emerald-950/30 p-6">
          <div className="absolute top-0 right-0 opacity-10">
            <Trophy className="h-24 w-24 text-emerald-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-emerald-400" />
              <p className="text-sm text-emerald-200">Claimed</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {totalWonEth.toFixed(4)}
            </p>
            <p className="text-xs text-emerald-300 mt-1">WPLS</p>
          </div>
        </Card>

        {/* Net P/L */}
        <Card
          className={cn(
            'relative overflow-hidden border p-6',
            playerStats.isProfit
              ? 'border-green-500/30 bg-gradient-to-br from-green-900/40 to-green-950/30'
              : 'border-red-500/30 bg-gradient-to-br from-red-900/40 to-red-950/30'
          )}
        >
          <div className="absolute top-0 right-0 opacity-10">
            {playerStats.isProfit ? (
              <TrendingUp className="h-24 w-24 text-green-400" />
            ) : (
              <TrendingDown className="h-24 w-24 text-red-400" />
            )}
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              {playerStats.isProfit ? (
                <TrendingUp className="h-5 w-5 text-green-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
              <p
                className={cn(
                  'text-sm',
                  playerStats.isProfit ? 'text-green-200' : 'text-red-200'
                )}
              >
                Net P/L
              </p>
            </div>
            <p className="text-3xl font-bold text-white">
              {playerStats.isProfit ? '+' : ''}
              {playerStats.netProfitLoss.toFixed(4)}
            </p>
            <p
              className={cn(
                'text-xs mt-1',
                playerStats.isProfit ? 'text-green-300' : 'text-red-300'
              )}
            >
              WPLS
            </p>
          </div>
        </Card>

        {/* Unclaimed */}
        <Card className="relative overflow-hidden border border-blue-500/40 bg-gradient-to-br from-blue-900/40 to-blue-950/30 p-6">
          <div className="absolute top-0 right-0 opacity-10">
            <Target className="h-24 w-24 text-blue-300" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-blue-300" />
              <p className="text-sm text-blue-200">Unclaimed</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {unclaimedEth.toFixed(4)}
            </p>
            <p className="text-xs text-blue-200 mt-1">WPLS</p>
          </div>
        </Card>
      </div>

      {/* Global Stats */}
      {globalStats && (
        <Card className="border border-white/10 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Global Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-400">Total Wagered</p>
              <p className="text-xl font-bold text-white">
                {Number(formatEther(globalStats.totalWagered)).toFixed(2)} WPLS
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Claimed</p>
              <p className="text-xl font-bold text-white">
                {Number(formatEther(globalStats.totalWon)).toFixed(2)} WPLS
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Tickets</p>
              <p className="text-xl font-bold text-white">
                {Number(globalStats.ticketCount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Unclaimed (global)</p>
              <p className="text-xl font-bold text-white">
                0.00 WPLS
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
