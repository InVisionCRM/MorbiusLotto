'use client'

import Link from 'next/link'
import Image from 'next/image'
import { HomeHeader } from '@/components/home/header'
import { HeroSection } from '@/components/home/hero-section'
import { LatestWins } from '@/components/home/latest-wins'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { GlobalStatsSection } from '@/components/home/global-stats-section'
import { GlobalMetricsCharts } from '@/components/home/global-metrics-charts'
import { AcesParallaxSection } from '@/components/home/aces-parallax-section'
import { GamesSection } from '@/components/home/games-section'
import { RoadMap } from '@/components/home/RoadMap'
import { TokenomicsSection } from '@/components/home/tokenomics-section'
import { SocialsSection } from '@/components/home/socials-section'
import { MorbItSection } from '@/components/home/morbit-section'
import { PulseChainSection } from '@/components/home/pulsechain-section'
import Footer from '@/components/PLINKO/Footer'

const RESPONSIBLE_GAMING_ITEMS = [
  'Self-exclusion and cool-off options so you can voluntarily step away for a set period.',
  'Session time visibility so you can see how long you’ve been playing.',
  'Easy withdrawals: withdraw your balance anytime from the game menu or by clicking reserve balance.',
  'No credit—play only with what you deposit; no borrowing or chasing losses.',
  'Clear access to responsible gaming tools and info from every game (e.g. Responsible Gaming button in chat).',
]

export default function Page() {
  return (
    <div className="min-h-screen text-white bg-black flex flex-col items-center">
      {/* Main nav with dropdown (wallet, hamburger menu, Home, games, etc.) */}
      <HomeHeader />
      {/* Hero with background image and logo */}
      <HeroSection />
      <div className="w-full flex flex-col items-center py-12 px-4 gap-y-20 md:gap-y-24">
      {/* Chat (left) + Latest Wins (right): 2-col on desktop, stacked on mobile (chat first, then latest wins) */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="min-h-[280px] order-1">
          <ChatPanel
            roomId="main"
            title="Lobby Chat"
            collapsible={false}
            className="h-full"
          />
        </div>
        <div className="order-2">
          <LatestWins />
        </div>
      </div>

      {/* Aces parallax: slide in then out */}
      <AcesParallaxSection />

      {/* Games: Lottery, Keno, Plinko, Blackjack, etc. */}
      <GamesSection />

      {/* Platform stats: Blackjack + Plinko, Keno, Lottery, Big Wheel */}
      <GlobalStatsSection />

      {/* Global metrics: 3-col area charts (volume, games, avg bet) */}
      <GlobalMetricsCharts />

      {/* Roadmap: Tournaments, Slot Machines, Texas Hold'em, Sponsorship */}
      <RoadMap />
      <section className="w-full max-w-2xl space-y-8" style={{ display: 'none' }}>
        <div className="text-center mb-6">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
            Blackjack Tournaments
          </h2>
          <p className="text-white/50 text-sm">
            Enter now — fully automated, verifiable, and built for communities.
          </p>
        </div>
        <Link
          href="/BLACKJACK"
          className="block rounded-2xl overflow-hidden border-2 border-cyan-500/30 hover:border-cyan-400/50 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Go to Blackjack tournaments"
        >
          <div className="relative w-full aspect-[3/2] max-h-[320px]">
            <Image
              src="/BlackJack/Tournament-Promo/EnterNow.jpg"
              alt="Blackjack Tournament — Enter Now"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
              priority={false}
            />
          </div>
        </Link>
        <div className="mt-6 rounded-2xl border border-cyan-500/30 p-6 space-y-4 bg-gradient-to-br from-slate-900/90 to-slate-800/80 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)]">
          <p className="text-white/90 text-sm leading-relaxed">
            We give founders and communities an extra tool to keep engagement high and curate events that matter. Add your own images and branding so your tournaments keep your community’s identity front and center — and stay number one when it counts.
          </p>
          <p className="text-white/90 text-sm leading-relaxed">
            Everything runs fully automated with verifiable, on-chain proof. That means you can host with confidence: not just one tournament, but many more to come.
          </p>
          <p className="text-cyan-300/90 text-sm font-medium">
            Coming soon: use your own token as prizes. Same automation, same verifiable proof — your token, your rules.
          </p>
        </div>
      </section>

      {/* Responsible Gaming Section */}
      <section className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
            Responsible Gaming
          </h2>
          <p className="text-white/50 text-sm">
            We give you the tools to play responsibly and step away when you need to.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 p-6 space-y-4 bg-gradient-to-br from-slate-900/90 to-slate-800/80 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)]">
          <p className="text-white/90 text-sm leading-relaxed">
            We focus on meeting responsible gaming standards and making sure you have everything you need to pull back from the games whenever you want. Here’s what we offer:
          </p>
          <ul className="space-y-3 text-left">
            {RESPONSIBLE_GAMING_ITEMS.map((item, i) => (
              <li key={i} className="flex gap-2 text-white/90 text-sm">
                <span className="text-cyan-400/90 shrink-0 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tokenomics */}
      <TokenomicsSection />

      {/* We Support PulseChain */}
      <PulseChainSection />

      {/* Socials */}
      <SocialsSection />

      {/* Morb-It */}
      <MorbItSection />

      <Footer />
      </div>
    </div>
  )
}
