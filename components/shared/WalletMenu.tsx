'use client'

import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAppKit } from '@reown/appkit/react'
import { useAccount, useDisconnect } from 'wagmi'
import { useProfile } from '@/hooks/use-player-profile'
import Image from 'next/image'
import { AvatarView } from '@/components/avatar'
import { DEFAULT_AVATAR_CONFIG } from '@/components/avatar'
import { WalletIcon } from '@/components/shared/WalletIcon'
import { TelegramAlerts } from '@/components/telegram/TelegramAlerts'
import {
  IconUser,
  IconChevronDown,
  IconArrowsExchange,
  IconPencil,
  IconLogout,
  IconCheck,
  IconCopy,
  IconShieldOff,
} from '@tabler/icons-react'

const GameWalletModal = lazy(() => import('@/components/shared/GameWalletModal').then(m => ({ default: m.GameWalletModal })))
const RevokeApprovalsModal = lazy(() => import('@/components/shared/RevokeApprovalsModal').then(m => ({ default: m.RevokeApprovalsModal })))

export interface WalletMenuProps {
  /**
   * When provided, Deposit/Withdraw calls this (e.g. in-game modal).
   * When omitted, the menu opens a local game wallet modal in-place.
   */
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
  /** When true, always render avatar as a static image/icon (no animated AvatarView) */
  staticAvatarOnly?: boolean
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
  staticAvatarOnly = false,
}: WalletMenuProps) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()
  const { profileDisplayName: profileDisplayNameFromHook, profileImageUrl: profileImageUrlFromHook, avatarConfig } = useProfile()
  const effectiveProfileDisplayName = profileDisplayName ?? profileDisplayNameFromHook
  const effectiveProfileImageUrl = profileImageUrl ?? profileImageUrlFromHook
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false)
  // True while the Telegram link modal is open — keeps the dropdown from
  // closing (and unmounting the modal) when the user clicks into the modal.
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)
  const [isGameWalletOpen, setIsGameWalletOpen] = useState(false)
  const [isRevokeOpen, setIsRevokeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const walletDropdownRef = useRef<HTMLDivElement>(null)

  const handleCopyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = address
      ta.setAttribute('aria-hidden', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      try {
        ta.select()
        document.execCommand('copy')
      } finally {
        if (ta.isConnected) document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Keep the dropdown open while the Telegram link modal is up — otherwise
      // it would unmount the modal mid-flow.
      if (telegramModalOpen) return
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(event.target as Node)) {
        setIsWalletDropdownOpen(false)
      }
    }
    if (isWalletDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isWalletDropdownOpen, telegramModalOpen])

  const handleDepositWithdraw = useCallback(() => {
    if (onOpenDepositModal) {
      onOpenDepositModal()
    } else {
      setIsGameWalletOpen(true)
    }
    setIsWalletDropdownOpen(false)
  }, [onOpenDepositModal])

  return (
    <>
      <div className={`flex items-center flex-shrink-0 relative ${className}`} ref={walletDropdownRef}>
      {isConnected && address ? (
        <>
          <button
            type="button"
            onClick={() => setIsWalletDropdownOpen(!isWalletDropdownOpen)}
            className={
              variant === 'sidebar'
                ? 'sidebar-item flex items-center w-full rounded-lg py-2 px-2 text-white text-sm font-medium transition-colors hover:bg-white/5'
                : 'flex items-center gap-2 px-2 py-1 rounded-sm text-white text-sm font-bold transition-all hover:bg-white/5'
            }
            style={variant !== 'sidebar' ? { background: 'linear-gradient(145deg,rgba(44, 149, 156, 0.11),rgba(87, 107, 113, 0.15))' } : undefined}
            aria-label={isWalletDropdownOpen ? 'Close wallet menu' : 'Open wallet menu'}
          >
            <div className="rounded-full overflow-hidden flex-shrink-0 w-7 h-7">
              {staticAvatarOnly ? (
                effectiveProfileImageUrl ? (
                  <Image
                    src={effectiveProfileImageUrl}
                    alt={effectiveProfileDisplayName ? `${effectiveProfileDisplayName} avatar` : 'User avatar'}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                    <IconUser size={10} className="text-white/80" aria-hidden />
                  </div>
                )
              ) : (
                <AvatarView
                  config={avatarConfig ?? DEFAULT_AVATAR_CONFIG}
                  compact
                  className="w-full h-full"
                />
              )}
            </div>
            {variant === 'sidebar' ? (
              <>
                <span className="sidebar-label text-white truncate min-w-0 text-sm">
                  {effectiveProfileDisplayName ?? `…${address.slice(-4)}`}
                </span>
                <span className="sidebar-label flex-shrink-0">
                  <IconChevronDown
                    size={16}
                    className={`text-white transition-transform ${isWalletDropdownOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </span>
              </>
            ) : (
              <>
                <span className="text-white truncate min-w-0">
                  {effectiveProfileDisplayName ?? `…${address.slice(-4)}`}
                </span>
                <IconChevronDown
                  size={16}
                  className={`text-white transition-transform flex-shrink-0 ${isWalletDropdownOpen ? 'rotate-180' : ''}`}
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
                  <WalletIcon size={16} />
                  Wallet
                </div>
                <button
                  type="button"
                  onClick={handleDepositWithdraw}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors border border-cyan-500/25 bg-cyan-500/10 ${variant === 'sidebar' ? 'text-white hover:bg-cyan-500/15' : 'text-gray-200 hover:bg-cyan-500/15 hover:text-white'}`}
                >
                  <IconArrowsExchange size={16} className="text-cyan-300/90" aria-hidden />
                  <span className="text-sm font-semibold">Deposit / Withdraw</span>
                </button>
                {onOpenProfileSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenProfileSettings()
                      setIsWalletDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${variant === 'sidebar' ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    <IconPencil size={16} aria-hidden />
                    <span className="text-sm font-medium">Edit profile</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsRevokeOpen(true)
                    setIsWalletDropdownOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${variant === 'sidebar' ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                >
                  <IconShieldOff size={16} aria-hidden />
                  <span className="text-sm font-medium">Manage approvals</span>
                </button>
                <TelegramAlerts
                  walletAddress={address}
                  placement="menu"
                  onModalOpenChange={setTelegramModalOpen}
                />
                <button
                  onClick={() => {
                    disconnect()
                    setIsWalletDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <IconLogout size={16} />
                  <span className="text-sm font-medium">Disconnect</span>
                </button>
                <div className={`mt-2 pt-2 border-t border-white/10 flex items-start gap-2 px-3 py-2 ${variant === 'sidebar' ? 'text-white/60' : 'text-gray-500'}`}>
                  <code className="text-[10px] font-mono break-all flex-1 min-w-0 leading-tight" title={address}>
                    {address}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                    aria-label="Copy address"
                    title="Copy address"
                  >
                    {copied ? (
                      <IconCheck size={12} className="text-cyan-400" />
                    ) : (
                      <IconCopy size={12} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <button
          onClick={() => open()}
          className={
            variant === 'sidebar'
              ? 'sidebar-item flex items-center w-full rounded-lg px-2 py-2 text-white/70 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white'
              : 'flex items-center gap-2 px-3 py-1 rounded-sm text-white/50 text-sm font-bold transition-all hover:scale-105 active:scale-95'
          }
          style={variant !== 'sidebar' ? { background: 'linear-gradient(145deg,rgba(28, 28, 45, 0),rgba(0, 0, 0, 0))' } : undefined}
        >
          <WalletIcon size={20} />
          {variant === 'sidebar' ? (
            <span className="sidebar-label text-cyan-400">
              Connect
            </span>
          ) : (
            <>
              <span className="text-cyan-400">Connect</span>
              <IconChevronDown size={12} className="text-cyan-400" />
            </>
          )}
        </button>
      )}
      </div>
      <Suspense fallback={null}>
        {isGameWalletOpen && (
          <GameWalletModal
            isOpen={isGameWalletOpen}
            onClose={() => setIsGameWalletOpen(false)}
            externalBalance={reserveBalance}
          />
        )}
        {isRevokeOpen && (
          <RevokeApprovalsModal
            isOpen={isRevokeOpen}
            onClose={() => setIsRevokeOpen(false)}
          />
        )}
      </Suspense>
    </>
  )
}
