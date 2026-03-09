'use client'

import { useState } from 'react'
import { formatEther } from 'viem'
import { useBlackjackRecentGamesGlobal, type RecentGameGlobalRow } from '@/hooks/use-blackjack-stats'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString(undefined, { maximumFractionDigits: 2 })
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

  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 border-b border-white/5 last:border-0 text-xs">
        <span className="text-white/70">
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
        <span className={win ? 'text-green-400' : 'text-white/60'}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
      </div>
    )
  }
  return (
    <div className="py-2 px-3 border-b border-white/5 last:border-0 space-y-1 text-sm">
      <div className="flex justify-between text-xs text-white/70">
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
        <span>Payout {formatMorbius(payout)}</span>
      </div>
      <div className="flex justify-end">
        <span className={win ? 'text-green-400 text-xs' : 'text-white/50 text-xs'}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface BlackjackRecentPlaysProps {
  limit?: number
  compact?: boolean
  title?: string
}

/** Global recent blackjack games (all players) for Recent Play feed. */
export function BlackjackRecentPlays({
  limit = 25,
  compact = true,
  title = 'Recent Play',
}: BlackjackRecentPlaysProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const { data: games = [], isLoading, error } = useBlackjackRecentGamesGlobal(limit)
  const displayGames = games.slice(0, limit)

  return (
    <>
      <div className="rounded-xl overflow-hidden w-full max-w-xl h-full flex flex-col min-h-0" style={panelStyle}>
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
            displayGames.map((r) => (
              <ResultRow
                key={r.id}
                r={r}
                compact={compact}
                onPlayerClick={setSelectedAddress}
              />
            ))
          )}
        </div>
      </div>
      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}
