'use client';

import React, { useState } from 'react';
import type { PokerTableState } from '@/lib/websocket-client';

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
  /** Whether the seated player has auto-rebuy enabled. Only shown when player is seated. */
  autoRebuy?: boolean;
  onToggleAutoRebuy?: () => void;
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
  autoRebuy = false,
  onToggleAutoRebuy,
}: PokerHeaderBarProps) {
  const [botsMenuOpen, setBotsMenuOpen] = useState(false);
  const [botCountInput, setBotCountInput] = useState('4');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const parseBotCount = () => {
    const n = Number(botCountInput);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(adminBotMax, Math.floor(n)));
  };

  return (
    <div
      data-poker-header
      className="grid flex-shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 z-30 font-russo-one"
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
      <div aria-hidden className="min-w-0" />
      <div className="flex items-center justify-end gap-1.5 shrink-0 relative">
        <button
          data-poker-header-secondary
          type="button"
          onClick={() => {
            setShowHowToPlay(true);
            setSettingsMenuOpen(false);
            setStatsMenuOpen(false);
          }}
          className="h-9 px-2.5 sm:px-3 rounded-sm text-[10px] sm:text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97] whitespace-nowrap"
          style={{
            background: 'rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
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
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
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
          onClick={onLeaveClick}
          className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97]"
          style={{
            background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          Leave
        </button>
      </div>
    </div>
  );
}
