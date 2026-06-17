'use client'

import React, { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import {
  Trophy,
  Coins,
  ChevronLeft,
  ChevronRight,
  Spade,
  Download,
} from 'lucide-react'
import { downloadCsv } from '@/lib/download-csv'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  usePokerHistory,
  type PokerCashSession,
  type PokerTournamentEntry,
} from '@/hooks/use-poker-history'

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.84)',
  border: '1px solid rgba(34,211,238,0.15)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.055), inset 0 0 0 0.5px rgba(34,211,238,0.07), 0 2px 8px -4px rgba(0,0,0,0.7)',
}

const PAGE_SIZE = 20

function morbiusNumber(wei: string | null | undefined): number {
  try {
    return Number(formatEther(BigInt(wei || '0')))
  } catch {
    return 0
  }
}

function formatMorbius(wei: string | null | undefined): string {
  if (wei == null) return '—'
  return morbiusNumber(wei).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatSignedMorbius(wei: string | null | undefined): string {
  if (wei == null) return '—'
  const n = morbiusNumber(wei)
  if (n === 0) return '0'
  const body = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n > 0 ? `+${body}` : `-${body}`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ordinal(n: number | null): string {
  if (n == null) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function rankClass(rank: number | null): string {
  if (rank === 1) return 'text-amber-300'
  if (rank === 2) return 'text-slate-300'
  if (rank === 3) return 'text-orange-300'
  return 'text-white/70'
}

function netClass(wei: string | null): string {
  if (wei == null) return 'text-white/50'
  return morbiusNumber(wei) > 0 ? 'text-emerald-400' : morbiusNumber(wei) < 0 ? 'text-red-400' : 'text-white/70'
}

interface PokerHistoryTabProps {
  playerAddress: string
}

export function PokerHistoryTab({ playerAddress }: PokerHistoryTabProps) {
  const [view, setView] = useState<'tournaments' | 'cash'>('tournaments')
  const [page, setPage] = useState(0)

  const { data, isLoading, isError } = usePokerHistory(playerAddress || null)
  const tournaments = data?.tournaments ?? []
  const cashSessions = data?.cashSessions ?? []

  const rows = view === 'tournaments' ? tournaments : cashSessions
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const switchView = (v: 'tournaments' | 'cash') => {
    setView(v)
    setPage(0)
  }

  const exportCsv = () => {
    const suffix = `${playerAddress.slice(-8)}_${Date.now()}.csv`
    if (view === 'tournaments') {
      downloadCsv(
        `poker_tournaments_${suffix}`,
        ['bought_in_at', 'tournament', 'status', 'final_rank', 'buy_in_morbius', 'prize_morbius', 'net_morbius', 'rebuys', 'hands'],
        tournaments.map((t) => [
          t.boughtInAt, t.name, t.status, t.finalRank ?? '',
          morbiusNumber(t.buyIn).toString(), morbiusNumber(t.prizeWon).toString(),
          morbiusNumber(t.net).toString(), t.rebuyCount, t.handsPlayed,
        ]),
      )
    } else {
      downloadCsv(
        `poker_cash_sessions_${suffix}`,
        ['started_at', 'ended_at', 'stakes', 'buy_in_morbius', 'rebuys_morbius', 'rebuy_count', 'cash_out_morbius', 'net_morbius', 'ongoing'],
        cashSessions.map((s) => [
          s.startedAt, s.endedAt ?? '', s.stakes ?? '',
          morbiusNumber(s.buyIn).toString(), morbiusNumber(s.rebuys).toString(), s.rebuyCount,
          s.cashOut != null ? morbiusNumber(s.cashOut).toString() : '',
          s.net != null ? morbiusNumber(s.net).toString() : '', s.ongoing ? 'yes' : '',
        ]),
      )
    }
  }

  const tabs: { value: 'tournaments' | 'cash'; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = useMemo(
    () => [
      { value: 'tournaments', label: 'Tournaments', count: tournaments.length, Icon: Trophy },
      { value: 'cash', label: 'Cash games', count: cashSessions.length, Icon: Coins },
    ],
    [tournaments.length, cashSessions.length],
  )

  return (
    <Card className="overflow-hidden" style={PANEL_STYLE}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Spade className="w-5 h-5 text-cyan-400" />
              Poker
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Tournament results and cash-game sessions. Amounts in MORBIUS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => switchView(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                    view === t.value
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <t.Icon className="w-3.5 h-3.5" />
                  {t.label}
                  <span className="text-white/40">{t.count}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-red-400">Couldn&apos;t load poker history. Try again.</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-white/50">
              No {view === 'tournaments' ? 'tournament' : 'cash-game'} history yet.
            </div>
          ) : view === 'tournaments' ? (
            <TournamentTable rows={pageRows as PokerTournamentEntry[]} />
          ) : (
            <CashTable rows={pageRows as PokerCashSession[]} />
          )}
        </div>

        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-xs text-white/50">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TournamentTable({ rows }: { rows: PokerTournamentEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead className="text-white/80">When</TableHead>
          <TableHead className="text-white/80">Tournament</TableHead>
          <TableHead className="text-white/80">Result</TableHead>
          <TableHead className="text-white/80 text-right">Buy-in</TableHead>
          <TableHead className="text-white/80 text-right">Prize</TableHead>
          <TableHead className="text-white/80 text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => {
          const live = t.status === 'active' || t.status === 'registration'
          return (
            <TableRow key={t.tournamentId} className="border-white/5">
              <TableCell className="text-white/70 whitespace-nowrap text-sm">
                {formatWhen(t.boughtInAt)}
              </TableCell>
              <TableCell className="text-white font-medium">
                {t.name}
                {t.rebuyCount > 0 && (
                  <span className="block text-[11px] text-white/40 font-normal">
                    {t.rebuyCount} re-entr{t.rebuyCount === 1 ? 'y' : 'ies'} · {t.handsPlayed} hands
                  </span>
                )}
              </TableCell>
              <TableCell>
                {live ? (
                  <span className="text-cyan-300 text-sm">In progress</span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 text-sm ${rankClass(t.finalRank)}`}>
                    {t.finalRank === 1 && <Trophy className="w-3.5 h-3.5" />}
                    {ordinal(t.finalRank)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-white/70">
                {formatMorbius(t.buyIn)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-white/70">
                {morbiusNumber(t.prizeWon) > 0 ? formatMorbius(t.prizeWon) : '—'}
              </TableCell>
              <TableCell className={`text-right font-mono tabular-nums ${netClass(t.net)}`}>
                {formatSignedMorbius(t.net)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function CashTable({ rows }: { rows: PokerCashSession[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead className="text-white/80">When</TableHead>
          <TableHead className="text-white/80">Table</TableHead>
          <TableHead className="text-white/80 text-right">Buy-in</TableHead>
          <TableHead className="text-white/80 text-right">Rebuys</TableHead>
          <TableHead className="text-white/80 text-right">Cash-out</TableHead>
          <TableHead className="text-white/80 text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id} className="border-white/5">
            <TableCell className="text-white/70 whitespace-nowrap text-sm">
              {formatWhen(s.startedAt)}
            </TableCell>
            <TableCell className="text-white font-medium">
              {s.stakes ? `${s.stakes}` : 'Cash game'}
              {s.ongoing && (
                <span className="ml-2 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300 align-middle">
                  seated
                </span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums text-white/70">
              {formatMorbius(s.buyIn)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums text-white/60">
              {s.rebuyCount > 0 ? `${formatMorbius(s.rebuys)} (×${s.rebuyCount})` : '—'}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums text-white/70">
              {s.ongoing ? <span className="text-cyan-300/70">open</span> : formatMorbius(s.cashOut)}
            </TableCell>
            <TableCell className={`text-right font-mono tabular-nums ${netClass(s.net)}`}>
              {formatSignedMorbius(s.net)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default PokerHistoryTab
