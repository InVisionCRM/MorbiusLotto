'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  DollarSign,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Clock
} from 'lucide-react'
import { formatEther } from 'viem'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export interface PlayerStats {
  totalGames: number
  totalBet: bigint
  totalWin: bigint
  winRate: number
  blackjackCount: number
  currentStreak: number
  bestStreak: number
  biggestWin: bigint
  biggestLoss: bigint
  averageBet: number
  averagePayout: number
  profitLoss: number
  roi: number
  gamesToday: number
  gamesThisWeek: number
  favoriteBetAmount: number
  lastGameTimestamp?: number
}

interface PlayerStatsDashboardProps {
  stats: PlayerStats
  isLoading?: boolean
}

export function PlayerStatsDashboard({ stats, isLoading }: PlayerStatsDashboardProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader className="pb-3">
              <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-700 rounded animate-pulse mb-2"></div>
              <div className="h-3 bg-gray-700 rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const formatCurrency = (amount: bigint | number) => {
    let num: number
    if (typeof amount === 'bigint') {
      // Convert from 18 decimals to whole number
      num = Math.floor(Number(formatEther(amount)))
    } else {
      // If it's a number, assume it's already in wei (18 decimals) and convert
      num = Math.floor(amount / 1e18)
    }
    return num.toLocaleString()
  }

  const getProfitColor = (amount: number) => {
    if (amount > 0) return 'text-green-400'
    if (amount < 0) return 'text-red-400'
    return 'text-yellow-400'
  }

  const getWinRateColor = (rate: number) => {
    if (rate >= 50) return 'text-green-400'
    if (rate >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  const statsCards = [
    {
      title: 'Total Games',
      value: stats.totalGames.toLocaleString(),
      icon: Activity,
      subtitle: `${stats.gamesToday} today, ${stats.gamesThisWeek} this week`,
      color: 'text-blue-400'
    },
    {
      title: 'Win Rate',
      value: `${Math.round(stats.winRate)}%`,
      icon: Target,
      subtitle: `${stats.blackjackCount} blackjacks`,
      color: getWinRateColor(stats.winRate),
      progress: stats.winRate
    },
    {
      title: 'Profit/Loss',
      value: `${stats.profitLoss > 0 ? '+' : ''}${formatCurrency(stats.profitLoss)} MORBIUS`,
      icon: stats.profitLoss >= 0 ? TrendingUp : TrendingDown,
      subtitle: `${stats.roi > 0 ? '+' : ''}${Math.round(stats.roi)}% ROI`,
      color: getProfitColor(stats.profitLoss)
    },
    {
      title: 'Total Wagered',
      value: `${formatCurrency(stats.totalBet)} MORBIUS`,
      icon: DollarSign,
      subtitle: `Avg bet: ${formatCurrency(stats.averageBet)} MORBIUS`,
      color: 'text-purple-400'
    },
    {
      title: 'Total Won',
      value: `${formatCurrency(stats.totalWin)} MORBIUS`,
      icon: Trophy,
      subtitle: `Avg payout: ${formatCurrency(stats.averagePayout)} MORBIUS`,
      color: 'text-green-400'
    },
    {
      title: 'Current Streak',
      value: stats.currentStreak.toString(),
      icon: BarChart3,
      subtitle: `Best: ${stats.bestStreak} wins`,
      color: stats.currentStreak > 0 ? 'text-green-400' : 'text-red-400'
    }
  ]

  // Top 6 stats for Recharts bar chart (normalized 0–100 for comparable bar height)
  const topSixChartData = useMemo(() => {
    const totalBetNum = Math.max(1, Math.floor(Number(formatEther(stats.totalBet))))
    const totalWinNum = Math.floor(Number(formatEther(stats.totalWin)))
    const profitLossAbs = Math.abs(stats.profitLoss)
    const raw = [
      { key: 'Games', name: 'Games', value: stats.totalGames, display: stats.totalGames.toLocaleString(), color: '#60a5fa' },
      { key: 'Win%', name: 'Win %', value: stats.winRate, display: `${Math.round(stats.winRate)}%`, color: '#34d399' },
      { key: 'P/L', name: 'P/L', value: profitLossAbs, display: `${stats.profitLoss >= 0 ? '+' : ''}${formatCurrency(stats.profitLoss)} M`, color: stats.profitLoss >= 0 ? '#34d399' : '#f87171' },
      { key: 'Wagered', name: 'Wagered', value: totalBetNum, display: `${formatCurrency(stats.totalBet)} M`, color: '#a78bfa' },
      { key: 'Won', name: 'Won', value: totalWinNum, display: `${formatCurrency(stats.totalWin)} M`, color: '#34d399' },
      { key: 'Streak', name: 'Streak', value: Math.abs(stats.currentStreak), display: `${stats.currentStreak >= 0 ? '+' : ''}${stats.currentStreak}`, color: stats.currentStreak >= 0 ? '#34d399' : '#f87171' },
    ]
    const maxVal = Math.max(1, ...raw.map((d) => (d.key === 'Win%' ? d.value : Number(d.value))))
    return raw.map((d) => ({
      ...d,
      normalized: d.key === 'Win%' ? d.value : (Number(d.value) / maxVal) * 100,
    }))
  }, [stats])

  const recordStats = [
    {
      label: 'Biggest Win',
      value: `${formatCurrency(stats.biggestWin)} MORBIUS`,
      icon: TrendingUp,
      color: 'text-green-400'
    },
    {
      label: 'Biggest Loss',
      value: `${formatCurrency(stats.biggestLoss)} MORBIUS`,
      icon: TrendingDown,
      color: 'text-red-400'
    },
    {
      label: 'Favorite Bet',
      value: `${formatCurrency(stats.favoriteBetAmount)} MORBIUS`,
      icon: Target,
      color: 'text-blue-400'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statsCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 hover:border-gray-600 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color} mb-1`}>
                  {stat.value}
                </div>
                <p className="text-xs text-gray-500">
                  {stat.subtitle}
                </p>
                {stat.progress !== undefined && (
                  <Progress
                    value={stat.progress}
                    className="mt-2 h-1"
                    style={{
                      background: 'rgba(55, 65, 81, 0.5)'
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Top 6 Stats Chart */}
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Top 6 Stats at a Glance
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Bar height = relative scale (tooltip shows actual value)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topSixChartData}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                layout="vertical"
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={72}
                  tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17, 24, 39, 0.95)',
                    border: '1px solid rgba(75, 85, 99, 0.5)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'rgb(209, 213, 219)' }}
                  formatter={(value: number, _name: string, props: { payload?: Array<{ payload: { display: string } }> }) =>
                    [props.payload?.[0]?.payload?.display ?? String(value), '']
                  }
                  labelFormatter={(_, payload: Array<{ payload: { name: string } }>) => payload?.[0]?.payload?.name ?? ''}
                />
                <Bar dataKey="normalized" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive>
                  {topSixChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Records and Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Records */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Personal Records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recordStats.map((record, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <record.icon className={`h-4 w-4 ${record.color}`} />
                  <span className="text-sm text-gray-300">{record.label}</span>
                </div>
                <span className={`text-sm font-medium ${record.color}`}>
                  {record.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Activity Overview */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Activity Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-lg font-bold text-cyan-400">
                  {stats.gamesToday}
                </div>
                <div className="text-xs text-gray-400">Games Today</div>
              </div>
              <div className="text-center p-3 bg-gray-800/50 rounded-lg">
                <div className="text-lg font-bold text-purple-400">
                  {stats.gamesThisWeek}
                </div>
                <div className="text-xs text-gray-400">Games This Week</div>
              </div>
            </div>

            {stats.lastGameTimestamp && (
              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-300">Last Game</span>
                </div>
                <span className="text-sm text-gray-400">
                  {new Date(stats.lastGameTimestamp).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Insights */}
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <PieChart className="w-5 h-5 text-indigo-400" />
            Quick Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-indigo-400 mb-1">
                {stats.totalGames > 0 ? Math.round((stats.blackjackCount / stats.totalGames) * 100) : 0}%
              </div>
              <div className="text-xs text-gray-400">Blackjack Rate</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-cyan-400 mb-1">
                {stats.averageBet > 0 ? Math.round((stats.averagePayout / stats.averageBet) * 100) / 100 : 0}x
              </div>
              <div className="text-xs text-gray-400">Avg Payout Ratio</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold mb-1 ${
                stats.currentStreak > 5 ? 'text-green-400' :
                stats.currentStreak < -3 ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {stats.currentStreak > 0 ? '+' : ''}{stats.currentStreak}
              </div>
              <div className="text-xs text-gray-400">Win Streak</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}