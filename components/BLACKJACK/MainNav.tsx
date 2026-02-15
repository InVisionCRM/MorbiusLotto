'use client'

import React, { useState } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { WalletMenu } from '@/components/shared/WalletMenu';
import { NumberTicker } from '@/components/ui/number-ticker';
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

interface MainNavProps {
  children?: React.ReactNode;
  onOpenDepositModal?: () => void;
  reserveBalance?: bigint;
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
  profileDisplayName?: string | null;
  profileImageUrl?: string | null;
  onOpenProfileSettings?: () => void;
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
};

const viewIcons: Record<string, string> = {
  game: 'fa-play',
  history: 'fa-history',
  stats: 'fa-chart-bar',
  analytics: 'fa-chart-line',
};

const SIDEBAR_PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
} as const;

function NavContent({
  onOpenDepositModal,
  reserveBalance,
  currentView = 'game',
  onViewChange,
  setThemeModalOpen,
  onTournamentLobby,
  onThemeChange,
  soundEnabled,
  onSoundChange,
  profileDisplayName,
  profileImageUrl,
  onOpenProfileSettings,
  musicTrackName,
  isMusicPlaying,
  onToggleMusic,
  onNextTrack,
  views,
  isDeployer,
  isAdmin,
  isConnected,
}: {
  onOpenDepositModal?: () => void;
  reserveBalance?: bigint;
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
  views: Array<'game' | 'history' | 'stats' | 'analytics'>;
  isDeployer: boolean;
  isAdmin: boolean;
  isConnected: boolean;
}) {
  const { open } = useSidebar();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo / Brand */}
      <div className="shrink-0 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 group/sidebar"
          aria-label="MORBIUS.IO Home"
        >
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-white/10"
            style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)' }}
          >
            <Image
              src="/morbius/MorbiusLogo (3).png"
              alt=""
              width={24}
              height={24}
              className="object-contain"
            />
          </span>
          <motion.span
            animate={{
              display: open ? 'inline-block' : 'none',
              opacity: open ? 1 : 0,
            }}
            className="text-base font-semibold text-white whitespace-nowrap overflow-hidden"
          >
            MORBIUS.IO
          </motion.span>
        </Link>
      </div>

      {/* Reserve balance - when connected */}
      {isConnected && reserveBalance !== undefined && onOpenDepositModal && (
        <button
          onClick={onOpenDepositModal}
          className="flex items-center gap-2 py-2 rounded-lg px-2 hover:bg-white/5 transition-colors text-left w-full mb-2"
          aria-label="MORBIUS reserve balance — click to deposit or withdraw"
          title={`Deposit/Withdraw — ${Math.floor(Number(reserveBalance) / 1e18)} MORBIUS`}
        >
          <Image
            src="/morbius/MorbiusLogo (3).png"
            alt=""
            width={20}
            height={20}
            className="object-contain shrink-0"
          />
          <motion.span
            animate={{
              display: open ? 'inline-block' : 'none',
              opacity: open ? 1 : 0,
            }}
            className="text-white/90 font-bold text-sm truncate min-w-0"
          >
            <NumberTicker
              value={Math.floor(Number(reserveBalance) / 1e18)}
              className="text-white/90 font-bold"
              animateOnChange={true}
            />
          </motion.span>
        </button>
      )}

      {/* Nav links - scrollable */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 space-y-0.5">
        {/* Home */}
        <SidebarLink
          link={{
            label: 'Home',
            href: '/',
            icon: <i className="fas fa-home w-5 text-center text-white/80 shrink-0" aria-hidden />,
          }}
          className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
        />

        {/* Blackjack views */}
        {views.map((view) => (
          <SidebarButton
            key={view}
            label={viewLabels[view]}
            icon={
              <i
                className={`fas ${viewIcons[view]} w-5 text-center shrink-0 ${
                  currentView === view ? 'text-cyan-400' : 'text-white/80'
                }`}
                aria-hidden
              />
            }
            onClick={() => onViewChange?.(view)}
            active={currentView === view}
            className={`rounded-lg px-2 py-2 transition-colors ${
              currentView === view ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/90 hover:text-white hover:bg-white/5'
            }`}
          />
        ))}

        {/* Tournament Lobby */}
        {onTournamentLobby && (
          <SidebarButton
            label="Tournament Lobby"
            icon={<i className="fas fa-trophy w-5 text-center text-white/80 shrink-0" aria-hidden />}
            onClick={onTournamentLobby}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
        )}

        {/* Table theme */}
        {onThemeChange && (
          <SidebarButton
            label="Table theme"
            icon={<i className="fas fa-palette w-5 text-center text-white/80 shrink-0" aria-hidden />}
            onClick={() => setThemeModalOpen(true)}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
        )}

        {/* Sound */}
        {onSoundChange !== undefined && (
          <SidebarButton
            label={soundEnabled ? 'Sound On' : 'Sound Off'}
            icon={
              <i
                className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} w-5 text-center shrink-0 ${
                  soundEnabled ? 'text-cyan-400' : 'text-white/80'
                }`}
                aria-hidden
              />
            }
            onClick={() => onSoundChange(!soundEnabled)}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
        )}

        {/* Divider / Other Games */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <div className="px-2 py-1 overflow-hidden">
            <motion.span
              animate={{ display: open ? 'inline-block' : 'none', opacity: open ? 1 : 0 }}
              className="text-xs text-cyan-300/60 uppercase tracking-wider"
            >
              Other Games
            </motion.span>
          </div>
          <SidebarLink
            link={{
              label: 'Plinko',
              href: '/PLINKO',
              icon: <i className="fas fa-circle w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
          <SidebarLink
            link={{
              label: 'Lottery',
              href: '/lottery',
              icon: <i className="fas fa-ticket-alt w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
          <SidebarLink
            link={{
              label: 'Keno',
              href: '/keno',
              icon: <i className="fas fa-th w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
          <SidebarLink
            link={{
              label: 'Creator Dashboard',
              href: '/creators',
              icon: <i className="fas fa-crown w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
          {isAdmin && (
            <SidebarLink
              link={{
                label: 'Admin',
                href: '/admin',
                icon: <i className="fas fa-cog w-5 text-center text-white/80 shrink-0" aria-hidden />,
              }}
              className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
            />
          )}
        </div>

        {/* Morbius Stats */}
        <div className="pt-2 mt-2 border-t border-white/10 overflow-hidden">
          <div className="px-2 py-1">
            <motion.span
              animate={{ display: open ? 'inline-block' : 'none', opacity: open ? 1 : 0 }}
              className="text-xs text-cyan-300/60 uppercase tracking-wider"
            >
              Morbius
            </motion.span>
          </div>
          <motion.div
            animate={{ display: open ? 'block' : 'none', opacity: open ? 1 : 0 }}
            className="px-2 py-1"
          >
            <MorbiusBurnedDisplay variant="inline" className="text-white/80 text-xs" />
          </motion.div>
          <motion.div
            animate={{ display: open ? 'block' : 'none', opacity: open ? 1 : 0 }}
            className="px-2 py-1"
          >
            <MorbiusPriceDisplay className="text-white/80 text-xs" />
          </motion.div>
          <SidebarLink
            link={{
              label: 'Claim fees',
              href: '/claim-fees',
              icon: <i className="fas fa-wallet w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
          <SidebarLink
            link={{
              label: 'Swap',
              href: '/swap',
              icon: <i className="fas fa-exchange-alt w-5 text-center text-white/80 shrink-0" aria-hidden />,
            }}
            className="text-white/90 hover:text-white hover:bg-white/5 rounded-lg px-2 py-2 transition-colors"
          />
        </div>
      </nav>

      {/* Bottom: Music (when expanded) + Wallet/Profile */}
      <div className="shrink-0 pt-2 border-t border-white/10 space-y-2">
        {musicTrackName && onToggleMusic && open && (
          <div className="px-2 py-2 rounded-lg bg-white/5 border border-cyan-500/20 flex items-center gap-2">
            <span className="text-cyan-400/90 text-xs font-medium truncate flex-1 min-w-0" title={musicTrackName}>
              {musicTrackName}
            </span>
            <button
              type="button"
              onClick={onToggleMusic}
              className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0"
              aria-label={isMusicPlaying ? 'Pause music' : 'Play music'}
            >
              {isMusicPlaying ? <i className="fas fa-pause text-xs" /> : <i className="fas fa-play text-xs" />}
            </button>
            {onNextTrack && (
              <button
                type="button"
                onClick={onNextTrack}
                className="w-7 h-7 rounded flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0"
                aria-label="Next track"
              >
                <i className="fas fa-forward text-xs" />
              </button>
            )}
          </div>
        )}
        <div className="px-2">
          <WalletMenu
            onOpenDepositModal={onOpenDepositModal}
            reserveBalance={reserveBalance}
            profileDisplayName={profileDisplayName}
            profileImageUrl={profileImageUrl}
            onOpenProfileSettings={onOpenProfileSettings}
          />
        </div>
      </div>
    </div>
  );
}

export default function MainNav({
  children,
  onOpenDepositModal,
  reserveBalance,
  currentView = 'game',
  onViewChange,
  theme = 'video',
  onThemeChange,
  imageSource = DEFAULT_BLACKJACK_IMAGE_ID,
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
  profileDisplayName,
  profileImageUrl,
  onOpenProfileSettings,
  musicTrackName,
  isMusicPlaying,
  onToggleMusic,
  onNextTrack,
}: MainNavProps) {
  const { address, isConnected } = useAccount();
  const [internalThemeModalOpen, setInternalThemeModalOpen] = useState(false);
  const isThemeModalControlled = onThemeModalOpenChange !== undefined;
  const themeModalOpen = isThemeModalControlled ? (themeModalOpenProp ?? false) : internalThemeModalOpen;
  const setThemeModalOpen = isThemeModalControlled ? onThemeModalOpenChange : setInternalThemeModalOpen;

  const isDeployer = Boolean(
    address && BLACKJACK_DEPLOYER_WALLET && address.toLowerCase() === BLACKJACK_DEPLOYER_WALLET
  );
  const isAdmin = isAdminWallet(address);
  const views: Array<'game' | 'history' | 'stats' | 'analytics'> = isDeployer
    ? ['game', 'history', 'stats', 'analytics']
    : ['game', 'history', 'stats'];

  return (
    <Sidebar>
      <div className="flex flex-col md:flex-row min-h-screen w-full">
        <SidebarBody
          className="shrink-0"
          style={SIDEBAR_PANEL_STYLE}
        >
          <NavContent
            onOpenDepositModal={onOpenDepositModal}
            reserveBalance={reserveBalance}
            currentView={currentView}
            onViewChange={onViewChange}
            setThemeModalOpen={setThemeModalOpen}
            onTournamentLobby={onTournamentLobby}
            onThemeChange={onThemeChange}
            soundEnabled={soundEnabled}
            onSoundChange={onSoundChange}
            profileDisplayName={profileDisplayName}
            profileImageUrl={profileImageUrl}
            onOpenProfileSettings={onOpenProfileSettings}
            musicTrackName={musicTrackName}
            isMusicPlaying={isMusicPlaying}
            onToggleMusic={onToggleMusic}
            onNextTrack={onNextTrack}
            views={views}
            isDeployer={isDeployer}
            isAdmin={isAdmin}
            isConnected={isConnected}
          />
        </SidebarBody>
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-x-hidden">
          {children}
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
        imageOptions={imageOptions}
        videoOptions={videoOptions}
        videoSyncToClock={videoSyncToClock}
        onVideoSyncToClockChange={onVideoSyncToClockChange}
        videoPosition={videoPosition}
        onVideoPositionChange={onVideoPositionChange}
      />
    </Sidebar>
  );
}
