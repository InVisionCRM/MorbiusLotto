'use client';

/**
 * Portrait hamburger drawer — the full mobile menu. Brings the entire desktop
 * "···" toolbar into portrait: table actions, branding (sponsor logo + tip dealer),
 * settings (sounds / appearance / quickchat / auto-rebuy / voice / how-to-play),
 * stats (player + table + admin dashboard), and admin bots. Leave sits at the
 * bottom in muted red.
 *
 * Look: modern frosted glass — translucent dark grey with a heavy backdrop blur,
 * white type, and the game's Russo One display font on the title + section
 * headers (matches the desktop poker header). Self-contained: renders its own ☰
 * trigger (top-right), scrim, and sliding panel; wired to real handlers via props.
 */

import { useState } from 'react';

export interface PokerPortraitDrawerProps {
  tableLabel?: string;
  subLabel?: string;
  seated: boolean;
  sittingOut?: boolean;
  canReup?: boolean;
  isAdmin?: boolean;
  /** Branding actions (sponsor logo / tip dealer) — only when the viewer is seated + connected. */
  showBranding?: boolean;
  onAvatarProfile?: () => void;
  onAddChips?: () => void;
  onChat?: () => void;
  onSitOut?: () => void;
  onSitBack?: () => void;
  onSponsorLogo?: () => void;
  onTipDealer?: () => void;
  /** Tip amount label shown beside "Tip Dealer" (e.g. "2,000"). */
  tipAmountLabel?: string;
  tipAnimating?: boolean;
  onSounds?: () => void;
  onTableSettings?: () => void;
  onEditQuickChat?: () => void;
  autoRebuy?: boolean;
  onToggleAutoRebuy?: () => void;
  voice?: { listening: boolean; supported: boolean; onToggle: () => void };
  onHowToPlay?: () => void;
  /** Opens the rich player-stats modal for the viewer's own address. */
  onPlayerStats?: () => void;
  /** Toggles the at-table stats panel. */
  onTableStats?: () => void;
  /** Admin-only poker dashboard. */
  onDashboard?: () => void;
  /** Admin bot controls. */
  adminBotsBusy?: boolean;
  adminBotMax?: number;
  onStartBots?: (count: number) => void;
  onStopBots?: () => void;
  onLeave?: () => void;
}

