'use client'

import { useState } from 'react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { useAuth } from '@/hooks/use-auth'
import { LoginModal } from '@/components/auth/LoginModal'
import { HeroSection } from '@/components/home/hero-section'
import { LatestWins } from '@/components/home/latest-wins'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { GamesSection } from '@/components/home/games-section'
import { RoadMap } from '@/components/home/RoadMap'
import { SocialsSection } from '@/components/home/socials-section'
import { TokenomicsSection } from '@/components/home/tokenomics-section'
import { ResponsibleGamingSection } from '@/components/home/responsible-gaming-section'
import { MorbiusInfoSection } from '@/components/home/morbius-info-section'
import { PulseChainSection } from '@/components/home/pulsechain-section'
import { MorbItSection } from '@/components/home/morbit-section'
import Footer from '@/components/PLINKO/Footer'
import { Theme } from '@/lib/theme'

export default function HomePage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const { address, isAuthenticated, signIn, signOut, isSigning } = useAuth()

  return (
    <GlobalMainNav
      page="home"
      onOpenAuthModal={() => setLoginOpen(true)}
      isAuthenticated={isAuthenticated}
      onSignOut={signOut}
    >
      <div className="min-h-screen text-white flex flex-col items-center relative pt-4 md:pt-2" style={{ background: Theme.greyGradient.background }}>
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
      <HeroSection />

      <div className="w-full flex flex-col items-center gap-y-16 py-8 px-4">
        {/* Chat (left) + Latest Wins (right): 2-col on desktop, stacked on mobile; equal row height so no odd gap */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch min-h-0">
          <div className="min-h-[320px] md:min-h-[420px] order-1 flex flex-col min-w-0">
            <ChatPanel
              roomId="main"
              title="Lobby Chat"
              collapsible={false}
              className="h-full min-h-0 flex-1"
            />
          </div>
          <div className="order-2 flex flex-col min-h-[320px] md:min-h-[420px] min-w-0">
            <LatestWins />
          </div>
        </div>

        {/* Games: Lottery, Keno, Plinko, Blackjack, etc. */}
        <GamesSection />

        {/* Roadmap: Tournaments, Slot Machines, Texas Hold'em, Sponsorship */}
        <RoadMap />

        {/* Responsible Gaming Section */}
        <ResponsibleGamingSection />

        {/* Morbius Token Info (DexScreener) */}
        <MorbiusInfoSection />

        {/* Tokenomics Section */}
        <TokenomicsSection />

        {/* We Support PulseChain! Section */}
        <PulseChainSection />

        {/* Socials Section */}
        <SocialsSection />

        {/* Morb-It Section */}
        <MorbItSection />

        {/* Footer */}
        <Footer />
      </div>
    </div>

      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSignIn={signIn}
        isSigning={isSigning}
        address={address}
      />
    </GlobalMainNav>
  )
}
