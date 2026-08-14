'use client'

/**
 * SlotsPanel — the community-slots dashboard inside /activity.
 *
 * Layout is a real dashboard: a sticky machine list down the left (with an
 * "All machines" overview entry), detail on the right. Selecting a machine
 * swaps the main pane to its deep dive — stat cards, free-play vs real-money
 * split, the money picture, a 30-day activity strip, and that machine's own
 * event feed. Everything reads the /api/admin-ops/slots/* endpoints through
 * the same Next proxy + SIWE-session + allowlist gate as the rest of this
 * page (slot-machines-stats.routes.ts server-side).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cherry, Loader2, RefreshCw } from 'lucide-react'
import {
  EmptyRow,
  Panel,
  StatCard,
  TableScroll,
  Td,
  Th,
  WalletCell,
  timeAgo,
} from '@/components/activity/dashboard-ui'

interface Totals {
  machines: number
  published: number
  tokenMachines: number
  spins: number
  realSpins: number
  realWagered: string
  realPaid: string
  players: number
}
interface MachineRow {
  slug: string
  name: string
  status: string
  owner: string
  tokenSymbol: string | null
  tokenDecimals: number | null
  bankroll: string
  feeWarning: boolean
  simRtpPct: number | null
  spins: number
  realSpins: number
  realWagered: string
  realNet: string
  players: number
  lastSpinAt: string | null
  playerLiabilities: string
}
interface ActivityEvent {
  kind: string
  slug: string
  machine: string
  actor: string
  a: string | null
  b: string | null
  detail: string | null
  at: string
}
interface ModeStats {
  spins: number
  wagered: string
  paid: string
  players: number
  bonusRounds: number
  bestWin: string
  rtpPct: number | null
}
interface MachineDetail {
  machine: { slug: string; name: string; status: string; owner: string; simRtpPct: number | null; winCapX: number }
  token: { symbol: string; decimals: number; creditValue: string } | null
  modes: { credits: ModeStats; real: ModeStats }
  money: {
    bankroll: string
    playerLiabilities: string
    bankrollFlows: Record<string, { total: string; count: number }>
    playerFlows: Record<string, { total: string; count: number }>
  }
  daily: Array<{ day: string; mode: string; spins: number; wagered: string; net: string }>
}

function n(v: string | number | null | undefined): string {
  if (v == null) return '0'
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num.toLocaleString('en-US') : String(v)
}
/** Token base units → human display using the token's decimals. */
function baseUnits(v: string | null | undefined, decimals: number | null | undefined): string {
  if (v == null || decimals == null) return n(v)
  try {
    const b = BigInt(v)
    const d = 10n ** BigInt(decimals)
    const frac = (b % d).toString().padStart(decimals, '0').slice(0, 2).replace(/0+$/, '')
    return `${(b / d).toLocaleString('en-US')}${frac ? '.' + frac : ''}`
  } catch {
    return String(v)
  }
}
function eventLabel(e: ActivityEvent, decimals?: number | null): string {
  switch (e.kind) {
    case 'spin': return `spin ${n(e.a)} → ${n(e.b)} (${e.detail})`
    case 'bankroll_deposit': return `bankroll funded +${baseUnits(e.a, decimals)}`
    case 'bankroll_withdrawal': return `bankroll withdrawn −${baseUnits(e.a, decimals)}`
    case 'player_deposit': return `player deposited ${n(e.b)} cr`
    case 'player_cashout': return `player cashed out ${n(e.b)} cr`
    default: return e.kind
  }
}
const statusDot = (s: string) =>
  s === 'published' ? 'bg-emerald-400' : s === 'draft' ? 'bg-amber-400' : 'bg-white/25'

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: 'include' })
  if (!r.ok) throw new Error(`${path} failed (${r.status})`)
  return (await r.json()) as T
}

