'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useKenoResults } from '@/hooks/use-keno-results'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import type { KenoResultRow } from '@/hooks/use-keno-results'

const PAGE_SIZE = 25

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatTime(ts: number | undefined): string {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ResultRow({ r, compact }: { r: KenoResultRow; compact?: boolean }) {
  const win = r.netPayout > 0n
  const timeStr = formatTime(r.timestamp)
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2 py-2 px-2 border-b border-white/5 last:border-0 text-sm">
        <span className="text-white/70 shrink-0 min-w-0">
          <span className="text-white/50 font-mono">{timeStr}</span>
          <span className="mx-1.5">·</span>
          {r.spotSize}-Spot · {r.hits} hit{r.hits !== 1 ? 's' : ''}
        </span>
        <span className={`shrink-0 tabular-nums ${win ? 'text-green-400' : 'text-white/60'}`}>
          {formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS
        </span>
      </div>
    )
  }
  return (
    <div className="py-2 px-3 border-b border-white/5 last:border-0 space-y-1 text-sm">
      <div className="flex justify-between text-sm text-white/70">
        <span className="text-white/50 font-mono">{timeStr}</span>
        <span>{r.spotSize}-Spot · {r.hits} hit{r.hits !== 1 ? 's' : ''}</span>
        <span className="tabular-nums">Wager {formatUnits(r.wager, TOKEN_DECIMALS)}</span>
      </div>
      <div className="flex justify-end">
        <span className={`tabular-nums text-sm ${win ? 'text-green-400' : 'text-white/50'}`}>
          {formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS
        </span>
      </div>
    </div>
  )
}

export interface KenoRecentPlaysProps {
  results?: KenoResultRow[]
  compact?: boolean
  title?: string
}

/** My recent Keno plays. Shows 25, then "Load more". */
export function KenoRecentPlays({
  results: resultsProp,
  compact = true,
  title = 'My Recent Plays',
}: KenoRecentPlaysProps) {
  const { address } = useAccount()
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const { results: resultsFromHook } = useKenoResults({ playerAddress: address ?? undefined, limit: 500 })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, displayCount)
  const hasMore = displayCount < results.length

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
      {hasMore && displayResults.length > 0 && (
        <div className="px-2 py-2 border-t border-white/10">
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
