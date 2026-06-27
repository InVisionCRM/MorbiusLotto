'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { Loader2, ShieldAlert, ArrowUpRight } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { isAdminWallet } from '@/lib/admin'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { useGameSummaries, useGamePlays, type GamePlay } from '@/hooks/use-game-activity'

function fmtAmt(s: string | undefined): string {
  if (s == null) return '0'
  try {
    return BigInt(s).toLocaleString('en-US')
  } catch {
    return s
  }
}
function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}
function relTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function rtpPct(wagered: string, won: string): number | null {
  try {
    const w = BigInt(wagered)
    if (w <= 0n) return null
    return Number((BigInt(won) * 10000n) / w) / 100
  } catch {
    return null
  }
}
function profitStr(wagered: string, won: string): string {
  try {
    return (BigInt(wagered) - BigInt(won)).toString()
  } catch {
    return '0'
  }
}
function fmtSigned(s: string): string {
  try {
    const n = BigInt(s)
    return (n > 0n ? '+' : '') + n.toLocaleString('en-US')
  } catch {
    return s
  }
}
function profitColor(s: string): string {
  try {
    const n = BigInt(s)
    return n > 0n ? 'text-emerald-300' : n < 0n ? 'text-rose-300' : 'text-white/60'
  } catch {
    return 'text-white/60'
  }
}

