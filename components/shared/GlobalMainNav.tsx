'use client'

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGameLock } from '@/contexts/game-lock-context';
import { useLocale, SUPPORTED_LOCALES } from '@/contexts/locale-context';
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
import { useQueryClient } from '@tanstack/react-query';
// Install console.error interceptor for bug reports (browser only, no-op on server)
import '@/lib/error-log';
import { useInstallAppHelpDialog } from '@/contexts/install-app-help-dialog-context';

// Lazy-load modals — only pulled into the bundle when first opened
const ThemeSelectionModal = lazy(() => import('@/components/BLACKJACK/ThemeSelectionModal'));
const HowToPlayModal = lazy(() => import('@/components/PLINKO/HowToPlayModal'));
const SwapModal = lazy(() => import('@/components/PLINKO/SwapModal'));
const GameWalletModal = lazy(() => import('@/components/shared/GameWalletModal').then(m => ({ default: m.GameWalletModal })));
const SelfExclusionModal = lazy(() => import('@/components/ResponsibleGaming/SelfExclusionModal').then(m => ({ default: m.SelfExclusionModal })));
const ReportModal = lazy(() => import('@/components/shared/ReportModal').then(m => ({ default: m.ReportModal })));
const ProfileAvatarModal = lazy(() => import('@/components/shared/ProfileAvatarModal').then(m => ({ default: m.ProfileAvatarModal })));
const ProfileSettingsModal = lazy(() => import('@/components/shared/ProfileSettingsModal'));

export type NavPage = 'blackjack' | 'plinko' | 'lottery' | 'keno' | 'home' | 'poker' | 'blackjackMulti';

const PATH_TO_PAGE: Record<string, NavPage> = {
  '/BLACKJACK': 'blackjack',
  '/PLINKO': 'plinko',
  '/lottery': 'lottery',
  '/keno': 'keno',
  '/poker': 'poker',
  '/blackjack-multi': 'blackjackMulti',
};

type OtherGameNavItem =
  | { label: string; href: string; icon: 'blackjack' | `fa-${string}` }
  | { label: string; icon: 'blackjack' | `fa-${string}`; comingSoon: true };

function isOtherGameLinked(g: OtherGameNavItem): g is Extract<OtherGameNavItem, { href: string }> {
  return 'href' in g;
}

const OTHER_GAMES: readonly OtherGameNavItem[] = [
  { label: 'Plinko', href: '/PLINKO', icon: 'fa-circle' },
  { label: 'Blackjack', href: '/BLACKJACK', icon: 'blackjack' },
  { label: 'Multiplayer BJ', href: '/blackjack-multi', icon: 'fa-user-friends' },
  { label: 'Lottery', href: '/lottery', icon: 'fa-ticket-alt' },
  { label: 'Keno', href: '/keno', icon: 'fa-th' },
];

/** Section header — uses CSS .sidebar-label for transition, no context needed */
const SectionLabel = React.memo(function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 overflow-hidden">
      <span className="sidebar-label text-xs text-white uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
});

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

  /** Open player profile modal (game-specific history/stats). When set, sidebar "My History" uses this. Pass no arg on home for "all games" with dropdown; pass game on Plinko/Keno to open that game. */
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

