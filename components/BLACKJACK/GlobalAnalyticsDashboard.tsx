'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  BarChart3,
  PieChart,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Target,
  Zap,
  Calendar,
  Globe
} from 'lucide-react'
import { formatEther } from 'viem'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface GlobalAnalytics {
  // Overall Metrics
  totalPlayers: number
  activePlayers: number
  totalGamesPlayed: number
  totalVolume: bigint
  totalPayouts: bigint
  houseProfit: bigint

  // Time-based Metrics
  gamesLastHour: number
  gamesLast24Hours: number
  volumeLast24Hours: bigint
  profitLast24Hours: bigint

  // Performance Metrics
  averageWinRate: number
  averageBetSize: number
  houseEdge: number
  peakConcurrentUsers: number

  // System Health
  serverUptime: number
  averageResponseTime: number
  errorRate: number
  activeConnections: number

  // Game-specific Metrics
  blackjackRate: number
  splitRate: number
  doubleDownRate: number
  surrenderRate: number

  // Financial Metrics
  reserveBalance: bigint
  pendingSettlements: number
  failedSettlements: number
  averageSettlementTime: number

  // Risk Metrics
  highRollerCount: number
  suspiciousActivity: number
  largestBet: bigint
  largestPayout: bigint
}

interface GlobalAnalyticsDashboardProps {
  analytics: GlobalAnalytics
  onRefresh?: () => void
  isLoading?: boolean
  timeRange?: '1h' | '24h' | '7d' | '30d'
  onTimeRangeChange?: (range: '1h' | '24h' | '7d' | '30d') => void
}

