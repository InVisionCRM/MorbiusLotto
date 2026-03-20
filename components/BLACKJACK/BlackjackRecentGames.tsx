'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { toBigIntSafe } from '@/lib/safe-bigint'
import { usePlayerGames, type PlayerGameRow } from '@/hooks/use-blackjack-stats'
import Link from 'next/link'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatTime(isoOrMs: string | number): string {
  const date = typeof isoOrMs === 'string' ? new Date(isoOrMs) : new Date(isoOrMs)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ResultRow({ r, compact }: { r: PlayerGameRow; compact?: boolean }) {
  const bet = toBigIntSafe(r.total_bet_amount ?? 0)
  const payout = toBigIntSafe(r.total_payout ?? 0)
  const profit = payout - bet
  const win = profit > 0n
  const resultLabel = r.result === 'blackjack' ? 'BJ' : r.result ?? '—'
  const timeStr = r.created_at ? formatTime(r.created_at) : '—'

  if (compact) {
    return (
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 px-2 border-b border-white/5 last:border-0 text-sm">
        <span className="text-white/70 min-w-0 truncate">
          <span className="text-white/50 font-mono">{timeStr}</span>
          <span className="mx-1.5">·</span>
          {resultLabel} · #{r.game_number}
        </span>
        <span className={`shrink-0 tabular-nums text-right ${win ? 'text-green-400' : 'text-white/60'}`}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
        <Link
          href={`/BLACKJACK/verify?gameId=${encodeURIComponent(r.id)}`}
          className="shrink-0 text-blue-400 hover:text-blue-300 text-xs font-semibold underline underline-offset-2"
        >
          Verify
        </Link>
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
  const { address } = useAccount()
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY)
  const { data: games = [], isLoading, error } = usePlayerGames(100, 0)
  const displayGames = games.slice(0, displayCount)
  const hasMore = displayCount < games.length

  return (
    <div className="rounded-xl overflow-hidden w-full max-w-xl flex flex-col h-full min-h-0" style={panelStyle}>
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
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <span>Game</span>
              <span>Net</span>
              <span>Verify</span>
            </div>
            {displayGames.map((r) => (
              <ResultRow key={r.id} r={r} compact={compact} />
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
    </div>
  )
}
