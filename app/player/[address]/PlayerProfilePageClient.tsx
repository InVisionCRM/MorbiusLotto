'use client'

import React from 'react'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { AllStatsDashboard } from '@/components/shared/AllStatsDashboard'
import { PlayerDashboardHero } from '@/components/shared/PlayerDashboardHero'

type PlayerProfilePageClientProps = {
  normalizedAddress: string | null
  fontClass?: string
}

// Shared abyss background (matches the arcade2 "Deep-Sea Neon" games).
const ABYSS_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,6,11,0.96) 55%, rgba(5,14,22,0.98))',
  backgroundColor: '#050E16',
}

export default function PlayerProfilePageClient({ normalizedAddress, fontClass = '' }: PlayerProfilePageClientProps) {
  if (!normalizedAddress) {
    return (
      <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
        <div className={`arcade2-scope relative min-h-screen text-slate-200 pt-4 md:pt-2 ${fontClass}`} style={ABYSS_STYLE}>
          <main className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="text-center py-20">
              <p className="text-white/60">Invalid address</p>
            </div>
          </main>
          <Footer />
        </div>
      </GlobalMainNav>
    )
  }

  return (
    <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back to Home">
      <div className={`arcade2-scope relative min-h-screen text-slate-200 pt-4 md:pt-2 ${fontClass}`} style={ABYSS_STYLE}>
        {/* Abyss lighting: cold cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <main className="relative container mx-auto px-4 py-8 max-w-6xl">
          <div className="mb-4">
            <PlayerDashboardHero address={normalizedAddress} />
          </div>

          <AllStatsDashboard playerAddress={normalizedAddress} />
        </main>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
