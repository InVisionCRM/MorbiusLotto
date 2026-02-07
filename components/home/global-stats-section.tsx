'use client'

import Image from 'next/image'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'
import { formatMORBIUS } from '@/lib/format-utils'

const MORBIUS_LOGO_SRC = '/morbius/MorbiusLogo (3).png'

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function StatRow({ label, value, showMorbiusLogo = false }: { label: string; value: string; showMorbiusLogo?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-white/70">{label}</span>
      <span className="text-cyan-300/90 font-medium tabular-nums flex items-center gap-1.5">
        {value}
        {showMorbiusLogo && (
          <Image
            src={MORBIUS_LOGO_SRC}
            alt="MORBIUS"
            width={18}
            height={18}
            className="shrink-0 object-contain"
          />
        )}
      </span>
    </div>
  )
}

export function GlobalStatsSection() {
  const { data, isLoading, error } = usePlatformAnalytics()

  const sectionHeader = (
    <div className="text-center mb-8">
      <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
        Stats
      </h2>
      <p className="text-white/50 text-sm">
        Morbius is known for their stat tracking and it&apos;s no different with our gaming platform. Users have access to real-time platform and per-game statistics.
      </p>
    </div>
  )

  if (error) {
    return (
      <section className="w-full max-w-2xl mx-auto">
        {sectionHeader}
        <div className="rounded-2xl border border-red-500/30 p-6" style={PANEL_STYLE}>
          <p className="text-white/50 text-sm">Error loading stats: {error.message}</p>
        </div>
      </section>
    )
  }

  if (isLoading || !data) {
    return (
      <section className="w-full max-w-2xl mx-auto">
        {sectionHeader}
        <div className="rounded-2xl border border-cyan-500/30 p-6" style={PANEL_STYLE}>
          <p className="text-white/50 text-sm">Loading…</p>
        </div>
      </section>
    )
  }

  const { blackjack, plinko, keno, lottery, combined } = data
  
  const totalGames = Number(combined?.totalGamesPlayed ?? 0) || 0
  const totalVolume = BigInt(combined?.totalVolume ?? '0')
  const totalPayouts = BigInt(combined?.totalPayouts ?? '0')

  return (
    <section className="w-full max-w-2xl mx-auto">
      {sectionHeader}
      <div className="rounded-2xl border border-cyan-500/30 p-6 space-y-6" style={PANEL_STYLE}>
        {/* Combined */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">All games</p>
          <StatRow label="Total games played" value={totalGames.toLocaleString()} />
          <StatRow label="Total volume (MORBIUS)" value={formatMORBIUS(totalVolume)} showMorbiusLogo />
          <StatRow label="Total paid out (MORBIUS)" value={formatMORBIUS(totalPayouts)} showMorbiusLogo />
        </div>

        {/* Per-game: Blackjack column 1, Plinko/Keno/Lottery column 2 */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
          {/* Column 1: Blackjack only */}
          {blackjack && Object.keys(blackjack).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-cyan-400/80 mb-1">Blackjack</p>
              <StatRow label="Hands" value={(blackjack.total_games_played ?? 0).toLocaleString()} />
              <StatRow label="Players" value={(blackjack.total_players ?? 0).toLocaleString()} />
              {blackjack.active_players !== undefined && (
                <StatRow label="Active players" value={(blackjack.active_players ?? 0).toLocaleString()} />
              )}
              {blackjack.total_volume && (
                <StatRow label="Total volume" value={formatMORBIUS(BigInt(blackjack.total_volume))} showMorbiusLogo />
              )}
              {blackjack.house_profit && (
                <StatRow label="House profit" value={formatMORBIUS(BigInt(blackjack.house_profit))} showMorbiusLogo />
              )}
              {blackjack.games_last_24_hours !== undefined && (
                <StatRow label="Games (24h)" value={(blackjack.games_last_24_hours ?? 0).toLocaleString()} />
              )}
              {blackjack.volume_last_24_hours && (
                <StatRow label="Volume (24h)" value={formatMORBIUS(BigInt(blackjack.volume_last_24_hours))} showMorbiusLogo />
              )}
              {blackjack.largest_bet && BigInt(blackjack.largest_bet) > 0n && (
                <StatRow label="Largest bet" value={formatMORBIUS(BigInt(blackjack.largest_bet))} showMorbiusLogo />
              )}
              {blackjack.largest_payout && BigInt(blackjack.largest_payout) > 0n && (
                <StatRow label="Largest payout" value={formatMORBIUS(BigInt(blackjack.largest_payout))} showMorbiusLogo />
              )}
            </div>
          )}
          {/* Column 2: Plinko, Keno, Lottery */}
          <div className="space-y-4">
            {plinko && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-cyan-400/80 mb-1">Plinko</p>
                <StatRow label="Balls dropped" value={Number(plinko.totalDrops).toLocaleString()} />
                <StatRow label="Volume" value={formatMORBIUS(plinko.totalRevenue)} showMorbiusLogo />
              </div>
            )}
            {keno && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-cyan-400/80 mb-1">Keno</p>
                <StatRow label="Tickets" value={Number(keno.ticketCount).toLocaleString()} />
                <StatRow label="Volume" value={formatMORBIUS(keno.totalWagered)} showMorbiusLogo />
              </div>
            )}
            {lottery ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-cyan-400/80 mb-1">Lottery</p>
                <StatRow label="Tickets" value={Number(lottery.totalTicketsEver).toLocaleString()} />
                <StatRow label="Paid out" value={formatMORBIUS(lottery.totalClaimed)} showMorbiusLogo />
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-cyan-400/80 mb-1">Lottery</p>
                <StatRow label="Tickets" value="0" />
                <StatRow label="Paid out" value={formatMORBIUS(0n)} showMorbiusLogo />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
