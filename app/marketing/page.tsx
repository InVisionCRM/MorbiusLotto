ƒ'use client'

import { useState } from 'react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { CryptoPaymentPanel } from '@/components/marketing/CryptoPaymentPanel'
import { TableShowcaseDisplay } from '@/components/marketing/TableShowcaseDisplay'
import { PulseChainAiDisplay } from '@/components/marketing/PulseChainAiDisplay'
import { AdvertisingSection } from '@/components/marketing/AdvertisingSection'
import { CometCard } from '@/components/ui/comet-card'
import {
  Spade,
  Crown,
  Zap,
  Star,
  Clock,
  Palette,
  BadgeCheck,
  TrendingUp,
  Globe,
  MessagesSquare,
  ChevronRight,
  BarChart2,
  Trophy,
  Users,
  Megaphone,
  Tag,
  Layers,
} from 'lucide-react'

// ── Static data ───────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Spade,
    title: 'Custom Blackjack Table',
    description:
      'A fully branded game table built around your token — live on Morbius in 24 hours. Your design automatically extends to every new game we launch: Poker, Baccarat, and more.',
    accent: 'cyan',
    hoverImage: '/Marketing%20/Tables/WickTable.png',
    shineGradient: 'linear-gradient(105deg, transparent 10%, rgba(6,182,212,0.06) 35%, rgba(103,232,249,0.2) 50%, rgba(6,182,212,0.06) 65%, transparent 90%)',
  },
  {
    icon: Palette,
    title: 'TableProfile Card',
    description:
      'A dedicated token profile with your logo, socials, website links, contract address, and a custom description — displayed to every player on every table.',
    accent: 'violet',
    hoverImage: '/Marketing%20/Token%20Profile/LibertyTP.png',
    shineGradient: 'linear-gradient(105deg, transparent 10%, rgba(139,92,246,0.06) 35%, rgba(196,181,253,0.2) 50%, rgba(139,92,246,0.06) 65%, transparent 90%)',
  },
  {
    icon: Crown,
    title: 'Gold Badge on PulseChainAi.com',
    description:
      'Receive a verified GOLD badge, custom description, and a featured spot on the front page of PulseChainAi.Com.',
    accent: 'amber',
    hoverImage: '/Marketing%20/PulseChain-AI/PulseChainAiTopTokens.png',
    shineGradient: 'linear-gradient(105deg, transparent 10%, rgba(186,230,255,0.08) 35%, rgba(220,242,255,0.22) 50%, rgba(186,230,255,0.08) 65%, transparent 90%)',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Send Payment', body: 'Send exactly the PLS amount shown to our wallet on PulseChain.' },
  { step: '02', title: 'Share Your Brand', body: 'DM us your token address, logo, description, socials, and any color preferences.' },
  { step: '03', title: 'Go Live in 24 hrs', body: "Your custom table, TableProfile, and Gold Badge are live — we'll ping you when ready." },
]

const accentMap: Record<string, string> = {
  cyan:   'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400',
  violet: 'from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-400',
  amber:  'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
}

