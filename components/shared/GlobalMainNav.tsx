'use client'

import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { useGameLock } from '@/contexts/game-lock-context';
import { useLocale, SUPPORTED_LOCALES } from '@/contexts/locale-context';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { apiFetch } from '@/lib/api-auth';
import { useProfile } from '@/hooks/use-player-profile';
import { usePlayerServerBalance } from '@/hooks/use-player-server-balance';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { useTokenBalance } from '@/hooks/use-token';
import { WalletMenu } from '@/components/shared/WalletMenu';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';
import { NavBalanceDisplay } from '@/components/shared/NavBalanceDisplay';
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
import {
  IconArrowLeft,
  IconHome,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipForward,
  IconChartLine,
  IconChartBar,
  IconChartPie,
  IconPalette,
  IconQuestionMark,
  IconArrowsExchange,
  IconTrophy,
  IconUserEdit,
  IconUserCircle,
  IconGift,
  IconDownload,
  IconShield,
  IconSpeakerphone,
  IconFlag,
  IconSearch,
  IconDeviceGamepad,
  IconSettings,
  IconDroplet,
  IconPhoto,
  IconLogout,
  IconVolume,
  IconVolumeOff,
  IconCircle,
  IconUsers,
  IconTicket,
  IconLayoutGrid,
  IconCards,
  IconBomb,
  IconDice,
  IconTrendingUp,
  IconRocket,
  IconLifebuoy,
  IconArrowsUpDown,
  IconPlayCard,
  IconStairsUp,
  IconCoin,
} from '@tabler/icons-react';

// Lazy-load modals — only pulled into the bundle when first opened
const ThemeSelectionModal = lazy(() => import('@/components/BLACKJACK/ThemeSelectionModal'));
const HowToPlayModal = lazy(() => import('@/components/PLINKO/HowToPlayModal'));
const SwapModal = lazy(() => import('@/components/PLINKO/SwapModal'));
const GameWalletModal = lazy(() => import('@/components/shared/GameWalletModal').then(m => ({ default: m.GameWalletModal })));
const SelfExclusionModal = lazy(() => import('@/components/ResponsibleGaming/SelfExclusionModal').then(m => ({ default: m.SelfExclusionModal })));
const ReportModal = lazy(() => import('@/components/shared/ReportModal').then(m => ({ default: m.ReportModal })));
const ProfileAvatarModal = lazy(() => import('@/components/shared/ProfileAvatarModal').then(m => ({ default: m.ProfileAvatarModal })));
const ProfileSettingsModal = lazy(() => import('@/components/shared/ProfileSettingsModal'));

export type NavPage =
  | 'blackjack' | 'plinko' | 'lottery' | 'keno' | 'mines' | 'dice' | 'limbo' | 'home' | 'poker' | 'blackjackMulti'
  | 'crash' | 'roulette2' | 'hilo' | 'baccarat' | 'towers' | 'coinflip' | 'craps';

const PATH_TO_PAGE: Record<string, NavPage> = {
  '/BLACKJACK': 'blackjack',
  '/PLINKO': 'plinko',
  '/plinko2': 'plinko',
  '/lottery': 'lottery',
  '/keno': 'keno',
  '/keno2': 'keno',
  '/mines2': 'mines',
  '/dice2': 'dice',
  '/limbo2': 'limbo',
  '/crash': 'crash',
  '/roulette2': 'roulette2',
  '/hilo': 'hilo',
  '/baccarat': 'baccarat',
  '/towers': 'towers',
  '/coinflip': 'coinflip',
  '/poker': 'poker',
  '/blackjack-multi': 'blackjackMulti',
  '/craps': 'craps',
};

type OtherGameIcon =
  | 'blackjack' | 'plinko' | 'users' | 'ticket' | 'grid' | 'cards' | 'mine' | 'dice' | 'limbo'
  | 'crash' | 'roulette' | 'hilo' | 'baccarat' | 'towers' | 'coinflip' | 'craps';

type OtherGameNavItem =
  | { label: string; href: string; icon: OtherGameIcon }
  | { label: string; icon: OtherGameIcon; comingSoon: true };

