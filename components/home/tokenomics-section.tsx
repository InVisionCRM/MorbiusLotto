'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Flame, Network, PieChart } from 'lucide-react'

import { TokenomicsRouterBeamHub } from '@/components/home/tokenomics-router-beam'
import { AnimatedList } from '@/components/ui/animated-list'

/** Same hub-and-spoke beam; keeps older name for HMR/cache or stray references. */
const TokenomicsFlowBackground = TokenomicsRouterBeamHub
import { BentoCard, BentoGrid } from '@/components/ui/bento-grid'
import { Marquee } from '@/components/ui/marquee'
import { ShinyButton } from '@/components/ui/shiny-button'
import { cn } from '@/lib/utils'
import { homeSectionSubtitleClass, homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

const slideDownFadeIn = {
  hidden: { opacity: 0, y: -30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const slideDownHeaderContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
}

/** Decorative “live fee” copy for the Burns / pools bento (not on-chain data). */
const PAYOUT_FEED_ITEMS: { key: string; children: ReactNode }[] = [
  {
    key: 'payout-burn-1',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">1,526</span>
        <span className="text-white/78"> MORBIUS was sent to </span>
        <span className="font-mono text-[10px] text-cyan-200/80">0x0000…dEaD</span>
      </>
    ),
  },
  {
    key: 'payout-holders-1',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">3,574</span>
        <span className="text-white/78"> MORBIUS sent to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">HOLDER REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-lp-1',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">4,208</span>
        <span className="text-white/78"> MORBIUS sent to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">LP REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-platform-1',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">2,891</span>
        <span className="text-white/78"> MORBIUS sent to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">PLATFORM FEE</span>
      </>
    ),
  },
  {
    key: 'payout-burn-2',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">892</span>
        <span className="text-white/78"> MORBIUS routed to burn </span>
        <span className="font-mono text-[10px] text-cyan-200/80">0xdEaD…0000</span>
      </>
    ),
  },
  {
    key: 'payout-holders-2',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">8,120</span>
        <span className="text-white/78"> MORBIUS allocated to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">HOLDER REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-lp-2',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">2,956</span>
        <span className="text-white/78"> MORBIUS routed to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">LP REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-platform-2',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">1,903</span>
        <span className="text-white/78"> MORBIUS allocated as </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">PLATFORM FEE</span>
      </>
    ),
  },
  {
    key: 'payout-burn-3',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">2,104</span>
        <span className="text-white/78"> MORBIUS burned → </span>
        <span className="font-mono text-[10px] text-cyan-200/80">0x0000…0000</span>
      </>
    ),
  },
  {
    key: 'payout-holders-3',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">6,903</span>
        <span className="text-white/78"> MORBIUS deposited to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">HOLDER REWARDS</span>
        <span className="text-white/78"> pool</span>
      </>
    ),
  },
  {
    key: 'payout-lp-3',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">5,611</span>
        <span className="text-white/78"> MORBIUS split to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">LP REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-platform-3',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">5,220</span>
        <span className="text-white/78"> MORBIUS routed to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">PLATFORM FEE</span>
      </>
    ),
  },
  {
    key: 'payout-burn-4',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">441</span>
        <span className="text-white/78"> MORBIUS sent to </span>
        <span className="font-mono text-[10px] text-cyan-200/80">0x0000…bEEF</span>
      </>
    ),
  },
  {
    key: 'payout-holders-4',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">1,288</span>
        <span className="text-white/78"> MORBIUS credited to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">HOLDER REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-lp-4',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">3,007</span>
        <span className="text-white/78"> MORBIUS accrued to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">LP REWARDS</span>
      </>
    ),
  },
  {
    key: 'payout-platform-4',
    children: (
      <>
        <span className="font-semibold tabular-nums text-cyan-300">7,442</span>
        <span className="text-white/78"> MORBIUS sent to </span>
        <span className="font-semibold tracking-wide text-cyan-200/95">PLATFORM FEE</span>
        <span className="text-white/78"> vault</span>
      </>
    ),
  },
]

const payoutFeedCardClass =
  'mx-auto w-[min(100%,320px)] rounded-lg border border-cyan-400/35 px-3 py-2.5 text-left text-[11px] leading-snug backdrop-blur-md'

