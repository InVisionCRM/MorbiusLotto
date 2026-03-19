'use client'

import React, { useState } from 'react';
import { useGameLock } from '@/contexts/game-lock-context';
import { useLocale, SUPPORTED_LOCALES } from '@/contexts/locale-context';
import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useProfile } from '@/hooks/use-player-profile';
import { WalletMenu } from '@/components/shared/WalletMenu';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { BLACKJACK_DEPLOYER_WALLET, DEFAULT_BLACKJACK_IMAGE_ID } from '@/app/BLACKJACK/constants';
import { isAdminWallet } from '@/lib/admin';
import type { BlackjackThemeKind } from '@/app/BLACKJACK/constants';
import type { TableOption } from '@/hooks/use-blackjack-tables';
import ThemeSelectionModal from '@/components/BLACKJACK/ThemeSelectionModal';
import HowToPlayModal from '@/components/PLINKO/HowToPlayModal';
import SwapModal from '@/components/PLINKO/SwapModal';
import { SelfExclusionModal } from '@/components/ResponsibleGaming/SelfExclusionModal';
import { ReportModal } from '@/components/shared/ReportModal';
import { ProfileAvatarModal } from '@/components/shared/ProfileAvatarModal';
import ProfileSettingsModal from '@/components/shared/ProfileSettingsModal';
import { useQueryClient } from '@tanstack/react-query';
// Install console.error interceptor for bug reports (browser only, no-op on server)
import '@/lib/error-log';

export type NavPage = 'blackjack' | 'plinko' | 'lottery' | 'keno' | 'home';

const PATH_TO_PAGE: Record<string, NavPage> = {
  '/BLACKJACK': 'blackjack',
  '/PLINKO': 'plinko',
  '/plinko-dashboard': 'plinko',
  '/lottery': 'lottery',
  '/keno': 'keno',
  '/keno-dashboard': 'keno',
};

const OTHER_GAMES = [
  { label: 'Plinko', href: '/PLINKO', icon: 'fa-circle' },
  { label: 'Blackjack', href: '/BLACKJACK', icon: 'blackjack' },
  { label: 'Lottery', href: '/lottery', icon: 'fa-ticket-alt' },
  { label: 'Keno', href: '/keno', icon: 'fa-th' },
] as const;

const SIDEBAR_PANEL_STYLE = {
  background: 'rgba(74, 103, 125, 0.31)',
  backdropFilter: 'blur(4px)',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.67), inset 0 -3px 6px rgba(0, 0, 0, 0.65), 0 1px 3px rgba(17, 179, 208, 0.86)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
} as const;

export interface GlobalMainNavProps {
  children?: React.ReactNode;
  /** Override auto-detected page from pathname */
  page?: NavPage;

  // Common
  profileDisplayName?: string | null;
  profileImageUrl?: string | null;
  onOpenProfileSettings?: () => void;
  onOpenDepositModal?: () => void;
  reserveBalance?: bigint;

  // Blackjack
  currentView?: 'game' | 'history' | 'stats' | 'analytics';
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics') => void;
  theme?: BlackjackThemeKind;
  onThemeChange?: (theme: BlackjackThemeKind) => void;
  imageSource?: string;
  onImageSourceChange?: (id: string) => void;
  videoSource?: string;
  onVideoSourceChange?: (id: string) => void;
  imageOptions?: TableOption[];
  videoOptions?: TableOption[];
  videoSyncToClock?: boolean;
  onVideoSyncToClockChange?: (sync: boolean) => void;
  videoPosition?: number;
  onVideoPositionChange?: (position: number) => void;
  soundEnabled?: boolean;
  onSoundChange?: (enabled: boolean) => void;
  themeModalOpen?: boolean;
  onThemeModalOpenChange?: (open: boolean) => void;
  onTournamentLobby?: () => void;
  musicTrackName?: string;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  onNextTrack?: () => void;