function isOtherGameLinked(g: OtherGameNavItem): g is Extract<OtherGameNavItem, { href: string }> {
  return 'href' in g;
}

const OTHER_GAMES: readonly OtherGameNavItem[] = [
  { label: 'Plinko', href: '/plinko2', icon: 'plinko' },
  { label: 'Blackjack', href: '/BLACKJACK', icon: 'blackjack' },
  { label: 'Multiplayer BJ', href: '/blackjack-multi', icon: 'users' },
  { label: 'Poker', href: '/poker', icon: 'cards' },
  { label: 'Lottery', href: '/lottery', icon: 'ticket' },
  { label: 'Keno', href: '/keno2', icon: 'grid' },
  { label: 'Mines', href: '/mines2', icon: 'mine' },
  { label: 'Dice', href: '/dice2', icon: 'dice' },
  { label: 'Craps', href: '/craps', icon: 'craps' },
  { label: 'Limbo', href: '/limbo2', icon: 'limbo' },
  { label: 'Crash', href: '/crash', icon: 'crash' },
  { label: 'Roulette', href: '/roulette2', icon: 'roulette' },
  { label: 'Hi-Lo', href: '/hilo', icon: 'hilo' },
  { label: 'Baccarat', href: '/baccarat', icon: 'baccarat' },
  { label: 'Towers', href: '/towers', icon: 'towers' },
  { label: 'Coin Flip', href: '/coinflip', icon: 'coinflip' },
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
  /**
   * Optional override (e.g. live Blackjack off-chain balance). When omitted, balance is fetched from
   * `GET /api/player/{address}/balance` (same source as GameWalletModal).
   */
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
  /** Poker lobby (`/poker`): which tab is selected in the main content area. */
  pokerLobbyTab?: 'all' | 'cash' | 'tournaments' | 'history';
  onPokerLobbyTabChange?: (tab: 'all' | 'cash' | 'tournaments' | 'history') => void;
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

const OTHER_GAME_ICONS: Record<OtherGameIcon, React.ReactNode> = {
  blackjack: (
    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
      <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
    </span>
  ),
  plinko: <IconCircle size={20} className="text-white shrink-0" aria-hidden />,
  users: <IconUsers size={20} className="text-white shrink-0" aria-hidden />,
  ticket: <IconTicket size={20} className="text-white shrink-0" aria-hidden />,
  grid: <IconLayoutGrid size={20} className="text-white shrink-0" aria-hidden />,
  cards: <IconCards size={20} className="text-white shrink-0" aria-hidden />,
  mine: <IconBomb size={20} className="text-white shrink-0" aria-hidden />,
  dice: <IconDice size={20} className="text-white shrink-0" aria-hidden />,
  limbo: <IconTrendingUp size={20} className="text-white shrink-0" aria-hidden />,
  crash: <IconRocket size={20} className="text-white shrink-0" aria-hidden />,
  roulette: <IconLifebuoy size={20} className="text-white shrink-0" aria-hidden />,
  hilo: <IconArrowsUpDown size={20} className="text-white shrink-0" aria-hidden />,
  baccarat: <IconPlayCard size={20} className="text-white shrink-0" aria-hidden />,
  towers: <IconStairsUp size={20} className="text-white shrink-0" aria-hidden />,
  coinflip: <IconCoin size={20} className="text-white shrink-0" aria-hidden />,
  craps: <IconDice size={20} className="text-white shrink-0" aria-hidden />,
};

const otherGameIcon = (g: OtherGameNavItem) => OTHER_GAME_ICONS[g.icon];

const NAV_ITEM_CLASS = 'text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors';

type NavIconName =
  | 'fa-home' | 'fa-play' | 'fa-pause' | 'fa-forward' | 'fa-chart-line' | 'fa-chart-bar' | 'fa-chart-pie'
  | 'fa-palette' | 'fa-question-circle' | 'fa-exchange-alt' | 'fa-trophy' | 'fa-user-edit' | 'fa-user-circle'
  | 'fa-gift' | 'fa-download' | 'fa-shield-alt' | 'fa-shield' | 'fa-bullhorn' | 'fa-flag' | 'fa-search'
  | 'fa-gamepad' | 'fa-cog' | 'fa-tint' | 'fa-image' | 'fa-sign-out-alt' | 'fa-volume-up' | 'fa-volume-mute'
  | 'fa-grid';

const NAV_ICON_MAP: Record<NavIconName, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  'fa-home': IconHome,
  'fa-play': IconPlayerPlay,
  'fa-pause': IconPlayerPause,
  'fa-forward': IconPlayerSkipForward,
  'fa-chart-line': IconChartLine,
  'fa-chart-bar': IconChartBar,
  'fa-chart-pie': IconChartPie,
  'fa-palette': IconPalette,
  'fa-question-circle': IconQuestionMark,
  'fa-exchange-alt': IconArrowsExchange,
  'fa-trophy': IconTrophy,
  'fa-user-edit': IconUserEdit,
  'fa-user-circle': IconUserCircle,
  'fa-gift': IconGift,
  'fa-download': IconDownload,
  'fa-shield-alt': IconShield,
  'fa-shield': IconShield,
  'fa-bullhorn': IconSpeakerphone,
  'fa-flag': IconFlag,
  'fa-search': IconSearch,
  'fa-gamepad': IconDeviceGamepad,
  'fa-cog': IconSettings,
  'fa-tint': IconDroplet,
  'fa-image': IconPhoto,
  'fa-sign-out-alt': IconLogout,
  'fa-volume-up': IconVolume,
  'fa-volume-mute': IconVolumeOff,
  'fa-grid': IconLayoutGrid,
};

