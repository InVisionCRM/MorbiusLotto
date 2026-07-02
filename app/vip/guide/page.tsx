'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Coins, Percent, Gift, Sparkles, ShieldCheck, TrendingUp } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { VipTierBadge } from '@/components/vip/VipTierBadge'

interface GuideTier {
  tierLevel: number
  tierName: string
  color: string
  rakebackBps: number
  minLifetimeWagerChips: string
  levelUpBonusChips: string
}

const FALLBACK_TIERS: GuideTier[] = [
  { tierLevel: 1, tierName: 'Bronze', color: '#cd7f32', rakebackBps: 5, minLifetimeWagerChips: '10000', levelUpBonusChips: '10' },
  { tierLevel: 2, tierName: 'Silver', color: '#c0c0c0', rakebackBps: 8, minLifetimeWagerChips: '100000', levelUpBonusChips: '50' },
  { tierLevel: 3, tierName: 'Gold', color: '#f5c542', rakebackBps: 12, minLifetimeWagerChips: '500000', levelUpBonusChips: '250' },
  { tierLevel: 4, tierName: 'Platinum', color: '#5fd0c5', rakebackBps: 16, minLifetimeWagerChips: '2500000', levelUpBonusChips: '1500' },
  { tierLevel: 5, tierName: 'Diamond', color: '#5ea0ff', rakebackBps: 20, minLifetimeWagerChips: '10000000', levelUpBonusChips: '7500' },
  { tierLevel: 6, tierName: 'Obsidian', color: '#7c5cff', rakebackBps: 25, minLifetimeWagerChips: '50000000', levelUpBonusChips: '50000' },
]

function fmtCompact(v: string): string {
  let n: number
  try {
    n = Number(BigInt(v))
  } catch {
    return v
  }
  if (n < 1000) return n.toLocaleString('en-US')
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Does joining the VIP Club cost anything?',
    a: 'No. There is nothing to buy and nothing to opt into. Every wager you place automatically counts toward your tier — you are already in.',
  },
  {
    q: 'What counts as a wager?',
    a: 'Every bet you place on a MORBIUS house game — Plinko, Keno, Blackjack, Video Poker and the arcade games — adds to your lifetime wagered total, whether the bet wins or loses.',
  },
  {
    q: 'Do my tiers ever expire or reset?',
    a: 'No. Tier progress is based on your all-time lifetime wager, so once you reach a tier you keep it for good. Tiers never decay.',
  },
  {
    q: 'When can I claim my rakeback?',
    a: 'Whenever you like. Rakeback builds up as you play and sits in your VIP balance until you hit Claim — there is no minimum and no waiting period.',
  },
  {
    q: 'What currency are rewards paid in?',
    a: 'Everything is paid in MORBIUS chips (1 chip = 1 MORBIUS), credited straight to your balance the moment you claim.',
  },
  {
    q: 'Does rakeback depend on whether I win or lose?',
    a: 'Yes. Rakeback is your tier rate applied to your net losses — the amount you have lost since your last claim. Win and you keep your winnings; lose and the house pays part of it back. A winning stretch simply accrues nothing, and rakeback you have already claimed is never taken back.',
  },
]

const STEPS = [
  {
    icon: TrendingUp,
    title: 'Climb the tiers',
    body: 'Your lifetime wagered total — across every game — decides your tier. Cross a threshold and you rank up permanently.',
  },
  {
    icon: Percent,
    title: 'Get rakeback on your losses',
    body: 'From Bronze upward, a slice of every net loss comes back to you as rakeback — the higher your tier, the higher the rate. Win and you keep your winnings; lose and the house pays part of it back.',
  },
  {
    icon: Gift,
    title: 'Unlock level-up bonuses',
    body: 'Each new tier you reach pays a one-time MORBIUS bonus on top of your rakeback — bigger tiers, bigger bonuses.',
  },
  {
    icon: Sparkles,
    title: 'Claim anytime',
    body: 'Rakeback and bonuses collect in your VIP balance and pay out instantly to chips when you claim. No minimum, no lockup.',
  },
]

