'use client'

/**
 * VIP tiers tab for the admin dashboard (/activity).
 *
 * Two views of the same ladder:
 *   - the LADDER itself — every rung with live occupancy, the rakeback rate it
 *     costs, and what it has actually paid out. The program's cost sheet.
 *   - every PLAYER's standing, with how far they are from their next rung.
 *     Sorted by distance so whoever is about to level up (and start costing a
 *     higher rakeback rate) sits at the top.
 *
 * Tier is lifetime, never windowed — it does NOT follow the dashboard's window
 * selector, so the numbers here always match what the player sees on /vip.
 */

import { useMemo, useState } from 'react'
import { Crown } from 'lucide-react'
import type { VipLadderRung, VipPlayerRow } from '@/hooks/use-admin-dashboard'
import {
  EmptyRow,
  Panel,
  TableScroll,
  TableSearch,
  Td,
  Th,
  WalletCell,
  fmt,
  fmtCompact,
  timeAgo,
  useSortedRows,
} from './dashboard-ui'

/**
 * Stand-in "distance to next tier" for players already at the top of the
 * ladder, so an ascending sort parks them at the end instead of the front.
 * Compared as BigInt, and far beyond any real chip figure.
 */
const MAX_TIER_SORT_SENTINEL = '9'.repeat(40)

/** rakeback_bps → human percent. 500 bps = 5%. */
function bpsPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
}

function TierChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color, borderColor: `${color}55`, background: `${color}18` }}
    >
      {name}
    </span>
  )
}

/** Progress through the current rung. `pct` is 0–100; 100 also means max tier. */
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, background: color, boxShadow: `0 0 8px -2px ${color}` }}
      />
    </div>
  )
}

// ── The ladder ───────────────────────────────────────────────────────────────