export function GlobalAnalyticsDashboard({
  analytics,
  onRefresh,
  isLoading,
  timeRange = '24h',
  onTimeRangeChange
}: GlobalAnalyticsDashboardProps) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)

  // Guard against missing analytics
  if (!analytics) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-2">No analytics data available</div>
        <div className="text-sm text-gray-500">Make sure the backend server is running</div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  const formatCurrency = (amount: bigint) => {
    const num = Number(formatEther(amount))
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toFixed(2)
  }

  const formatPercentage = (value: number) => `${value.toFixed(2)}%`

  const getHealthColor = (metric: string, value: number) => {
    switch (metric) {
      case 'uptime':
        return value > 99.5 ? 'text-green-400' : value > 99 ? 'text-yellow-400' : 'text-red-400'
      case 'responseTime':
        return value < 100 ? 'text-green-400' : value < 500 ? 'text-yellow-400' : 'text-red-400'
      case 'errorRate':
        return value < 0.1 ? 'text-green-400' : value < 1 ? 'text-yellow-400' : 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const overviewCards = [
    {
      title: 'Total Volume',
      value: `${formatCurrency(analytics.totalVolume)} PLS`,
      change: analytics.volumeLast24Hours,
      changeLabel: '24h',
      icon: DollarSign,
      color: 'text-green-400',
      trend: 'up'
    },
    {
      title: 'House Profit',
      value: `${formatCurrency(analytics.houseProfit)} PLS`,
      change: analytics.profitLast24Hours,
      changeLabel: '24h',
      icon: TrendingUp,
      color: 'text-blue-400',
      trend: analytics.houseProfit > BigInt(0) ? 'up' : 'down'
    },
    {
      title: 'Active Players',
      value: analytics.activePlayers.toLocaleString(),
      change: analytics.activePlayers,
      changeLabel: 'now',
      icon: Users,
      color: 'text-purple-400',
      trend: 'neutral'
    },
    {
      title: 'Games Played',
      value: analytics.totalGamesPlayed.toLocaleString(),
      change: analytics.gamesLast24Hours,
      changeLabel: '24h',
      icon: Activity,
      color: 'text-cyan-400',
      trend: 'up'
    }
  ]

  const performanceMetrics = [
    {
      label: 'Average Win Rate',
      value: formatPercentage(analytics.averageWinRate),
      icon: Target,
      color: analytics.averageWinRate > 45 ? 'text-green-400' : analytics.averageWinRate > 40 ? 'text-yellow-400' : 'text-red-400'
    },
    {
      label: 'House Edge',
      value: formatPercentage(analytics.houseEdge),
      icon: BarChart3,
      color: analytics.houseEdge > 0 ? 'text-green-400' : 'text-red-400'
    },
    {
      label: 'Average Bet Size',
      value: `${formatCurrency(BigInt(Math.floor(analytics.averageBetSize * 1e18)))} PLS`,
      icon: DollarSign,
      color: 'text-blue-400'
    },
    {
      label: 'Blackjack Rate',
      value: formatPercentage(analytics.blackjackRate),
      icon: Target,
      color: 'text-purple-400'
    }
  ]

  const systemHealth = [
    {
      label: 'Server Uptime',
      value: formatPercentage(analytics.serverUptime),
      icon: CheckCircle,
      color: getHealthColor('uptime', analytics.serverUptime)
    },
    {
      label: 'Avg Response Time',
      value: `${analytics.averageResponseTime}ms`,
      icon: Zap,
      color: getHealthColor('responseTime', analytics.averageResponseTime)
    },
    {
      label: 'Error Rate',
      value: formatPercentage(analytics.errorRate),
      icon: XCircle,
      color: getHealthColor('errorRate', analytics.errorRate)
    },
    {
      label: 'Active Connections',
      value: analytics.activeConnections.toLocaleString(),
      icon: Globe,
      color: 'text-cyan-400'
    }
  ]

  const riskMetrics = [
    {
      label: 'High Rollers',
      value: analytics.highRollerCount.toString(),
      icon: AlertTriangle,
      color: analytics.highRollerCount > 10 ? 'text-yellow-400' : 'text-green-400'
    },
    {
      label: 'Suspicious Activity',
      value: analytics.suspiciousActivity.toString(),
      icon: AlertTriangle,
      color: analytics.suspiciousActivity > 0 ? 'text-red-400' : 'text-green-400'
    },
    {
      label: 'Largest Bet',
      value: `${formatCurrency(analytics.largestBet)} PLS`,
      icon: DollarSign,
      color: 'text-orange-400'
    },
    {
      label: 'Failed Settlements',
      value: analytics.failedSettlements.toString(),
      icon: XCircle,
      color: analytics.failedSettlements > 0 ? 'text-red-400' : 'text-green-400'
    }
  ]

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 bg-gray-700 rounded animate-pulse w-64"></div>
          <div className="h-10 bg-gray-700 rounded animate-pulse w-32"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Global Analytics Dashboard</h2>
          <p className="text-gray-400">Real-time casino performance metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            id="analytics-time-range"
            value={timeRange}
            onChange={(e) => onTimeRangeChange?.(e.target.value as any)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            title="Time range"
            aria-label="Time range for analytics"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <Button
            onClick={onRefresh}
            variant="outline"
            size="sm"
            className="text-gray-300 border-gray-600"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {overviewCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 hover:border-gray-600 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.color} mb-1`}>
                  {card.value}
                </div>
                <div className="flex items-center text-xs">
                  <span className="text-gray-500">{card.changeLabel}: </span>
                  <span className={`ml-1 ${
                    card.trend === 'up' ? 'text-green-400' :
                    card.trend === 'down' ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {typeof card.change === 'bigint' ? formatCurrency(card.change) : card.change.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="performance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-gray-800">
          <TabsTrigger value="performance" className="data-[state=active]:bg-blue-600">
            Performance
          </TabsTrigger>
          <TabsTrigger value="system" className="data-[state=active]:bg-green-600">
            System Health
          </TabsTrigger>
          <TabsTrigger value="financial" className="data-[state=active]:bg-purple-600">
            Financial
          </TabsTrigger>
          <TabsTrigger value="risk" className="data-[state=active]:bg-red-600">
            Risk Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {performanceMetrics.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">{metric.label}</p>
                        <p className={`text-2xl font-bold ${metric.color}`}>
                          {metric.value}
                        </p>
                      </div>
                      <metric.icon className={`h-8 w-8 ${metric.color} opacity-75`} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Performance Charts Placeholder */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Performance Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Performance charts would be displayed here</p>
                  <p className="text-sm mt-2">Integration with charting library needed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {systemHealth.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">{metric.label}</p>
                        <p className={`text-2xl font-bold ${metric.color}`}>
                          {metric.value}
                        </p>
                      </div>
                      <metric.icon className={`h-8 w-8 ${metric.color} opacity-75`} />
                    </div>
                    {metric.label === 'Server Uptime' && (
                      <Progress
                        value={analytics.serverUptime}
                        className="mt-3 h-2"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reserve Balance */}
            <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-400" />
                  Reserve Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-400 mb-2">
                  {formatCurrency(analytics.reserveBalance)} PLS
                </div>
                <div className="text-sm text-gray-400 mb-4">
                  Available for payouts
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pending Settlements</span>
                    <span className="text-yellow-400">{analytics.pendingSettlements}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Failed Settlements</span>
                    <span className="text-red-400">{analytics.failedSettlements}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Avg Settlement Time</span>
                    <span className="text-cyan-400">{analytics.averageSettlementTime}s</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Volume Breakdown */}
            <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-purple-400" />
                  Volume Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Total Volume</span>
                    <span className="text-white font-bold">
                      {formatCurrency(analytics.totalVolume)} PLS
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">24h Volume</span>
                    <span className="text-cyan-400">
                      {formatCurrency(analytics.volumeLast24Hours)} PLS
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">House Profit</span>
                    <span className={`font-bold ${
                      analytics.houseProfit > BigInt(0) ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {analytics.houseProfit > BigInt(0) ? '+' : ''}{formatCurrency(analytics.houseProfit)} PLS
                    </span>
                  </div>
                  <Progress
                    value={analytics.houseProfit > BigInt(0) ?
                      Number(analytics.houseProfit) / Number(analytics.totalVolume) * 100 : 0
                    }
                    className="mt-4 h-2"
                  />
                  <div className="text-xs text-gray-500 text-center">
                    House Edge: {formatPercentage(analytics.houseEdge)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {riskMetrics.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">{metric.label}</p>
                        <p className={`text-2xl font-bold ${metric.color}`}>
                          {metric.value}
                        </p>
                      </div>
                      <metric.icon className={`h-8 w-8 ${metric.color} opacity-75`} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Risk Alerts */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                Risk Alerts & Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.suspiciousActivity > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-red-400 font-medium">Suspicious Activity Detected</p>
                      <p className="text-sm text-gray-400">
                        {analytics.suspiciousActivity} suspicious activities require investigation
                      </p>
                    </div>
                  </div>
                )}

                {analytics.failedSettlements > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                    <XCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-yellow-400 font-medium">Settlement Failures</p>
                      <p className="text-sm text-gray-400">
                        {analytics.failedSettlements} settlements failed - check blockchain connectivity
                      </p>
                    </div>
                  </div>
                )}

                {analytics.errorRate > 1 && (
                  <div className="flex items-center gap-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-orange-400 font-medium">High Error Rate</p>
                      <p className="text-sm text-gray-400">
                        Error rate is {formatPercentage(analytics.errorRate)} - investigate system issues
                      </p>
                    </div>
                  </div>
                )}

                {analytics.reserveBalance < analytics.totalVolume / BigInt(10) && (
                  <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <DollarSign className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-blue-400 font-medium">Low Reserve Balance</p>
                      <p className="text-sm text-gray-400">
                        Reserve balance is low relative to volume - consider topping up
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}