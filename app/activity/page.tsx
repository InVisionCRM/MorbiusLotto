'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { Loader2, ShieldAlert, ArrowUpRight, Wallet } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import AdminCreditPanel from '@/components/activity/AdminCreditPanel'
import { isAdminWallet } from '@/lib/admin'
import { useTokenBalance } from '@/hooks/use-token'
import { MORBIUS_VAULT_ADDRESS } from '@/lib/contracts'
import {
  useGameSummaries,
  useRecentPlays,
  type StatsWindow,
  type GameSummary,
  type RecentPlay,
} from '@/hooks/use-game-activity'

// ── formatting helpers ──────────────────────────────────────────────────────
function fmtAmt(s: string | undefined): string {
  if (s == null) return '0'
  try {
    return BigInt(s).toLocaleString('en-US')
  } catch {
    return s
  }
}
/** Compact 12.4M / 461K for headline tiles. */
function fmtCompact(s: string): string {
  let n: number
  try {
    n = Number(BigInt(s))
  } catch {
    return s
  }
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`
  return n.toLocaleString('en-US')
}
function fmtSignedCompact(s: string): string {
  try {
    return (BigInt(s) > 0n ? '+' : '') + fmtCompact(s)
  } catch {
    return s
  }
}
function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}
function exactTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}
function rtpPct(wagered: string, won: string): number | null {
  try {
    const w = BigInt(wagered)
    if (w <= 0n) return null
    return Number((BigInt(won) * 10000n) / w) / 100
  } catch {
    return null
  }
}
function profitStr(wagered: string, won: string): string {
  try {
    return (BigInt(wagered) - BigInt(won)).toString()
  } catch {
    return '0'
  }
}

// Stable per-game accent so a game reads the same in the leaderboard + feed.
const GAME_COLORS = ['#2dd4ee', '#fbbf24', '#a78bfa', '#6ee7b7', '#fb7185', '#7cc5ff', '#f0abfc', '#fcd34d']
function gameColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return GAME_COLORS[h % GAME_COLORS.length]
}

const WINDOWS: { key: StatsWindow; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All-time' },
]

// ── small presentational pieces ─────────────────────────────────────────────
function StatTile({
  label,
  value,
  sub,
  subClass,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  subClass?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold tabular-nums ${valueClass ?? 'text-white'}`}>{value}</div>
      {sub && <div className={`mt-1 text-xs ${subClass ?? 'text-white/40'}`}>{sub}</div>}
    </div>
  )
}

