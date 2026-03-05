'use client'

import { useState } from 'react'
import { usePlinkoResults } from '@/hooks/use-plinko-results'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'

function formatMorbius(wei: bigint): string {
  return Number(formatUnits(wei, TOKEN_DECIMALS)).toFixed(2)
}
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import type { PlinkoResultRow } from '@/hooks/use-plinko-results'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

/** Last 4 hex chars of address, e.g. {a1b2} */
function last4Address(addr: string): string {
  if (!addr || addr.length < 4) return addr
  return `{${addr.slice(-4)}}`
}

function ResultRow({
  r,
  compact,
  onPlayerClick,
}: {
  r: PlinkoResultRow
  compact?: boolean
  onPlayerClick: (address: string) => void
}) {
  const win = r.profit > 0n
  const multDisplay = Number(r.multiplier) / 100
  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 border-b border-white/5 last:border-0 text-xs">
        <span className="text-white/70">
          <button
            type="button"
            onClick={() => onPlayerClick(r.player)}
            className="text-cyan-400 hover:text-cyan-300 font-mono focus:outline-none focus:ring-0"
          >
            {last4Address(r.player)}
          </button>
          {' · '}
          {r.riskLevelName} · {multDisplay.toFixed(2)}x
        </span>
        <span className={win ? 'text-green-400' : 'text-white/60'}>
          {formatMorbius(r.payout)} MORBIUS
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
            onClick={() => onPlayerClick(r.player)}
            className="text-cyan-400 hover:text-cyan-300 font-mono focus:outline-none focus:ring-0"
          >
            {last4Address(r.player)}
          </button>
          {' · '}
          {r.riskLevelName} · {multDisplay.toFixed(2)}x
        </span>
        <span>Payout {formatMorbius(r.payout)}</span>
      </div>
      <div className="flex justify-end">
        <span className={win ? 'text-green-400 text-xs' : 'text-white/50 text-xs'}>
          {win ? '+' : ''}{formatMorbius(r.profit)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface PlinkoRecentPlaysProps {
  results?: PlinkoResultRow[]
  limit?: number
  compact?: boolean
  title?: string
}

/** Shows the most recent Plinko games played globally (all players). */
export function PlinkoRecentPlays({
  results: resultsProp,
  limit = 20,
  compact = true,
  title = 'Recent Play',
}: PlinkoRecentPlaysProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const { results: resultsFromHook } = usePlinkoResults({ playerAddress: undefined, limit })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, limit)

  return (
    <>
      <div className="rounded-xl overflow-hidden w-full max-w-xl" style={panelStyle}>
        <div className="px-3 py-2 border-b border-white/10">
          <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {displayResults.length === 0 ? (
            <div className="p-4 text-center text-white/50 text-sm">No recent plays yet.</div>
          ) : (
            displayResults.map((r, i) => (
              <ResultRow
                key={`${r.transactionHash ?? ''}-${r.seed}-${i}`}
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
        game="plinko"
      />
    </>
  )
}
