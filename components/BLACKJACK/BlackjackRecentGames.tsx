'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { toBigIntSafe } from '@/lib/safe-bigint'
import { usePlayerGames, type PlayerGameRow } from '@/hooks/use-blackjack-stats'
import { Theme } from '@/lib/theme'
import { formatBlackjackPlayTime } from '@/lib/format-blackjack-play-time'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const compactRowGrid =
  'grid grid-cols-[minmax(min-content,1fr)_auto_4.5rem] items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 border-b border-white/5 last:border-0 text-sm'

function ResultRow({
  r,
  compact,
  onVerifyRequest,
}: {
  r: PlayerGameRow
  compact?: boolean
  onVerifyRequest?: (gameId: string) => void
}) {
  const bet = toBigIntSafe(r.total_bet_amount ?? 0)
  const payout = toBigIntSafe(r.total_payout ?? 0)
  const profit = payout - bet
  const win = profit > 0n
  const resultLabel = r.result === 'blackjack' ? 'BJ' : r.result ?? '—'
  const timeStr = formatBlackjackPlayTime(r.created_at)

  if (compact) {
    return (
      <div className={compactRowGrid}>
        <span className="text-white/70 min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          <span className="text-white/50 font-mono">{timeStr}</span>
          <span className="mx-1.5">·</span>
          {resultLabel} · #{r.game_number}
        </span>
        <span className={`shrink-0 tabular-nums text-right ${win ? 'text-green-400' : 'text-white/60'}`}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
        <button
          type="button"
          onClick={() => onVerifyRequest?.(r.id)}
          className="shrink-0 text-left sm:text-right text-blue-400 hover:text-blue-300 text-xs font-semibold underline underline-offset-2"
        >
          Verify
        </button>
      </div>
    )
  }
  return (
    <div className="py-2 px-3 border-b border-white/5 last:border-0 space-y-1 text-sm">
      <div className="flex justify-between text-sm text-white/70">
        <span className="text-white/50 font-mono">{timeStr}</span>
        <span>
          {resultLabel} · Game #{r.game_number} · Bet {formatMorbius(bet)}
        </span>
      </div>
      <div className="flex justify-end">
        <span className={`tabular-nums ${win ? 'text-green-400' : 'text-white/50'} text-sm`}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface BlackjackRecentGamesProps {
  compact?: boolean
  title?: string
}

const INITIAL_DISPLAY = 50
const PAGE_SIZE = 25

/** Recent blackjack games for the connected player. Shows 50 initially, then "Load more" for next 25. */
export function BlackjackRecentGames({
  compact = true,
  title = 'Recent Games',
}: BlackjackRecentGamesProps) {
  const router = useRouter()
  const { address } = useAccount()
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY)
  const [pendingVerifyGameId, setPendingVerifyGameId] = useState<string | null>(null)
  const { data: games = [], isLoading, error } = usePlayerGames(100, 0)
  const displayGames = games.slice(0, displayCount)
  const hasMore = displayCount < games.length

  const confirmLeaveToVerify = () => {
    if (!pendingVerifyGameId) return
    router.push(`/BLACKJACK/verify?gameId=${encodeURIComponent(pendingVerifyGameId)}`)
    setPendingVerifyGameId(null)
  }

  return (
    <div className="rounded-xl overflow-hidden w-full flex flex-col h-full min-h-0 min-w-0" style={panelStyle}>
      <div className="px-3 py-2 border-b border-white/10 shrink-0">
        <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!address ? (
          <div className="p-4 text-center text-white/50 text-sm">Connect wallet to see your recent games.</div>
        ) : error ? (
          <div className="p-4 text-center text-red-400/90 text-sm">Couldn&apos;t load games.</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            <span className="text-white/60 text-sm">Loading…</span>
          </div>
        ) : displayGames.length === 0 ? (
          <div className="p-4 text-center text-white/50 text-sm">No games yet. Play Blackjack to see history here.</div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(min-content,1fr)_auto_4.5rem] items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <span>Game</span>
              <span className="text-right">Net</span>
              <span className="text-center sm:text-right">Verify</span>
            </div>
            {displayGames.map((r) => (
              <ResultRow
                key={r.id}
                r={r}
                compact={compact}
                onVerifyRequest={compact ? (id) => setPendingVerifyGameId(id) : undefined}
              />
            ))}
          </>
        )}
      </div>
      {hasMore && displayGames.length > 0 && (
        <div className="px-2 py-2 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setDisplayCount((c) => c + PAGE_SIZE)}
            className="w-full py-1.5 text-sm text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10"
          >
            Load more
          </button>
        </div>
      )}

      {pendingVerifyGameId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-label="Dismiss"
            onClick={() => setPendingVerifyGameId(null)}
          />
          <div
            className="relative w-full max-w-md rounded-2xl border-2 border-cyan-500/30 shadow-2xl overflow-hidden"
            style={Theme.panel.base}
          >
            <div className={`px-5 py-4 ${Theme.modal.header}`}>
              <h2 className="text-lg font-bold text-white text-center">Leave table?</h2>
            </div>
            <p className="px-5 pb-4 text-sm text-slate-200/90 leading-relaxed">
              You are about to leave the blackjack table to go to the verification page. Are you sure you want to
              continue?
            </p>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingVerifyGameId(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLeaveToVerify}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover}`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
