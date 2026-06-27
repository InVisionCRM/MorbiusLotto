'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { useVipTier } from '@/hooks/use-vip-tier'
import { VIP_BADGE_IMAGES } from '@/lib/vip-badge-assets'

export type VipBadgeSize = 'xs' | 'sm' | 'md' | 'lg'

const PX: Record<VipBadgeSize, number> = { xs: 20, sm: 30, md: 46, lg: 76 }
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const

/**
 * Minimum tier whose crest is shown over a player's avatar in games — kept to
 * higher tiers so the in-game badge stays a status symbol. (1 Bronze … 3 Gold
 * … 6 Obsidian.) The VIP page / guide still show every tier.
 */
const MIN_AVATAR_BADGE_TIER = 3

/** Minimal tier shape this badge needs (works with VipTier and VipPublicTier). */
export interface VipBadgeTier {
  tierName: string
  color: string
  tierLevel?: number
}

// ── tiny colour helpers (lighten/darken a hex toward white/black) ──
function clampHex(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
function shade(hex: string, p: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const f = (v: number) => clampHex(v + (p < 0 ? v : 255 - v) * p)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

/**
 * A heraldic-crest tier badge. Renders illustrated art from VIP_BADGE_IMAGES
 * when present, otherwise a self-contained crest SVG (shield + bevel + banner +
 * tier numeral + crowning gem), tinted to the tier's metal colour.
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
  const gid = useId().replace(/:/g, '')
  const [imgFailed, setImgFailed] = useState(false)
  const px = PX[size]
  const h = Math.round(px * 1.06)
  const c = tier.color
  const level = tier.tierLevel ?? 0
  const label = title ?? `${tier.tierName} VIP`
  const imgSrc = level > 0 ? VIP_BADGE_IMAGES[level] : undefined

  if (imgSrc && !imgFailed) {
    // Illustrated art is a square, circular medallion — render square.
    return (
      <img
        src={imgSrc}
        alt={label}
        title={label}
        width={px}
        height={px}
        className={cn('inline-block shrink-0 select-none object-contain', className)}
        onError={() => setImgFailed(true)}
        draggable={false}
      />
    )
  }

  const metal = `metal-${gid}`
  const sheen = `sheen-${gid}`

  return (
    <svg
      width={px}
      height={h}
      viewBox="0 0 100 106"
      className={cn('inline-block shrink-0 select-none', className)}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(c, 0.5)} />
          <stop offset="0.5" stopColor={c} />
          <stop offset="1" stopColor={shade(c, -0.46)} />
        </linearGradient>
        <radialGradient id={sheen} cx="0.35" cy="0.28" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* banner peeking behind the shield */}
      <path
        d="M4 30 L24 26 L24 44 L4 48 L12 39 Z M96 30 L76 26 L76 44 L96 48 L88 39 Z"
        fill={shade(c, -0.3)}
        stroke={shade(c, -0.5)}
        strokeWidth="1"
      />

      {/* shield body */}
      <path
        d="M22 16 L78 16 L78 54 C78 78 62 92 50 98 C38 92 22 78 22 54 Z"
        fill={`url(#${metal})`}
        stroke={shade(c, 0.55)}
        strokeWidth="2.5"
      />
      {/* inner bevel line */}
      <path
        d="M28 22 L72 22 L72 54 C72 74 60 84 50 89 C40 84 28 74 28 54 Z"
        fill="none"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="1.5"
      />
      {/* left-side gloss */}
      <path
        d="M22 16 L50 16 L50 98 C38 92 22 78 22 54 Z"
        fill={`url(#${sheen})`}
        opacity="0.16"
      />

      {/* tier numeral */}
      <text
        x="50"
        y="63"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="30"
        fill="#fff"
        opacity="0.96"
        style={{ paintOrder: 'stroke' }}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="0.8"
      >
        {ROMAN[level] || '★'}
      </text>

      {/* crowning gem */}
      <circle cx="50" cy="13" r="7.5" fill={shade(c, 0.42)} stroke={shade(c, -0.25)} strokeWidth="1.2" />
      <circle cx="47.5" cy="10.5" r="2.4" fill="#fff" opacity="0.65" />
    </svg>
  )
}

/**
 * Drop-in badge for a player's avatar in games. Looks up the wallet's tier and
 * pins the crest to the avatar's bottom-right. Renders nothing for Unranked
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
  if (!tier || tier.tierLevel < MIN_AVATAR_BADGE_TIER) return null
  return (
    <div className={cn('pointer-events-none absolute -bottom-1.5 -right-1.5 z-20 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]', className)}>
      <VipTierBadge tier={tier} size={size} />
    </div>
  )
}
