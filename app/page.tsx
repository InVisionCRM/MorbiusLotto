'use client'

import { HomeHeader } from '@/components/home/header'
import { HeroSection } from '@/components/home/hero-section'
import { GamesSection } from '@/components/home/games-section'
import { LatestWins } from '@/components/home/latest-wins'
import { SocialsSection } from '@/components/home/socials-section'
import { TokenomicsSection } from '@/components/home/tokenomics-section'
import { MorbItSection } from '@/components/home/morbit-section'
import Footer from '@/components/PLINKO/Footer'

export default function HomePage() {

  return (
    <div className="min-h-screen text-white bg-black relative">
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
      {/* Header */}
      <HomeHeader />

      {/* Hero Section */}
      <HeroSection />

      {/* Games Section */}
      <GamesSection />

      {/* Latest Wins Section */}
      <LatestWins />

      {/* Tokenomics Section */}
      <TokenomicsSection />

      {/* Morb-It Section */}
      <MorbItSection />

      {/* Socials Section */}
      <SocialsSection />

      {/* Footer */}
      <Footer />
    </div>
  )
}
