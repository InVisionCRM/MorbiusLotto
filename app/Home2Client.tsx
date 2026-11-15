'use client'

import './home2.css'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  HomeTicker,
  HeroPlayer,
  HeroVisitor,
  TheFloor,
  WorkshopHead,
  SlotForge,
  TourneyForge,
  TableForge,
  WeeklyDrop,
  VipLadder,
  HomeFooter,
  type TickerItem,
  type WeeklyDropWinner,
} from '@/components/home2/sections'
import { NewGames } from '@/components/home2/new-games'
import { DailyFreeroll, FREEROLL_SLOTS, formatDailyGameTime } from '@/components/home2/daily-freeroll'
import { ChronoDefs } from '@/components/home2/chrono-defs'
import { FLOOR_GAMES } from '@/components/home2/scenes'
import { TopNav, ChipDock, NavDrawer } from '@/components/home2/nav'
import { GameLauncherSheet } from '@/components/home2/game-launcher-sheet'
import { WhatsNewSplash } from '@/components/DevLog/WhatsNewSplash'
import { DropSheet } from '@/components/home2/drop-sheet'
import { WalletSheet } from '@/components/home2/wallet-sheet'
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
import { useTokenPriceUsd } from '@/hooks/use-token-price-usd'

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

function shortAddress(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

const USD_PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 })
/* Rakeback on losses per tier (owner, 2026-07) — fallback when /api/vip/config omits the rate. */
const LADDER_RAKEBACK_BPS: Record<string, number> = { BRONZE: 500, SILVER: 800, GOLD: 1200, PLATINUM: 1600, DIAMOND: 2000, OBSIDIAN: 2500 }
const FREEROLL_TIMES = FREEROLL_SLOTS.map((h) => formatDailyGameTime(h)).join(' · ')

/**
 * Route for a game key from the wins feed. Those keys track the lobby routes
 * but not always the catalog's own ids ('video-poker' vs 'videopoker'), so
 * both sides are flattened to letters and digits before matching. Returns
 * undefined for a key the catalog doesn't know, and the caller drops the row
 * rather than linking somewhere that 404s.
 */
