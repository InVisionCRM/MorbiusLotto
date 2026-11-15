'use client';

/**
 * home2 nav — Chronograph chrome (design option 11).
 *
 *  - TopNav    — the mockup's slim `header.top`: M mark + Michroma wordmark,
 *                tracked uppercase links, steel Connect pill (or the player's
 *                balance + wallet button), price/chart and the menu button.
 *  - ChipDock  — the mockup's floating mobile `nav.dock` (Home · Games ·
 *                knurled M · Drop · Wallet).
 *  - NavDrawer — the full directory that used to be the desktop left rail:
 *                balance + deposit/withdraw/disconnect, VIP progress, every
 *                game route, "my stuff", price and the chart. Opened from the
 *                menu button (desktop) or the dock's centre M (mobile).
 */

import Link from 'next/link';
import React, { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { isAdminWallet } from '@/lib/admin';

/* ------------------------------------------------------------------ */
/* icons (mockup stroke set)                                           */
/* ------------------------------------------------------------------ */
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  games: 'M3 3h7.5v7.5H3zM13.5 3H21v7.5h-7.5zM3 13.5h7.5V21H3zM13.5 13.5H21V21h-7.5z',
  drop: 'M3 9a2 2 0 0 0 0 4v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5a2 2 0 0 1 0-4V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zM14 6v12',
  wallet: 'M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12M16.5 13.5h.01',
  menu: 'M4 7h16M4 12h16M4 17h10',
  close: 'M6 6l12 12M18 6 6 18',
  chart: 'M3 17l5-5 4 3 8-8M15 7h5v5',
} as const;

function I({ d, w = 1.6 }: { d: keyof typeof P; w?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[d]} />
    </svg>
  );
}

/* Sub-cent token price: keep 3 significant digits ($0.000421), never exponent notation. */
const USD_PRICE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 });

/* ------------------------------------------------------------------ */
/* TopNav                                                              */
/* ------------------------------------------------------------------ */

export interface TopNavProps {
  mode: 'player' | 'visitor';
  balance: string;
  avatarUrl?: string | null;
  priceUsd: number | null;
  onConnect?: () => void;
  onWallet?: () => void;
  onMenu?: () => void;
  onChart?: () => void;
  /** Jump to the collection with a tab preselected ('orig' / 'table'). */
  onFloor?: (filter: string) => void;
  onDrop?: () => void;
}

export function TopNav({ mode, balance, avatarUrl, priceUsd, onConnect, onWallet, onMenu, onChart, onFloor, onDrop }: TopNavProps) {
  return (
    <header className="top">
      <Link className="logo" href="/" aria-label="Morbius home">
        <img src="/home2/m-mark.png" alt="" />
        <span>Morbius</span>
      </Link>
      <nav className="links" aria-label="Primary">
        <a className="on" href="#top" aria-current="page">
          Lobby
        </a>
        <Link href="/poker">FreeRoll</Link>
        <button type="button" onClick={() => onFloor?.('orig')}>
          Originals
        </button>
        <button type="button" onClick={() => onFloor?.('table')}>
          Tables
        </button>
        <button type="button" onClick={onDrop}>
          Drop
        </button>
        <Link href="/vip">VIP</Link>
      </nav>
      <div className="top-r">
        {priceUsd != null && (
          <button type="button" className="px" onClick={onChart} aria-label="Open the MORBIUS price chart">
            <span>MORBIUS</span> {USD_PRICE.format(priceUsd)}
            <I d="chart" />
          </button>
        )}
        {mode === 'player' ? (
          <button type="button" className="bal-chip" onClick={onWallet} aria-label="Open your wallet">
            <b>{balance}</b>
            <span>MORBIUS</span>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <i>
                <I d="wallet" />
              </i>
            )}
          </button>
        ) : (
          <button type="button" className="btn" onClick={onConnect}>
            Connect
          </button>
        )}
        <button type="button" className="menu-btn" onClick={onMenu} aria-label="Open menu">
          <I d="menu" />
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* ChipDock — mobile floating dock                                     */
/* ------------------------------------------------------------------ */

export interface ChipDockProps {
  /** Centre M — opens the nav drawer. */
  onChip?: () => void;
  onGames?: () => void;
  onDrop?: () => void;
  onWallet?: () => void;
  /** e.g. '2d' — time until the Weekly Drop closes; null hides the badge. */
  dropBadge?: string | null;
  activeTab?: 'home' | 'games' | 'drop' | 'wallet' | string;
}

