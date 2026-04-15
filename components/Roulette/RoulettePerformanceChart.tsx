'use client'

import React, { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatEther } from 'viem'
import type { RouletteSpinRow } from '@/hooks/use-roulette-results'

interface RoulettePerformanceChartProps {
  results: RouletteSpinRow[]
}

function fmt(wei: bigint): number {
  return Math.round(Number(formatEther(wei)))
}

export function RoulettePerformanceChart({ results }: RoulettePerformanceChartProps) {
  const chartData = useMemo(() => {
    // Results come in newest-first; reverse to oldest-first for the chart
    const sorted = [...results].reverse()
    let cumulativeWagered = 0
    let cumulativePnL = 0
    return sorted.map((r, i) => {
      cumulativeWagered += fmt(r.totalWagered)
      cumulativePnL += fmt(r.netPayout) - fmt(r.totalWagered)
      return {
        spin: i + 1,
        cumulativeWagered,
        cumulativePnL,
      }
    })
  }, [results])

  const totalWagered = results.reduce((s, r) => s + fmt(r.totalWagered), 0)
  const netPnL = results.reduce((s, r) => s + fmt(r.netPayout) - fmt(r.totalWagered), 0)
  const roi = totalWagered > 0 ? ((netPnL / totalWagered) * 100).toFixed(1) : '0.0'

  const getYAxisDomain = () => {
    if (chartData.length === 0) return [-100, 100]
    const pnlVals = chartData.map((d) => d.cumulativePnL)
    const wagVals = chartData.map((d) => d.cumulativeWagered)
    const min = Math.min(...pnlVals, 0)
    const max = Math.max(...wagVals, 0)
    const padding = Math.max(Math.abs(max - min) * 0.1, 50)
    return [Math.floor(min - padding), Math.ceil(max + padding)]
  }

  return (
    <div className="w-full rounded-lg flex flex-col overflow-hidden bg-slate-800/40 border border-white/10">
      {/* Header stats */}
      <div className="w-full shrink-0 grid grid-cols-3 items-center text-center gap-1 py-2 px-2">
        <div className="min-w-0">
          <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">Spins</div>
          <div className="text-white text-sm tabular-nums">{results.length}</div>
        </div>
        <div className="min-w-0">
          <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">Net P&amp;L</div>
          <div className={`font-bold text-sm tabular-nums ${netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {netPnL >= 0 ? '+' : ''}{netPnL.toLocaleString()} M
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">ROI</div>
          <div className={`text-sm font-bold ${Number(roi) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {Number(roi) >= 0 ? '+' : ''}{roi}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full min-h-[220px]">
        {chartData.length === 0 ? (
          <div className="w-full h-[220px] flex items-center justify-center">
            <p className="text-xs text-white/60">Chart appears after first spin</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="rlt-wagered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="rlt-pnl-pos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="rlt-pnl-neg" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />

              <XAxis
                dataKey="spin"
                stroke="rgba(255,255,255,0.4)"
                fontSize={10}
                tick={{ fill: 'rgba(255,255,255,0.45)' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.15)' }}
              />
              <YAxis
                width={40}
                fontSize={10}
                tick={{ fill: 'rgba(255,255,255,0.45)' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                domain={getYAxisDomain()}
                tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />

              <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" strokeWidth={1} />

              <Tooltip
                contentStyle={{
                  background: 'rgba(17,24,39,0.95)',
                  border: '1px solid rgba(75,85,99,0.5)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'rgba(209,213,219,0.8)' }}
                labelFormatter={(v) => `Spin #${v}`}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()} M`,
                  name === 'cumulativeWagered' ? 'Total Wagered' : 'Cumulative P&L',
                ]}
              />

              {/* Total wagered line */}
              <Area
                type="monotone"
                dataKey="cumulativeWagered"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#rlt-wagered)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 3, fill: '#a855f7' }}
                isAnimationActive={false}
              />

              {/* P&L positive */}
              <Area
                type="monotone"
                dataKey="cumulativePnL"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#rlt-pnl-pos)"
                fillOpacity={1}
                baseValue={0}
                dot={false}
                activeDot={{ r: 3, fill: '#22d3ee' }}
                isAnimationActive={false}
              />

              {/* P&L negative overlay */}
              <Area
                type="monotone"
                dataKey="cumulativePnL"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#rlt-pnl-neg)"
                fillOpacity={1}
                baseValue={0}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {chartData.length > 0 && (
        <div className="flex items-center justify-center gap-4 pb-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-purple-400 rounded" />Total Wagered</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-cyan-400 rounded" />P&amp;L</span>
        </div>
      )}
    </div>
  )
}