function WindowToggle({ value, onChange }: { value: StatsWindow; onChange: (w: StatsWindow) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {WINDOWS.map((w) => (
        <button
          key={w.key}
          type="button"
          onClick={() => onChange(w.key)}
          className={[
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            value === w.key ? 'bg-cyan-500/15 text-cyan-300' : 'text-white/40 hover:text-white/70',
          ].join(' ')}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}

function GameRow({ g, max }: { g: GameSummary; max: bigint }) {
  const rtp = rtpPct(g.wagered, g.won)
  const pct = (() => {
    try {
      return max > 0n ? Number((BigInt(g.wagered) * 100n) / max) : 0
    } catch {
      return 0
    }
  })()
  const houseLosing = rtp != null && rtp > 100
  const c = gameColor(g.key)
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: c }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-semibold text-white">{g.label}</span>
          <span className="ml-2 tabular-nums text-sm font-bold text-white/85">{fmtCompact(g.wagered)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: c }} />
          </span>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
              houseLosing ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/12 text-emerald-300',
            ].join(' ')}
          >
            {rtp != null ? `${rtp.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

function FeedRow({ p }: { p: RecentPlay }) {
  const c = gameColor(p.gameKey)
  const name = p.displayName?.trim() || shortAddr(p.wallet)
  const net = (() => {
    try {
      return BigInt(p.net)
    } catch {
      return 0n
    }
  })()
  const netClass = net > 0n ? 'text-emerald-300' : net < 0n ? 'text-rose-300' : 'text-white/45'
  const resultClass =
    p.result === 'win'
      ? 'bg-emerald-500/15 text-emerald-300'
      : p.result === 'loss'
        ? 'bg-rose-500/15 text-rose-300'
        : 'bg-white/10 text-white/55'
  return (
    <div className="flex items-center gap-3 border-t border-white/[0.06] py-2.5 first:border-t-0">
      <span
        className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[11px] font-extrabold text-[#04121a]"
        style={{ background: c }}
      >
        {p.wallet.slice(2, 4).toLowerCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">
          <Link
            href={`/player/${p.wallet}`}
            className="inline-flex items-center gap-0.5 font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            {name}
            <ArrowUpRight className="h-3 w-3 opacity-60" />
          </Link>
          <span className="text-white/45"> · </span>
          <span className="font-medium text-white/80">{p.gameLabel}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-white/35">{exactTime(p.at)}</div>
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <span className={`tabular-nums text-[13px] font-bold ${netClass}`}>
          {net > 0n ? '+' : ''}
          {fmtAmt(p.net)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${resultClass}`}>{p.result}</span>
      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function GameActivityPage() {
  const { address } = useAccount()
  const isAdmin = isAdminWallet(address)
  const [window, setWindow] = useState<StatsWindow>('7d')

  const { data: summary, isLoading: gamesLoading } = useGameSummaries(isAdmin, window)
  const { data: plays, isLoading: playsLoading } = useRecentPlays(isAdmin, 40)
  const { balanceFormatted: vaultRaw } = useTokenBalance(isAdmin ? MORBIUS_VAULT_ADDRESS : undefined)

  const games = summary?.games ?? []

  const vault = useMemo(() => {
    const n = Math.floor(Number(vaultRaw || '0'))
    return Number.isFinite(n) ? n.toLocaleString('en-US') : '—'
  }, [vaultRaw])

  const rollup = useMemo(() => {
    let w = 0n
    let won = 0n
    let count = 0
    let maxWagered = 0n
    for (const g of games) {
      try {
        const gw = BigInt(g.wagered)
        w += gw
        won += BigInt(g.won)
        if (gw > maxWagered) maxWagered = gw
      } catch {
        /* skip */
      }
      count += g.plays
    }
    return {
      wagered: w.toString(),
      profit: (w - won).toString(),
      plays: count,
      players: summary?.totalPlayers ?? 0,
      maxWagered,
    }
  }, [games, summary])

  const windowLabel = WINDOWS.find((x) => x.key === window)?.label ?? ''

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
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Dashboard</h1>
              <p className="mt-1 text-sm text-white/50">
                Platform health at a glance · stats for the last {windowLabel.toLowerCase()}. Click any player to open
                their dashboard.
              </p>
            </div>
            <WindowToggle value={window} onChange={setWindow} />
          </div>

          {/* Hero band: vault + windowed rollup */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.12] via-violet-500/[0.04] to-transparent p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">
                <Wallet className="h-3.5 w-3.5" /> Vault balance
              </div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-amber-300 sm:text-3xl">{vault}</div>
              <div className="mt-1 text-xs text-white/45">MORBIUS · house bankroll</div>
            </div>
            <StatTile
              label={`Wagered · ${windowLabel}`}
              value={gamesLoading ? '—' : fmtCompact(rollup.wagered)}
              sub={`${rollup.plays.toLocaleString()} plays`}
            />
            <StatTile
              label="House profit"
              value={gamesLoading ? '—' : fmtSignedCompact(rollup.profit)}
              valueClass={rollup.profit.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'}
              sub="wagered − won"
            />
            <StatTile
              label="Active players"
              value={gamesLoading ? '—' : rollup.players.toLocaleString()}
              sub={`across ${games.length} games`}
            />
          </div>

          {/* Two columns: leaderboard + live feed */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top games */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Top games</h2>
                <span className="text-xs text-white/35">by volume · {windowLabel.toLowerCase()}</span>
              </div>
              {gamesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                </div>
              ) : games.length === 0 ? (
                <div className="py-10 text-center text-sm text-white/40">No plays in this window.</div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {games.slice(0, 7).map((g) => (
                    <GameRow key={g.key} g={g} max={rollup.maxWagered} />
                  ))}
                </div>
              )}
            </div>

            {/* Latest plays */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Latest plays</h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-white/35">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.15)]" />
                  live · exact time
                </span>
              </div>
              {playsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                </div>
              ) : !plays || plays.length === 0 ? (
                <div className="py-10 text-center text-sm text-white/40">No plays yet.</div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto pr-1">
                  {plays.map((p, i) => (
                    <FeedRow key={`${p.wallet}-${p.at}-${i}`} p={p} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Admin tools: search a player and credit/debit their balance */}
          <AdminCreditPanel />

          <p className="mt-4 text-xs text-white/30">Amounts in MORBIUS. Vault reads on-chain; stats from the game ledger.</p>
        </div>
      </div>
    </GlobalMainNav>
  )
}
