'use client';

/**
 * WalletSheet — bottom sheet opened by the Pit Rail dock's WALLET slot.
 *
 * Player mode: identity header (avatar circle / display name / copyable short
 * address), a big gold balance hero, and the wallet action grid — deposit /
 * withdraw / profile settings / revoke approvals / dashboard / disconnect.
 * Visitor mode: a short pitch + a gold Connect Wallet button.
 *
 * Open/close: toggles an `open` class on its own veil + panel — see nav.tsx.
 * Every action closes the sheet first, then fires its handler.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface WalletSheetProps {
  open: boolean;
  onClose?: () => void;
  mode: 'player' | 'visitor';
  /** Display name shown in the header (player mode). */
  name?: string;
  /** Full wallet address — shortened for display, copied in full. */
  address?: string;
  balance?: string;
  /** Small line under the balance hero, e.g. tier + rakeback. */
  balanceSub?: string;
  /** Avatar node for the header circle; falls back to the default SVG. */
  avatar?: React.ReactNode;
  onConnect?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onProfile?: () => void;
  onApprovals?: () => void;
  onDashboard?: () => void;
  onDisconnect?: () => void;
}

/** Default avatar — same inline SVG family as the mob-bar's .mav fallback. */
const DEFAULT_WS_AVATAR = (
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

function shortAddress(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

export function WalletSheet({
  open,
  onClose,
  mode,
  name = 'Player',
  address,
  balance = '0',
  balanceSub,
  avatar,
  onConnect,
  onDeposit,
  onWithdraw,
  onProfile,
  onApprovals,
  onDashboard,
  onDisconnect,
}: WalletSheetProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = address;
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      try {
        ta.select();
        document.execCommand('copy');
      } finally {
        if (ta.isConnected) document.body.removeChild(ta);
      }
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  /** Every action closes the sheet first, then runs its handler. */
  const act = (fn?: () => void) => () => {
    onClose?.();
    fn?.();
  };

  return (
    <>
      <div className={`sheet-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose}></div>
      <div className={`sheet walletsheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="grab"></div>
        {mode === 'player' ? (
          <>
            <div className="ws-head">
              <div className="ws-av">{avatar ?? DEFAULT_WS_AVATAR}</div>
              <div className="ws-id">
                <div className="ws-name">{name}</div>
                <div className="ws-addr">
                  <span>{shortAddress(address)}</span>
                  <button
                    type="button"
                    className={`ws-copy${copied ? ' ok' : ''}`}
                    onClick={copyAddress}
                    aria-label="Copy address"
                  >
                    {copied ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="ws-hero">
              <div className="ws-amt">
                {balance} <span>MORBIUS</span>
              </div>
              {balanceSub ? <div className="ws-sub">{balanceSub}</div> : null}
            </div>
            <div className="opts">
              <button type="button" className="gold" onClick={act(onDeposit)}>
                💰 Deposit<small>Add MORBIUS to play balance</small>
              </button>
              <button type="button" onClick={act(onWithdraw)}>
                ↗ Withdraw<small>Back to your wallet</small>
              </button>
              <button type="button" onClick={act(onProfile)}>
                🧑‍🎨 Profile settings<small>Name, avatar, socials</small>
              </button>
              <button type="button" onClick={act(onApprovals)}>
                🛡 Revoke approvals<small>Manage token allowances</small>
              </button>
              <button type="button" className="wide" onClick={act(onDashboard)}>
                📊 Dashboard<small>Stats, history, profile</small>
              </button>
              <button type="button" className="rose" onClick={act(onDisconnect)}>
                🔌 Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Take a seat at the table</h3>
            <div className="sub">
              Connect your wallet to play, hold a MORBIUS balance and earn VIP rakeback on losses.
            </div>
            <button type="button" className="ws-connect" onClick={act(onConnect)}>
              Connect Wallet
            </button>
          </>
        )}
      </div>
    </>
  );
}
