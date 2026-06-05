'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { formatChips } from '@/lib/format-poker-chips';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';
import { POKER_BOTTOM_RESERVE_VAR } from './PokerBottomBar';

/** Matches the private selector PokerBottomBar uses to size the table's bottom reserve. */
const SHELL_SELECTOR = '[data-poker-shell]';

export interface PokerSpectatorDockProps {
  /** Live tournament state for this table (available to spectators via the HUD hook). */
  state: PokerTournamentState;
  /** Pre-formatted "25/50" blinds (falls back to state blinds). */
  blinds: string | null;
  /** "MM:SS" until the next blind level, or null for non-timed structures. */
  levelCountdown: string | null;
  /** Active player count, or null. */
  playersLeft: number | null;
  /** Pre-formatted prize-pool label (chips or token), already unit-suffixed. */
  prizePoolLabel: string;
  /** Viewer wallet — highlights their row if they're a busted entrant still watching. */
  myAddress?: string | null;
}

/**
 * Portrait spectator dock — a seated player gets the full PokerBottomBar; a spectator
 * (busted entrant or a "Watch" viewer, i.e. no seat) gets this read-only dock so they can
 * keep up with the tournament: level / blinds / players / prize, the next-level countdown,
 * and a live chip-stack leaderboard. No betting, chat, or player controls.
 */
export function PokerSpectatorDock({
  state,
  blinds,
  levelCountdown,
  playersLeft,
  prizePoolLabel,
  myAddress,
}: PokerSpectatorDockProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const me = myAddress?.toLowerCase() ?? null;

  // Keep the table's bottom reserve in sync with this dock's height (same contract as PokerBottomBar).
  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;
    const apply = (px: number) => shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    const el = rootRef.current;
    if (!el) {
      apply(0);
      return () => shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    }
    const measure = () => apply(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    };
  }, []);

  const { standings, eliminated } = useMemo(() => {
    const all = state.players ?? [];
    const playing = all
      .filter((p) => p.status === 'playing')
      .sort((a, b) => b.chipsRemaining - a.chipsRemaining);
    const out = all.filter((p) => p.status === 'busted' || p.status === 'completed').length;
    return { standings: playing, eliminated: out };
  }, [state.players]);

  const blindsLabel = blinds ?? `${formatChips(state.smallBlind)}/${formatChips(state.bigBlind)}`;

  return (
    <div
      ref={rootRef}
      data-poker-bottom
      className="poker-dock-glass relative z-40 w-full shrink-0 pointer-events-auto"
    >
      <div className="w-full px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]">
        {/* Header */}
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: 'rgba(244,63,94,0.95)',
              background: 'rgba(244,63,94,0.10)',
              borderColor: 'rgba(244,63,94,0.30)',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(244,63,94,0.95)' }} />
            Spectating
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/80">{state.name}</span>
        </div>

        {/* Key stats */}
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          <SpecTile label="Level" value={`L${state.blindLevel}`} />
          <SpecTile label="Blinds" value={blindsLabel} />
          <SpecTile label="Players" value={playersLeft != null ? String(playersLeft) : String(standings.length)} />
          <SpecTile label="Prize" value={prizePoolLabel || '—'} accent="#fde68a" />
        </div>

        {levelCountdown && (
          <div className="mb-2 text-center text-[11px] text-white/55">
            Next level in <span className="font-semibold tabular-nums text-white/85">{levelCountdown}</span>
          </div>
        )}

        {/* Live leaderboard */}
        <div className="mb-1 flex items-center justify-between px-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Standings</span>
          {eliminated > 0 && <span className="text-[9px] text-white/35">{eliminated} eliminated</span>}
        </div>
        <ul className="max-h-[26vh] space-y-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {standings.length === 0 ? (
            <li className="py-2 text-center text-[11px] text-white/40">Waiting for the next hand…</li>
          ) : (
            standings.map((p, i) => {
              const isMe = me && p.playerAddress.toLowerCase() === me;
              const name = p.displayName?.trim() || `${p.playerAddress.slice(0, 6)}…`;
              return (
                <li
                  key={p.playerAddress}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                    isMe ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/[0.08] bg-white/[0.04]'
                  }`}
                >
                  <span className="w-5 text-center text-[11px] font-bold tabular-nums text-white/50">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{name}</span>
                  <span className="text-[12px] font-bold tabular-nums text-emerald-300">{formatChips(p.chipsRemaining)}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function SpecTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] px-1.5 py-1">
      <span className="text-[8px] font-bold uppercase tracking-wider text-white/45">{label}</span>
      <span
        className="max-w-full truncate text-[13px] font-bold tabular-nums leading-tight"
        style={{ color: accent ?? '#e6ebf2' }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
