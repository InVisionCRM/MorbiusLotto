'use client'

import React, { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import { formatEther } from 'viem'
import { GameResult } from '@/app/BLACKJACK/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10
const MAX_HISTORY_ITEMS = 50

const PANEL_CLASS =
  'rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/90 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.06)]'

const RESULT_CONFIG: Record<'win' | 'loss' | 'push' | 'blackjack', { label: string; className: string }> = {
  blackjack: { label: 'BJ', className: 'bg-amber-500/20 text-amber-300 border-amber-400/40' },
  win: { label: 'WIN', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' },
  loss: { label: 'LOSS', className: 'bg-red-500/20 text-red-300 border-red-400/40' },
  push: { label: 'PUSH', className: 'bg-slate-500/20 text-slate-300 border-slate-400/40' },
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
  const gridCols = showBalance
    ? 'grid-cols-[auto_minmax(3.5rem,1fr)_minmax(3.5rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(5rem,1fr)]'
    : 'grid-cols-[auto_minmax(3.5rem,1fr)_minmax(3.5rem,1fr)_minmax(5rem,1fr)]'

  if (recentHistory.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-4 min-w-0 text-center">
        <p className="text-white/50 text-sm">No games yet. Place a bet to see your history here.</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-2 min-w-0">
      {/* Table header — visible on larger screens */}
      <div
        className={`hidden sm:grid ${gridCols} gap-3 px-4 py-2.5 text-xs font-medium text-white/50 uppercase tracking-wider border-b border-white/10 mb-1`}
      >
        <span>Result</span>
        <span>Bet</span>
        <span>P/L</span>
        {showBalance && <span>Balance</span>}
        <span>Bet ID</span>
      </div>

      <div className="space-y-1.5 overflow-x-auto min-w-0">
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
            <div
              key={result.gameId ?? `qh-${globalIndex}`}
              className={`${PANEL_CLASS} p-3 sm:px-4 transition-all hover:border-cyan-500/20`}
            >
              <div className={`grid ${gridCols} gap-3 sm:gap-4 items-center text-left`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${config.className}`}>
                    {config.label}
                  </span>
                  {wasSplit && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      SPLIT
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="text-white/60 text-xs sm:hidden">Bet </span>
                  <span className="text-white font-semibold text-sm">{formatEther(betAmount)}</span>
                </div>

                <div className="min-w-0">
                  <span className="text-white/60 text-xs sm:hidden">
                    {isWin ? 'Won ' : resultType === 'push' ? 'Returned ' : 'Lost '}
                  </span>
                  <span
                    className={`font-semibold text-sm ${
                      isWin ? 'text-emerald-400' : resultType === 'loss' ? 'text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {resultType === 'loss' ? '−' : '+'}
                    {formatEther(winLoss < BigInt(0) ? -winLoss : winLoss)}
                  </span>
                </div>

                {showBalance && (
                  <div className="min-w-0 flex items-center gap-1">
                    <span className="text-white/60 text-xs sm:hidden">Balance </span>
                    <span className="text-white font-semibold text-sm">{formatMorbius(balanceAtBetByIndex![globalIndex])}</span>
                    <Image
                      src="/morbius/MorbiusLogo (3).png"
                      alt="MORBIUS"
                      width={16}
                      height={16}
                      className="object-contain flex-shrink-0"
                    />
                  </div>
                )}

                <div className="min-w-0 flex items-center gap-1" title={result.gameId}>
                  <span className="text-white/70 font-mono text-xs truncate">{shortenGameId(result.gameId)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className={`mt-4 flex items-center justify-center gap-3 ${PANEL_CLASS} p-3`}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-500/20 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-white/80 tabular-nums">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="p-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-500/20 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
