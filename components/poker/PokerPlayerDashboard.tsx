'use client'

import React, { useState } from 'react'
import { Activity, Target, Trophy, DollarSign, TrendingUp, TrendingDown, History, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  usePokerPlayerHands,
  usePokerPlayerStats,
  type PokerPlayerStats,
  type PokerStatsScope,
} from '@/hooks/use-poker-stats'
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
  showRecentHands?: boolean
}

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

export function PokerPlayerDashboard({ playerAddress, showRecentHands = true }: PokerPlayerDashboardProps) {
  const [scope, setScope] = useState<PokerStatsScope>('cash')
  const { data: stats, isLoading: statsLoading } = usePokerPlayerStats(playerAddress, scope)
  const { data: hands, isLoading: handsLoading } = usePokerPlayerHands(
    showRecentHands ? playerAddress : null,
    25
  )

  const scopeToggle = <PokerScopeToggle scope={scope} onChange={setScope} />

  if (statsLoading) {
    return (
      <div className="space-y-4">
        {scopeToggle}
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!stats || stats.total_hands === 0) {
    return (
      <div className="space-y-4">
        {scopeToggle}
        <div className="text-center py-12 text-white/60">
          <p>No {scopeLabel(scope)} hands yet{stats && stats.tournament_hands > 0 && scope === 'cash' ? ' — try the Tournament tab' : ''}.</p>
        </div>
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
      {scopeToggle}
      <PlayerStatsFeatureGrid
        items={cards}
        className="border border-white/10 rounded-xl overflow-hidden"
      />

      <PokerAdvancedStatsCard stats={stats} scope={scope} />

      {showRecentHands ? (
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
      ) : null}
    </div>
  )
}

function scopeLabel(scope: PokerStatsScope): string {
  if (scope === 'cash') return 'cash'
  if (scope === 'tournament') return 'tournament'
  return 'poker'
}

function PokerScopeToggle({
  scope,
  onChange,
}: {
  scope: PokerStatsScope
  onChange: (s: PokerStatsScope) => void
}) {
  const options: { value: PokerStatsScope; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'tournament', label: 'Tournament' },
    { value: 'all', label: 'All' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
      {options.map((opt) => {
        const active = opt.value === scope
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 text-xs font-semibold transition-colors rounded-md ${
              active ? 'bg-cyan-500/80 text-black' : 'text-white/60 hover:text-white'
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function classifyAF(af: number | null): { label: string; color: string } {
  if (af == null) return { label: '—', color: 'text-neutral-400' }
  if (af < 1) return { label: 'Passive', color: 'text-sky-300' }
  if (af < 2) return { label: 'Balanced', color: 'text-emerald-300' }
  if (af < 3.5) return { label: 'Aggressive', color: 'text-amber-300' }
  return { label: 'Maniac', color: 'text-rose-300' }
}

function classifyStyle(vpip: number, pfr: number): string {
  if (vpip < 15) return pfr >= vpip * 0.7 ? 'Tight-aggressive' : 'Tight-passive'
  if (vpip < 28) return pfr >= vpip * 0.6 ? 'Balanced' : 'Loose-passive'
  return pfr >= vpip * 0.6 ? 'Loose-aggressive' : 'Loose-passive (fish)'
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
        {hint ? <p className="text-[11px] text-white/30">{hint}</p> : null}
      </div>
      <p className="font-mono text-sm text-white tabular-nums">{value}</p>
    </div>
  )
}

function PokerAdvancedStatsCard({ stats, scope }: { stats: PokerPlayerStats; scope: PokerStatsScope }) {
  const scopeHeader = scope === 'cash' ? 'Cash games' : scope === 'tournament' ? 'Tournaments' : 'All games'
  const af = classifyAF(stats.aggression_factor)
  const style = classifyStyle(stats.vpip_pct, stats.pfr_pct)
  // BB/100 is only meaningful for cash games (blind levels vary in tournaments)
  const bbPer100 = scope === 'cash' ? stats.bb_per_100 : null

  const positions = [
    { key: 'button', label: 'Button', data: stats.position_win_rates.button },
    { key: 'small_blind', label: 'Small Blind', data: stats.position_win_rates.small_blind },
    { key: 'big_blind', label: 'Big Blind', data: stats.position_win_rates.big_blind },
    { key: 'other', label: 'Other', data: stats.position_win_rates.other },
  ]

  const totalBreakdown = stats.winning_hand_breakdown.reduce((s, b) => s + b.count, 0)

  return (
    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700" style={PANEL_STYLE}>
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          Advanced Stats
          <span className="ml-auto text-xs font-normal text-white/50">{scopeHeader} · {stats.total_hands} hands</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-white/50">Playing style</p>
          <p className="text-base text-cyan-200">{style}</p>
        </div>

        <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Preflop</h4>
            <StatRow label="VPIP" value={fmtPct(stats.vpip_pct)} hint="Voluntarily put $ in pot" />
            <StatRow label="PFR" value={fmtPct(stats.pfr_pct)} hint="Preflop raise %" />
            <StatRow label="3-Bet" value={fmtPct(stats.three_bet_pct)} hint="Re-raise preflop" />
          </div>
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Postflop</h4>
            <StatRow label="WTSD" value={fmtPct(stats.wtsd_pct)} hint="Went to showdown (of flops seen)" />
            <StatRow label="W$SD" value={fmtPct(stats.wsd_pct)} hint="Won $ at showdown" />
            <StatRow
              label="AF"
              value={stats.aggression_factor == null ? '—' : stats.aggression_factor.toFixed(2)}
              hint={`${af.label} · (bets+raises) ÷ calls`}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-1 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Profitability</h4>
            <StatRow
              label="BB / 100"
              value={bbPer100 == null ? '—' : `${bbPer100 >= 0 ? '+' : ''}${bbPer100.toFixed(2)}`}
              hint="Big blinds won per 100 hands"
            />
            <StatRow label="Showdown win %" value={fmtPct(stats.showdown_win_rate)} hint="Won given showdown" />
            <StatRow
              label="Non-showdown win %"
              value={fmtPct(stats.non_showdown_win_rate)}
              hint="Won without showdown (of all hands)"
            />
          </div>
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Volume</h4>
            <StatRow label="Cash hands" value={stats.total_hands.toLocaleString()} />
            <StatRow label="Tournament hands" value={stats.tournament_hands.toLocaleString()} />
          </div>
        </div>

        <div className="mt-5">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Win rate by position</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {positions.map((p) => (
              <div key={p.key} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/50">{p.label}</p>
                <p className="font-mono text-base text-white tabular-nums">
                  {p.data.hands === 0 ? '—' : fmtPct(p.data.win_rate)}
                </p>
                <p className="text-[11px] text-white/30">{p.data.hands} hands</p>
              </div>
            ))}
          </div>
        </div>

        {stats.winning_hand_breakdown.length > 0 ? (
          <div className="mt-5">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Winning hands by type
            </h4>
            <div className="space-y-1">
              {stats.winning_hand_breakdown.slice(0, 8).map((b) => {
                const pct = totalBreakdown > 0 ? (b.count / totalBreakdown) * 100 : 0
                return (
                  <div key={b.hand_name} className="flex items-center gap-3">
                    <p className="w-40 truncate text-xs text-white/70">{b.hand_name}</p>
                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-white/5">
                      <div
                        className="h-full bg-cyan-400/80"
                        style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                      />
                    </div>
                    <p className="w-16 text-right font-mono text-xs text-white/60 tabular-nums">
                      {b.count} ({pct.toFixed(0)}%)
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
