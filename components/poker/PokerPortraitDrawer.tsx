'use client';

/**
 * Portrait hamburger drawer — faithful port of the poker-mobile-lab drawer.
 * Clean monochrome line icons, sectioned, Leave in muted red. Replaces the old
 * desktop "···" menu on mobile portrait. Self-contained: renders its own ☰ trigger
 * (top-right), scrim, and sliding panel; wired to the real table handlers via props.
 */

import { useState } from 'react';

export interface PokerPortraitDrawerProps {
  tableLabel?: string;
  subLabel?: string;
  seated: boolean;
  sittingOut?: boolean;
  canReup?: boolean;
  onAvatarProfile?: () => void;
  onAddChips?: () => void;
  onChat?: () => void;
  onSitOut?: () => void;
  onSitBack?: () => void;
  onSounds?: () => void;
  onTableSettings?: () => void;
  onMyStats?: () => void;
  onHowToPlay?: () => void;
  onLeave?: () => void;
}

/** Shared icon wrapper — 19px, 1.6 stroke, currentColor (muted via the item). */
function Ic({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
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
  sounds: <><path d="M4 9.5v5h3l4 3.5v-12L7 9.5z" /><path d="M15 9.2a4 4 0 0 1 0 5.6" /></>,
  settings: <><path d="M4 8h9M4 16h5" /><circle cx="17" cy="8" r="2.3" /><circle cx="12" cy="16" r="2.3" /></>,
  stats: <><path d="M4.5 19.5h15" /><path d="M7 19V11M12 19V6.5M17 19v-5.5" /></>,
  help: <><circle cx="12" cy="12" r="8.2" /><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.1" /><path d="M12 16.4h.01" /></>,
  leave: <><path d="M14 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H14" /><path d="M16.5 8.5 20 12l-3.5 3.5M10 12h10" /></>,
};

export function PokerPortraitDrawer(props: PokerPortraitDrawerProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const run = (fn?: () => void) => () => { close(); fn?.(); };

  const Item = ({ icon, label, sub, leave, onClick }: { icon: React.ReactNode; label: string; sub?: string; leave?: boolean; onClick?: () => void }) => (
    <button
      type="button"
      onClick={run(onClick)}
      className="flex w-full items-center gap-3.5 px-[18px] py-[11px] text-left font-semibold active:bg-white/[0.05]"
      style={{ fontSize: '14.5px', color: leave ? '#e2787f' : 'var(--poker-text, #e6ebf2)' }}
    >
      <span style={leave ? { color: '#e2787f' } : undefined}>
        {leave ? (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
          </span>
        ) : (
          <Ic>{icon}</Ic>
        )}
      </span>
      <span>{label}{sub && <span className="ml-2 font-medium text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{sub}</span>}</span>
    </button>
  );

  const H3 = ({ children }: { children: React.ReactNode }) => (
    <h3 className="mx-4 mb-1 mt-3.5 text-[10px] font-bold uppercase" style={{ letterSpacing: '0.14em', color: 'rgba(255,255,255,0.38)' }}>{children}</h3>
  );

  return (
    <>
      {/* Hamburger trigger — top-right, portrait only (parent gates rendering). */}
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="fixed right-2 z-[58] flex h-9 w-9 items-center justify-center rounded-lg"
        style={{
          top: 'max(8px, env(safe-area-inset-top, 0px))',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>

      {/* Scrim */}
      <div
        onClick={close}
        className="fixed inset-0 z-[60] transition-opacity duration-200"
        style={{ background: 'rgba(0,0,0,0.55)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-[61] flex flex-col"
        style={{
          width: 'min(80%, 300px)',
          background: 'var(--poker-panel, #12161c)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
          padding: 'calc(14px + env(safe-area-inset-top,0px)) 0 calc(14px + env(safe-area-inset-bottom,0px))',
        }}
      >
        <div className="mb-1 flex items-baseline gap-2 border-b px-4 pb-3.5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <span className="text-[16px] font-bold" style={{ color: 'var(--poker-text, #e6ebf2)' }}>{props.tableLabel ?? 'Table'}</span>
          {props.subLabel && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{props.subLabel}</span>}
          <button type="button" aria-label="Close" onClick={close} className="ml-auto self-center px-1.5 py-1 text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>✕</button>
        </div>

        <H3>Table</H3>
        {props.onAvatarProfile && <Item icon={ICONS.avatar} label="Avatar & Profile" onClick={props.onAvatarProfile} />}
        {props.seated && props.canReup && props.onAddChips && <Item icon={ICONS.chips} label="Add Chips" sub="Re-up" onClick={props.onAddChips} />}
        {props.onChat && <Item icon={ICONS.chat} label="Chat & Activity" onClick={props.onChat} />}
        {props.seated && (props.sittingOut
          ? props.onSitBack && <Item icon={ICONS.pause} label="Sit Back In" onClick={props.onSitBack} />
          : props.onSitOut && <Item icon={ICONS.pause} label="Sit Out Next Hand" onClick={props.onSitOut} />)}

        <div className="my-2.5 h-px" style={{ background: 'rgba(255,255,255,0.07)', margin: '10px 16px 2px' }} />
        <H3>Settings</H3>
        {props.onSounds && <Item icon={ICONS.sounds} label="Sounds" onClick={props.onSounds} />}
        {props.onTableSettings && <Item icon={ICONS.settings} label="Table Settings" onClick={props.onTableSettings} />}
        {props.onMyStats && <Item icon={ICONS.stats} label="My Stats" onClick={props.onMyStats} />}
        {props.onHowToPlay && <Item icon={ICONS.help} label="How to Play" onClick={props.onHowToPlay} />}

        {props.onLeave && (
          <div className="mt-auto">
            <Item icon={ICONS.leave} label={props.seated ? 'Leave Table' : 'Exit to Lobby'} leave onClick={props.onLeave} />
          </div>
        )}
      </aside>
    </>
  );
}
