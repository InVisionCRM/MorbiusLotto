'use client'

import { useState } from 'react'
import { formatEther } from 'viem'
import { useBlackjackRecentGamesGlobal, type RecentGameGlobalRow } from '@/hooks/use-blackjack-stats'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import Link from 'next/link'

const PAGE_SIZE = 25

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function last4(addr: string): string {
  if (!addr || addr.length < 4) return addr
  return addr.slice(-4)
}

function ResultRow({
  r,
  compact,
  onPlayerClick,
}: {
  r: RecentGameGlobalRow
  compact?: boolean
  onPlayerClick: (address: string) => void
}) {
  const bet = BigInt(r.total_bet_amount)
  const payout = BigInt(r.total_payout)
  const profit = payout - bet
  const win = profit > 0n
  const resultLabel = r.result === 'blackjack' ? 'BJ' : r.result ?? '—'
  const timeStr = formatTime(r.created_at ?? '')

  if (compact) {
    return (
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(140px,0.95fr)_4.5rem] items-center gap-4 sm:gap-5 py-2 px-2 sm:px-3 border-b border-white/5 last:border-0 text-sm">
        <span className="text-white/70 min-w-0 truncate">
          <span className="text-white/50 font-mono">{timeStr}</span>
          <span className="mx-1.5">·</span>
          <button
            type="button"
            onClick={() => onPlayerClick(r.wallet_address)}
            className="text-cyan-400 hover:text-cyan-300 font-mono focus:outline-none focus:ring-0"
          >
            {last4(r.wallet_address)}
          </button>
          {' · '}
          {resultLabel}
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
          <button
            type="button"
            onClick={() => onPlayerClick(r.wallet_address)}
            className="text-cyan-400 hover:text-cyan-300 font-mono focus:outline-none focus:ring-0"
          >
            {last4(r.wallet_address)}
          </button>
          {' · '}
          {resultLabel} · Bet {formatMorbius(bet)}
        </span>
        <span className="tabular-nums">Payout {formatMorbius(payout)}</span>
      </div>
      <div className="flex justify-end">
        <span className={`tabular-nums text-sm ${win ? 'text-green-400' : 'text-white/50'}`}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface BlackjackRecentPlaysProps {
  compact?: boolean
  title?: string
}

/** Global recent blackjack games (all players). Shows 25, then "Load more". */
export function BlackjackRecentPlays({
  compact = true,
  title = 'Recent Play',
}: BlackjackRecentPlaysProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const { data: games = [], isLoading, error } = useBlackjackRecentGamesGlobal(200)
  const displayGames = games.slice(0, displayCount)
  const hasMore = displayCount < games.length

  return (
    <>
      <div className="rounded-xl overflow-hidden w-full min-w-0 h-full flex flex-col min-h-0" style={panelStyle}>
        <div className="px-3 py-2 border-b border-white/10 shrink-0">
          <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {error ? (
            <div className="p-4 text-center text-red-400/90 text-sm">Couldn&apos;t load recent plays.</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              <span className="text-white/60 text-sm">Loading…</span>
            </div>
          ) : displayGames.length === 0 ? (
            <div className="p-4 text-center text-white/50 text-sm">No recent plays yet.</div>
          ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(140px,0.95fr)_4.5rem] items-center gap-4 sm:gap-5 px-2 sm:px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <span>Play</span>
              <span className="text-right">Net</span>
              <span className="text-center sm:text-right">Verify</span>
            </div>
            {displayGames.map((r) => (
              <ResultRow
                key={r.id}
                r={r}
                compact={compact}
                onPlayerClick={setSelectedAddress}
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
      </div>
      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}
