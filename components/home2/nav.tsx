'use client';

/**
 * home2 nav — faithful port of the navigation chrome from public/home-nav-lab.html
 * (the approved prototype / source of truth).
 *
 * Exports:
 *  - HomeSidebar   — the desktop <aside class="sidebar">
 *  - ChipDock      — the mobile <nav class="dock"> (chip-rail dock)
 *  - DepositSheet  — the .sheet-veil + .sheet bottom sheet (legacy — the dock
 *    now opens the nav drawer from the chip and WalletSheet from WALLET)
 *  - MobileTopBar  — the mobile .mob-bar
 *
 * All class names, emoji icons, badges and copy are kept identical to the lab.
 * The lab's CSS is ported under a `.home2` wrapper with the same class names.
 */

import Link from 'next/link';
import React from 'react';
import { useAccount } from 'wagmi';
import { isAdminWallet } from '@/lib/admin';
import { IconHome, IconLayoutGrid, IconTicket } from '@tabler/icons-react';
import { WalletIcon } from '@/components/shared/WalletIcon';

/* ------------------------------------------------------------------ */
/* shared bits                                                          */
/* ------------------------------------------------------------------ */

type SbBadge =
  | { kind: 'live'; text: string }
  | { kind: 'cnt'; text: string }
  | { kind: 'hot'; text: string };

interface SbLinkItem {
  icon: string;
  label: string;
  href: string;
  badge?: SbBadge;
  active?: boolean;
}