export default function VipGuidePage() {
  const [tiers, setTiers] = useState<GuideTier[]>(FALLBACK_TIERS)

  useEffect(() => {
    let active = true
    fetch('/api/vip/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const live: GuideTier[] = Array.isArray(data?.tiers)
          ? data.tiers.filter((t: GuideTier) => t.tierLevel > 0)
          : []
        if (active && live.length > 0) setTiers(live)
      })
      .catch(() => {
        /* keep fallback */
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full overflow-hidden">
        {/* midnight aurora bg (matches /vip) */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[#070a12]" />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(70% 50% at 50% -8%, rgba(245,197,66,0.12), transparent 60%),' +
              'radial-gradient(45% 45% at 12% 18%, rgba(124,92,255,0.14), transparent 60%),' +
              'radial-gradient(50% 45% at 88% 80%, rgba(94,160,255,0.14), transparent 62%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_55%,rgba(0,0,0,0.55))]" />

        <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
          <Link href="/vip" className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80">
            <ArrowLeft className="h-4 w-4" /> Back to VIP Club
          </Link>

          <h1 className="mt-5 text-3xl font-bold text-white sm:text-4xl">VIP Club Guide</h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/60">
            The MORBIUS VIP Club rewards you for playing. The more you wager, the higher your tier — and the
            bigger the slice of your losses the house pays back. Here's exactly how it works.
          </p>

          {/* The loop */}
          <h2 className="mt-10 text-lg font-bold text-white">How it works</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-yellow-300">
                  <s.icon className="h-4 w-4" />
                  <span className="text-sm font-semibold text-white">{s.title}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{s.body}</p>
              </div>
            ))}
          </div>

          {/* How tier is decided */}
          <h2 className="mt-12 text-lg font-bold text-white">How your tier is decided</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            There's a single number behind everything: your <strong className="text-white/80">lifetime wagered
            total</strong>, summed across every game you play. When that total reaches a tier's threshold, you
            move up — instantly and permanently. Tiers never decay, and there's nothing to claim or activate to
            rank up. All amounts are in MORBIUS chips (1 chip = 1 MORBIUS).
          </p>

          {/* Tier ladder table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-3 sm:px-4">Tier</th>
                  <th className="px-3 py-3 sm:px-4">Wager required</th>
                  <th className="px-3 py-3 sm:px-4">Rakeback</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Level-up bonus</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.tierLevel} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex items-center gap-2.5">
                        <VipTierBadge tier={t} size="sm" />
                        <span className="font-semibold text-white">{t.tierName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-white/70 sm:px-4">{fmtCompact(t.minLifetimeWagerChips)}</td>
                    <td className="px-3 py-3 font-semibold sm:px-4" style={{ color: t.color }}>
                      {(t.rakebackBps / 100).toFixed(2)}%
                    </td>
                    <td className="hidden px-3 py-3 text-white/70 sm:table-cell sm:px-4">
                      {BigInt(t.levelUpBonusChips || '0') > 0n ? `+${fmtCompact(t.levelUpBonusChips)} MORBIUS` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-white/35">
            Thresholds, rakeback rates and bonuses can be adjusted over time — the table above always reflects
            the live values.
          </p>

          {/* Rakeback */}
          <h2 className="mt-12 flex items-center gap-2 text-lg font-bold text-white">
            <Percent className="h-5 w-5 text-yellow-300" /> Rakeback
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Rakeback is a percentage of your net losses, paid back to you. From Bronze upward, a slice of every
            net loss comes back as rakeback — win and you keep your winnings; lose and the house pays part of
            it back. Your rate is set by your current tier and climbs as you rank up. Rakeback builds up in
            your VIP balance until you claim it, and a winning stretch simply accrues nothing — claimed
            rakeback is never taken back.
          </p>

          {/* Level-up bonuses */}
          <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white">
            <Gift className="h-5 w-5 text-yellow-300" /> Level-up bonuses
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Every time you reach a new tier, you unlock a one-time MORBIUS bonus — a reward for crossing the
            line, separate from your ongoing rakeback. The higher the tier, the larger the bonus. Reach several
            tiers at once and the bonuses stack.
          </p>

          {/* Claiming */}
          <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white">
            <Sparkles className="h-5 w-5 text-yellow-300" /> Claiming your rewards
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Your rakeback and any pending level-up bonuses gather in your VIP balance. Hit{' '}
            <strong className="text-white/80">Claim</strong> on the{' '}
            <Link href="/vip" className="text-cyan-300 underline-offset-2 hover:underline">VIP page</Link>{' '}
            and they're credited to your chip balance instantly — there's no minimum and nothing locks up.
          </p>

          {/* Badges */}
          <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white">
            <ShieldCheck className="h-5 w-5 text-yellow-300" /> Your badge at the tables
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Your tier shows off, too. Once you rank up, your crest appears on your avatar at the poker and
            blackjack tables, so everyone can see your status while you play.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-5">
            {tiers.map((t) => (
              <div key={t.tierLevel} className="flex flex-col items-center gap-1.5">
                <VipTierBadge tier={t} size="lg" />
                <span className="text-xs font-medium" style={{ color: t.color }}>{t.tierName}</span>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <h2 className="mt-12 text-lg font-bold text-white">FAQ</h2>
          <div className="mt-4 space-y-3">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white">{f.q}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{f.a}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 flex items-center gap-3">
            <Link
              href="/vip"
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-[#1a1208] shadow-[0_10px_30px_-10px_rgba(245,197,66,0.7)] transition-colors hover:bg-yellow-300"
            >
              <Coins className="h-4 w-4" /> View your VIP status
            </Link>
          </div>
        </div>
      </div>
    </GlobalMainNav>
  )
}
