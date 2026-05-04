'use client';

import React, { useEffect, useState } from 'react';
import type { PokerTableState } from '@/lib/websocket-client';
import { SpeechVoiceToggle } from '@/components/shared/SpeechHUD';

/** Matches "How to Play" / Settings header chips (see `data-poker-header-secondary`). */
const POKER_HEADER_SECONDARY_BTN_CLASS =
  'h-9 px-2.5 sm:px-3 rounded-sm text-[10px] sm:text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97] whitespace-nowrap';
const POKER_HEADER_SECONDARY_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.75)',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
};

interface PokerHeaderBarProps {
  renderedState: PokerTableState | null;
  fmtChips: (wei: string | number) => string;
  normalizedAddress: string | null;
  isAdmin: boolean;
  showMyStats: boolean;
  showDashboard: boolean;
  settingsMenuOpen: boolean;
  statsMenuOpen: boolean;
  setSettingsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setStatsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowHowToPlay: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTableSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSoundsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEditQuickChatModal: React.Dispatch<React.SetStateAction<boolean>>;
  setStatsModalAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setShowStatsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMyStats: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDashboard: React.Dispatch<React.SetStateAction<boolean>>;
  adminBotsBusy: boolean;
  adminBotMax: number;
  onAdminStartBots: (numBots: number) => void;
  onAdminStopBots: () => void;
  onLeaveClick: () => void;
  /** Spectator / eliminated: show Exit instead of Leave (return to lobby without a seated stack). */
  showExitToLobby?: boolean;
  onExitClick?: () => void;
  /** Whether the seated player has auto-rebuy enabled. Only shown when player is seated. */
  autoRebuy?: boolean;
  onToggleAutoRebuy?: () => void;
  /** Seated + connected: show Logo / Tip next to How to Play */
  showTableBrandingActions?: boolean;
  onOpenTableLogoSponsor?: () => void;
  tipAnimating?: boolean;
  setTipAnimating?: React.Dispatch<React.SetStateAction<boolean>>;
  onTipDealer?: () => Promise<void>;
  /** Voice commands toggle — same row as Logo / Tip / How to Play */
  voiceCommands?: {
    listening: boolean;
    supported: boolean;
    onToggle: () => void;
  };
  /** Center column of the header grid (e.g. tournament Stream voice strip). */
  voiceSlot?: React.ReactNode;
}

