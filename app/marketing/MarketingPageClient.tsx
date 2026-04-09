'use client'

import { useState, useRef, useEffect } from 'react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { CryptoPaymentPanel } from '@/components/marketing/CryptoPaymentPanel'
import {
  BadgeCheck,
  Clock,
  Layers,
  Crown,
  Spade,
  Palette,
  MessagesSquare,
  ChevronDown,
  Zap,
} from 'lucide-react'
import Image from 'next/image'

// ── What's included ──────────────────────────────────────────────────────────
const DELIVERABLES = [
  {
    icon: Spade,
    label: 'Custom Blackjack Table',
    sub: 'Auto-extends to Poker, Baccarat & every future game',
    color: '#22d3ee',
  },
  {
    icon: Palette,
    label: 'Token Profile Card',
    sub: 'Logo, socials, contract — shown to every player',
    color: '#a78bfa',
  },
  {
    icon: Crown,
    label: 'Gold Badge on PulseChainAi.com',
    sub: 'Featured on the front page, GOLD verified badge',
    color: '#fbbf24',
  },
  {
    icon: Clock,
    label: '24-Hour Delivery',
    sub: 'Guaranteed turnaround once payment is confirmed',
    color: '#34d399',
  },
  {
    icon: Layers,
    label: 'Permanent Presence',
    sub: 'Every new Morbius game inherits your design automatically',
    color: '#f472b6',
  },
]

// ── Scroll-triggered animation hook ─────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ── Hero Section ──────────────────────────────────────────────────────────────
function HeroSection() {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-4 text-center">
      {/* Background table image */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/BlackJack/BrandedTable/Liberty.webp"
          alt=""
          fill
          className="object-cover object-center opacity-[0.18] scale-110"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060810] via-[#060810]/80 to-[#060810]" />
        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.12) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-8"
          style={{
            background: 'rgba(34,211,238,0.08)',
            border: '1px solid rgba(34,211,238,0.25)',
            color: '#67e8f9',
            opacity: ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <Zap className="w-3 h-3" />
          Get your token on the table
        </div>

        {/* Headline */}
        <h1
          className="font-black tracking-tight leading-none text-white mb-6"
          style={{
            fontSize: 'clamp(2.6rem, 8vw, 5.5rem)',
            opacity: ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
          }}
        >
          Bring Your Brand
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #22d3ee 0%, #818cf8 60%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            To The Table
          </span>
        </h1>

        {/* Sub */}
        <p
          className="text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed"
          style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
            opacity: ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s',
          }}
        >
          Morbius builds a fully branded game table for your token — live in{' '}
          <span className="text-white font-semibold">24 hours</span>, with a token profile,
          Gold Badge, and your design applied to every future game we launch.
        </p>

        {/* CTAs */}
        <div
          className="flex flex-wrap justify-center gap-3 mb-12"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s',
          }}
        >
          <a
            href="#payment"
            className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-bold text-white overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
              boxShadow: '0 0 32px rgba(6,182,212,0.3), 0 4px 16px rgba(0,0,0,0.4)',
              fontSize: '1rem',
            }}
          >
            <span className="relative z-10">Get Started — $49</span>
            <span className="relative z-10 line-through text-white/40 text-sm font-normal">$99</span>
            {/* Shine sweep */}
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)',
                transform: 'translateX(-100%)',
                transition: 'transform 0.5s ease',
              }}
            />
          </a>
          <a
            href="#info"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-slate-300 transition-colors hover:text-white"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '1rem',
            }}
          >
            See what&apos;s included
          </a>
        </div>

        {/* Trust bar */}
        <div
          className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm text-slate-500"
          style={{
            opacity: ready ? 1 : 0,
            transition: 'opacity 0.7s ease 0.45s',
          }}
        >
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-500/70" /> 24hr delivery</span>
          <span className="flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-amber-400/70" /> Gold Badge included</span>
          <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-violet-400/70" /> All future games included</span>
        </div>
      </div>

      {/* Scroll nudge */}
      <a
        href="#info"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-600 hover:text-slate-400 transition-colors"
        aria-label="Scroll down"
        style={{ animation: 'bounce 2s infinite' }}
      >
        <ChevronDown className="w-6 h-6" />
      </a>

      <style>{`@keyframes bounce { 0%,100%{transform:translate(-50%,0)} 50%{transform:translate(-50%,8px)} }`}</style>
    </section>
  )
}