const iconBgMap: Record<string, string> = {
  cyan:   'bg-cyan-500/20 text-cyan-400',
  violet: 'bg-violet-500/20 text-violet-400',
  amber:  'bg-amber-500/20 text-amber-400',
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'marketing' | 'advertising'

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'marketing',   label: 'Marketing',   icon: Spade      },
    { id: 'advertising', label: 'Advertising', icon: BarChart2  },
  ]

  return (
    <div
      className="sticky top-0 z-30 flex justify-center px-4 py-3"
      style={{ background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div
        className="inline-flex gap-1 p-1 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={
                isActive
                  ? {
                      background: id === 'marketing'
                        ? 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(99,102,241,0.2))'
                        : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.12)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    }
                  : { color: '#64748b', border: '1px solid transparent' }
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Tournament Section ────────────────────────────────────────────────────────

function TournamentSection() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider mb-5"
            style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.35)', color: '#c4b5fd' }}
          >
            <Trophy className="w-3.5 h-3.5" />
            Coming Soon — Custom Tournaments
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Add Utility to Your Token{' '}
            <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              Overnight
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            We&apos;re launching fully branded custom tournaments on Morbius. As a table owner,
            you&apos;ll have the tools to run community events that drive real buy pressure,
            engagement, and exposure for your token.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              icon: Trophy,
              title: 'Prize Pools in Your Token',
              desc: 'Winners receive your token as rewards, incentivizing holders to compete and new players to acquire your token to join.',
              color: '#f59e0b',
              bg: 'rgba(245,158,11,0.1)',
              border: 'rgba(245,158,11,0.2)',
            },
            {
              icon: Users,
              title: 'Fully Branded Tournament Page',
              desc: 'Your logo, colors, and Token Profile front and center. Leaderboards, countdown timers, and live results all under your brand.',
              color: '#6366f1',
              bg: 'rgba(99,102,241,0.1)',
              border: 'rgba(99,102,241,0.2)',
            },
            {
              icon: Megaphone,
              title: 'Built-in Social Moment',
              desc: 'Tournament launches are natural marketing events. Perfect for project announcements, AMAs, and community milestones.',
              color: '#ec4899',
              bg: 'rgba(236,72,153,0.1)',
              border: 'rgba(236,72,153,0.2)',
            },
          ].map(({ icon: Icon, title, desc, color, bg, border }) => (
            <div key={title} className="p-5 rounded-2xl"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${bg.replace('0.1', '0.2')}` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [tab, setTab] = useState<Tab>('marketing')
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null)

  return (
    <GlobalMainNav>
      <div
        className="min-h-screen text-slate-100"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2,6,23,0.93), rgba(5,10,30,0.96)), url('/BlackJack/TableBackground3.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <TabBar active={tab} onChange={setTab} />

        {/* ════════════════════════════════════════════════════════════════════
            MARKETING TAB
        ════════════════════════════════════════════════════════════════════ */}
        {tab === 'marketing' && (
          <>
            {/* ── Hero ───────────────────────────────────────────────────── */}
            <section className="relative w-full py-20 px-4 text-center overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[600px] h-[300px] rounded-full bg-cyan-500/10 blur-[120px]" />
              </div>

              <div className="relative z-10 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-4">
                  <Zap className="w-3.5 h-3.5" />
                  Custom Blackjack Tables &mdash; Limited Spots
                </div>

                {/* Limited time sale badge */}
                <div className="flex justify-center mb-6">
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))',
                      border: '1px solid rgba(239,68,68,0.4)',
                    }}
                  >
                    <Tag className="w-4 h-4 text-red-400" />
                    <span className="text-red-300 font-black text-sm uppercase tracking-wide">
                      Limited Time — 50% Off All Packages!
                    </span>
                  </div>
                </div>

                <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-4">
                  <span className="block whitespace-nowrap">Bring Your Brand</span>
                  <span className="block whitespace-nowrap bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">To The Table</span>
                </h1>

                <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8 leading-relaxed">
                  Morbius builds a fully branded game table for your token — live in{' '}
                  <span className="text-white font-semibold">24 hours</span>, with a token profile,
                  Gold Badge, and your design auto-applied to every future game we launch.
                </p>

                <div className="flex flex-wrap justify-center gap-4">
                  <a
                    href="#payment"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base shadow-lg shadow-cyan-900/30 transition-all"
                  >
                    Get Started — $49
                    <span className="text-cyan-200/70 line-through text-sm font-normal">$99</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                  <a
                    href="#whats-included"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold text-base transition-all"
                  >
                    See What&apos;s Included
                  </a>
                </div>

                <div className="flex flex-wrap justify-center gap-6 mt-10 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-cyan-500" /> 24hr turnaround</span>
                  <span className="flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-amber-400" /> Gold Badge included</span>
                  <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-violet-400" /> Featured on the front page</span>
                  <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-green-400" /> All future games included</span>
                </div>
              </div>
            </section>

            {/* ── What's Included ────────────────────────────────────────── */}
            <section id="whats-included" className="py-16 px-4">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    Everything in the Package
                  </h2>
                  <p className="text-slate-400 text-lg">
                    One payment. Three powerful placements for your project.
                  </p>
                </div>

                <style>{`@keyframes cardShine { 0% { left: -60%; } 65%, 100% { left: 170%; } }`}</style>
                <div className="grid md:grid-cols-3 gap-4 md:gap-6">
                  {FEATURES.map(({ icon: Icon, title, description, accent, hoverImage, shineGradient }) => {
                    const isHovered = hoveredFeature === title
                    return (
                      <div key={title} style={{ position: 'relative', zIndex: isHovered ? 10 : 1 }}>
                        <CometCard>
                          <div
                            className={`relative rounded-2xl bg-gradient-to-br border ${accentMap[accent]} backdrop-blur-sm overflow-hidden cursor-default`}
                            onMouseEnter={() => setHoveredFeature(title)}
                            onMouseLeave={() => setHoveredFeature(null)}
                          >
                            {/* Hover image */}
                            <div
                              className="absolute inset-0 pointer-events-none"
                              style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.35s ease' }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={hoverImage} alt="" className="w-full h-full object-cover object-top" />
                            </div>
                            {/* Accent shine sweep */}
                            <div
                              className="absolute inset-y-0 pointer-events-none"
                              style={{
                                width: '45%',
                                background: shineGradient,
                                animation: 'cardShine 4s ease-in-out infinite',
                                zIndex: 5,
                              }}
                            />
                            {/* Card content */}
                            <div
                              className="relative z-10 p-4 md:p-6"
                              style={{ opacity: isHovered ? 0 : 1, transition: 'opacity 0.25s ease' }}
                            >
                              <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl flex items-center justify-center mb-3 md:mb-4 ${iconBgMap[accent]}`}>
                                <Icon className="w-5 h-5 md:w-6 md:h-6" />
                              </div>
                              <h3 className="text-sm md:text-lg font-bold text-white mb-1.5 md:mb-2">{title}</h3>
                              <p className="text-slate-400 text-xs md:text-sm leading-relaxed">{description}</p>
                            </div>
                          </div>
                        </CometCard>
                      </div>
                    )
                  })}
                </div>

                {/* Future games callout */}
                <div
                  className="mt-6 rounded-2xl p-5 flex items-center gap-4"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(6,182,212,0.06))',
                    border: '1px solid rgba(34,197,94,0.2)',
                  }}
                >
                  <Layers className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm mb-0.5">Grows With the Platform</p>
                    <p className="text-slate-400 text-sm">
                      Your custom table design automatically carries over to every new game Morbius launches —
                      <span className="text-white font-semibold"> Poker, Baccarat, and beyond</span>.
                      One setup, permanent presence across the entire casino.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Live Examples ───────────────────────────────────────────── */}
            <TableShowcaseDisplay />

            {/* ── TableProfile Preview ────────────────────────────────────── */}
            <section className="py-10 px-4">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Your TableProfile — Preview
                  </h2>
                  <p className="text-slate-400">
                    Every custom table gets a dedicated profile card. Here&apos;s an example:
                  </p>
                </div>
                <div className="flex justify-center">
                  <CometCard className="w-1/2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/Marketing%20/Token%20Profile/LBRTYtp.png"
                      alt="Example TableProfile card"
                      className="w-full rounded-2xl"
                    />
                  </CometCard>
                </div>
              </div>
            </section>

            {/* ── PulseChainAi Gold Badge callout ─────────────────────────── */}
            <section className="py-10 px-4">
              <div className="max-w-3xl mx-auto">
                <CometCard>
                  <div
                    className="rounded-2xl p-4 md:p-8 text-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(217,119,6,0.06) 100%)',
                      border: '1px solid rgba(245,158,11,0.25)',
                    }}
                  >
                    <Crown className="w-9 h-9 md:w-10 md:h-10 text-amber-400 mx-auto mb-3 md:mb-4" />
                    <h3 className="text-sm md:text-2xl font-bold text-white mb-1.5 md:mb-3">
                      Gold Badge on PulseChainAi.com
                    </h3>
                    <p className="text-xs md:text-base text-slate-300 leading-relaxed mb-3 md:mb-4">
                      Your project gets a <span className="text-amber-300 font-semibold">GOLD verified badge</span>,
                      a custom description, and a{' '}
                      <span className="text-amber-300 font-semibold">featured spot on the front page</span>{' '}
                      — putting your project in front of thousands of PulseChain users every day.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 md:gap-4 text-xs md:text-sm">
                      <span className="flex items-center gap-1 md:gap-1.5 text-amber-300">
                        <BadgeCheck className="w-3.5 h-3.5 md:w-4 md:h-4" /> GOLD Verified Badge
                      </span>
                      <span className="flex items-center gap-1 md:gap-1.5 text-amber-300">
                        <Globe className="w-3.5 h-3.5 md:w-4 md:h-4" /> Custom Token Description
                      </span>
                      <span className="flex items-center gap-1 md:gap-1.5 text-amber-300">
                        <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" /> Featured on the front page
                      </span>
                    </div>
                  </div>
                </CometCard>
              </div>
            </section>

            {/* ── PulseChainAi Standalone Display ─────────────────────────── */}
            <PulseChainAiDisplay />

            {/* ── Custom Tournaments (Coming Soon) ────────────────────────── */}
            <TournamentSection />

            {/* ── How It Works ────────────────────────────────────────────── */}
            <section className="py-12 px-4">
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-10">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">How It Works</h2>
                  <p className="text-slate-400">Simple. Fast. Done in 24 hours.</p>
                </div>

                <div className="space-y-4">
                  {HOW_IT_WORKS.map(({ step, title, body }) => (
                    <div
                      key={step}
                      className="flex gap-5 p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-sm"
                    >
                      <div className="text-3xl font-black text-cyan-500/40 leading-none shrink-0 w-12 text-right">
                        {step}
                      </div>
                      <div>
                        <h4 className="text-white font-bold mb-1">{title}</h4>
                        <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Payment Panel ────────────────────────────────────────────── */}
            <section id="payment" className="py-16 px-4">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-10">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Ready to Get Started?
                  </h2>
                  <p className="text-slate-400">
                    Send payment below, then reach out with your brand details.
                  </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-8 items-start">
                  {/* Left: summary */}
                  <div className="space-y-4">
                    <div
                      className="rounded-2xl p-6"
                      style={{
                        background: 'linear-gradient(135deg, rgba(10,15,30,0.9), rgba(15,20,45,0.9))',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }}
                    >
                      <h3 className="text-lg font-bold text-white mb-4">Package Summary</h3>
                      <ul className="space-y-3 text-sm">
                        {[
                          'Custom branded table on Morbius (Blackjack + all future games)',
                          'TableProfile card with logo, socials & contract',
                          'GOLD badge on PulseChainAi.com',
                          'Custom token description on PulseChainAi.com',
                          'Featured on the front page of PulseChainAi.com',
                          '24hr delivery guaranteed',
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-slate-300">
                            <BadgeCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between">
                        <span className="text-slate-400">One-time fee</span>
                        <div className="text-right">
                          <div className="flex items-baseline gap-2 justify-end">
                            <span className="text-2xl font-black text-white">$49 USD</span>
                            <span className="text-slate-600 line-through text-base">$99</span>
                          </div>
                          <p className="text-xs text-red-400 font-semibold">Limited time — 50% off!</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 text-right">Paid in PLS at live market rate</p>
                    </div>

                    {/* Contact */}
                    <div
                      className="rounded-2xl p-5"
                      style={{
                        background: 'rgba(15,25,50,0.7)',
                        border: '1px solid rgba(6,182,212,0.15)',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <MessagesSquare className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-semibold text-white">After payment, reach out on:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href="https://t.me/kylecruise"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 text-blue-300 text-sm transition-colors"
                        >
                          Telegram @kylecruise
                        </a>
                        <a
                          href="https://x.com/Morbius_io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-500/30 text-slate-300 text-sm transition-colors"
                        >
                          X @Morbius_io
                        </a>
                      </div>
                      <p className="text-xs text-slate-500 mt-3">
                        Include your tx hash + token address + brand details (logo, colors, description,
                        socials).
                      </p>
                    </div>
                  </div>

                  {/* Right: payment panel */}
                  <div>
                    <CryptoPaymentPanel />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            ADVERTISING TAB
        ════════════════════════════════════════════════════════════════════ */}
        {tab === 'advertising' && <AdvertisingSection />}

        <Footer />
      </div>
    </GlobalMainNav>
  )
}
