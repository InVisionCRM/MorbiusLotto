'use client'

import { useAccount } from 'wagmi'
import { useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import type { InstantLotteryResultRow } from '@/hooks/use-instant-lottery'

const panelStyle = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function ResultRow({ r, compact }: { r: InstantLotteryResultRow; compact?: boolean }) {
  const win = r.netPayout > 0n
  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 border-b border-white/5 last:border-0 text-xs">
        <span className="text-white/70">
          [{r.playerNumbers.join(', ')}] → {r.matchCount} match{r.matchCount !== 1 ? 'es' : ''}
        </span>
        <span className={win ? 'text-green-400' : 'text-white/60'}>
          {formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS
        </span>
      </div>
    )
  }
  return (
    <div className="py-2 px-3 border-b border-white/5 last:border-0 space-y-1 text-sm">
      <div className="flex gap-1 flex-wrap">
        {r.playerNumbers.map((n, i) => (
          <span key={i} className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs font-medium text-white">
            {n}
          </span>
        ))}
        <span className="text-white/50">→</span>
        {r.winningNumbers.map((n, i) => (
          <span key={i} className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center text-xs font-medium text-cyan-200">
            {n}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-xs text-white/70">
        <span>{r.matchCount} match{r.matchCount !== 1 ? 'es' : ''} · Wager {formatUnits(r.wager, TOKEN_DECIMALS)}</span>
        <span className={win ? 'text-green-400' : ''}>{formatUnits(r.netPayout, TOKEN_DECIMALS)} MORBIUS</span>
      </div>
    </div>
  )
}

export interface InstantLotteryHistoryProps {
  results?: InstantLotteryResultRow[]
  limit?: number
  compact?: boolean
  /** Optional title (default "My Recent Plays") */
  title?: string
}

export function InstantLotteryHistory({
  results: resultsProp,
  limit = 20,
  compact = true,
  title = 'My Recent Plays',
}: InstantLotteryHistoryProps) {
  const { address } = useAccount()
  const { results: resultsFromHook } = useInstantLotteryResults({ playerAddress: address ?? undefined, limit })
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
          displayResults.map((r, i) => <ResultRow key={i} r={r} compact={compact} />)
        )}
      </div>
    </div>
  )
}