/** Renders a Tabler icon sized for the sidebar. `active` swaps white → cyan. */
function NavIcon({ icon, active = false }: { icon: NavIconName; active?: boolean }) {
  const Icon = NAV_ICON_MAP[icon];
  return <Icon size={20} className={`shrink-0 ${active ? 'text-cyan-400' : 'text-white'}`} aria-hidden />;
}

function SoundToggleButton({ enabled, onToggle, className }: { enabled: boolean; onToggle: () => void; className?: string }) {
  return (
    <SidebarButton
      label={enabled ? 'Sound On' : 'Sound Off'}
      icon={<NavIcon icon={enabled ? 'fa-volume-up' : 'fa-volume-mute'} active={enabled} />}
      onClick={onToggle}
      className={className ?? NAV_ITEM_CLASS}
    />
  );
}

type NavContentProps = Pick<
  GlobalMainNavProps,
  | 'currentView' | 'onViewChange' | 'onThemeChange' | 'soundEnabled' | 'onSoundChange'
  | 'profileDisplayName' | 'profileImageUrl' | 'onOpenProfileSettings'
  | 'musicTrackName' | 'isMusicPlaying' | 'onToggleMusic' | 'onNextTrack'
  | 'onShowPlinkoHistory' | 'onOpenHowToPlay' | 'onOpenSwap' | 'onPlinkoSoundToggle' | 'plinkoSoundEnabled'
  | 'onShowLotteryDashboard' | 'onShowKenoPrizePool' | 'onShowKenoHistory' | 'onOpenPlayerProfile'
  | 'showBackArrow' | 'backArrowHref' | 'backArrowLabel'
  | 'onOpenResponsibleGaming' | 'onOpenAuthModal' | 'isAuthenticated' | 'onSignOut'
  | 'reserveBalance'
