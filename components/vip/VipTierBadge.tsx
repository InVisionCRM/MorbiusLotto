'use client'

import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVipTier } from '@/hooks/use-vip-tier'

export type VipBadgeSize = 'xs' | 'sm' | 'md' | 'lg'

const PX: Record<VipBadgeSize, number> = { xs: 18, sm: 26, md: 40, lg: 64 }

/** Minimal tier shape this badge needs (works with VipTier and VipPublicTier). */
export interface VipBadgeTier {
  tierName: string
  color: string
  tierLevel?: number
}

/**
 * A polished, tier-coloured gem medallion. Self-contained visual — pass any tier
 * with a `color` + `tierName`. Used on the VIP page, the home promo, profiles,
 * and (via VipAvatarBadge) over player avatars in games.
 */
export function VipTierBadge({
  tier,
  size = 'md',
  className,
  title,
}: {
  tier: VipBadgeTier
  size?: VipBadgeSize
  className?: string
  title?: string
}) {
  const px = PX[size]
  const iconPx = Math.round(px * 0.54)
  const c = tier.color
  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{
        width: px,
        height: px,
        background: `radial-gradient(circle at 34% 26%, ${c} 0%, ${c} 42%, ${c}b3 100%)`,
        boxShadow: `inset 0 1px 1.5px rgba(255,255,255,0.55), inset 0 -2px 4px ${c}66, 0 2px 7px -1px ${c}99, 0 0 0 1.5px rgba(2,6,12,0.6)`,
      }}
      title={title ?? `${tier.tierName} VIP`}
      aria-label={`${tier.tierName} VIP tier`}
    >
      <Crown style={{ width: iconPx, height: iconPx }} className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
      {/* glossy highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle at 32% 20%, rgba(255,255,255,0.55), transparent 46%)' }}
      />
    </div>
  )
}

/**
 * Drop-in badge for a player's avatar in games. Looks up the wallet's tier and
 * pins a small gem to the avatar's bottom-right. Renders nothing for Unranked
 * (tier 0) or unknown wallets, so it's safe to place on every seat.
 *
 * The parent element must be `position: relative` (every seat avatar wrapper is).
 */
export function VipAvatarBadge({
  address,
  size = 'xs',
  className,
}: {
  address?: string | null
  size?: VipBadgeSize
  className?: string
}) {
  const { data: tier } = useVipTier(address)
  if (!tier || tier.tierLevel <= 0) return null
  return (
    <div className={cn('pointer-events-none absolute -bottom-1 -right-1 z-20', className)}>
      <VipTierBadge tier={tier} size={size} />
    </div>
  )
}
