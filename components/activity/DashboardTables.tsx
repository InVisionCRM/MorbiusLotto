'use client'

/**
 * Data tables for the admin financial dashboard (/activity).
 *
 * Each table is sortable (bigint-safe on money columns) and filterable by
 * wallet / display name. Money arrives as whole-MORBIUS decimal strings.
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import type {
  BigWinRow,
  DepositRow,
  MultiplierFrequency,
  MultiplierGameRow,
  MultiplierPlayerRow,
  PlayerRow,
  ReferrerRow,
  WithdrawalRow,
} from '@/hooks/use-admin-dashboard'
import {
  EmptyRow,
  Panel,
  StatusBadge,
  TableScroll,
  TableSearch,
  Td,
  Th,
  TxLink,
  WalletCell,
  exactTime,
  fmt,
  fmtCompact,
  fmtSigned,
  isNegative,
  looksLikeWei,
  timeAgo,
  useSortedRows,
} from './dashboard-ui'

/** Case-insensitive match on wallet or display name. */
function useFilter<T extends { wallet: string; displayName: string | null }>(rows: T[]) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.wallet.toLowerCase().includes(needle) ||
        (r.displayName ?? '').toLowerCase().includes(needle),
    )
  }, [rows, q])
  return { q, setQ, filtered }
}

// ── Players ──────────────────────────────────────────────────────────────────

