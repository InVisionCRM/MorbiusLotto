'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { StickyBanner } from '@/components/ui/sticky-banner'
import { useAuth } from '@/hooks/use-auth'
import { LoginModal } from '@/components/auth/LoginModal'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { HeroSection } from '@/components/home/hero-section'
import { BlackjackSection } from '@/components/home/blackjack-section'
import { GamesSection } from '@/components/home/games-section'
import { RoadMap } from '@/components/home/RoadMap'
import { SocialsSection } from '@/components/home/socials-section'
import { TokenomicsSection } from '@/components/home/tokenomics-section'
import { ResponsibleGamingSection } from '@/components/home/responsible-gaming-section'
import { MorbiusInfoSection } from '@/components/home/morbius-info-section'
import { PulseChainSection, PackageSummarySection } from '@/components/home/pulsechain-section'
import { TableShowcaseDisplay } from '@/components/marketing/TableShowcaseDisplay'
import { MorbItSection } from '@/components/home/morbit-section'
import Footer from '@/components/PLINKO/Footer'
import { Theme } from '@/lib/theme'

const TOUR_CARDS = [
  '/BlackJack/TourCards/TourCard1.png',
  '/BlackJack/TourCards/TourCard2.png',
  '/BlackJack/TourCards/TourCard3.png',
  '/BlackJack/TourCards/TourCard4.png',
  '/BlackJack/TourCards/TourCard5.png',
] as const

function SectionWithBg({ children, bgImage }: { children: React.ReactNode; bgImage: string }) {
  return (
    <div className="relative w-full">
      <Image
        src={bgImage}
        alt=""
        fill
        className="object-cover opacity-5 pointer-events-none select-none"
        sizes="100vw"
        loading="lazy"
        quality={60}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default function HomePage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false)
  const [playerProfileGame, setPlayerProfileGame] = useState<'all' | 'blackjack' | 'lottery' | 'keno' | 'plinko'>('all')
  const { address, isAuthenticated, signIn, signOut, isSigning } = useAuth()

  return (
    <GlobalMainNav
      page="home"
      onOpenAuthModal={() => setLoginOpen(true)}
      isAuthenticated={isAuthenticated}
      onSignOut={signOut}
      onOpenPlayerProfile={address ? (game) => { setPlayerProfileGame(game ?? 'all'); setPlayerProfileOpen(true); } : undefined}
    >
      <div className="min-h-screen text-white flex flex-col items-center relative" style={{ background: Theme.greyGradient.background }}>
        <StickyBanner
          className="!min-h-0 py-1 px-3 bg-gradient-to-r from-cyan-400 via-cyan-300 to-cyan-400 text-black font-poppins text-xs font-medium tracking-wide"
          closeIconClassName="text-black"
        >
          The Morbius token analyzer has been redirected to{' '}
          <a
            href="https://scan.morbius.io"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-1 hover:opacity-80"
          >
            Scan.Morbius.io
          </a>
          .
        </StickyBanner>
        <style jsx global>{`
          ::-webkit-scrollbar {
            width: 4px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: linear-gradient(to bottom, transparent 0%, rgba(168, 85, 247, 0.5) 50%, rgb(6, 182, 212) 100%);
            border-radius: 2px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(to bottom, transparent 0%, rgba(168, 85, 247, 0.7) 50%, rgb(6, 182, 212) 100%);
          }
        `}</style>

        {/* Hero Section */}
      <div className="relative z-[1] w-full flex flex-col items-center">
      <HeroSection />

      {/* Games: Lottery, Keno, Plinko, Blackjack — right under hero */}
      <section className="w-full flex flex-col items-center">
        <GamesSection />
      </section>

      <div className="w-full flex flex-col items-center gap-y-0 py-8 px-4">
        {/* Blackjack Promo + Tournaments */}
        <SectionWithBg bgImage={TOUR_CARDS[1]}>
          <BlackjackSection />
        </SectionWithBg>

        {/* Morbius Token Info (DexScreener) — above Tokenomics */}
        <SectionWithBg bgImage={TOUR_CARDS[2]}>
          <MorbiusInfoSection />
        </SectionWithBg>

        {/* Tokenomics Section — What is Morbius? / Be the House! */}
        <SectionWithBg bgImage={TOUR_CARDS[3]}>
          <TokenomicsSection />
        </SectionWithBg>

        {/* Roadmap: Tournaments, Slot Machines, Texas Hold'em, Sponsorship */}
        <SectionWithBg bgImage={TOUR_CARDS[4]}>
          <RoadMap />
        </SectionWithBg>

        {/* Responsible Gaming Section */}
        <SectionWithBg bgImage={TOUR_CARDS[0]}>
          <ResponsibleGamingSection />
        </SectionWithBg>

        {/* Parallax: Bring Your Brand To The Table */}
        <SectionWithBg bgImage={TOUR_CARDS[1]}>
          <PulseChainSection />
        </SectionWithBg>

        {/* 3D table displays (right below parallax) */}
        <SectionWithBg bgImage={TOUR_CARDS[2]}>
          <TableShowcaseDisplay />
        </SectionWithBg>

        {/* Package summary card */}
        <SectionWithBg bgImage={TOUR_CARDS[3]}>
          <PackageSummarySection />
        </SectionWithBg>

        {/* Socials Section */}
        <SectionWithBg bgImage={TOUR_CARDS[4]}>
          <SocialsSection />
        </SectionWithBg>

        {/* Morb-It Section */}
        <SectionWithBg bgImage={TOUR_CARDS[0]}>
          <MorbItSection />
        </SectionWithBg>

        {/* Footer */}
        <Footer />
      </div>
      </div>
      </div>

      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSignIn={signIn}
        isSigning={isSigning}
        address={address}
      />
      <PlayerProfileModal
        isOpen={playerProfileOpen}
        onClose={() => setPlayerProfileOpen(false)}
        address={address ?? null}
        game={playerProfileGame}
      />
    </GlobalMainNav>
  )
}
