'use client'

import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { usePlayerGames, type PlayerGameRow } from '@/hooks/use-blackjack-stats'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function ResultRow({ r, compact }: { r: PlayerGameRow; compact?: boolean }) {
  const bet = BigInt(r.total_bet_amount ?? 0)
  const payout = BigInt(r.total_payout ?? 0)
  const profit = payout - bet
  const win = profit > 0n
  const resultLabel = r.result === 'blackjack' ? 'BJ' : r.result ?? '—'

  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 border-b border-white/5 last:border-0 text-xs">
        <span className="text-white/70">
          {resultLabel} · #{r.game_number}
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
          {resultLabel} · Game #{r.game_number} · Bet {formatMorbius(bet)}
        </span>
      </div>
      <div className="flex justify-end">
        <span className={win ? 'text-green-400 text-xs' : 'text-white/50 text-xs'}>
          {win ? '+' : ''}{formatMorbius(profit)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface BlackjackRecentGamesProps {
  limit?: number
  compact?: boolean
  title?: string
}

/** Recent blackjack games for the connected player. */
export function BlackjackRecentGames({
  limit = 20,
  compact = true,
  title = 'Recent Games',
}: BlackjackRecentGamesProps) {
  const { address } = useAccount()
  const { data: games = [], isLoading, error } = usePlayerGames(limit, 0)
  const displayGames = games.slice(0, limit)

  return (
    <div className="rounded-xl overflow-hidden w-full max-w-xl" style={panelStyle}>
      <div className="px-3 py-2 border-b border-white/10">
        <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
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
          displayGames.map((r) => (
            <ResultRow key={r.id} r={r} compact={compact} />
          ))
        )}
      </div>
    </div>
  )
}
