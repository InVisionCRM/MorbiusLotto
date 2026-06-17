'use client'

/**
 * BaccaratInfoTabs — arcade2 info tabs for /baccarat (RouletteInfoTabs2
 * structure, cyan Deep-Sea Neon skin):
 *   Recent      — latest hands across ALL players (public)
 *   Leaderboard — all-time top players by net chips (public)
 *   My hands    — the caller's history, live-prepended by the game (verify links)
 *   Rules       — payout table from the server constants + third-card summary
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  fetchBaccaratRecent,
  fetchBaccaratLeaderboard,
  formatMultiplier,
  BACC_PAYOUTS_FALLBACK,
  type BaccaratInfo,
  type BaccaratRecentHand,
  type BaccaratLeaderboardEntry,
  type BaccaratHistoryHand,
  type BaccaratResult,
} from '@/lib/baccarat-client'
import { ArcadeOddsTab } from '@/components/arcade2/ArcadeOddsTab'
import { baccaratOdds } from './baccaratOdds'

interface BaccaratInfoTabsProps {
  history: BaccaratHistoryHand[]
  historyLoading: boolean
  onVerify: (handId: string) => void
  /** Live bounds + payout table from /info — falls back to the client mirror. */
  info: BaccaratInfo | null
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

const BADGE_CLASS: Record<BaccaratResult, string> = {
  player: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40',
  banker: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
  tie: 'bg-[#A78BFA]/15 text-[#A78BFA] ring-[#A78BFA]/40',
}

function ResultBadge({ result }: { result: BaccaratResult }) {
  return (
    <span
      className={`arc-mono inline-flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold ring-1 ${BADGE_CLASS[result]}`}
    >
      {result === 'player' ? 'P' : result === 'banker' ? 'B' : 'T'}
    </span>
  )
}

/** ×100 gross multiplier → "1:1" / "0.95:1" / "8:1" odds string. */
function oddsLabel(x100: number): string {
  const odds = (x100 - 100) / 100
  return `${Number.isInteger(odds) ? odds : odds.toFixed(2).replace(/0+$/, '')}:1`
}

