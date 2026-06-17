'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-player-profile'
import { LoginModal } from '@/components/auth/LoginModal'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { GamesSection } from '@/components/home/games-section'
import { PlatformStatsSection } from '@/components/home/platform-stats-section'
import { PwaHomeInstallSplash } from '@/components/home/PwaHomeInstallSplash'
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal'
import { LoadingTip } from '@/components/shared/LoadingTip'

const SocialsSection = dynamic(
  () => import('@/components/home/socials-section').then((m) => m.SocialsSection),
  { loading: () => <LoadingTip variant="inline" /> }
)
const BrandedTablesPitch = dynamic(
  () => import('@/components/home/branded-tables-pitch').then((m) => m.BrandedTablesPitch),
  { loading: () => <LoadingTip variant="inline" /> }
)
const TableShowcaseDisplay = dynamic(
  () => import('@/components/marketing/TableShowcaseDisplay').then((m) => m.TableShowcaseDisplay),
  { loading: () => <LoadingTip variant="inline" /> }
)
const AvatarShowcaseSection = dynamic(
  () => import('@/components/home/avatar-showcase-section').then((m) => m.AvatarShowcaseSection),
  { loading: () => <LoadingTip variant="inline" /> }
)
const Footer = dynamic(() => import('@/components/PLINKO/Footer'), {
  loading: () => <LoadingTip variant="inline" />,
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
            <section className="w-full flex flex-col items-center pt-2 md:pt-4">
              <GamesSection welcomeName={welcomeName} />
            </section>

            <div className="flex w-full flex-col items-center gap-y-20 px-4 py-12 md:gap-y-28 md:py-20">
              <HomeSectionDivider />
              <PlatformStatsSection />

              <HomeSectionDivider />
              <TableShowcaseDisplay />
              <BrandedTablesPitch />

              <HomeSectionDivider />
              <SocialsSection />

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
