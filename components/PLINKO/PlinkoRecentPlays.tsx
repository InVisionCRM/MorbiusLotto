'use client'

import { useState } from 'react'
import { usePlinkoResults } from '@/hooks/use-plinko-results'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import type { PlinkoResultRow } from '@/hooks/use-plinko-results'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 25

function formatMorbius(wei: bigint): string {
  return Number(formatUnits(wei, TOKEN_DECIMALS)).toFixed(2)
}

function formatTime(ts: number | undefined): string {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

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

export interface PlinkoRecentPlaysProps {
  results?: PlinkoResultRow[]
  compact?: boolean
  title?: string
}

/** Shows the most recent Plinko games played globally. Shows 25, then "Load more". */
export function PlinkoRecentPlays({
  results: resultsProp,
  compact = true,
  title = 'Recent Play',
}: PlinkoRecentPlaysProps) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const { results: resultsFromHook } = usePlinkoResults({ playerAddress: undefined, limit: 500 })
  const results = resultsProp ?? resultsFromHook
  const displayResults = results.slice(0, displayCount)
  const hasMore = displayCount < results.length

  return (
    <>
      <div className="w-full min-w-0 overflow-hidden rounded-xl" style={panelStyle}>
        <div className="border-b border-white/10 px-3 py-2">
          <h3 className="text-sm font-semibold text-cyan-300">{title}</h3>
        </div>
        <div className="max-h-64 overflow-y-auto overflow-x-hidden">
          {displayResults.length === 0 ? (
            <div className="p-4 text-center text-sm text-white/50">No recent plays yet.</div>
          ) : compact ? (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="w-[25%] text-white/70 font-medium">Time</TableHead>
                  <TableHead className="w-[25%] text-center text-white/70 font-medium">Player</TableHead>
                  <TableHead className="w-[25%] text-center text-white/70 font-medium">Result</TableHead>
                  <TableHead className="w-[25%] text-right text-white/70 font-medium">Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayResults.map((r, i) => {
                  const multDisplay = Number(r.multiplier) / 100
                  const timeStr = formatTime(r.timestamp)
                  return (
                    <TableRow
                      key={`${r.transactionHash ?? ''}-${r.seed}-${i}`}
                      className="border-white/5 hover:bg-white/5"
                    >
                      <TableCell className="min-w-0 text-left text-xs text-white/60 sm:text-sm">
                        <span className="font-mono">{timeStr}</span>
                      </TableCell>
                      <TableCell className="min-w-0 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedAddress(r.player)}
                          className="font-mono text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-0"
                        >
                          {last4Address(r.player)}
                        </button>
                      </TableCell>
                      <TableCell className="min-w-0 text-center text-xs text-white/80 sm:text-sm">
                        {r.riskLevelName} · {multDisplay.toFixed(2)}x
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-white/90 sm:text-sm">
                        {formatMorbius(r.payout)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="divide-y divide-white/5">
              {displayResults.map((r, i) => {
                const win = r.profit > 0n
                const multDisplay = Number(r.multiplier) / 100
                const timeStr = formatTime(r.timestamp)
                return (
                  <div key={`${r.transactionHash ?? ''}-${r.seed}-${i}`} className="space-y-1 px-3 py-2 text-sm">
                    <div className="flex justify-between text-white/70">
                      <span className="font-mono text-white/50">{timeStr}</span>
                      <span>
                        <button
                          type="button"
                          onClick={() => setSelectedAddress(r.player)}
                          className="font-mono text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-0"
                        >
                          {last4Address(r.player)}
                        </button>
                        {' · '}
                        {r.riskLevelName} · {multDisplay.toFixed(2)}x
                      </span>
                      <span className="tabular-nums">Payout {formatMorbius(r.payout)}</span>
                    </div>
                    <div className="flex justify-end">
                      <span className={`tabular-nums text-sm ${win ? 'text-green-400' : 'text-white/50'}`}>
                        {win ? '+' : ''}
                        {formatMorbius(r.profit)} MORBIUS
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
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
      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
        game="plinko"
      />
    </>
  )
}
