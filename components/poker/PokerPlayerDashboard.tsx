'use client'

import React from 'react'
import { formatEther } from 'viem'
import { Activity, Target, Trophy, DollarSign, TrendingUp, TrendingDown, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePokerPlayerHands, usePokerPlayerStats } from '@/hooks/use-poker-stats'
import { toBigIntSafe } from '@/lib/safe-bigint'

function formatChips(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)))
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    return String(wei)
  }
}

function getProfitColor(value: string): string {
  const n = toBigIntSafe(value)
  if (n > 0n) return 'text-green-400'
  if (n < 0n) return 'text-red-400'
  return 'text-yellow-400'
}

interface PokerPlayerDashboardProps {
  playerAddress: string
}

export function PokerPlayerDashboard({ playerAddress }: PokerPlayerDashboardProps) {
  const { data: stats, isLoading: statsLoading } = usePokerPlayerStats(playerAddress)
  const { data: hands, isLoading: handsLoading } = usePokerPlayerHands(playerAddress, 25)

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-white/60">
        <p>No poker stats available for this address</p>
      </div>
    )
  }

  const cards = [
    {
      title: 'Total Hands',
      value: stats.total_hands.toLocaleString(),
      subtitle: `${stats.hands_won.toLocaleString()} won`,
      icon: Activity,
      color: 'text-cyan-300',
    },
    {
      title: 'Win Rate',
      value: `${Math.round(stats.win_rate)}%`,
      subtitle: `${stats.current_streak > 0 ? '+' : ''}${stats.current_streak} current streak`,
      icon: Target,
      color: stats.win_rate >= 50 ? 'text-green-400' : stats.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400',
    },
    {
      title: 'Profit / Loss',
      value: `${toBigIntSafe(stats.profit_loss) >= 0n ? '+' : ''}${formatChips(stats.profit_loss)}`,
      subtitle: `${stats.roi >= 0 ? '+' : ''}${Math.round(stats.roi)}% ROI`,
      icon: toBigIntSafe(stats.profit_loss) >= 0n ? TrendingUp : TrendingDown,
      color: getProfitColor(stats.profit_loss),
    },
    {
      title: 'Total Wagered',
      value: `${formatChips(stats.total_wagered)} MORBIUS`,
      subtitle: 'Chips contributed',
      icon: DollarSign,
      color: 'text-purple-300',
    },
    {
      title: 'Total Won',
      value: `${formatChips(stats.total_won)} MORBIUS`,
      subtitle: 'Chips won from pots',
      icon: Trophy,
      color: 'text-green-300',
    },
    {
      title: 'Best Streak',
      value: stats.best_streak.toLocaleString(),
      subtitle: `Biggest pot won: ${formatChips(stats.biggest_pot_won)}`,
      icon: History,
      color: 'text-cyan-300',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((item) => (
          <Card key={item.title} className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center justify-between">
                {item.title}
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
              <p className="text-xs text-gray-500 mt-1">{item.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Recent Poker Hands
          </CardTitle>
        </CardHeader>
        <CardContent>
          {handsLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : !hands || hands.length === 0 ? (
            <p className="text-white/60 text-sm">No poker hand history yet</p>
          ) : (
            <div className="space-y-2">
              {hands.map((hand) => {
                const profit = toBigIntSafe(hand.myWon) - toBigIntSafe(hand.myContributed)
                return (
                  <div key={hand.id} className="flex items-center justify-between rounded-lg bg-gray-800/40 p-3">
                    <div>
                      <p className="text-sm text-white font-medium">Hand #{hand.hand_number}</p>
                      <p className="text-xs text-gray-400">
                        Pot {formatChips(hand.pot_amount)} MORBIUS
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${profit >= 0n ? 'text-green-400' : 'text-red-400'}`}>
                        {profit >= 0n ? '+' : '-'}
                        {formatChips(profit >= 0n ? profit : -profit)} MORBIUS
                      </p>
                      <p className="text-xs text-gray-500">{new Date(hand.completed_at).toLocaleString()}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