export function PlayersTable({ rows, windowLabel }: { rows: PlayerRow[]; windowLabel: string }) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'net', dir: 'desc' },
    ['wagered', 'won', 'net', 'balance'],
  )
  const list = sorted as unknown as PlayerRow[]

  const upCount = useMemo(() => rows.filter((r) => !isNegative(r.net) && r.net !== '0').length, [rows])

  return (
    <Panel
      title="Players"
      subtitle={`${rows.length.toLocaleString()} active · ${windowLabel} · ${upCount} up on the house · sorted by player net`}
      right={<TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />}
    >
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th align="right" sortKey="wagered" sort={sort} onSort={onSort}>Wagered</Th>
              <Th align="right" sortKey="won" sort={sort} onSort={onSort}>Won</Th>
              <Th align="right" sortKey="net" sort={sort} onSort={onSort}>Player net</Th>
              <Th align="right" sortKey="plays" sort={sort} onSort={onSort}>Plays</Th>
              <Th align="right" sortKey="balance" sort={sort} onSort={onSort}>Balance</Th>
              <Th align="right">Last seen</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={7}>No players in this window.</EmptyRow>
            ) : (
              list.map((p) => {
                const playerUp = !isNegative(p.net) && p.net !== '0'
                return (
                  <tr key={p.wallet} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <Td><WalletCell wallet={p.wallet} displayName={p.displayName} /></Td>
                    <Td align="right" className="text-white/70">{fmt(p.wagered)}</Td>
                    <Td align="right" className="text-white/70">{fmt(p.won)}</Td>
                    <Td align="right" className={playerUp ? 'font-bold text-rose-300' : 'font-bold text-emerald-300'}>
                      <span className="inline-flex items-center gap-1">
                        {playerUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {fmtSigned(p.net)}
                      </span>
                    </Td>
                    <Td align="right" className="text-white/50">{p.plays.toLocaleString()}</Td>
                    <Td align="right" className={looksLikeWei(p.balance) ? 'font-bold text-rose-300' : 'text-amber-300'}>
                      <span
                        title={
                          looksLikeWei(p.balance)
                            ? 'Implausible balance — this row looks like a wei value (x10^18) stored in a chips column'
                            : undefined
                        }
                      >
                        {looksLikeWei(p.balance) && '⚠ '}
                        {fmtCompact(p.balance)}
                      </span>
                    </Td>
                    <Td align="right" className="text-white/40" ><span title={exactTime(p.lastAt)}>{timeAgo(p.lastAt)}</span></Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </TableScroll>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
        Player net is from the player&apos;s side: <span className="text-rose-300">red = they are up on the house</span>,
        green = the house is up. Watch the top rows.
      </p>
    </Panel>
  )
}

// ── Deposits ─────────────────────────────────────────────────────────────────

export function DepositsTable({ rows, windowLabel }: { rows: DepositRow[]; windowLabel: string }) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'at', dir: 'desc' },
    ['amount'],
  )
  const list = sorted as unknown as DepositRow[]
  const total = useMemo(
    () => rows.reduce((s, r) => s + BigInt(r.amount || '0'), 0n).toString(),
    [rows],
  )

  return (
    <Panel
      title="Deposits"
      subtitle={`${rows.length.toLocaleString()} deposits · ${windowLabel} · ${fmt(total)} MORBIUS in`}
      right={<TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />}
    >
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th align="right" sortKey="amount" sort={sort} onSort={onSort}>Amount</Th>
              <Th>Tx</Th>
              <Th align="right" sortKey="at" sort={sort} onSort={onSort}>When</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={4}>No deposits in this window.</EmptyRow>
            ) : (
              list.map((d) => (
                <tr key={d.txHash} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <Td><WalletCell wallet={d.wallet} displayName={d.displayName} /></Td>
                  <Td align="right" className="font-bold text-emerald-300">+{fmt(d.amount)}</Td>
                  <Td><TxLink hash={d.txHash} /></Td>
                  <Td align="right" className="text-white/40"><span title={exactTime(d.at)}>{timeAgo(d.at)}</span></Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  )
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

export function WithdrawalsTable({ rows, windowLabel }: { rows: WithdrawalRow[]; windowLabel: string }) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'at', dir: 'desc' },
    ['amount', 'net', 'fee'],
  )
  const list = sorted as unknown as WithdrawalRow[]
  const total = useMemo(
    () => rows.filter((r) => r.status === 'completed').reduce((s, r) => s + BigInt(r.amount || '0'), 0n).toString(),
    [rows],
  )
  const pending = useMemo(() => rows.filter((r) => r.status !== 'completed' && r.status !== 'failed').length, [rows])

  return (
    <Panel
      title="Withdrawals"
      subtitle={`${rows.length.toLocaleString()} requests · ${windowLabel} · ${fmt(total)} MORBIUS out${pending ? ` · ${pending} pending` : ''}`}
      right={<TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />}
    >
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th align="right" sortKey="amount" sort={sort} onSort={onSort}>Debited</Th>
              <Th align="right" sortKey="net" sort={sort} onSort={onSort}>Sent</Th>
              <Th align="right" sortKey="fee" sort={sort} onSort={onSort}>Fee</Th>
              <Th>Status</Th>
              <Th>Tx</Th>
              <Th align="right" sortKey="at" sort={sort} onSort={onSort}>When</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={7}>No withdrawals in this window.</EmptyRow>
            ) : (
              list.map((w, i) => (
                <tr key={`${w.wallet}-${w.at}-${i}`} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <Td><WalletCell wallet={w.wallet} displayName={w.displayName} /></Td>
                  <Td align="right" className="font-bold text-rose-300">−{fmt(w.amount)}</Td>
                  <Td align="right" className="text-white/70">{fmt(w.net)}</Td>
                  <Td align="right" className="text-amber-300/80">{fmt(w.fee)}</Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td><TxLink hash={w.txHash} /></Td>
                  <Td align="right" className="text-white/40"><span title={exactTime(w.at)}>{timeAgo(w.at)}</span></Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  )
}

// ── Big wins ─────────────────────────────────────────────────────────────────

/** Quick multiplier thresholds — the ones worth scanning at. 0 = no filter. */
const MULTI_PRESETS = [0, 2, 10, 25, 50, 100, 500, 1000]

export type BigWinView = 'hits' | 'byPlayer' | 'byGame'

export function BigWinsTable({
  rows,
  freq,
  windowLabel,
  threshold,
  onThresholdChange,
  minMultiplier,
  onMinMultiplierChange,
  view,
  onViewChange,
}: {
  rows: BigWinRow[]
  freq: MultiplierFrequency | undefined
  windowLabel: string
  threshold: string
  onThresholdChange: (v: string) => void
  minMultiplier: string
  onMinMultiplierChange: (v: string) => void
  view: BigWinView
  onViewChange: (v: BigWinView) => void
}) {
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        {(
          [
            ['hits', 'Hits'],
            ['byPlayer', 'By player'],
            ['byGame', 'By game'],
          ] as Array<[BigWinView, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => onViewChange(k)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              view === k ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Min ×</label>
        <input
          value={minMultiplier}
          onChange={(e) => onMinMultiplierChange(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-bold tabular-nums text-white focus:border-rose-400/40 focus:outline-none"
        />
        <div className="hidden items-center gap-1 sm:flex">
          {MULTI_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMinMultiplierChange(String(m))}
              className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold transition ${
                Number(minMultiplier) === m
                  ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                  : 'border-white/10 text-white/45 hover:text-white'
              }`}
              title={m === 0 ? 'No multiplier filter' : `At least ${m}×`}
            >
              {m === 0 ? 'Any' : `${m}×`}
            </button>
          ))}
        </div>
      </div>

      {view === 'hits' && (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Min payout</label>
          <input
            value={threshold}
            onChange={(e) => onThresholdChange(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-bold tabular-nums text-white focus:border-amber-400/40 focus:outline-none"
          />
        </div>
      )}
    </div>
  )

  const subtitle =
    view === 'hits'
      ? `${rows.length.toLocaleString()} hits ≥ ${fmt(threshold)} MORBIUS${Number(minMultiplier) > 0 ? ` and ≥ ${minMultiplier}×` : ''} · ${windowLabel}`
      : view === 'byPlayer'
        ? `${(freq?.byPlayer.length ?? 0).toLocaleString()} players cleared ${freq?.minMultiplier ?? minMultiplier}× · ${(freq?.totalHits ?? 0).toLocaleString()} hits total · ${windowLabel} · most frequent first`
        : `per-game ${freq?.minMultiplier ?? minMultiplier}×+ profile · ${windowLabel} · watch payout share`

  return (
    <Panel title="Big wins & multiplier scan" subtitle={subtitle} right={controls}>
      {view === 'hits' && <HitsView rows={rows} />}
      {view === 'byPlayer' && <ByPlayerView rows={freq?.byPlayer ?? []} />}
      {view === 'byGame' && <ByGameView rows={freq?.byGame ?? []} />}
    </Panel>
  )
}

function HitsView({ rows }: { rows: BigWinRow[] }) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'multiplier', dir: 'desc' },
    ['wager', 'payout', 'net'],
  )
  const list = sorted as unknown as BigWinRow[]

  return (
    <>
      <div className="flex justify-end border-b border-white/10 px-4 py-2">
        <TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />
      </div>
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Game</Th>
              <Th align="right" sortKey="wager" sort={sort} onSort={onSort}>Wager</Th>
              <Th align="right" sortKey="payout" sort={sort} onSort={onSort}>Payout</Th>
              <Th align="right" sortKey="multiplier" sort={sort} onSort={onSort}>Multi</Th>
              <Th align="right" sortKey="net" sort={sort} onSort={onSort}>Net</Th>
              <Th align="right" sortKey="at" sort={sort} onSort={onSort}>When</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={7}>No wins matching these thresholds.</EmptyRow>
            ) : (
              list.map((b, i) => {
                const hot = (b.multiplier ?? 0) >= 50
                return (
                  <tr key={`${b.wallet}-${b.at}-${i}`} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <Td><WalletCell wallet={b.wallet} displayName={b.displayName} /></Td>
                    <Td className="text-white/60">{b.gameLabel}</Td>
                    <Td align="right" className="text-white/60">{fmt(b.wager)}</Td>
                    <Td align="right" className="font-bold text-amber-300">{fmt(b.payout)}</Td>
                    <Td align="right" className={hot ? 'font-bold text-rose-300' : 'text-white/60'}>
                      <span className="inline-flex items-center gap-1">
                        {hot && <AlertTriangle className="h-3 w-3" />}
                        {b.multiplier != null ? `${b.multiplier.toLocaleString()}×` : '—'}
                      </span>
                    </Td>
                    <Td align="right" className="font-bold text-emerald-300">{fmtSigned(b.net)}</Td>
                    <Td align="right" className="text-white/40"><span title={exactTime(b.at)}>{timeAgo(b.at)}</span></Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </TableScroll>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
        Individual hits. Switch to <b className="text-white/50">By player</b> to see who lands them repeatedly — that&apos;s
        the abuse signal, not any single win.
      </p>
    </>
  )
}

function ByPlayerView({ rows }: { rows: MultiplierPlayerRow[] }) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'hits', dir: 'desc' },
    ['wagered', 'payout', 'net'],
  )
  const list = sorted as unknown as MultiplierPlayerRow[]

  return (
    <>
      <div className="flex justify-end border-b border-white/10 px-4 py-2">
        <TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />
      </div>
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th align="right" sortKey="hits" sort={sort} onSort={onSort}>Hits</Th>
              <Th align="right" sortKey="hitsPerDay" sort={sort} onSort={onSort}>Hits/day</Th>
              <Th align="right" sortKey="maxMultiplier" sort={sort} onSort={onSort}>Max ×</Th>
              <Th align="right" sortKey="avgMultiplier" sort={sort} onSort={onSort}>Avg ×</Th>
              <Th align="right" sortKey="games" sort={sort} onSort={onSort}>Games</Th>
              <Th align="right" sortKey="payout" sort={sort} onSort={onSort}>Won</Th>
              <Th align="right" sortKey="net" sort={sort} onSort={onSort}>Net</Th>
              <Th align="right" sortKey="lastAt" sort={sort} onSort={onSort}>Last hit</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={9}>Nobody cleared this multiplier in the window.</EmptyRow>
            ) : (
              list.map((p) => {
                // Repeat hitters are the ones worth investigating.
                const heavy = p.hits >= 10
                const notable = p.hits >= 5
                return (
                  <tr
                    key={p.wallet}
                    className={`border-t border-white/5 hover:bg-white/[0.03] ${heavy ? 'bg-rose-500/[0.06]' : ''}`}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        {heavy && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                        <WalletCell wallet={p.wallet} displayName={p.displayName} />
                      </div>
                    </Td>
                    <Td
                      align="right"
                      className={heavy ? 'font-extrabold text-rose-300' : notable ? 'font-bold text-amber-300' : 'text-white/70'}
                    >
                      {p.hits.toLocaleString()}
                    </Td>
                    <Td align="right" className="text-white/50">{p.hitsPerDay.toLocaleString()}</Td>
                    <Td align="right" className="font-bold text-amber-300">{p.maxMultiplier.toLocaleString()}×</Td>
                    <Td align="right" className="text-white/60">{p.avgMultiplier.toLocaleString()}×</Td>
                    <Td align="right" className="text-white/50">
                      <span title={`Top game: ${p.topGameLabel}`}>
                        {p.games} <span className="text-white/30">({p.topGameLabel})</span>
                      </span>
                    </Td>
                    <Td align="right" className="text-amber-300">{fmt(p.payout)}</Td>
                    <Td align="right" className={isNegative(p.net) ? 'font-bold text-emerald-300' : 'font-bold text-rose-300'}>
                      {fmtSigned(p.net)}
                    </Td>
                    <Td align="right" className="text-white/40"><span title={exactTime(p.lastAt)}>{timeAgo(p.lastAt)}</span></Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </TableScroll>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
        Sorted by <b className="text-white/50">how often</b> each wallet clears the threshold. Rows flagged red hit it 10+
        times. Net is from the player&apos;s side — red net means they are up on the house. One wallet clearing a high
        multiplier repeatedly on a <b className="text-white/50">single game</b> is the classic exploit pattern.
      </p>
    </>
  )
}

function ByGameView({ rows }: { rows: MultiplierGameRow[] }) {
  const { sorted, sort, onSort } = useSortedRows(
    rows as unknown as Array<Record<string, unknown>>,
    { key: 'hits', dir: 'desc' },
    ['payout'],
  )
  const list = sorted as unknown as MultiplierGameRow[]

  return (
    <>
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Game</Th>
              <Th align="right" sortKey="hits" sort={sort} onSort={onSort}>Hits</Th>
              <Th align="right" sortKey="players" sort={sort} onSort={onSort}>Players</Th>
              <Th align="right" sortKey="maxMultiplier" sort={sort} onSort={onSort}>Max ×</Th>
              <Th align="right" sortKey="avgMultiplier" sort={sort} onSort={onSort}>Avg ×</Th>
              <Th align="right" sortKey="payout" sort={sort} onSort={onSort}>Paid out</Th>
              <Th align="right" sortKey="payoutSharePct" sort={sort} onSort={onSort}>% of game payout</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={7}>No game produced hits at this multiplier.</EmptyRow>
            ) : (
              list.map((g) => {
                // A game paying most of its money through outlier hits, to very few
                // players, is the shape of broken math or an exploit.
                const concentrated = g.payoutSharePct >= 50
                const fewPlayers = g.hits >= 5 && g.players <= 2
                return (
                  <tr
                    key={g.gameKey}
                    className={`border-t border-white/5 hover:bg-white/[0.03] ${concentrated || fewPlayers ? 'bg-rose-500/[0.06]' : ''}`}
                  >
                    <Td className="font-semibold text-white">
                      <span className="inline-flex items-center gap-2">
                        {(concentrated || fewPlayers) && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                        {g.gameLabel}
                      </span>
                    </Td>
                    <Td align="right" className="font-bold text-white/80">{g.hits.toLocaleString()}</Td>
                    <Td align="right" className={fewPlayers ? 'font-bold text-rose-300' : 'text-white/50'}>
                      {g.players.toLocaleString()}
                    </Td>
                    <Td align="right" className="font-bold text-amber-300">{g.maxMultiplier.toLocaleString()}×</Td>
                    <Td align="right" className="text-white/60">{g.avgMultiplier.toLocaleString()}×</Td>
                    <Td align="right" className="text-amber-300">{fmt(g.payout)}</Td>
                    <Td align="right" className={concentrated ? 'font-bold text-rose-300' : 'text-white/60'}>
                      {g.payoutSharePct.toFixed(1)}%
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </TableScroll>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
        <b className="text-white/50">% of game payout</b> is how much of everything that game paid out came from these
        outlier hits. Flagged red when outliers are ≥50% of a game&apos;s payout, or when 5+ hits came from ≤2 players —
        both point at broken math or an exploited game rather than variance.
      </p>
    </>
  )
}

// ── Referrals ────────────────────────────────────────────────────────────────

export function ReferralsTable({
  rows,
  totals,
}: {
  rows: ReferrerRow[]
  totals: { referrers: number; referees: number; earned: string; welcomePaid: string }
}) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'earned', dir: 'desc' },
    ['earned', 'welcomePaid'],
  )
  const list = sorted as unknown as ReferrerRow[]

  return (
    <Panel
      title="Referrals"
      subtitle={`${totals.referrers.toLocaleString()} referrers · ${totals.referees.toLocaleString()} referees · ${fmt(totals.earned)} earned · ${fmt(totals.welcomePaid)} welcome bonuses paid`}
      right={<TableSearch value={q} onChange={setQ} placeholder="Filter referrer…" />}
    >
      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Referrer</Th>
              <Th align="right" sortKey="referees" sort={sort} onSort={onSort}>Referees</Th>
              <Th align="right" sortKey="earned" sort={sort} onSort={onSort}>Earned</Th>
              <Th align="right" sortKey="welcomePaid" sort={sort} onSort={onSort}>Welcome paid</Th>
              <Th align="right" sortKey="lastBoundAt" sort={sort} onSort={onSort}>Last referral</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={5}>No referrals yet.</EmptyRow>
            ) : (
              list.map((r) => (
                <tr key={r.wallet} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <Td><WalletCell wallet={r.wallet} displayName={r.displayName} /></Td>
                  <Td align="right" className="text-white/70">{r.referees.toLocaleString()}</Td>
                  <Td align="right" className="font-bold text-amber-300">{fmt(r.earned)}</Td>
                  <Td align="right" className="text-white/50">{fmt(r.welcomePaid)}</Td>
                  <Td align="right" className="text-white/40"><span title={exactTime(r.lastBoundAt)}>{timeAgo(r.lastBoundAt)}</span></Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  )
}
