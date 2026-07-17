'use client'

import './home2.css'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useQueryClient } from '@tanstack/react-query'
import { SceneDefs } from '@/components/home2/scenes'
import {
  HomeTicker,
  HeroPlayer,
  VaultStrip,
  TonightsTable,
  TheFloor,
  WeeklyDrop,
  VipLadder,
  HomeFooter,
  type HeroPlayerDigestItem,
  type WeeklyDropWinner,
} from '@/components/home2/sections'
import { HeroCarousel } from '@/components/home2/hero-carousel'
import { HomeSidebar, ChipDock, MobileTopBar } from '@/components/home2/nav'
import { GameLauncherSheet } from '@/components/home2/game-launcher-sheet'
import { DropSheet } from '@/components/home2/drop-sheet'
import { WalletSheet } from '@/components/home2/wallet-sheet'
import { PriceChartBg } from '@/components/home2/price-chart-bg'
import { ChartModal } from '@/components/home2/chart-modal'
import { EntrantsModal } from '@/components/home2/entrants-modal'
import { formatWholeMorbius } from '@/components/shared/NavBalanceDisplay'
import { useProfileSettingsModal } from '@/components/shared/ProfileSettingsModalContext'
import { apiFetch } from '@/lib/api-auth'
import { useProfile } from '@/hooks/use-player-profile'
import { useVipTier } from '@/hooks/use-vip-tier'
import { useVipTiers } from '@/hooks/use-vip-tiers'
import { usePlayerServerBalance } from '@/hooks/use-player-server-balance'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'
import { useLatestWins } from '@/hooks/use-latest-wins'
import { useWeeklyDrop } from '@/hooks/use-weekly-drop'

