'use client'

import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'
import { formatMORBIUS } from '@/lib/format-utils'

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-white/70">{label}</span>
      <span className="text-cyan-300/90 font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function GlobalStatsSection() {
  const { data, isLoading, error } = usePlatformAnalytics()

  if (error) {
    return null
  }

  if (isLoading || !data) {
    return (
      <section className="w-full max-w-2xl">
        <div className="rounded-2xl border border-cyan-500/30 p-6" style={PANEL_STYLE}>
          <h2 className="text-lg font-semibold text-cyan-300 mb-4">Platform stats</h2>
          <p className="text-white/50 text-sm">Loading…</p>
        </div>
      </section>
    )
  }

  const { blackjack, plinko, keno, lottery, bigWheel, combined } = data
  const totalGames = Number(combined.totalGamesPlayed)
  const totalVolume = BigInt(combined.totalVolume)
  const totalPayouts = BigInt(combined.totalPayouts)

  return (
    <section className="w-full max-w-2xl">
      <div className="rounded-2xl border border-cyan-500/30 p-6 space-y-6" style={PANEL_STYLE}>
        <h2 className="text-lg font-semibold text-cyan-300 border-b border-white/10 pb-2">
          Platform stats
        </h2>

        {/* Combined */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">All games</p>
          <StatRow label="Total games played" value={totalGames.toLocaleString()} />
          <StatRow label="Total volume (MORBIUS)" value={formatMORBIUS(totalVolume)} />
          <StatRow label="Total paid out (MORBIUS)" value={formatMORBIUS(totalPayouts)} />
        </div>

        {/* Per-game */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <div className="space-y-1">
            <p className="text-xs font-medium text-cyan-400/80 mb-1">Blackjack</p>
            <StatRow label="Hands" value={(blackjack?.total_games_played ?? 0).toLocaleString()} />
            <StatRow label="Players" value={(blackjack?.total_players ?? 0).toLocaleString()} />
          </div>
          {plinko && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-cyan-400/80 mb-1">Plinko</p>
              <StatRow label="Balls dropped" value={Number(plinko.totalDrops).toLocaleString()} />
              <StatRow label="Volume" value={formatMORBIUS(plinko.totalRevenue)} />
            </div>
          )}
          {keno && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-cyan-400/80 mb-1">Keno</p>
              <StatRow label="Tickets" value={Number(keno.ticketCount).toLocaleString()} />
              <StatRow label="Volume" value={formatMORBIUS(keno.totalWagered)} />
            </div>
          )}
          {lottery && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-cyan-400/80 mb-1">Lottery</p>
              <StatRow label="Tickets" value={Number(lottery.totalTicketsEver).toLocaleString()} />
              <StatRow label="Paid out" value={formatMORBIUS(lottery.totalClaimed)} />
            </div>
          )}
          {bigWheel && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-cyan-400/80 mb-1">Big Wheel</p>
              <StatRow label="Spins" value={Number(bigWheel.spins).toLocaleString()} />
              <StatRow label="Volume" value={formatMORBIUS(bigWheel.volume)} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
