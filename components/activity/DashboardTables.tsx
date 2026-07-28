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
  fmtSigned,
  isNegative,
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
                    <Td align="right" className="text-amber-300">{fmt(p.balance)}</Td>
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

export function BigWinsTable({
  rows,
  windowLabel,
  threshold,
  onThresholdChange,
}: {
  rows: BigWinRow[]
  windowLabel: string
  threshold: string
  onThresholdChange: (v: string) => void
}) {
  const { q, setQ, filtered } = useFilter(rows)
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'payout', dir: 'desc' },
    ['wager', 'payout', 'net'],
  )
  const list = sorted as unknown as BigWinRow[]
  const total = useMemo(
    () => rows.reduce((s, r) => s + BigInt(r.payout || '0'), 0n).toString(),
    [rows],
  )

  return (
    <Panel
      title="Big wins"
      subtitle={`${rows.length.toLocaleString()} hits ≥ ${fmt(threshold)} · ${windowLabel} · ${fmt(total)} MORBIUS paid`}
      right={
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Min payout</label>
          <input
            value={threshold}
            onChange={(e) => onThresholdChange(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-bold tabular-nums text-white focus:border-amber-400/40 focus:outline-none"
          />
          <TableSearch value={q} onChange={setQ} placeholder="Filter…" />
        </div>
      }
    >
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
              <EmptyRow colSpan={7}>No wins at or above this threshold.</EmptyRow>
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
        Multipliers ≥ 50× are flagged — worth a look when they cluster on one wallet or one game.
      </p>
    </Panel>
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