  // Plinko
  onShowPlinkoHistory?: () => void;
  onOpenHowToPlay?: () => void;
  onOpenSwap?: () => void;
  onPlinkoSoundToggle?: () => void;
  plinkoSoundEnabled?: boolean;

  // Lottery
  onShowLotteryHistory?: () => void;
  onShowLotteryDashboard?: () => void;

  // Keno
  onShowKenoPrizePool?: () => void;
  onShowKenoHistory?: () => void;

  /** Open player profile modal (game-specific dashboard). When set, sidebar Dashboard uses this. Pass no arg on home for "all games" with dropdown; pass game on Plinko/Keno to open that game. */
  onOpenPlayerProfile?: (game?: 'plinko' | 'keno' | 'lottery' | 'blackjack') => void;

  // Home / shared
  showBackArrow?: boolean;
  backArrowHref?: string;
  backArrowLabel?: string;
  onOpenResponsibleGaming?: () => void;
  onOpenAuthModal?: () => void;
  isAuthenticated?: boolean;
  onSignOut?: () => void;

  /** When true, sidebar cannot be opened (e.g. during active Plinko game) */
  sidebarDisabled?: boolean;

  /** Optional content for the center of the mobile nav bar (e.g. poker hole cards). Rendered only on mobile. */
  mobileBarCenterContent?: React.ReactNode;
}

function useNavPage(pageProp?: NavPage): NavPage {
  const pathname = usePathname();
  if (pageProp) return pageProp;
  for (const [path, p] of Object.entries(PATH_TO_PAGE)) {
    if (pathname?.startsWith(path)) return p;
  }
  return 'home';
}

function LanguageSelect({ open }: { open: boolean }) {
  const { locale, setLocale, localeLabel } = useLocale();
  return (
    <div className="px-2 py-2">
      <motion.div animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="flex items-center gap-2">
        <span className="text-sm text-white whitespace-nowrap truncate min-w-0">{localeLabel}</span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as typeof locale)}
          className="flex-1 min-w-0 text-sm bg-white/10 text-white border border-white/20 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500/50 appearance-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23fff'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.25rem center', backgroundSize: '1rem', paddingRight: '1.5rem' }}
          aria-label="Select language"
        >
          {SUPPORTED_LOCALES.map(({ code, label }) => (
            <option key={code} value={code} className="bg-slate-800 text-white">
              {label}
            </option>
          ))}
        </select>
      </motion.div>
    </div>
  );
}

