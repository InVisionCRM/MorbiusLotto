'use client'

import './home2.css'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { SceneDefs } from '@/components/home2/scenes'
import {
  HomeTicker,
  HeroPlayer,
  HeroVisitor,
  VaultStrip,
  TonightsTable,
  TheFloor,
  WeeklyDrop,
  VipLadder,
  HomeFooter,
  type HeroPlayerDigestItem,
} from '@/components/home2/sections'
import { HomeSidebar, ChipDock, DepositSheet, MobileTopBar } from '@/components/home2/nav'
import { formatWholeMorbius } from '@/components/shared/NavBalanceDisplay'
import { useProfile } from '@/hooks/use-player-profile'
import { useVipTier } from '@/hooks/use-vip-tier'
import { useVipTiers } from '@/hooks/use-vip-tiers'
import { usePlayerServerBalance } from '@/hooks/use-player-server-balance'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'
import { useLatestWins } from '@/hooks/use-latest-wins'

const GameWalletModal = dynamic(
  () => import('@/components/shared/GameWalletModal').then((m) => m.GameWalletModal),
  { ssr: false }
)

const TIER_EMOJI: Record<string, string> = {
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  PLATINUM: '💠',
  DIAMOND: '💎',
  OBSIDIAN: '🖤',
}

function shortAddress(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

function gameLabel(key: string): string {
  return key
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export default function Home2Client() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const mode: 'player' | 'visitor' = isConnected ? 'player' : 'visitor'

  const [sheetOpen, setSheetOpen] = useState(false)
  const [walletModalOpen, setWalletModalOpen] = useState(false)

  const { profileDisplayName } = useProfile()
  const vipTier = useVipTier(address)
  const vipLadder = useVipTiers()
  const balanceQuery = usePlayerServerBalance(address)
  const analytics = usePlatformAnalytics()
  const { wins } = useLatestWins()

  const balanceStr = balanceQuery.data != null ? formatWholeMorbius(balanceQuery.data) : '0'
  const displayName = profileDisplayName ?? shortAddress(address) ?? 'Player'

  // VIP: current tier + progress toward the next ladder rung
  const vip = useMemo(() => {
    const tier = vipTier.data
    const rungs = vipLadder.data ?? []
    const tierName = (tier?.tierName ?? 'Bronze').toUpperCase()
    const rakeback = tier ? `${tier.rakebackBps / 100}%` : '5%'
    const lifetime = tier ? Number(tier.lifetimeWagerChips) : 0
    const next = rungs.find((r) => (tier ? r.tierLevel === tier.tierLevel + 1 : r.tierLevel === 1))
    const nextName = (next?.tierName ?? 'Silver').toUpperCase()
    const nextMin = next ? Number(next.minLifetimeWagerChips) : 0
    const curRung = rungs.find((r) => r.tierLevel === (tier?.tierLevel ?? 0))
    const curMin = curRung ? Number(curRung.minLifetimeWagerChips) : 0
    const wagerToNext = Math.max(0, nextMin - lifetime)
    const span = Math.max(1, nextMin - curMin)
    const progressPct = nextMin > 0 ? Math.min(100, Math.round(((lifetime - curMin) / span) * 100)) : 100
    // Next tier rakeback comes from the tier levels we know from config order; fall back to label-only.
    return { tierName, rakeback, nextName, wagerToNext: wagerToNext.toLocaleString('en-US'), progressPct }
  }, [vipTier.data, vipLadder.data])

  // Live numbers: platform totals + recent-wins highlights
  const totals = analytics.data?.combined
  const totalWon = totals ? Number(totals.totalPayouts) : undefined
  const gamesPlayed = totals ? Number(totals.totalGamesPlayed) : undefined
  const topWin = useMemo(() => (wins.length ? wins.reduce((a, b) => (b.amount > a.amount ? b : a)) : null), [wins])

  const tickerItems = useMemo(() => {
    const items: string[] = []
    if (topWin) {
      const who = topWin.username ?? shortAddress(topWin.address)
      items.push(
        `<b class="g">🏆 RECENT HIGH</b> <b>${topWin.amount.toLocaleString('en-US')}</b> on ${gameLabel(topWin.game)} — ${who}`
      )
    }
    for (const w of wins.slice(0, 5)) {
      const who = w.username ?? shortAddress(w.address)
      items.push(`<b class="e">💸 WIN</b> <b>${w.amount.toLocaleString('en-US')}</b> on ${gameLabel(w.game)} — ${who}`)
    }
    items.push('<b class="c">👑 VIP</b> rakeback on every bet — Bronze 5% to Obsidian 25%')
    items.push('<b class="g">🎟 WEEKLY DROP</b> lighting soon · top 3 win every Sunday 8PM')
    return items.length >= 4 ? items : undefined // fall back to defaults until data arrives
  }, [wins, topWin])

  const digest = useMemo<HeroPlayerDigestItem[] | undefined>(() => {
    if (!topWin) return undefined
    const who = topWin.username ?? shortAddress(topWin.address)
    return [
      { html: `🏆 Recent high: <b>${topWin.amount.toLocaleString('en-US')}</b> on ${gameLabel(topWin.game)} — ${who}` },
      { html: `🎮 <b>${(gamesPlayed ?? 0).toLocaleString('en-US')}</b> games played all-time` },
      { html: `👑 <b>${vip.rakeback}</b> rakeback on every bet at ${vip.tierName}` },
    ]
  }, [topWin, gamesPlayed, vip])

  // Resume card: the player's own most recent win from the live feed
  const myLastWin = useMemo(
    () => (address ? wins.find((w) => w.address.toLowerCase() === address.toLowerCase()) ?? null : null),
    [wins, address]
  )
  const resume = myLastWin
    ? {
        title: `${gameLabel(myLastWin.game)} — your table is waiting`,
        sub: `Last win here: ${myLastWin.amount.toLocaleString('en-US')} MORBIUS`,
      }
    : undefined

  const onConnect = () => open()
  const onDeposit = () => setWalletModalOpen(true)
  const onDashboard = () => {
    if (address) router.push(`/player/${address}`)
  }

  return (
    <div className={`home2${sheetOpen ? ' sheet-open' : ''}`} data-mode={mode}>
      <SceneDefs />
      <div className="app">
        <HomeSidebar
          mode={mode}
          balance={balanceStr}
          tierEmoji={TIER_EMOJI[vip.tierName] ?? '🥉'}
          tierName={vip.tierName}
          tierRakeback={vip.rakeback}
          nextTier={vip.nextName}
          progressPct={vip.progressPct}
          wagerToNext={vip.wagerToNext}
          onConnect={onConnect}
          onDeposit={onDeposit}
          onWithdraw={onDeposit}
        />
        <div className="main">
          <MobileTopBar mode={mode} onConnect={onConnect} />
          <HomeTicker items={tickerItems} />
          {mode === 'player' ? (
            <HeroPlayer
              name={displayName}
              tierName={vip.tierName}
              nextTierName={vip.nextName}
              wagerToNext={vip.wagerToNext}
              digest={digest}
              resume={resume}
              balance={balanceStr}
              balanceUsd=""
              onDeposit={onDeposit}
              onDashboard={onDashboard}
            />
          ) : (
            <HeroVisitor
              gamesPlayed={gamesPlayed}
              morbiusWon={totalWon}
              biggestWin={topWin?.amount}
              onTakeSeat={onConnect}
            />
          )}
          <VaultStrip
            value={totalWon}
            gamesPlayed={gamesPlayed != null ? gamesPlayed.toLocaleString('en-US') : undefined}
            biggestWin={topWin ? topWin.amount.toLocaleString('en-US') : undefined}
          />
          <TonightsTable />
          <TheFloor />
          <WeeklyDrop entries={0} progress={0} entriesSub={<>The Weekly Drop is lighting soon — every 1,000 MORBIUS you play will be a ticket.</>} winners={[]} />
          <VipLadder currentTier={mode === 'player' ? vip.tierName : ''} />
          <HomeFooter />
        </div>
      </div>
      <ChipDock balance={balanceStr} onChipClick={() => setSheetOpen(true)} />
      <DepositSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        balance={balanceStr}
        subline={`${vip.tierName} tier · ${vip.rakeback} rakeback on every bet`}
        onDeposit={() => {
          setSheetOpen(false)
          onDeposit()
        }}
        onWithdraw={() => {
          setSheetOpen(false)
          onDeposit()
        }}
        onDashboard={() => {
          setSheetOpen(false)
          onDashboard()
        }}
      />
      {walletModalOpen && <GameWalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />}
    </div>
  )
}
