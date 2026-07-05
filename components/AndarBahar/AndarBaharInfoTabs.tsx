'use client'

/**
 * AndarBaharInfoTabs — arcade2 info tabs for /andar-bahar.
 *
 * The prototype shows just "My rounds" + "FAQ"; production adds the shared
 * public tabs so the page matches the rest of the arcade2 family:
 *   Recent      — latest rounds across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My rounds   — the caller's history, live-prepended by the game
 *   Odds        — Andar / Bahar payout + win-chance table
 *   FAQ         — provably-fair + game-specific answers (ported from the lab)
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AndarBaharHistory } from './AndarBaharHistory'
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ'
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab'
import { andarBaharFaqs } from './andarBaharFaqs'
import { andarBaharOdds } from './andarBaharOdds'
import {
  fetchAndarBaharRecent,
  fetchAndarBaharLeaderboard,
  cardRankLabel,
  sideLabel,
  type AndarBaharRecentRound,
  type AndarBaharLeaderboardEntry,
  type AndarBaharHistoryRound,
} from '@/lib/andar-bahar-client'

interface AndarBaharInfoTabsProps {
  history: AndarBaharHistoryRound[]
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

export function AndarBaharInfoTabs({ history, historyLoading, onVerify }: AndarBaharInfoTabsProps) {
  const [recent, setRecent] = useState<AndarBaharRecentRound[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [leaders, setLeaders] = useState<AndarBaharLeaderboardEntry[]>([])
  const [leadersLoading, setLeadersLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchAndarBaharRecent(25)
      .then((rows) => { if (!cancelled) setRecent(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setRecentLoading(false) })
    fetchAndarBaharLeaderboard(10)
      .then((rows) => { if (!cancelled) setLeaders(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setLeadersLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <section aria-label="Andar Bahar information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}><span className="sm:hidden">Leaders</span><span className="hidden sm:inline">Leaderboard</span></TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My rounds</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="faq" className={TRIGGER_CLASS}>FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No rounds yet — be the first.</Empty>
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
                    <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                      {sideLabel(r.side)}
                    </span>
                    <span
                      className={`arc-mono shrink-0 tabular-nums font-semibold ${
                        profit > 0 ? 'text-cyan-300' : 'text-rose-400'
                      }`}
                    >
                      {cardRankLabel(r.joker)} → {sideLabel(r.winningSide)}
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
                      {p.rounds.toLocaleString()} round{p.rounds === 1 ? '' : 's'}
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
          <AndarBaharHistory rounds={history} loading={historyLoading} onVerify={onVerify} />
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={andarBaharOdds} />
        </TabsContent>

        <TabsContent value="faq" className="mt-2 focus-visible:outline-none">
          <ArcadeFAQ items={andarBaharFaqs} accent="#22D3EE" />
        </TabsContent>
      </Tabs>
    </section>
  )
}
