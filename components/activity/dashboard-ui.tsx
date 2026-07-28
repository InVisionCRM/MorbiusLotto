'use client'

/**
 * Shared primitives for the admin financial dashboard (/activity).
 *
 * All money values arrive as whole-MORBIUS decimal strings (bigint-safe) — never
 * parse them to Number before formatting or large balances lose precision.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search } from 'lucide-react'

// ── money formatting ─────────────────────────────────────────────────────────

/** Full grouped number: "1,234,567". Precision-safe for huge balances. */
export function fmt(s: string | number | undefined | null): string {
  if (s == null) return '0'
  try {
    return BigInt(String(s)).toLocaleString('en-US')
  } catch {
    return String(s)
  }
}

/** Compact headline form: "12.4M", "461.2K". */
export function fmtCompact(s: string | number | undefined | null): string {
  if (s == null) return '0'
  let n: number
  try {
    n = Number(BigInt(String(s)))
  } catch {
    n = Number(s)
  }
  if (!Number.isFinite(n)) return String(s)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`
  return n.toLocaleString('en-US')
}

/** Compact with an explicit +/− sign. */
export function fmtSigned(s: string | number | undefined | null): string {
  const out = fmtCompact(s)
  return out.startsWith('-') ? out : `+${out}`
}

export function isNegative(s: string | number | undefined | null): boolean {
  return String(s ?? '0').trim().startsWith('-')
}

export function shortAddr(a: string | undefined | null): string {
  if (!a) return '—'
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/** "3m ago" / "4h ago" / "2d ago" — compact relative time. */
export function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function exactTime(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString('en-US') : '—'
}

// ── stat cards ───────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'good' | 'bad' | 'gold' | 'cyan'
  hint?: string
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'bad'
        ? 'text-rose-300'
        : tone === 'gold'
          ? 'text-amber-300'
          : tone === 'cyan'
            ? 'text-cyan-300'
            : 'text-white'
  const ring =
    tone === 'gold'
      ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/[0.10] to-transparent'
      : tone === 'cyan'
        ? 'border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.10] to-transparent'
        : 'border-white/10 bg-white/[0.02]'
  return (
    <div className={`rounded-2xl border p-4 ${ring}`} title={hint}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold tabular-nums sm:text-[26px] ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  )
}

/** A compact label/value line for dense metric strips. */
export function MetricLine({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'gold' | 'muted'
}) {
  const cls =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'bad'
        ? 'text-rose-300'
        : tone === 'gold'
          ? 'text-amber-300'
          : tone === 'muted'
            ? 'text-white/60'
            : 'text-white'
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-xs text-white/45">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}

// ── wallet cell ──────────────────────────────────────────────────────────────

export function WalletCell({
  wallet,
  displayName,
}: {
  wallet: string
  displayName?: string | null
}) {
  return (
    <Link
      href={`/player/${wallet}`}
      className="group flex min-w-0 flex-col leading-tight"
      title={wallet}
    >
      <span className="truncate text-sm font-semibold text-white group-hover:text-cyan-300">
        {displayName || shortAddr(wallet)}
      </span>
      <span className="truncate font-mono text-[10px] text-white/35">{shortAddr(wallet)}</span>
    </Link>
  )
}

export function TxLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return <span className="text-white/25">—</span>
  return (
    <a
      href={`https://scan.pulsechain.com/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-300/80 hover:text-cyan-300"
      title={hash}
    >
      {hash.slice(0, 8)}… <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    failed: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
    queued: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    broadcasting: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
    pending_confirmation: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  }
  const cls = map[status] ?? 'border-white/15 bg-white/5 text-white/60'
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── table shell ──────────────────────────────────────────────────────────────

export function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/40">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

/** Horizontally scrollable table wrapper — wide tables never break the page. */
export function TableScroll({ children, maxH = 'max-h-[560px]' }: { children: React.ReactNode; maxH?: string }) {
  return <div className={`${maxH} overflow-auto`}>{children}</div>
}

export function Th({
  children,
  align = 'left',
  sortKey,
  sort,
  onSort,
  className = '',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  sortKey?: string
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSort?: (key: string) => void
  className?: string
}) {
  const active = sortKey && sort?.key === sortKey
  const clickable = !!sortKey && !!onSort
  return (
    <th
      onClick={clickable ? () => onSort!(sortKey!) : undefined}
      className={`sticky top-0 z-10 whitespace-nowrap bg-[#0b0f18] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/45 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${clickable ? 'cursor-pointer select-none hover:text-white' : ''} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {children}
        {clickable &&
          (active ? (
            sort!.dir === 'desc' ? (
              <ArrowDown className="h-3 w-3 text-cyan-300" />
            ) : (
              <ArrowUp className="h-3 w-3 text-cyan-300" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-30" />
          ))}
      </span>
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-sm ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
    >
      {children}
    </td>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-white/35">
        {children}
      </td>
    </tr>
  )
}

/** Search box used above the data tables. */
export function TableSearch({
  value,
  onChange,
  placeholder = 'Filter…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
      <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-40 bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none sm:w-56"
      />
    </div>
  )
}

// ── sorting helper ───────────────────────────────────────────────────────────

export type SortState = { key: string; dir: 'asc' | 'desc' }

/**
 * Client-side sort over rows whose numeric columns are bigint-safe strings.
 * `numericKeys` are compared as BigInt so huge amounts stay exact.
 */
export function useSortedRows<T extends Record<string, unknown>>(
  rows: T[],
  initial: SortState,
  numericKeys: string[],
) {
  const [sort, setSort] = useState<SortState>(initial)
  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  const sorted = useMemo(() => {
    const num = new Set(numericKeys)
    const out = [...rows]
    out.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      let cmp = 0
      if (num.has(sort.key)) {
        try {
          const ab = BigInt(String(av ?? '0'))
          const bb = BigInt(String(bv ?? '0'))
          cmp = ab === bb ? 0 : ab > bb ? 1 : -1
        } catch {
          cmp = Number(av ?? 0) - Number(bv ?? 0)
        }
      } else if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''))
      }
      return sort.dir === 'desc' ? -cmp : cmp
    })
    return out
  }, [rows, sort, numericKeys])

  return { sorted, sort, onSort }
}

// ── 30-day trend bars (inline SVG — no chart dependency) ─────────────────────

export function TrendBars({
  data,
  height = 90,
}: {
  data: Array<{ day: string; ggr: string; wagered: string }>
  height?: number
}) {
  const series = useMemo(() => [...data].reverse(), [data]) // oldest → newest
  const max = useMemo(() => {
    let m = 1
    for (const d of series) {
      const v = Math.abs(Number(d.ggr))
      if (Number.isFinite(v) && v > m) m = v
    }
    return m
  }, [series])

  if (series.length === 0) {
    return <div className="py-8 text-center text-sm text-white/35">No history yet.</div>
  }

  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {series.map((d) => {
        const v = Number(d.ggr) || 0
        const pct = Math.max(2, (Math.abs(v) / max) * 100)
        const up = v >= 0
        return (
          <div
            key={d.day}
            className="group relative flex-1 rounded-t-sm transition-opacity hover:opacity-100"
            style={{
              height: `${pct}%`,
              minWidth: 4,
              background: up
                ? 'linear-gradient(180deg, rgba(52,211,153,.85), rgba(52,211,153,.25))'
                : 'linear-gradient(180deg, rgba(251,113,133,.85), rgba(251,113,133,.25))',
            }}
            title={`${d.day} · GGR ${fmtSigned(d.ggr)} · wagered ${fmtCompact(d.wagered)}`}
          />
        )
      })}
    </div>
  )
}
