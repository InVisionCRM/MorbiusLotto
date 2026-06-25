'use client'

/**
 * SessionChart — shared arcade2 P/L widget (plinko2 / dice2 / chicken / …).
 *
 * Callers push one point per settled bet ({ drop, bet, profit }) for the live
 * session view. When `allTimeLoader` is supplied, a Session / All-Time toggle
 * appears; All-Time lazy-loads the player's lifetime rounds (from the game's
 * existing /history endpoint) and renders the same stats strip + cumulative
 * curve. Deep-Sea Neon styling; game-agnostic.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

export interface SessionPoint {
  /** 1-based settle order. */
  drop: number
  bet: number
  /** payout − bet for this round. */
  profit: number
}

interface SessionChartProps {
  points: SessionPoint[]
  /** Label for the count tile, e.g. "Balls" / "Rolls" / "Rounds". */
  unitLabel: string
  /** Skip the panel chrome + header — used inside FloatingPanel, which supplies both. */
  bare?: boolean
  /** When set, shows a Session / All-Time toggle; called once when All-Time is first opened. */
  allTimeLoader?: () => Promise<SessionPoint[]>
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

export function SessionChart({ points, unitLabel, bare = false, allTimeLoader }: SessionChartProps) {
  const [view, setView] = useState<'session' | 'allTime'>('session')
  const [allTimePoints, setAllTimePoints] = useState<SessionPoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const showAllTime = view === 'allTime'
  const activePoints = showAllTime ? allTimePoints ?? [] : points

  const selectAllTime = useCallback(async () => {
    setView('allTime')
    if (allTimePoints !== null || loading || !allTimeLoader) return
    setLoading(true)
    setLoadError(false)
    try {
      setAllTimePoints(await allTimeLoader())
    } catch {
      setLoadError(true)
      setAllTimePoints([])
    } finally {
      setLoading(false)
    }
  }, [allTimePoints, loading, allTimeLoader])

  const data = useMemo(() => {
    let cum = 0
    return activePoints.map((p) => {
      cum += p.profit
      return { drop: p.drop, cumulative: cum }
    })
  }, [activePoints])

  const stats = useMemo(() => {
    let wagered = 0
    let net = 0
    for (const p of activePoints) {
      wagered += p.bet
      net += p.profit
    }
    const roi = wagered > 0 ? (net / wagered) * 100 : 0
    return { count: activePoints.length, wagered, net, roi }
  }, [activePoints])

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

  const toggle = allTimeLoader ? (
    <div className="mb-2 inline-flex rounded-md border border-cyan-950 p-0.5 text-[11px]">
      <button
        type="button"
        onClick={() => setView('session')}
        className={`rounded px-2.5 py-0.5 font-semibold uppercase tracking-wide transition-colors ${
          !showAllTime ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        Session
      </button>
      <button
        type="button"
        onClick={() => void selectAllTime()}
        className={`rounded px-2.5 py-0.5 font-semibold uppercase tracking-wide transition-colors ${
          showAllTime ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        All-Time
      </button>
    </div>
  ) : null

  const emptyMessage = showAllTime
    ? loadError
      ? 'Could not load all-time stats.'
      : 'No settled rounds yet.'
    : 'The P/L curve appears after your first bet settles.'

  const body = (
    <>
      {toggle}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        <StatTile label={unitLabel} value={stats.count.toLocaleString()} />
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

      {loading && showAllTime ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading all-time…</div>
      ) : data.length === 0 ? (
        <div className="flex h-40 items-center justify-center px-3 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="h-40 w-full sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="arc2SessionFill" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#arc2SessionFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )

  if (bare) {
    return (
      <div aria-label="Profit chart" className="px-1 pb-1">
        {body}
      </div>
    )
  }

  return (
    <section aria-label="Profit chart" className="arc-panel rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="arc-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          {showAllTime ? 'All-Time' : 'Session'}
        </h2>
        {!showAllTime && <span className="text-[11px] text-slate-500">resets on reload</span>}
      </div>
      {body}
    </section>
  )
}
