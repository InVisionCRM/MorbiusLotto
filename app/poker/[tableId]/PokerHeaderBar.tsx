'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BarChart3,
  Coins,
  HelpCircle,
  Image as ImageIcon,
  LogOut,
  Mic,
  MicOff,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { PokerTableState } from '@/lib/websocket-client';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';

/** Bare icon button for the header right cluster. No background, no border — just the icon.
 *  Hover brightens to white; active tools tint via per-button color override. */
const POKER_HEADER_ICON_BTN_CLASS =
  'h-9 w-9 flex items-center justify-center rounded-sm transition-colors hover:text-white active:scale-[0.97]';
const POKER_HEADER_ICON_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.6)',
  border: 'none',
};
const HEADER_ICON_SIZE = 17;

/**
 * Compact tournament readout for the header — current blind level, optional
 * live countdown to the next bump (`by_time` mode only), and current hand #.
 * Only renders when `tournamentState` is provided.
 *
 *  - `by_time`:   `LVL 3 · 04:32 · #142`  (countdown ticks every second)
 *  - `by_hand`:   `LVL 3 · #142`          (sidebar HUD shows hand-into-level)
 *  - `knockout`:  `LVL 3 · #142`
 */
function TournamentReadout({ state }: { state: PokerTournamentState }) {
  const mode = state.pokerConfig?.blindIncreaseMode ?? null;
  const intervalMin = state.pokerConfig?.blindIntervalMinutes ?? null;
  const startedAt = state.currentBlindLevelStartedAt ?? null;

  // Live wall-clock countdown for `by_time` mode. Tick once per second so the
  // header timer stays in sync with the tournament HUD without polling state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== 'by_time' || !startedAt || !intervalMin) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [mode, startedAt, intervalMin]);

  const countdownLabel = useMemo(() => {
    if (mode !== 'by_time' || !startedAt || !intervalMin) return null;
    const startMs = Date.parse(startedAt);
    if (Number.isNaN(startMs)) return null;
    const endMs = startMs + intervalMin * 60_000;
    const remaining = Math.max(0, endMs - now);
    const totalSec = Math.floor(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [mode, startedAt, intervalMin, now]);

  // Subtle amber tint when the timer is about to flip (< 60s remaining).
  const isLowTime = useMemo(() => {
    if (!countdownLabel) return false;
    const [mStr, sStr] = countdownLabel.split(':');
    const total = parseInt(mStr, 10) * 60 + parseInt(sStr, 10);
    return total > 0 && total <= 60;
  }, [countdownLabel]);

  const dot = (
    <span
      className="opacity-50"
      style={{ color: 'rgba(255,255,255,0.45)' }}
      aria-hidden
    >
      ·
    </span>
  );

  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      {dot}
      <span
        className="text-[11px] sm:text-[12px] font-bold uppercase tracking-wide"
        style={{ color: 'rgba(255,255,255,0.78)' }}
        title={`Blind level ${state.blindLevel}`}
      >
        LVL {state.blindLevel}
      </span>
      {countdownLabel && (
        <span
          className="text-[12px] sm:text-[13px] font-bold tabular-nums"
          style={{
            color: isLowTime ? 'rgba(251,191,36,0.95)' : 'rgba(255,255,255,0.92)',
            transition: 'color 0.3s ease',
          }}
          title="Time until next blind level"
        >
          {countdownLabel}
        </span>
      )}
      {dot}
      <span
        className="text-[11px] sm:text-[12px] font-bold tabular-nums"
        style={{ color: 'rgba(255,255,255,0.62)' }}
        title={`Hand number ${state.handNumber}`}
      >
        #{state.handNumber}
      </span>
    </span>
  );
}

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
  /** True when the local user busted out of this tournament and chose to stay & watch. */
  isBustedSpectator?: boolean;
  /** Whether the seated player has auto-rebuy enabled. Only shown when player is seated. */
  autoRebuy?: boolean;
  onToggleAutoRebuy?: () => void;
  /** Seated + connected: shows the Logo + Tip group on the right cluster. */
  showTableBrandingActions?: boolean;
  onOpenTableLogoSponsor?: () => void;
  tipAnimating?: boolean;
  setTipAnimating?: React.Dispatch<React.SetStateAction<boolean>>;
  onTipDealer?: () => Promise<void>;
  /** Voice commands toggle — its own group between Brand and Account in the right cluster. */
  voiceCommands?: {
    listening: boolean;
    supported: boolean;
    onToggle: () => void;
  };
  /** Center column of the header grid (e.g. tournament Stream voice strip). */
  voiceSlot?: React.ReactNode;
  /** When provided (tournament tables), renders a compact level + countdown + hand# readout next to the blinds. */
  tournamentState?: PokerTournamentState | null;
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
  isBustedSpectator = false,
  autoRebuy = false,
  onToggleAutoRebuy,
  showTableBrandingActions = false,
  onOpenTableLogoSponsor,
  tipAnimating = false,
  setTipAnimating,
  onTipDealer,
  voiceCommands,
  voiceSlot,
  tournamentState = null,
}: PokerHeaderBarProps) {
  const [botsMenuOpen, setBotsMenuOpen] = useState(false);
  const [botCountInput, setBotCountInput] = useState('4');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // "Your turn" pulse — peripheral cyan glow at the bottom edge of the header
  // when it's the connected player's seat to act. Rescues a player who looked
  // away from the table without being noisy.
  const mySeatPosition = useMemo(() => {
    if (!normalizedAddress || !renderedState) return null;
    const seat = renderedState.seats.find(
      (s) => (s.playerAddress || '').toLowerCase() === normalizedAddress,
    );
    return seat?.position ?? null;
  }, [normalizedAddress, renderedState]);
  const isMyTurn =
    mySeatPosition !== null &&
    renderedState?.currentHand?.actingPosition === mySeatPosition;

  // Group flags so we only render dividers between groups that actually exist.
  const hasBrandGroup = !!(
    showTableBrandingActions && onOpenTableLogoSponsor && onTipDealer && setTipAnimating
  );
  const hasPlayerGroup = !!voiceCommands;
  const hasStatsGroup = !!normalizedAddress;
  const hasBotsGroup =
    !!normalizedAddress &&
    (isAdmin ||
      !!renderedState?.seats?.some(
        (s) => (s.playerAddress || '').toLowerCase() === normalizedAddress,
      ));

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
      className="grid flex-shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 relative z-20 font-russo-one"
      style={{
        background:
          'linear-gradient(to bottom, rgba(6,8,12,0.6), rgba(6,8,12,0.32))',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
        paddingBottom: '8px',
      }}
    >
      {isMyTurn && (
        <div
          aria-hidden
          className="morb-poker-header-turn-pulse pointer-events-none absolute bottom-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(34,211,238,0.85), transparent)',
            boxShadow: '0 0 12px rgba(34,211,238,0.55)',
          }}
        />
      )}
      {renderedState ? (
        <div className="flex items-center gap-1.5 min-w-0 pl-1">
          <span className="text-[12px] sm:text-[13px] font-bold text-[rgba(255,255,255,0.9)] tabular-nums whitespace-nowrap">
            {fmtChips(renderedState.smallBlind)}/{fmtChips(renderedState.bigBlind)}
          </span>
          {tournamentState && <TournamentReadout state={tournamentState} />}
          {isBustedSpectator && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
              style={{
                color: 'rgba(244,63,94,0.95)',
                background: 'rgba(244,63,94,0.10)',
                border: '1px solid rgba(244,63,94,0.30)',
              }}
              title="You busted out of this tournament and are watching as a spectator"
            >
              <span
                aria-hidden
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'rgba(244,63,94,0.95)' }}
              />
              Spectating
            </span>
          )}
        </div>
      ) : (
        <div className="min-w-0" />
      )}
      <div className="min-w-0 flex justify-center items-center overflow-hidden px-0.5 self-center">
        {voiceSlot ?? null}
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0 relative">
        {hasBrandGroup && (
          <>
            <button
              data-poker-header-secondary
              type="button"
              onClick={() => {
                onOpenTableLogoSponsor!();
                setSettingsMenuOpen(false);
                setStatsMenuOpen(false);
              }}
              className={
                logoTimerLabel
                  ? 'h-9 px-1.5 inline-flex items-center gap-1 transition-colors hover:text-white active:scale-[0.97]'
                  : POKER_HEADER_ICON_BTN_CLASS
              }
              style={POKER_HEADER_ICON_BTN_STYLE}
              aria-label={logoTimerLabel ? `Table logo sponsor — ${logoTimerLabel} remaining` : 'Sponsor table logo'}
              title={logoTimerLabel ? `Table logo · ${logoTimerLabel} left` : 'Sponsor table logo'}
            >
              <ImageIcon size={HEADER_ICON_SIZE} aria-hidden />
              {logoTimerLabel && (
                <span className="text-[10px] font-bold tabular-nums">{logoTimerLabel}</span>
              )}
            </button>
            <div data-poker-header-secondary className="relative shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (tipAnimating) return;
                  setTipAnimating!(true);
                  try {
                    await onTipDealer!();
                  } finally {
                    setTimeout(() => setTipAnimating!(false), 900);
                  }
                }}
                disabled={tipAnimating}
                className={`${POKER_HEADER_ICON_BTN_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
                style={POKER_HEADER_ICON_BTN_STYLE}
                aria-label="Tip the dealer 2,000"
                title="Tip dealer · 2,000"
              >
                <Coins size={HEADER_ICON_SIZE} aria-hidden />
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
        {hasBrandGroup && hasPlayerGroup && (
          <div className="hidden sm:block w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden />
        )}
        {hasPlayerGroup && (
          <button
            data-poker-header-secondary
            type="button"
            onClick={() => {
              voiceCommands!.onToggle();
              setSettingsMenuOpen(false);
              setStatsMenuOpen(false);
            }}
            disabled={!voiceCommands!.supported}
            className={`${POKER_HEADER_ICON_BTN_CLASS} disabled:opacity-40 disabled:cursor-not-allowed`}
            style={{
              ...POKER_HEADER_ICON_BTN_STYLE,
              ...(voiceCommands!.listening ? { color: '#fca5a5' } : {}),
            }}
            aria-pressed={voiceCommands!.listening}
            aria-label={
              !voiceCommands!.supported
                ? 'Voice commands unavailable'
                : voiceCommands!.listening
                  ? 'Voice commands on — click to mute'
                  : 'Voice commands off — click to enable'
            }
            title={
              !voiceCommands!.supported
                ? 'Voice unavailable'
                : voiceCommands!.listening
                  ? 'Voice ON'
                  : 'Voice OFF'
            }
          >
            {voiceCommands!.listening ? (
              <Mic size={HEADER_ICON_SIZE} aria-hidden />
            ) : (
              <MicOff size={HEADER_ICON_SIZE} aria-hidden />
            )}
          </button>
        )}
        {(hasBrandGroup || hasPlayerGroup) && (
          <div className="hidden sm:block w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden />
        )}
        <div data-poker-header-secondary className="relative">
          <button
            type="button"
            onClick={() => {
              setSettingsMenuOpen((o) => !o);
              setStatsMenuOpen(false);
            }}
            className={POKER_HEADER_ICON_BTN_CLASS}
            style={POKER_HEADER_ICON_BTN_STYLE}
            aria-expanded={settingsMenuOpen}
            aria-haspopup="true"
            aria-label="Settings menu"
            title="Settings"
          >
            <SettingsIcon size={HEADER_ICON_SIZE} aria-hidden />
          </button>
          {settingsMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setSettingsMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-white/10 overflow-hidden"
                style={{ background: 'rgba(10,10,10,0.98)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowHowToPlay(true);
                    setSettingsMenuOpen(false);
                    setStatsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 inline-flex items-center gap-2"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  aria-haspopup="dialog"
                >
                  <HelpCircle size={12} aria-hidden />
                  <span>How to Play</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTableSettingsModal(true);
                    setSettingsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
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
        {hasStatsGroup && (
          <div data-poker-header-secondary className="relative">
            <button
              type="button"
              onClick={() => {
                setStatsMenuOpen((o) => !o);
                setSettingsMenuOpen(false);
              }}
              className={POKER_HEADER_ICON_BTN_CLASS}
              style={{
                ...POKER_HEADER_ICON_BTN_STYLE,
                ...(showMyStats || showDashboard ? { color: 'rgb(34,211,238)' } : {}),
              }}
              aria-expanded={statsMenuOpen}
              aria-haspopup="true"
              aria-label="Stats menu"
              title="Stats"
            >
              <BarChart3 size={HEADER_ICON_SIZE} aria-hidden />
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
        {hasBotsGroup && (
          <div data-poker-header-secondary className="relative">
            <button
              type="button"
              onClick={() => {
                setBotsMenuOpen((o) => !o);
                setSettingsMenuOpen(false);
                setStatsMenuOpen(false);
              }}
              className={POKER_HEADER_ICON_BTN_CLASS}
              style={POKER_HEADER_ICON_BTN_STYLE}
              aria-expanded={botsMenuOpen}
              aria-haspopup="true"
              aria-label="Bots menu"
              title="Bots"
            >
              <Bot size={HEADER_ICON_SIZE} aria-hidden />
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

        <div className="hidden sm:block w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden />
        <button
          type="button"
          data-poker-header-leave
          onClick={showExitToLobby ? onExitClick : onLeaveClick}
          className="h-9 w-9 flex items-center justify-center rounded-sm transition-colors active:scale-[0.97]"
          style={{
            background: 'transparent',
            color: 'rgba(248,113,113,0.85)',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgb(248,113,113)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(248,113,113,0.85)';
          }}
          aria-label={showExitToLobby ? 'Exit to lobby' : 'Leave table'}
          title={showExitToLobby ? 'Exit to lobby' : 'Leave table'}
        >
          <LogOut size={HEADER_ICON_SIZE} aria-hidden />
        </button>
      </div>
    </div>
  );
}
