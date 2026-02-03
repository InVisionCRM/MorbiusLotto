'use client'

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect, useBalance } from 'wagmi';
import { NumberTicker } from '@/components/ui/number-ticker';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';
import { formatEther } from 'viem';
import { BLACKJACK_IMAGE_BACKGROUNDS, BLACKJACK_DEPLOYER_WALLET, DEFAULT_BLACKJACK_IMAGE_ID } from '@/app/BLACKJACK/constants';
import type { BlackjackImageId, BlackjackThemeKind, BlackjackVideoId } from '@/app/BLACKJACK/constants';
import ThemeSelectionModal from '@/components/BLACKJACK/ThemeSelectionModal';

interface MainNavProps {
  onOpenDepositModal?: () => void;
  onOpenApprovalModal?: () => void;
  reserveBalance?: bigint;
  currentView?: 'game' | 'history' | 'stats' | 'analytics' | 'verify';
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics' | 'verify') => void;
  theme?: BlackjackThemeKind;
  onThemeChange?: (theme: BlackjackThemeKind) => void;
  imageSource?: BlackjackImageId;
  onImageSourceChange?: (id: BlackjackImageId) => void;
  videoSource?: BlackjackVideoId;
  onVideoSourceChange?: (id: BlackjackVideoId) => void;
  videoSyncToClock?: boolean;
  onVideoSyncToClockChange?: (sync: boolean) => void;
  videoPosition?: number;
  onVideoPositionChange?: (position: number) => void;
  soundEnabled?: boolean;
  onSoundChange?: (enabled: boolean) => void;
  /** When provided, theme modal is controlled by parent (e.g. for opening from table "Change Table" link) */
  themeModalOpen?: boolean;
  onThemeModalOpenChange?: (open: boolean) => void;
  /** Opens the Tournament Lobby browser from nav */
  onTournamentLobby?: () => void;
  /** Profile for connected wallet (display name + avatar). When set, show in nav with edit icon. */
  profileDisplayName?: string | null;
  profileImageUrl?: string | null;
  /** Opens the profile settings modal when edit icon is clicked */
  onOpenProfileSettings?: () => void;
}

const viewLabels: Record<string, string> = {
  game: 'Play',
  history: 'History',
  stats: 'My Stats',
  analytics: 'Analytics',
  verify: 'Provably Fair'
};

const viewIcons: Record<string, string> = {
  game: 'fa-play',
  history: 'fa-history',
  stats: 'fa-chart-bar',
  analytics: 'fa-chart-line',
  verify: 'fa-check-circle'
};

