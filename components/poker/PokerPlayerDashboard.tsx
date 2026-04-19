'use client'

import React from 'react'
import { Activity, Target, Trophy, DollarSign, TrendingUp, TrendingDown, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePokerPlayerHands, usePokerPlayerStats } from '@/hooks/use-poker-stats'
import { toBigIntSafe } from '@/lib/safe-bigint'
import { formatChips } from '@/lib/format-poker-chips'
import { PlayerStatsFeatureGrid } from '@/components/ui/player-stats-feature-grid'

function formatSignedChips(chips: bigint): string {
  const n = chips < 0n ? -chips : chips
  return (chips < 0n ? '-' : '') + formatChips(n)
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

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
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
      valueClassName: 'text-cyan-300',
    },
    {
      title: 'Win Rate',
      value: `${Math.round(stats.win_rate)}%`,
      subtitle: `${stats.current_streak > 0 ? '+' : ''}${stats.current_streak} current streak`,
      icon: Target,
      valueClassName: stats.win_rate >= 50 ? 'text-green-400' : stats.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400',
    },
    {
      title: 'Profit / Loss',
      value: `${toBigIntSafe(stats.profit_loss) >= 0n ? '+' : ''}${formatSignedChips(toBigIntSafe(stats.profit_loss))}`,
      subtitle: `${stats.roi >= 0 ? '+' : ''}${Math.round(stats.roi)}% ROI`,
      icon: toBigIntSafe(stats.profit_loss) >= 0n ? TrendingUp : TrendingDown,
      valueClassName: getProfitColor(stats.profit_loss),
    },
    {
      title: 'Total Wagered',
      value: `${formatChips(stats.total_wagered)} chips`,
      subtitle: 'Chips contributed',
      icon: DollarSign,
      valueClassName: 'text-neutral-100',
    },
    {
      title: 'Total Won',
      value: `${formatChips(stats.total_won)} chips`,
      subtitle: 'Chips won from pots',
      icon: Trophy,
      valueClassName: 'text-cyan-300',
    },
    {
      title: 'Best Streak',
      value: stats.best_streak.toLocaleString(),
      subtitle: `Biggest pot won: ${formatChips(stats.biggest_pot_won)}`,
      icon: History,
      valueClassName: 'text-cyan-300',
    },
  ]

  return (
    <div className="space-y-6">
      <PlayerStatsFeatureGrid
        items={cards}
        className="border border-white/10 rounded-xl overflow-hidden"
      />

      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700" style={PANEL_STYLE}>
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
                        Pot {formatChips(hand.pot_amount)} chips
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${profit >= 0n ? 'text-green-400' : 'text-red-400'}`}>
                        {profit >= 0n ? '+' : ''}
                        {formatSignedChips(profit)} chips
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
