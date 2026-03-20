'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WalletMenu } from '@/components/shared/WalletMenu'
import { useProfile } from '@/hooks/use-player-profile'
import { usePathname } from 'next/navigation'

interface HeaderProps {
  nextDrawEndTime?: bigint
  fallbackRemaining?: bigint
  onBentoClick?: () => void
  hideKenoButton?: boolean
}

const DISPLAY_OFFSET_SECONDS = 15

const formatSeconds = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Header({ nextDrawEndTime, fallbackRemaining = BigInt(0), onBentoClick, hideKenoButton }: HeaderProps) {
  const pathname = usePathname()
  const { profileDisplayName, profileImageUrl } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [gamesSubmenuOpen, setGamesSubmenuOpen] = useState(false)

  const [remaining, setRemaining] = useState<number>(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) return Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS
    const fromEnd = Number(nextDrawEndTime) * 1000 - Date.now()
    if (!Number.isNaN(fromEnd) && fromEnd > 0) return Math.floor(fromEnd / 1000) + DISPLAY_OFFSET_SECONDS
    return Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS
  })

  useEffect(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) {
      setRemaining(Number(fallbackRemaining) + DISPLAY_OFFSET_SECONDS)
      return
    }
    const update = () => {
      const ms = Number(nextDrawEndTime) * 1000 - Date.now()
      if (!Number.isNaN(ms)) {
        setRemaining(Math.max(0, Math.floor(ms / 1000) + DISPLAY_OFFSET_SECONDS))
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextDrawEndTime, fallbackRemaining])

  return (
    <header className="border-b border-white/30 bg-purple-950/10 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 py-3 relative">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Morbius Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="text-left">
              <h1 className="text-xl font-bold text-white leading-none hidden sm:inline">MORBIUS.IO</h1>
              <img
                src="/MORBIUS/MORBIUSLogo (3).png"
                alt="MORBIUS.io"
                className="h-6 w-auto sm:hidden inline"
              />
            </div>
          </Link>

          {/* Right: Wallet + Hamburger */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Wallet Connect Button */}
            <div className="scale-75 origin-right">
              <WalletMenu profileDisplayName={profileDisplayName} profileImageUrl={profileImageUrl} />
            </div>

            {/* Hamburger Menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-9 h-9 flex flex-col items-center justify-center gap-[5px] transition-all active:scale-95"
              >
                <div className="w-5 h-[3px] bg-white rounded-full shadow-[0_2px_6px_rgba(147,51,234,0.8),0_0_8px_rgba(147,51,234,0.6)]" />
                <div className="w-5 h-[3px] bg-white rounded-full shadow-[0_2px_6px_rgba(147,51,234,0.8),0_0_8px_rgba(147,51,234,0.6)]" />
                <div className="w-5 h-[3px] bg-white rounded-full shadow-[0_2px_6px_rgba(147,51,234,0.8),0_0_8px_rgba(147,51,234,0.6)]" />
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setMenuOpen(false)
                      setGamesSubmenuOpen(false)
                    }}
                  />

                  {/* Menu Panel */}
                  <div className="absolute right-0 top-12 w-48 bg-black/15 backdrop-blur-md rounded-lg shadow-[0_8px_0_0_rgba(147,51,234,0.4)] border border-white/10 z-50">
                    {/* Title */}
                    <div className="px-3 py-2 border-b border-white/10">
                      <span className="text-white/30 font-bold text-sm">MEGA MORBIUS LOTTO</span>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      {onBentoClick && (
                        <button
                          onClick={() => {
                            onBentoClick()
                            setMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                        >
                          Dashboard
                        </button>
                      )}
                      <Link
                        href="/"
                        onClick={() => setMenuOpen(false)}
                        className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                      >
                        Morbius.io
                      </Link>
                      <Link
                        href="/swap"
                        onClick={() => setMenuOpen(false)}
                        className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                      >
                        Buy Morbius
                      </Link>
                      <Link
                        href="/lottery-purchase-showcase"
                        onClick={() => setMenuOpen(false)}
                        className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                      >
                        My History
                      </Link>
                      <button
                        onClick={() => setMenuOpen(false)}
                        className="w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                      >
                        Settings
                      </button>

                      {/* All Games with Submenu */}
                      <div className="relative">
                        <button
                          onClick={() => setGamesSubmenuOpen(!gamesSubmenuOpen)}
                          className="w-full px-3 py-2 text-left text-white/90 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium flex items-center justify-between"
                        >
                          All Games
                          <i className={`fas fa-chevron-${gamesSubmenuOpen ? 'down' : 'right'} text-xs`}></i>
                        </button>

                        {gamesSubmenuOpen && (
                          <div className="bg-black/20 border-t border-white/10">
                            <Link
                              href="/"
                              onClick={() => {
                                setMenuOpen(false)
                                setGamesSubmenuOpen(false)
                              }}
                              className="block w-full px-5 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs font-medium"
                            >
                              Mega Morbius Lotto
                            </Link>
                            <Link
                              href="/keno"
                              onClick={() => {
                                setMenuOpen(false)
                                setGamesSubmenuOpen(false)
                              }}
                              className="block w-full px-5 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs font-medium"
                            >
                              Crypto Keno
                            </Link>
                            <Link
                              href="/PLINKO"
                              onClick={() => {
                                setMenuOpen(false)
                                setGamesSubmenuOpen(false)
                              }}
                              className="block w-full px-5 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs font-medium"
                            >
                              PLINKO
                            </Link>
                            <Link
                              href="/plinko-dashboard"
                              onClick={() => {
                                setMenuOpen(false)
                                setGamesSubmenuOpen(false)
                              }}
                              className="block w-full px-5 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs font-medium"
                            >
                              PLINKO Dashboard
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Centered Next Draw Timer */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 bg-clip-text text-transparent drop-shadow">
            {remaining > 0 ? formatSeconds(remaining) : '--'}
          </div>
        </div>
      </div>
    </header>
  )
}
