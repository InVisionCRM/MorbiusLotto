'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useVipTier } from '@/hooks/use-vip-tier'
import { useVipTiers } from '@/hooks/use-vip-tiers'
import { VipTierBadge } from './VipTierBadge'

function fmtCompact(v: string | bigint): string {
  let n: number
  try {
    n = Number(typeof v === 'bigint' ? v : BigInt(v))
  } catch {
    return String(v)
  }
  if (n < 1000) return n.toLocaleString('en-US')
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/**
 * Compact VIP tier badge + progress-to-next-tier bar for a wallet. Uses the
 * public tier + ladder endpoints (no sign-in needed), links to /vip, and
 * renders nothing until a connected wallet's tier resolves. Used in the home
 * hero and the expanded main nav.
 */
export function VipTierProgress({
  address,
  className,
  compact = false,
}: {
  address?: string | null
  className?: string
  compact?: boolean
}) {
  const { data: tier } = useVipTier(address)
  const { data: tiers } = useVipTiers()

  if (!address || !tier) return null

  let lifetime = 0n
  try {
    lifetime = BigInt(tier.lifetimeWagerChips)
  } catch {
    /* keep 0 */
  }

  const sorted = (tiers ?? []).slice().sort((a, b) => a.tierLevel - b.tierLevel)
  const current = sorted.find((t) => t.tierLevel === tier.tierLevel) ?? null
  const next = sorted.find((t) => t.tierLevel === tier.tierLevel + 1) ?? null

  let pct = 100
  let toNext = 0n
  if (next && current) {
    try {
      const floor = BigInt(current.minLifetimeWagerChips)
      const ceil = BigInt(next.minLifetimeWagerChips)
      const span = ceil - floor
      const into = lifetime - floor
      toNext = ceil > lifetime ? ceil - lifetime : 0n
      pct = span > 0n ? Math.min(100, Math.max(0, Number((into * 10000n) / span) / 100)) : 0
    } catch {
      /* keep defaults */
    }
  }

  const color = tier.color

  return (
    <Link href="/vip" className={cn('group block', className)} aria-label={`VIP tier: ${tier.tierName}`}>
      <div className="flex items-center gap-2.5">
        <VipTierBadge
          tier={{ tierName: tier.tierName, color, tierLevel: tier.tierLevel }}
          size={compact ? 'sm' : 'md'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-bold uppercase tracking-wide" style={{ color }}>
              {tier.tierName}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/45">
              {next ? `${fmtCompact(toNext)} to ${next.tierName}` : 'Max tier'}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px -1px ${color}` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
