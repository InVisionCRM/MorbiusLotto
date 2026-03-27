'use client'

import React, { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { usePlayerProfileGames, useProfileForAddress } from '@/hooks/use-player-profile'
import { useQuery } from '@tanstack/react-query'
import { isAdminWallet } from '@/lib/admin'
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
  Clock,
  Crown,
  Wallet,
  ShieldAlert,
} from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'
import { toast } from 'sonner'
import { formatEther } from 'viem'
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
import { PlayerStatsFeatureGrid } from '@/components/ui/player-stats-feature-grid'
import { GameHistory } from '@/components/BLACKJACK/GameHistory'
import { CreatorDashboard } from '@/components/Creators/CreatorDashboard'
import { PlayerAuditView } from '@/components/BLACKJACK/PlayerAuditView'
import AvatarView from '@/components/poker/avatar/AvatarView'
import type { BlackjackWebSocketClient } from '@/lib/websocket-client'
import type { GameHistoryEntry } from '@/components/BLACKJACK/GameHistory'

interface HistoryHandData {
  game_id: string
  cards: number[]
  total: number
  result: 'win' | 'loss' | 'push' | 'blackjack'
  payout: bigint
  actions: Array<{ type?: string }>
}

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
  playerAddress?: string | null // Optional: if provided, fetch game history for cumulative chart
  wsClient?: BlackjackWebSocketClient | null // Optional: if provided, show Creator tab
  /** Playable server balance (wei) — when provided, shown as top stat */
  reserveBalance?: bigint
}