export function BaccaratInfoTabs({ history, historyLoading, onVerify, info }: BaccaratInfoTabsProps) {
  const [recent, setRecent] = useState<BaccaratRecentHand[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [leaders, setLeaders] = useState<BaccaratLeaderboardEntry[]>([])
  const [leadersLoading, setLeadersLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchBaccaratRecent(25)
      .then((rows) => { if (!cancelled) setRecent(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setRecentLoading(false) })
    fetchBaccaratLeaderboard(10)
      .then((rows) => { if (!cancelled) setLeaders(rows) })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (!cancelled) setLeadersLoading(false) })
    return () => { cancelled = true }
  }, [])

  const payouts = info?.payouts ?? BACC_PAYOUTS_FALLBACK
  const minBet = info?.minBet ?? 10
  const maxBet = info?.maxBet ?? 2000

  const payoutRows: Array<[string, number, string | null]> = [
    ['Player', payouts.player, null],
    ['Banker', payouts.banker, '5% commission'],
    ['Tie', payouts.tie, null],
    ['Player pair', payouts.playerPair, 'first two player cards same rank'],
    ['Banker pair', payouts.bankerPair, 'first two banker cards same rank'],
  ]

  return (
    <section aria-label="Baccarat information" className="arc-panel rounded-xl p-3 sm:p-4">
      <Tabs defaultValue="recent">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-lg bg-[#081420]/70 p-1 ring-1 ring-cyan-950/70">
          <TabsTrigger value="recent" className={TRIGGER_CLASS}>Recent</TabsTrigger>
          <TabsTrigger value="leaderboard" className={TRIGGER_CLASS}>Leaderboard</TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER_CLASS}>My hands</TabsTrigger>
          <TabsTrigger value="odds" className={TRIGGER_CLASS}>Odds</TabsTrigger>
          <TabsTrigger value="rules" className={TRIGGER_CLASS}>Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-3 focus-visible:outline-none">
          {recentLoading ? (
            <Empty>Loading…</Empty>
          ) : recent.length === 0 ? (
            <Empty>No hands yet — the shoe is fresh.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {recent.map((h) => {
                const net = h.totalPayout - h.totalBet
                return (
                  <li
                    key={h.handId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                      {timeLabel(h.createdAt)}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      {shortAddr(h.wallet)}
                    </span>
                    <ResultBadge result={h.result} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      P {h.playerTotal} · B {h.bankerTotal}
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
                      {p.hands.toLocaleString()} hand{p.hands === 1 ? '' : 's'}
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
          {historyLoading && history.length === 0 ? (
            <Empty>Loading…</Empty>
          ) : history.length === 0 ? (
            <Empty>No hands yet — place a bet and deal.</Empty>
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {history.map((h) => {
                const net = h.totalPayout - h.totalBet
                return (
                  <li
                    key={h.handId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm"
                  >
                    <span className="arc-mono w-12 shrink-0 tabular-nums text-slate-500">
                      {timeLabel(h.createdAt)}
                    </span>
                    <ResultBadge result={h.result} />
                    <span className="arc-mono shrink-0 tabular-nums text-slate-500">
                      P {h.playerTotal} · B {h.bankerTotal}
                    </span>
                    <span className="arc-mono shrink-0 tabular-nums text-slate-400">
                      bet {h.totalBet.toLocaleString()}
                    </span>
                    <span
                      className={`arc-mono ml-auto shrink-0 tabular-nums font-semibold ${
                        net > 0 ? 'text-amber-300' : net === 0 ? 'text-slate-400' : 'text-rose-400'
                      }`}
                    >
                      {net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onVerify(h.handId)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                    >
                      Verify
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="odds" className="mt-3 focus-visible:outline-none">
          <ArcadeOddsTab odds={baccaratOdds} />
        </TabsContent>

        <TabsContent value="rules" className="mt-3 focus-visible:outline-none">
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-slate-300">
            <ul className="divide-y divide-cyan-950/60 rounded-lg bg-[#081420]/70 px-3 ring-1 ring-cyan-950/70">
              {payoutRows.map(([label, x100, note]) => (
                <li key={label} className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                  <span className="text-slate-300">
                    {label}
                    {note && <span className="ml-1.5 text-slate-500">({note})</span>}
                  </span>
                  <span className="arc-mono shrink-0 text-slate-500">
                    {oddsLabel(x100)}{' '}
                    <span className="text-cyan-300">({formatMultiplier(x100)} returned)</span>
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm">
                <span className="text-slate-300">Tie hand — Player &amp; Banker main bets</span>
                <span className="arc-mono shrink-0 text-slate-500">
                  push <span className="text-cyan-300">(stake returned)</span>
                </span>
              </li>
            </ul>

            <p>
              Punto banco — no decisions after the deal. Card values:{' '}
              <span className="arc-mono text-slate-200">A = 1</span>,{' '}
              <span className="arc-mono text-slate-200">2–9 = face</span>,{' '}
              <span className="arc-mono text-slate-200">10/J/Q/K = 0</span>; a hand counts the sum
              mod 10, so nine is the best total. Bet {minBet.toLocaleString()}–
              {maxBet.toLocaleString()} MORBIUS per zone, any combination of zones per hand.
            </p>

            <div className="rounded-lg bg-[#081420]/70 p-3 ring-1 ring-cyan-950/70">
              <h3 className="arc-display mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Third-card rules
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400 sm:text-sm">
                <li>
                  <span className="text-slate-300">Natural:</span> either side&apos;s first two cards
                  total 8 or 9 — both stand, hand over.
                </li>
                <li>
                  <span className="text-cyan-300">Player:</span> draws on 0–5, stands on 6–7.
                </li>
                <li>
                  <span className="text-amber-300">Banker</span> (player stood): draws on 0–5,
                  stands on 6–7.
                </li>
                <li>
                  <span className="text-amber-300">Banker</span> (player drew): 0–2 always draws ·
                  3 draws unless player&apos;s third card is 8 · 4 draws vs 2–7 · 5 draws vs 4–7 ·
                  6 draws vs 6–7 · 7 stands.
                </li>
              </ul>
            </div>

            <p>
              Every hand deals from a full 52-card deck shuffled from a server seed committed
              (hashed) before your bets are accepted — re-derive the whole deck in your browser
              from any hand&apos;s Verify button.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
