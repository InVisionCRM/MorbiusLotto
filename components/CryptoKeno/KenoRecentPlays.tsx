'use client'

import { useAccount } from 'wagmi'
import { useKenoResults } from '@/hooks/use-keno-results'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import type { KenoResultRow } from '@/hooks/use-keno-results'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function ResultRow({ r, compact }: { r: KenoResultRow; compact?: boolean }) {
  const win = r.netPayout > 0n
  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 border-b border-white/5 last:border-0 text-xs">
        <span className="text-white/70">
          {r.spotSize}-Spot · {r.hits} hit{r.hits !== 1 ? 's' : ''}
        </span>
        <span className={win ? 'text-green-400' : 'text-white/60'}>
          {formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS
        </span>
      </div>
    )
  }
  return (
    <div className="py-2 px-3 border-b border-white/5 last:border-0 space-y-1 text-sm">
      <div className="flex justify-between text-xs text-white/70">
        <span>{r.spotSize}-Spot · {r.hits} hit{r.hits !== 1 ? 's' : ''}</span>
        <span>Wager {formatUnits(r.wager, TOKEN_DECIMALS)}</span>
      </div>
      <div className="flex justify-end">
        <span className={win ? 'text-green-400 text-xs' : 'text-white/50 text-xs'}>
          {formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface KenoRecentPlaysProps {
  results?: KenoResultRow[]
  limit?: number
  compact?: boolean
  title?: string
}

export function KenoRecentPlays({
  results: resultsProp,
  limit = 20,
  compact = true,
  title = 'My Recent Plays',
}: KenoRecentPlaysProps) {
  const { address } = useAccount()
  const { results: resultsFromHook } = useKenoResults({ playerAddress: address ?? undefined, limit })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, limit)

  return (
    <div className="rounded-xl overflow-hidden w-full max-w-xl" style={panelStyle}>
      <div className="px-3 py-2 border-b border-white/10">
        <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {displayResults.length === 0 ? (
          <div className="p-4 text-center text-white/50 text-sm">No plays yet. Play to see history here.</div>
        ) : (
          displayResults.map((r, i) => <ResultRow key={`${r.ticketId}-${r.transactionHash ?? i}`} r={r} compact={compact} />)
        )}
      </div>
    </div>
  )
}