export function PokerHeaderBar({
  renderedState,
  fmtChips,
  normalizedAddress,
  isAdmin,
  showMyStats,
  showDashboard,
  settingsMenuOpen,
  statsMenuOpen,
  setSettingsMenuOpen,
  setStatsMenuOpen,
  setShowHowToPlay,
  setShowTableSettingsModal,
  setShowSoundsModal,
  setShowEditQuickChatModal,
  setStatsModalAddress,
  setShowStatsModal,
  setShowMyStats,
  setShowDashboard,
  adminBotsBusy,
  adminBotMax,
  onAdminStartBots,
  onAdminStopBots,
  onLeaveClick,
  showExitToLobby = false,
  onExitClick,
  autoRebuy = false,
  onToggleAutoRebuy,
  showTableBrandingActions = false,
  onOpenTableLogoSponsor,
  tipAnimating = false,
  setTipAnimating,
  onTipDealer,
  voiceCommands,
  voiceSlot,
}: PokerHeaderBarProps) {
  const [botsMenuOpen, setBotsMenuOpen] = useState(false);
  const [botCountInput, setBotCountInput] = useState('4');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Countdown for the active table-logo sponsorship; ticks once per second.
  const sponsoredUntil = renderedState?.tableLogoSponsoredUntil ?? null;
  const [logoTimerLabel, setLogoTimerLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!sponsoredUntil) {
      setLogoTimerLabel(null);
      return;
    }
    const end = new Date(sponsoredUntil).getTime();
    if (Number.isNaN(end)) {
      setLogoTimerLabel(null);
      return;
    }
    const compute = () => {
      const ms = end - Date.now();
      if (ms <= 0) {
        setLogoTimerLabel(null);
        return false;
      }
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      setLogoTimerLabel(`${m}:${r.toString().padStart(2, '0')}`);
      return true;
    };
    if (!compute()) return;
    const id = setInterval(() => {
      if (!compute()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [sponsoredUntil]);

  const parseBotCount = () => {
    const n = Number(botCountInput);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(adminBotMax, Math.floor(n)));
  };

  return (
    <div
      data-poker-header
      className="grid flex-shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 relative z-50 font-russo-one"
      style={{
        background: 'transparent',
        borderBottom: 'none',
        paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
        paddingBottom: '8px',
      }}
    >
      {renderedState ? (
        <div className="flex items-center gap-2 min-w-0 pl-1">
          <span className="text-[12px] sm:text-[13px] font-bold text-[rgba(255,255,255,0.9)] tabular-nums whitespace-nowrap">
            {fmtChips(renderedState.smallBlind)}/{fmtChips(renderedState.bigBlind)}
          </span>
          <span className="text-[11px] sm:text-[12px] text-[rgba(255,255,255,0.62)] tabular-nums whitespace-nowrap">
            {renderedState.seats.filter((s) => s.playerAddress).length}/{renderedState.maxSeats} seats
          </span>
        </div>
      ) : (
        <div className="min-w-0" />
      )}
      <div className="min-w-0 flex justify-center items-center overflow-hidden px-0.5 self-center">
        {voiceSlot ?? null}
      </div>
      <div className="flex items-center justify-end gap-1.5 shrink-0 relative">
        {showTableBrandingActions && onOpenTableLogoSponsor && onTipDealer && setTipAnimating && (
          <>
            <button
              data-poker-header-secondary
              type="button"
              onClick={() => {
                onOpenTableLogoSponsor();
                setSettingsMenuOpen(false);
                setStatsMenuOpen(false);
              }}
              className={POKER_HEADER_SECONDARY_BTN_CLASS}
              style={POKER_HEADER_SECONDARY_BTN_STYLE}
            >
              Logo
              {logoTimerLabel && (
                <span className="ml-1.5 tabular-nums opacity-80">{logoTimerLabel}</span>
              )}
            </button>
            <div data-poker-header-secondary className="relative shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (tipAnimating) return;
                  setTipAnimating(true);
                  try {
                    await onTipDealer();
                  } finally {
                    setTimeout(() => setTipAnimating(false), 900);
                  }
                }}
                disabled={tipAnimating}
                className={`${POKER_HEADER_SECONDARY_BTN_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
                style={POKER_HEADER_SECONDARY_BTN_STYLE}
              >
                Tip 2,000
              </button>
              {tipAnimating && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50"
                  style={{ top: '100%', marginTop: 2 }}
                  aria-hidden
                >
                  <div className="tip-chip-fly">
                    <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                      <span className="text-white text-[8px] font-bold">$</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {voiceCommands && (
          <div data-poker-header-secondary className="relative shrink-0">
            <SpeechVoiceToggle
              listening={voiceCommands.listening}
              supported={voiceCommands.supported}
              onToggle={() => {
                voiceCommands.onToggle();
                setSettingsMenuOpen(false);
                setStatsMenuOpen(false);
              }}
              labelMode="short"
              className={POKER_HEADER_SECONDARY_BTN_CLASS}
              style={POKER_HEADER_SECONDARY_BTN_STYLE}
            />
          </div>
        )}
        <button
          data-poker-header-secondary
          type="button"
          onClick={() => {
            setShowHowToPlay(true);
            setSettingsMenuOpen(false);
            setStatsMenuOpen(false);
          }}
          className={POKER_HEADER_SECONDARY_BTN_CLASS}
          style={POKER_HEADER_SECONDARY_BTN_STYLE}
          aria-haspopup="dialog"
        >
          How to Play
        </button>
        <div data-poker-header-secondary className="relative">
          <button
            type="button"
            onClick={() => {
              setSettingsMenuOpen((o) => !o);
              setStatsMenuOpen(false);
            }}
            className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
            style={POKER_HEADER_SECONDARY_BTN_STYLE}
            aria-expanded={settingsMenuOpen}
            aria-haspopup="true"
          >
            Settings
          </button>
          {settingsMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setSettingsMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/10 overflow-hidden"
                style={{ background: 'rgba(10,10,10,0.98)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowTableSettingsModal(true);
                    setSettingsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Table Appearance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSoundsModal(true);
                    setSettingsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Sounds
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditQuickChatModal(true);
                    setSettingsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Edit QuickChat
                </button>
                {onToggleAutoRebuy && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAutoRebuy();
                      setSettingsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    <span>Auto Rebuy</span>
                    <span
                      className="ml-2 inline-flex items-center justify-center rounded-full text-[9px] font-extrabold px-1.5 py-0.5"
                      style={{
                        background: autoRebuy ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.08)',
                        color: autoRebuy ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${autoRebuy ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.12)'}`,
                        minWidth: 28,
                      }}
                    >
                      {autoRebuy ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {normalizedAddress && (
          <div data-poker-header-secondary className="relative">
            <button
              type="button"
              onClick={() => {
                setStatsMenuOpen((o) => !o);
                setSettingsMenuOpen(false);
              }}
              className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
              style={{
                background: showMyStats || showDashboard ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.07)',
                color: showMyStats || showDashboard ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.75)',
                border: `1px solid ${showMyStats || showDashboard ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
              aria-expanded={statsMenuOpen}
              aria-haspopup="true"
            >
              Stats
            </button>
            {statsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setStatsMenuOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/10 overflow-hidden"
                  style={{ background: 'rgba(10,10,10,0.98)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setStatsModalAddress(normalizedAddress);
                      setShowStatsModal(true);
                      setStatsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    Player Stats
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMyStats((v) => !v);
                      if (showDashboard) setShowDashboard(false);
                      setStatsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                    style={{ color: showMyStats ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                  >
                    Table Stats
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDashboard((v) => !v);
                        if (showMyStats) setShowMyStats(false);
                        setStatsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                      style={{ color: showDashboard ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                    >
                      Poker Dashboard
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {normalizedAddress &&
          (isAdmin ||
            renderedState?.seats?.some((s) => (s.playerAddress || '').toLowerCase() === normalizedAddress)) && (
          <div data-poker-header-secondary className="relative">
            <button
              type="button"
              onClick={() => {
                setBotsMenuOpen((o) => !o);
                setSettingsMenuOpen(false);
                setStatsMenuOpen(false);
              }}
              className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
              aria-expanded={botsMenuOpen}
              aria-haspopup="true"
            >
              Bots
            </button>
            {botsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setBotsMenuOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-lg border border-white/10 overflow-hidden p-3"
                  style={{ background: 'rgba(10,10,10,0.98)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                >
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.62)' }}>
                    Bot Count (1-{adminBotMax})
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={adminBotMax}
                    value={botCountInput}
                    onChange={(e) => setBotCountInput(e.target.value)}
                    className="w-full rounded-md px-2 py-1.5 text-[12px] mb-2 bg-black/35 border border-white/15 focus:outline-none focus:border-cyan-400/60"
                    style={{ color: 'rgba(255,255,255,0.92)' }}
                  />
                  <button
                    type="button"
                    disabled={adminBotsBusy}
                    onClick={() => {
                      onAdminStartBots(parseBotCount());
                      setBotsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {adminBotsBusy ? 'Starting Bots...' : 'Start Bot Players'}
                  </button>
                  <button
                    type="button"
                    disabled={adminBotsBusy}
                    onClick={() => {
                      onAdminStopBots();
                      setBotsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Stop Bot Players
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {/* Mobile-only ⋯ menu — hidden on desktop via CSS, shown on mobile landscape */}
        <div data-poker-header-mobile-menu className="relative" style={{ display: 'none' }}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="h-9 w-9 flex items-center justify-center rounded-sm text-base font-bold transition-all hover:brightness-125 active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            aria-label="More options"
          >
            ···
          </button>
          {mobileMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setMobileMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-white/10 overflow-hidden"
                style={{ background: 'rgba(10,10,10,0.98)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              >
                <button
                  type="button"
                  onClick={() => { setShowHowToPlay(true); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  How to Play
                </button>
                {voiceCommands && (
                  <button
                    type="button"
                    onClick={() => {
                      voiceCommands.onToggle();
                      setMobileMenuOpen(false);
                    }}
                    disabled={!voiceCommands.supported}
                    className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      color: !voiceCommands.supported
                        ? 'rgba(255,255,255,0.4)'
                        : voiceCommands.listening
                          ? 'rgb(252,165,165)'
                          : 'rgba(255,255,255,0.9)',
                    }}
                  >
                    Voice: {!voiceCommands.supported ? 'N/A' : voiceCommands.listening ? 'On' : 'Off'}
                  </button>
                )}
                {showTableBrandingActions && onOpenTableLogoSponsor && onTipDealer && setTipAnimating && (
                  <>
                    <button
                      type="button"
                      onClick={() => { onOpenTableLogoSponsor(); setMobileMenuOpen(false); }}
                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      Table logo
                      {logoTimerLabel && (
                        <span className="ml-1.5 tabular-nums opacity-80">{logoTimerLabel}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (tipAnimating) return;
                        setTipAnimating(true);
                        try {
                          await onTipDealer();
                        } finally {
                          setTimeout(() => setTipAnimating(false), 900);
                        }
                        setMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5 disabled:opacity-60"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                      disabled={tipAnimating}
                    >
                      Tip dealer (2,000)
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { setShowTableSettingsModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Table Appearance
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSoundsModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Sounds
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEditQuickChatModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  Edit QuickChat
                </button>
                {onToggleAutoRebuy && (
                  <button
                    type="button"
                    onClick={() => { onToggleAutoRebuy(); setMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    <span>Auto Rebuy</span>
                    <span
                      className="ml-2 inline-flex items-center justify-center rounded-full text-[9px] font-extrabold px-1.5 py-0.5"
                      style={{
                        background: autoRebuy ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.08)',
                        color: autoRebuy ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${autoRebuy ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.12)'}`,
                        minWidth: 28,
                      }}
                    >
                      {autoRebuy ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
                {normalizedAddress && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setStatsModalAddress(normalizedAddress); setShowStatsModal(true); setMobileMenuOpen(false); }}
                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      Player Stats
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowMyStats((v) => !v); if (showDashboard) setShowDashboard(false); setMobileMenuOpen(false); }}
                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                      style={{ color: showMyStats ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                    >
                      Table Stats
                    </button>
                  </>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setShowDashboard((v) => !v); if (showMyStats) setShowMyStats(false); setMobileMenuOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                    style={{ color: showDashboard ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                  >
                    Poker Dashboard
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={showExitToLobby ? onExitClick : onLeaveClick}
          className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97]"
          style={{
            background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          {showExitToLobby ? 'Exit' : 'Leave'}
        </button>
      </div>
    </div>
  );
}
