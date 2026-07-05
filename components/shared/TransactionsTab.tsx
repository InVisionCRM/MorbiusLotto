'use client'

import React, { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react'
import { WalletIcon } from '@/components/shared/WalletIcon'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePlayerTransactions, type PlayerTransaction } from '@/hooks/use-player-transactions'
import { downloadCsv } from '@/lib/download-csv'

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.84)',
  border: '1px solid rgba(34,211,238,0.15)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.055), inset 0 0 0 0.5px rgba(34,211,238,0.07), 0 2px 8px -4px rgba(0,0,0,0.7)',
}

const PAGE_SIZE = 25
const EXPLORER_TX = 'https://scan.pulsechain.com/tx/'

function morbius(wei: string): string {
  try {
    return Number(formatEther(BigInt(wei || '0'))).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })
  } catch {
    return '0'
  }
}

function formatWhen(iso: string): string {
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

function statusClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'completed') return 'text-emerald-400'
  if (s === 'expired' || s === 'failed') return 'text-red-400'
  if (s === 'pending' || s.startsWith('pending')) return 'text-amber-300'
  return 'text-white/60'
}

const FILTERS: { value: 'all' | 'deposit' | 'withdrawal'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
]

interface TransactionsTabProps {
  playerAddress: string
}

export function TransactionsTab({ playerAddress }: TransactionsTabProps) {
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all')
  const [page, setPage] = useState(0)

  const { data, isLoading, isError } = usePlayerTransactions(playerAddress || null)
  const all = data ?? []

  const rows = useMemo(
    () => (filter === 'all' ? all : all.filter((t) => t.type === filter)),
    [all, filter],
  )

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const exportCsv = () => {
    downloadCsv(
      `transactions_${playerAddress.slice(-8)}_${Date.now()}.csv`,
      ['timestamp', 'type', 'amount_morbius', 'status', 'tx_hash'],
      rows.map((t) => [t.createdAt, t.type, morbius(t.amount), t.status, t.txHash ?? '']),
    )
  }

  return (
    <Card className="overflow-hidden" style={PANEL_STYLE}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <WalletIcon size={20} />
              Transactions
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              On-chain MORBIUS deposits and withdrawals. Amounts in MORBIUS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    setFilter(f.value)
                    setPage(0)
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === f.value
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {f.label}
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
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/80">When</TableHead>
                <TableHead className="text-white/80">Type</TableHead>
                <TableHead className="text-white/80 text-right">Amount</TableHead>
                <TableHead className="text-white/80">Status</TableHead>
                <TableHead className="text-white/80">Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-red-400">
                    Couldn&apos;t load transactions. Try again.
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-white/50">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((t: PlayerTransaction, i) => {
                  const isDeposit = t.type === 'deposit'
                  return (
                    <TableRow key={`${t.txHash ?? 'tx'}-${t.createdAt}-${i}`} className="border-white/5">
                      <TableCell className="text-white/70 whitespace-nowrap text-sm">
                        {formatWhen(t.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm ${
                            isDeposit ? 'text-emerald-400' : 'text-orange-300'
                          }`}
                        >
                          {isDeposit ? (
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                          )}
                          {isDeposit ? 'Deposit' : 'Withdrawal'}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono tabular-nums ${
                          isDeposit ? 'text-emerald-400' : 'text-white/80'
                        }`}
                      >
                        {isDeposit ? '+' : '-'}
                        {morbius(t.amount)}
                      </TableCell>
                      <TableCell className={`text-sm capitalize ${statusClass(t.status)}`}>
                        {t.status}
                      </TableCell>
                      <TableCell>
                        {t.txHash ? (
                          <a
                            href={`${EXPLORER_TX}${t.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            {t.txHash.slice(0, 6)}…{t.txHash.slice(-4)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-white/30 text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-xs text-white/50">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
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

export default TransactionsTab