export default function SlotsPanel() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<MachineDetail | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ov, act] = await Promise.all([
        getJson<{ totals: Totals; machines: MachineRow[] }>('/api/admin-ops/slots/overview'),
        getJson<{ events: ActivityEvent[] }>('/api/admin-ops/slots/activity?limit=60'),
      ])
      setTotals(ov.totals)
      setMachines(ov.machines ?? [])
      if (!selected) setEvents(act.events ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [selected])

  const loadDetail = useCallback(async (slug: string) => {
    setLoading(true)
    setError(null)
    try {
      const [d, act] = await Promise.all([
        getJson<MachineDetail>(`/api/admin-ops/slots/machine/${encodeURIComponent(slug)}`),
        getJson<{ events: ActivityEvent[] }>(`/api/admin-ops/slots/activity?limit=60&slug=${encodeURIComponent(slug)}`),
      ])
      setDetail(d)
      setEvents(act.events ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadOverview() }, [loadOverview])
  useEffect(() => {
    if (selected) void loadDetail(selected)
    else { setDetail(null); void loadOverview() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const refresh = () => (selected ? loadDetail(selected) : loadOverview())
  const selectedRow = useMemo(() => machines.find((m) => m.slug === selected) ?? null, [machines, selected])

  // last-30d combined spins per day for the detail strip
  const dailyBars = useMemo(() => {
    if (!detail) return []
    const byDay = new Map<string, number>()
    for (const d of detail.daily) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.spins)
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30)
  }, [detail])
  const maxBar = Math.max(1, ...dailyBars.map(([, v]) => v))

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* ── side panel: machine list ── */}
      <aside className="w-full shrink-0 lg:w-60">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
              <Cherry className="h-3.5 w-3.5 text-pink-300" /> Machines
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-white/10 p-1 text-white/50 transition hover:text-white"
              title="Refresh"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`mb-1 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition ${
                selected == null ? 'bg-cyan-400/10 text-cyan-200' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span>All machines</span>
              <span className="tabular-nums text-white/40">{totals?.machines ?? '—'}</span>
            </button>
            {machines.map((m) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => setSelected(m.slug)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                  selected === m.slug ? 'bg-cyan-400/10' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(m.status)}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-xs font-semibold ${selected === m.slug ? 'text-cyan-200' : 'text-white/80'}`}>
                    {m.name}
                    {m.feeWarning && <span className="ml-1 text-amber-400" title="fee-on-transfer token">⚠</span>}
                  </span>
                  <span className="block truncate text-[10px] text-white/35">
                    {m.tokenSymbol ?? 'free play'} · {n(m.spins)} spins
                  </span>
                </span>
              </button>
            ))}
            {machines.length === 0 && !loading && (
              <p className="px-2.5 py-3 text-xs text-white/40">No community machines yet.</p>
            )}
          </div>
        </div>
      </aside>

      {/* ── main pane ── */}
      <div className="min-w-0 flex-1 space-y-3">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-200">{error}</div>
        )}

        {selected == null ? (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard label="Machines" value={n(totals?.machines)} sub={`${n(totals?.published)} live · ${n(totals?.tokenMachines)} with tokens`} tone="cyan" />
              <StatCard label="Total spins" value={n(totals?.spins)} sub={`${n(totals?.realSpins)} real money`} />
              <StatCard label="Real wagered → paid (cr)" value={`${n(totals?.realWagered)} → ${n(totals?.realPaid)}`} tone="gold" />
              <StatCard label="Unique players" value={n(totals?.players)} />
            </div>

            <Panel title="All machines" subtitle="every community machine, most recently active first — click a row or the side panel to drill in">
              <TableScroll>
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <Th>Machine</Th>
                      <Th>Creator</Th>
                      <Th>Status</Th>
                      <Th align="right">Bankroll</Th>
                      <Th align="right">Spins (real)</Th>
                      <Th align="right">Real net (cr)</Th>
                      <Th align="right">Owed (cr)</Th>
                      <Th align="right">Players</Th>
                      <Th align="right">Last spin</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map((m) => (
                      <tr
                        key={m.slug}
                        onClick={() => setSelected(m.slug)}
                        className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.03]"
                      >
                        <Td>
                          <span className="font-semibold text-white">{m.name}</span>
                          {m.feeWarning && <span className="ml-1 text-amber-400" title="fee-on-transfer token">⚠</span>}
                        </Td>
                        <Td><WalletCell wallet={m.owner} /></Td>
                        <Td>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(m.status)}`} />
                            {m.status}
                            {m.simRtpPct != null && <span className="text-white/35">· {Math.round(m.simRtpPct)}%</span>}
                          </span>
                        </Td>
                        <Td align="right">{m.tokenSymbol ? `${baseUnits(m.bankroll, m.tokenDecimals)} ${m.tokenSymbol}` : '—'}</Td>
                        <Td align="right">{n(m.spins)} ({n(m.realSpins)})</Td>
                        <Td align="right">{n(m.realNet)}</Td>
                        <Td align="right">{n(m.playerLiabilities)}</Td>
                        <Td align="right">{n(m.players)}</Td>
                        <Td align="right">{m.lastSpinAt ? timeAgo(m.lastSpinAt) : '—'}</Td>
                      </tr>
                    ))}
                    {machines.length === 0 && <EmptyRow colSpan={9}>No community machines yet.</EmptyRow>}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                label="Bankroll"
                value={detail?.token ? `${baseUnits(detail.money.bankroll, detail.token.decimals)} ${detail.token.symbol}` : '—'}
                sub={detail?.token ? `owes players ${n(detail.money.playerLiabilities)} cr` : 'no betting token'}
                tone="gold"
              />
              <StatCard
                label="Live RTP (real)"
                value={detail?.modes.real.rtpPct != null ? `${detail.modes.real.rtpPct}%` : '—'}
                sub={detail?.machine.simRtpPct != null ? `simulated ${Math.round(detail.machine.simRtpPct)}%` : undefined}
                tone="cyan"
              />
              <StatCard
                label="Real spins"
                value={n(detail?.modes.real.spins)}
                sub={`${n(detail?.modes.real.wagered)} wagered · best win ${n(detail?.modes.real.bestWin)}`}
              />
              <StatCard
                label="Free spins"
                value={n(detail?.modes.credits.spins)}
                sub={`${n(detail?.modes.credits.players)} + ${n(detail?.modes.real.players)} players`}
              />
            </div>

            <Panel
              title={selectedRow?.name ?? selected}
              subtitle={`${selectedRow?.status ?? ''} · win cap ${n(detail?.machine.winCapX)}× · creator`}
              right={selectedRow ? <WalletCell wallet={selectedRow.owner} /> : undefined}
            >
              <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">Mode split</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <Th>Mode</Th>
                        <Th align="right">Spins</Th>
                        <Th align="right">Wagered</Th>
                        <Th align="right">Paid</Th>
                        <Th align="right">RTP</Th>
                        <Th align="right">Bonuses</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['credits', 'real'] as const).map((mode) => {
                        const m = detail?.modes[mode]
                        return (
                          <tr key={mode} className="border-t border-white/5">
                            <Td>{mode === 'credits' ? 'free play' : 'real money'}</Td>
                            <Td align="right">{n(m?.spins)}</Td>
                            <Td align="right">{n(m?.wagered)}</Td>
                            <Td align="right">{n(m?.paid)}</Td>
                            <Td align="right">{m?.rtpPct != null ? `${m.rtpPct}%` : '—'}</Td>
                            <Td align="right">{n(m?.bonusRounds)}</Td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {detail?.token && (
                    <p className="mt-3 text-xs text-white/45">
                      funded {baseUnits(detail.money.bankrollFlows.deposit?.total ?? '0', detail.token.decimals)} ·
                      withdrawn {baseUnits(detail.money.bankrollFlows.withdrawal?.total ?? '0', detail.token.decimals)} ·
                      player in {baseUnits(detail.money.playerFlows.deposit?.total ?? '0', detail.token.decimals)} ·
                      player out {baseUnits(detail.money.playerFlows.cashout?.total ?? '0', detail.token.decimals)} {detail.token.symbol}
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">Spins · last 30 days</p>
                  {dailyBars.length > 0 ? (
                    <div className="flex h-24 items-end gap-[3px]">
                      {dailyBars.map(([day, spins]) => (
                        <div
                          key={day}
                          title={`${day}: ${spins} spins`}
                          className="min-w-[6px] flex-1 rounded-t bg-cyan-400/60"
                          style={{ height: `${Math.max(6, Math.round((spins / maxBar) * 96))}px` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/40">No spins in the last 30 days.</p>
                  )}
                </div>
              </div>
            </Panel>
          </>
        )}

        <Panel
          title={selected ? 'Machine activity' : 'Recent activity'}
          subtitle={selected ? 'every spin and money movement on this machine' : 'spins, bankroll funding, player deposits and cashouts across all machines'}
        >
          <TableScroll maxH="max-h-[420px]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <Th>When</Th>
                  {!selected && <Th>Machine</Th>}
                  <Th>Wallet</Th>
                  <Th>Event</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <Td className="whitespace-nowrap text-white/45">{timeAgo(e.at)}</Td>
                    {!selected && <Td className="text-cyan-300">{e.machine}</Td>}
                    <Td><WalletCell wallet={e.actor} /></Td>
                    <Td>{eventLabel(e, detail?.token?.decimals ?? selectedRow?.tokenDecimals)}</Td>
                  </tr>
                ))}
                {events.length === 0 && <EmptyRow colSpan={selected ? 3 : 4}>Nothing yet.</EmptyRow>}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      </div>
    </div>
  )
}