/** Shared icon wrapper — 19px, 1.6 stroke, currentColor (muted via the item). */
function Ic({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center" style={{ color: 'rgba(255,255,255,0.6)' }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const ICONS = {
  avatar: <><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" /></>,
  chips: <><circle cx="12" cy="12" r="8" /><path d="M12 8.3v7.4M8.3 12h7.4" /></>,
  chat: <path d="M20 13.5a2 2 0 0 1-2 2H9l-4 3v-3.2A2 2 0 0 1 4 13.5v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  pause: <path d="M9.5 6.5v11M14.5 6.5v11" />,
  sponsor: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8.8" cy="9.8" r="1.5" /><path d="M5 17l4-4 3 2.5 3-3 4 4.5" /></>,
  tip: <><ellipse cx="12" cy="6.8" rx="6.8" ry="2.8" /><path d="M5.2 6.8v4.6c0 1.55 3.05 2.8 6.8 2.8s6.8-1.25 6.8-2.8V6.8" /><path d="M5.2 11.4v4.6c0 1.55 3.05 2.8 6.8 2.8s6.8-1.25 6.8-2.8v-4.6" /></>,
  sounds: <><path d="M4 9.5v5h3l4 3.5v-12L7 9.5z" /><path d="M15 9.2a4 4 0 0 1 0 5.6" /></>,
  settings: <><path d="M4 8h9M4 16h5" /><circle cx="17" cy="8" r="2.3" /><circle cx="12" cy="16" r="2.3" /></>,
  quickchat: <><path d="M20 13.5a2 2 0 0 1-2 2H9l-4 3v-3.2A2 2 0 0 1 4 13.5v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /><path d="M8.2 8.8h7.6M8.2 11.6h4.4" /></>,
  rebuy: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.7 4v3.6h-3.6" /></>,
  voice: <><rect x="9" y="3.5" width="6" height="10.5" rx="3" /><path d="M6 11.5a6 6 0 0 0 12 0" /><path d="M12 17.5V20" /></>,
  help: <><circle cx="12" cy="12" r="8.2" /><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.1" /><path d="M12 16.4h.01" /></>,
  playerStats: <><circle cx="9" cy="8" r="3" /><path d="M3.8 19a5.2 5.2 0 0 1 8.2-3.4" /><path d="M15.5 19.5v-4M19 19.5v-7" /></>,
  tableStats: <><path d="M4.5 19.5h15" /><path d="M7 19V11M12 19V6.5M17 19v-5.5" /></>,
  dashboard: <><rect x="4" y="4" width="7" height="7" rx="1.4" /><rect x="13" y="4" width="7" height="4" rx="1.4" /><rect x="13" y="10" width="7" height="10" rx="1.4" /><rect x="4" y="13" width="7" height="7" rx="1.4" /></>,
  bots: <><rect x="5" y="8" width="14" height="10" rx="2.6" /><path d="M12 8V5" /><circle cx="12" cy="3.6" r="1.3" /><path d="M2.8 12.5v3M21.2 12.5v3" /><circle cx="9.6" cy="13" r="1.05" fill="currentColor" stroke="none" /><circle cx="14.4" cy="13" r="1.05" fill="currentColor" stroke="none" /></>,
  leave: <><path d="M14 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H14" /><path d="M16.5 8.5 20 12l-3.5 3.5M10 12h10" /></>,
};

export function PokerPortraitDrawer(props: PokerPortraitDrawerProps) {
  const [open, setOpen] = useState(false);
  const [botCount, setBotCount] = useState('4');
  const close = () => setOpen(false);
  const run = (fn?: () => void) => () => { close(); fn?.(); };

  /** A menu row. `keepOpen` leaves the drawer up (toggles / admin); `right` is a trailing accessory. */
  const Item = ({
    icon, label, sub, right, leave, keepOpen, onClick,
  }: {
    icon: React.ReactNode; label: string; sub?: string; right?: React.ReactNode;
    leave?: boolean; keepOpen?: boolean; onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={keepOpen ? onClick : run(onClick)}
      className="font-jost flex w-full items-center gap-3.5 px-[18px] py-[11px] text-left active:bg-white/[0.06]"
      style={{ fontSize: '14.5px', fontWeight: 500, color: leave ? '#ef8b91' : 'rgba(255,255,255,0.94)' }}
    >
      {leave ? (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center" style={{ color: '#ef8b91' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
      ) : (
        <Ic>{icon}</Ic>
      )}
      <span className="flex-1">
        {label}
        {sub && <span className="ml-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{sub}</span>}
      </span>
      {right}
    </button>
  );

  /** ON/OFF pill for toggle rows. */
  const Pill = ({ on }: { on: boolean }) => (
    <span
      className="font-russo-one rounded-full px-2 py-[3px] text-[10px] tracking-wide"
      style={
        on
          ? { background: 'rgba(56,189,176,0.18)', color: '#7fe6d6', border: '1px solid rgba(56,189,176,0.4)' }
          : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.12)' }
      }
    >
      {on ? 'ON' : 'OFF'}
    </span>
  );

  const H3 = ({ children }: { children: React.ReactNode }) => (
    <h3 className="font-russo-one mx-4 mb-1 mt-3.5 text-[10px] uppercase" style={{ letterSpacing: '0.18em', color: 'rgba(255,255,255,0.42)' }}>{children}</h3>
  );

  const Divider = () => <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 16px 2px' }} />;

  return (
    <>
      {/* Hamburger trigger — top-right, portrait only (parent gates rendering). Frosted glass. */}
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="fixed right-2 z-[58] flex h-9 w-9 items-center justify-center rounded-xl"
        style={{
          top: 'max(8px, env(safe-area-inset-top, 0px))',
          background: 'rgba(22,24,30,0.5)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>

      {/* Scrim */}
      <div
        onClick={close}
        className="fixed inset-0 z-[60] transition-opacity duration-200"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        aria-hidden
      />

      {/* Panel — translucent dark grey, heavy blur, white type. */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-[61] flex flex-col overflow-y-auto"
        style={{
          width: 'min(82%, 312px)',
          background: 'rgba(17,19,24,0.62)',
          backdropFilter: 'blur(22px) saturate(150%)',
          WebkitBackdropFilter: 'blur(22px) saturate(150%)',
          borderLeft: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.45)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
          padding: 'calc(14px + env(safe-area-inset-top,0px)) 0 calc(14px + env(safe-area-inset-bottom,0px))',
        }}
      >
        <div className="mb-1 flex items-baseline gap-2 border-b px-4 pb-3.5" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <span className="font-russo-one text-[16px]" style={{ color: '#ffffff', letterSpacing: '0.02em' }}>{props.tableLabel ?? 'Table'}</span>
          {props.subLabel && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{props.subLabel}</span>}
          <button type="button" aria-label="Close" onClick={close} className="ml-auto self-center px-1.5 py-1 text-[14px]" style={{ color: 'rgba(255,255,255,0.55)' }}>✕</button>
        </div>

        <H3>Table</H3>
        {props.onAvatarProfile && <Item icon={ICONS.avatar} label="Avatar & Profile" onClick={props.onAvatarProfile} />}
        {props.seated && props.canReup && props.onAddChips && <Item icon={ICONS.chips} label="Add Chips" sub="Re-up" onClick={props.onAddChips} />}
        {props.onChat && <Item icon={ICONS.chat} label="Chat & Activity" onClick={props.onChat} />}
        {props.seated && (props.sittingOut
          ? props.onSitBack && <Item icon={ICONS.pause} label="Sit Back In" onClick={props.onSitBack} />
          : props.onSitOut && <Item icon={ICONS.pause} label="Sit Out Next Hand" onClick={props.onSitOut} />)}

        {props.showBranding && (props.onSponsorLogo || props.onTipDealer) && (
          <>
            <Divider />
            <H3>Branding</H3>
            {props.onSponsorLogo && <Item icon={ICONS.sponsor} label="Sponsor Table Logo" onClick={props.onSponsorLogo} />}
            {props.onTipDealer && (
              <Item
                icon={ICONS.tip}
                label="Tip Dealer"
                sub={props.tipAmountLabel}
                keepOpen
                onClick={props.tipAnimating ? undefined : props.onTipDealer}
              />
            )}
          </>
        )}

        <Divider />
        <H3>Settings</H3>
        {props.onSounds && <Item icon={ICONS.sounds} label="Sounds" onClick={props.onSounds} />}
        {props.onTableSettings && <Item icon={ICONS.settings} label="Table Appearance" onClick={props.onTableSettings} />}
        {props.onEditQuickChat && <Item icon={ICONS.quickchat} label="Edit QuickChat" onClick={props.onEditQuickChat} />}
        {props.seated && props.onToggleAutoRebuy && (
          <Item icon={ICONS.rebuy} label="Auto Rebuy" keepOpen right={<Pill on={!!props.autoRebuy} />} onClick={props.onToggleAutoRebuy} />
        )}
        {props.voice && props.voice.supported && (
          <Item icon={ICONS.voice} label="Voice Commands" keepOpen right={<Pill on={props.voice.listening} />} onClick={props.voice.onToggle} />
        )}
        {props.onHowToPlay && <Item icon={ICONS.help} label="How to Play" onClick={props.onHowToPlay} />}

        {(props.onPlayerStats || props.onTableStats || (props.isAdmin && props.onDashboard)) && (
          <>
            <Divider />
            <H3>Stats</H3>
            {props.onPlayerStats && <Item icon={ICONS.playerStats} label="Player Stats" onClick={props.onPlayerStats} />}
            {props.onTableStats && <Item icon={ICONS.tableStats} label="Table Stats" onClick={props.onTableStats} />}
            {props.isAdmin && props.onDashboard && <Item icon={ICONS.dashboard} label="Poker Dashboard" onClick={props.onDashboard} />}
          </>
        )}

        {props.isAdmin && (props.onStartBots || props.onStopBots) && (
          <>
            <Divider />
            <H3>Admin · Bots</H3>
            <div className="flex items-center gap-2 px-[18px] py-2">
              <Ic>{ICONS.bots}</Ic>
              <input
                type="number"
                min={1}
                max={props.adminBotMax ?? 9}
                value={botCount}
                onChange={(e) => setBotCount(e.target.value)}
                className="font-jost w-12 rounded-md px-2 py-1 text-[13px]"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff' }}
              />
              <button
                type="button"
                disabled={props.adminBotsBusy}
                onClick={() => {
                  const n = Math.max(1, Math.min(props.adminBotMax ?? 9, parseInt(botCount, 10) || 1));
                  props.onStartBots?.(n);
                }}
                className="font-russo-one flex-1 rounded-md px-2 py-1.5 text-[11px] uppercase tracking-wide disabled:opacity-50"
                style={{ background: 'rgba(56,189,176,0.16)', color: '#7fe6d6', border: '1px solid rgba(56,189,176,0.36)' }}
              >
                {props.adminBotsBusy ? 'Starting…' : 'Start'}
              </button>
              <button
                type="button"
                disabled={props.adminBotsBusy}
                onClick={() => props.onStopBots?.()}
                className="font-russo-one rounded-md px-2 py-1.5 text-[11px] uppercase tracking-wide disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.14)' }}
              >
                Stop
              </button>
            </div>
          </>
        )}

        {props.onLeave && (
          <div className="mt-auto pt-2">
            <Item icon={ICONS.leave} label={props.seated ? 'Leave Table' : 'Exit to Lobby'} leave onClick={props.onLeave} />
          </div>
        )}
      </aside>
    </>
  );
}
