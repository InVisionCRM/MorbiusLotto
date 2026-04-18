'use client';

import React from 'react';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

interface Props {
  state: PokerTournamentState;
  myAddress: string;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatChips(n: number): string {
  return n.toLocaleString();
}

function isZeroBuyInWei(wei: string): boolean {
  try {
    return BigInt(wei || '0') === 0n;
  } catch {
    return true;
  }
}

/** Plinko / poker lobby panel: embossed grey + cyan border */
const panelSurface: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.58))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.5)',
};

export function PokerTournamentHUD({ state, myAddress }: Props) {
  const me = state.players.find(
    (p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase(),
  );

  const activePlayers = state.players.filter((p) => p.status === 'playing');
  const sortedByChips = [...activePlayers].sort((a, b) => b.chipsRemaining - a.chipsRemaining);

  const myRank = me
    ? sortedByChips.findIndex((p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase()) + 1
    : null;

  let prizeLabel: string;
  try {
    prizeLabel = formatMorbiusFloor(state.prizePool, { compact: true });
  } catch {
    prizeLabel = '—';
  }

  return (
    <div
      className="absolute top-3 left-3 z-30 flex flex-col gap-2 min-w-[188px] max-w-[220px] select-none"
      style={{ pointerEvents: 'none' }}
    >
      {/* Title + prize */}
      <div
        className="rounded-xl border border-cyan-500/35 px-3 py-2 backdrop-blur-sm"
        style={panelSurface}
      >
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className="text-xs font-semibold text-slate-100 leading-tight truncate min-w-0 flex-1">
            {state.name}
          </h3>
          {isZeroBuyInWei(state.buyInAmount) && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border border-cyan-500/40 text-cyan-300/95 bg-cyan-500/10">
              Freeroll
            </span>
          )}
        </div>
        <div className="text-[10px] text-cyan-400/75 uppercase tracking-wider font-medium mt-1">
          Hand {state.handNumber}
        </div>
        <div className="text-[10px] text-slate-400 mt-1 flex justify-between gap-2">
          <span>Prize pool</span>
          <span className="text-cyan-200/90 font-semibold tabular-nums">{prizeLabel}</span>
        </div>
      </div>

      {/* Blinds */}
      <div
        className="rounded-xl border border-cyan-500/35 px-3 py-2 backdrop-blur-sm"
        style={panelSurface}
      >
        <div className="text-[10px] text-cyan-400/75 uppercase tracking-widest font-medium mb-0.5">
          Blinds · Level {state.blindLevel}
        </div>
        <div className="text-slate-100 font-bold text-sm tabular-nums">
          {formatChips(state.smallBlind)} / {formatChips(state.bigBlind)}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Blinds rise when players are eliminated
        </div>
      </div>

      {/* Your stack */}
      {me && (
        <div
          className="rounded-xl border border-cyan-500/30 px-3 py-2 backdrop-blur-sm"
          style={panelSurface}
        >
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-0.5">
            Your stack
          </div>
          <div className="text-slate-100 font-bold text-sm tabular-nums">{formatChips(me.chipsRemaining)}</div>
          {myRank !== null && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              Rank #{myRank} of {activePlayers.length}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard strip */}
      <div
        className="rounded-xl border border-cyan-500/30 px-3 py-2 backdrop-blur-sm"
        style={panelSurface}
      >
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">
          Players · {activePlayers.length} left
        </div>
        <div className="flex flex-col gap-0.5">
          {sortedByChips.slice(0, 4).map((p, i) => (
            <div
              key={p.playerAddress}
              className={`flex justify-between items-center text-[11px] gap-2 min-w-0 ${
                p.playerAddress.toLowerCase() === myAddress.toLowerCase()
                  ? 'text-cyan-300 font-semibold'
                  : 'text-slate-300/90'
              }`}
            >
              <span className="truncate min-w-0">
                #{i + 1} {shortAddr(p.playerAddress)}
              </span>
              <span className="tabular-nums shrink-0">{formatChips(p.chipsRemaining)}</span>
            </div>
          ))}
          {sortedByChips.length > 4 && (
            <div className="text-[10px] text-slate-500 mt-0.5">+{sortedByChips.length - 4} more</div>
          )}
        </div>
      </div>
    </div>
  );
}