const LanguageSelect = React.memo(function LanguageSelect() {
  const { locale, setLocale, localeLabel } = useLocale();
  return (
    <div className="px-2 py-2 sidebar-label">
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
});

const otherGameIcon = (g: OtherGameNavItem) =>
  g.icon === 'blackjack' ? (
    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
      <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
    </span>
  ) : (
    <i className={`fas ${g.icon} w-5 text-center text-white shrink-0`} aria-hidden />
  );

const NAV_ITEM_CLASS = 'text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors';

interface NavContentProps {
  page: NavPage;
  onOpenDepositModal?: () => void;
  currentView?: string;
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics') => void;
  setThemeModalOpen: (open: boolean) => void;
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
  onShowPlinkoHistory?: () => void;
  onOpenHowToPlay?: () => void;
  onOpenSwap?: () => void;
  onPlinkoSoundToggle?: () => void;
  plinkoSoundEnabled?: boolean;
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
  onOpenInstallAppHelp?: () => void;
}

const NavContent = React.memo(function NavContent(props: NavContentProps) {
  const { open } = useSidebar();
  const {
    page,
    onOpenDepositModal,
    currentView = 'game',
    onViewChange,
    setThemeModalOpen,
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
    onShowPlinkoHistory,
    onOpenHowToPlay,
    onOpenSwap,
    onPlinkoSoundToggle,
    plinkoSoundEnabled = true,
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
    onOpenInstallAppHelp,
  } = props;

  const btnClass = (active: boolean) =>
    active ? 'bg-cyan-500/20 text-cyan-300' : 'text-white hover:bg-white/5';

  const otherGamesFiltered = useMemo(
    () =>
      OTHER_GAMES.filter((g) => {
        if ('comingSoon' in g && g.comingSoon) return true;
        if (!isOtherGameLinked(g)) return false;
        const gamePage = PATH_TO_PAGE[g.href] ?? 'home';
        return gamePage !== page;
      }),
    [page],
  );

  const handleOpenThemeModal = useCallback(() => setThemeModalOpen(true), [setThemeModalOpen]);
  const handleToggleSound = useCallback(() => onSoundChange?.(!soundEnabled), [onSoundChange, soundEnabled]);
  const handleOpenPlinkoProfile = useCallback(() => onOpenPlayerProfile?.('plinko'), [onOpenPlayerProfile]);
  const handleOpenKenoProfile = useCallback(() => onOpenPlayerProfile?.('keno'), [onOpenPlayerProfile]);
  const handleOpenAllProfile = useCallback(() => onOpenPlayerProfile?.(), [onOpenPlayerProfile]);
  const handleOpenProfileOrModal = useCallback(() => {
    if (onOpenProfileSettings) onOpenProfileSettings();
    else onOpenProfileModal?.();
  }, [onOpenProfileSettings, onOpenProfileModal]);
  const handleOpenProfileModal = useCallback(() => onOpenProfileModal?.(), [onOpenProfileModal]);

  return (
    <div className="flex flex-col h-full overflow-hidden [&_*]:animate-none [&_*]:transition-none">
      {/* Back arrow (when showBackArrow) */}
      {showBackArrow && backArrowHref && (
        <div className="shrink-0 py-2">
          <Link
            href={backArrowHref}
            className="sidebar-item flex items-center text-white/70 hover:text-white transition-colors px-2"
            title={backArrowLabel}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="sidebar-label text-sm">
              {backArrowLabel || 'Back'}
            </span>
          </Link>
        </div>
      )}
      {/* Logo / Brand */}
      <div className="shrink-0 py-4">
        <Link href="/" className="sidebar-item flex items-center group/sidebar" aria-label="MORBIUS.IO Home">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <Image src="/morbius/MorbiusLogo (3).png" alt="" width={24} height={24} className="object-contain" />
          </span>
          <span className="sidebar-label text-base font-semibold text-white">
            MORBIUS.IO
          </span>
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
          staticAvatarOnly
        />
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 space-y-0.5">
        <SidebarLink link={{ label: 'Home', href: '/', icon: <i className="fas fa-home w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />

        {/* Page-specific primary nav */}
        {page === 'blackjack' && (
          <>
            <SidebarButton label="Play" icon={<i className={`fas fa-play w-5 text-center shrink-0 ${currentView === 'game' ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={() => onViewChange?.('game')} active={currentView === 'game'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'game')}`} />
            {isDeployer && (
              <SidebarButton label="Analytics" icon={<i className={`fas fa-chart-line w-5 text-center shrink-0 ${currentView === 'analytics' ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={() => onViewChange?.('analytics')} active={currentView === 'analytics'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'analytics')}`} />
            )}
            {onThemeChange && (
              <SidebarButton label="Table theme" icon={<i className="fas fa-palette w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenThemeModal} className={NAV_ITEM_CLASS} />
            )}
            {onSoundChange !== undefined && (
              <SidebarButton label={soundEnabled ? 'Sound On' : 'Sound Off'} icon={<i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-5 text-center shrink-0 ${soundEnabled ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={handleToggleSound} className={NAV_ITEM_CLASS} />
            )}
          </>
        )}

        {page === 'plinko' && onPlinkoSoundToggle !== undefined && (
          <SidebarButton label={plinkoSoundEnabled ? 'Sound On' : 'Sound Off'} icon={<i className={`fas ${plinkoSoundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-5 text-center shrink-0 ${plinkoSoundEnabled ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={onPlinkoSoundToggle} className={NAV_ITEM_CLASS} />
        )}

        {/* My Stuff */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="My Stuff" />

          {page === 'blackjack' && (
            <SidebarButton label="My History" icon={<i className={`fas fa-chart-bar w-5 text-center shrink-0 ${currentView === 'stats' ? 'text-cyan-400' : 'text-white'}`} aria-hidden />} onClick={() => onViewChange?.('stats')} active={currentView === 'stats'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'stats')}`} />
          )}

          {page === 'plinko' && (
            <>
              {onOpenHowToPlay && <SidebarButton label="How to Play" icon={<i className="fas fa-question-circle w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenHowToPlay} className={NAV_ITEM_CLASS} />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="My History" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenPlinkoProfile} className={NAV_ITEM_CLASS} />
              ) : onShowPlinkoHistory ? (
                <SidebarButton label="My History" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowPlinkoHistory} className={NAV_ITEM_CLASS} />
              ) : (
                <SidebarLink link={{ label: 'My History', href: '/PLINKO', icon: <i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
              )}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenSwap} className={NAV_ITEM_CLASS} />}
            </>
          )}

          {page === 'lottery' && (
            <>
              {onShowLotteryDashboard && <SidebarButton label="My History" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowLotteryDashboard} className={NAV_ITEM_CLASS} />}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenSwap} className={NAV_ITEM_CLASS} />}
            </>
          )}

          {page === 'keno' && (
            <>
              {onShowKenoPrizePool && <SidebarButton label="Prize Pool" icon={<i className="fas fa-trophy w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowKenoPrizePool} className={NAV_ITEM_CLASS} />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="My History" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenKenoProfile} className={NAV_ITEM_CLASS} />
              ) : onShowKenoHistory ? (
                <SidebarButton label="My History" icon={<i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden />} onClick={onShowKenoHistory} className={NAV_ITEM_CLASS} />
              ) : (
                <SidebarLink link={{ label: 'My History', href: '/keno', icon: <i className="fas fa-chart-bar w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
              )}
            </>
          )}

          {page === 'home' && onOpenPlayerProfile && (
            <SidebarButton label="Player Dashboard" icon={<i className="fas fa-chart-pie w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenAllProfile} className={NAV_ITEM_CLASS} />
          )}

          <SidebarButton label="Profile" icon={<i className="fas fa-user-edit w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenProfileOrModal} className={NAV_ITEM_CLASS} />
          <SidebarButton label="Avatar" icon={<i className="fas fa-user-circle w-5 text-center text-white shrink-0" aria-hidden />} onClick={handleOpenProfileModal} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Claim Morbius', href: '/claim', icon: <i className="fas fa-gift w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
        </div>

        {/* Other Games */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="Other Games" />
          {otherGamesFiltered.map((g) =>
            'comingSoon' in g && g.comingSoon ? (
              <div
                key={g.label}
                className="flex items-center justify-start gap-2 rounded-lg px-2 py-2 text-white/70 cursor-default select-none"
                aria-disabled="true"
              >
                {otherGameIcon(g)}
                <div className="flex flex-col min-w-0 items-start">
                  <span className="text-sm font-medium text-white/90 leading-tight">{g.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-amber-400/85">Under construction</span>
                </div>
              </div>
            ) : isOtherGameLinked(g) ? (
              <SidebarLink
                key={g.href}
                link={{
                  label: g.label,
                  href: g.href,
                  icon: otherGameIcon(g),
                }}
                className={NAV_ITEM_CLASS}
              />
            ) : null
          )}
        </div>

        {/* Advertising */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="Advertising" />
          <SidebarLink link={{ label: 'Add Table', href: '/marketing', icon: <i className="fas fa-plus-square w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Marketing', href: '/marketing', icon: <i className="fas fa-bullhorn w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
        </div>

        {/* Other */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="Other" />
          {onOpenInstallAppHelp ? (
            <SidebarButton
              label="Install app"
              icon={<i className="fas fa-download w-5 text-center shrink-0" aria-hidden />}
              onClick={onOpenInstallAppHelp}
              className={`${NAV_ITEM_CLASS} text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300`}
            />
          ) : null}
          <SidebarButton label="Responsible Gaming" icon={<i className="fas fa-shield-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onOpenResponsibleGaming} className={NAV_ITEM_CLASS} />
          <SidebarButton label="Report Issue" icon={<i className="fas fa-flag w-5 text-center text-red-400/80 shrink-0" aria-hidden />} onClick={onOpenReport} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Token Analyzer', href: 'https://scan.morbius.io', icon: <i className="fas fa-search w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Morb-It', href: '/Morb-It', icon: <i className="fas fa-gamepad w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
          {isAdmin && (
            <SidebarLink link={{ label: 'Admin', href: '/admin', icon: <i className="fas fa-cog w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
          )}
        </div>

        {/* Language */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="Language" />
          <LanguageSelect />
        </div>

        {/* Morbius — only mount data-fetching components when sidebar is open */}
        <div className="pt-2 mt-2 border-t border-white/10 overflow-hidden">
          <SectionLabel label="Morbius" />
          {open && (
            <>
              <div className="px-2 py-1">
                <MorbiusBurnedDisplay variant="inline" className="text-white text-xs" labelClassName="text-white text-xs" useAnimatedNumbers={false} />
              </div>
              <div className="px-2 py-1">
                <MorbiusPriceDisplay className="text-white text-xs" labelClassName="text-white text-xs" />
              </div>
            </>
          )}
          <SidebarLink link={{ label: 'Claim', href: '/claim', icon: <i className="fas fa-coins w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Swap', href: '/swap', icon: <i className="fas fa-exchange-alt w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Provide LP', href: 'https://pulsex.com', icon: <i className="fas fa-tint w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Chart', href: 'https://scan.morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart', icon: <i className="fas fa-chart-line w-5 text-center text-white shrink-0" aria-hidden /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
        </div>
      </nav>

      {/* Bottom: Music (Blackjack only) + Auth (home) */}
      <div className="shrink-0 pt-2 border-t border-white/10 space-y-2">
        {page === 'home' && onOpenAuthModal && !isAuthenticated && (
          <SidebarButton label="Sign In" icon={<i className="fas fa-shield w-5 text-center text-cyan-400 shrink-0" aria-hidden />} onClick={onOpenAuthModal} className={NAV_ITEM_CLASS} />
        )}
        {page === 'home' && onSignOut && isAuthenticated && (
          <SidebarButton label="Sign Out" icon={<i className="fas fa-sign-out-alt w-5 text-center text-white shrink-0" aria-hidden />} onClick={onSignOut} className={NAV_ITEM_CLASS} />
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
});

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
  const { address } = useAccount();
  const { profileDisplayName: profileDisplayNameFromHook, profileImageUrl: profileImageUrlFromHook, bio: bioFromHook, xHandle: xHandleFromHook, tgHandle: tgHandleFromHook } = useProfile();
  const [responsibleGamingOpen, setResponsibleGamingOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [internalThemeModalOpen, setInternalThemeModalOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [gameWalletOpen, setGameWalletOpen] = useState(false);
  const [profileAvatarModalOpen, setProfileAvatarModalOpen] = useState(false);
  const { openInstallHelp } = useInstallAppHelpDialog();
  const queryClient = useQueryClient();

  const effectiveOnOpenResponsibleGaming = useCallback(
    () => (onOpenResponsibleGaming ? onOpenResponsibleGaming() : setResponsibleGamingOpen(true)),
    [onOpenResponsibleGaming],
  );
  const effectiveProfileDisplayName = profileDisplayName ?? profileDisplayNameFromHook;
  const effectiveProfileImageUrl = profileImageUrl ?? profileImageUrlFromHook;

  const handleInternalSaveProfile = useCallback(async (name: string, img: string | null, bio: string | null, x: string | null, tg: string | null) => {
    if (!address) return;
    const res = await fetch('/api/player/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, displayName: name, profileImageUrl: img, bio, xHandle: x, tgHandle: tg }),
    });
    if (!res.ok) throw new Error('Failed to save profile');
    queryClient.invalidateQueries({ queryKey: ['playerProfile'] });
  }, [address, queryClient]);

  const effectiveOnOpenProfileSettings = useCallback(
    () => (onOpenProfileSettings ? onOpenProfileSettings() : setProfileSettingsOpen(true)),
    [onOpenProfileSettings],
  );

  const isThemeModalControlled = onThemeModalOpenChange !== undefined;
  const themeModalOpen = isThemeModalControlled ? (themeModalOpenProp ?? false) : internalThemeModalOpen;
  const setThemeModalOpen = useCallback(
    (v: boolean) => (isThemeModalControlled ? onThemeModalOpenChange(v) : setInternalThemeModalOpen(v)),
    [isThemeModalControlled, onThemeModalOpenChange],
  );

  const isDeployer = Boolean(address && BLACKJACK_DEPLOYER_WALLET && address.toLowerCase() === BLACKJACK_DEPLOYER_WALLET);
  const isAdmin = isAdminWallet(address);

  const handleOpenHowToPlay = useCallback(
    () => (onOpenHowToPlay ? onOpenHowToPlay() : setHowToPlayOpen(true)),
    [onOpenHowToPlay],
  );
  const handleOpenSwap = useCallback(
    () => (onOpenSwap ? onOpenSwap() : setSwapOpen(true)),
    [onOpenSwap],
  );
  const handleOpenReport = useCallback(() => setReportOpen(true), []);
  const handleOpenInstallAppHelp = useCallback(() => openInstallHelp(), [openInstallHelp]);
  const handleOpenGameWallet = useCallback(() => {
    if (onOpenDepositModal) {
      onOpenDepositModal();
      return;
    }
    setGameWalletOpen(true);
  }, [onOpenDepositModal]);
  const handleOpenProfileModal = useCallback(() => setProfileAvatarModalOpen(true), []);
  const handleCloseGameWallet = useCallback(() => setGameWalletOpen(false), []);
  const handleCloseThemeModal = useCallback(() => setThemeModalOpen(false), [setThemeModalOpen]);
  const handleCloseResponsibleGaming = useCallback(() => setResponsibleGamingOpen(false), []);
  const handleCloseReport = useCallback(() => setReportOpen(false), []);
  const handleCloseProfileAvatar = useCallback(() => setProfileAvatarModalOpen(false), []);
  const handleProfileAvatarSave = useCallback(() => queryClient.invalidateQueries({ queryKey: ['playerProfile'] }), [queryClient]);
  const handleCloseProfileSettings = useCallback(() => setProfileSettingsOpen(false), []);

  const noopImageSource = useCallback(() => {}, []);
  const noopVideoSource = useCallback(() => {}, []);
  const noopVideoSync = useCallback(() => {}, []);
  const noopVideoPos = useCallback(() => {}, []);

  const mobileBarContent = useMemo(
    () => (
      <div className="flex items-center gap-2 min-w-0">
        <WalletMenu
          onOpenDepositModal={handleOpenGameWallet}
          profileDisplayName={effectiveProfileDisplayName}
          profileImageUrl={effectiveProfileImageUrl}
          onOpenProfileSettings={effectiveOnOpenProfileSettings}
          dropdownPlacement="below"
          variant="default"
          className="shrink-0"
          staticAvatarOnly
        />
      </div>
    ),
    [handleOpenGameWallet, effectiveProfileDisplayName, effectiveProfileImageUrl, effectiveOnOpenProfileSettings],
  );

  return (
    <Sidebar mobileBarContent={mobileBarContent} mobileBarCenterContent={mobileBarCenterContent} disabled={sidebarDisabled || gameLocked}>
      <div className="flex flex-col md:flex-row min-h-screen w-full">
        <SidebarBody className="shrink-0 surface-panel-sidebar global-main-nav-sidebar">
          <NavContent
            page={page}
            onOpenDepositModal={handleOpenGameWallet}
            currentView={currentView}
            onViewChange={onViewChange}
            setThemeModalOpen={setThemeModalOpen}
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
            onShowPlinkoHistory={onShowPlinkoHistory}
            onOpenHowToPlay={page === 'plinko' ? handleOpenHowToPlay : undefined}
            onOpenSwap={(page === 'plinko' || page === 'lottery') ? handleOpenSwap : undefined}
            onPlinkoSoundToggle={onPlinkoSoundToggle}
            plinkoSoundEnabled={plinkoSoundEnabled}
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
            onOpenReport={handleOpenReport}
            onOpenProfileModal={handleOpenProfileModal}
            onOpenInstallAppHelp={handleOpenInstallAppHelp}
          />
        </SidebarBody>
        <div
          className="relative z-0 flex-1 min-w-0 flex flex-col min-h-0 overflow-x-hidden pt-14 md:pt-0"
          style={gameLocked ? { position: 'relative', zIndex: 100002 } : undefined}
        >
          {children}
        </div>
      </div>

      {/* Lazy-loaded modals — only rendered when open */}
      <Suspense fallback={null}>
        {page === 'blackjack' && onThemeChange && themeModalOpen && (
          <ThemeSelectionModal
            open={themeModalOpen}
            onClose={handleCloseThemeModal}
            theme={theme}
            imageSource={imageSource ?? DEFAULT_BLACKJACK_IMAGE_ID}
            videoSource={videoSource}
            onThemeChange={onThemeChange}
            onImageSourceChange={onImageSourceChange ?? noopImageSource}
            onVideoSourceChange={onVideoSourceChange ?? noopVideoSource}
            imageOptions={imageOptions}
            videoOptions={videoOptions}
            videoSyncToClock={videoSyncToClock}
            onVideoSyncToClockChange={onVideoSyncToClockChange ?? noopVideoSync}
            videoPosition={videoPosition}
            onVideoPositionChange={onVideoPositionChange ?? noopVideoPos}
          />
        )}
        {page === 'plinko' && howToPlayOpen && <HowToPlayModal open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />}
        {(page === 'plinko' || page === 'lottery') && swapOpen && <SwapModal open={swapOpen} onOpenChange={setSwapOpen} />}
        {gameWalletOpen && (
          <GameWalletModal
            isOpen={gameWalletOpen}
            onClose={handleCloseGameWallet}
          />
        )}
        {responsibleGamingOpen && (
          <SelfExclusionModal isOpen={responsibleGamingOpen} onClose={handleCloseResponsibleGaming} />
        )}
        {reportOpen && (
          <ReportModal isOpen={reportOpen} onClose={handleCloseReport} balance={reserveBalance} />
        )}
        {profileAvatarModalOpen && (
          <ProfileAvatarModal open={profileAvatarModalOpen} onClose={handleCloseProfileAvatar} onSave={handleProfileAvatarSave} />
        )}
        {!onOpenProfileSettings && profileSettingsOpen && (
          <ProfileSettingsModal
            open={profileSettingsOpen}
            onClose={handleCloseProfileSettings}
            displayName={effectiveProfileDisplayName ?? ''}
            profileImageUrl={effectiveProfileImageUrl}
            bio={bioFromHook}
            xHandle={xHandleFromHook}
            tgHandle={tgHandleFromHook}
            onSave={handleInternalSaveProfile}
          />
        )}
      </Suspense>
    </Sidebar>
  );
}
