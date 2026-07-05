'use client'

import React, { useState } from 'react'
import { formatEther } from 'viem'
import { BarChart3, History, TrendingUp, TrendingDown, Activity as ActivityIcon, Spade, Trophy, Star, Zap, Coins } from 'lucide-react'
import { WalletIcon } from '@/components/shared/WalletIcon'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UnifiedActivityTab } from '@/components/shared/UnifiedActivityTab'
import { PokerHistoryTab } from '@/components/shared/PokerHistoryTab'
import { TransactionsTab } from '@/components/shared/TransactionsTab'
import { usePlayerStatsSummary } from '@/hooks/use-player-stats-summary'

const STATS_SURFACE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(rgba(255,255,255,0.035), rgba(255,255,255,0) 22%), rgba(8,20,31,0.72)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
  border: '1px solid rgba(34,211,238,0.12)',
}

function formatMorbius(wei: bigint): string {
  return parseFloat(formatEther(wei)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

interface AllStatsDashboardProps {
  playerAddress: string
}

export function AllStatsDashboard({ playerAddress }: AllStatsDashboardProps) {
  const address = playerAddress as string | null

  const { data: summary, isLoading: summaryLoading } = usePlayerStatsSummary(address)

  // Chart data: cumulative wagered/won time series from the complete (arcade-inclusive)
  // stats summary, so the chart agrees with the Totals above it.
  const cumulativeChartData = summary?.series ?? []

  const [activeTab, setActiveTab] = useState<'stats' | 'activity' | 'poker' | 'transactions'>('stats')

  // The redesigned dashboard is driven entirely by the stats summary.
  if (summaryLoading && !summary) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`arc-display uppercase tracking-wide text-[13px] px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'stats'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          All Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`arc-display uppercase tracking-wide text-[13px] px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'activity'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <ActivityIcon className="w-4 h-4" />
          Activity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('poker')}
          className={`arc-display uppercase tracking-wide text-[13px] px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'poker'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Spade className="w-4 h-4" />
          Poker
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`arc-display uppercase tracking-wide text-[13px] px-4 py-2 font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'transactions'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <WalletIcon size={16} />
          Transactions
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          {/* Highlights */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs">
                {(summary?.roi ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                ROI
              </div>
              <div className={`mt-2 arc-mono text-xl font-extrabold tabular-nums ${(summary?.roi ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary ? `${summary.roi >= 0 ? '+' : '−'}${Math.abs(summary.roi)}%` : '—'}
              </div>
              <div className="mt-1 text-[11px] text-white/40">return on amount wagered</div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><Trophy className="w-4 h-4" /> Biggest win</div>
              <div className="mt-2 arc-mono text-xl font-extrabold tabular-nums text-white">
                {summary?.biggestWin ? formatMorbius(BigInt(summary.biggestWin.amount)) : '—'}
              </div>
              <div className="mt-1 text-[11px] text-white/40">{summary?.biggestWin?.gameLabel ?? 'no wins yet'}</div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><Star className="w-4 h-4" /> Favorite game</div>
              <div className="mt-2 text-xl font-extrabold text-white truncate">{summary?.favoriteGame?.gameLabel ?? '—'}</div>
              <div className="mt-1 text-[11px] text-white/40">
                {summary?.favoriteGame ? `${summary.favoriteGame.games.toLocaleString()} games played` : ''}
              </div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><Zap className="w-4 h-4" /> Win streak</div>
              <div className="mt-2 arc-mono text-xl font-extrabold tabular-nums text-white">
                {summary ? summary.currentStreak : '—'} <span className="text-xs font-semibold text-white/40">now</span>
              </div>
              <div className="mt-1 text-[11px] text-white/40">best streak · {summary?.bestStreak ?? 0} wins</div>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><BarChart3 className="w-4 h-4" /> Wagered</div>
              <div className="mt-2 arc-mono text-xl font-extrabold tabular-nums text-white">{summary ? formatMorbius(BigInt(summary.totalWagered)) : '—'}</div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><TrendingUp className="w-4 h-4" /> Won</div>
              <div className="mt-2 arc-mono text-xl font-extrabold tabular-nums text-white">{summary ? formatMorbius(BigInt(summary.totalWon)) : '—'}</div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><Coins className="w-4 h-4" /> Net P&amp;L</div>
              <div className={`mt-2 arc-mono text-xl font-extrabold tabular-nums ${summary && BigInt(summary.net) > 0n ? 'text-emerald-400' : summary && BigInt(summary.net) < 0n ? 'text-red-400' : 'text-white/80'}`}>
                {summary ? (() => { const n = BigInt(summary.net); const b = formatMorbius(n < 0n ? -n : n); return n > 0n ? `+${b}` : n < 0n ? `−${b}` : b })() : '—'}
              </div>
              <div className="mt-1 text-[11px] text-white/40">{summary ? `across ${summary.games.toLocaleString()} games` : ''}</div>
            </div>
            <div className="rounded-xl p-4" style={STATS_SURFACE_STYLE}>
              <div className="flex items-center gap-2 text-white/60 text-xs"><History className="w-4 h-4" /> Games</div>
              <div className="mt-2 arc-mono text-xl font-extrabold tabular-nums text-white">{summary ? summary.games.toLocaleString() : '—'}</div>
            </div>
          </div>

          <Card className="overflow-hidden" style={STATS_SURFACE_STYLE}>
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                All-Time Performance
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">
                Cumulative total wagered vs total won across all games
              </p>
            </CardHeader>
            <CardContent>
              <div
                className="h-[320px] w-full min-w-0 rounded-lg p-2"
                style={STATS_SURFACE_STYLE}
              >
                {cumulativeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={cumulativeChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="allStatsColorInvested" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="allStatsColorWon" x1="0" y1="0" x2="0" y2="1">
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
                        stroke="#94a3b8"
                        strokeWidth={2}
                        fill="url(#allStatsColorInvested)"
                        name="totalInvested"
                      />
                      <Area
                        type="monotone"
                        dataKey="totalWon"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        fill="url(#allStatsColorWon)"
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

          {/* Per-game breakdown */}
          <Card className="overflow-hidden" style={STATS_SURFACE_STYLE}>
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                By game
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">Net result and win rate across every game you&apos;ve played</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/80">Game</TableHead>
                      <TableHead className="text-white/80 text-right">Games</TableHead>
                      <TableHead className="text-white/80 text-right">Net</TableHead>
                      <TableHead className="text-white/80 text-right">Win %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!summary || summary.perGame.length === 0 ? (
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableCell colSpan={4} className="py-8 text-center text-white/50">No game history yet.</TableCell>
                      </TableRow>
                    ) : (
                      summary.perGame.map((g) => {
                        const n = BigInt(g.net)
                        const netCls = n > 0n ? 'text-emerald-400' : n < 0n ? 'text-red-400' : 'text-white/70'
                        const netStr = (() => { const b = formatMorbius(n < 0n ? -n : n); return n > 0n ? `+${b}` : n < 0n ? `−${b}` : b })()
                        return (
                          <TableRow key={g.gameKey} className="border-white/5">
                            <TableCell className="text-white font-medium">{g.gameLabel}</TableCell>
                            <TableCell className="text-right tabular-nums text-white/70">{g.games.toLocaleString()}</TableCell>
                            <TableCell className={`text-right font-mono tabular-nums ${netCls}`}>{netStr}</TableCell>
                            <TableCell className="text-right">
                              <span className="inline-flex items-center gap-2 justify-end">
                                <span className="hidden sm:inline-block h-1.5 w-16 rounded bg-white/10 overflow-hidden align-middle">
                                  <span className="block h-full rounded bg-cyan-400" style={{ width: `${Math.min(100, g.winRate)}%` }} />
                                </span>
                                <span className="tabular-nums text-white/70 w-12 text-right">{g.winRate}%</span>
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'activity' && (
        <UnifiedActivityTab playerAddress={playerAddress} />
      )}

      {activeTab === 'poker' && (
        <PokerHistoryTab playerAddress={playerAddress} />
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab playerAddress={playerAddress} />
      )}
    </div>
  )
}
