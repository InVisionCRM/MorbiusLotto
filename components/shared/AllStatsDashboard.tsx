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
import { PlayerStatsFeatureGrid, type PlayerStatsFeatureItem } from '@/components/ui/player-stats-feature-grid'
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { useLotteryPlayerStats, useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { useKenoPlayerStats } from '@/hooks/use-keno-results'
import { usePlinkoPlayerStats } from '@/hooks/use-plinko-results'
import { usePokerPlayerHands, usePokerPlayerStats } from '@/hooks/use-poker-stats'
import { usePlayerProfileGames } from '@/hooks/use-player-profile'
import { useQuery } from '@tanstack/react-query'
import { getApiUrlOptional } from '@/lib/api-urls'
import { useMerkleClaims } from '@/hooks/use-merkle-claims'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

const STATS_SURFACE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return parseFloat(formatEther(wei)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export type UnifiedHistoryRow = {
  sortKey: number
  type: 'blackjack' | 'poker' | 'lottery' | 'keno' | 'plinko' | 'deposit' | 'withdrawal'
  gameLabel: string
  wager?: bigint
  payout?: bigint
  profit?: bigint
  amount?: bigint
  txHash?: string | null
  createdAt: string
}

type UnifiedHistoryRowWithComputed = UnifiedHistoryRow & {
  delta: bigint
  balance: bigint
}

function ledgerDelta(row: UnifiedHistoryRow): bigint {
  if (row.type === 'deposit') return row.amount ?? 0n
  if (row.type === 'withdrawal') return -(row.amount ?? 0n)
  return row.profit ?? ((row.payout ?? 0n) - (row.wager ?? 0n))
}

/** Oldest-first; tie-break for stable running balance. */
function compareHistoryChronological(a: UnifiedHistoryRow, b: UnifiedHistoryRow): number {
  const k = a.sortKey - b.sortKey
  if (k !== 0) return k
  const t = a.createdAt.localeCompare(b.createdAt)
  if (t !== 0) return t
  const ty = a.type.localeCompare(b.type)
  if (ty !== 0) return ty
  return a.gameLabel.localeCompare(b.gameLabel)
}

function downloadCsvRows(rows: UnifiedHistoryRow[], address: string, label: string) {
  const header = 'timestamp,kind,game,wager,payout,profit,amount,delta,balance,tx_hash'
  const lines = rows.map((r) => [
    r.createdAt,
    (r as UnifiedHistoryRowWithComputed).type,
    r.gameLabel,
    r.wager != null ? formatEther(r.wager) : '',
    r.payout != null ? formatEther(r.payout) : '',
    r.profit != null ? formatEther(r.profit >= 0n ? r.profit : -r.profit) + (r.profit < 0n ? ' (loss)' : '') : '',
    r.amount != null ? formatEther(r.amount) : '',
    formatEther((r as UnifiedHistoryRowWithComputed).delta ?? 0n),
    ((r as UnifiedHistoryRowWithComputed).balance ?? 0n) != null
      ? formatEther(((r as UnifiedHistoryRowWithComputed).balance ?? 0n))
      : '',
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
  /**
   * When set, running balance is anchored so the chronologically newest row equals this
   * server `players.balance` (after summing all row deltas in the table).
   */
  serverBalanceAnchor?: bigint
}

export function AllStatsDashboard({ playerAddress, serverBalanceAnchor }: AllStatsDashboardProps) {
  const getTypeColorClass = (type: UnifiedHistoryRow['type']) => {
    switch (type) {
      case 'deposit':
        return 'bg-green-400'
      case 'withdrawal':
        return 'bg-amber-400'
      case 'blackjack':
        return 'bg-cyan-400'
      case 'poker':
        return 'bg-violet-400'
      case 'lottery':
        return 'bg-blue-400'
      case 'keno':
        return 'bg-fuchsia-400'
      case 'plinko':
        return 'bg-teal-400'
      default:
        return 'bg-white/40'
    }
  }

  const getTypeLabel = (type: UnifiedHistoryRow['type']) => {
    switch (type) {
      case 'deposit':
        return 'Deposit'
      case 'withdrawal':
        return 'Withdrawal'
      case 'blackjack':
        return 'Blackjack'
      case 'poker':
        return 'Poker'
      case 'lottery':
        return 'Lottery'
      case 'keno':
        return 'Keno'
      case 'plinko':
        return 'Plinko'
      default:
        return 'Unknown'
    }
  }

  const addr = playerAddress.startsWith('0x') ? playerAddress : `0x${playerAddress}`
  const address = playerAddress as string | null
  const lotteryAddress = addr as `0x${string}`

  const { data: bjStats } = usePlayerProfileStats(address)
  const lotteryStats = useLotteryPlayerStats(lotteryAddress)
  const kenoStats = useKenoPlayerStats(lotteryAddress)
  const plinkoStats = usePlinkoPlayerStats(lotteryAddress)
  const pokerStats = usePokerPlayerStats(address)
  const pokerHands = usePokerPlayerHands(address, 25_000)
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
    const pokerWagered = BigInt(pokerStats.data?.total_wagered ?? '0')
    const pokerWon = BigInt(pokerStats.data?.total_won ?? '0')
    const pokerPlays = Number(pokerStats.data?.total_hands ?? 0)

    const totalWagered = bjBet + lotWagered + kenoW + plinkoWagered + pokerWagered
    const totalWon = bjWin + lotWon + kenoWonB + plinkoWon + pokerWon
    const totalGames = bjGamesCount + lotPlays + kenoP + plinkoPlays + pokerPlays
    const profitLoss = totalWon - totalWagered

    return {
      totalWagered,
      totalWon,
      totalGames,
      profitLoss,
      winRate: totalGames > 0 ? (Number(totalWon) / Number(totalWagered)) * 100 : 0,
    }
  }, [bjStats, lotteryStats, kenoStats, plinkoStats, pokerStats.data])

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

    pokerHands.data?.forEach((h) => {
      const ts = h.completed_at ? new Date(h.completed_at).getTime() : 0
      rows.push({
        sortKey: ts,
        type: 'poker',
        gameLabel: 'Poker',
        wager: BigInt(h.myContributed ?? '0'),
        payout: BigInt(h.myWon ?? '0'),
        profit: BigInt(h.myWon ?? '0') - BigInt(h.myContributed ?? '0'),
        txHash: null,
        createdAt: h.completed_at ?? '',
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

    rows.sort((a, b) => -compareHistoryChronological(a, b))
    return rows
  }, [bjGames, lotteryResults, kenoStats?.results, plinkoStats?.results, pokerHands.data, txHistory])

  const cumulativeChartData = useMemo(() => {
    const gameRows = combinedHistory.filter(
      (r): r is UnifiedHistoryRow =>
        r.type !== 'deposit' && r.type !== 'withdrawal' && (r.wager != null || r.payout != null)
    )
    const sorted = [...gameRows].sort(compareHistoryChronological)
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
  const [historyTypeFilter, setHistoryTypeFilter] = useState<
    'all' | 'games' | 'cash' | UnifiedHistoryRow['type']
  >('all')
  const [historyClassFilter, setHistoryClassFilter] = useState<'all' | 'game' | 'credit' | 'debit'>('all')

  const ledgerAnchored = serverBalanceAnchor !== undefined

  const historyWithBalance = useMemo((): UnifiedHistoryRowWithComputed[] => {
    const asc = [...combinedHistory].sort(compareHistoryChronological)
    const deltas = asc.map(ledgerDelta)
    const totalDelta = deltas.reduce((sum, d) => sum + d, 0n)
    const openingBalance =
      serverBalanceAnchor !== undefined ? serverBalanceAnchor - totalDelta : 0n
    let running = openingBalance
    const ascWithBalance = asc.map((row, i) => {
      const delta = deltas[i]!
      running += delta
      return { ...row, balance: running, delta }
    })
    return ascWithBalance.sort((a, b) => -compareHistoryChronological(a, b))
  }, [combinedHistory, serverBalanceAnchor])

  const filteredHistory = useMemo(() => {
    const byType = historyWithBalance.filter((r) => {
      if (historyTypeFilter === 'all') return true
      if (historyTypeFilter === 'games') return r.type !== 'deposit' && r.type !== 'withdrawal'
      if (historyTypeFilter === 'cash') return r.type === 'deposit' || r.type === 'withdrawal'
      return r.type === historyTypeFilter
    })

    const byClass = byType.filter((r) => {
      if (historyClassFilter === 'all') return true
      if (historyClassFilter === 'credit') return r.type === 'deposit'
      if (historyClassFilter === 'debit') return r.type === 'withdrawal'
      return r.type !== 'deposit' && r.type !== 'withdrawal'
    })

    if (!dateFrom && !dateTo) return byClass
    const from = dateFrom ? new Date(dateFrom).getTime() : 0
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity
    return byClass.filter((r) => r.sortKey >= from && r.sortKey <= to)
  }, [historyWithBalance, dateFrom, dateTo, historyTypeFilter, historyClassFilter])

  const statsFeatureItems = useMemo<PlayerStatsFeatureItem[]>(() => {
    const pnlPositive = aggregated.profitLoss >= 0n
    return [
      {
        title: 'Total wagered',
        value: `${formatMorbius(aggregated.totalWagered)} MORBIUS`,
        icon: BarChart3,
      },
      {
        title: 'Total games',
        value: aggregated.totalGames.toLocaleString(),
        icon: History,
      },
      {
        title: 'Total won',
        value: `${formatMorbius(aggregated.totalWon)} MORBIUS`,
        icon: TrendingUp,
      },
      {
        title: 'P&L',
        value: `${pnlPositive ? '+' : '-'}${formatMorbius(pnlPositive ? aggregated.profitLoss : -aggregated.profitLoss)} MORBIUS`,
        icon: pnlPositive ? TrendingUp : TrendingDown,
        valueClassName: pnlPositive ? 'text-emerald-400' : 'text-red-400',
      },
      {
        title: 'Total claimed',
        value: `${formatMorbius(totalClaimed)} MORBIUS`,
        icon: ArrowDownCircle,
      },
      {
        title: 'Claimable',
        value: `${formatMorbius(merkleClaimable)} MORBIUS`,
        icon: ArrowUpCircle,
        subtitle: 'Staking / holder drops',
        valueClassName: 'text-emerald-400',
      },
    ]
  }, [aggregated.profitLoss, aggregated.totalGames, aggregated.totalWagered, aggregated.totalWon, totalClaimed, merkleClaimable])

  const isLoading =
    (bjStats === undefined && address) ||
    (lotteryStats?.isLoading) ||
    (kenoStats?.results === undefined) ||
    pokerStats.isLoading

  if (isLoading && aggregated.totalGames === 0 && combinedHistory.length === 0) {
    return (
      <>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      </>
    )
  }

  return (
    <div className="space-y-6">
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
          All Stats
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
          History
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          <PlayerStatsFeatureGrid
            items={statsFeatureItems}
            className="max-w-none"
          />

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
              <div>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-cyan-400" />
                  Combined history (all games + deposits & withdrawals)
                </CardTitle>
                <p className="text-xs text-white/50 mt-2 max-w-3xl">
                  {ledgerAnchored ? (
                    <>
                      <span className="text-cyan-400/90">Balance</span> is a running server-ledger total: the newest row
                      matches your current playable balance. Older rows may still be approximate if some activity is
                      outside this list or on-chain only.
                    </>
                  ) : (
                    <>
                      <span className="text-amber-400/90">Balance</span> is unanchored (server balance still loading or
                      unavailable); values assume zero before the oldest row shown.
                    </>
                  )}{' '}
                  {(dateFrom || dateTo) && (
                    <span className="text-white/60">
                      Date filters hide rows but keep each row&apos;s balance as-of that moment in full history.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative group/feature rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-neutral-900/70 to-transparent pointer-events-none rounded-lg" />
                  <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1 relative z-10 pl-3">
                    <span className="absolute left-0 inset-y-0 h-4 w-1 my-auto rounded-tr-full rounded-br-full bg-neutral-700 group-hover/feature:bg-cyan-500 transition-all duration-200 origin-center" />
                    Type
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mr-1 relative z-10">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'games', label: 'Games' },
                    { id: 'cash', label: 'Cashflow' },
                    { id: 'blackjack', label: 'Blackjack' },
                    { id: 'poker', label: 'Poker' },
                    { id: 'plinko', label: 'Plinko' },
                    { id: 'keno', label: 'Keno' },
                    { id: 'lottery', label: 'Lottery' },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() =>
                        setHistoryTypeFilter(
                          chip.id as 'all' | 'games' | 'cash' | UnifiedHistoryRow['type']
                        )
                      }
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                        historyTypeFilter === chip.id
                          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                          : 'bg-black/20 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                </div>
                <div className="relative group/feature rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-neutral-900/70 to-transparent pointer-events-none rounded-lg" />
                  <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1 relative z-10 pl-3">
                    <span className="absolute left-0 inset-y-0 h-4 w-1 my-auto rounded-tr-full rounded-br-full bg-neutral-700 group-hover/feature:bg-cyan-500 transition-all duration-200 origin-center" />
                    Class
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mr-1 relative z-10">
                  {[
                    { id: 'all', label: 'All Classes' },
                    { id: 'game', label: 'Game' },
                    { id: 'credit', label: 'Deposit' },
                    { id: 'debit', label: 'Withdrawal' },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() =>
                        setHistoryClassFilter(chip.id as 'all' | 'game' | 'credit' | 'debit')
                      }
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                        historyClassFilter === chip.id
                          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                          : 'bg-black/20 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                </div>
                <div className="relative group/feature rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-neutral-900/70 to-transparent pointer-events-none rounded-lg" />
                  <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1 relative z-10 pl-3">
                    <span className="absolute left-0 inset-y-0 h-4 w-1 my-auto rounded-tr-full rounded-br-full bg-neutral-700 group-hover/feature:bg-cyan-500 transition-all duration-200 origin-center" />
                    Date Range
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 relative z-10">
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
                  </div>
                </div>
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
            <div className="rounded-lg border border-white/10 overflow-hidden bg-black/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/80 text-center w-8">Tag</TableHead>
                    <TableHead className="text-white/80 text-center">Date</TableHead>
                    <TableHead className="text-white/80 text-center">Type</TableHead>
                    <TableHead className="text-white/80 text-center">Class</TableHead>
                    <TableHead className="text-white/80 text-center">Wager / Amount</TableHead>
                    <TableHead className="text-white/80 text-center">Payout</TableHead>
                    <TableHead className="text-white/80 text-center">Delta</TableHead>
                    <TableHead className="text-white/80 text-center">Balance</TableHead>
                    <TableHead className="text-white/80 text-center w-8">Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-white/50 text-center py-8">
                        {dateFrom || dateTo ? 'No history in the selected date range.' : 'No history yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((row, i) => (
                      <TableRow key={`${row.type}-${row.sortKey}-${i}`} className="border-white/10 hover:bg-white/5">
                        <TableCell className="text-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${getTypeColorClass(row.type)}`}
                            title={getTypeLabel(row.type)}
                          />
                        </TableCell>
                        <TableCell className="text-white/90 text-xs font-mono whitespace-nowrap text-center">
                          {row.createdAt
                            ? new Date(row.createdAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-white/90 text-sm text-center">
                          {getTypeLabel(row.type)}
                        </TableCell>
                        <TableCell className="text-white/80 text-xs text-center">
                          {row.type === 'deposit' ? (
                            <span className="inline-flex items-center gap-1">
                              <ArrowDownCircle className="w-3.5 h-3.5 text-green-400" />
                              Deposit
                            </span>
                          ) : row.type === 'withdrawal' ? (
                            <span className="inline-flex items-center gap-1">
                              <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400" />
                              Withdrawal
                            </span>
                          ) : (
                            'Game'
                          )}
                        </TableCell>
                        <TableCell className="text-center text-white/90 tabular-nums">
                          {row.wager != null ? formatMorbius(row.wager) : row.amount != null ? formatMorbius(row.amount) : '—'}
                        </TableCell>
                        <TableCell className="text-center text-white/90 tabular-nums">
                          {row.type !== 'deposit' && row.type !== 'withdrawal' && row.payout != null ? formatMorbius(row.payout) : '—'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <span
                            className={
                              row.delta > 0n
                                ? 'text-green-400'
                                : row.delta < 0n
                                  ? 'text-red-400'
                                  : 'text-yellow-400'
                            }
                          >
                            {row.delta > 0n ? '+' : row.delta < 0n ? '−' : ''}
                            {formatMorbius(row.delta >= 0n ? row.delta : -row.delta)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-white/90 tabular-nums">
                          {formatMorbius(row.balance)}
                        </TableCell>
                        <TableCell className="text-center">
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
