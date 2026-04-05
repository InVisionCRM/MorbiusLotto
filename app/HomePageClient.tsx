'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { FirstVisitNotification } from '@/components/ui/first-visit-notification'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-player-profile'
import { LoginModal } from '@/components/auth/LoginModal'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { HeroSection } from '@/components/home/hero-section'
import { SocialsSection } from '@/components/home/socials-section'
import { GamesSection } from '@/components/home/games-section'
import { AvatarShowcaseSection } from '@/components/home/avatar-showcase-section'
import { TokenomicsSection } from '@/components/home/tokenomics-section'
import { ResponsibleGamingSection } from '@/components/home/responsible-gaming-section'
import { MorbiusInfoSection } from '@/components/home/morbius-info-section'
import { PulseChainSection } from '@/components/home/pulsechain-section'
import { TableShowcaseDisplay } from '@/components/marketing/TableShowcaseDisplay'
import { MorbItSection } from '@/components/home/morbit-section'
import Footer from '@/components/PLINKO/Footer'
import { PwaHomeInstallSplash } from '@/components/home/PwaHomeInstallSplash'

const HOME_FIXED_BG = '/Marketing%20/Hero-Background.jpeg' as const

function HomeSectionDivider() {
  return (
    <div className="relative mx-auto w-full max-w-5xl px-4" aria-hidden>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/60 blur-[1px]" />
    </div>
  )
}

export default function HomePageClient() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false)
  const [playerProfileGame, setPlayerProfileGame] = useState<'all' | 'blackjack' | 'lottery' | 'keno' | 'plinko'>('all')
  const { address, isAuthenticated, signIn, signOut, isSigning } = useAuth()
  const { profileDisplayName } = useProfile()
  const welcomeName = address
    ? (profileDisplayName?.trim() || `${address.slice(0, 6)}...${address.slice(-4)}`)
    : null

  return (
    <GlobalMainNav
      page="home"
      onOpenAuthModal={() => setLoginOpen(true)}
      isAuthenticated={isAuthenticated}
      onSignOut={signOut}
      onOpenPlayerProfile={address ? (game) => { setPlayerProfileGame(game ?? 'all'); setPlayerProfileOpen(true); } : undefined}
    >
      <div className="relative w-full min-h-screen flex flex-col items-center text-white bg-neutral-950">
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
          <Image
            src={HOME_FIXED_BG}
            alt=""
            fill
            className="select-none object-cover opacity-[0.05]"
            sizes="100vw"
            quality={45}
          />
        </div>

        <div className="relative z-[1] w-full flex flex-col items-center">
          <div className="relative z-10 w-full flex flex-col items-center">
            <FirstVisitNotification className="font-poppins text-center">
              <p className="text-gray-300 text-base sm:text-lg tracking-wide">
                The Morbius token analyzer has been redirected to{' '}
                <a
                  href="https://scan.morbius.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline underline-offset-1 text-cyan-400 hover:text-cyan-300"
                >
                  Scan.Morbius.io
                </a>
                .
              </p>
            </FirstVisitNotification>

            <HeroSection
              onOpenPlayerProfile={address ? () => { setPlayerProfileGame('all'); setPlayerProfileOpen(true) } : undefined}
              onOpenAuthModal={() => setLoginOpen(true)}
              showWelcome={!!address}
              welcomeName={welcomeName}
            />

            <section className="w-full flex flex-col items-center pt-10 md:pt-16">
              <GamesSection />
            </section>

            <div className="flex w-full flex-col items-center gap-y-20 px-4 py-12 md:gap-y-28 md:py-20">
              <HomeSectionDivider />
              <MorbiusInfoSection />

              <HomeSectionDivider />
              <SocialsSection />

              <HomeSectionDivider />
              <TokenomicsSection />

              <HomeSectionDivider />
              <PulseChainSection />

              <HomeSectionDivider />
              <TableShowcaseDisplay />

              <HomeSectionDivider />
              <AvatarShowcaseSection />

              <HomeSectionDivider />
              <MorbItSection />

              <HomeSectionDivider />
              <ResponsibleGamingSection />

              <HomeSectionDivider />
              <Footer />
            </div>
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
      <PwaHomeInstallSplash />
    </GlobalMainNav>
  )
}
