'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Copy, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatMORBIUS } from '@/lib/format-utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export type PurchaseEntry = {
  id: string
  game: 'Lottery' | 'Keno' | string
  roundLabel: string
  ticketsLabel: string
  freeTickets?: number
  addons?: string[]
  costLabel: string
  tx?: string
  timeLabel?: string
  status?: 'Confirmed' | 'Pending' | string
  // Enhanced fields
  paymentType?: 'MORBIUS' | 'PLS'
  originalAmount?: string  // Original PLS amount if paid in PLS
  ticketStatus?: 'in-play' | 'expired' | 'claimable' | 'claimed'
  winAmount?: bigint
  hasWon?: boolean
  // Expandable data
  roundIds?: number[]  // Array of round IDs for multi-round purchases
  ticketId?: bigint    // Keno ticket ID
  /** Instant Lottery: one play result (numbers, payout) for expand details */
  instantPlay?: { playerNumbers: number[]; winningNumbers: number[]; matchCount: number; netPayout: bigint }
}

export type PurchaseSummary = {
  tickets?: string | number
  spent?: string | number
  claimed?: string | number
  pending?: string | number
  pl?: string | number
  potentialPl?: string | number
  roi?: string | number
  potentialRoi?: string | number
  wonRounds?: number
}

export type RoundDetail = {
  roundId: number
  numbers?: number[]  // Player's picked numbers
  winningNumbers?: number[]  // Drawn winning numbers
  matches?: number
  prize?: bigint
  status: 'pending' | 'won' | 'lost'
}

interface PlayerPurchaseHistoryProps {
  title?: string
  summary?: PurchaseSummary
  entries: PurchaseEntry[]
  pulseUrl?: (tx: string) => string
  className?: string
  onRefresh?: () => void
  onLoadMore?: () => void
  hasMore?: boolean
  totalEntries?: number
  currentPage?: number
  itemsPerPage?: number
  onExpandEntry?: (entry: PurchaseEntry) => Promise<RoundDetail[]>
}

const defaultPulseUrl = (tx: string) => `https://scan.pulsechain.box/tx/${tx}`

