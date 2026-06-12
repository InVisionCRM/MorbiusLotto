'use client'

/**
 * PlinkoSessionChart — fork of the on-chain page's RealTimeBetChart for
 * /plinko2, restyled into the Deep-Sea Neon (arcade2) system.
 *
 * Same idea as the original: a per-session cumulative P/L area chart with a
 * stats strip (balls, wagered, net, ROI). Points arrive when balls LAND (the
 * parent pushes from PlinkoGame's onScore), so the curve moves with the board,
 * not with the network. Session-scoped: resets on page load, no fetches.
 */

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

export interface PlinkoSessionPoint {
  /** 1-based landing order. */
  drop: number
  bet: number
  /** payout − bet for this ball. */
  profit: number
}

interface PlinkoSessionChartProps {
  points: PlinkoSessionPoint[]
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#081420]/70 px-2 py-1.5 text-center ring-1 ring-cyan-950/70">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="arc-mono truncate text-sm font-bold tabular-nums" style={{ color: accent ?? '#E2E8F0' }}>
        {value}
      </div>
    </div>
  )
}

export function PlinkoSessionChart({ points }: PlinkoSessionChartProps) {
  const data = useMemo(() => {
    let cum = 0
    return points.map((p) => {
      cum += p.profit
      return { drop: p.drop, cumulative: cum }
    })
  }, [points])

  const stats = useMemo(() => {
    let wagered = 0
    let net = 0
    for (const p of points) {
      wagered += p.bet
      net += p.profit
    }
    const roi = wagered > 0 ? (net / wagered) * 100 : 0
    return { balls: points.length, wagered, net, roi }
  }, [points])

  const domain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [-10, 10]
    let min = 0
    let max = 0
    for (const d of data) {
      if (d.cumulative < min) min = d.cumulative
      if (d.cumulative > max) max = d.cumulative
    }
    const pad = Math.max((max - min) * 0.1, 5)
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [data])

  const positive = stats.net >= 0

  return (
    <section aria-label="Session profit chart" className="arc-panel rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="arc-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          Session
        </h2>
        <span className="text-[11px] text-slate-500">resets on reload</span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        <StatTile label="Balls" value={stats.balls.toLocaleString()} />
        <StatTile label="Wagered" value={stats.wagered.toLocaleString()} />
        <StatTile
          label="Net P/L"
          value={`${stats.net >= 0 ? '+' : ''}${stats.net.toLocaleString()}`}
          accent={positive ? '#F59E0B' : '#FB7185'}
        />
        <StatTile
          label="ROI"
          value={`${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`}
          accent={positive ? '#F59E0B' : '#FB7185'}
        />
      </div>

      {data.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          The P/L curve appears after your first ball lands.
        </div>
      ) : (
        <div className="h-40 w-full sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="plinkoSessionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.08)" />
              <XAxis
                dataKey="drop"
                stroke="rgba(148,163,184,0.4)"
                fontSize={10}
                tick={{ fill: 'rgba(148,163,184,0.55)' }}
                axisLine={{ stroke: 'rgba(34,211,238,0.15)' }}
                tickLine={{ stroke: 'rgba(34,211,238,0.15)' }}
              />
              <YAxis
                domain={domain}
                stroke="rgba(148,163,184,0.4)"
                fontSize={10}
                width={42}
                tick={{ fill: 'rgba(148,163,184,0.55)' }}
                axisLine={{ stroke: 'rgba(34,211,238,0.15)' }}
                tickLine={{ stroke: 'rgba(34,211,238,0.15)' }}
              />
              <ReferenceLine y={0} stroke="rgba(245,158,11,0.45)" strokeDasharray="4 3" />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#22D3EE"
                strokeWidth={2}
                fill="url(#plinkoSessionFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
