'use client'

/**
 * /activity — the admin financial dashboard.
 *
 * Operator's view of the book: P&L and hold, cash in/out, per-player exposure,
 * bonus cost, big-win alerts, referral cost, and the live play feed. Admin-only
 * (wallet allowlist client-side; every endpoint it reads is session+allowlist
 * gated server-side).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cherry,
  Crown,
  Gift,
  LayoutGrid,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import AdminCreditPanel from '@/components/activity/AdminCreditPanel'
import LiveTablesModal from '@/components/activity/LiveTablesModal'
import ReferralAbuseControls from '@/components/activity/ReferralAbuseControls'
import LiveBadge from '@/components/activity/LiveBadge'
import TiersPanel from '@/components/activity/TiersPanel'
import SlotsPanel from '@/components/activity/SlotsPanel'
import {
  BigWinsTable,
  DepositsTable,
  PlayersTable,
  ReferralsTable,
  WithdrawalsTable,
  type BigWinView,
} from '@/components/activity/DashboardTables'
import {
  MetricLine,
  Panel,
  StatCard,
  TableScroll,
  Td,
  Th,
  TrendBars,
  WalletCell,
  EmptyRow,
  exactTime,
  fmt,
  fmtCompact,
  fmtSigned,
  isNegative,
  looksLikeWei,
  timeAgo,
} from '@/components/activity/dashboard-ui'
import { isAdminWallet } from '@/lib/admin'
import { useTokenBalance } from '@/hooks/use-token'
import { MORBIUS_VAULT_ADDRESS } from '@/lib/contracts'
import { useAdminDashboard, useVipTierDashboard, type DashWindow } from '@/hooks/use-admin-dashboard'
import { useGameSummaries, useRecentPlays } from '@/hooks/use-game-activity'

const WINDOWS: Array<{ key: DashWindow; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

type TabKey = 'players' | 'tiers' | 'deposits' | 'withdrawals' | 'bigwins' | 'referrals' | 'games' | 'slots' | 'live'

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'players', label: 'Players', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'tiers', label: 'Tiers', icon: <Crown className="h-3.5 w-3.5" /> },
  { key: 'deposits', label: 'Deposits', icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
  { key: 'withdrawals', label: 'Withdrawals', icon: <ArrowUpFromLine className="h-3.5 w-3.5" /> },
  { key: 'bigwins', label: 'Big wins', icon: <Trophy className="h-3.5 w-3.5" /> },
  { key: 'referrals', label: 'Referrals', icon: <Gift className="h-3.5 w-3.5" /> },
  { key: 'games', label: 'Games', icon: <Activity className="h-3.5 w-3.5" /> },
  { key: 'slots', label: 'Slots', icon: <Cherry className="h-3.5 w-3.5" /> },
  { key: 'live', label: 'Live feed', icon: <Activity className="h-3.5 w-3.5" /> },
]

export default function AdminDashboardPage() {
  const { address } = useAccount()
  const isAdmin = isAdminWallet(address)

  const [win, setWin] = useState<DashWindow>('24h')
  const [tab, setTab] = useState<TabKey>('players')
  const [bigWinMin, setBigWinMin] = useState('100000')
  // Drives both the hits filter and the frequency roll-ups. 0 = no multiplier filter.
  const [minMultiplier, setMinMultiplier] = useState('10')
  const [bigWinView, setBigWinView] = useState<BigWinView>('hits')
  const [tablesOpen, setTablesOpen] = useState(false)

  const multNum = Number(minMultiplier) || 0
  const { data, isLoading, isFetching, refetch } = useAdminDashboard(
    isAdmin,
    win,
    bigWinMin || '100000',
    multNum,
    multNum > 0 ? multNum : 10,
  )
  const { data: summary } = useGameSummaries(isAdmin, win)
  const { data: plays } = useRecentPlays(isAdmin && tab === 'live', 60)
  const { data: vip, isLoading: vipLoading } = useVipTierDashboard(isAdmin && tab === 'tiers')
  const { balanceFormatted: vaultRaw } = useTokenBalance(isAdmin ? MORBIUS_VAULT_ADDRESS : undefined)

  const vault = useMemo(() => {
    const n = Math.floor(Number(vaultRaw || '0'))
    return Number.isFinite(n) ? n.toLocaleString('en-US') : '—'
  }, [vaultRaw])

  const windowLabel = WINDOWS.find((w) => w.key === win)?.label ?? ''
  const f = data?.financials

  if (!isAdmin) {
    return (
      <GlobalMainNav>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <ShieldAlert className="h-10 w-10 text-white/30" />
          <h1 className="text-xl font-bold text-white">Admins only</h1>
          <p className="max-w-sm text-sm text-white/50">The platform dashboard is restricted to admin wallets.</p>
        </div>
      </GlobalMainNav>
    )
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full bg-[#070a12]">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:py-8">
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Financial Dashboard</h1>
              <p className="mt-1 text-sm text-white/50">
                the book for the last {windowLabel.toLowerCase()} · auto-refreshes every 30s
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LiveBadge enabled={isAdmin} minutes={5} />
              {/* Craps and Hold'em need a table to exist before anyone can
                  play them, and only an admin can open one. */}
              <button
                type="button"
                onClick={() => setTablesOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-400/12 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/20"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Live tables
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg border border-white/10 p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
                title="Refresh now"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
                {WINDOWS.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => setWin(w.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      win === w.key ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading && !data ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : (
            <>
              {/* Headline KPIs */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <StatCard
                  label={`Total revenue · ${windowLabel}`}
                  value={fmtSigned(f?.ggr)}
                  tone={isNegative(f?.ggr) ? 'bad' : 'good'}
                  sub={`games ${fmtCompact(f?.houseGgr)} · rake ${fmtCompact(f?.rake)} · fees ${fmtCompact(f?.fees)}`}
                  hint="House-banked margin + poker rake + platform/creator fees"
                />
                <StatCard
                  label="Hold"
                  value={`${(f?.holdPct ?? 0).toFixed(2)}%`}
                  tone={(f?.holdPct ?? 0) < 0 ? 'bad' : 'neutral'}
                  sub="margin on house-banked turnover"
                  hint="Excludes poker rake — that isn't earned against wagered volume"
                />
                <StatCard
                  label="Net revenue"
                  value={fmtSigned(f?.netRevenue)}
                  tone={isNegative(f?.netRevenue) ? 'bad' : 'good'}
                  sub="after all bonuses"
                />
                <StatCard label="Wagered" value={fmtCompact(f?.wagered)} sub={`${(f?.plays ?? 0).toLocaleString()} plays`} />
                <StatCard
                  label="Player liability"
                  value={fmtCompact(f?.playerLiability)}
                  tone={looksLikeWei(f?.playerLiability) ? 'bad' : 'gold'}
                  sub={
                    looksLikeWei(f?.playerLiability)
                      ? '⚠ implausible — likely wei in a chips row'
                      : `owed to players · house float ${fmtCompact(f?.houseFloat)}`
                  }
                  hint={
                    looksLikeWei(f?.playerLiability)
                      ? 'This total is far larger than any real chip balance (1 chip = 1 MORBIUS). Almost certainly one or more player_poker_chips rows hold a wei-scale value (x10^18). Check the Players tab, sorted by balance.'
                      : "Every player's spendable balance. Excludes house-owned rake/fee accounts, which hold the platform's own float — not a debt."
                  }
                />
                <StatCard label="Vault balance" value={vault} tone="cyan" sub="on-chain bankroll" />
              </div>

              {/* Cash flow / bonus cost / traffic */}
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Panel title="Cash flow" subtitle={`on-chain movement · ${windowLabel.toLowerCase()}`}>
                  <div className="px-4 py-1">
                    <MetricLine label={`Deposits in (${f?.depositsCount ?? 0})`} value={`+${fmt(f?.depositsTotal)}`} tone="good" />
                    <MetricLine label={`Withdrawals out (${f?.withdrawalsCount ?? 0})`} value={`−${fmt(f?.withdrawalsTotal)}`} tone="bad" />
                    <MetricLine label="Withdrawal fees kept" value={fmt(f?.withdrawalFees)} tone="gold" />
                    <MetricLine
                      label="Net flow"
                      value={fmtSigned(f?.netFlow)}
                      tone={isNegative(f?.netFlow) ? 'bad' : 'good'}
                    />
                    <MetricLine
                      label="Pending withdrawals"
                      value={String(f?.withdrawalsPending ?? 0)}
                      tone={(f?.withdrawalsPending ?? 0) > 0 ? 'gold' : 'muted'}
                    />
                  </div>
                </Panel>

                <Panel title="Cost of bonuses" subtitle="what player value-back cost the house">
                  <div className="px-4 py-1">
                    <MetricLine label="VIP rakeback" value={fmt(f?.rakebackPaid)} tone="muted" />
                    <MetricLine label="Referral payouts" value={fmt(f?.referralPaid)} tone="muted" />
                    <MetricLine label="Weekly Drop prizes" value={fmt(f?.dropPrizesPaid)} tone="muted" />
                    <MetricLine label="Holder / LP rewards" value={fmt(f?.holderRewardsPaid)} tone="muted" />
                    <MetricLine label="Admin adjustments" value={fmtSigned(f?.adminAdjustments)} tone="muted" />
                    <MetricLine label="Total bonus cost" value={fmt(f?.bonusCostTotal)} tone="bad" />
                  </div>
                </Panel>

                <Panel title="Traffic" subtitle={`players & volume · ${windowLabel.toLowerCase()}`}>
                  <div className="px-4 py-1">
                    <MetricLine label="Active players" value={(f?.activePlayers ?? 0).toLocaleString()} />
                    <MetricLine label="New signups" value={(f?.newPlayers ?? 0).toLocaleString()} tone="good" />
                    <MetricLine label="Total plays" value={(f?.plays ?? 0).toLocaleString()} tone="muted" />
                    <MetricLine label="Total won by players" value={fmt(f?.won)} tone="muted" />
                    <MetricLine
                      label="Avg bet"
                      value={
                        f && f.plays > 0
                          ? fmt((BigInt(f.wagered) / BigInt(f.plays)).toString())
                          : '0'
                      }
                      tone="muted"
                    />
                  </div>
                </Panel>
              </div>

              {/* 30-day trend */}
              <div className="mt-3">
                <Panel
                  title="Daily house profit"
                  subtitle="last 30 days · green = house up, red = house down · hover a bar for the day"
                >
                  <div className="px-4 py-4">
                    <TrendBars data={data?.history ?? []} />
                  </div>
                </Panel>
              </div>

              {/* Tabs */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {TABS.map((t) => {
                  const count =
                    t.key === 'players' ? data?.players.length
                      : t.key === 'deposits' ? data?.deposits.length
                      : t.key === 'withdrawals' ? data?.withdrawals.length
                      : t.key === 'bigwins' ? data?.bigWins.length
                      : t.key === 'referrals' ? data?.referrals.referrers.length
                      : undefined
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        tab === t.key
                          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                          : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                      {count != null && (
                        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/60">
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3">
                {tab === 'players' && (
                  <PlayersTable rows={data?.players ?? []} windowLabel={windowLabel.toLowerCase()} />
                )}
                {tab === 'tiers' && <TiersPanel data={vip} isLoading={vipLoading} />}
                {tab === 'deposits' && (
                  <DepositsTable rows={data?.deposits ?? []} windowLabel={windowLabel.toLowerCase()} />
                )}
                {tab === 'withdrawals' && (
                  <WithdrawalsTable rows={data?.withdrawals ?? []} windowLabel={windowLabel.toLowerCase()} />
                )}
                {tab === 'bigwins' && (
                  <BigWinsTable
                    rows={data?.bigWins ?? []}
                    freq={data?.multiplier}
                    windowLabel={windowLabel.toLowerCase()}
                    threshold={bigWinMin}
                    onThresholdChange={setBigWinMin}
                    minMultiplier={minMultiplier}
                    onMinMultiplierChange={setMinMultiplier}
                    view={bigWinView}
                    onViewChange={setBigWinView}
                  />
                )}
                {tab === 'referrals' && (
                  <>
                  <ReferralAbuseControls />
                  <ReferralsTable
                    rows={data?.referrals.referrers ?? []}
                    totals={data?.referrals.totals ?? { referrers: 0, referees: 0, earned: '0', welcomePaid: '0' }}
                  />
                  </>
                )}
                {tab === 'slots' && <SlotsPanel />}
                {tab === 'games' && (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] px-4 py-3">
                      <p className="text-sm text-white/60">
                        Set <b className="text-white">min and max bets per game</b>, with exposure and
                        performance on each card.
                      </p>
                      <Link
                        href="/activity/games"
                        className="rounded-xl border border-cyan-400/35 bg-cyan-400/12 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/20"
                      >
                        Open game limits ↗
                      </Link>
                    </div>
                    <GamesPanel games={summary?.games ?? []} windowLabel={windowLabel.toLowerCase()} />
                  </>
                )}
                {tab === 'live' && <LivePanel plays={plays ?? []} />}
              </div>

              {/* Admin tools */}
              <AdminCreditPanel />

              <p className="mt-4 text-xs text-white/30">
                All amounts in MORBIUS. Vault reads on-chain; every other figure comes from the game ledger.
              </p>
            </>
          )}
        </div>

        <LiveTablesModal open={tablesOpen} onClose={() => setTablesOpen(false)} />
      </div>
    </GlobalMainNav>
  )
}

// ── Games tab ────────────────────────────────────────────────────────────────

function GamesPanel({
  games,
  windowLabel,
}: {
  games: Array<{ key: string; label: string; wagered: string; won: string; plays: number; players: number }>
  windowLabel: string
}) {
  const rows = useMemo(
    () =>
      [...games]
        .map((g) => ({ ...g, ggr: (BigInt(g.wagered || '0') - BigInt(g.won || '0')).toString() }))
        .sort((a, b) => (BigInt(b.wagered || '0') > BigInt(a.wagered || '0') ? 1 : -1)),
    [games],
  )
  return (
    <Panel title="Games" subtitle={`per-game performance · ${windowLabel}`}>
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Game</Th>
              <Th align="right">Wagered</Th>
              <Th align="right">Won</Th>
              <Th align="right">House profit</Th>
              <Th align="right">Hold</Th>
              <Th align="right">Plays</Th>
              <Th align="right">Players</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>No plays in this window.</EmptyRow>
            ) : (
              rows.map((g) => {
                const wagered = BigInt(g.wagered || '0')
                const hold = wagered > 0n ? Number((BigInt(g.ggr) * 10000n) / wagered) / 100 : 0
                return (
                  <tr key={g.key} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <Td className="font-semibold text-white">{g.label}</Td>
                    <Td align="right" className="text-white/70">{fmt(g.wagered)}</Td>
                    <Td align="right" className="text-white/70">{fmt(g.won)}</Td>
                    <Td align="right" className={isNegative(g.ggr) ? 'font-bold text-rose-300' : 'font-bold text-emerald-300'}>
                      {fmtSigned(g.ggr)}
                    </Td>
                    <Td align="right" className={hold < 0 ? 'text-rose-300' : 'text-white/60'}>{hold.toFixed(2)}%</Td>
                    <Td align="right" className="text-white/50">{g.plays.toLocaleString()}</Td>
                    <Td align="right" className="text-white/50">{g.players.toLocaleString()}</Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  )
}

// ── Live feed tab ────────────────────────────────────────────────────────────

function LivePanel({
  plays,
}: {
  plays: Array<{
    wallet: string
    displayName: string | null
    gameLabel: string
    wager: string
    payout: string
    net: string
    at: string
  }>
}) {
  return (
    <Panel title="Live feed" subtitle="every settled play as it lands · newest first">
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Game</Th>
              <Th align="right">Wager</Th>
              <Th align="right">Payout</Th>
              <Th align="right">Net</Th>
              <Th align="right">When</Th>
            </tr>
          </thead>
          <tbody>
            {plays.length === 0 ? (
              <EmptyRow colSpan={6}>No plays yet.</EmptyRow>
            ) : (
              plays.map((p, i) => (
                <tr key={`${p.wallet}-${p.at}-${i}`} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <Td><WalletCell wallet={p.wallet} displayName={p.displayName} /></Td>
                  <Td className="text-white/60">{p.gameLabel}</Td>
                  <Td align="right" className="text-white/60">{fmt(p.wager)}</Td>
                  <Td align="right" className="text-white/70">{fmt(p.payout)}</Td>
                  <Td align="right" className={isNegative(p.net) ? 'font-bold text-emerald-300' : 'font-bold text-rose-300'}>
                    {fmtSigned(p.net)}
                  </Td>
                  <Td align="right" className="text-white/40"><span title={exactTime(p.at)}>{timeAgo(p.at)}</span></Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
        Net is from the player&apos;s side: red = the player won that hand.
      </p>
    </Panel>
  )
}
