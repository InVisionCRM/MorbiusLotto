'use client'

/**
 * DiceX2InfoTabs — arcade2 info tabs for /dicex2 (same pattern as DiceInfoTabs):
 *   Recent      — latest rolls across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rolls    — the caller's history, live-prepended by the game
 *   Odds        — the width → multiplier ladder
 *   FAQ         — provably-fair + game-specific answers
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DiceX2History } from './DiceX2History'
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ'
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab'
import { diceX2Faqs } from './diceX2Faqs'
import { diceX2Odds } from './diceX2Odds'
import {
  fetchDiceX2Recent,
  fetchDiceX2Leaderboard,
  formatBand,
  formatX100,
  type DiceX2RecentRoll,
  type DiceX2LeaderboardEntry,
  type DiceX2HistoryRound,
} from '@/lib/dicex2-client'

interface DiceX2InfoTabsProps {
  history: DiceX2HistoryRound[]
  historyLoading: boolean
  onVerify: (roundId: string) => void
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

export function DiceX2InfoTabs({ history, historyLoading, onVerify }: DiceX2InfoTabsProps) {
  const [recent, setRecent] = useState<DiceX2RecentRoll[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [leaders, setLeaders] = useState<DiceX2LeaderboardEntry[]>([])
  const [leadersLoading, setLeadersLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchDiceX2Recent(25)
      .then((rows) => { if (!cancelled) setRecent(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setRecentLoading(false) })
    fetchDiceX2Leaderboard(10)
      .then((rows) => { if (!cancelled) setLeaders(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setLeadersLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <section aria-label="Dice x2 information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>Leaderboard</TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rolls</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No rolls yet — be the first.</Empty>
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
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      {formatBand(r.lowX100, r.highX100)}
                    </span>
                    <span
                      className={`arc-mono shrink-0 tabular-nums font-semibold ${
                        r.won ? 'text-cyan-300' : 'text-rose-400'
                      }`}
                    >
                      {formatX100(r.rollX100)}
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
                      {p.rolls.toLocaleString()} roll{p.rolls === 1 ? '' : 's'}
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

        <TabsContent value="mine" className="mt-3 focus-visible:outline-none">
          <DiceX2History rounds={history} loading={historyLoading} onVerify={onVerify} />
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={diceX2Odds} />
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={diceX2Faqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  )
}