export function ChipDock({ onChip, onGames, onDrop, onWallet, dropBadge = null, activeTab = 'home' }: ChipDockProps) {
  const on = (tab: string) => (activeTab === tab ? 'on' : undefined);
  return (
    <nav className="dock" aria-label="Quick actions">
      <button type="button" className={on('home')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <I d="home" />
        <span>Home</span>
      </button>
      <button type="button" className={on('games')} onClick={onGames}>
        <I d="games" />
        <span>Games</span>
      </button>
      <button type="button" className="m" onClick={onChip} aria-label="Open menu">
        <img src="/home2/m-mark.png" alt="" />
      </button>
      <button type="button" className={on('drop')} onClick={onDrop}>
        <I d="drop" />
        <span>Drop</span>
        {dropBadge ? <em>{dropBadge}</em> : null}
      </button>
      <button type="button" className={on('wallet')} onClick={onWallet}>
        <I d="wallet" />
        <span>Wallet</span>
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* NavDrawer — the full directory                                      */
/* ------------------------------------------------------------------ */

interface DLink {
  label: string;
  href?: string;
  onClick?: () => void;
  tag?: string;
}

const ORIGINALS_LINKS: DLink[] = [
  { label: 'Plinko', href: '/plinko2' },
  { label: 'Crash', href: '/crash', tag: 'Hot' },
  { label: 'Mines', href: '/mines2' },
  { label: 'Towers', href: '/towers' },
  { label: 'Limbo', href: '/limbo2' },
  { label: 'Dice', href: '/dice2' },
  { label: 'Dice x2', href: '/dicex2' },
  { label: 'Keno', href: '/keno2' },
  { label: 'Chicken', href: '/chicken' },
  { label: 'Cascade', href: '/cascade' },
  { label: 'Firewalk', href: '/firewalk' },
];

const CARDS_TABLE_LINKS: DLink[] = [
  { label: 'Blackjack', href: '/BLACKJACK', tag: 'Live' },
  { label: 'Multiplayer BJ', href: '/blackjack-multi' },
  { label: "Ruby's Table", href: '/ruby', tag: 'New' },
  { label: 'Poker', href: '/poker', tag: 'Live' },
  { label: 'Roulette', href: '/roulette2' },
  { label: 'Baccarat', href: '/baccarat' },
  { label: 'Craps', href: '/craps' },
  { label: 'Multiplayer Craps', href: '/craps/multi' },
  { label: "Multiplayer Hold'em", href: '/ultimate-holdem/multi' },
  { label: 'Multiplayer Roulette', href: '/roulette/multi' },
  { label: 'Dragon Tiger', href: '/dragon-tiger' },
  { label: 'Three Card', href: '/three-card-poker' },
  { label: 'Pai Gow', href: '/pai-gow-poker' },
  { label: "Ultimate Hold'em", href: '/ultimate-holdem' },
  { label: 'Spanish 21', href: '/spanish-21' },
  { label: 'Double Exposure', href: '/double-exposure' },
  { label: 'Pontoon', href: '/pontoon' },
  { label: 'Free Bet BJ', href: '/free-bet-blackjack' },
  { label: 'Blackjack Switch', href: '/blackjack-switch' },
  { label: 'Caribbean Stud', href: '/caribbean-stud' },
  { label: 'Video Poker', href: '/video-poker' },
];

const MORE_GAMES_LINKS: DLink[] = [
  { label: 'Andar Bahar', href: '/andar-bahar' },
  { label: 'Pachinko', href: '/pachinko' },
  { label: 'Heist', href: '/heist' },
  { label: 'Greed Dice', href: '/greed-dice' },
  { label: 'Cipher', href: '/cipher' },
  { label: 'Hi-Lo', href: '/hilo' },
];

function DItem({ label, href, onClick, tag, close }: DLink & { close?: () => void }) {
  const body = (
    <>
      {label}
      {tag ? <em>{tag}</em> : null}
    </>
  );
  if (href)
    return (
      <Link href={href} onClick={close}>
        {body}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={() => {
        close?.();
        onClick?.();
      }}
    >
      {body}
    </button>
  );
}

function Group({ title, links, open, close }: { title: string; links: DLink[]; open?: boolean; close?: () => void }) {
  return (
    <details className="dg" open={open}>
      <summary>
        <span>{title}</span>
        <i aria-hidden="true">{links.length}</i>
      </summary>
      <div className="dl">
        {links.map((l) => (
          <DItem key={l.label} {...l} close={close} />
        ))}
      </div>
    </details>
  );
}

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: 'player' | 'visitor';
  balance: string;
  tierName: string;
  tierRakeback: string;
  /** Next ladder rung, or null at the top tier. */
  nextTier: string | null;
  nextRakeback: string;
  progressPct: number;
  wagerToNext: string;
  /** Largest win in the live recent-wins feed; null hides the row. */
  recentHigh: number | null;
  priceUsd: number | null;
  onConnect?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onDisconnect?: () => void;
  onChart?: () => void;
  onDashboard?: () => void;
  onProfile?: () => void;
}

export function NavDrawer({
  open,
  onClose,
  mode,
  balance,
  tierName,
  tierRakeback,
  nextTier,
  nextRakeback,
  progressPct,
  wagerToNext,
  recentHigh,
  priceUsd,
  onConnect,
  onDeposit,
  onWithdraw,
  onDisconnect,
  onChart,
  onDashboard,
  onProfile,
}: NavDrawerProps) {
  // /activity is the admin platform dashboard — only surface it to admin wallets.
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const act = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };

  const myStuff: DLink[] = [
    ...(mode === 'player'
      ? [
          { label: 'Dashboard', onClick: onDashboard },
          { label: 'Profile & avatar', onClick: onProfile },
        ]
      : []),
    { label: 'VIP Club', href: '/vip' },
    { label: 'Refer & Earn', href: '/referrals' },
    { label: 'Get MORBIUS', href: '/swap' },
    ...(isAdmin ? [{ label: 'History', href: '/activity' }] : []),
  ];

  return (
    <>
      <div className={`drawer-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose} />
      <aside className={`drawer${open ? ' open' : ''}`} aria-hidden={!open} aria-label="Menu" inert={!open ? true : undefined}>
        <div className="dr-head">
          <span className="logo">
            <img src="/home2/m-mark.png" alt="" />
            <span>Morbius</span>
          </span>
          <button type="button" className="x" onClick={onClose} aria-label="Close menu">
            <I d="close" />
          </button>
        </div>
        <div className="dr-scroll">
          {mode === 'player' ? (
            <div className="dr-bal">
              <label>Play balance</label>
              <b>
                {balance} <span>MORBIUS</span>
              </b>
              <div className="row">
                <button type="button" className="steel" onClick={act(onDeposit)}>
                  Deposit
                </button>
                <button type="button" onClick={act(onWithdraw)}>
                  Withdraw
                </button>
              </div>
              <button type="button" className="disc" onClick={act(onDisconnect)}>
                Disconnect wallet
              </button>
            </div>
          ) : (
            <div className="dr-bal">
              <label>Welcome to the floor</label>
              <b className="v">Connect to take a seat</b>
              <div className="row">
                <button type="button" className="steel" onClick={act(onConnect)}>
                  Connect wallet
                </button>
              </div>
            </div>
          )}

          {mode === 'player' && (
            <div className="dr-vip">
              <div className="t">
                <span>
                  {tierName} · {tierRakeback}
                </span>
                <span>{nextTier ? `${nextTier} · ${nextRakeback}` : 'Top tier'}</span>
              </div>
              <div className="meter" style={{ '--p': `${Math.max(0, Math.min(100, progressPct))}%` } as React.CSSProperties}>
                <i />
              </div>
              <small>
                {nextTier ? (
                  <>
                    <b>{wagerToNext}</b> MORBIUS wagered to rank up
                  </>
                ) : (
                  'Top of the ladder — the highest rakeback rate'
                )}
              </small>
            </div>
          )}

          <Group title="FreeRoll & poker" open close={onClose} links={[{ label: '#PulseChain Poker FreeRoll', href: '/poker', tag: 'Free' }, { label: 'Create a tournament', href: '/poker/tournaments/create' }]} />
          <Group title="Originals" open close={onClose} links={ORIGINALS_LINKS} />
          <Group title="Cards & table" open close={onClose} links={CARDS_TABLE_LINKS} />
          <Group title="More games" close={onClose} links={MORE_GAMES_LINKS} />
          <Group title="My stuff" open close={onClose} links={myStuff} />
        </div>
        <div className="dr-foot">
          {recentHigh != null && (
            <div className="r">
              <span>Recent high</span>
              <b className="g">{recentHigh.toLocaleString('en-US')}</b>
            </div>
          )}
          {priceUsd != null && (
            <div className="r">
              <span>MORBIUS</span>
              <b>{USD_PRICE.format(priceUsd)}</b>
            </div>
          )}
          <button type="button" className="r" onClick={act(onChart)}>
            <span>Swap · LP · Chart</span>
            <b className="c">↗</b>
          </button>
        </div>
      </aside>
    </>
  );
}