const GameWalletModal = dynamic(
  () => import('@/components/shared/GameWalletModal').then((m) => m.GameWalletModal),
  { ssr: false }
)
// Same lazy modal WalletMenu mounts for "Manage approvals" — reused here for
// the WalletSheet's Revoke approvals action.
const RevokeApprovalsModal = dynamic(
  () => import('@/components/shared/RevokeApprovalsModal').then((m) => m.RevokeApprovalsModal),
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

/* Rank 1/2/3 avatar gradients — same three as DEFAULT_WINNERS in sections.tsx */
const DROP_WINNER_GRADIENTS = [
  'radial-gradient(circle at 32% 28%,#fde68a,#f59e0b)',
  'radial-gradient(circle at 32% 28%,#a5f3fc,#0891b2)',
  'radial-gradient(circle at 32% 28%,#c4b5fd,#7c3aed)',
]

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

  /* dock bottom sheets — single state so only one is ever open at a time */
  const [activeSheet, setActiveSheet] = useState<'games' | 'drop' | 'wallet' | null>(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [entrantsOpen, setEntrantsOpen] = useState(false)

  const { profileDisplayName, profileImageUrl, bio, xHandle, tgHandle } = useProfile()
  const { disconnect } = useDisconnect()
  const { openProfileSettings } = useProfileSettingsModal()
  const queryClient = useQueryClient()
  const vipTier = useVipTier(address)
  const vipLadder = useVipTiers()
  const balanceQuery = usePlayerServerBalance(address)
  const analytics = usePlatformAnalytics()
  const { wins } = useLatestWins()
  const weeklyDropQuery = useWeeklyDrop(address)

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
  // totalPayouts is wei-scale (MORBIUS = 18 decimals) — convert to whole MORBIUS
  const totalWon = totals ? Math.round(Number(totals.totalPayouts) / 1e18) : undefined
  const gamesPlayed = totals ? Number(totals.totalGamesPlayed) : undefined
  // All-time biggest single win (whole chips) from /api/analytics/platform;
  // falls back to the recent-60 max until the backend ships the field
  const allTimeBiggest = analytics.data?.biggestWin ? Number(analytics.data.biggestWin.amountChips) : undefined
  // Weekly Drop: live data from GET /api/drop; null → keep the "lighting soon" defaults
  const drop = weeklyDropQuery.data
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
    items.push('<b class="c">👑 VIP</b> rakeback on losses — Bronze 5% to Obsidian 25%')
    items.push(
      drop?.draw
        ? `<b class="g">🎟 WEEKLY DROP</b> pot at ${Number(drop.draw.potChips).toLocaleString('en-US')} · top 3 win Sunday 8PM`
        : '<b class="g">🎟 WEEKLY DROP</b> lighting soon · top 3 win every Sunday 8PM'
    )
    return items.length >= 4 ? items : undefined // fall back to defaults until data arrives
  }, [wins, topWin, drop])

  const digest = useMemo<HeroPlayerDigestItem[] | undefined>(() => {
    if (!topWin) return undefined
    const who = topWin.username ?? shortAddress(topWin.address)
    return [
      { html: `🏆 Recent high: <b>${topWin.amount.toLocaleString('en-US')}</b> on ${gameLabel(topWin.game)} — ${who}` },
      { html: `🎮 <b>${(gamesPlayed ?? 0).toLocaleString('en-US')}</b> games played all-time` },
      { html: `👑 <b>${vip.rakeback}</b> back on your losses at ${vip.tierName}` },
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

  const weeklyDrop = useMemo(() => {
    if (!drop?.draw) return null
    const you = drop.you
    const wagered = you ? Number(you.progressWagered) : 0
    const target = you ? Number(you.progressTarget) : 0
    const progress = target > 0 ? Math.min(100, Math.round((wagered / target) * 100)) : 0
    const toNext = Math.max(0, target - wagered)
    const winners: WeeklyDropWinner[] = drop.lastWinners.map((w) => {
      const name = w.displayName ?? shortAddress(w.address)
      return {
        letter: (name[0] ?? '?').toUpperCase(),
        name,
        amount: Number(w.amountChips).toLocaleString('en-US'),
        gradient: DROP_WINNER_GRADIENTS[Math.min(Math.max(w.rank, 1), 3) - 1],
      }
    })
    return {
      pot: Number(drop.draw.potChips),
      statusPill: `🎟 DROP #${drop.draw.id} · LIVE`,
      accruedNote: (() => {
        const accrued = Number(drop.draw.accruedChips ?? 0)
        const guaranteed = Number(drop.draw.guaranteedMin)
        // Pot displays the guarantee until real accrual passes it — show the
        // movement so the number never looks frozen
        return accrued < guaranteed
          ? `+${accrued.toLocaleString('en-US')} fed by bets this week — 25,000 minimum guaranteed`
          : null
      })(),
      countdownTo: new Date(drop.draw.closesAt),
      entries: you?.entries ?? 0,
      // Older backends omit totalEntrants — null hides the entrants line.
      totalEntrants: drop.totalEntrants ?? null,
      progress,
      entriesSub: (
        <>
          <b style={{ color: 'var(--gold)' }}>{toNext.toLocaleString('en-US')} MORBIUS</b> wagered to your next entry
        </>
      ),
      winners,
    }
  }, [drop])

  const onConnect = () => open()
  const onDeposit = () => setWalletModalOpen(true)
  const onDashboard = () => {
    if (address) router.push(`/player/${address}`)
  }

  const openSheet = (kind: 'deposit' | 'games' | 'drop') => {
    setNavOpen(false)
    setActiveSheet(kind)
  }
  const closeSheet = () => setActiveSheet(null)

  // DROP badge on the dock: time until the live draw closes ('2d' / '5h'), null when no live draw
  const dropBadge = useMemo(() => {
    const t = weeklyDrop?.countdownTo?.getTime()
    if (!t) return null
    const ms = t - Date.now()
    if (ms <= 0) return null
    const days = Math.floor(ms / 86400000)
    return days > 0 ? `${days}d` : `${Math.max(1, Math.floor(ms / 3600000))}h`
  }, [weeklyDrop])

  return (
    <div className={`home2${navOpen ? ' nav-open' : ''}`} data-mode={mode}>
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
          onChartClick={() => setChartOpen(true)}
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
              chartBg={<PriceChartBg />}
              onDeposit={onDeposit}
              onDashboard={onDashboard}
            />
          ) : (
            <HeroCarousel
              gamesPlayed={gamesPlayed}
              morbiusWon={totalWon}
              biggestWin={allTimeBiggest ?? topWin?.amount}
              chartBg={<PriceChartBg />}
              onTakeSeat={onConnect}
              onOpenDrop={() => setActiveSheet('drop')}
              onRefer={onConnect}
            />
          )}
          <VaultStrip
            value={totalWon}
            gamesPlayed={gamesPlayed != null ? gamesPlayed.toLocaleString('en-US') : undefined}
            biggestWin={(allTimeBiggest ?? topWin?.amount)?.toLocaleString('en-US')}
            onPriceClick={() => setChartOpen(true)}
          />
          <TonightsTable />
          <TheFloor />
          {weeklyDrop ? (
            <WeeklyDrop
              pot={weeklyDrop.pot}
              potLive
              statusPill={weeklyDrop.statusPill}
              countdownTo={weeklyDrop.countdownTo}
              entries={weeklyDrop.entries}
              progress={weeklyDrop.progress}
              entriesSub={weeklyDrop.entriesSub}
              winners={weeklyDrop.winners}
            />
          ) : (
            <WeeklyDrop entries={0} progress={0} entriesSub={<>The Weekly Drop is lighting soon — every 1,000 MORBIUS you play will be a ticket.</>} winners={[]} />
          )}
          <VipLadder currentTier={mode === 'player' ? vip.tierName : ''} />
          <HomeFooter />
        </div>
      </div>
      <ChipDock
        balance={balanceStr}
        activeTab="home"
        onChip={() => {
          setActiveSheet(null)
          setNavOpen(true)
        }}
        onGames={() => openSheet('games')}
        onDrop={() => openSheet('drop')}
        onWallet={() => openSheet('wallet')}
        dropBadge={dropBadge}
      />
      {navOpen && <div className="nav-veil" onClick={() => setNavOpen(false)} />}
      <WalletSheet
        open={activeSheet === 'wallet'}
        onClose={closeSheet}
        mode={mode}
        name={displayName}
        address={address}
        balance={balanceStr}
        balanceSub={`${vip.tierName} tier · ${vip.rakeback} rakeback on losses`}
        avatar={
          profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : undefined
        }
        onConnect={() => {
          closeSheet()
          onConnect()
        }}
        onDeposit={() => {
          closeSheet()
          onDeposit()
        }}
        onWithdraw={() => {
          closeSheet()
          onDeposit()
        }}
        onProfile={() => {
          closeSheet()
          openProfileSettings({
            displayName: profileDisplayName ?? '',
            profileImageUrl,
            bio,
            xHandle,
            tgHandle,
            onSave: async (displayName, newImageUrl, newBio, newX, newTg) => {
              if (!address) throw new Error('Connect your wallet to save your profile.')
              await apiFetch('/api/player/profile', {
                method: 'POST',
                body: JSON.stringify({ displayName, profileImageUrl: newImageUrl, bio: newBio, xHandle: newX, tgHandle: newTg }),
              })
              queryClient.invalidateQueries({ queryKey: ['playerProfile', address] })
            },
          })
        }}
        onApprovals={() => {
          closeSheet()
          setRevokeOpen(true)
        }}
        onDashboard={() => {
          closeSheet()
          onDashboard()
        }}
        onDisconnect={() => {
          closeSheet()
          disconnect()
        }}
      />
      {revokeOpen && <RevokeApprovalsModal isOpen={revokeOpen} onClose={() => setRevokeOpen(false)} />}
      <GameLauncherSheet open={activeSheet === 'games'} onClose={closeSheet} />
      <DropSheet
        open={activeSheet === 'drop'}
        onClose={closeSheet}
        pot={weeklyDrop?.pot}
        countdownTo={weeklyDrop?.countdownTo}
        entries={mode === 'player' ? weeklyDrop?.entries ?? 0 : undefined}
        totalEntrants={weeklyDrop?.totalEntrants ?? null}
        statusPill={weeklyDrop?.statusPill}
      />
      <ChartModal open={chartOpen} onClose={() => setChartOpen(false)} />
      {walletModalOpen && <GameWalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />}
    </div>
  )
}
