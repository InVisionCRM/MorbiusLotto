'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { VoiceConversation } from '@elevenlabs/client'
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
import { MorbiusInfoSection } from '@/components/home/morbius-info-section'
import { PulseChainSection } from '@/components/home/pulsechain-section'
import { TableShowcaseDisplay } from '@/components/marketing/TableShowcaseDisplay'
import Footer from '@/components/PLINKO/Footer'
import { PwaHomeInstallSplash } from '@/components/home/PwaHomeInstallSplash'
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal'

const HOME_FIXED_BG = '/Marketing%20/Hero-Background.jpeg' as const

function HomeSectionDivider() {
  return (
    <div className="relative mx-auto w-full max-w-5xl px-4" aria-hidden>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/60 blur-[1px]" />
    </div>
  )
}

const GAME_ROUTES: Record<string, string> = {
  open_blackjack: '/BLACKJACK',
  open_plinko: '/PLINKO',
  open_keno: '/keno',
  open_lottery: '/lottery',
  open_poker: '/poker',
}

export default function HomePageClient() {
  const router = useRouter()
  const [loginOpen, setLoginOpen] = useState(false)
  const [walletModalOpen, setWalletModalOpen] = useState(false)

  const conversationRef = useRef<VoiceConversation | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'connecting' | 'connected'>('idle')

  const clientTools = useCallback(() => ({
    open_deposit_withdraw_modal: () => { setWalletModalOpen(true); return 'Wallet modal opened.' },
    open_blackjack: () => { router.push('/BLACKJACK'); return 'Navigating to Blackjack.' },
    open_plinko: () => { router.push('/PLINKO'); return 'Navigating to Plinko.' },
    open_keno: () => { router.push('/keno'); return 'Navigating to Keno.' },
    open_lottery: () => { router.push('/lottery'); return 'Navigating to Lottery.' },
    open_poker: () => { router.push('/poker'); return 'Navigating to Poker.' },
  }), [router])

  const startSession = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession()
      conversationRef.current = null
      setAgentStatus('idle')
      return
    }
    setAgentStatus('connecting')
    try {
      const conversation = await VoiceConversation.startSession({
        agentId: 'agent_6501knjaw524ff2bc6wvxagf49ga',
        clientTools: clientTools(),
        onConnect: () => setAgentStatus('connected'),
        onDisconnect: () => { conversationRef.current = null; setAgentStatus('idle') },
        onError: () => { conversationRef.current = null; setAgentStatus('idle') },
      })
      conversationRef.current = conversation
    } catch {
      setAgentStatus('idle')
    }
  }, [clientTools])

  useEffect(() => {
    return () => { conversationRef.current?.endSession() }
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
      <button
        onClick={startSession}
        aria-label={agentStatus === 'connected' ? 'End conversation with Sophie' : 'Talk to Sophie'}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        style={{
          background: agentStatus === 'connected'
            ? 'radial-gradient(circle, #a855f7, #7c3aed)'
            : agentStatus === 'connecting'
            ? 'radial-gradient(circle, #64748b, #475569)'
            : 'radial-gradient(circle, #22d3ee, #0e7490)',
          boxShadow: agentStatus === 'connected'
            ? '0 0 20px rgba(168,85,247,0.6)'
            : agentStatus === 'connecting'
            ? 'none'
            : '0 0 20px rgba(34,211,238,0.4)',
        }}
      >
        {agentStatus === 'connected' ? (
          // Waveform bars when active
          <span className="flex items-end gap-[3px] h-5">
            {[1, 2, 3, 4].map(i => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-white"
                style={{ animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite alternate`, height: `${40 + i * 15}%` }}
              />
            ))}
          </span>
        ) : agentStatus === 'connecting' ? (
          <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          // Mic icon
          <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V21h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-1.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
          </svg>
        )}
      </button>
    </GlobalMainNav>
  )
}
