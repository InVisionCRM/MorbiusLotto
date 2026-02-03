'use client'

import React, { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import { formatEther } from 'viem'
import { GameResult } from '@/app/BLACKJACK/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10
const MAX_HISTORY_ITEMS = 50

const RESULT_CONFIG: Record<'win' | 'loss' | 'push' | 'blackjack', { label: string; className: string }> = {
  blackjack: { label: 'BJ', className: 'text-amber-300' },
  win: { label: 'WIN', className: 'text-emerald-400' },
  loss: { label: 'LOSS', className: 'text-red-400' },
  push: { label: 'PUSH', className: 'text-slate-400' },
}

function shortenGameId(gameId: string | undefined): string {
  if (!gameId) return '—'
  if (gameId.length <= 10) return gameId
  return `${gameId.slice(0, 6)}…${gameId.slice(-4)}`
}

function getResultType(result: GameResult): 'win' | 'loss' | 'push' | 'blackjack' {
  if (result.isBlackjack) return 'blackjack'
  if (result.payout > BigInt(0)) return 'win'
  if (result.payout === BigInt(0) && result.playerHand.total === result.dealerHand.total) return 'push'
  return 'loss'
}

function getTotalBet(result: GameResult): bigint {
  if (result.playerHands?.length) {
    return result.playerHands.reduce((sum, h) => sum + (h.betAmount || BigInt(0)), BigInt(0))
  }
  return result.playerHand.betAmount || BigInt(0)
}

function getWinLossAmount(result: GameResult): bigint {
  return result.payout - getTotalBet(result)
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

const tableCls = 'text-white font-poppins bg-transparent'
const rowCls = 'border-white/10 hover:bg-transparent'
const headCls = 'text-white/80 font-medium h-9 px-2'
const cellCls = 'text-white p-2'

interface QuickHistoryProps {
  history: GameResult[]
  reserveBalance?: bigint
}

export default function QuickHistory({ history, reserveBalance }: QuickHistoryProps) {
  const [page, setPage] = useState(0)

  const recentHistory = useMemo(() => history.slice(0, MAX_HISTORY_ITEMS), [history])
  const totalPages = Math.max(1, Math.ceil(recentHistory.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const paginatedHistory = useMemo(
    () => recentHistory.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [recentHistory, currentPage]
  )

  useEffect(() => {
    if (totalPages > 0 && page >= totalPages) setPage(totalPages - 1)
  }, [totalPages, page])

  const balanceAtBetByIndex = useMemo(() => {
    if (reserveBalance === undefined) return null
    const balances: bigint[] = []
    let balanceAfter = reserveBalance
    for (let i = 0; i < recentHistory.length; i++) {
      const profit = getWinLossAmount(recentHistory[i])
      balances.push(balanceAfter - profit)
      balanceAfter = balanceAfter - profit
    }
    return balances
  }, [recentHistory, reserveBalance])

  const showBalance = balanceAtBetByIndex !== null

  if (recentHistory.length === 0) {
    return (
      <p className="text-white/50 text-sm font-poppins text-center py-4">
        No games yet. Place a bet to see your history here.
      </p>
    )
  }

  return (
    <div className="w-full min-w-0">
      <Table className={tableCls}>
        <TableHeader>
          <TableRow className={rowCls}>
            <TableHead className={headCls}>Result</TableHead>
            <TableHead className={headCls}>Bet</TableHead>
            <TableHead className={headCls}>P/L</TableHead>
            {showBalance && <TableHead className={headCls}>Balance</TableHead>}
            <TableHead className={headCls}>Bet ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedHistory.map((result, index) => {
            const globalIndex = currentPage * PAGE_SIZE + index
            const resultType = getResultType(result)
            const winLoss = getWinLossAmount(result)
            const betAmount = getTotalBet(result)
            const hands = result.playerHands?.length ? result.playerHands : [result.playerHand]
            const wasSplit = result.wasSplit ?? hands.length > 1
            const config = RESULT_CONFIG[resultType]
            const isWin = resultType === 'win' || resultType === 'blackjack'

            return (
              <TableRow key={result.gameId ?? `qh-${globalIndex}`} className={rowCls}>
                <TableCell className={cellCls}>
                  <span className={config.className}>{config.label}</span>
                  {wasSplit && <span className="text-cyan-400/90 text-xs ml-1">SPLIT</span>}
                </TableCell>
                <TableCell className={cellCls}>{formatEther(betAmount)}</TableCell>
                <TableCell className={cellCls}>
                  <span className={config.className}>
                    {resultType === 'loss' ? '−' : '+'}
                    {formatEther(winLoss < BigInt(0) ? -winLoss : winLoss)}
                  </span>
                </TableCell>
                {showBalance && (
                  <TableCell className={cellCls}>
                    <span className="tabular-nums">{formatMorbius(balanceAtBetByIndex![globalIndex])}</span>
                    <Image
                      src="/morbius/MorbiusLogo (3).png"
                      alt="MORBIUS"
                      width={14}
                      height={14}
                      className="inline object-contain ml-1 align-middle"
                    />
                  </TableCell>
                )}
                <TableCell className={`${cellCls} font-mono text-xs text-white/80`} title={result.gameId}>
                  {shortenGameId(result.gameId)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-2 rounded-lg text-white/80 font-poppins disabled:opacity-40 disabled:cursor-not-allowed hover:text-white transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-white/80 font-poppins tabular-nums">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="p-2 rounded-lg text-white/80 font-poppins disabled:opacity-40 disabled:cursor-not-allowed hover:text-white transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
