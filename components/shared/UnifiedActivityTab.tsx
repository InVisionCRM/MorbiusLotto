'use client'

import React, { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { useQuery } from '@tanstack/react-query'
import {
  Activity as ActivityIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Link2,
  Download,
  ShieldCheck,
} from 'lucide-react'
import { downloadCsv } from '@/lib/download-csv'
import { getVerifyUrl } from '@/lib/round-verify'
import { RoundVerifyModal } from '@/components/shared/RoundVerifyModal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePlayerActivity, type PlayerActivityEntry } from '@/hooks/use-player-activity'

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.84)',
  border: '1px solid rgba(34,211,238,0.15)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.055), inset 0 0 0 0.5px rgba(34,211,238,0.07), 0 2px 8px -4px rgba(0,0,0,0.7)',
}

const PAGE_SIZE = 25
// Pull the player's full DB-retained history in one call so we can merge the
// chain-read on-chain Plinko plays into a single chronological list.
const DB_FETCH_LIMIT = 25000
const PLINKO_FETCH_LIMIT = 1000

// A merged row: DB activity rows plus normalized on-chain Plinko drops.
type MergedRow = Omit<PlayerActivityEntry, 'source'> & {
  source: PlayerActivityEntry['source'] | 'plinko_onchain'
  onchain?: boolean
}

// Game filter options (poker lives in its own tab, so it's intentionally absent).
const GAME_GROUPS: { label: string; games: { key: string; label: string }[] }[] = [
  {
    label: 'Cards & Table',
    games: [
      { key: 'blackjack', label: 'Blackjack' },
      { key: 'video_poker', label: 'Video Poker' },
      { key: 'three_card_poker', label: 'Three Card Poker' },
      { key: 'baccarat', label: 'Baccarat' },
      { key: 'dragon_tiger', label: 'Dragon Tiger' },
      { key: 'andar_bahar', label: 'Andar Bahar' },
    ],
  },
  {
    label: 'Lottery & Keno',
    games: [
      { key: 'lottery', label: 'Lottery 6-of-55' },
      { key: 'keno', label: 'Keno' },
    ],
  },
  {
    label: 'Arcade',
    games: [
      { key: 'plinko', label: 'Plinko' },
      { key: 'limbo', label: 'Limbo' },
      { key: 'mines', label: 'Mines' },
      { key: 'hilo', label: 'Hi-Lo' },
      { key: 'dice', label: 'Dice' },
      { key: 'dicex2', label: 'Dice X2' },
      { key: 'craps', label: 'Craps' },
      { key: 'crash', label: 'Crash' },
      { key: 'roulette', label: 'Roulette' },
      { key: 'towers', label: 'Towers' },
      { key: 'chicken', label: 'Chicken' },
      { key: 'pachinko', label: 'Pachinko' },
      { key: 'cascade', label: 'Cascade' },
      { key: 'firewalk', label: 'Firewalk' },
      { key: 'heist', label: 'Heist' },
      { key: 'greed_dice', label: 'Greed Dice' },
      { key: 'cipher', label: 'Cipher' },
    ],
  },
  {
    label: 'Wallet',
    games: [
      { key: 'exchange', label: 'Deposits & Cashouts' },
      { key: 'rewards', label: 'Rewards' },
    ],
  },
]

const OUTCOME_CHIPS: { value: 'all' | 'win' | 'loss'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
]

const KIND_META: Record<
  string,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  bet: { label: 'Bet', className: 'text-orange-300', Icon: TrendingDown },
  payout: { label: 'Win', className: 'text-emerald-400', Icon: TrendingUp },
  win: { label: 'Win', className: 'text-emerald-400', Icon: TrendingUp },
  loss: { label: 'Loss', className: 'text-red-400', Icon: TrendingDown },
  push: { label: 'Push', className: 'text-white/60', Icon: RotateCcw },
  refund: { label: 'Refund', className: 'text-sky-300', Icon: RotateCcw },
  tip: { label: 'Tip', className: 'text-amber-300', Icon: ArrowUpCircle },
  fee: { label: 'Fee', className: 'text-white/50', Icon: TrendingDown },
  deposit: { label: 'Deposit', className: 'text-emerald-400', Icon: ArrowDownCircle },
  withdrawal: { label: 'Withdrawal', className: 'text-orange-300', Icon: ArrowUpCircle },
  buy: { label: 'Buy chips', className: 'text-emerald-400', Icon: ArrowDownCircle },
  sell: { label: 'Cash out', className: 'text-orange-300', Icon: ArrowUpCircle },
  reward: { label: 'Reward', className: 'text-cyan-300', Icon: ArrowDownCircle },
  adjustment: { label: 'Adjustment', className: 'text-white/50', Icon: RotateCcw },
}

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, className: 'text-white/60', Icon: RotateCcw }
}

