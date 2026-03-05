'use client'

import { useState } from 'react'
import { useKenoResults } from '@/hooks/use-keno-results'
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

const panelStyle = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

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
  limit?: number
  results?: KenoResultRow[]
  title?: string
}

export function GlobalKenoHistoryTable({
  limit = 20,
  results: resultsProp,
  title = 'Recent games',
}: GlobalKenoHistoryTableProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const { results: resultsFromHook } = useKenoResults({
    playerAddress: undefined,
    limit: resultsProp ? undefined : limit,
  })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, limit)

  return (
    <>
      <div className="rounded-xl overflow-hidden w-full" style={panelStyle}>
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
                      className="border-white/10 hover:bg-white/5"
                    >
                      <TableCell className="text-white/60 text-xs font-mono py-1.5 whitespace-nowrap">
                        {r.timestamp != null
                          ? new Date(r.timestamp * 1000).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 text-center text-white/90 text-xs">{r.spotSize}</TableCell>
                      <TableCell className="py-1.5 text-center text-white/90 text-xs">{r.hits}</TableCell>
                      <TableCell className="text-right text-white/80 text-xs tabular-nums py-1.5">
                        {formatMorbius(r.wager)}
                      </TableCell>
                      <TableCell className={`text-right text-xs tabular-nums py-1.5 ${won ? 'text-green-400' : 'text-white/50'}`}>
                        {formatMorbius(r.netPayout)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedAddress(r.player)}
                          className="text-cyan-400 hover:text-cyan-300 font-mono text-xs"
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