function gameHref(key: string): string | undefined {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const want = flat(key)
  return FLOOR_GAMES.find((g) => flat(g.key) === want)?.href
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

  /* dock bottom sheets — single state so only one is ever open at a time */
  const [activeSheet, setActiveSheet] = useState<'games' | 'drop' | 'wallet' | null>(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [floorFilter, setFloorFilter] = useState('all')
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
  const morbiusUsd = useTokenPriceUsd() // defaults to the MORBIUS token

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
    // No rung above the current one means this player is already at the top of
    // the ladder — the card says so rather than pointing at a tier that isn't there.
    // Until the ladder has loaded there is no "next", but that is not the top tier.
    const atTopTier = rungs.length > 0 && !next
    const progressPct = nextMin > 0 ? Math.min(100, Math.max(0, Math.round(((lifetime - curMin) / span) * 100))) : atTopTier ? 100 : 0
    const nextBps = next?.rakebackBps ?? (next ? LADDER_RAKEBACK_BPS[next.tierName.toUpperCase()] : undefined)
    const nextRakeback = nextBps != null ? `${nextBps / 100}%` : rakeback
    return {
      tierName,
      rakeback,
      nextName,
      nextRakeback,
      atTopTier,
      wagerToNext: wagerToNext.toLocaleString('en-US'),
      progressPct,
    }
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
    const items: TickerItem[] = [
      { k: 'FreeRoll', v: `#PulseChain Poker · ${FREEROLL_TIMES} EST · free entry` },
    ]
    if (topWin) {
      const who = topWin.username ?? shortAddress(topWin.address)
      items.push({ k: 'Recent high', v: `${topWin.amount.toLocaleString('en-US')} MORBIUS on ${gameLabel(topWin.game)} — ${who}` })
    }
    for (const w of wins.slice(0, 5)) {
      const who = w.username ?? shortAddress(w.address)
      items.push({ k: 'Win', v: `${w.amount.toLocaleString('en-US')} on ${gameLabel(w.game)} — ${who}` })
    }
    items.push({ k: 'VIP', v: 'rakeback on losses · Bronze 5% → Obsidian 25%' })
    items.push(
      drop?.draw
        ? { k: 'Weekly Drop', v: `pot at ${Number(drop.draw.potChips).toLocaleString('en-US')} MORBIUS · top 3 win Sunday 8 PM ET` }
        : { k: 'Weekly Drop', v: 'lighting soon · top 3 win every Sunday 8 PM ET' }
    )
    // Platform totals (formerly the promo hero's proof strip) — only once real.
    if (gamesPlayed) items.push({ k: 'Games played', v: gamesPlayed.toLocaleString('en-US') })
    if (totalWon) items.push({ k: 'MORBIUS won', v: totalWon.toLocaleString('en-US') })
    const biggest = allTimeBiggest ?? topWin?.amount
    if (biggest) items.push({ k: 'Biggest win', v: `${biggest.toLocaleString('en-US')} MORBIUS` })
    if (morbiusUsd != null) items.push({ k: 'MORBIUS', v: USD_PRICE.format(morbiusUsd) })
    return items
  }, [wins, topWin, drop, gamesPlayed, totalWon, allTimeBiggest, morbiusUsd])

  // Resume card: the player's own most recent win from the live feed
  const myLastWin = useMemo(
    () => (address ? wins.find((w) => w.address.toLowerCase() === address.toLowerCase()) ?? null : null),
    [wins, address]
  )
  const resume = myLastWin && gameHref(myLastWin.game)
    ? {
        title: `Back to ${gameLabel(myLastWin.game)}`,
        sub: `last win here: ${myLastWin.amount.toLocaleString('en-US')} MORBIUS`,
        href: gameHref(myLastWin.game),
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
      // Address-only winners: initial is the first hex digit after "0x", not the "0".
      const initialFrom = w.displayName ?? w.address.slice(2)
      return {
        letter: (initialFrom[0] ?? '?').toUpperCase(),
        name,
        amount: Number(w.amountChips).toLocaleString('en-US'),
      }
    })
    return {
      pot: Number(drop.draw.potChips),
      // drop.draw.id is a database UUID — meaningless to players, so it isn't shown.
      status: 'Live',
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
          <b>{toNext.toLocaleString('en-US')} MORBIUS</b> wagered to your next entry
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

  const openSheet = (kind: 'games' | 'drop' | 'wallet') => {
    setNavOpen(false)
    setActiveSheet(kind)
  }
  const closeSheet = () => setActiveSheet(null)
  const openNav = () => {
    setActiveSheet(null)
    setNavOpen(true)
  }
  const pickFloor = (f: string) => {
    setFloorFilter(f)
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const onProfile = () =>
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
    <div className="home2" data-mode={mode} id="top">
      <ChronoDefs />
      {/* First visit only — it stores a versioned flag and never returns. */}
      <WhatsNewSplash />
      <TopNav
        mode={mode}
        balance={balanceStr}
        avatarUrl={profileImageUrl}
        priceUsd={morbiusUsd}
        onConnect={onConnect}
        onWallet={() => openSheet('wallet')}
        onMenu={openNav}
        onChart={() => setChartOpen(true)}
        onFloor={pickFloor}
        onDrop={() => openSheet('drop')}
      />
      <HomeTicker items={tickerItems} />
      <main className="wrap">
        <div className="heroGrid">
          {/* #PulseChain Poker FreeRoll — six free games a day; links to /poker. */}
          <DailyFreeroll />
          {mode === 'player' ? (
            <HeroPlayer
              name={displayName}
              address={address}
              avatarUrl={profileImageUrl}
              tierName={vip.tierName}
              nextTierName={vip.atTopTier ? null : vip.nextName}
              nextTierRakeback={vip.atTopTier ? vip.rakeback : vip.nextRakeback}
              wagerToNext={vip.wagerToNext}
              progressPct={vip.progressPct}
              balance={balanceStr}
              resume={resume}
              onDeposit={onDeposit}
              onDashboard={onDashboard}
            />
          ) : (
            <HeroVisitor onConnect={onConnect} onOpenDrop={() => openSheet('drop')} />
          )}
        </div>
        {/* Newest tables ride above the collection so returning players see what changed. */}
        <NewGames />
        <TheFloor filter={floorFilter} onFilter={setFloorFilter} />
        <section className="duo" aria-label="Weekly Drop and VIP ladder">
          {weeklyDrop ? (
            <WeeklyDrop
              pot={weeklyDrop.pot}
              accruedNote={weeklyDrop.accruedNote}
              status={weeklyDrop.status}
              countdownTo={weeklyDrop.countdownTo}
              entries={weeklyDrop.entries}
              progress={weeklyDrop.progress}
              entriesSub={weeklyDrop.entriesSub}
              winners={weeklyDrop.winners}
              totalEntrants={weeklyDrop.totalEntrants}
              onViewEntrants={() => setEntrantsOpen(true)}
            />
          ) : (
            <WeeklyDrop
              entries={0}
              progress={0}
              entriesSub={<>The Weekly Drop is lighting soon — every 1,000 MORBIUS you play will be a ticket.</>}
              winners={[]}
            />
          )}
          <VipLadder currentTier={mode === 'player' ? vip.tierName : ''} />
        </section>
        <WorkshopHead />
        <div className="workshop">
          <SlotForge />
          <TourneyForge />
          <TableForge />
        </div>
      </main>
      <HomeFooter />
      <ChipDock
        activeTab="home"
        onChip={openNav}
        onGames={() => openSheet('games')}
        onDrop={() => openSheet('drop')}
        onWallet={() => openSheet('wallet')}
        dropBadge={dropBadge}
      />
      <NavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        mode={mode}
        balance={balanceStr}
        tierName={vip.tierName}
        tierRakeback={vip.rakeback}
        nextTier={vip.atTopTier ? null : vip.nextName}
        nextRakeback={vip.nextRakeback}
        progressPct={vip.progressPct}
        wagerToNext={vip.wagerToNext}
        recentHigh={topWin?.amount ?? null}
        priceUsd={morbiusUsd}
        onConnect={onConnect}
        onDeposit={onDeposit}
        onWithdraw={onDeposit}
        onDisconnect={() => disconnect()}
        onChart={() => setChartOpen(true)}
        onDashboard={onDashboard}
        onProfile={onProfile}
      />
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
          onProfile()
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
        status={weeklyDrop?.status}
      />
      <ChartModal open={chartOpen} onClose={() => setChartOpen(false)} />
      <EntrantsModal open={entrantsOpen} onClose={() => setEntrantsOpen(false)} />
      {walletModalOpen && <GameWalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />}
    </div>
  )
}