// ── Info Section ──────────────────────────────────────────────────────────────
function InfoSection() {
  const { ref, inView } = useInView(0.1)

  return (
    <section id="info" className="relative py-24 px-4" ref={ref}>
      {/* Subtle divider glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-px h-32"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.3), transparent)' }}
      />

      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div
          className="text-center mb-16"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <h2 className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)' }}>
            Everything in the Package
          </h2>
          <p className="text-slate-400 text-lg">One payment. Three powerful placements for your project.</p>
        </div>

        {/* Deliverables list — horizontal on desktop, stacked on mobile */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {DELIVERABLES.map(({ icon: Icon, label, sub, color }, i) => (
            <div
              key={label}
              className="group relative rounded-2xl p-5 overflow-hidden cursor-default"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.55s ease ${i * 0.07 + 0.1}s, transform 0.55s ease ${i * 0.07 + 0.1}s`,
              }}
            >
              {/* hover glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `radial-gradient(ellipse at 30% 50%, ${color}15 0%, transparent 70%)` }}
              />
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${color}18` }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <p className="text-white font-bold text-sm mb-1">{label}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>

        {/* How it works — horizontal stepper */}
        <div
          className="rounded-2xl p-6 md:p-8"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.6s ease 0.45s, transform 0.6s ease 0.45s',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6">How it works</p>
          <div className="grid md:grid-cols-3 gap-6 md:gap-4">
            {[
              { n: '01', title: 'Send Payment', body: 'Send the exact PLS amount shown to our PulseChain wallet.' },
              { n: '02', title: 'Share Your Brand', body: 'DM us your token address, logo, description, socials, and color preferences.' },
              { n: '03', title: 'Go Live in 24h', body: "Your table, TableProfile, and Gold Badge go live — we'll ping you when ready." },
            ].map(({ n, title, body }, i) => (
              <div key={n} className="flex gap-4">
                <div
                  className="text-3xl font-black leading-none shrink-0 tabular-nums"
                  style={{ color: 'rgba(34,211,238,0.25)', width: '2.5rem', textAlign: 'right' }}
                >
                  {n}
                </div>
                <div>
                  <p className="text-white font-bold text-sm mb-1">{title}</p>
                  <p className="text-slate-500 text-xs leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Payment Section ───────────────────────────────────────────────────────────
function PaymentSection() {
  const { ref, inView } = useInView(0.1)

  return (
    <section id="payment" className="relative py-24 px-4" ref={ref}>
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-px h-32"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.35), transparent)' }}
      />

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div
          className="text-center mb-12"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <h2 className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)' }}>
            Ready to Get Started?
          </h2>
          <p className="text-slate-400 text-lg">Send payment, then reach out with your brand details.</p>
        </div>

        <div
          className="grid lg:grid-cols-2 gap-8 items-start"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.65s ease 0.1s, transform 0.65s ease 0.1s',
          }}
        >
          {/* Package summary */}
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Package summary</p>
              <ul className="space-y-2.5">
                {[
                  'Custom branded table (Blackjack + all future games)',
                  'Token Profile card with logo, socials & contract',
                  'GOLD badge on PulseChainAi.com',
                  'Custom token description on PulseChainAi.com',
                  'Featured on the front page of PulseChainAi.com',
                  '24hr delivery guaranteed',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <BadgeCheck className="w-4 h-4 text-green-400 shrink-0 mt-px" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Price */}
            <div
              className="pt-4 border-t flex items-center justify-between"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <span className="text-slate-500 text-sm">One-time fee</span>
              <div className="text-right">
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-2xl font-black text-white">$49 USD</span>
                  <span className="text-slate-600 line-through text-sm">$99</span>
                </div>
                <p className="text-xs text-red-400 font-semibold">50% off — limited time</p>
              </div>
            </div>

            {/* Contact */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)' }}
            >
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">After payment, reach out on:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://t.me/kylecruise"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}
                >
                  Telegram @kylecruise
                </a>
                <a
                  href="https://x.com/Morbius_io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                >
                  X @Morbius_io
                </a>
              </div>
              <p className="text-xs text-slate-600">Include tx hash + token address + brand details (logo, colors, description, socials).</p>
            </div>
          </div>

          {/* Payment panel */}
          <div>
            <CryptoPaymentPanel />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MarketingPageClient() {
  return (
    <GlobalMainNav>
      <div
        className="min-h-screen text-slate-100"
        style={{ background: '#060810' }}
      >
        <HeroSection />
        <InfoSection />
        <PaymentSection />
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
