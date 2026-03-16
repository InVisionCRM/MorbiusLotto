'use client'

import React, { useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  DollarSign,
  History,
  Target,
  Trophy,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  ExternalLink,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { useAccount } from 'wagmi'
import { useProfileForAddress } from '@/hooks/use-player-profile'
import { usePlinkoHistory } from '@/hooks/use-plinko-history'
import type { PlinkoDrop } from '@/lib/plinko-types'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(num: number): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

interface PlinkoPlayerDashboardProps {
  playerAddress: string | null
}

export function PlinkoPlayerDashboard({ playerAddress }: PlinkoPlayerDashboardProps) {
  const { address: connectedAddress } = useAccount()
  const normalizedViewing = playerAddress
    ? (playerAddress.startsWith('0x') ? playerAddress : `0x${playerAddress}`).toLowerCase()
    : ''
  const normalizedConnected = connectedAddress ? connectedAddress.toLowerCase() : ''
  const isViewingSelf = !!normalizedViewing && normalizedViewing === normalizedConnected

  const { drops, stats, isLoading } = usePlinkoHistory()

  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats')
  const [addressCopied, setAddressCopied] = useState(false)
  const [historySort, setHistorySort] = useState<'newest' | 'oldest' | 'profit'>('newest')
  const { displayName, profileImageUrl, avatarConfig } = useProfileForAddress(playerAddress)

  const handleCopyAddress = () => {
    if (!playerAddress) return
    navigator.clipboard
      .writeText(playerAddress)
      .then(() => {
        setAddressCopied(true)
        toast.success('Address copied')
        setTimeout(() => setAddressCopied(false), 2000)
      })
      .catch(() => toast.error('Failed to copy'))
  }

  const sortedForChart = useMemo(() => {
    return [...drops].sort((a, b) => a.timestamp - b.timestamp)
  }, [drops])

  const cumulativeChartData = useMemo(() => {
    if (sortedForChart.length === 0) {
      return [
        { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
        ...(stats
          ? [
              {
                play: stats.totalDrops,
                date: 'Now',
                totalInvested: Math.floor(stats.totalWagered),
                totalWon: Math.floor(stats.totalWon),
              },
            ]
          : []),
      ].filter(Boolean)
    }
    let cumulativeInvested = 0
    let cumulativeWon = 0
    const points: Array<{ play: number; date: string; totalInvested: number; totalWon: number }> = [
      { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
    ]
    sortedForChart.forEach((d, i) => {
      cumulativeInvested += d.wager
      cumulativeWon += d.winAmount
      if ((i + 1) % 5 === 0 || i === sortedForChart.length - 1) {
        points.push({
          play: i + 1,
          date: new Date(d.timestamp).toLocaleDateString(),
          totalInvested: Math.floor(cumulativeInvested),
          totalWon: Math.floor(cumulativeWon),
        })
      }
    })
    return points
  }, [sortedForChart, stats])

  const sortedHistory = useMemo(() => {
    const list = [...drops]
    switch (historySort) {
      case 'newest':
        return list.sort((a, b) => b.timestamp - a.timestamp)
      case 'oldest':
        return list.sort((a, b) => a.timestamp - b.timestamp)
      case 'profit':
        return list.sort((a, b) => b.profit - a.profit)
      default:
        return list
    }
  }, [drops, historySort])

  if (!playerAddress) return null

  if (!isViewingSelf) {
    return (
      <div className="space-y-6">
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
            <button
              type="button"
              onClick={handleCopyAddress}
              className="shrink-0 p-1.5 rounded text-white/60 hover:text-white transition-colors"
              title="Copy address"
              aria-label="Copy address"
            >
              {addressCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
        <div
          className="rounded-xl border border-cyan-500/30 bg-slate-900/80 p-6 text-center text-white/70"
          style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)' }}
        >
          <p>Plinko stats are only available for the connected wallet. Connect as this player to see their dashboard.</p>
        </div>
      </div>
    )
  }

  const totalDrops = stats?.totalDrops ?? 0
  const totalWagered = stats?.totalWagered ?? 0
  const totalWon = stats?.totalWon ?? 0
  const netProfit = stats?.netProfit ?? 0
  const winRate = stats?.winRate ?? 0
  const roi = totalWagered > 0 ? (netProfit / totalWagered) * 100 : 0

  const statsCards = [
    {
      title: 'Total Drops',
      value: totalDrops.toString(),
      icon: Activity,
      color: 'text-blue-400',
      subtitle: 'Balls dropped',
    },
    {
      title: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      icon: Target,
      color: winRate >= 50 ? 'text-green-400' : winRate >= 30 ? 'text-yellow-400' : 'text-red-400',
      subtitle: 'Drops with payout',
    },
    {
      title: 'Profit/Loss',
      value: `${netProfit >= 0 ? '+' : ''}${formatMorbius(netProfit >= 0 ? netProfit : -netProfit)} MORBIUS`,
      icon: netProfit >= 0 ? TrendingUp : TrendingDown,
      color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400',
      subtitle: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI`,
    },
    {
      title: 'Total Wagered',
      value: `${formatMorbius(totalWagered)} MORBIUS`,
      icon: DollarSign,
      color: 'text-purple-400',
      subtitle: 'Total bet',
    },
    {
      title: 'Total Won',
      value: `${formatMorbius(totalWon)} MORBIUS`,
      icon: Trophy,
      color: 'text-green-400',
      subtitle: 'Total payout',
    },
    {
      title: 'Biggest Win',
      value: stats ? `${formatMorbius(stats.biggestWin)} MORBIUS` : '—',
      icon: Zap,
      color: 'text-cyan-400',
      subtitle: stats ? `Best mult. ${stats.biggestMultiplier.toFixed(2)}x` : '—',
    },
  ]

  return (
    <div className="space-y-6">
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
        <button
          type="button"
          onClick={handleCopyAddress}
          className="shrink-0 p-1.5 rounded text-white/60 hover:text-white transition-colors"
          title="Copy address"
          aria-label="Copy address"
        >
          {addressCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

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
          History ({drops.length})
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : (
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

              <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700" style={PANEL_STYLE}>
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                    All-Time Performance
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    Cumulative total wagered vs total won over drops
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full min-w-0">
                    {cumulativeChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={cumulativeChartData}
                          margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                        >
                          <defs>
                            <linearGradient id="plinkoColorInvested" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="plinkoColorWon" x1="0" y1="0" x2="0" y2="1">
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
                            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
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
                            fill="url(#plinkoColorInvested)"
                            name="totalInvested"
                          />
                          <Area
                            type="monotone"
                            dataKey="totalWon"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            fill="url(#plinkoColorWon)"
                            name="totalWon"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-white/60">
                        <p>No drop data for chart</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden" style={PANEL_STYLE}>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-5 h-5" />
              Drop History ({drops.length})
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
            {sortedHistory.length === 0 ? (
              <div className="text-center py-12 text-white/60">
                <p>No drops yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/70 font-medium whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-white/70 font-medium text-center">Risk</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">Wager</TableHead>
                      <TableHead className="text-white/70 font-medium text-center">Mult.</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">Payout</TableHead>
                      <TableHead className="text-white/70 font-medium text-right">P/L</TableHead>
                      <TableHead className="text-white/70 font-medium w-16">Tx</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHistory.map((d: PlinkoDrop, i: number) => {
                      const win = d.profit > 0
                      const dateStr = new Date(d.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      return (
                        <TableRow
                          key={d.id ?? i}
                          className="border-white/5 hover:bg-white/5"
                        >
                          <TableCell className="text-white/80 text-xs font-mono py-2 whitespace-nowrap">
                            {dateStr}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span
                              className={`text-xs font-medium ${
                                d.riskLevel === 'GREEN'
                                  ? 'text-green-400'
                                  : d.riskLevel === 'YELLOW'
                                    ? 'text-yellow-400'
                                    : 'text-red-400'
                              }`}
                            >
                              {d.riskLevel}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs tabular-nums text-white/90">
                            {formatMorbius(d.wager)}
                          </TableCell>
                          <TableCell className="py-2 text-center text-xs tabular-nums text-white/90">
                            {d.multiplier.toFixed(2)}x
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs tabular-nums text-white/90">
                            {formatMorbius(d.winAmount)}
                          </TableCell>
                          <TableCell
                            className={`py-2 text-right text-xs tabular-nums font-medium ${
                              win ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {win ? '+' : ''}{formatMorbius(win ? d.profit : -d.profit)}
                          </TableCell>
                          <TableCell className="py-2 w-16">
                            {d.transactionHash ? (
                              <a
                                href={`https://scan.pulsechain.com/tx/${d.transactionHash}`}
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
