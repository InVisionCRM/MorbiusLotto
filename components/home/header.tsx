'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAccount } from 'wagmi'
import { WalletMenu } from '@/components/shared/WalletMenu'
import { useProfile } from '@/hooks/use-player-profile'
import { useAuth } from '@/hooks/use-auth'
import { LoginModal } from '@/components/auth/LoginModal'
import { Button } from '@/components/ui/button'
import { Shield, LogOut } from 'lucide-react'
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay'
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay'
import { SelfExclusionModal } from '@/components/ResponsibleGaming/SelfExclusionModal'

interface HomeHeaderProps {
  showBackArrow?: boolean
  backArrowHref?: string
  backArrowLabel?: string
}

export function HomeHeader({ showBackArrow = false, backArrowHref = '/', backArrowLabel = 'Back' }: HomeHeaderProps = {}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [responsibleGamingOpen, setResponsibleGamingOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { isAuthenticated, signIn, signOut, isSigning, address } = useAuth()
  const { isConnected } = useAccount()
  const { profileDisplayName, profileImageUrl } = useProfile()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100]"
      style={{
        background: 'linear-gradient(to right, #0f172a, #0f172a, rgba(6, 182, 212, 0.5))',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="container mx-auto px-2 py-1">
        <div className="flex items-center justify-between gap-2 overflow-x-hidden">
          {/* Left: Back Arrow + Logo */}
          <div className="flex items-center gap-3">
            {showBackArrow && backArrowHref && (
              <Link
                href={backArrowHref}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                title={backArrowLabel}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            <Link href="/" className="flex items-center">
              <span className="text-lg font-medium text-white">
                MORBIUS.IO
              </span>
            </Link>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 min-w-0">
            {/* Authentication Button */}
            {address && (
              <div className="scale-75 origin-right">
                {isAuthenticated ? (
                  <Button
                    onClick={signOut}
                    variant="outline"
                    size="sm"
                    className="bg-green-950/20 border-green-400/30 text-green-400 hover:bg-green-950/30 hover:border-green-400/50"
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    <LogOut className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => setLoginOpen(true)}
                    variant="outline"
                    size="sm"
                    className="bg-cyan-950/20 border-cyan-400/30 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-400/50"
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    Sign In
                  </Button>
                )}
              </div>
            )}

            {/* Wallet — shared WalletMenu (same as BLACKJACK / other games) */}
            <WalletMenu
              profileDisplayName={profileDisplayName}
              profileImageUrl={profileImageUrl}
            />

            {/* Hamburger Menu */}
            <div className="relative z-50" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-10 h-10 flex flex-col items-center justify-center gap-[7px] transition-all active:scale-95 rounded-md hover:bg-white/10"
              >
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <div
                  className="fixed right-2 top-14 w-64 rounded-lg overflow-hidden shadow-xl z-[200] max-h-[80vh] overflow-y-auto"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Quick Links Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Quick Links</div>
                    <Link
                      href="/home"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-home w-4 text-center" aria-hidden />
                      <span className="text-sm font-medium">Home</span>
                    </Link>
                    <Link
                      href="/swap"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-exchange-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Buy Morbius</span>
                    </Link>
                    <Link
                      href="/lottery-purchase-showcase"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-history w-4 text-center"></i>
                      <span className="text-sm font-medium">My History</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setResponsibleGamingOpen(true)
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                    >
                      <i className="fas fa-shield-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Responsible Gaming</span>
                    </button>
                  </div>

                  {/* Socials Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Socials</div>
                    <a
                      href="https://x.com/morbiusfinance"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z" />
                      </svg>
                      <span className="text-sm font-medium">X.com</span>
                    </a>
                    <a
                      href="https://t.me/morbiusfinance"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fab fa-telegram w-4 text-center" aria-hidden />
                      <span className="text-sm font-medium">Telegram</span>
                    </a>
                    <Link
                      href="/Morb-It"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-image w-4 text-center" aria-hidden />
                      <span className="text-sm font-medium">Meme Generator</span>
                    </Link>
                  </div>

                  {/* Farm Morbius Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Farm Morbius</div>
                    <a
                      href="https://emit.farm/farms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-seedling w-4 text-center"></i>
                      <span className="text-sm font-medium">EMIT</span>
                    </a>
                  </div>

                  {/* Games Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Games</div>
                    <Link
                      href="/PLINKO"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-circle w-4 text-center"></i>
                      <span className="text-sm font-medium">Plinko</span>
                    </Link>
                    <Link
                      href="/BLACKJACK"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
                        <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
                      </span>
                      <span className="text-sm font-medium">Blackjack</span>
                    </Link>
                    {/* Big Wheel - commented out
                    <Link
                      href="/BIG-WHEEL"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-dharmachakra w-4 text-center"></i>
                      <span className="text-sm font-medium">Big Wheel</span>
                    </Link>
                    */}
                    <Link
                      href="/lottery"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-ticket-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Lottery</span>
                    </Link>
                    <Link
                      href="/keno"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <i className="fas fa-th w-4 text-center"></i>
                      <span className="text-sm font-medium">Keno</span>
                    </Link>
                  </div>

                  {/* Morbius Stats Section */}
                  <div className="p-2">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Morbius Stats</div>
                    <MorbiusBurnedDisplay variant="inline" className="px-3 py-2" />
                    <MorbiusPriceDisplay className="px-3 py-2" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSignIn={signIn}
        isSigning={isSigning}
        address={address}
      />

      {/* Responsible Gaming / Self-Exclusion Modal */}
      <SelfExclusionModal
        isOpen={responsibleGamingOpen}
        onClose={() => setResponsibleGamingOpen(false)}
      />
    </nav>
  )
}