function morbiusNumber(wei: string | null | undefined): number {
  try {
    return Number(formatEther(BigInt(wei || '0')))
  } catch {
    return 0
  }
}

function formatMorbius(wei: string | null | undefined): string {
  if (wei == null) return '—'
  return morbiusNumber(wei).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatSignedMorbius(wei: string): string {
  const n = morbiusNumber(wei)
  if (n === 0) return '0'
  const body = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n > 0 ? `+${body}` : `-${body}`
}

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function gameDisplay(row: MergedRow): string {
  if (row.refType === 'tournament' && row.refName) return row.refName
  return row.gameLabel
}

interface OnchainPlinkoDrop {
  id: string
  multiplierBps: string
  payout: string
  wager: string
  profit: string
  timestamp: number // seconds
}

interface UnifiedActivityTabProps {
  playerAddress: string
}

export function UnifiedActivityTab({ playerAddress }: UnifiedActivityTabProps) {
  const [page, setPage] = useState(0)
  const [game, setGame] = useState<string>('all')
  const [outcome, setOutcome] = useState<'all' | 'win' | 'loss'>('all')
  const [verify, setVerify] = useState<{ url: string; label: string } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // DB-retained history (all chip games + blackjack + lottery), fetched whole so it
  // can merge with the chain-read on-chain Plinko plays into one list.
  const {
    data: dbData,
    isLoading: dbLoading,
    isError: dbError,
  } = usePlayerActivity({
    address: playerAddress || null,
    limit: DB_FETCH_LIMIT,
    offset: 0,
    refetchInterval: false,
  })

  // On-chain Plinko (legacy) — read live from the PulseChain contract; not in our DB,
  // so it's merged in client-side. Loads in the background without blocking DB rows.
  const { data: plinkoData, isFetching: plinkoLoading } = useQuery<OnchainPlinkoDrop[]>({
    queryKey: ['activityOnchainPlinko', playerAddress],
    enabled: !!playerAddress,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/plinko/player/${playerAddress}/drops?limit=${PLINKO_FETCH_LIMIT}&offset=0`,
      )
      if (!res.ok) return []
      const json = await res.json()
      return Array.isArray(json) ? json : []
    },
  })

  const merged = useMemo<MergedRow[]>(() => {
    const dbRows: MergedRow[] = (dbData?.entries ?? []).map((e) => ({ ...e }))
    const plinkoRows: MergedRow[] = (plinkoData ?? []).map((d) => {
      const profit = d.profit ?? '0'
      const n = morbiusNumber(profit)
      return {
        id: `plinko-oc-${d.id}`,
        source: 'plinko_onchain',
        onchain: true,
        amount: profit,
        balance: null,
        wager: d.wager ?? null,
        payout: d.payout ?? null,
        reason: 'plinko_onchain',
        gameKey: 'plinko',
        gameLabel: 'Plinko',
        kind: n > 0 ? 'win' : n < 0 ? 'loss' : 'push',
        refType: null,
        refId: null,
        refName: null,
        createdAt: new Date((d.timestamp ?? 0) * 1000).toISOString(),
      }
    })
    return [...dbRows, ...plinkoRows].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return tb - ta
    })
  }, [dbData, plinkoData])

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : 0
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity
    return merged.filter((r) => {
      if (game !== 'all' && r.gameKey !== game) return false
      if (outcome !== 'all') {
        const n = morbiusNumber(r.amount)
        if (outcome === 'win' && n <= 0) return false
        if (outcome === 'loss' && n >= 0) return false
      }
      if (dateFrom || dateTo) {
        const ts = new Date(r.createdAt).getTime()
        if (ts < from || ts > to) return false
      }
      return true
    })
  }, [merged, game, outcome, dateFrom, dateTo])

  const exportCsv = () => {
    downloadCsv(
      `activity_${playerAddress.slice(-8)}_${Date.now()}.csv`,
      ['timestamp', 'game', 'type', 'wager_morbius', 'payout_morbius', 'net_morbius', 'balance_morbius', 'on_chain'],
      filtered.map((r) => [
        r.createdAt,
        gameDisplay(r),
        kindMeta(r.kind).label,
        r.wager != null ? formatMorbius(r.wager) : '',
        r.payout != null ? formatMorbius(r.payout) : '',
        morbiusNumber(r.amount).toString(),
        r.balance != null ? formatMorbius(r.balance) : '',
        r.onchain ? 'yes' : '',
      ]),
    )
  }

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const rangeStart = total === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min(total, (safePage + 1) * PAGE_SIZE)

  const selectedGameLabel = useMemo(() => {
    if (game === 'all') return 'All games'
    for (const grp of GAME_GROUPS) {
      const hit = grp.games.find((g) => g.key === game)
      if (hit) return hit.label
    }
    return 'All games'
  }, [game])

  const plinkoAtCap = (plinkoData?.length ?? 0) >= PLINKO_FETCH_LIMIT

  return (
    <>
    <Card className="overflow-hidden" style={PANEL_STYLE}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-cyan-400" />
              Activity
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Every bet, win, deposit and reward across all games (poker has its own tab).
              Amounts in MORBIUS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {OUTCOME_CHIPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setOutcome(c.value)
                    setPage(0)
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    outcome === c.value
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <Select
              value={game}
              onValueChange={(v) => {
                setGame(v)
                setPage(0)
              }}
            >
              <SelectTrigger className="h-8 w-[180px] bg-black/30 border-white/10 text-xs text-white">
                <SelectValue placeholder="All games">{selectedGameLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">All games</SelectItem>
                {GAME_GROUPS.map((grp) => (
                  <SelectGroup key={grp.label}>
                    <SelectLabel>{grp.label}</SelectLabel>
                    {grp.games.map((g) => (
                      <SelectItem key={g.key} value={g.key}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
              className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/80 [color-scheme:dark]"
              aria-label="From date"
            />
            <span className="text-white/30 text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
              className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/80 [color-scheme:dark]"
              aria-label="To date"
            />

            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/80">When</TableHead>
                <TableHead className="text-white/80">Game</TableHead>
                <TableHead className="text-white/80">Type</TableHead>
                <TableHead className="text-white/80 text-right">Amount</TableHead>
                <TableHead className="text-white/80 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dbLoading ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  </TableCell>
                </TableRow>
              ) : dbError ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-red-400">
                    Couldn&apos;t load activity. Try again.
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-white/50">
                    No activity yet for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const meta = kindMeta(row.kind)
                  const positive = morbiusNumber(row.amount) > 0
                  const isGameRow = row.wager != null
                  return (
                    <TableRow key={row.id} className="border-white/5">
                      <TableCell className="text-white/70 whitespace-nowrap text-sm">
                        {formatWhen(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {gameDisplay(row)}
                          {row.onchain && (
                            <span
                              title="On-chain (legacy) — read from the PulseChain contract"
                              className="inline-flex items-center gap-0.5 rounded bg-amber-400/10 px-1 py-0.5 text-[10px] text-amber-300"
                            >
                              <Link2 className="w-3 h-3" />
                              on-chain
                            </span>
                          )}
                          {(() => {
                            const vu = getVerifyUrl(row.refType, row.refId)
                            return vu ? (
                              <button
                                type="button"
                                onClick={() => setVerify({ url: vu, label: row.gameLabel })}
                                title="Provably fair — verify this round"
                                className="inline-flex items-center gap-0.5 rounded bg-cyan-400/10 px-1 py-0.5 text-[10px] text-cyan-300 transition-colors hover:bg-cyan-400/20"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                verify
                              </button>
                            ) : null
                          })()}
                        </span>
                        {isGameRow && (
                          <span className="block text-[11px] text-white/40 font-normal">
                            stake {formatMorbius(row.wager)} → {formatMorbius(row.payout)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-sm ${meta.className}`}>
                          <meta.Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono tabular-nums ${
                          positive ? 'text-emerald-400' : 'text-white/80'
                        }`}
                      >
                        {formatSignedMorbius(row.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-white/60">
                        {formatMorbius(row.balance)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/50">
            {total > 0 ? (
              <>
                Showing <span className="text-white/80">{rangeStart.toLocaleString()}</span>–
                <span className="text-white/80">{rangeEnd.toLocaleString()}</span> of{' '}
                <span className="text-white/80">{total.toLocaleString()}</span>
                {plinkoLoading && <span className="ml-2 text-amber-300/70">including on-chain Plinko…</span>}
                {plinkoAtCap && (
                  <span className="ml-2 text-white/40">
                    (on-chain Plinko capped at {PLINKO_FETCH_LIMIT.toLocaleString()} most recent)
                  </span>
                )}
              </>
            ) : (
              ' '
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0 || dbLoading}
              className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-xs text-white/50">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1 || dbLoading}
              className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
    {verify && (
      <RoundVerifyModal url={verify.url} gameLabel={verify.label} onClose={() => setVerify(null)} />
    )}
    </>
  )
}

export default UnifiedActivityTab