const RESULT_STYLE: Record<GamePlay['result'], string> = {
  win: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  loss: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  push: 'bg-white/10 text-white/55 ring-white/15',
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums sm:text-lg" style={{ color: accent }}>
        {value}
      </div>
    </div>
  )
}
function CardRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass ?? 'text-white/85'}`}>{value}</span>
    </div>
  )
}

export default function GameActivityPage() {
  const { address } = useAccount()
  const isAdmin = isAdminWallet(address)

  const { data: summary, isLoading: gamesLoading } = useGameSummaries(isAdmin)
  const games = summary?.games
  const [selected, setSelected] = useState<string | null>(null)

  // Default to the busiest game once summaries load.
  useEffect(() => {
    if (!selected && games && games.length > 0) setSelected(games[0].key)
  }, [games, selected])

  const { data: plays, isLoading: playsLoading } = useGamePlays(isAdmin ? selected : null)
  const selectedGame = useMemo(() => games?.find((g) => g.key === selected) ?? null, [games, selected])

  // Platform-wide rollup.
  const overall = useMemo(() => {
    if (!games || games.length === 0) return null
    let w = 0n
    let won = 0n
    let plays = 0
    for (const g of games) {
      try {
        w += BigInt(g.wagered)
        won += BigInt(g.won)
      } catch {
        /* skip */
      }
      plays += g.plays
    }
    return {
      wagered: w.toString(),
      won: won.toString(),
      profit: (w - won).toString(),
      rtp: w > 0n ? Number((won * 10000n) / w) / 100 : null,
      plays,
      players: summary?.totalPlayers ?? 0,
    }
  }, [games, summary])

  if (!isAdmin) {
    return (
      <GlobalMainNav>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <ShieldAlert className="h-10 w-10 text-white/30" />
          <h1 className="text-xl font-bold text-white">Admins only</h1>
          <p className="max-w-sm text-sm text-white/50">
            The Game Activity dashboard is restricted to admin wallets.
          </p>
        </div>
      </GlobalMainNav>
    )
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full bg-[#070a12]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Game Activity</h1>
            <p className="mt-1 text-sm text-white/50">
              All-time performance per game (RTP = won ÷ wagered; profit = the house take), with the most
              recent 500 plays. Click a player to open their dashboard.
            </p>
          </div>

          {/* Platform rollup */}
          {overall && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Total wagered" value={fmtAmt(overall.wagered)} />
              <StatTile label="Total won" value={fmtAmt(overall.won)} accent="#fbbf24" />
              <StatTile
                label="House profit"
                value={fmtSigned(overall.profit)}
                accent={overall.profit.startsWith('-') ? '#fca5a5' : '#6ee7b7'}
              />
              <StatTile label="Overall RTP" value={overall.rtp != null ? `${overall.rtp.toFixed(2)}%` : '—'} />
              <StatTile label="Total plays" value={overall.plays.toLocaleString()} />
              <StatTile label="Unique players" value={overall.players.toLocaleString()} />
            </div>
          )}

          {/* Game cards */}
          {gamesLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/50" />
            </div>
          ) : !games || games.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/55">
              No game activity yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => {
                const active = g.key === selected
                const rtp = rtpPct(g.wagered, g.won)
                const profit = profitStr(g.wagered, g.won)
                const avgBet = (() => {
                  try {
                    return g.plays > 0 ? (BigInt(g.wagered) / BigInt(g.plays)).toString() : '0'
                  } catch {
                    return '0'
                  }
                })()
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setSelected(g.key)}
                    className={[
                      'rounded-2xl border p-4 text-left transition',
                      active
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{g.label}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                        style={{
                          background: rtp != null && rtp > 100 ? 'rgba(244,63,94,0.15)' : 'rgba(110,231,183,0.12)',
                          color: rtp != null && rtp > 100 ? '#fca5a5' : '#6ee7b7',
                        }}
                      >
                        {rtp != null ? `${rtp.toFixed(2)}% RTP` : '—'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <CardRow label="Wagered" value={fmtAmt(g.wagered)} />
                      <CardRow label="Won" value={fmtAmt(g.won)} valueClass="text-amber-300" />
                      <CardRow label="House profit" value={fmtSigned(profit)} valueClass={profitColor(profit)} />
                      <CardRow label="Plays" value={g.plays.toLocaleString()} />
                      <CardRow label="Players" value={g.players.toLocaleString()} />
                      <CardRow label="Avg bet" value={fmtAmt(avgBet)} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Plays table for the selected game */}
          {selectedGame && (
            <div className="mt-8">
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-lg font-bold text-white">
                  {selectedGame.label} <span className="text-sm font-normal text-white/40">recent plays</span>
                </h2>
                <div className="text-xs text-white/45">
                  Wagered <span className="font-semibold text-white/80">{fmtAmt(selectedGame.wagered)}</span> · Won{' '}
                  <span className="font-semibold text-amber-300">{fmtAmt(selectedGame.won)}</span> MORBIUS
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                <div className="max-h-[70vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0c111c]">
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/45">Player</TableHead>
                        <TableHead className="text-white/45">Time</TableHead>
                        <TableHead className="text-right text-white/45">Wager</TableHead>
                        <TableHead className="text-right text-white/45">Payout</TableHead>
                        <TableHead className="text-right text-white/45">Net</TableHead>
                        <TableHead className="text-right text-white/45">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playsLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/40" />
                          </TableCell>
                        </TableRow>
                      ) : !plays || plays.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-white/40">
                            No plays yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        plays.map((p, i) => {
                          const net = (() => {
                            try {
                              return BigInt(p.net)
                            } catch {
                              return 0n
                            }
                          })()
                          return (
                            <TableRow key={`${p.wallet}-${p.at}-${i}`} className="border-white/5">
                              <TableCell>
                                <Link
                                  href={`/player/${p.wallet}`}
                                  className="inline-flex items-center gap-1 font-medium text-cyan-300 transition hover:text-cyan-200"
                                >
                                  {p.displayName?.trim() || shortAddr(p.wallet)}
                                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                                </Link>
                              </TableCell>
                              <TableCell className="text-white/50">{relTime(p.at)}</TableCell>
                              <TableCell className="text-right tabular-nums text-white/80">{fmtAmt(p.wager)}</TableCell>
                              <TableCell className="text-right tabular-nums text-white/80">{fmtAmt(p.payout)}</TableCell>
                              <TableCell
                                className={[
                                  'text-right font-semibold tabular-nums',
                                  net > 0n ? 'text-emerald-300' : net < 0n ? 'text-rose-300' : 'text-white/50',
                                ].join(' ')}
                              >
                                {net > 0n ? '+' : ''}
                                {fmtAmt(p.net)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${RESULT_STYLE[p.result]}`}
                                >
                                  {p.result}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <p className="mt-2 text-xs text-white/30">
                Showing up to 500 most recent plays. Amounts in MORBIUS.
              </p>
            </div>
          )}
        </div>
      </div>
    </GlobalMainNav>
  )
}