export function PlayerStatsDashboard({ stats, isLoading, playerAddress, wsClient, reserveBalance }: PlayerStatsDashboardProps) {
  const { address: connectedAddress } = useAccount()
  const isAdmin = isAdminWallet(connectedAddress)
  const [activeTab, setActiveTab] = useState<'stats' | 'history' | 'creator' | 'audit'>('stats')
  const { displayName, profileImageUrl, avatarConfig } = useProfileForAddress(playerAddress ?? null)

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

  // profitLoss is already in MORBIUS (human units) from the API transform — do not use formatCurrency
  const formatProfitLoss = (amount: number) =>
    amount.toLocaleString(undefined, { maximumFractionDigits: 2 })

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
    ...(reserveBalance !== undefined
      ? [
          {
            title: 'Balance',
            value: `${formatCurrency(reserveBalance)} MORBIUS`,
            icon: Wallet,
            subtitle: 'Playable balance',
            valueClassName: 'text-cyan-300'
          }
        ]
      : []),
    {
      title: 'Total Games',
      value: stats.totalGames.toLocaleString(),
      icon: Activity,
      subtitle: `${stats.gamesToday} today, ${stats.gamesThisWeek} this week`,
      valueClassName: 'text-cyan-300'
    },
    {
      title: 'Win Rate',
      value: `${Math.round(stats.winRate)}%`,
      icon: Target,
      subtitle: `${stats.blackjackCount} blackjacks`,
      valueClassName: getWinRateColor(stats.winRate)
    },
    {
      title: 'Profit/Loss',
      value: `${stats.profitLoss > 0 ? '+' : ''}${formatProfitLoss(stats.profitLoss)} MORBIUS`,
      icon: stats.profitLoss >= 0 ? TrendingUp : TrendingDown,
      subtitle: `${stats.roi > 0 ? '+' : ''}${Math.round(stats.roi)}% ROI`,
      valueClassName: getProfitColor(stats.profitLoss)
    },
    {
      title: 'Total Wagered',
      value: `${formatCurrency(stats.totalBet)} MORBIUS`,
      icon: DollarSign,
      subtitle: `Avg bet: ${formatCurrency(stats.averageBet)} MORBIUS`,
      valueClassName: 'text-neutral-100'
    },
    {
      title: 'Total Won',
      value: `${formatCurrency(stats.totalWin)} MORBIUS`,
      icon: Trophy,
      subtitle: `Avg payout: ${formatCurrency(stats.averagePayout)} MORBIUS`,
      valueClassName: 'text-cyan-300'
    },
    {
      title: 'Current Streak',
      value: stats.currentStreak.toString(),
      icon: BarChart3,
      subtitle: `Best: ${stats.bestStreak} wins`,
      valueClassName: stats.currentStreak > 0 ? 'text-green-400' : 'text-red-400'
    }
  ]

  // Fetch game history for cumulative chart and history tab
  const { data: games, isLoading: gamesLoading } = usePlayerProfileGames(playerAddress, 1000) // Fetch up to 1000 games for all-time data
  const completedGames = useMemo(
    () => (games ?? []).filter((g) => g.result && g.completed_at),
    [games]
  )
  const historyGames = useMemo(() => completedGames.slice(0, 100), [completedGames])

  const { data: historyHandsByGame = {}, isLoading: handsLoading } = useQuery<Record<string, HistoryHandData[]>>({
    queryKey: ['playerProfileHistoryHands', historyGames.map((g) => g.game_id).join('|')],
    enabled: historyGames.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        historyGames.map(async (game) => {
          try {
            const response = await fetch(`/api/game/${encodeURIComponent(game.game_id)}/hands`)
            if (!response.ok) return [game.game_id, []] as const
            const data = await response.json()
            const hands = (Array.isArray(data) ? data : []).map((hand: any) => ({
              game_id: String(hand.game_id ?? game.game_id),
              cards: Array.isArray(hand.cards)
                ? hand.cards.map((card: unknown) => Number(card)).filter((n: number) => Number.isFinite(n))
                : [],
              total: Number(hand.total ?? 0),
              result: (hand.result ?? 'loss') as 'win' | 'loss' | 'push' | 'blackjack',
              payout: BigInt(typeof hand.payout === 'string' ? hand.payout : String(hand.payout ?? 0)),
              actions: Array.isArray(hand.actions) ? hand.actions : [],
            }))
            return [game.game_id, hands] as const
          } catch {
            return [game.game_id, []] as const
          }
        })
      )
      return Object.fromEntries(entries)
    },
    staleTime: 30_000,
  })

  // Convert games to GameHistoryEntry format for History tab
  const historyEntries: GameHistoryEntry[] = useMemo(() => {
    return completedGames
      .map((game) => ({
        id: game.id,
        gameId: game.game_id,
        timestamp: new Date(game.completed_at || game.created_at).getTime(),
        betAmount: game.total_bet_amount,
        payout: game.total_payout,
        result: game.result as 'win' | 'loss' | 'push' | 'blackjack',
        playerHands: (historyHandsByGame[game.game_id] ?? []).map((hand) => ({
          cards: hand.cards,
          total: hand.total,
          result: hand.result,
          payout: hand.payout,
        })),
        dealerCards: game.dealer_cards,
        dealerTotal: game.dealer_total,
        verified: false,
        wasSplit: (historyHandsByGame[game.game_id] ?? []).length > 1,
        wasDoubleDown: (historyHandsByGame[game.game_id] ?? []).some((hand) =>
          (hand.actions ?? []).some((action) => action?.type === 'double_down')
        ),
      }))
  }, [completedGames, historyHandsByGame])

  // Build cumulative area chart data from game history
  const cumulativeChartData = useMemo(() => {
    if (!games || games.length === 0) {
      // If no game history, create a simple representation with current totals
      return [
        {
          game: 0,
          date: 'Start',
          totalInvested: 0,
          totalWon: 0,
        },
        {
          game: stats.totalGames,
          date: 'Now',
          totalInvested: Math.floor(Number(formatEther(stats.totalBet))),
          totalWon: Math.floor(Number(formatEther(stats.totalWin))),
        },
      ]
    }

    // Sort games by completion time (oldest first)
    const sortedGames = [...games]
      .filter((g) => g.completed_at && g.result)
      .sort((a, b) => {
        const timeA = new Date(a.completed_at || a.created_at).getTime()
        const timeB = new Date(b.completed_at || b.created_at).getTime()
        return timeA - timeB
      })

    // Build cumulative data points
    let cumulativeInvested = 0
    let cumulativeWon = 0
    const dataPoints: Array<{
      game: number
      date: string
      totalInvested: number
      totalWon: number
    }> = [
      {
        game: 0,
        date: sortedGames.length > 0 ? new Date(sortedGames[0].created_at).toLocaleDateString() : 'Start',
        totalInvested: 0,
        totalWon: 0,
      },
    ]

    sortedGames.forEach((game, index) => {
      cumulativeInvested += Math.floor(Number(formatEther(game.total_bet_amount)))
      cumulativeWon += Math.floor(Number(formatEther(game.total_payout)))
      
      // Add data point every 10 games or at the end
      if ((index + 1) % 10 === 0 || index === sortedGames.length - 1) {
        dataPoints.push({
          game: index + 1,
          date: new Date(game.completed_at || game.created_at).toLocaleDateString(),
          totalInvested: cumulativeInvested,
          totalWon: cumulativeWon,
        })
      }
    })

    return dataPoints
  }, [games, stats])

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

  // Determine available tabs
  const availableTabs = [
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'history' as const, label: 'History', icon: Activity },
    ...(wsClient && playerAddress ? [{ id: 'creator' as const, label: 'Creator', icon: Crown }] : []),
    ...(playerAddress ? [{ id: 'audit' as const, label: 'Audit', icon: ShieldAlert }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Address: avatar if present, full address, copy — no box */}
      {playerAddress && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          {avatarConfig ? (
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 flex items-center justify-center rounded overflow-hidden bg-black/30">
              <AvatarView config={avatarConfig} compact className="h-8 w-8 sm:h-9 sm:w-9" />
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
      {availableTabs.length > 1 && (
        <div className="flex gap-2 border-b border-white/10 mb-6">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <>
      {/* Main Stats Grid */}
      <PlayerStatsFeatureGrid
        items={statsCards}
        className="border border-white/10 rounded-xl overflow-hidden"
      />

      {/* Cumulative Investment vs Winnings Chart */}
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            All-Time Performance
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Cumulative total invested vs total won over time
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full min-w-0">
            {gamesLoading ? (
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
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="colorWon" x1="0" y1="0" x2="0" y2="1">
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
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
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
                      name === 'totalInvested' ? 'Total Invested' : 'Total Won',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="line"
                    formatter={(value) => (value === 'totalInvested' ? 'Total Invested' : 'Total Won')}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalInvested"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorInvested)"
                    name="totalInvested"
                  />
                  <Area
                    type="monotone"
                    dataKey="totalWon"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorWon)"
                    name="totalWon"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-white/60">
                <p>No game data available for chart</p>
              </div>
            )}
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
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <GameHistory history={historyEntries} isLoading={gamesLoading || handsLoading} />
      )}

      {/* Creator Tab */}
      {activeTab === 'creator' && wsClient && playerAddress && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardContent className="p-6">
            <CreatorDashboard wsClient={wsClient} address={playerAddress} />
          </CardContent>
        </Card>
      )}

      {/* Audit Tab */}
      {activeTab === 'audit' && playerAddress && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Balance Audit Trail
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Full reconstructed event timeline — deposits, withdrawals, and game results with running balance.
              Flags potential exploits or anomalies.
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <PlayerAuditView
              playerAddress={playerAddress}
              games={games ?? []}
              gamesLoading={gamesLoading}
              actualBalance={reserveBalance}
              showEventsColumn={isAdmin}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}