'use client'

import { HomeHeader } from '@/components/home/header'
import { HeroSection } from '@/components/home/hero-section'
import { GamesSection } from '@/components/home/games-section'
import { LatestWins } from '@/components/home/latest-wins'
import { LatestBurns } from '@/components/home/latest-burns'
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

      {/* Tokenomics Section */}
      <TokenomicsSection />

      {/* Latest Wins and Burns Section - 2 Column Grid */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <LatestWins />
            <LatestBurns />
          </div>
        </div>
      </section>

      {/* Socials Section */}
      <SocialsSection />

      {/* Morb-It Section */}
      <MorbItSection />

      {/* Footer */}
      <Footer />
    </div>
  )
}
