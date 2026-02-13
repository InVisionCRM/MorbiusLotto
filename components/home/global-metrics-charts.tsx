'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { formatEther } from 'viem'

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
const PURPLE_STROKE = 'rgba(139, 92, 246, 0.9)'
const PURPLE_FILL = 'rgba(139, 92, 246, 0.25)'

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

  const fetchSeries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [seriesRes, metricsRes] = await Promise.all([
        fetch(`/api/analytics/series?range=${range}`),
        fetch(`/api/analytics/global-metrics?range=${range}`),
      ])
      
      if (!seriesRes.ok) throw new Error(`Series API HTTP ${seriesRes.status}`)
      if (!metricsRes.ok) throw new Error(`Metrics API HTTP ${metricsRes.status}`)
      
      const seriesData = await seriesRes.json()
      const metricsData = await metricsRes.json()
      
      setSeries(seriesData.series ?? [])
      setGlobalMetrics(metricsData)
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

      {/* Existing Area Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Volume */}
          <div
            className="rounded-2xl border border-cyan-500/30 p-4 h-52 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-cyan-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Volume (MORBIUS)
            </p>
            {loading && chartData.length === 0 ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e3 ? `${v / 1e3}k` : String(v))}
                  />
                  <Area
                    type="monotone"
                    dataKey="volumeNum"
                    stroke={CYAN_STROKE}
                    fill={CYAN_FILL}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/40 text-xs">No data for this range</p>
            )}
          </div>

          {/* Games */}
          <div
            className="rounded-2xl border border-purple-500/30 p-4 h-52 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-purple-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Games
            </p>
            {loading && chartData.length === 0 ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <Area
                    type="monotone"
                    dataKey="games"
                    stroke={PURPLE_STROKE}
                    fill={PURPLE_FILL}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/40 text-xs">No data for this range</p>
            )}
          </div>

          {/* Avg bet */}
          <div
            className="rounded-2xl border border-cyan-500/30 p-4 h-52 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-cyan-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Avg bet (MORBIUS)
            </p>
            {loading && chartData.length === 0 ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e3 ? `${v / 1e3}k` : String(Math.round(v)))}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgBetNum"
                    stroke={CYAN_STROKE}
                    fill={CYAN_FILL}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/40 text-xs">No data for this range</p>
            )}
          </div>
        </div>

      {/* New Bar Charts for Global Metrics */}
      {globalMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Wagered */}
          <div
            className="rounded-2xl border border-cyan-500/30 p-4 h-64 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-cyan-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Total Wagered (Global)
            </p>
            {loading ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: 'Total',
                      value: Number(formatEther(BigInt(globalMetrics.totalWagered || '0'))),
                    },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(34, 211, 238, 0.3)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill={CYAN_STROKE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-white text-sm font-mono mt-2 text-center">
              {Number(formatEther(BigInt(globalMetrics.totalWagered || '0'))).toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS
            </p>
          </div>

          {/* Total Won */}
          <div
            className="rounded-2xl border border-emerald-500/30 p-4 h-64 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-emerald-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Total Won (Global)
            </p>
            {loading ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: 'Total',
                      value: Number(formatEther(BigInt(globalMetrics.totalWon || '0'))),
                    },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill="rgba(16, 185, 129, 0.9)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-emerald-400 text-sm font-mono mt-2 text-center">
              {Number(formatEther(BigInt(globalMetrics.totalWon || '0'))).toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS
            </p>
          </div>

          {/* Total Deposited */}
          <div
            className="rounded-2xl border border-blue-500/30 p-4 h-64 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-blue-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Total Deposited (Global)
            </p>
            {loading ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: 'Total',
                      value: Number(formatEther(BigInt(globalMetrics.totalDeposited || '0'))),
                    },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill="rgba(59, 130, 246, 0.9)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-blue-400 text-sm font-mono mt-2 text-center">
              {Number(formatEther(BigInt(globalMetrics.totalDeposited || '0'))).toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS
            </p>
          </div>

          {/* Total Withdrawn */}
          <div
            className="rounded-2xl border border-orange-500/30 p-4 h-64 flex flex-col"
            style={PANEL_STYLE}
          >
            <p className="text-orange-400/90 text-xs font-medium uppercase tracking-wider mb-2">
              Total Withdrawn (Global)
            </p>
            {loading ? (
              <p className="text-white/50 text-xs">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: 'Total',
                      value: Number(formatEther(BigInt(globalMetrics.totalWithdrawn || '0'))),
                    },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(251, 146, 60, 0.3)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill="rgba(251, 146, 60, 0.9)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-orange-400 text-sm font-mono mt-2 text-center">
              {Number(formatEther(BigInt(globalMetrics.totalWithdrawn || '0'))).toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
