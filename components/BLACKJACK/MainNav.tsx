'use client'

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { WalletMenu } from '@/components/shared/WalletMenu';
import { NumberTicker } from '@/components/ui/number-ticker';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';
import { BLACKJACK_IMAGE_BACKGROUNDS, BLACKJACK_DEPLOYER_WALLET, DEFAULT_BLACKJACK_IMAGE_ID } from '@/app/BLACKJACK/constants';
import type { BlackjackImageId, BlackjackThemeKind, BlackjackVideoId } from '@/app/BLACKJACK/constants';
import ThemeSelectionModal from '@/components/BLACKJACK/ThemeSelectionModal';

interface MainNavProps {
  onOpenDepositModal?: () => void;
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
  /** Music player controls for mobile dropdown */
  musicTrackName?: string;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  onNextTrack?: () => void;
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

export default function MainNav({ onOpenDepositModal, reserveBalance, currentView = 'game', onViewChange, theme = 'video', onThemeChange, imageSource = DEFAULT_BLACKJACK_IMAGE_ID, onImageSourceChange, videoSource = 'glowingTable', onVideoSourceChange, videoSyncToClock = true, onVideoSyncToClockChange, videoPosition = 50, onVideoPositionChange, soundEnabled = true, onSoundChange, themeModalOpen: themeModalOpenProp, onThemeModalOpenChange, onTournamentLobby, profileDisplayName, profileImageUrl, onOpenProfileSettings, musicTrackName, isMusicPlaying, onToggleMusic, onNextTrack }: MainNavProps) {
  const { address, isConnected } = useAccount();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [internalThemeModalOpen, setInternalThemeModalOpen] = useState(false);
  const isThemeModalControlled = onThemeModalOpenChange !== undefined;
  const themeModalOpen = isThemeModalControlled ? (themeModalOpenProp ?? false) : internalThemeModalOpen;
  const setThemeModalOpen = isThemeModalControlled ? onThemeModalOpenChange : setInternalThemeModalOpen;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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
            {/* Morbius Reserve Balance Display */}
            {isConnected && reserveBalance !== undefined && (
              <button
                onClick={onOpenDepositModal}
                className="hidden sm:flex relative items-center justify-start bg-slate-900/30 rounded-lg py-1.5 px-3 pr-8 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.1)] gap-1 text-xs flex-shrink min-w-0 hover:bg-slate-900/50 transition-colors cursor-pointer"
                aria-label="MORBIUS reserve balance — click to deposit or withdraw"
                title="Deposit/Withdraw"
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

            {/* Wallet / Profile — shared WalletMenu (same UX globally) */}
            <WalletMenu
              onOpenDepositModal={onOpenDepositModal}
              reserveBalance={reserveBalance}
              profileDisplayName={profileDisplayName}
              profileImageUrl={profileImageUrl}
              onOpenProfileSettings={onOpenProfileSettings}
            />

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
                  {/* Home */}
                  <div className="p-2 border-b border-gray-700/50">
                    <Link
                      href="/home"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-home w-4 text-center" aria-hidden />
                      <span className="text-sm font-medium">Home</span>
                    </Link>
                  </div>
                  {/* Music Player - Mobile Only */}
                  {musicTrackName && onToggleMusic && (
                    <div className="p-2 border-b border-gray-700/50">
                      <div className="flex items-center gap-2 text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1 mb-2">
                        <i className="fas fa-music w-4 text-center" aria-hidden />
                        Music Player
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800/50 border border-cyan-500/30">
                        <span className="text-cyan-400/90 text-xs font-medium flex-1 truncate" title={musicTrackName}>
                          {musicTrackName}
                        </span>
                        <button
                          type="button"
                          onClick={onToggleMusic}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                          aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}
                        >
                          {isMusicPlaying ? <i className="fas fa-pause text-sm" /> : <i className="fas fa-play text-sm" />}
                        </button>
                        {onNextTrack && (
                          <button
                            type="button"
                            onClick={onNextTrack}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                            aria-label="Next track"
                          >
                            <i className="fas fa-forward text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Blackjack Views Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">
                      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
                        <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
                      </span>
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
                    {/* Verification Page Link */}
                    <Link
                      href="/BLACKJACK/verify"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-shield-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Verify Game</span>
                    </Link>
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
                    <Link
                      href="/creators"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-crown w-4 text-center"></i>
                      <span className="text-sm font-medium">Creator Dashboard</span>
                    </Link>
                  </div>

                  {/* Morbius Stats Section */}
                  <div className="p-2">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Morbius Stats</div>
                    <MorbiusBurnedDisplay variant="inline" className="px-3 py-2" />
                    <MorbiusPriceDisplay className="px-3 py-2" />
                    <Link
                      href="/swap"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-exchange-alt w-4 text-center" aria-hidden />
                      <span className="text-sm font-medium">Swap</span>
                    </Link>
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