'use client'

import { useState } from 'react'
import { useKenoResults } from '@/hooks/use-keno-results'

const PAGE_SIZE = 25
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import type { KenoResultRow } from '@/hooks/use-keno-results'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatMorbius(amount: bigint): string {
  return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function last4(addr: string): string {
  if (!addr || addr.length < 4) return addr
  return addr.slice(-4)
}

export interface GlobalKenoHistoryTableProps {
  results?: KenoResultRow[]
  title?: string
}

/** Global Keno recent games. Shows 25, then "Load more". */
export function GlobalKenoHistoryTable({
  results: resultsProp,
  title = 'Recent games',
}: GlobalKenoHistoryTableProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const { results: resultsFromHook } = useKenoResults({
    playerAddress: undefined,
    limit: resultsProp ? undefined : 500,
  })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, displayCount)
  const hasMore = displayCount < results.length

  return (
    <>
      <div className="surface-panel w-full overflow-hidden rounded-xl">
        <div className="px-3 py-2 border-b border-white/10">
          <h3 className="text-cyan-300 font-semibold text-sm">{title}</h3>
        </div>
        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/70 font-medium">Date</TableHead>
                <TableHead className="text-white/70 font-medium text-center">Spot</TableHead>
                <TableHead className="text-white/70 font-medium text-center">Hits</TableHead>
                <TableHead className="text-white/70 font-medium text-right">Bet</TableHead>
                <TableHead className="text-white/70 font-medium text-right">Won</TableHead>
                <TableHead className="text-white/70 font-medium">Player</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayResults.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="text-center text-white/50 text-sm py-8">
                    No games yet. Play to see history here.
                  </TableCell>
                </TableRow>
              ) : (
                displayResults.map((r, i) => {
                  const won = r.netPayout > 0n
                  return (
                    <TableRow
                      key={r.transactionHash ? `${r.transactionHash}-${r.blockNumber ?? i}` : `row-${i}`}
                      className="border-white/5 hover:bg-white/5"
                    >
                      <TableCell className="text-white/60 font-mono p-2 whitespace-nowrap">
                        {r.timestamp != null
                          ? new Date(r.timestamp * 1000).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell className="p-2 text-center text-white/90">{r.spotSize}</TableCell>
                      <TableCell className="p-2 text-center text-white/90">{r.hits}</TableCell>
                      <TableCell className="text-right text-white/80 tabular-nums p-2">
                        {formatMorbius(r.wager)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums p-2 ${won ? 'text-green-400' : 'text-white/50'}`}>
                        {formatMorbius(r.netPayout)}
                      </TableCell>
                      <TableCell className="p-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAddress(r.player)}
                          className="text-cyan-400 hover:text-cyan-300 font-mono"
                          title="View keno stats"
                        >
                          {last4(r.player)}
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
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

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
        game="keno"
      />
    </>
  )
}