const payoutFeedCardStyle = {
  background: 'linear-gradient(145deg, rgba(34, 211, 238, 0.1), rgba(15, 23, 42, 0.78))',
  boxShadow:
    'inset 0 1px 0 rgba(34, 211, 238, 0.16), inset 0 -2px 8px rgba(0,0,0,0.55), 0 2px 14px rgba(0,0,0,0.4)',
} as const

const feeStreams = [
  {
    name: 'Distribution',
    body: '1.25% of wagers and withdrawals goes to MORBIUS holders via the holder reward pool.',
  },
  {
    name: 'Burn',
    body: '0.5% is sent to the burn address — permanent supply reduction on every eligible action.',
  },
  {
    name: 'Platform',
    body: '1.75% funds operations, infrastructure, and ongoing development of the suite.',
  },
  {
    name: 'LP rewards',
    body: '1.5% flows to liquidity providers, weighted by MORBIUS depth in each pair.',
  },
  {
    name: '5% total',
    body: 'One transparent fee curve across casino-style games: predictable for players, sustainable for the protocol.',
  },
]

/** Static miniature of `app/claim/page.tsx` hero + tabs + analytics strip (decorative). */
function ClaimPageMiniSnapshot({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 top-6 w-[min(100%,252px)] -translate-x-1/2 origin-top scale-[0.88] transition-transform duration-300 ease-out group-hover:scale-[0.94]',
        className
      )}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050a12] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(34,211,238,0.35) 1px, transparent 0)`,
            backgroundSize: '10px 10px',
          }}
        />
        <div className="relative space-y-2 px-2.5 pb-2.5 pt-3 font-poppins">
          <p className="text-center text-[8px] leading-snug text-white/85">
            Own part of the house just by holding MORBIUS or providing liquidity!
          </p>
          <p className="text-center text-[7px] leading-snug text-white/55">
            MORBIUS holders earn <span className="font-semibold text-cyan-400">1.25%</span> of game payouts. LP providers earn{' '}
            <span className="font-semibold text-purple-400">1.5%</span>.
          </p>
          <div className="flex gap-0.5 rounded-2xl border border-white/10 bg-white/5 p-1">
            <div className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 py-1.5 text-center text-[6px] font-semibold text-white shadow-md shadow-indigo-900/40">
              Analytics
            </div>
            <div className="flex-1 rounded-xl py-1.5 text-center text-[6px] font-semibold text-white/35">Legacy</div>
            <div className="flex-1 rounded-xl py-1.5 text-center text-[6px] font-semibold text-white/35">LP</div>
            <div className="flex-1 rounded-xl py-1.5 text-center text-[6px] font-semibold text-white/35">Rewards</div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-indigo-500/15 bg-black/20 px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[7px] font-semibold uppercase tracking-wide text-cyan-400">MORBIUS</span>
              <span className="text-[9px] font-bold text-white">$0.0124</span>
              <span className="text-[8px] font-bold text-green-400">+2.1%</span>
              <span className="text-[8px] font-bold text-white/80">$1.2M</span>
              <span className="text-[6px] text-cyan-400/90">liq</span>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-black/25 px-2 py-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[6px] font-semibold uppercase tracking-wide text-white/65">Holder Rewards</span>
              <span className="text-[6px] font-medium text-cyan-500/90">Claim →</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: 'Reward Pool', value: '12.4M', color: 'text-cyan-400' },
                { label: 'Distributed', value: '8.1M', color: 'text-white' },
                { label: 'Claimable', value: '—', color: 'text-cyan-400' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-emerald-500/10 bg-slate-800/25 px-1 py-1 text-center"
                >
                  <div className="text-[5px] uppercase tracking-wide text-white/30">{s.label}</div>
                  <div className={cn('text-[8px] font-bold', s.color)}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const bentoFeatures = [
  {
    Icon: PieChart,
    name: 'Where every wager goes',
    description:
      '5% total on eligible wagers and withdrawals — split across holders, burn, platform, and LP incentives.',
    className: 'col-span-3 lg:col-span-1',
    background: (
      <Marquee
        pauseOnHover
        fadeEdges="medium"
        className="absolute top-8 [--duration:24s]"
      >
        {feeStreams.map((f, idx) => (
          <figure
            key={idx}
            className={cn(
              'relative w-[9.75rem] shrink-0 cursor-default overflow-hidden rounded-xl border-2 p-3.5 backdrop-blur-md',
              'border-cyan-400/40 bg-gradient-to-br from-cyan-400/18 via-slate-900/45 to-slate-950/70',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-8px_24px_rgba(34,211,238,0.07),0_4px_16px_rgba(0,0,0,0.5)]',
              'ring-1 ring-inset ring-cyan-300/18',
              'transform-gpu transition-colors duration-200 hover:border-cyan-300/65'
            )}
          >
            <figcaption className="text-xs font-bold tracking-wide text-cyan-300">{f.name}</figcaption>
            <blockquote className="mt-2 text-[11px] leading-snug text-white/92">{f.body}</blockquote>
          </figure>
        ))}
      </Marquee>
    ),
  },
  {
    Icon: Flame,
    name: 'Burns, pools, and payouts',
    description:
      'Eligible wagers and withdrawals split across holder rewards, LP incentives, platform fee, and burn.',
    className: 'col-span-3 lg:col-span-2',
    background: (
      <div className="absolute top-4 right-0 h-[280px] w-full [mask-image:linear-gradient(to_top,transparent_8%,#000_100%)]">
        <AnimatedList className="absolute inset-x-0 top-0 gap-3" delay={900} loop>
          {PAYOUT_FEED_ITEMS.map(({ key, children }) => (
            <div key={key} className={payoutFeedCardClass} style={payoutFeedCardStyle}>
              {children}
            </div>
          ))}
        </AnimatedList>
      </div>
    ),
  },
  {
    Icon: Network,
    name: 'New Game, New Opportunity',
    description:
      'Any time a new game is deployed on MORBIUS.io, it will retain the same fee structure and result in more fee generation.',
    className: 'col-span-3 lg:col-span-2',
    background: (
      <TokenomicsFlowBackground className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_top,transparent_12%,#000_100%)] transition-transform duration-300 ease-out group-hover:scale-[1.02]" />
    ),
  },
  {
    Icon: CalendarDays,
    name: 'Claims on your schedule',
    description:
      'Nothing is airdropped automatically — open Claims when you want to collect MORBIUS and see holder and LP stats.',
    className: 'col-span-3 lg:col-span-1',
    background: (
      <div className="absolute inset-0 [mask-image:linear-gradient(to_top,transparent_30%,#000_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(34,211,238,0.12),transparent_55%)]" />
        <ClaimPageMiniSnapshot />
      </div>
    ),
  },
]

export function TokenomicsSection() {
  return (
    <section id="tokenomics" className="relative w-full overflow-hidden px-4 py-16 md:py-20">
      <div className="container relative z-10 mx-auto max-w-6xl">
        <motion.div
          className="mb-10 text-center md:mb-14"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={slideDownHeaderContainer}
        >
          <motion.h2 className={cn(homeSectionTitleClass, 'mb-3')} variants={slideDownFadeIn}>
            <span className="text-white">$Morbius </span>
            <span className={homeSectionTitleGradientClass}>TOKENOMICS</span>
          </motion.h2>
          <motion.p className={cn(homeSectionSubtitleClass, 'mx-auto mb-8 max-w-2xl')} variants={slideDownFadeIn}>
            Every game burns and earns $Morbius. Fees are transparent, on-chain, and routed through a single
            5% curve — then you choose when to claim.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={slideDownFadeIn}
        >
          <BentoGrid className="auto-rows-[minmax(20rem,22rem)] lg:auto-rows-[22rem]">
            {bentoFeatures.map((feature) => (
              <BentoCard key={feature.name} {...feature} className={feature.className} />
            ))}
          </BentoGrid>
        </motion.div>

        <motion.div
          className="mt-12 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={slideDownFadeIn}
        >
          <ShinyButton
            href="/claim"
            className="min-h-[3.25rem] border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-purple-600/15 px-12 py-4 text-lg [--primary:rgb(34,211,238)] sm:min-h-[3.5rem] sm:px-14 sm:py-5 sm:text-xl"
          >
            Claim your rewards
          </ShinyButton>
        </motion.div>
      </div>
    </section>
  )
}