function LadderTable({ ladder, totalPlayers }: { ladder: VipLadderRung[]; totalPlayers: number }) {
  return (
    <Panel
      title="The ladder"
      subtitle={
        `${ladder.length} rungs · ${totalPlayers.toLocaleString()} ranked players · ` +
        'rakeback accrues on net LOSS only, so paid-out figures are actuals, not accruals'
      }
    >
      <TableScroll maxH="max-h-[380px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Tier</Th>
              <Th align="right">Wager to reach</Th>
              <Th align="right">Rakeback</Th>
              <Th align="right">Level-up bonus</Th>
              <Th align="right">Players</Th>
              <Th align="right">Share</Th>
              <Th align="right">Lifetime wagered</Th>
              <Th align="right">Rakeback paid</Th>
              <Th align="right">Bonus paid</Th>
            </tr>
          </thead>
          <tbody>
            {ladder.length === 0 ? (
              <EmptyRow colSpan={9}>No tier ladder configured.</EmptyRow>
            ) : (
              ladder.map((t) => {
                const share = totalPlayers > 0 ? (t.players / totalPlayers) * 100 : 0
                return (
                  <tr key={t.tierLevel} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 font-mono text-[11px] text-white/30">{t.tierLevel}</span>
                        <TierChip name={t.tierName} color={t.color} />
                      </span>
                    </Td>
                    <Td align="right" className="text-white/70">{fmt(t.minWager)}</Td>
                    <Td align="right" className="font-bold text-cyan-300">{bpsPct(t.rakebackBps)}</Td>
                    <Td align="right" className="text-white/70">{fmt(t.levelUpBonus)}</Td>
                    <Td align="right" className="font-bold text-white">{t.players.toLocaleString()}</Td>
                    <Td align="right" className="text-white/45">
                      <span className="inline-flex items-center gap-2">
                        <ProgressBar pct={share} color={t.color} />
                        {share.toFixed(1)}%
                      </span>
                    </Td>
                    <Td align="right" className="text-white/70">{fmt(t.wagered)}</Td>
                    <Td align="right" className="text-amber-300">{fmt(t.rakebackPaid)}</Td>
                    <Td align="right" className="text-amber-300/70">{fmt(t.bonusPaid)}</Td>
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

// ── Players on the ladder ────────────────────────────────────────────────────

function PlayersOnLadder({ rows }: { rows: VipPlayerRow[] }) {
  const [q, setQ] = useState('')
  const [tierFilter, setTierFilter] = useState<number | 'all'>('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const matched = rows.filter((r) => {
      if (tierFilter !== 'all' && r.tierLevel !== tierFilter) return false
      if (!needle) return true
      return (
        r.wallet.toLowerCase().includes(needle) ||
        (r.displayName ?? '').toLowerCase().includes(needle)
      )
    })
    // Max-tier players have wagerToNext = '0', which would sort them to the TOP
    // of an ascending distance sort as if they were one chip away. They have
    // nowhere left to climb, so sort them as infinitely far instead.
    return matched.map((r) => ({
      ...r,
      toNextSort: r.nextTierLevel === null ? MAX_TIER_SORT_SENTINEL : r.wagerToNext,
    }))
  }, [rows, q, tierFilter])

  // Default sort is ascending distance-to-next: whoever is closest to levelling
  // up — and to costing a higher rakeback rate — surfaces first.
  const { sorted, sort, onSort } = useSortedRows(
    filtered as unknown as Array<Record<string, unknown>>,
    { key: 'toNextSort', dir: 'asc' },
    ['lifetimeWager', 'toNextSort', 'rakebackPaid', 'bonusPaid', 'balance'],
  )
  const list = sorted as unknown as VipPlayerRow[]

  const tiers = useMemo(() => {
    const seen = new Map<number, { name: string; color: string }>()
    for (const r of rows) if (!seen.has(r.tierLevel)) seen.set(r.tierLevel, { name: r.tierName, color: r.color })
    return [...seen.entries()].sort((a, b) => a[0] - b[0])
  }, [rows])

  return (
    <Panel
      title="Players on the ladder"
      subtitle={`${rows.length.toLocaleString()} ranked · lifetime wager (all time — not the window above) · sorted by distance to next tier`}
      right={<TableSearch value={q} onChange={setQ} placeholder="Filter wallet or name…" />}
    >
      {tiers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setTierFilter('all')}
            className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              tierFilter === 'all'
                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                : 'border-white/10 text-white/45 hover:text-white'
            }`}
          >
            All tiers
          </button>
          {tiers.map(([level, t]) => (
            <button
              key={level}
              type="button"
              onClick={() => setTierFilter(tierFilter === level ? 'all' : level)}
              className="rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={
                tierFilter === level
                  ? { color: t.color, borderColor: `${t.color}66`, background: `${t.color}1f` }
                  : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.1)' }
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <TableScroll>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Tier</Th>
              <Th align="right" sortKey="lifetimeWager" sort={sort} onSort={onSort}>Lifetime wagered</Th>
              <Th align="right">Progress</Th>
              <Th align="right" sortKey="toNextSort" sort={sort} onSort={onSort}>To next tier</Th>
              <Th>Next</Th>
              <Th align="right" sortKey="rakebackPaid" sort={sort} onSort={onSort}>Rakeback paid</Th>
              <Th align="right" sortKey="bonusPaid" sort={sort} onSort={onSort}>Bonus paid</Th>
              <Th align="right" sortKey="balance" sort={sort} onSort={onSort}>Balance</Th>
              <Th align="right">Last play</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <EmptyRow colSpan={10}>No ranked players yet.</EmptyRow>
            ) : (
              list.map((p) => {
                const maxed = p.nextTierLevel === null
                return (
                  <tr key={p.wallet} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <Td><WalletCell wallet={p.wallet} displayName={p.displayName} /></Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <TierChip name={p.tierName} color={p.color} />
                        <span className="text-[10px] tabular-nums text-white/35">{bpsPct(p.rakebackBps)}</span>
                      </span>
                    </Td>
                    <Td align="right" className="text-white/70">{fmt(p.lifetimeWager)}</Td>
                    <Td align="right">
                      <span className="inline-flex items-center gap-2">
                        <ProgressBar pct={p.progressPct} color={p.color} />
                        <span className="w-10 text-right text-[11px] tabular-nums text-white/45">
                          {maxed ? '—' : `${p.progressPct.toFixed(0)}%`}
                        </span>
                      </span>
                    </Td>
                    <Td align="right" className={maxed ? 'text-white/25' : 'font-bold text-cyan-300'}>
                      {maxed ? 'Max tier' : fmtCompact(p.wagerToNext)}
                    </Td>
                    <Td className="text-white/45">{p.nextTierName ?? '—'}</Td>
                    <Td align="right" className="text-amber-300">{fmt(p.rakebackPaid)}</Td>
                    <Td align="right" className="text-amber-300/70">{fmt(p.bonusPaid)}</Td>
                    <Td align="right" className="text-white/60">{fmt(p.balance)}</Td>
                    <Td align="right" className="text-white/35">{timeAgo(p.lastPlayAt)}</Td>
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

// ── Tab ──────────────────────────────────────────────────────────────────────

export default function TiersPanel({
  data,
  isLoading,
}: {
  data:
    | {
        ladder: VipLadderRung[]
        players: VipPlayerRow[]
        totals: { players: number; rakebackPaid: string; bonusPaid: string }
      }
    | undefined
  isLoading: boolean
}) {
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/40">
        <Crown className="h-4 w-4 animate-pulse" />
        Loading the ladder…
      </div>
    )
  }

  const ladder = data?.ladder ?? []
  const players = data?.players ?? []
  const totals = data?.totals ?? { players: 0, rakebackPaid: '0', bonusPaid: '0' }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Ranked players</div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-white">
            {totals.players.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-white/40">have wagered at least once</div>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.10] to-transparent p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Rakeback paid</div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-amber-300">
            {fmt(totals.rakebackPaid)}
          </div>
          <div className="mt-1 text-xs text-white/40">lifetime, claimed</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Level-up bonuses paid</div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-amber-300/80">
            {fmt(totals.bonusPaid)}
          </div>
          <div className="mt-1 text-xs text-white/40">lifetime, claimed</div>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.10] to-transparent p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Top rung occupied</div>
          <div className="mt-1.5 text-2xl font-extrabold text-cyan-300">
            {[...ladder].reverse().find((t) => t.players > 0)?.tierName ?? '—'}
          </div>
          <div className="mt-1 text-xs text-white/40">highest tier with a player on it</div>
        </div>
      </div>

      <LadderTable ladder={ladder} totalPlayers={totals.players} />
      <PlayersOnLadder rows={players} />
    </div>
  )
}