function NavContent(props: {
  page: NavPage;
  onOpenDepositModal?: () => void;
  currentView?: string;
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics') => void;
  setThemeModalOpen: (open: boolean) => void;
  onTournamentLobby?: () => void;
  onThemeChange?: (theme: BlackjackThemeKind) => void;
  soundEnabled?: boolean;
  onSoundChange?: (enabled: boolean) => void;
  profileDisplayName?: string | null;
  profileImageUrl?: string | null;
  onOpenProfileSettings?: () => void;
  musicTrackName?: string;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  onNextTrack?: () => void;
  isDeployer: boolean;
  isAdmin: boolean;
  isConnected: boolean;
  onShowPlinkoHistory?: () => void;
  onOpenHowToPlay?: () => void;
  onOpenSwap?: () => void;
  onPlinkoSoundToggle?: () => void;
  plinkoSoundEnabled?: boolean;
  onShowLotteryHistory?: () => void;
  onShowLotteryDashboard?: () => void;
  onShowKenoPrizePool?: () => void;
  onShowKenoHistory?: () => void;
  onOpenPlayerProfile?: (game?: 'plinko' | 'keno' | 'lottery' | 'blackjack') => void;
  showBackArrow?: boolean;
  backArrowHref?: string;
  backArrowLabel?: string;
  onOpenResponsibleGaming?: () => void;
  onOpenAuthModal?: () => void;
  isAuthenticated?: boolean;
  onSignOut?: () => void;
  onOpenReport: () => void;
  onOpenProfileModal?: () => void;
}) {
  const { open } = useSidebar();
  const {
    page,
    onOpenDepositModal,
    currentView = 'game',
    onViewChange,
    setThemeModalOpen,
    onTournamentLobby,
    onThemeChange,
    soundEnabled = true,
    onSoundChange,
    profileDisplayName,
    profileImageUrl,
    onOpenProfileSettings,
    musicTrackName,
    isMusicPlaying,
    onToggleMusic,
    onNextTrack,
    isDeployer,
    isAdmin,
    isConnected,
    onShowPlinkoHistory,
    onOpenHowToPlay,
    onOpenSwap,
    onPlinkoSoundToggle,
    plinkoSoundEnabled = true,
    onShowLotteryHistory,
    onShowLotteryDashboard,
    onShowKenoPrizePool,
    onShowKenoHistory,
    onOpenPlayerProfile,
    showBackArrow,
    backArrowHref,
    backArrowLabel,
    onOpenResponsibleGaming,
    onOpenAuthModal,
    isAuthenticated,
    onSignOut,
    onOpenReport,
    onOpenProfileModal,
  } = props;

  const navItem = (label: string, icon: string, active?: boolean) =>
    `text-white shrink-0 ${active ? 'text-cyan-400' : ''}`;
  const btnClass = (active: boolean) =>
    active ? 'bg-cyan-500/20 text-cyan-300' : 'text-white hover:bg-white/5';

  const otherGamesFiltered = OTHER_GAMES.filter((g) => {
    const gamePage = g.href === '/BLACKJACK' ? 'blackjack' : g.href === '/PLINKO' ? 'plinko' : g.href === '/lottery' ? 'lottery' : 'keno';
    return gamePage !== page;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back arrow (when showBackArrow) */}
      {showBackArrow && backArrowHref && (
        <div className="shrink-0 py-2">
          <Link
            href={backArrowHref}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors px-2"
            title={backArrowLabel}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-sm whitespace-nowrap">
              {backArrowLabel || 'Back'}
            </motion.span>
          </Link>
        </div>
      )}
      {/* Logo / Brand */}
      <div className="shrink-0 py-4">
        <Link href="/" className="flex items-center gap-2 group/sidebar" aria-label="MORBIUS.IO Home">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <Image src="/morbius/MorbiusLogo (3).png" alt="" width={24} height={24} className="object-contain" />
          </span>
          <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-base font-semibold text-white whitespace-nowrap overflow-hidden">
            MORBIUS.IO
          </motion.span>
        </Link>
      </div>

      {/* Wallet */}
      <div className="shrink-0 py-2">
        <WalletMenu
          onOpenDepositModal={onOpenDepositModal}
          profileDisplayName={profileDisplayName}
          profileImageUrl={profileImageUrl}
          onOpenProfileSettings={onOpenProfileSettings}
          dropdownPlacement="below"
          variant="sidebar"
          sidebarOpen={open}
        />
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 space-y-0.5">
        <SidebarLink link={{ label: 'Home', href: '/', icon: <i className="fas fa-home w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />

        {/* Page-specific primary nav (Blackjack: Play, Analytics, Tournament, Table theme, Sound) */}
        {page === 'blackjack' && (
          <>
            <SidebarButton label="Play" icon={<i className={`fas fa-play w-5 text-center shrink-0 ${navItem('', 'fa-play', currentView === 'game')}`} aria-hidden />} onClick={() => onViewChange?.('game')} active={currentView === 'game'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'game')}`} />
            {isAdmin && (
              <a href="/blackjack-multi" className="w-full">
                <SidebarButton label="Multiplayer" icon={<i className="fas fa-users w-5 text-center text-cyan-400 shrink-0" aria-hidden />} className="rounded-lg px-2 py-2 transition-colors text-white hover:bg-white/5 w-full" />
              </a>
            )}
            {isDeployer && (
              <SidebarButton label="Analytics" icon={<i className={`fas fa-chart-line w-5 text-center shrink-0 ${navItem('', 'fa-chart-line', currentView === 'analytics')}`} aria-hidden />} onClick={() => onViewChange?.('analytics')} active={currentView === 'analytics'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'analytics')}`} />
            )}
            {/* {onTournamentLobby && (
              <SidebarButton label="Tournament Lobby" icon={<i className="fas fa-trophy w-5 text-center text-white shrink-0" aria-hidden />} onClick={onTournamentLobby} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
            )} */}
            {onThemeChange && (
              <SidebarButton label="Table theme" icon={<i className="fas fa-palette w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => setThemeModalOpen(true)} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
            )}
            {onSoundChange !== undefined && (
              <SidebarButton label={soundEnabled ? 'Sound On' : 'Sound Off'} icon={<i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-5 text-center shrink-0 ${soundEnabled ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={() => onSoundChange(!soundEnabled)} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
            )}
          </>
        )}

        {page === 'plinko' && onPlinkoSoundToggle !== undefined && (
          <SidebarButton label={plinkoSoundEnabled ? 'Sound On' : 'Sound Off'} icon={<i className={`fas ${plinkoSoundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-5 text-center shrink-0 ${plinkoSoundEnabled ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={onPlinkoSoundToggle} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
        )}

        {/* My Stuff - page-specific */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">My Stuff</motion.span>
          </div>

          {page === 'blackjack' && (
            <>
              <SidebarButton label="Dashboard" icon={<i className={`fas fa-chart-bar w-5 text-center shrink-0 ${currentView === 'stats' ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={() => onViewChange?.('stats')} active={currentView === 'stats'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'stats')}`} />
            </>
          )}

          {page === 'plinko' && (
            <>
              {onOpenHowToPlay && <SidebarButton label="How to Play" icon={<i className="fas fa-question-circle w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenHowToPlay} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="Dashboard" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => onOpenPlayerProfile('plinko')} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
              ) : (
                <SidebarLink link={{ label: 'Dashboard', href: '/plinko-dashboard', icon: <i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
              )}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenSwap} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />}
            </>
          )}

          {page === 'lottery' && (
            <>
              {onShowLotteryDashboard && <SidebarButton label="Dashboard" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowLotteryDashboard} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenSwap} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />}
            </>
          )}

          {page === 'keno' && (
            <>
              {onShowKenoPrizePool && <SidebarButton label="Prize Pool" icon={<i className="fas fa-trophy w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowKenoPrizePool} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="Dashboard" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => onOpenPlayerProfile('keno')} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
              ) : (
                <SidebarLink link={{ label: 'Dashboard', href: '/keno-dashboard', icon: <i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
              )}
            </>
          )}

          {page === 'home' && onOpenPlayerProfile && (
            <SidebarButton label="Player Dashboard" icon={<i className="fas fa-chart-pie w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => onOpenPlayerProfile()} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          )}

          <SidebarButton label="Profile" icon={<i className="fas fa-user-edit w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => onOpenProfileSettings ? onOpenProfileSettings() : onOpenProfileModal?.()} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarButton label="Avatar" icon={<i className="fas fa-user-circle w-5 text-center text-white shrink-0" aria-hidden />} onClick={() => onOpenProfileModal?.()} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarLink link={{ label: 'Claim Morbius', href: '/staking', icon: <i className="fas fa-gift w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
        </div>

        {/* Other Games - exclude current page */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">Other Games</motion.span>
          </div>
          {otherGamesFiltered.map((g) => (
            <SidebarLink
              key={g.href}
              link={{
                label: g.label,
                href: g.href,
                icon: g.icon === 'blackjack' ? (
                  <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
                    <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
                  </span>
                ) : (
                  <i className={`fas ${g.icon} w-5 text-center text-white shrink-0`} aria-hidden />
                ),
              }}
              className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
            />
          ))}
        </div>

        {/* Advertising */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">Advertising</motion.span>
          </div>
          <SidebarLink link={{ label: 'Add Table', href: '/marketing', icon: <i className="fas fa-plus-square w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarLink link={{ label: 'Marketing', href: '/marketing', icon: <i className="fas fa-bullhorn w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
        </div>

        {/* Other */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">Other</motion.span>
          </div>
          <SidebarButton label="Responsible Gaming" icon={<i className="fas fa-shield-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenResponsibleGaming} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarButton label="Report Issue" icon={<i className="fas fa-flag w-5 text-center text-red-400/80 shrink-0" aria-hidden />} onClick={onOpenReport} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarLink link={{ label: 'Token Analyzer', href: 'https://scan.morbius.io', icon: <i className="fas fa-search w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Morb-It', href: '/Morb-It', icon: <i className="fas fa-gamepad w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          {isAdmin && (
            <SidebarLink link={{ label: 'Admin', href: '/admin', icon: <i className="fas fa-cog w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          )}
        </div>

        {/* Language */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">Language</motion.span>
          </div>
          <LanguageSelect open={open} />
        </div>

        {/* Morbius */}
        <div className="pt-2 mt-2 border-t border-white/10 overflow-hidden">
          <div className="px-2 py-1">
            <motion.span animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="text-xs text-white uppercase tracking-wider whitespace-nowrap">Morbius</motion.span>
          </div>
          <motion.div animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="px-2 py-1">
            <MorbiusBurnedDisplay variant="inline" className="text-white text-xs" labelClassName="text-white text-xs" />
          </motion.div>
          <motion.div animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="px-2 py-1">
            <MorbiusPriceDisplay className="text-white text-xs" labelClassName="text-white text-xs" />
          </motion.div>
          <SidebarLink link={{ label: 'Earn', href: '/staking', icon: <i className="fas fa-coins w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarLink link={{ label: 'Swap', href: '/swap', icon: <i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
          <SidebarLink link={{ label: 'Provide LP', href: 'https://pulsex.com', icon: <i className="fas fa-tint w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Chart', href: 'https://scan.morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart', icon: <i className="fas fa-chart-line w-5 text-center text-white shrink-0" aria-hidden /> }} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" target="_blank" rel="noopener noreferrer" />
        </div>
      </nav>

      {/* Bottom: Music (Blackjack only) + Auth (home) */}
      <div className="shrink-0 pt-2 border-t border-white/10 space-y-2">
        {page === 'home' && onOpenAuthModal && !isAuthenticated && (
          <SidebarButton label="Sign In" icon={<i className="fas fa-shield w-5 text-center text-cyan-400 shrink-0" aria-hidden />} onClick={onOpenAuthModal} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
        )}
        {page === 'home' && onSignOut && isAuthenticated && (
          <SidebarButton label="Sign Out" icon={<i className="fas fa-sign-out-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onSignOut} className="text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors" />
        )}
        {page === 'blackjack' && musicTrackName && onToggleMusic && open && (
          <div className="px-2 py-2 rounded-lg bg-white/5 border border-cyan-500/20 flex items-center gap-2">
            <span className="text-white text-xs font-medium truncate flex-1 min-w-0" title={musicTrackName}>{musicTrackName}</span>
            <button type="button" onClick={onToggleMusic} className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0" aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}>
              {isMusicPlaying ? <i className="fas fa-pause text-xs" /> : <i className="fas fa-play text-xs" />}
            </button>
            {onNextTrack && (
              <button type="button" onClick={onNextTrack} className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0" aria-label="Next track">
                <i className="fas fa-forward text-xs" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlobalMainNav({
  children,
  page: pageProp,
  profileDisplayName,
  profileImageUrl,
  onOpenProfileSettings,
  onOpenDepositModal,
  reserveBalance,
  currentView = 'game',
  onViewChange,
  theme = 'video',
  onThemeChange,
  imageSource,
  onImageSourceChange,
  videoSource = 'glowingTable',
  onVideoSourceChange,
  imageOptions,
  videoOptions,
  videoSyncToClock = true,
  onVideoSyncToClockChange,
  videoPosition = 50,
  onVideoPositionChange,
  soundEnabled = true,
  onSoundChange,
  themeModalOpen: themeModalOpenProp,
  onThemeModalOpenChange,
  onTournamentLobby,
  musicTrackName,
  isMusicPlaying,
  onToggleMusic,
  onNextTrack,
  onShowPlinkoHistory,
  onOpenHowToPlay,
  onOpenSwap,
  onPlinkoSoundToggle,
  plinkoSoundEnabled = true,
  onShowLotteryHistory,
  onShowLotteryDashboard,
  onShowKenoPrizePool,
  onShowKenoHistory,
  onOpenPlayerProfile,
  showBackArrow,
  backArrowHref,
  backArrowLabel,
  onOpenResponsibleGaming,
  onOpenAuthModal,
  isAuthenticated,
  onSignOut,
  sidebarDisabled,
  mobileBarCenterContent,
}: GlobalMainNavProps) {
  const { gameLocked } = useGameLock();
  const page = useNavPage(pageProp);
  const { address, isConnected } = useAccount();
  const { profileDisplayName: profileDisplayNameFromHook, profileImageUrl: profileImageUrlFromHook, bio: bioFromHook, xHandle: xHandleFromHook, tgHandle: tgHandleFromHook } = useProfile();
  const [responsibleGamingOpen, setResponsibleGamingOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [internalThemeModalOpen, setInternalThemeModalOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [profileAvatarModalOpen, setProfileAvatarModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const effectiveOnOpenResponsibleGaming = onOpenResponsibleGaming ?? (() => setResponsibleGamingOpen(true));
  const effectiveProfileDisplayName = profileDisplayName ?? profileDisplayNameFromHook;
  const effectiveProfileImageUrl = profileImageUrl ?? profileImageUrlFromHook;

  const handleInternalSaveProfile = async (name: string, img: string | null, bio: string | null, x: string | null, tg: string | null) => {
    if (!address) return;
    const res = await fetch('/api/player/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, displayName: name, profileImageUrl: img, bio, xHandle: x, tgHandle: tg }),
    });
    if (!res.ok) throw new Error('Failed to save profile');
    queryClient.invalidateQueries({ queryKey: ['playerProfile'] });
  };
  const effectiveOnOpenProfileSettings = onOpenProfileSettings ?? (() => setProfileSettingsOpen(true));

  const isThemeModalControlled = onThemeModalOpenChange !== undefined;
  const themeModalOpen = isThemeModalControlled ? (themeModalOpenProp ?? false) : internalThemeModalOpen;
  const setThemeModalOpen = isThemeModalControlled ? onThemeModalOpenChange : setInternalThemeModalOpen;

  const isDeployer = Boolean(address && BLACKJACK_DEPLOYER_WALLET && address.toLowerCase() === BLACKJACK_DEPLOYER_WALLET);
  const isAdmin = isAdminWallet(address);

  const handleOpenHowToPlay = onOpenHowToPlay ?? (() => setHowToPlayOpen(true));
  const handleOpenSwap = onOpenSwap ?? (() => setSwapOpen(true));

  const mobileBarContent = (
    <div className="flex items-center gap-2 min-w-0">
      <WalletMenu
        onOpenDepositModal={onOpenDepositModal}
        profileDisplayName={effectiveProfileDisplayName}
        profileImageUrl={effectiveProfileImageUrl}
        onOpenProfileSettings={effectiveOnOpenProfileSettings}
        dropdownPlacement="below"
        variant="default"
        className="shrink-0"
      />
    </div>
  );

  return (
    <Sidebar mobileBarContent={mobileBarContent} mobileBarCenterContent={mobileBarCenterContent} disabled={sidebarDisabled || gameLocked}>
      <div className="flex flex-col md:flex-row min-h-screen w-full">
        <SidebarBody className="shrink-0" style={SIDEBAR_PANEL_STYLE}>
          <NavContent
            page={page}
            onOpenDepositModal={onOpenDepositModal}
            currentView={currentView}
            onViewChange={onViewChange}
            setThemeModalOpen={setThemeModalOpen}
            onTournamentLobby={onTournamentLobby}
            onThemeChange={onThemeChange}
            soundEnabled={soundEnabled}
            onSoundChange={onSoundChange}
            profileDisplayName={effectiveProfileDisplayName}
            profileImageUrl={effectiveProfileImageUrl}
            onOpenProfileSettings={effectiveOnOpenProfileSettings}
            musicTrackName={musicTrackName}
            isMusicPlaying={isMusicPlaying}
            onToggleMusic={onToggleMusic}
            onNextTrack={onNextTrack}
            isDeployer={isDeployer}
            isAdmin={isAdmin}
            isConnected={isConnected}
            onShowPlinkoHistory={onShowPlinkoHistory}
            onOpenHowToPlay={page === 'plinko' ? handleOpenHowToPlay : undefined}
            onOpenSwap={(page === 'plinko' || page === 'lottery') ? handleOpenSwap : undefined}
            onPlinkoSoundToggle={onPlinkoSoundToggle}
            plinkoSoundEnabled={plinkoSoundEnabled}
            onShowLotteryHistory={onShowLotteryHistory}
            onShowLotteryDashboard={onShowLotteryDashboard}
            onShowKenoPrizePool={onShowKenoPrizePool}
            onShowKenoHistory={onShowKenoHistory}
            onOpenPlayerProfile={onOpenPlayerProfile}
            showBackArrow={showBackArrow}
            backArrowHref={backArrowHref}
            backArrowLabel={backArrowLabel}
            onOpenResponsibleGaming={effectiveOnOpenResponsibleGaming}
            onOpenAuthModal={onOpenAuthModal}
            isAuthenticated={isAuthenticated}
            onSignOut={onSignOut}
            onOpenReport={() => setReportOpen(true)}
            onOpenProfileModal={() => setProfileAvatarModalOpen(true)}
          />
        </SidebarBody>
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-x-hidden pt-14 md:pt-0" style={gameLocked ? { position: 'relative', zIndex: 100002 } : undefined}>{children}</div>
      </div>

      {page === 'blackjack' && onThemeChange && (
        <ThemeSelectionModal
          open={themeModalOpen}
          onClose={() => setThemeModalOpen(false)}
          theme={theme}
          imageSource={imageSource ?? DEFAULT_BLACKJACK_IMAGE_ID}
          videoSource={videoSource}
          onThemeChange={onThemeChange}
          onImageSourceChange={onImageSourceChange ?? (() => {})}
          onVideoSourceChange={onVideoSourceChange ?? (() => {})}
          imageOptions={imageOptions}
          videoOptions={videoOptions}
          videoSyncToClock={videoSyncToClock}
          onVideoSyncToClockChange={onVideoSyncToClockChange ?? (() => {})}
          videoPosition={videoPosition}
          onVideoPositionChange={onVideoPositionChange ?? (() => {})}
        />
      )}

      {page === 'plinko' && <HowToPlayModal open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />}
      {(page === 'plinko' || page === 'lottery') && <SwapModal open={swapOpen} onOpenChange={setSwapOpen} />}
      <SelfExclusionModal
        isOpen={responsibleGamingOpen}
        onClose={() => setResponsibleGamingOpen(false)}
      />
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        balance={reserveBalance}
      />
      <ProfileAvatarModal
        open={profileAvatarModalOpen}
        onClose={() => setProfileAvatarModalOpen(false)}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['playerProfile'] })}
      />
      {!onOpenProfileSettings && (
        <ProfileSettingsModal
          open={profileSettingsOpen}
          onClose={() => setProfileSettingsOpen(false)}
          displayName={effectiveProfileDisplayName ?? ''}
          profileImageUrl={effectiveProfileImageUrl}
          bio={bioFromHook}
          xHandle={xHandleFromHook}
          tgHandle={tgHandleFromHook}
          onSave={handleInternalSaveProfile}
        />
      )}
    </Sidebar>
  );
}
