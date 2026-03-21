'use client'

import React, { useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import {
  Activity,
  BarChart3,
  DollarSign,
  History,
  Target,
  Trophy,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AvatarPreview from '@/components/poker/avatar/AvatarPreview'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useProfileForAddress } from '@/hooks/use-player-profile'
import type { InstantLotteryResultRow } from '@/hooks/use-instant-lottery'
import type { LotteryPlayerStatsResult } from '@/hooks/use-instant-lottery'
import { TOKEN_DECIMALS } from '@/lib/contracts'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return parseFloat(formatUnits(wei, TOKEN_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

interface LotteryPlayerDashboardProps {
  stats: LotteryPlayerStatsResult
  results: InstantLotteryResultRow[]
  playerAddress: string | null
  isLoadingResults?: boolean
}

export function LotteryPlayerDashboard({
  stats,
  results,
  playerAddress,
  isLoadingResults = false,
}: LotteryPlayerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats')
  const [historySort, setHistorySort] = useState<'newest' | 'oldest' | 'profit'>('newest')
  const { displayName, profileImageUrl, avatarConfig } = useProfileForAddress(playerAddress)

  // Sort results for history: ensure we have a consistent order (newest first by default for display)
  const sortedForChart = useMemo(() => {
    const list = [...results].filter((r) => r.timestamp != null || r.blockNumber != null)
    return list.sort((a, b) => {
      const ta = a.timestamp ?? (a.blockNumber ? Number(a.blockNumber) * 2 : 0)
      const tb = b.timestamp ?? (b.blockNumber ? Number(b.blockNumber) * 2 : 0)
      return ta - tb
    })
  }, [results])

  const cumulativeChartData = useMemo(() => {
    if (sortedForChart.length === 0) {
      return [
        { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
        {
          play: Number(stats.totalPlays),
          date: 'Now',
          totalInvested: Math.floor(Number(stats.totalWagered) / 1e18),
          totalWon: Math.floor(Number(stats.totalWon) / 1e18),
        },
      ]
    }
    let cumulativeInvested = 0
    let cumulativeWon = 0
    const points: Array<{ play: number; date: string; totalInvested: number; totalWon: number }> = [
      { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
    ]
    sortedForChart.forEach((r, i) => {
      cumulativeInvested += Math.floor(Number(r.wager) / 1e18)
      cumulativeWon += Math.floor(Number(r.netPayout) / 1e18)
      if ((i + 1) % 5 === 0 || i === sortedForChart.length - 1) {
        const ts = r.timestamp ?? (r.blockNumber ? Number(r.blockNumber) * 12 : 0)
        points.push({
          play: i + 1,
          date: ts ? new Date(ts * 1000).toLocaleDateString() : `#${i + 1}`,
          totalInvested: cumulativeInvested,
          totalWon: cumulativeWon,
        })
      }
    })
    return points
  }, [sortedForChart, stats.totalPlays, stats.totalWagered, stats.totalWon])

  const sortedHistory = useMemo(() => {
    const list = [...results]
    switch (historySort) {
      case 'newest':
        return list.sort((a, b) => {
          const ta = a.timestamp ?? (a.blockNumber ? Number(a.blockNumber) : 0)
          const tb = b.timestamp ?? (b.blockNumber ? Number(b.blockNumber) : 0)
          return tb - ta
        })
      case 'oldest':
        return list.sort((a, b) => {
          const ta = a.timestamp ?? (a.blockNumber ? Number(a.blockNumber) : 0)
          const tb = b.timestamp ?? (b.blockNumber ? Number(b.blockNumber) : 0)
          return ta - tb
        })
      case 'profit':
        return list.sort((a, b) => {
          const pa = Number(a.netPayout) - Number(a.wager)
          const pb = Number(b.netPayout) - Number(b.wager)
          return pb - pa
        })
      default:
        return list
    }
  }, [results, historySort])

  const statsCards = [
    {
      title: 'Total Plays',
      value: stats.totalPlays.toString(),
      icon: Activity,
      color: 'text-blue-400',
      subtitle: 'Instant lottery games',
    },
    {
      title: 'Win Rate',
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Target,
      color: stats.winRate >= 50 ? 'text-green-400' : stats.winRate >= 30 ? 'text-yellow-400' : 'text-red-400',
      subtitle: 'Matches won',
    },
    {
      title: 'Profit/Loss',
      value: `${stats.profitLoss >= 0n ? '+' : '-'}${formatMorbius(stats.profitLoss >= 0n ? stats.profitLoss : -stats.profitLoss)} MORBIUS`,
      icon: stats.profitLoss >= 0n ? TrendingUp : TrendingDown,
      color: stats.profitLoss >= 0n ? 'text-emerald-400' : 'text-red-400',
      subtitle: 'Net result',
    },
    {
      title: 'Total Wagered',
      value: `${formatMorbius(stats.totalWagered)} MORBIUS`,
      icon: DollarSign,
      color: 'text-purple-400',
      subtitle: 'Total bet',
    },
    {
      title: 'Total Won',
      value: `${formatMorbius(stats.totalWon)} MORBIUS`,
      icon: Trophy,
      color: 'text-green-400',
      subtitle: 'Total payout',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Address row */}
      {playerAddress && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          {avatarConfig ? (
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 flex items-center justify-center rounded overflow-hidden bg-black/30">
              <AvatarPreview config={avatarConfig} compact className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>
          ) : profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt=""
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover shrink-0"
            />
          ) : null}
          {displayName && (
            <span className="text-sm font-medium text-white shrink-0">{displayName}</span>
          )}
          <span className="font-mono text-xs sm:text-sm text-cyan-300/90 break-all min-w-0" title={playerAddress}>
            {playerAddress}
          </span>
          <CopyButton
            content={playerAddress}
            copyToast="Address copied"
            variant="ghost"
            size="default"
            className="p-1.5 h-9 w-9 text-white/60 hover:text-white"
            title="Copy address"
            aria-label="Copy address"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'stats'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          History ({results.length})
        </button>
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statsCards.map((stat) => (
              <Card
                key={stat.title}
                className="bg-gradient-to-br from-gray-900 to-black border-gray-700"
                style={PANEL_STYLE}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">{stat.title}</CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
                  <p className="text-xs text-gray-500">{stat.subtitle}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cumulative chart */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700" style={PANEL_STYLE}>
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                All-Time Performance
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Cumulative total wagered vs total won over plays
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full min-w-0">
                {isLoadingResults ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  </div>
                ) : cumulativeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={cumulativeChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="lotteryColorInvested" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="lotteryColorWon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(17, 24, 39, 0.95)',
                          border: '1px solid rgba(75, 85, 99, 0.5)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'rgb(209, 213, 219)' }}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString()} MORBIUS`,
                          name === 'totalInvested' ? 'Total Wagered' : 'Total Won',
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="line"
                        formatter={(v) => (v === 'totalInvested' ? 'Total Wagered' : 'Total Won')}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalInvested"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fill="url(#lotteryColorInvested)"
                        name="totalInvested"
                      />
                      <Area
                        type="monotone"
                        dataKey="totalWon"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        fill="url(#lotteryColorWon)"
                        name="totalWon"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-white/60">
                    <p>No play data for chart</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden" style={PANEL_STYLE}>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-5 h-5" />
              Game History ({results.length})
            </CardTitle>
            <select
              title="Sort by"
              aria-label="Sort by"
              value={historySort}
              onChange={(e) => setHistorySort(e.target.value as 'newest' | 'oldest' | 'profit')}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="profit">By profit</option>
            </select>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingResults ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              </div>
            ) : sortedHistory.length === 0 ? (
              <div className="text-center py-12 text-white/60">
                <p>No plays yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/70 font-medium whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-white/70 font-medium text-center">Your numbers</TableHead>
                      <TableHead className="text-white/70 font-medium text-center">Winning numbers</TableHead>
                      <TableHead className="text-white/70 font-medium text-center">Matches</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">Wager</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">Payout</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">P/L</TableHead>
                      <TableHead className="text-white/70 font-medium w-16">Tx</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHistory.map((r, i) => {
                      const netPl = r.netPayout - r.wager
                      const win = netPl > 0n
                      const dateStr =
                        r.timestamp != null
                          ? new Date(r.timestamp * 1000).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : r.blockNumber != null
                            ? `Block ${r.blockNumber.toString()}`
                            : '—'
                      return (
                        <TableRow key={`${r.transactionHash ?? i}-${i}`} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-white/80 text-xs font-mono py-2 whitespace-nowrap">
                            {dateStr}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span className="text-xs text-white/90 font-mono">
                              [{[...r.playerNumbers].sort((a, b) => a - b).join(', ')}]
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span className="text-xs text-cyan-300 font-mono">
                              [{[...r.winningNumbers].sort((a, b) => a - b).join(', ')}]
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span className="text-xs font-medium text-white">{r.matchCount}</span>
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs tabular-nums text-white/90">
                            {formatMorbius(r.wager)}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs tabular-nums text-white/90">
                            {formatMorbius(r.netPayout)}
                          </TableCell>
                          <TableCell
                            className={`py-2 text-right text-xs tabular-nums font-medium ${
                              win ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {win ? '+' : ''}{formatMorbius(win ? netPl : -netPl)}
                          </TableCell>
                          <TableCell className="py-2 w-16">
                            {r.transactionHash ? (
                              <a
                                href={`https://scan.pulsechain.com/tx/${r.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 inline-flex"
                                title="View on PulseScan"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="text-white/30">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
