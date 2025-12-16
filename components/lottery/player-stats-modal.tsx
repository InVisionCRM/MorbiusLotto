'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BarChart3, Loader2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import { useAccount } from 'wagmi'
import { usePlayerLifetime, usePlayerRoundHistory } from '@/hooks/use-lottery-6of55'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export function PlayerStatsModal() {
  const { address } = useAccount()
  const { data: lifetimeData, isLoading: isLoadingLifetime } = usePlayerLifetime(address)
  const { data: roundHistoryData, isLoading: isLoadingHistory } = usePlayerRoundHistory(address, 0, 50)

  const fmt = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })

  const stats = useMemo(() => {
    if (!lifetimeData || !Array.isArray(lifetimeData) || lifetimeData.length < 4) return null
    const [tickets, spent, claimed, claimable] = lifetimeData as [bigint, bigint, bigint, bigint]
    const pl = claimed - spent
    const potentialPL = claimed + claimable - spent
    return {
      tickets: Number(tickets),
      spent,
      claimed,
      claimable,
      pl,
      potentialPL,
      roi: spent > 0 ? ((Number(pl) / Number(spent)) * 100).toFixed(1) : '0.0',
      potentialROI: spent > 0 ? ((Number(potentialPL) / Number(spent)) * 100).toFixed(1) : '0.0',
    }
  }, [lifetimeData])

  const history = useMemo(() => {
    if (!roundHistoryData || !Array.isArray(roundHistoryData) || roundHistoryData.length < 3) return []
    const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
    return ids.map((id, i) => ({ id: Number(id), tickets: Number(tickets[i]), wins: wins[i] || BigInt(0) }))
      .filter(r => r.id > 0).reverse()
  }, [roundHistoryData])

  const isLoading = isLoadingLifetime || isLoadingHistory

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0" title="Stats">
          <BarChart3 className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/98 border-white/20 text-white max-w-2xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-white/10">
          <DialogTitle className="text-base font-bold text-white">Player Statistics</DialogTitle>
        </DialogHeader>

        {!address ? (
          <div className="px-4 py-8 text-center text-xs text-white/50">Connect wallet to view stats</div>
        ) : isLoading ? (
          <div className="px-4 py-8 flex items-center justify-center gap-2 text-xs text-white/50">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading...
          </div>
        ) : !stats ? (
          <div className="px-4 py-8 text-center text-xs text-white/50">No data available</div>
        ) : (
          <div className="overflow-y-auto max-h-[calc(85vh-60px)]">
            {/* Compact Overview Grid */}
            <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/10">
              <div className="bg-slate-900 p-2">
                <div className="text-[9px] text-white/50 uppercase tracking-wide mb-0.5">Tickets</div>
                <div className="text-lg font-bold text-white">{stats.tickets}</div>
              </div>
              <div className="bg-slate-900 p-2">
                <div className="text-[9px] text-red-400/70 uppercase tracking-wide mb-0.5">Spent</div>
                <div className="text-sm font-bold text-white">{fmt(stats.spent)}</div>
              </div>
              <div className="bg-slate-900 p-2">
                <div className="text-[9px] text-green-400/70 uppercase tracking-wide mb-0.5">Claimed</div>
                <div className="text-sm font-bold text-white">{fmt(stats.claimed)}</div>
              </div>
              <div className="bg-slate-900 p-2">
                <div className="text-[9px] text-yellow-400/70 uppercase tracking-wide mb-0.5">Pending</div>
                <div className="text-sm font-bold text-yellow-400">{fmt(stats.claimable)}</div>
              </div>
            </div>

            {/* P/L Section */}
            <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/10">
              <div className="bg-slate-900 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-white/50">Current P/L</span>
                  <span className="text-[9px] text-white/40">ROI {stats.roi}%</span>
                </div>
                <div className={cn("text-xl font-bold mt-0.5", stats.pl >= 0 ? "text-green-400" : "text-red-400")}>
                  {stats.pl >= 0 ? '+' : ''}{fmt(stats.pl)}
                </div>
              </div>
              <div className="bg-slate-900 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-white/50">If Claimed</span>
                  <span className="text-[9px] text-white/40">ROI {stats.potentialROI}%</span>
                </div>
                <div className={cn("text-xl font-bold mt-0.5", stats.potentialPL >= 0 ? "text-green-400" : "text-red-400")}>
                  {stats.potentialPL >= 0 ? '+' : ''}{fmt(stats.potentialPL)}
                </div>
              </div>
            </div>

            {/* Dense History Table */}
            {history.length > 0 && (
              <div className="bg-slate-900">
                <div className="px-3 py-2 border-b border-white/10">
                  <div className="text-[10px] font-bold text-white/70 uppercase tracking-wide">Purchase History</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-white/5">
                      <tr className="text-[10px] text-white/50">
                        <th className="text-left py-1.5 px-3 font-medium">Round</th>
                        <th className="text-center py-1.5 px-2 font-medium">Tix</th>
                        <th className="text-right py-1.5 px-3 font-medium">Winnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r, i) => (
                        <tr key={r.id} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", i % 2 === 0 ? "bg-black/20" : "")}>
                          <td className="py-1.5 px-3 font-mono font-semibold text-white">#{r.id}</td>
                          <td className="py-1.5 px-2 text-center text-white/60">{r.tickets}</td>
                          <td className={cn("py-1.5 px-3 text-right font-mono font-semibold", r.wins > 0 ? "text-green-400" : "text-white/30")}>
                            {r.wins > 0 ? fmt(r.wins) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}







