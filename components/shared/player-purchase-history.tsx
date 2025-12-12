'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

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
}

interface PlayerPurchaseHistoryProps {
  title?: string
  summary?: PurchaseSummary
  entries: PurchaseEntry[]
  pulseUrl?: (tx: string) => string
  className?: string
}

const defaultPulseUrl = (tx: string) => `https://scan.pulsechain.box/tx/${tx}`

export function PlayerPurchaseHistory({
  title = 'Player Statistics',
  summary,
  entries,
  pulseUrl = defaultPulseUrl,
  className,
}: PlayerPurchaseHistoryProps) {
  const hasSummary = summary && Object.values(summary).some((v) => v !== undefined && v !== null)
  return (
    <div className={cn("rounded-2xl border border-white/15 bg-slate-900/90 backdrop-blur-md shadow-lg overflow-hidden text-white", className)}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="text-xs uppercase tracking-[0.25em] text-white/60">Showcase</div>
        <h2 className="text-2xl font-bold text-white mt-1">{title}</h2>
      </div>

      {hasSummary && (
        <>
          <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/10">
            <div className="bg-slate-900 p-3">
              <div className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Tickets</div>
              <div className="text-lg font-bold text-white">{summary?.tickets ?? '—'}</div>
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
                <TableHead className="text-left py-2 px-4 font-medium">Game</TableHead>
                <TableHead className="text-left py-2 px-4 font-medium">Details</TableHead>
                <TableHead className="text-left py-2 px-4 font-medium">Tx</TableHead>
                <TableHead className="text-right py-2 px-4 font-medium">Cost</TableHead>
                <TableHead className="text-right py-2 px-4 font-medium">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-white/60">
                    No purchases found.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((r, i) => (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "border-b border-white/10 hover:bg-white/5",
                      i % 2 === 0 ? "bg-black/10" : "bg-black/0"
                    )}
                  >
                    <TableCell className="py-2.5 px-4 font-semibold text-white">{r.game}</TableCell>
                    <TableCell className="py-2.5 px-4">
                      <div className="font-semibold text-white/90">{r.roundLabel}</div>
                      <div className="text-xs text-white/60 flex gap-2 flex-wrap">
                        <span>{r.ticketsLabel}</span>
                        {r.addons && r.addons.length > 0 && <span>{r.addons.join(', ')}</span>}
                        {r.freeTickets !== undefined && r.freeTickets > 0 && <span>Free {r.freeTickets}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-4">
                      {r.tx ? (
                        <a
                          href={pulseUrl(r.tx)}
                          className="text-sky-300 hover:text-sky-200 underline decoration-dotted font-mono text-xs whitespace-nowrap truncate max-w-[160px] inline-block align-middle"
                          title={r.tx}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.tx.slice(0, 10)}...{r.tx.slice(-6)}
                        </a>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-semibold text-emerald-300 whitespace-nowrap">
                      {r.costLabel}
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-right text-white/70 whitespace-nowrap">
                      {r.timeLabel ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}