> & {
  page: NavPage;
  onOpenDepositModal?: () => void;
  setThemeModalOpen: (open: boolean) => void;
  isDeployer: boolean;
  isAdmin: boolean;
  onOpenReport: () => void;
  onOpenProfileModal?: () => void;
  onOpenInstallAppHelp?: () => void;
  /** MORBIUS ERC-20 balance in the connected wallet (wei). */
  inWalletMorbiusWei: bigint;
  /** Poker chip balance (chip-count string). */
  chipBalance?: string | null;
  walletConnected: boolean;
  pokerLobbyTab?: 'all' | 'cash' | 'tournaments' | 'history';
  onPokerLobbyTabChange?: (tab: 'all' | 'cash' | 'tournaments' | 'history') => void;
};

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
    reserveBalance,
    inWalletMorbiusWei,
    chipBalance,
    walletConnected,
    pokerLobbyTab = 'tournaments',
    onPokerLobbyTabChange,
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
      {/* Logo / Brand — md+ only; mobile uses drawer header in sidebar.tsx + mobileDrawerBrandingExtra for balance */}
      <div className="hidden md:block shrink-0 py-4">
        <Link href="/" className="sidebar-item flex items-center group/sidebar" aria-label="MORBIUS.IO Home">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <Image src="/morbius/MorbiusLogo (3).png" alt="" width={24} height={24} className="object-contain" />
          </span>
          <span className="sidebar-label text-base font-semibold text-white">
            MORBIUS.IO
          </span>
        </Link>
        <NavBalanceDisplay
          variant="sidebar"
          reserve={reserveBalance}
          inWallet={walletConnected ? inWalletMorbiusWei : undefined}
          chipBalance={walletConnected ? chipBalance : undefined}
        />
      </div>

      {/* Wallet */}
      <div className="shrink-0 py-2">
        <WalletMenu
          onOpenDepositModal={onOpenDepositModal}
          reserveBalance={reserveBalance}
          profileDisplayName={profileDisplayName}
          profileImageUrl={profileImageUrl}
          onOpenProfileSettings={onOpenProfileSettings}
          dropdownPlacement="below"
          variant="sidebar"
          staticAvatarOnly
        />
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 space-y-0.5">
        <SidebarLink link={{ label: 'Home', href: '/', icon: <NavIcon icon="fa-home" /> }} className={NAV_ITEM_CLASS} />

        {/* Page-specific primary nav */}
        {page === 'blackjack' && (
          <>
            <SidebarButton label="Play" icon={<NavIcon icon="fa-play" active={currentView === 'game'} />} onClick={() => onViewChange?.('game')} active={currentView === 'game'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'game')}`} />
            {isDeployer && (
              <SidebarButton label="Analytics" icon={<NavIcon icon="fa-chart-line" active={currentView === 'analytics'} />} onClick={() => onViewChange?.('analytics')} active={currentView === 'analytics'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'analytics')}`} />
            )}
            {onThemeChange && (
              <SidebarButton label="Table theme" icon={<NavIcon icon="fa-palette" />} onClick={handleOpenThemeModal} className={NAV_ITEM_CLASS} />
            )}
            {onSoundChange !== undefined && (
              <SoundToggleButton enabled={soundEnabled} onToggle={handleToggleSound} />
            )}
          </>
        )}

        {page === 'plinko' && onPlinkoSoundToggle !== undefined && (
          <SoundToggleButton enabled={plinkoSoundEnabled} onToggle={onPlinkoSoundToggle} />
        )}

        {page === 'poker' && onPokerLobbyTabChange && (
          <>
            <SectionLabel label="Lobby" />
            <SidebarButton
              label="All"
              icon={<NavIcon icon="fa-grid" active={pokerLobbyTab === 'all'} />}
              onClick={() => onPokerLobbyTabChange('all')}
              active={pokerLobbyTab === 'all'}
              className={`rounded-lg px-2 py-2 transition-colors ${btnClass(pokerLobbyTab === 'all')}`}
            />
            <SidebarButton
              label="Tournaments"
              icon={<NavIcon icon="fa-trophy" active={pokerLobbyTab === 'tournaments'} />}
              onClick={() => onPokerLobbyTabChange('tournaments')}
              active={pokerLobbyTab === 'tournaments'}
              className={`rounded-lg px-2 py-2 transition-colors ${btnClass(pokerLobbyTab === 'tournaments')}`}
            />
            <SidebarButton
              label="Cash games"
              icon={<NavIcon icon="fa-play" active={pokerLobbyTab === 'cash'} />}
              onClick={() => onPokerLobbyTabChange('cash')}
              active={pokerLobbyTab === 'cash'}
              className={`rounded-lg px-2 py-2 transition-colors ${btnClass(pokerLobbyTab === 'cash')}`}
            />
            <SidebarButton
              label="History"
              icon={<NavIcon icon="fa-chart-bar" active={pokerLobbyTab === 'history'} />}
              onClick={() => onPokerLobbyTabChange('history')}
              active={pokerLobbyTab === 'history'}
              className={`rounded-lg px-2 py-2 transition-colors ${btnClass(pokerLobbyTab === 'history')}`}
            />
          </>
        )}

        {/* My Stuff */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="My Stuff" />

          {page === 'blackjack' && (
            <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" active={currentView === 'stats'} />} onClick={() => onViewChange?.('stats')} active={currentView === 'stats'} className={`rounded-lg px-2 py-2 transition-colors ${btnClass(currentView === 'stats')}`} />
          )}

          {page === 'plinko' && (
            <>
              {onOpenHowToPlay && <SidebarButton label="How to Play" icon={<NavIcon icon="fa-question-circle" />} onClick={onOpenHowToPlay} className={NAV_ITEM_CLASS} />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" />} onClick={handleOpenPlinkoProfile} className={NAV_ITEM_CLASS} />
              ) : onShowPlinkoHistory ? (
                <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" />} onClick={onShowPlinkoHistory} className={NAV_ITEM_CLASS} />
              ) : (
                <SidebarLink link={{ label: 'My History', href: '/PLINKO', icon: <NavIcon icon="fa-chart-bar" /> }} className={NAV_ITEM_CLASS} />
              )}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<NavIcon icon="fa-exchange-alt" />} onClick={onOpenSwap} className={NAV_ITEM_CLASS} />}
            </>
          )}

          {page === 'lottery' && (
            <>
              {onShowLotteryDashboard && <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" />} onClick={onShowLotteryDashboard} className={NAV_ITEM_CLASS} />}
              {onOpenSwap && <SidebarButton label="Buy Morbius" icon={<NavIcon icon="fa-exchange-alt" />} onClick={onOpenSwap} className={NAV_ITEM_CLASS} />}
            </>
          )}

          {page === 'keno' && (
            <>
              {onShowKenoPrizePool && <SidebarButton label="Prize Pool" icon={<NavIcon icon="fa-trophy" />} onClick={onShowKenoPrizePool} className={NAV_ITEM_CLASS} />}
              {onOpenPlayerProfile ? (
                <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" />} onClick={handleOpenKenoProfile} className={NAV_ITEM_CLASS} />
              ) : onShowKenoHistory ? (
                <SidebarButton label="My History" icon={<NavIcon icon="fa-chart-bar" />} onClick={onShowKenoHistory} className={NAV_ITEM_CLASS} />
              ) : (
                <SidebarLink link={{ label: 'My History', href: '/keno', icon: <NavIcon icon="fa-chart-bar" /> }} className={NAV_ITEM_CLASS} />
              )}
            </>
          )}

          {page === 'home' && onOpenPlayerProfile && (
            <SidebarButton label="Player Dashboard" icon={<NavIcon icon="fa-chart-pie" />} onClick={handleOpenAllProfile} className={NAV_ITEM_CLASS} />
          )}

          <SidebarButton label="Profile" icon={<NavIcon icon="fa-user-edit" />} onClick={handleOpenProfileOrModal} className={NAV_ITEM_CLASS} />
          <SidebarButton label="Avatar" icon={<NavIcon icon="fa-user-circle" />} onClick={handleOpenProfileModal} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Claim Morbius', href: '/claim', icon: <NavIcon icon="fa-gift" /> }} className={NAV_ITEM_CLASS} />
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
              <SidebarLink key={g.href} link={{ label: g.label, href: g.href, icon: otherGameIcon(g) }} className={NAV_ITEM_CLASS} />
            ) : null
          )}
        </div>

        {/* Other — includes marketing (/marketing covers tables + campaigns) */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <SectionLabel label="Other" />
          {onOpenInstallAppHelp && (
            <SidebarButton
              label="Install app"
              icon={<NavIcon icon="fa-download" />}
              onClick={onOpenInstallAppHelp}
              className={`${NAV_ITEM_CLASS} text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300`}
            />
          )}
          <SidebarButton label="Responsible Gaming" icon={<NavIcon icon="fa-shield-alt" />} onClick={onOpenResponsibleGaming} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Marketing', href: '/marketing', icon: <NavIcon icon="fa-bullhorn" /> }} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Brand kit', href: '/branding', icon: <NavIcon icon="fa-image" /> }} className={NAV_ITEM_CLASS} />
          <SidebarButton label="Report Issue" icon={<IconFlag size={20} className="text-red-400/80 shrink-0" aria-hidden />} onClick={onOpenReport} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Token Analyzer', href: 'https://scan.morbius.io', icon: <NavIcon icon="fa-search" /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Morb-It', href: '/Morb-It', icon: <NavIcon icon="fa-gamepad" /> }} className={NAV_ITEM_CLASS} />
          {isAdmin && (
            <SidebarLink link={{ label: 'Admin', href: '/admin', icon: <NavIcon icon="fa-cog" /> }} className={NAV_ITEM_CLASS} />
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
          <SidebarLink link={{ label: 'Swap', href: '/swap', icon: <NavIcon icon="fa-exchange-alt" /> }} className={NAV_ITEM_CLASS} />
          <SidebarLink link={{ label: 'Provide LP', href: 'https://pulsex.com', icon: <NavIcon icon="fa-tint" /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
          <SidebarLink link={{ label: 'Chart', href: 'https://scan.morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart', icon: <NavIcon icon="fa-chart-line" /> }} className={NAV_ITEM_CLASS} target="_blank" rel="noopener noreferrer" />
        </div>
      </nav>

      {/* Bottom: Music (Blackjack only) + Auth (home) */}
      <div className="shrink-0 pt-2 border-t border-white/10 space-y-2">
        {page === 'home' && onOpenAuthModal && !isAuthenticated && (
          <SidebarButton label="Sign In" icon={<NavIcon icon="fa-shield" active />} onClick={onOpenAuthModal} className={NAV_ITEM_CLASS} />
        )}
        {page === 'home' && onSignOut && isAuthenticated && (
          <SidebarButton label="Sign Out" icon={<NavIcon icon="fa-sign-out-alt" />} onClick={onSignOut} className={NAV_ITEM_CLASS} />
        )}
        {page === 'blackjack' && musicTrackName && onToggleMusic && open && (
          <div className="px-2 py-2 rounded-lg bg-white/5 border border-cyan-500/20 flex items-center gap-2">
            <span className="text-white text-xs font-medium truncate flex-1 min-w-0" title={musicTrackName}>{musicTrackName}</span>
            <button type="button" onClick={onToggleMusic} className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0" aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}>
              {isMusicPlaying ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
            </button>
            {onNextTrack && (
              <button type="button" onClick={onNextTrack} className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0" aria-label="Next track">
                <IconPlayerSkipForward size={14} />
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
  pokerLobbyTab,
  onPokerLobbyTabChange,
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
  const { balance: inWalletMorbiusWei } = useTokenBalance(address);
  const { data: serverReserveBalance } = usePlayerServerBalance(
    reserveBalance === undefined ? address : undefined,
  );
  const { data: pokerChipBalance } = usePokerChipBalance(address);
  const effectiveReserveBalance =
    reserveBalance !== undefined
      ? reserveBalance
      : serverReserveBalance != null
        ? serverReserveBalance
        : undefined;
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
    if (!address) throw new Error('Connect your wallet to save your profile.');
    // SIWE-gated. apiFetch sends the session cookie and triggers the sign-in
    // popup on 401, then retries. address dropped from body.
    await apiFetch('/api/player/profile', {
      method: 'POST',
      body: JSON.stringify({ displayName: name, profileImageUrl: img, bio, xHandle: x, tgHandle: tg }),
    });
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

  // Sophie (ElevenLabs) event bridge — modals owned by GlobalMainNav
  useEffect(() => {
    const openAvatar = () => setProfileAvatarModalOpen(true)
    const openSettings = () => setProfileSettingsOpen(true)
    const openSwapEvt = () => setSwapOpen(true)
    const openResponsible = () => setResponsibleGamingOpen(true)
    const openInstall = () => openInstallHelp()
    const openReport = () => setReportOpen(true)
    const openGameWallet = () => {
      if (onOpenDepositModal) onOpenDepositModal();
      else setGameWalletOpen(true);
    }
    window.addEventListener('sophie:open_avatar_editor', openAvatar)
    window.addEventListener('sophie:open_profile_settings', openSettings)
    window.addEventListener('sophie:open_swap', openSwapEvt)
    window.addEventListener('sophie:open_responsible_gaming', openResponsible)
    window.addEventListener('sophie:open_install_app', openInstall)
    window.addEventListener('sophie:open_report_issue', openReport)
    window.addEventListener('sophie:open_game_wallet', openGameWallet)
    return () => {
      window.removeEventListener('sophie:open_avatar_editor', openAvatar)
      window.removeEventListener('sophie:open_profile_settings', openSettings)
      window.removeEventListener('sophie:open_swap', openSwapEvt)
      window.removeEventListener('sophie:open_responsible_gaming', openResponsible)
      window.removeEventListener('sophie:open_install_app', openInstall)
      window.removeEventListener('sophie:open_report_issue', openReport)
      window.removeEventListener('sophie:open_game_wallet', openGameWallet)
    }
  }, [openInstallHelp, onOpenDepositModal]);
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
        {page !== 'home' && (
          <Link
            href="/"
            className="flex items-center gap-1 text-white/70 hover:text-white text-xs shrink-0"
          >
            <IconArrowLeft size={16} />
            <span>Menu</span>
          </Link>
        )}
        <NavBalanceDisplay
          variant="mobile-bar"
          reserve={effectiveReserveBalance}
          inWallet={address ? inWalletMorbiusWei : undefined}
          chipBalance={address ? pokerChipBalance : undefined}
        />
        <WalletMenu
          onOpenDepositModal={handleOpenGameWallet}
          reserveBalance={effectiveReserveBalance}
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
    [
      page,
      handleOpenGameWallet,
      effectiveProfileDisplayName,
      effectiveProfileImageUrl,
      effectiveOnOpenProfileSettings,
      effectiveReserveBalance,
      address,
      inWalletMorbiusWei,
      pokerChipBalance,
    ],
  );

  const mobileDrawerBrandingExtra = useMemo(() => {
    if (effectiveReserveBalance === undefined && !address) return null;
    return (
      <NavBalanceDisplay
        variant="mobile-drawer"
        reserve={effectiveReserveBalance}
        inWallet={address ? inWalletMorbiusWei : undefined}
        chipBalance={address ? pokerChipBalance : undefined}
      />
    );
  }, [effectiveReserveBalance, address, inWalletMorbiusWei, pokerChipBalance]);

  return (
    <Sidebar
      mobileBarContent={mobileBarContent}
      mobileBarCenterContent={mobileBarCenterContent}
      mobileDrawerBrandingExtra={mobileDrawerBrandingExtra}
      disabled={sidebarDisabled || gameLocked}
    >
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
            reserveBalance={effectiveReserveBalance}
            inWalletMorbiusWei={inWalletMorbiusWei}
            chipBalance={pokerChipBalance}
            walletConnected={Boolean(address)}
            pokerLobbyTab={pokerLobbyTab}
            onPokerLobbyTabChange={onPokerLobbyTabChange}
          />
        </SidebarBody>
        <div
          className="relative z-0 flex-1 min-w-0 flex flex-col min-h-0 overflow-x-clip [padding-top:calc(3.5rem+env(safe-area-inset-top))] md:pt-0"
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
          <ReportModal isOpen={reportOpen} onClose={handleCloseReport} balance={effectiveReserveBalance} />
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
