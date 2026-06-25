'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Crown, ArrowRight, Percent, Gift, Sparkles, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VipTierBadge } from '@/components/vip/VipTierBadge'
import {
  homeSectionTitleClass,
  homeSectionSubtitleClass,
} from '@/lib/home-section-typography'

interface PromoTier {
  tierLevel: number
  tierName: string
  color: string
  rakebackBps: number
}

/** Matches the seeded ladder — used until the live /api/vip/config responds. */
const FALLBACK_TIERS: PromoTier[] = [
  { tierLevel: 1, tierName: 'Bronze', color: '#cd7f32', rakebackBps: 5 },
  { tierLevel: 2, tierName: 'Silver', color: '#c0c0c0', rakebackBps: 8 },
  { tierLevel: 3, tierName: 'Gold', color: '#f5c542', rakebackBps: 12 },
  { tierLevel: 4, tierName: 'Platinum', color: '#5fd0c5', rakebackBps: 16 },
  { tierLevel: 5, tierName: 'Diamond', color: '#5ea0ff', rakebackBps: 20 },
  { tierLevel: 6, tierName: 'Obsidian', color: '#7c5cff', rakebackBps: 25 },
]

const BENEFITS = [
  { icon: Percent, text: 'Rakeback on every bet — win or lose' },
  { icon: Gift, text: 'One-time MORBIUS bonus each time you rank up' },
  { icon: Sparkles, text: 'Claim instantly to chips, anytime' },
  { icon: ShieldCheck, text: 'Your tier badge shows at the tables' },
]

export function VipClubSection() {
  const [tiers, setTiers] = useState<PromoTier[]>(FALLBACK_TIERS)

  useEffect(() => {
    let active = true
    fetch('/api/vip/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const live: PromoTier[] = Array.isArray(data?.tiers)
          ? data.tiers
              .filter((t: PromoTier) => t.tierLevel > 0)
              .map((t: PromoTier) => ({
                tierLevel: t.tierLevel,
                tierName: t.tierName,
                color: t.color,
                rakebackBps: t.rakebackBps,
              }))
          : []
        if (active && live.length > 0) setTiers(live)
      })
      .catch(() => {
        /* keep fallback — this is a promo, it should always look complete */
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="relative w-full max-w-6xl px-4">
      <div className="mb-10 text-center">
        <h2 className={cn(homeSectionTitleClass, 'text-white')}>VIP Club</h2>
        <p className={homeSectionSubtitleClass}>
          Every bet earns you back. Climb the tiers, unlock bonuses, and claim rakeback in MORBIUS.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Pitch + benefits + CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8"
          style={{
            background:
              'radial-gradient(120% 130% at 0% 0%, rgba(245,197,66,0.14), transparent 55%), linear-gradient(140deg, rgba(20,24,34,0.9), rgba(10,14,22,0.85))',
          }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">
            <Crown className="h-3.5 w-3.5" /> VIP Rewards
          </div>

          <h3 className="mt-4 text-2xl font-bold text-white sm:text-3xl">Get paid to play</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300/80">
            Wagering on any MORBIUS game builds your lifetime total — that sets your tier and earns you a slice
            of every bet back as rakeback. The higher you climb, the more you earn.
          </p>

          <ul className="mt-5 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-2.5 text-sm text-slate-200/85">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10 text-yellow-300">
                  <b.icon className="h-3.5 w-3.5" />
                </span>
                {b.text}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/vip"
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-[13px] font-bold text-[#1a1208] shadow-[0_10px_30px_-10px_rgba(245,197,66,0.7)] transition-colors hover:bg-yellow-300"
            >
              Explore the VIP Club <ArrowRight size={15} />
            </Link>
            <Link
              href="/vip/guide"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-[13px] font-bold text-slate-200 transition-colors hover:border-yellow-400/50 hover:text-white"
            >
              How it works
            </Link>
          </div>
        </motion.div>

        {/* Tier ladder preview */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
        >
          <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            The tier ladder
          </div>
          <div className="space-y-2">
            {tiers.map((t) => (
              <div
                key={t.tierLevel}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <VipTierBadge tier={t} size="md" />
                <span className="flex-1 font-semibold text-white">{t.tierName}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: t.color }}>
                  {(t.rakebackBps / 100).toFixed(2)}%
                </span>
                <span className="text-[10px] uppercase tracking-wide text-white/35">rakeback</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
