'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  Clock,
  DollarSign,
  Hash,
  Target,
  TrendingUp,
  TrendingDown,
  Trophy,
  Users,
  Zap,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardDisplay } from '@/components/poker/CardDisplay'
import { formatMorbiusFloor } from '@/lib/format-morbius-display'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableDashboardData {
  table: {
    id: string
    small_blind: string
    big_blind: string
    max_seats: number
    hand_number: number
    created_at: string
  }
  seats: Array<{
    position: number
    player_address: string
    stack: string
    status: string
    joined_at: string
  }>
  stats: {
    total_hands: number
    total_rake: string
    total_pot_volume: string
    avg_pot: string
    avg_hand_duration_seconds: number
    biggest_pot: string
    hands_today: number
    hands_this_hour: number
  }
  player_stats: Array<{
    player_address: string
    hands_played: number
    hands_won: number
    total_wagered: string
    total_won: string
    net_pnl: string
    vpip_pct: number
  }>
  recent_hands: Array<{
    id: string
    hand_number: number
    pot_amount: string
    rake_amount: string
    street: string
    community_cards: number[]
    result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null
    completed_at: string
    duration_seconds: number
    player_count: number
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtWei(wei: string): string {
  try {
    return formatMorbiusFloor(wei || '0')
  } catch {
    return '0'
  }
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function getPnlColor(pnl: string): string {
  const n = Number(pnl)
  if (n > 0) return 'text-green-400'
  if (n < 0) return 'text-red-400'
  return 'text-gray-400'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PokerTableDashboardProps {
  tableId: string
  onClose?: () => void
}

export function PokerTableDashboard({ tableId, onClose }: PokerTableDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'hands'>('overview')

  const { data, isLoading, error } = useQuery<TableDashboardData>({
    queryKey: ['pokerTableDashboard', tableId],
    queryFn: async () => {
      const res = await fetch(`/api/poker/table/${tableId}/dashboard`)
      if (!res.ok) throw new Error('Failed to fetch table dashboard')
      return res.json()
    },
    enabled: !!tableId,
    refetchInterval: 10_000,
  })

  const closeHeader = onClose ? (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
      <h2 className="text-sm font-bold text-white tracking-tight">Poker dashboard</h2>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 border border-transparent hover:border-cyan-500/30 transition-colors"
        aria-label="Close dashboard"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="px-4 pb-4 pt-3">
        {closeHeader}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader className="pb-3">
              <div className="h-4 bg-gray-700 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-3 bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-4 pb-4 pt-3">
        {closeHeader}
        <div className="text-center py-12 text-white/60">
          Failed to load table dashboard.
        </div>
      </div>
    )
  }

  const { stats, player_stats, recent_hands } = data

  const statsCards = [
    {
      title: 'Total Hands',
      value: stats.total_hands.toLocaleString(),
      icon: Hash,
      subtitle: `${stats.hands_this_hour} this hour · ${stats.hands_today} today`,
      color: 'text-blue-400',
    },
    {
      title: 'Total Rake',
      value: `${fmtWei(stats.total_rake)} MORBIUS`,
      icon: DollarSign,
      subtitle: 'Collected from completed hands',
      color: 'text-cyan-400',
    },
    {
      title: 'Pot Volume',
      value: `${fmtWei(stats.total_pot_volume)} MORBIUS`,
      icon: Activity,
      subtitle: `Avg pot: ${fmtWei(stats.avg_pot)}`,
      color: 'text-purple-400',
    },
    {
      title: 'Biggest Pot',
      value: `${fmtWei(stats.biggest_pot)} MORBIUS`,
      icon: Trophy,
      subtitle: 'All-time high',
      color: 'text-yellow-400',
    },
    {
      title: 'Avg Hand Duration',
      value: fmtDuration(stats.avg_hand_duration_seconds),
      icon: Clock,
      subtitle: `${stats.total_hands} hands completed`,
      color: 'text-green-400',
    },
    {
      title: 'Hands / Hour',
      value: stats.hands_this_hour.toString(),
      icon: Zap,
      subtitle: `${stats.hands_today} hands today`,
      color: 'text-orange-400',
    },
  ]

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'players' as const, label: 'Players', icon: Users },
    { id: 'hands' as const, label: 'Hand History', icon: Activity },
  ]

  return (
    <div className="space-y-6 px-4 pb-4 pt-3">
      {closeHeader}
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 mb-6">
        {tabs.map((tab) => (
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

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Stats Grid */}
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
                    <p className="text-xs text-gray-500">{stat.subtitle}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Current Seats */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Live Seats
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.seats.length === 0 ? (
                <p className="text-white/50 text-sm">No players seated</p>
              ) : (
                <div className="space-y-2">
                  {data.seats.map((seat) => (
                    <div
                      key={seat.position}
                      className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-6">#{seat.position}</span>
                        <span className="font-mono text-sm text-white/90">
                          {fmtAddr(seat.player_address)}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            seat.status === 'active'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {seat.status}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-cyan-400">
                          {fmtWei(seat.stack)} MORBIUS
                        </span>
                        <p className="text-xs text-gray-500">
                          joined {timeAgo(seat.joined_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Players Tab */}
      {activeTab === 'players' && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              Player Stats at This Table
            </CardTitle>
          </CardHeader>
          <CardContent>
            {player_stats.length === 0 ? (
              <p className="text-white/50 text-sm">No hand history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-3 text-white/70 font-medium">Player</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">Hands</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">Win %</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">VPIP</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">Wagered</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">Won</th>
                      <th className="text-right py-2 pl-3 text-white/70 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player_stats.map((p) => {
                      const winPct = p.hands_played > 0 ? ((p.hands_won / p.hands_played) * 100).toFixed(1) : '0'
                      return (
                        <tr key={p.player_address} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2.5 pr-3 font-mono text-white/90">
                            {fmtAddr(p.player_address)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-white/80 tabular-nums">
                            {p.hands_played}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            <span className={Number(winPct) >= 50 ? 'text-green-400' : Number(winPct) >= 30 ? 'text-yellow-400' : 'text-red-400'}>
                              {winPct}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-white/80 tabular-nums">
                            {p.vpip_pct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-purple-400 tabular-nums">
                            {fmtWei(p.total_wagered)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-cyan-400 tabular-nums">
                            {fmtWei(p.total_won)}
                          </td>
                          <td className={`py-2.5 pl-3 text-right font-medium tabular-nums ${getPnlColor(p.net_pnl)}`}>
                            {BigInt(p.net_pnl) > 0n ? '+' : ''}{fmtWei(p.net_pnl)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hand History Tab */}
      {activeTab === 'hands' && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Recent Hands
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Last {recent_hands.length} completed hands
            </p>
          </CardHeader>
          <CardContent>
            {recent_hands.length === 0 ? (
              <p className="text-white/50 text-sm">No hands played yet</p>
            ) : (
              <div className="space-y-2">
                {recent_hands.map((hand) => {
                  const winners = hand.result?.winners ?? []
                  return (
                    <div
                      key={hand.id}
                      className="p-3 bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-white/70">
                            Hand #{hand.hand_number}
                          </span>
                          <span className="text-xs text-gray-500">
                            {hand.player_count} players · {fmtDuration(hand.duration_seconds)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-xs text-gray-500">
                            {timeAgo(hand.completed_at)}
                          </span>
                        </div>
                      </div>

                      {/* Community cards + pot */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {hand.community_cards.length > 0 ? (
                            hand.community_cards.map((card, i) => (
                              <CardDisplay key={i} cardIndex={card} small />
                            ))
                          ) : (
                            <span className="text-xs text-gray-600">No board</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-sm font-medium text-cyan-400">
                              {fmtWei(hand.pot_amount)}
                            </span>
                            <span className="text-xs text-gray-500 ml-1">pot</span>
                          </div>
                          {BigInt(hand.rake_amount) > 0n && (
                            <div className="text-right">
                              <span className="text-xs text-yellow-400/80">
                                {fmtWei(hand.rake_amount)} rake
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Winners */}
                      {winners.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {winners.map((w, i) => (
                            <span key={i} className="text-xs text-green-400">
                              <Trophy className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                              {fmtAddr(w.address)} won {fmtWei(w.amount)}
                              {w.handName && (
                                <span className="text-green-400/60 ml-1">({w.handName})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
