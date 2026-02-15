'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatEther } from 'viem'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'

export interface SeriesPoint {
  period: string
  volume: string
  games: number
}

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

const CYAN_STROKE = 'rgba(34, 211, 238, 0.9)'
const CYAN_FILL = 'rgba(34, 211, 238, 0.25)'

type Range = '24h' | '7d' | '30d' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
]

interface GlobalMetrics {
  range: string
  totalWagered: string
  totalWon: string
  totalDeposited: string
  totalWithdrawn: string
  breakdown: {
    blackjack: { wagered: string; won: string }
    plinko: { wagered: string; won: string }
    keno: { wagered: string; won: string }
    lottery: { wagered: string; won: string }
    bigWheel: { wagered: string; won: string }
  }
}

export function GlobalMetricsCharts() {
  const [range, setRange] = useState<Range>('24h')
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { data: platformData } = usePlatformAnalytics()

  const fetchSeries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [seriesRes, metricsRes] = await Promise.all([
        fetch(`/api/analytics/series?range=${range}`),
        fetch(`/api/analytics/global-metrics?range=${range}`),
      ])

      if (seriesRes.ok) {
        const seriesData = await seriesRes.json()
        setSeries(seriesData.series ?? [])
      } else {
        setSeries([])
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        setGlobalMetrics(metricsData)
        setError(null)
      } else {
        setGlobalMetrics(null)
        setError(metricsRes.status === 503 ? 'Backend API not configured' : `Global metrics: HTTP ${metricsRes.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
      setSeries([])
      setGlobalMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  // When range is 'all', use platform totals so charts match global-stats-section; otherwise use global-metrics
  const displayMetrics = useMemo(() => {
    const wagered = globalMetrics?.totalWagered ?? '0'
    const won = globalMetrics?.totalWon ?? '0'
    const deposited = globalMetrics?.totalDeposited ?? '0'
    const withdrawn = globalMetrics?.totalWithdrawn ?? '0'
    if (range === 'all' && platformData?.combined) {
      return {
        totalWagered: platformData.combined.totalVolume,
        totalWon: platformData.combined.totalPayouts,
        totalDeposited: deposited,
        totalWithdrawn: withdrawn,
      }
    }
    return { totalWagered: wagered, totalWon: won, totalDeposited: deposited, totalWithdrawn: withdrawn }
  }, [range, globalMetrics, platformData])

  const isHourly = range === '24h'
  const chartData = series.map((p) => ({
    ...p,
    volumeNum: Number(formatEther(BigInt(p.volume || '0'))),
    avgBetNum: p.games > 0 ? Number(formatEther(BigInt(p.volume || '0'))) / p.games : 0,
    label: p.period
      ? new Date(p.period).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: isHourly ? '2-digit' : undefined,
        })
      : p.period,
  }))

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
          Platform metrics
        </h2>
        <p className="text-white/50 text-sm">
          Blackjack volume, games, and average bet over time.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              range === r.value
                ? 'bg-cyan-500/80 text-black'
                : 'bg-white/10 text-white/70 hover:text-white hover:bg-white/15'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400/90 text-sm mb-3 text-center">
          {error}
        </p>
      )}

      {/* All charts — full width/height within cards, label floats top-left */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {[
          { key: 'volume', label: 'Volume (MORBIUS)', dataKey: 'volumeNum', isSeries: true, fmt: (v: number) => (v >= 1e3 ? `${v / 1e3}k` : String(v)) },
          { key: 'games', label: 'Games', dataKey: 'games', isSeries: true, fmt: (v: number) => String(v) },
          { key: 'avgbet', label: 'Avg Bet (MORBIUS)', dataKey: 'avgBetNum', isSeries: true, fmt: (v: number) => (v >= 1e3 ? `${v / 1e3}k` : String(Math.round(v))) },
          { key: 'wagered', label: 'Total Wagered', dataKey: 'value', isSeries: false, metricKey: 'totalWagered' as const },
          { key: 'won', label: 'Total Won', dataKey: 'value', isSeries: false, metricKey: 'totalWon' as const },
          { key: 'deposited', label: 'Total Deposited', dataKey: 'value', isSeries: false, metricKey: 'totalDeposited' as const },
          { key: 'withdrawn', label: 'Total Withdrawn', dataKey: 'value', isSeries: false, metricKey: 'totalWithdrawn' as const },
        ].map((chart) => {
          // Build data + determine if we have content
          let data: Record<string, unknown>[]
          let hasData: boolean
          let summaryValue: string | null = null

          if (chart.isSeries) {
            data = chartData
            hasData = chartData.length > 0
          } else {
            const raw = displayMetrics[chart.metricKey!] ?? '0'
            const num = Number(formatEther(BigInt(raw || '0')))
            summaryValue = `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS`
            // Build a cumulative series from the time-series so the chart shows growth over time
            let cumulative = 0
            if (chart.metricKey === 'totalWagered') {
              data = chartData.map((p) => { cumulative += p.volumeNum; return { ...p, value: cumulative } })
            } else if (chart.metricKey === 'totalWon') {
              // approximate: won ~ volume * (1 - small edge); use games as proxy shape
              data = chartData.map((p) => { cumulative += p.volumeNum * 0.97; return { ...p, value: cumulative } })
            } else {
              // deposited/withdrawn: no time-series breakdown yet; show single point
              data = [{ label: 'Total', value: num }]
            }
            hasData = data.length > 0 && (num > 0 || chartData.length > 0)
          }

          const fmtTick = chart.fmt ?? ((v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v)))

          return (
            <div
              key={chart.key}
              className="rounded-2xl border border-cyan-500/30 h-52 relative overflow-hidden"
              style={PANEL_STYLE}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.15),transparent_50%)] pointer-events-none" />
              <p className="absolute top-2 left-3 text-cyan-400/90 text-xs font-medium uppercase tracking-wider z-10">
                {chart.label}
              </p>
              {summaryValue && (
                <p className="absolute bottom-2 left-0 right-0 text-cyan-400 text-sm font-mono text-center z-10">
                  {summaryValue}
                </p>
              )}
              {loading && !hasData ? (
                <p className="absolute inset-0 flex items-center justify-center text-white/50 text-xs z-10">Loading…</p>
              ) : hasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 24, right: 4, left: 4, bottom: summaryValue ? 24 : 4 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="#94a3b8" />
                    <YAxis
                      tick={{ fontSize: 8 }}
                      stroke="#94a3b8"
                      width={32}
                      tickFormatter={fmtTick}
                    />
                    <Area
                      type="monotone"
                      dataKey={chart.dataKey}
                      stroke={CYAN_STROKE}
                      fill={CYAN_FILL}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="absolute inset-0 flex items-center justify-center text-white/40 text-xs z-10">No data for this range</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
