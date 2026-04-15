'use client'

import React, { useMemo, useState, useCallback } from 'react'
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
  Crown,
  Wallet,
  ShieldAlert,
  CircleDot,
  ChevronDown,
  ChevronUp,
  Hash,
} from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'
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
import { useRoulettePlayerStats } from '@/hooks/use-roulette-results'
import {
  getPocketColor,
  ROULETTE_RED_HEX,
  ROULETTE_BLACK_HEX,
  ROULETTE_GREEN_HEX,
} from '@/components/Roulette/roulette-constants'
import type { RouletteSpinRow } from '@/hooks/use-roulette-results'
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

// ── Roulette spin history with expandable rows ──────────────────────────────

function fmtWei(wei: bigint): string {
  const n = Math.round(Number(formatEther(wei)))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString()
}

function RoulettePocketBadge({ n }: { n: number }) {
  const color = getPocketColor(n)
  const bg = color === 'red' ? ROULETTE_RED_HEX : color === 'green' ? ROULETTE_GREEN_HEX : ROULETTE_BLACK_HEX
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black text-white"
      style={{ backgroundColor: bg, borderColor: 'rgba(255,255,255,0.22)' }}
    >
      {n}
    </span>
  )
}

function RouletteSpinHistoryRow({ spin }: { spin: RouletteSpinRow }) {
  const [open, setOpen] = useState(false)
  const profitLoss = spin.netPayout - spin.totalWagered
  const won = profitLoss > 0n
  const color = getPocketColor(spin.result)
  const dateStr = spin.timestamp
    ? new Date(spin.timestamp * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
      >
        <RoulettePocketBadge n={spin.result} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold capitalize ${color === 'red' ? 'text-red-400' : color === 'green' ? 'text-green-400' : 'text-gray-300'}`}>
              {color} · {spin.result}
              {spin.result !== 0 && ` · ${spin.result % 2 === 0 ? 'Even' : 'Odd'} · ${spin.result <= 18 ? 'Low' : 'High'}`}
            </span>
          </div>
          <div className="text-[10px] text-gray-500">{dateStr}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${won ? 'text-green-400' : 'text-red-400'}`}>
            {won ? '+' : ''}{fmtWei(profitLoss)} M
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 bg-black/30 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Wagered</div>
            <div className="font-bold text-neutral-100">{fmtWei(spin.totalWagered)} M</div>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Gross Payout</div>
            <div className="font-bold text-neutral-100">{fmtWei(spin.grossPayout)} M</div>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Net Payout</div>
            <div className="font-bold text-neutral-100">{fmtWei(spin.netPayout)} M</div>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Profit / Loss</div>
            <div className={`font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>
              {won ? '+' : ''}{fmtWei(profitLoss)} M
            </div>
          </div>
          {spin.transactionHash && (
            <div className="col-span-2 sm:col-span-4 rounded-lg bg-white/5 px-3 py-2">
              <div className="text-gray-500 mb-0.5 flex items-center gap-1"><Hash className="w-3 h-3" />Tx Hash</div>
              <div className="font-mono text-[10px] text-cyan-300/80 break-all">{spin.transactionHash}</div>
            </div>
          )}
          {spin.paidWithPLS && (
            <div className="col-span-2 sm:col-span-4 text-[10px] text-yellow-400/80">Paid with PLS</div>
          )}
        </div>
      )}
    </div>
  )
}

function RouletteSpinHistory({
  results,
  playerAddress,
}: {
  results: RouletteSpinRow[]
  playerAddress?: string | null
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm">
        No roulette spins found{playerAddress ? ' for this address' : ''}.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {results.map((spin) => (
        <RouletteSpinHistoryRow key={`${spin.spinId}-${spin.transactionHash}`} spin={spin} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<'stats' | 'history' | 'roulette' | 'creator' | 'audit'>('stats')
  const { displayName } = useProfileForAddress(playerAddress ?? null)
  const rouletteStats = useRoulettePlayerStats(playerAddress as `0x${string}` | undefined)

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
      subtitle: `${stats.blackjackCount} blackjacks · Best streak: ${stats.bestStreak}`,
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

  // Determine available tabs
  const availableTabs = [
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'history' as const, label: 'History', icon: Activity },
    { id: 'roulette' as const, label: 'Roulette', icon: CircleDot },
    ...(wsClient && playerAddress ? [{ id: 'creator' as const, label: 'Creator', icon: Crown }] : []),
    ...(playerAddress ? [{ id: 'audit' as const, label: 'Audit', icon: ShieldAlert }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Address, display name, and copy */}
      {playerAddress && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
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

      {/* Per-game breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Blackjack */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-cyan-400" />
              Blackjack
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <div className="text-xs text-gray-500">Games</div>
              <div className="font-bold text-cyan-300">{stats.totalGames.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Win Rate</div>
              <div className={`font-bold ${getWinRateColor(stats.winRate)}`}>{Math.round(stats.winRate)}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Wagered</div>
              <div className="font-bold text-neutral-100">{formatCurrency(stats.totalBet)} M</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Profit / Loss</div>
              <div className={`font-bold ${getProfitColor(stats.profitLoss)}`}>
                {stats.profitLoss > 0 ? '+' : ''}{formatProfitLoss(stats.profitLoss)} M
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Blackjacks</div>
              <div className="font-bold text-yellow-400">{stats.blackjackCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Best Streak</div>
              <div className="font-bold text-neutral-100">{stats.bestStreak}</div>
            </div>
          </CardContent>
        </Card>

        {/* Roulette */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-sm">
              <CircleDot className="w-4 h-4 text-cyan-400" />
              Roulette
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <div className="text-xs text-gray-500">Spins</div>
              <div className="font-bold text-cyan-300">{rouletteStats.totalSpins.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Win Rate</div>
              <div className={`font-bold ${getWinRateColor(rouletteStats.winRate)}`}>{Math.round(rouletteStats.winRate)}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Wagered</div>
              <div className="font-bold text-neutral-100">{Math.round(Number(formatEther(rouletteStats.totalWagered))).toLocaleString()} M</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Profit / Loss</div>
              <div className={`font-bold ${rouletteStats.profitLoss > 0n ? 'text-green-400' : rouletteStats.profitLoss < 0n ? 'text-red-400' : 'text-yellow-400'}`}>
                {rouletteStats.profitLoss >= 0n ? '+' : ''}{Math.round(Number(formatEther(rouletteStats.profitLoss))).toLocaleString()} M
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Biggest Win</div>
              <div className="font-bold text-green-400">+{Math.round(Number(formatEther(rouletteStats.biggestWin))).toLocaleString()} M</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Best Streak</div>
              <div className="font-bold text-yellow-400">{rouletteStats.bestStreak}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Wager</div>
              <div className="font-bold text-neutral-100">{Math.round(Number(formatEther(rouletteStats.avgWager))).toLocaleString()} M</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Lucky Number</div>
              <div className="font-bold text-cyan-300">
                {rouletteStats.luckyNumber !== null ? `${rouletteStats.luckyNumber} (${rouletteStats.luckyNumberCount}×)` : '—'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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

      {/* Roulette Tab */}
      {activeTab === 'roulette' && (
        <RouletteSpinHistory results={rouletteStats.results} playerAddress={playerAddress} />
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