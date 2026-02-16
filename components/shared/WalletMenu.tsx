'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useDisconnect } from 'wagmi'

export interface WalletMenuProps {
  /** When provided, shows Deposit/Withdraw button that calls this */
  onOpenDepositModal?: () => void
  /** When provided, shows balance line in dropdown (in MORBIUS, 18 decimals) */
  reserveBalance?: bigint
  /** Display name for profile (e.g. from backend). Falls back to …address.slice(-4) */
  profileDisplayName?: string | null
  /** Avatar URL for profile. When missing, shows placeholder */
  profileImageUrl?: string | null
  /** When provided, shows Edit profile button that calls this */
  onOpenProfileSettings?: () => void
  /** Optional class for the wrapper div */
  className?: string
  /** When 'below', dropdown opens below the button (absolute) for use inside sidebar. Default: 'viewport-right' */
  dropdownPlacement?: 'viewport-right' | 'below'
  /** When true, use white text in dropdown (for dark sidebar) */
  variant?: 'default' | 'sidebar'
  /** When variant=sidebar, pass sidebar open state so label animates with collapse */
  sidebarOpen?: boolean
}

/**
 * Global wallet menu: Connect button when disconnected, dropdown when connected.
 * Matches BLACKJACK MainNav wallet UI (cyan/grey theme, dropdown with Deposit/Withdraw, profile, Disconnect).
 * Use the same component across all game navs and home for consistent UX.
 */
export function WalletMenu({
  onOpenDepositModal,
  reserveBalance,
  profileDisplayName,
  profileImageUrl,
  onOpenProfileSettings,
  className = '',
  dropdownPlacement = 'viewport-right',
  variant = 'default',
  sidebarOpen = true,
}: WalletMenuProps) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false)
  const walletDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(event.target as Node)) {
        setIsWalletDropdownOpen(false)
      }
    }
    if (isWalletDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isWalletDropdownOpen])

  return (
    <div className={`flex items-center flex-shrink-0 relative ${className}`} ref={walletDropdownRef}>
      {isConnected && address ? (
        <>
          <button
            type="button"
            onClick={() => setIsWalletDropdownOpen(!isWalletDropdownOpen)}
            className={
              variant === 'sidebar'
                ? 'flex items-center justify-start gap-2 w-full text-left rounded-lg px-2 py-2 text-white text-sm font-medium transition-colors hover:bg-white/5'
                : 'flex items-center gap-2 px-2 py-1 rounded-sm text-white text-sm font-bold transition-all hover:bg-white/5'
            }
            style={variant !== 'sidebar' ? { background: 'linear-gradient(145deg,rgba(44, 149, 156, 0.11),rgba(87, 107, 113, 0.15))' } : undefined}
            aria-label={isWalletDropdownOpen ? 'Close wallet menu' : 'Open wallet menu'}
          >
            <div
              className={`rounded-full bg-slate-700 border border-cyan-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center ${variant === 'sidebar' ? 'w-5 h-5' : 'w-7 h-7'}`}
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className={`text-xs ${variant === 'sidebar' ? 'text-white/70' : 'text-gray-400'}`}>?</span>
              )}
            </div>
            {variant === 'sidebar' ? (
              <>
                <motion.span
                  animate={{ display: sidebarOpen ? 'inline-block' : 'none', opacity: sidebarOpen ? 1 : 0 }}
                  className="text-white truncate min-w-0 text-sm"
                >
                  {profileDisplayName ?? `…${address.slice(-4)}`}
                </motion.span>
                <motion.span
                  animate={{ display: sidebarOpen ? 'inline-block' : 'none', opacity: sidebarOpen ? 1 : 0 }}
                  className="flex-shrink-0"
                >
                  <i
                    className={`fas fa-chevron-down text-white text-sm transition-transform ${isWalletDropdownOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </motion.span>
              </>
            ) : (
              <>
                <span className="text-white truncate min-w-0">
                  {profileDisplayName ?? `…${address.slice(-4)}`}
                </span>
                <i
                  className={`fas fa-chevron-down text-white text-sm transition-transform flex-shrink-0 ${isWalletDropdownOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </>
            )}
          </button>

          {isWalletDropdownOpen && (
            <div
              className={
                dropdownPlacement === 'below'
                  ? 'absolute left-0 top-full mt-1 w-full min-w-[200px] rounded-lg overflow-hidden shadow-xl z-[9999]'
                  : 'fixed right-2 top-14 w-64 rounded-lg overflow-hidden shadow-xl'
              }
              style={{
                zIndex: 9999,
                background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div className="p-2">
                <div className={`flex items-center gap-2 text-xs uppercase tracking-wider px-3 py-1 ${variant === 'sidebar' ? 'text-white/80' : 'text-cyan-300/60'}`}>
                  <i className="fas fa-wallet w-4 text-center" aria-hidden />
                  Wallet
                </div>
                {onOpenDepositModal && (
                  <button
                    onClick={() => {
                      onOpenDepositModal()
                      setIsWalletDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${variant === 'sidebar' ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    <i className="fas fa-wallet w-4 text-center" />
                    <span className="text-sm font-medium">Deposit/Withdraw</span>
                  </button>
                )}
                {reserveBalance !== undefined && (
                  <div className={`flex items-center gap-3 px-3 py-2 ${variant === 'sidebar' ? 'text-white/90' : 'text-gray-400'}`}>
                    <i className="fas fa-coins w-4 text-center" />
                    <span className="text-sm">
                      Balance: {Math.floor(Number(reserveBalance) / 1e18)} MORBIUS
                    </span>
                  </div>
                )}
                {onOpenProfileSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenProfileSettings()
                      setIsWalletDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${variant === 'sidebar' ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    <i className="fas fa-pen w-4 text-center" aria-hidden />
                    <span className="text-sm font-medium">Edit profile</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    disconnect()
                    setIsWalletDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <i className="fas fa-sign-out-alt w-4 text-center" />
                  <span className="text-sm font-medium">Disconnect</span>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              className={
                variant === 'sidebar'
                  ? 'flex items-center justify-start gap-2 w-full text-left rounded-lg px-2 py-2 text-white/70 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white'
                  : 'flex items-center gap-2 px-3 py-1 rounded-sm text-white/50 text-sm font-bold transition-all hover:scale-105 active:scale-95'
              }
              style={variant !== 'sidebar' ? { background: 'linear-gradient(145deg,rgba(28, 28, 45, 0),rgba(0, 0, 0, 0))' } : undefined}
            >
              <i className="fas fa-wallet w-5 text-center text-cyan-400 shrink-0" aria-hidden />
              {variant === 'sidebar' ? (
                <>
                  <motion.span
                    animate={{ display: sidebarOpen ? 'inline-block' : 'none', opacity: sidebarOpen ? 1 : 0 }}
                    className="text-cyan-400"
                  >
                    Connect
                  </motion.span>
                </>
              ) : (
                <>
                  <span className="text-cyan-400">Connect</span>
                  <i className="fas fa-chevron-down text-cyan-400 text-xs" />
                </>
              )}
            </button>
          )}
        </ConnectButton.Custom>
      )}
    </div>
  )
}
