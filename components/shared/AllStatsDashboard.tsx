'use client'

import React, { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { BarChart3, History, TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle, Download, Calendar } from 'lucide-react'
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
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { useLotteryPlayerStats, useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { useKenoPlayerStats } from '@/hooks/use-keno-results'
import { usePlinkoPlayerStats } from '@/hooks/use-plinko-results'
import { usePlayerProfileGames } from '@/hooks/use-player-profile'
import { useQuery } from '@tanstack/react-query'
import { getApiUrlOptional } from '@/lib/api-urls'
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip'
import { useMerkleClaims } from '@/hooks/use-merkle-claims'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return parseFloat(formatEther(wei)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export type UnifiedHistoryRow = {
  sortKey: number
  type: 'blackjack' | 'lottery' | 'keno' | 'plinko' | 'deposit' | 'withdrawal'
  gameLabel: string
  wager?: bigint
  payout?: bigint
  profit?: bigint
  amount?: bigint
  txHash?: string | null
  createdAt: string
}

function downloadCsvRows(rows: UnifiedHistoryRow[], address: string, label: string) {
  const header = 'timestamp,game,wager,payout,profit,amount,tx_hash'
  const lines = rows.map((r) => [
    r.createdAt,
    r.gameLabel,
    r.wager != null ? formatEther(r.wager) : '',
    r.payout != null ? formatEther(r.payout) : '',
    r.profit != null ? formatEther(r.profit >= 0n ? r.profit : -r.profit) + (r.profit < 0n ? ' (loss)' : '') : '',
    r.amount != null ? formatEther(r.amount) : '',
    r.txHash ?? '',
  ].join(','))
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${label}_${address.slice(-8)}_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface AllStatsDashboardProps {
  playerAddress: string
}

export function AllStatsDashboard({ playerAddress }: AllStatsDashboardProps) {
  const addr = playerAddress.startsWith('0x') ? playerAddress : `0x${playerAddress}`
  const address = playerAddress as string | null
  const lotteryAddress = addr as `0x${string}`

  const { data: bjStats } = usePlayerProfileStats(address)
  const lotteryStats = useLotteryPlayerStats(lotteryAddress)
  const kenoStats = useKenoPlayerStats(lotteryAddress)
  const plinkoStats = usePlinkoPlayerStats(lotteryAddress)
  const { results: lotteryResults } = useInstantLotteryResults({ playerAddress: lotteryAddress, limit: 25000 })
  const { data: bjGames } = usePlayerProfileGames(address, 25000)

  const { totalClaimable: merkleClaimable, claimableEpochs } = useMerkleClaims()
  const totalClaimed = useMemo(
    () =>
      claimableEpochs
        .filter((e) => e.claimed && e.supersededByEpochNumber === null)
        .reduce((sum, e) => sum + BigInt(e.amount), 0n),
    [claimableEpochs]
  )

  const apiUrl = getApiUrlOptional()
  const { data: txHistory } = useQuery({
    queryKey: ['playerTransactions', addr],
    queryFn: async () => {
      if (!apiUrl) return []
      const res = await fetch(`${apiUrl}/api/players/${addr}/transactions?limit=25000`)
      if (!res.ok) return []
      return res.json() as Promise<Array<{ type: 'deposit' | 'withdrawal'; amount: string; tx_hash: string | null; created_at: string }>>
    },
    enabled: !!apiUrl && !!addr,
  })

  const aggregated = useMemo(() => {
    const bjBet = bjStats?.total_bet ?? 0n
    const bjWin = bjStats?.total_win ?? 0n
    const bjGamesCount = bjStats?.total_games ?? 0
    const lotWagered = lotteryStats?.totalWagered ?? 0n
    const lotWon = lotteryStats?.totalWon ?? 0n
    const lotPlays = Number(lotteryStats?.totalPlays ?? 0n)
    const kenoW = kenoStats?.totalWagered ?? 0n
    const kenoWonB = kenoStats?.totalWon ?? 0n
    const kenoP = Number(kenoStats?.totalPlays ?? 0n)
    const plinkoWagered = plinkoStats?.totalWagered ?? 0n
    const plinkoWon = plinkoStats?.totalWon ?? 0n
    const plinkoPlays = Number(plinkoStats?.totalPlays ?? 0n)

    const totalWagered = bjBet + lotWagered + kenoW + plinkoWagered
    const totalWon = bjWin + lotWon + kenoWonB + plinkoWon
    const totalGames = bjGamesCount + lotPlays + kenoP + plinkoPlays
    const profitLoss = totalWon - totalWagered

    return {
      totalWagered,
      totalWon,
      totalGames,
      profitLoss,
      winRate: totalGames > 0 ? (Number(totalWon) / Number(totalWagered)) * 100 : 0,
    }
  }, [bjStats, lotteryStats, kenoStats, plinkoStats])

  const combinedHistory = useMemo((): UnifiedHistoryRow[] => {
    const rows: UnifiedHistoryRow[] = []

    bjGames?.forEach((g) => {
      const created = g.created_at ? new Date(g.created_at).getTime() : 0
      rows.push({
        sortKey: created,
        type: 'blackjack',
        gameLabel: 'Blackjack',
        wager: g.total_bet_amount,
        payout: g.total_payout,
        profit: g.total_payout - g.total_bet_amount,
        createdAt: g.created_at ?? '',
        txHash: null,
      })
    })

    lotteryResults?.forEach((r) => {
      const ts = r.timestamp ?? (r.blockNumber ? Number(r.blockNumber) * 12 : 0)
      rows.push({
        sortKey: ts * 1000,
        type: 'lottery',
        gameLabel: 'Lottery',
        wager: r.wager,
        payout: r.netPayout,
        profit: r.netPayout - r.wager,
        txHash: r.transactionHash ?? null,
        createdAt: ts ? new Date(ts * 1000).toISOString() : '',
      })
    })

    kenoStats?.results?.forEach((r) => {
      const ts = r.timestamp ?? (r.blockNumber ? Number(r.blockNumber) * 12 : 0)
      rows.push({
        sortKey: ts * 1000,
        type: 'keno',
        gameLabel: 'Keno',
        wager: r.wager,
        payout: r.netPayout,
        profit: r.netPayout - r.wager,
        txHash: r.transactionHash ?? null,
        createdAt: ts ? new Date(ts * 1000).toISOString() : '',
      })
    })

    plinkoStats?.results?.forEach((r) => {
      const ts = r.timestamp ? r.timestamp * 1000 : (r.blockNumber ? Number(r.blockNumber) * 12 * 1000 : 0)
      rows.push({
        sortKey: ts,
        type: 'plinko',
        gameLabel: 'Plinko',
        wager: r.wager,
        payout: r.payout,
        profit: r.profit,
        txHash: r.transactionHash ?? null,
        createdAt: ts ? new Date(ts).toISOString() : '',
      })
    })

    txHistory?.forEach((t) => {
      const created = new Date(t.created_at).getTime()
      const amount = BigInt(t.amount ?? 0)
      rows.push({
        sortKey: created,
        type: t.type,
        gameLabel: t.type === 'deposit' ? 'Deposit' : 'Withdrawal',
        amount,
        createdAt: t.created_at,
        txHash: t.tx_hash,
      })
    })

    rows.sort((a, b) => b.sortKey - a.sortKey)
    return rows
  }, [bjGames, lotteryResults, kenoStats?.results, plinkoStats?.results, txHistory])

  const cumulativeChartData = useMemo(() => {
    const gameRows = combinedHistory.filter(
      (r): r is UnifiedHistoryRow =>
        r.type !== 'deposit' && r.type !== 'withdrawal' && (r.wager != null || r.payout != null)
    )
    const sorted = [...gameRows].sort((a, b) => a.sortKey - b.sortKey)
    if (sorted.length === 0) {
      return [
        { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
        {
          play: aggregated.totalGames,
          date: 'Now',
          totalInvested: Number(aggregated.totalWagered) / 1e18,
          totalWon: Number(aggregated.totalWon) / 1e18,
        },
      ].filter((p) => p.play >= 0)
    }
    let cumulativeInvested = 0
    let cumulativeWon = 0
    const points: Array<{ play: number; date: string; totalInvested: number; totalWon: number }> = [
      { play: 0, date: 'Start', totalInvested: 0, totalWon: 0 },
    ]
    const step = Math.max(1, Math.floor(sorted.length / 20))
    sorted.forEach((r, i) => {
      cumulativeInvested += Number(r.wager ?? 0n) / 1e18
      cumulativeWon += Number(r.payout ?? 0n) / 1e18
      if ((i + 1) % step === 0 || i === sorted.length - 1) {
        points.push({
          play: i + 1,
          date: r.createdAt ? new Date(r.createdAt).toLocaleDateString(undefined, { dateStyle: 'short' }) : `#${i + 1}`,
          totalInvested: Math.floor(cumulativeInvested),
          totalWon: Math.floor(cumulativeWon),
        })
      }
    })
    return points
  }, [combinedHistory, aggregated.totalWagered, aggregated.totalWon, aggregated.totalGames])

  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filteredHistory = useMemo(() => {
    if (!dateFrom && !dateTo) return combinedHistory
    const from = dateFrom ? new Date(dateFrom).getTime() : 0
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity
    return combinedHistory.filter((r) => r.sortKey >= from && r.sortKey <= to)
  }, [combinedHistory, dateFrom, dateTo])

  const isLoading =
    (bjStats === undefined && address) ||
    (lotteryStats?.isLoading) ||
    (kenoStats?.results === undefined)

  if (isLoading && aggregated.totalGames === 0 && combinedHistory.length === 0) {
    return (
      <>
        <MorbiusLoadingChip />
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'stats'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-white/70 hover:bg-white/5'
          }`}
        >
          <BarChart3 className="inline-block w-4 h-4 mr-2 align-middle" />
          All Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'history'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-white/70 hover:bg-white/5'
          }`}
        >
          <History className="inline-block w-4 h-4 mr-2 align-middle" />
          History
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          <Card className="overflow-hidden" style={PANEL_STYLE}>
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                All games combined
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">Total wagered</p>
                <p className="text-xl font-bold text-white mt-1">{formatMorbius(aggregated.totalWagered)} MORBIUS</p>
              </div>
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">Total games</p>
                <p className="text-xl font-bold text-white mt-1">{aggregated.totalGames.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">Total won</p>
                <p className="text-xl font-bold text-white mt-1">{formatMorbius(aggregated.totalWon)} MORBIUS</p>
              </div>
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">P&L</p>
                <p className={`text-xl font-bold mt-1 flex items-center gap-1 ${aggregated.profitLoss >= 0n ? 'text-green-400' : 'text-red-400'}`}>
                  {aggregated.profitLoss >= 0n ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {formatMorbius(aggregated.profitLoss >= 0n ? aggregated.profitLoss : -aggregated.profitLoss)} MORBIUS
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden" style={PANEL_STYLE}>
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Holder rewards (Earn)
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">
                Total claimed and claimable from staking / holder drops
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">Total claimed</p>
                <p className="text-xl font-bold text-white mt-1">{formatMorbius(totalClaimed)} MORBIUS</p>
              </div>
              <div className="rounded-lg bg-black/20 p-4 border border-white/10">
                <p className="text-xs text-white/60 uppercase tracking-wider">Claimable</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{formatMorbius(merkleClaimable)} MORBIUS</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden" style={PANEL_STYLE}>
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
              <div className="h-[320px] w-full min-w-0">
                {cumulativeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={cumulativeChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="allStatsColorInvested" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
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
                        stroke="#a855f7"
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
        </>
      )}

      {activeTab === 'history' && (
        <Card className="overflow-hidden" style={PANEL_STYLE}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-400" />
                Combined history (all games + deposits & withdrawals)
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black/20 border border-white/10 rounded-lg px-2 py-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-transparent text-xs text-gray-300 outline-none w-32"
                    placeholder="From"
                  />
                </div>
                <span className="text-gray-500 text-xs">–</span>
                <div className="flex items-center gap-1.5 bg-black/20 border border-white/10 rounded-lg px-2 py-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-transparent text-xs text-gray-300 outline-none w-32"
                    placeholder="To"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-black/20 border border-white/10"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => downloadCsvRows(filteredHistory, playerAddress, dateFrom || dateTo ? 'history_filtered' : 'history_full')}
                  disabled={filteredHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-600/30 transition-colors disabled:opacity-40 text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  {dateFrom || dateTo ? `Export filtered (${filteredHistory.length})` : `Export full CSV (${combinedHistory.length})`}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/80">Date</TableHead>
                    <TableHead className="text-white/80">Type</TableHead>
                    <TableHead className="text-white/80 text-right">Wager / Amount</TableHead>
                    <TableHead className="text-white/80 text-right">Payout / —</TableHead>
                    <TableHead className="text-white/80 text-right">P&L</TableHead>
                    <TableHead className="text-white/80 w-8">Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-white/50 text-center py-8">
                        {dateFrom || dateTo ? 'No history in the selected date range.' : 'No history yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((row, i) => (
                      <TableRow key={`${row.type}-${row.sortKey}-${i}`} className="border-white/10">
                        <TableCell className="text-white/90 text-sm">
                          {row.createdAt
                            ? new Date(row.createdAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-white/90">
                          {row.type === 'deposit' && <ArrowDownCircle className="inline w-4 h-4 text-green-400 mr-1" />}
                          {row.type === 'withdrawal' && <ArrowUpCircle className="inline w-4 h-4 text-amber-400 mr-1" />}
                          {row.gameLabel}
                        </TableCell>
                        <TableCell className="text-right text-white/90">
                          {row.wager != null ? formatMorbius(row.wager) : row.amount != null ? formatMorbius(row.amount) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-white/90">
                          {row.type !== 'deposit' && row.type !== 'withdrawal' && row.payout != null ? formatMorbius(row.payout) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.profit != null && (
                            <span className={row.profit >= 0n ? 'text-green-400' : 'text-red-400'}>
                              {row.profit >= 0n ? '+' : ''}{formatMorbius(row.profit >= 0n ? row.profit : -row.profit)}
                            </span>
                          )}
                          {row.type === 'deposit' && <span className="text-green-400">+{row.amount != null ? formatMorbius(row.amount) : '—'}</span>}
                          {row.type === 'withdrawal' && <span className="text-amber-400">−{row.amount != null ? formatMorbius(row.amount) : '—'}</span>}
                          {row.type !== 'deposit' && row.type !== 'withdrawal' && row.profit == null && '—'}
                        </TableCell>
                        <TableCell>
                          {row.txHash && (
                            <a
                              href={`https://scan.pulsechain.com/tx/${row.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:underline text-xs"
                            >
                              View
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