function SbLink({ icon, label, href, badge, active }: SbLinkItem) {
  return (
    <Link className={active ? 'sb-link active' : 'sb-link'} href={href}>
      <span className="ic">{icon}</span>
      {label}
      {badge ? <span className={badge.kind}>{badge.text}</span> : null}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* route mapping (lab sidebar entry -> real app/ route)                 */
/* ------------------------------------------------------------------ */

const YOUR_TABLE_LINKS: SbLinkItem[] = [
  { icon: '🂡', label: 'Blackjack', href: '/BLACKJACK', active: true, badge: { kind: 'live', text: 'SEAT OPEN' } },
  { icon: '●', label: 'Plinko', href: '/plinko2', badge: { kind: 'hot', text: '▲ HOT' } },
  { icon: '♠', label: 'Poker', href: '/poker', badge: { kind: 'cnt', text: '2 tables' } },
];

const START_HERE_LINKS: SbLinkItem[] = [
  { icon: '🎓', label: 'How it works', href: '#' },
  { icon: '🪙', label: 'Get MORBIUS', href: '/swap' },
  { icon: '👑', label: 'VIP Club', href: '/vip' },
];

const ORIGINALS_LINKS: SbLinkItem[] = [
  { icon: '●', label: 'Plinko', href: '/plinko2' },
  { icon: '🚀', label: 'Crash', href: '/crash', badge: { kind: 'hot', text: '▲ HOT' } },
  { icon: '💎', label: 'Mines', href: '/mines2' },
  { icon: '🗼', label: 'Towers', href: '/towers' },
  { icon: '∞', label: 'Limbo', href: '/limbo2' },
  { icon: '⚂', label: 'Dice', href: '/dice2' },
  { icon: '⚂', label: 'Dice x2', href: '/dicex2' },
  { icon: '🔢', label: 'Keno', href: '/keno2' },
  { icon: '🐔', label: 'Chicken', href: '/chicken' },
  { icon: '🌊', label: 'Cascade', href: '/cascade' },
  { icon: '🔥', label: 'Firewalk', href: '/firewalk' },
];

const CARDS_TABLE_LINKS: SbLinkItem[] = [
  { icon: '🂡', label: 'Blackjack', href: '/BLACKJACK', badge: { kind: 'live', text: '3' } },
  { icon: '🃟', label: 'Multiplayer BJ', href: '/blackjack-multi' },
  { icon: '♠', label: 'Poker', href: '/poker', badge: { kind: 'live', text: '2' } },
  { icon: '🎡', label: 'Roulette', href: '/roulette2' },
  { icon: '🀄', label: 'Baccarat', href: '/baccarat' },
  { icon: '🎲', label: 'Craps', href: '/craps' },
  { icon: '🐉', label: 'Dragon Tiger', href: '/dragon-tiger' },
  { icon: '🃏', label: 'Three Card', href: '/three-card-poker' },
  { icon: '🀄', label: 'Pai Gow', href: '/pai-gow-poker' },
  { icon: '♥', label: "Ultimate Hold'em", href: '/ultimate-holdem' },
  { icon: '♠', label: 'Spanish 21', href: '/spanish-21' },
  { icon: '👁', label: 'Double Exposure', href: '/double-exposure' },
  { icon: '🂫', label: 'Pontoon', href: '/pontoon' },
  { icon: '🆓', label: 'Free Bet BJ', href: '/free-bet-blackjack' },
  { icon: '♦', label: 'Caribbean Stud', href: '/caribbean-stud' },
  { icon: '🖥', label: 'Video Poker', href: '/video-poker' },
];

const MORE_GAMES_LINKS: SbLinkItem[] = [
  { icon: '🎯', label: 'Andar Bahar', href: '/andar-bahar' },
  { icon: '🏮', label: 'Pachinko', href: '/pachinko' },
  { icon: '🏦', label: 'Heist', href: '/heist' },
  { icon: '🤑', label: 'Greed Dice', href: '/greed-dice' },
  { icon: '🔐', label: 'Cipher', href: '/cipher' },
  { icon: '↕', label: 'Hi-Lo', href: '/hilo' },
];

const MY_STUFF_LINKS: SbLinkItem[] = [
  // Dashboard: the app's dashboard route is /player/[address] (dynamic, needs the
  // connected address), so no static href exists — '#' until wired up.
  { icon: '📊', label: 'Dashboard', href: '#' },
  // My Avatar: avatar editing is a modal (ProfileAvatarModal), not a route — '#'.
  { icon: '🧑‍🎨', label: 'My Avatar', href: '#' },
  { icon: '👑', label: 'VIP Club', href: '/vip' },
  { icon: '🤝', label: 'Refer & Earn', href: '/referrals' },
  { icon: '🕘', label: 'History', href: '/activity' },
];

/* ------------------------------------------------------------------ */
/* HomeSidebar                                                          */
/* ------------------------------------------------------------------ */

export interface HomeSidebarProps {
  mode: 'player' | 'visitor';
  balance?: string;
  tierEmoji?: string;
  tierName?: string;
  tierRakeback?: string;
  nextTier?: string;
  nextRakeback?: string;
  progressPct?: number;
  wagerToNext?: string;
  onConnect?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onDisconnect?: () => void;
  /** When provided, the "Swap · LP · Chart" footer row opens the chart modal. */
  onChartClick?: () => void;
}

export function HomeSidebar({
  mode,
  balance = '128,400',
  tierEmoji = '🥈',
  tierName = 'SILVER',
  tierRakeback = '8%',
  nextTier = 'GOLD',
  nextRakeback = '12%',
  progressPct = 72,
  wagerToNext = '2,450',
  onConnect,
  onDeposit,
  onWithdraw,
  onDisconnect,
  onChartClick,
}: HomeSidebarProps) {
  // /activity is the admin platform dashboard — only surface its link to admin
  // wallets (the page itself also blocks non-admins).
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);
  const myStuffLinks = isAdmin ? MY_STUFF_LINKS : MY_STUFF_LINKS.filter((l) => l.href !== '/activity');
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo"><img src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" /></div>
        <b>
          MORBIUS<i>.IO</i>
        </b>
      </div>
      <div className="sb-scroll">
        {mode === 'player' ? (
          <div className="sb-balance only-player">
            <div className="lbl">PLAY BALANCE</div>
            <div className="amt">
              {balance} <span>MORBIUS</span>
            </div>
            <div className="row">
              <button type="button" className="btn-gold" onClick={onDeposit}>
                Deposit
              </button>
              <button type="button" className="btn-ghost" onClick={onWithdraw}>
                Withdraw
              </button>
            </div>
            <button type="button" className="sb-disconnect" onClick={onDisconnect}>
              Disconnect wallet
            </button>
          </div>
        ) : (
          <div className="sb-balance only-visitor">
            <div className="lbl">WELCOME TO THE FLOOR</div>
            <div className="amt" style={{ fontSize: '13px', fontWeight: 600, color: '#b7c3d4' }}>
              Connect to take a seat
            </div>
            <div className="row">
              <button type="button" className="btn-gold" onClick={onConnect}>
                Connect Wallet
              </button>
            </div>
          </div>
        )}

        {mode === 'player' && (
          <div className="sb-vip only-player">
            <div className="t">
              <span className="cur">
                {tierEmoji} {tierName} · {tierRakeback}
              </span>
              <span className="next">
                {nextTier} · {nextRakeback}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${progressPct}%` }}></i>
            </div>
            <div className="sub">
              <b>{wagerToNext}</b> MORBIUS wagered to rank up
            </div>
          </div>
        )}

        {mode === 'player' ? (
          <div className="only-player">
            <div className="sb-h">YOUR TABLE</div>
            {YOUR_TABLE_LINKS.map((l) => (
              <SbLink key={l.label} {...l} />
            ))}
          </div>
        ) : (
          <div className="only-visitor">
            <div className="sb-h">START HERE</div>
            {START_HERE_LINKS.map((l) => (
              <SbLink key={l.label} {...l} />
            ))}
          </div>
        )}

        <details className="sb-group" open>
          <summary>
            <div className="sb-h">
              ORIGINALS <span className="chev">▶</span>
            </div>
          </summary>
          {ORIGINALS_LINKS.map((l) => (
            <SbLink key={l.label} {...l} />
          ))}
        </details>
        <details className="sb-group" open>
          <summary>
            <div className="sb-h">
              CARDS &amp; TABLE <span className="chev">▶</span>
            </div>
          </summary>
          {CARDS_TABLE_LINKS.map((l) => (
            <SbLink key={l.label} {...l} />
          ))}
        </details>
        <details className="sb-group">
          <summary>
            <div className="sb-h">
              MORE GAMES <span className="chev">▶</span>
            </div>
          </summary>
          {MORE_GAMES_LINKS.map((l) => (
            <SbLink key={l.label} {...l} />
          ))}
        </details>
        <details className="sb-group" open>
          <summary>
            <div className="sb-h">
              MY STUFF <span className="chev">▶</span>
            </div>
          </summary>
          {myStuffLinks.map((l) => (
            <SbLink key={l.label} {...l} />
          ))}
        </details>
      </div>
      <div className="sb-foot">
        <div className="r">
          <span>🏆 Weekly high</span>
          <b className="burn">48,200</b>
        </div>
        <div className="r">
          <span>MORBIUS</span>
          <b className="up">$0.00042 ▲</b>
        </div>
        <div
          className="r"
          onClick={onChartClick}
          role={onChartClick ? 'button' : undefined}
          tabIndex={onChartClick ? 0 : undefined}
          onKeyDown={
            onChartClick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChartClick();
                  }
                }
              : undefined
          }
          style={onChartClick ? { cursor: 'pointer' } : undefined}
        >
          <span>Swap · LP · Chart</span>
          <b style={{ color: 'var(--cyan)' }}>↗</b>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* ChipDock — mobile "Pit Rail" floating pill dock                      */
/* ------------------------------------------------------------------ */

export interface ChipDockProps {
  balance?: string;
  /** Center gold chip — opens the side-nav drawer (the menu). */
  onChip?: () => void;
  /** GAMES slot — opens the GameLauncherSheet. */
  onGames?: () => void;
  /** DROP slot — opens the DropSheet. */
  onDrop?: () => void;
  /** WALLET slot — opens the WalletSheet. */
  onWallet?: () => void;
  /** e.g. '2d' — time until the Weekly Drop closes; null/undefined hides the badge. */
  dropBadge?: string | null;
  activeTab?: 'home' | 'games' | 'drop' | 'wallet' | string;
}

export function ChipDock({
  balance = '128,400',
  onChip,
  onGames,
  onDrop,
  onWallet,
  dropBadge = null,
  activeTab = 'home',
}: ChipDockProps) {
  const cls = (tab: string) => `di${activeTab === tab ? ' on' : ''}`;
  return (
    <nav className="dock">
      <button
        type="button"
        className={cls('home')}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span className="ic">
          <IconHome size={22} stroke={1.8} />
        </span>
        <span className="lb">HOME</span>
      </button>
      <button type="button" className={cls('games')} onClick={onGames}>
        <span className="ic">
          <IconLayoutGrid size={22} stroke={1.8} />
        </span>
        <span className="lb">GAMES</span>
        <span className="bdg"></span>
      </button>
      <div className="chip-slot">
        <button type="button" className="chip-btn" onClick={onChip}>
          <img src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" />
        </button>
        <div className="chip-lbl">{balance}</div>
      </div>
      <button type="button" className={cls('drop')} onClick={onDrop}>
        <span className="ic">
          <IconTicket size={22} stroke={1.8} />
        </span>
        <span className="lb">DROP</span>
        {dropBadge ? <span className="bdg-txt">{dropBadge}</span> : null}
      </button>
      <button type="button" className={cls('wallet')} onClick={onWallet}>
        <span className="ic">
          <WalletIcon size={22} />
        </span>
        <span className="lb">WALLET</span>
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* DepositSheet — bottom sheet opened by the dock chip                  */
/* ------------------------------------------------------------------ */

export interface DepositSheetProps {
  open: boolean;
  onClose?: () => void;
  balance?: string;
  subline?: string;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onClaimRakeback?: () => void;
  onDashboard?: () => void;
}

/**
 * Open/close mechanics: each sheet (deposit / game launcher / drop) toggles an
 * `open` class on its OWN veil + panel (`.home2 .sheet.open{transform:none}`),
 * so several sheets can coexist without a wrapper-level `.home2.sheet-open`
 * class sliding them all up at once. The parent just drives the `open` prop
 * and ensures only one sheet is open at a time.
 */
export function DepositSheet({
  open,
  onClose,
  balance = '128,400',
  subline = '≈ $53.93 · Silver tier · 1,120 rakeback claimable',
  onDeposit,
  onWithdraw,
  onClaimRakeback,
  onDashboard,
}: DepositSheetProps) {
  return (
    <>
      <div className={`sheet-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose}></div>
      <div className={`sheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="grab"></div>
        <h3>Your chip · {balance} MORBIUS</h3>
        <div className="sub">{subline}</div>
        <div className="opts">
          <button type="button" className="gold" onClick={onDeposit}>
            💰 Deposit<small>Add MORBIUS to play balance</small>
          </button>
          <button type="button" onClick={onWithdraw}>
            ↗ Withdraw<small>Back to your wallet</small>
          </button>
          <button type="button" onClick={onClaimRakeback}>
            🎁 Claim rakeback<small>1,120 MORBIUS ready</small>
          </button>
          <button type="button" onClick={onDashboard}>
            📊 Dashboard<small>Stats, history, profile</small>
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* MobileTopBar                                                         */
/* ------------------------------------------------------------------ */

/** Default player avatar — the inline SVG from the lab's .mob-bar .mav. */
const DEFAULT_MOB_AVATAR = (
  <svg viewBox="0 0 64 64" width="100%" height="100%">
    <circle cx="32" cy="32" r="32" fill="#16202f" />
    <circle cx="32" cy="26" r="12" fill="#e8b98a" />
    <rect x="18" y="40" width="28" height="18" rx="8" fill="#0f172a" />
    <rect x="20" y="20" width="24" height="6" rx="3" fill="#0b0e16" />
    <rect x="24" y="8" width="16" height="14" rx="2" fill="#0b0e16" />
    <rect x="24" y="23" width="7" height="4" rx="2" fill="#0ea5b7" />
    <rect x="33" y="23" width="7" height="4" rx="2" fill="#0ea5b7" />
  </svg>
);

export interface MobileTopBarProps {
  mode: 'player' | 'visitor';
  onConnect?: () => void;
  avatar?: React.ReactNode;
}

export function MobileTopBar({ mode, onConnect, avatar }: MobileTopBarProps) {
  return (
    <div className="mob-bar">
      <div className="sb-logo"><img src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" /></div>
      <span className="mtitle">
        MORBIUS<i>.IO</i>
      </span>
      {mode === 'player' ? (
        <div className="mav only-player">{avatar ?? DEFAULT_MOB_AVATAR}</div>
      ) : (
        <button
          type="button"
          className="btn-gold only-visitor"
          style={{
            marginLeft: 'auto',
            padding: '7px 14px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 800,
          }}
          onClick={onConnect}
        >
          Connect
        </button>
      )}
    </div>
  );
}
