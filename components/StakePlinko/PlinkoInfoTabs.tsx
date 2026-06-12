'use client'

/**
 * PlinkoInfoTabs — fork of the on-chain page's info tabs (Recent Games /
 * Recent Play / Leaderboard) for /plinko2, in the arcade2 system.
 *
 * Tabs:
 *   Recent      — latest balls across ALL players (public /api/plinko/recent)
 *   Leaderboard — all-time top players by net chips (public /api/plinko/leaderboard)
 *   My balls    — the caller's history (PlinkoHistory, passed through from the
 *                 game so it stays live-prepended as balls settle)
 *
 * Public data loads once on mount — cheap, and the page is interactive long
 * before anyone reads these panels.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlinkoHistory } from './PlinkoHistory'
import {
  fetchPlinkoRecent,
  fetchPlinkoLeaderboard,
  formatMultiplier,
  PLINKO_RISK_LABELS,
  type PlinkoRecentBall,
  type PlinkoLeaderboardEntry,
  type PlinkoHistoryRound,
} from '@/lib/plinko-client'

interface PlinkoInfoTabsProps {
  history: PlinkoHistoryRound[]
  historyLoading: boolean
  onVerify: (roundId: string) => void
}

const RISK_BADGE: Record<PlinkoRecentBall['risk'], string> = {
  low: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  high: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
}

const TRIGGER_CLASS =
  'arc-display rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 ' +
  'transition-colors hover:text-slate-300 data-[state=active]:bg-cyan-500/15 ' +
  'data-[state=active]:text-cyan-300 data-[state=active]:ring-1 data-[state=active]:ring-cyan-500/50'

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>
}

export function PlinkoInfoTabs({ history, historyLoading, onVerify }: PlinkoInfoTabsProps) {
  const [recent, setRecent] = useState<PlinkoRecentBall[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [leaders, setLeaders] = useState<PlinkoLeaderboardEntry[]>([])
  const [leadersLoading, setLeadersLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchPlinkoRecent(25)
      .then((rows) => { if (!cancelled) setRecent(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setRecentLoading(false) })
    fetchPlinkoLeaderboard(10)
      .then((rows) => { if (!cancelled) setLeaders(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setLeadersLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <section aria-label="Plinko information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>Leaderboard</TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My balls</TabsTrigger>
        </TabsList>

        {/* ── Recent (all players) ── */}
        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No balls dropped yet — be the first.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((r) => {
                const profit = r.payout - r.bet
                return (
                  <li
                    key={r.roundId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                      {timeLabel(r.createdAt)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      {shortAddr(r.wallet)}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${RISK_BADGE[r.risk]}`}
                    >
                      {PLINKO_RISK_LABELS[r.risk]}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      bet {r.bet.toLocaleString()}
                    </span>
                    <span
                      className={`arc-mono shrink-0 tabular-nums ${
                        r.multiplierX100 >= 100 ? 'text-cyan-300' : 'text-slate-600'
                      }`}
                    >
                      {formatMultiplier(r.multiplierX100)}
                    </span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        profit > 0 ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {profit > 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        {/* ── Leaderboard (all-time net) ── */}
        <TabsContent value="leaderboard" className="mt-3 focus-visible:outline-none">
          {leadersLoading ? (
            <Empty>Loading…</Empty>
          ) : leaders.length === 0 ? (
            <Empty>No players on the board yet.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {leaders.map((p, i) => {
                const net = Number(p.net)
                return (
                  <li
                    key={p.wallet}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span
                      className={`arc-mono w-7 shrink-0 text-center font-bold tabular-nums ${
                        i === 0 ? 'text-amber-300' : i < 3 ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-300">
                      {shortAddr(p.wallet)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      {p.balls.toLocaleString()} ball{p.balls === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        net > 0 ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        {/* ── My balls (caller's history, live-prepended by the game) ── */}
        <TabsContent value="mine" className="mt-3 focus-visible:outline-none">
          <PlinkoHistory rounds={history} loading={historyLoading} onVerify={onVerify} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