export default function MainNav({ onOpenDepositModal, onOpenApprovalModal, reserveBalance, currentView = 'game', onViewChange, theme = 'video', onThemeChange, imageSource = DEFAULT_BLACKJACK_IMAGE_ID, onImageSourceChange, videoSource = 'glowingTable', onVideoSourceChange, videoSyncToClock = true, onVideoSyncToClockChange, videoPosition = 50, onVideoPositionChange, soundEnabled = true, onSoundChange, themeModalOpen: themeModalOpenProp, onThemeModalOpenChange, onTournamentLobby, profileDisplayName, profileImageUrl, onOpenProfileSettings }: MainNavProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [internalThemeModalOpen, setInternalThemeModalOpen] = useState(false);
  const isThemeModalControlled = onThemeModalOpenChange !== undefined;
  const themeModalOpen = isThemeModalControlled ? (themeModalOpenProp ?? false) : internalThemeModalOpen;
  const setThemeModalOpen = isThemeModalControlled ? onThemeModalOpenChange : setInternalThemeModalOpen;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Get native PLS balance (throttled to reduce RPC load)
  const { data: plsBalance } = useBalance({
    address: address ?? undefined,
    query: {
      enabled: !!address,
      refetchInterval: 60_000, // 1 minute when connected
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isDropdownOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen, isMobileMenuOpen]);

  const isDeployer = Boolean(
    address && BLACKJACK_DEPLOYER_WALLET && address.toLowerCase() === BLACKJACK_DEPLOYER_WALLET
  );
  const views: Array<'game' | 'history' | 'stats' | 'analytics' | 'verify'> = isDeployer
    ? ['game', 'history', 'stats', 'analytics', 'verify']
    : ['game', 'history', 'stats', 'verify'];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] h-12 min-h-12"
      style={{
        background: 'linear-gradient(to right, #0f172a, #0f172a, rgba(6, 182, 212, 0.5))',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="container mx-auto px-2 py-1">
        <div className="flex items-center justify-between gap-2 overflow-x-hidden">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-lg font-medium text-white">
              MORBIUS.IO
            </span>
          </Link>


          {/* Right Side Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 min-w-0">
            {/* Balances Display */}
            {isConnected && (
              <div className="flex items-center gap-2">
                {/* PLS Balance - Always visible */}
                {plsBalance && (
                  <div className="flex items-center gap-1 bg-slate-900/30 rounded-lg py-1.5 px-3 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.1)] text-xs">
                    <span className="text-white/80 font-bold">
                      {Number(formatEther(plsBalance.value)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-cyan-400 font-bold">PLS</span>
                  </div>
                )}

                {/* Morbius Reserve Balance - Hidden on mobile */}
                {reserveBalance !== undefined && (
                  <button
                    onClick={onOpenDepositModal}
                    className="hidden sm:flex relative items-center justify-start bg-slate-900/30 rounded-lg py-1.5 px-3 pr-8 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.1)] gap-1 text-xs flex-shrink min-w-0 hover:bg-slate-900/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1">
                      <NumberTicker
                        value={Math.floor(Number(reserveBalance) / 1e18)}
                        className="text-white/80 font-bold whitespace-nowrap"
                        animateOnChange={true}
                      />
                      <Image
                        src="/morbius/MorbiusLogo (3).png"
                        alt="Morbius Logo"
                        width={16}
                        height={16}
                        className="object-contain"
                      />
                    </div>
                    <i className="fas fa-chevron-down text-white/60 text-xs absolute right-2 top-1/2 transform -translate-y-1/2"></i>
                  </button>
                )}
              </div>
            )}

            {/* Wallet / Profile */}
            <div className="flex items-center flex-shrink-0">
              {isConnected && address ? (
                <div
                  className="flex items-center gap-2 px-2 py-1 rounded-sm text-white text-sm font-bold transition-all"
                  style={{
                    background: 'linear-gradient(145deg,rgba(44, 149, 156, 0.11),rgba(87, 107, 113, 0.15))',
                  }}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-700 border border-cyan-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-400 text-xs">?</span>
                    )}
                  </div>
                  <span className="text-white max-w-[80px] truncate">
                    {profileDisplayName || `…${address.slice(-4)}`}
                  </span>
                  {onOpenProfileSettings && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenProfileSettings(); }}
                      className="p-1 rounded hover:bg-white/10 text-cyan-400 hover:text-cyan-300"
                      aria-label="Edit profile"
                      title="Edit profile"
                    >
                      <i className="fas fa-pen text-xs" aria-hidden />
                    </button>
                  )}
                  <button
                    onClick={() => disconnect()}
                    className="p-1 rounded hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                    aria-label="Disconnect"
                  >
                    <i className="fas fa-chevron-down text-white text-sm" />
                  </button>
                </div>
              ) : (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="flex items-center gap-2 px-3 py-1 rounded-sm text-white/50 text-sm font-bold transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(145deg,rgba(28, 28, 45, 0),rgba(0, 0, 0, 0))',
                      }}
                    >
                      <span className="text-cyan-400">Connect</span>
                      <i className="fas fa-chevron-down text-cyan-400 text-xs"></i>
                    </button>
                  )}
                </ConnectButton.Custom>
              )}
            </div>

            {/* Hamburger Menu - Always visible */}
            <div className="relative z-50" ref={mobileMenuRef}>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                className="w-10 h-10 flex flex-col items-center justify-center gap-[7px] transition-all active:scale-95 rounded-md hover:bg-white/10"
              >
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
              </button>

              {/* Dropdown Menu */}
              {isMobileMenuOpen && (
                <div
                  className="fixed right-2 top-14 w-64 rounded-lg overflow-hidden shadow-xl z-[200] max-h-[80vh] overflow-y-auto"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Blackjack Views Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">
                      <i className="fas fa-club w-4 text-center" aria-hidden />
                      Blackjack
                    </div>
                    {views.map((view) => (
                      <button
                        key={view}
                        onClick={() => {
                          onViewChange?.(view);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                          currentView === view
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <i className={`fas ${viewIcons[view]} w-4 text-center`}></i>
                        <span className="text-sm font-medium">{viewLabels[view]}</span>
                        {currentView === view && (
                          <i className="fas fa-check ml-auto text-cyan-400 text-xs"></i>
                        )}
                      </button>
                    ))}
                    {/* Tournament Lobby */}
                    {onTournamentLobby && (
                      <button
                        type="button"
                        onClick={() => {
                          onTournamentLobby();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-t border-gray-700/50 mt-2 pt-2"
                        aria-label="Open Tournament Lobby"
                      >
                        <i className="fas fa-trophy w-4 text-center" aria-hidden />
                        <span className="text-sm font-medium">Tournament Lobby</span>
                        <i className="fas fa-chevron-right ml-auto text-white/50 text-xs" aria-hidden />
                      </button>
                    )}
                    {/* Table theme – opens modal */}
                    {onThemeChange && (
                      <button
                        type="button"
                        onClick={() => {
                          setThemeModalOpen(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-t border-gray-700/50 mt-2 pt-2"
                        aria-label="Open table theme picker"
                      >
                        <i className="fas fa-palette w-4 text-center" aria-hidden />
                        <span className="text-sm font-medium">Table theme</span>
                        <i className="fas fa-chevron-right ml-auto text-white/50 text-xs" aria-hidden />
                      </button>
                    )}
                    {/* Sound Toggle */}
                    {onSoundChange !== undefined && (
                      <button
                        type="button"
                        onClick={() => onSoundChange(!soundEnabled)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        aria-label={soundEnabled ? 'Mute game sound' : 'Unmute game sound'}
                      >
                        <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-4 text-center`} aria-hidden />
                        <span className="text-sm font-medium">
                          {soundEnabled ? 'Sound On' : 'Sound Off'}
                        </span>
                        {soundEnabled && (
                          <i className="fas fa-check ml-auto text-cyan-400 text-xs" aria-hidden />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Other Games Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Other Games</div>
                    <Link
                      href="/PLINKO"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-circle w-4 text-center"></i>
                      <span className="text-sm font-medium">Plinko</span>
                    </Link>
                    {/* Big Wheel - commented out
                    <Link
                      href="/BIG-WHEEL"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-dharmachakra w-4 text-center"></i>
                      <span className="text-sm font-medium">Big Wheel</span>
                    </Link>
                    */}
                    <Link
                      href="/lottery"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-ticket-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Lottery</span>
                    </Link>
                    <Link
                      href="/keno"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-th w-4 text-center"></i>
                      <span className="text-sm font-medium">Keno</span>
                    </Link>
                  </div>

                  {/* Account Section */}
                  {isConnected && (
                    <div className="p-2 border-b border-gray-700/50">
                      <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Account</div>
                      {onOpenDepositModal && (
                        <button
                          onClick={() => {
                            onOpenDepositModal();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-wallet w-4 text-center"></i>
                          <span className="text-sm font-medium">Deposit/Withdraw</span>
                        </button>
                      )}
                      {onOpenApprovalModal && (
                        <button
                          onClick={() => {
                            onOpenApprovalModal();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-shield-alt w-4 text-center"></i>
                          <span className="text-sm font-medium">Approval</span>
                        </button>
                      )}
                      {reserveBalance !== undefined && (
                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400">
                          <i className="fas fa-coins w-4 text-center"></i>
                          <span className="text-sm">Balance: {Math.floor(Number(reserveBalance) / 1e18)} MORBIUS</span>
                        </div>
                      )}
                      {onOpenProfileSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProfileSettings();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-pen w-4 text-center" aria-hidden />
                          <span className="text-sm font-medium">Edit profile</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          disconnect();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <i className="fas fa-sign-out-alt w-4 text-center"></i>
                        <span className="text-sm font-medium">Disconnect</span>
                      </button>
                    </div>
                  )}

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

      <ThemeSelectionModal
        open={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        theme={theme}
        imageSource={imageSource}
        videoSource={videoSource}
        onThemeChange={onThemeChange ?? (() => {})}
        onImageSourceChange={onImageSourceChange ?? (() => {})}
        onVideoSourceChange={onVideoSourceChange ?? (() => {})}
        videoSyncToClock={videoSyncToClock}
        onVideoSyncToClockChange={onVideoSyncToClockChange}
        videoPosition={videoPosition}
        onVideoPositionChange={onVideoPositionChange}
      />
    </nav>
  );
}