export function PlayerPurchaseHistory({
  title = 'Player Statistics',
  summary,
  entries,
  pulseUrl = defaultPulseUrl,
  className,
  onRefresh,
  onLoadMore,
  hasMore = false,
  totalEntries,
  currentPage = 0,
  itemsPerPage = 25,
  onExpandEntry,
}: PlayerPurchaseHistoryProps) {
  const hasSummary = summary && Object.values(summary).some((v) => v !== undefined && v !== null)

  // Expanded state
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [roundDetails, setRoundDetails] = useState<Map<string, RoundDetail[]>>(new Map())
  const [loadingExpanded, setLoadingExpanded] = useState<Set<string>>(new Set())

  // Status badge configuration
  const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive', label: string, className?: string }> = {
    'in-play': { variant: 'default', label: 'In Play', className: 'bg-blue-500/80 hover:bg-blue-500' },
    'expired': { variant: 'outline', label: 'Expired', className: 'text-gray-400 border-gray-600' },
    'claimable': { variant: 'default', label: 'Claimable', className: 'bg-green-500/80 hover:bg-green-500' },
    'claimed': { variant: 'secondary', label: 'Claimed', className: 'bg-purple-500/80 hover:bg-purple-500' },
  }

  const toggleExpand = async (entry: PurchaseEntry) => {
    const isExpanded = expandedEntries.has(entry.id)

    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedEntries)
      newExpanded.delete(entry.id)
      setExpandedEntries(newExpanded)
    } else {
      // Expand - fetch details if not already loaded
      const newExpanded = new Set(expandedEntries)
      newExpanded.add(entry.id)
      setExpandedEntries(newExpanded)

      if (!roundDetails.has(entry.id) && onExpandEntry) {
        setLoadingExpanded(new Set(loadingExpanded).add(entry.id))
        try {
          const details = await onExpandEntry(entry)
          setRoundDetails(new Map(roundDetails).set(entry.id, details))
        } catch (error) {
          console.error('Error fetching round details:', error)
        } finally {
          const newLoading = new Set(loadingExpanded)
          newLoading.delete(entry.id)
          setLoadingExpanded(newLoading)
        }
      }
    }
  }
  return (
    <div className={cn("rounded-2xl border border-white/15 bg-slate-900/90 backdrop-blur-md shadow-lg overflow-hidden text-white", className)}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/60">Showcase</div>
            <h2 className="text-2xl font-bold text-white mt-1">{title}</h2>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="text-white/60 hover:text-white hover:bg-white/10"
              title="Refresh purchase history"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {hasSummary && (
        <>
          <div className="grid grid-cols-5 gap-px bg-white/5 border-b border-white/10">
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Tickets</div>
              <div className="text-lg font-bold text-white">{summary?.tickets ?? '—'}</div>
            </div>
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-blue-400/70 uppercase tracking-wide mb-0.5">Won Rounds</div>
              <div className="text-lg font-bold text-blue-300">{summary?.wonRounds ?? '—'}</div>
            </div>
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-red-400/70 uppercase tracking-wide mb-0.5">Spent</div>
              <div className="text-lg font-bold text-white">{summary?.spent ?? '—'}</div>
            </div>
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-green-400/70 uppercase tracking-wide mb-0.5">Claimed</div>
              <div className="text-lg font-bold text-white">{summary?.claimed ?? '—'}</div>
            </div>
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-yellow-400/70 uppercase tracking-wide mb-0.5">Pending</div>
              <div className="text-lg font-bold text-yellow-300">{summary?.pending ?? '—'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/10">
            <div className="bg-slate-900 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-white/50">Current P/L</span>
                <span className="text-[9px] text-white/40">ROI {summary?.roi ?? '—'}%</span>
              </div>
              <div className={cn("text-xl font-bold mt-1", Number(summary?.pl ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                {summary?.pl ?? '—'}
              </div>
            </div>
            <div className="bg-slate-900 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-white/50">If Claimed</span>
                <span className="text-[9px] text-white/40">ROI {summary?.potentialRoi ?? '—'}%</span>
              </div>
              <div className={cn("text-xl font-bold mt-1", Number(summary?.potentialPl ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                {summary?.potentialPl ?? '—'}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-slate-900">
        <div className="px-4 py-3 border-b border-white/10">
          <div className="text-[11px] font-bold text-white/70 uppercase tracking-wide">Purchase History</div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="text-[11px] text-white/50 bg-slate-900/95 sticky top-0 backdrop-blur-sm">
                <TableHead className="text-center py-2 px-2 font-medium w-8"></TableHead>
                <TableHead className="text-left py-2 px-4 font-medium">Game</TableHead>
                <TableHead className="text-left py-2 px-4 font-medium">Details</TableHead>
                <TableHead className="text-center py-2 px-4 font-medium">Tx</TableHead>
                <TableHead className="text-right py-2 px-4 font-medium">Cost</TableHead>
                <TableHead className="text-center py-2 px-4 font-medium">Status</TableHead>
                <TableHead className="text-center py-2 px-4 font-medium">Result</TableHead>
                <TableHead className="text-right py-2 px-4 font-medium">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-white/60">
                    No purchases found.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((r, i) => {
                  const isExpanded = expandedEntries.has(r.id)
                  const isLoading = loadingExpanded.has(r.id)
                  const details = roundDetails.get(r.id)
                  const isExpandable = onExpandEntry !== undefined

                  return (
                    <React.Fragment key={r.id}>
                      <TableRow
                        onClick={() => isExpandable && toggleExpand(r)}
                        className={cn(
                          "border-b border-white/10",
                          isExpandable && "cursor-pointer hover:bg-white/10",
                          !isExpandable && "hover:bg-white/5",
                          i % 2 === 0 ? "bg-gradient-to-br from-slate-950 to-slate-900/10" : "bg-gradient-to-br from-slate-950 to-slate-900/0"
                        )}
                      >
                        <TableCell className="py-2.5 px-2 text-center">
                          {isExpandable && (
                            isExpanded ? <ChevronDown className="w-4 h-4 text-white/60 inline" /> : <ChevronRight className="w-4 h-4 text-white/60 inline" />
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 font-semibold text-white">{r.game}</TableCell>
                    <TableCell className="py-2.5 px-4">
                      <div className="font-semibold text-white/90">{r.roundLabel}</div>
                      <div className="text-xs text-white/60 flex gap-2 flex-wrap">
                        <span>{r.ticketsLabel}</span>
                        {r.addons && r.addons.length > 0 && <span>{r.addons.join(', ')}</span>}
                        {r.freeTickets !== undefined && r.freeTickets > 0 && <span>Free {r.freeTickets}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-center">
                      {r.tx ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await navigator.clipboard.writeText(r.tx!)
                            toast.success('Transaction hash copied!', {
                              description: `${r.tx!.slice(0, 10)}...${r.tx!.slice(-8)}`,
                            })
                          }}
                          className="text-sky-300 hover:text-sky-200 hover:bg-white/5 h-7 px-2"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Txn
                        </Button>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-right whitespace-nowrap">
                      {r.paymentType === 'PLS' && r.originalAmount ? (
                        <div className="flex flex-col items-end">
                          <div className="text-sm font-semibold text-blue-300">
                            {r.originalAmount} PLS
                          </div>
                          <div className="text-xs text-white/50">{r.costLabel}</div>
                        </div>
                      ) : (
                        <div className="font-semibold text-emerald-300">{r.costLabel}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-center">
                      {r.ticketStatus ? (
                        <Badge
                          variant={statusConfig[r.ticketStatus]?.variant || 'outline'}
                          className={cn('text-[10px] px-2 py-0.5', statusConfig[r.ticketStatus]?.className)}
                        >
                          {statusConfig[r.ticketStatus]?.label || r.ticketStatus}
                        </Badge>
                      ) : (
                        <span className="text-white/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-center">
                      {r.hasWon && r.winAmount ? (
                        <Badge className="bg-gradient-to-r from-yellow-500 to-amber-600 text-white font-bold text-[10px] px-2 py-1 whitespace-nowrap">
                          <CheckCheck className="w-3 h-3 mr-1 inline" />
                          WON {formatMORBIUS(r.winAmount)}
                        </Badge>
                      ) : r.ticketStatus === 'in-play' ? (
                        <span className="text-xs text-blue-300">Pending</span>
                      ) : (
                        <span className="text-xs text-white/40">No Win</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-right text-white/70 whitespace-nowrap">
                      {r.timeLabel ?? '—'}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${r.id}-expanded`}>
                      <TableCell colSpan={8} className="py-4 px-6 bg-slate-950/50">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                            <span className="ml-3 text-white/60">Loading round details...</span>
                          </div>
                        ) : details && details.length > 0 ? (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-white/80 mb-3">Individual Round Outcomes:</h4>
                            {details.map((detail) => (
                              <div
                                key={detail.roundId}
                                className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5"
                              >
                                <div className="flex items-center gap-4">
                                  <span className="text-sm font-semibold text-white/90">Round #{detail.roundId}</span>
                                  {detail.numbers && detail.numbers.length > 0 && (
                                    <div className="flex gap-1">
                                      {detail.numbers.map((num, idx) => {
                                        const isMatch = detail.winningNumbers?.includes(num)
                                        return (
                                          <div
                                            key={idx}
                                            className={cn(
                                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold relative",
                                              isMatch
                                                ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white"
                                                : "bg-slate-700 text-white/80"
                                            )}
                                          >
                                            {num}
                                            {isMatch && (
                                              <CheckCheck className="w-3 h-3 absolute -top-1 -right-1 text-yellow-400" />
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                  {detail.matches !== undefined && (
                                    <span className="text-xs text-white/60">
                                      {detail.matches} {detail.matches === 1 ? 'match' : 'matches'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  {detail.status === 'pending' ? (
                                    <Badge variant="outline" className="text-blue-400 border-blue-500/50">Pending</Badge>
                                  ) : detail.status === 'won' && detail.prize ? (
                                    <Badge className="bg-gradient-to-r from-yellow-500 to-amber-600 text-white">
                                      Won {formatMORBIUS(detail.prize)}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-gray-400 border-gray-600">No Win</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-white/40 text-sm">
                            No detailed information available
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {onLoadMore && (
        <div className="px-4 py-3 border-t border-white/10 flex justify-between items-center">
          <div className="text-xs text-white/60">
            {totalEntries !== undefined ? (
              <>
                Showing {currentPage * itemsPerPage + 1} - {Math.min((currentPage + 1) * itemsPerPage, entries.length)} of {totalEntries}
              </>
            ) : (
              <>Showing {entries.length} entries</>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={!hasMore}
            className="text-white border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load More (25)
          </Button>
        </div>
      )}
    </div>
  )
}



