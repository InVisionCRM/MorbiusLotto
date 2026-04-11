'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { FirstVisitNotification } from '@/components/ui/first-visit-notification'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-player-profile'
import { LoginModal } from '@/components/auth/LoginModal'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { HeroSection } from '@/components/home/hero-section'
import { GamesSection } from '@/components/home/games-section'
import { PwaHomeInstallSplash } from '@/components/home/PwaHomeInstallSplash'
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal'

function HomeBelowFoldFallback() {
  return <div className="w-full min-h-28 rounded-lg bg-neutral-950/40" aria-hidden />
}

const MorbiusInfoSection = dynamic(
  () => import('@/components/home/morbius-info-section').then((m) => m.MorbiusInfoSection),
  { loading: () => <HomeBelowFoldFallback /> }
)
const SocialsSection = dynamic(
  () => import('@/components/home/socials-section').then((m) => m.SocialsSection),
  { loading: () => <HomeBelowFoldFallback /> }
)
const TokenomicsSection = dynamic(
  () => import('@/components/home/tokenomics-section').then((m) => m.TokenomicsSection),
  { loading: () => <HomeBelowFoldFallback /> }
)
const PulseChainSection = dynamic(
  () => import('@/components/home/pulsechain-section').then((m) => m.PulseChainSection),
  { loading: () => <HomeBelowFoldFallback /> }
)
const TableShowcaseDisplay = dynamic(
  () => import('@/components/marketing/TableShowcaseDisplay').then((m) => m.TableShowcaseDisplay),
  { loading: () => <HomeBelowFoldFallback /> }
)
const AvatarShowcaseSection = dynamic(
  () => import('@/components/home/avatar-showcase-section').then((m) => m.AvatarShowcaseSection),
  { loading: () => <HomeBelowFoldFallback /> }
)
const Footer = dynamic(() => import('@/components/PLINKO/Footer'), {
  loading: () => <HomeBelowFoldFallback />,
})

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
  const [walletModalOpen, setWalletModalOpen] = useState(false)

  useEffect(() => {
    const openDeposit = () => setWalletModalOpen(true)
    const openLogin = () => setLoginOpen(true)
    const openDashboard = () => { setPlayerProfileGame('all'); setPlayerProfileOpen(true) }
    window.addEventListener('sophie:open_deposit_withdraw', openDeposit)
    window.addEventListener('sophie:open_login', openLogin)
    window.addEventListener('sophie:open_player_dashboard', openDashboard)
    return () => {
      window.removeEventListener('sophie:open_deposit_withdraw', openDeposit)
      window.removeEventListener('sophie:open_login', openLogin)
      window.removeEventListener('sophie:open_player_dashboard', openDashboard)
    }
  }, [])

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
              <p className="text-base sm:text-lg tracking-wide">
                <span className="text-slate-950">
                  The Morbius token analyzer has been redirected to{' '}
                </span>
                <a
                  href="https://scan.morbius.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline underline-offset-1 text-cyan-600 hover:text-cyan-500"
                >
                  Scan.Morbius.io
                </a>
                <span className="text-slate-950">.</span>
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
              <TableShowcaseDisplay />

              <HomeSectionDivider />
              <MorbiusInfoSection />

              <HomeSectionDivider />
              <SocialsSection />

              <HomeSectionDivider />
              <TokenomicsSection />

              <HomeSectionDivider />
              <PulseChainSection />

              <HomeSectionDivider />
              <AvatarShowcaseSection />

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
      <DepositWithdrawModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </GlobalMainNav>
  )
}
