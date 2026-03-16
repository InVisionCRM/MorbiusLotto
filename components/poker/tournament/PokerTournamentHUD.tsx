'use client';

import React from 'react';
import type { PokerTournamentState, BlindLevel } from '@/hooks/use-poker-tournament';

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

/** Compute hands until next blind level from the current hand number. */
function handsUntilNextLevel(
  handNumber: number,
  blindSchedule: BlindLevel[],
  currentLevel: number,
): number | null {
  let accumulated = 0;
  for (const lvl of blindSchedule) {
    accumulated += lvl.handsPerLevel;
    if (lvl.level === currentLevel) {
      const remaining = accumulated - handNumber;
      if (lvl.handsPerLevel >= 999) return null; // last level
      return Math.max(0, remaining);
    }
  }
  return null;
}

export function PokerTournamentHUD({ state, myAddress }: Props) {
  const me = state.players.find(
    (p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase(),
  );

  const activePlayers = state.players.filter((p) => p.status === 'playing');
  const sortedByChips = [...activePlayers].sort((a, b) => b.chipsRemaining - a.chipsRemaining);

  // Build blind schedule from the state if available — fall back to showing current level only
  const config = (state as any).pokerConfig as { blindSchedule?: BlindLevel[] } | undefined;
  const schedule = config?.blindSchedule ?? [];
  const handsLeft = schedule.length > 0
    ? handsUntilNextLevel(state.handNumber, schedule, state.blindLevel)
    : null;

  const myRank = me ? sortedByChips.findIndex(
    (p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase()
  ) + 1 : null;

  return (
    <div
      className="absolute top-3 left-3 z-30 flex flex-col gap-1.5 min-w-[180px] select-none"
      style={{ pointerEvents: 'none' }}
    >
      {/* Blind level chip */}
      <div className="rounded-lg bg-black/75 border border-yellow-500/40 px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] text-yellow-400/70 uppercase tracking-widest font-medium mb-0.5">
          Blinds · Level {state.blindLevel}
        </div>
        <div className="text-white font-bold text-sm tabular-nums">
          {formatChips(state.smallBlind)} / {formatChips(state.bigBlind)}
        </div>
        {handsLeft !== null && (
          <div className="text-[10px] text-white/50 mt-0.5">
            {handsLeft === 0 ? 'Level up next hand' : `${handsLeft} hand${handsLeft === 1 ? '' : 's'} until next level`}
          </div>
        )}
      </div>

      {/* My stats */}
      {me && (
        <div className="rounded-lg bg-black/75 border border-white/10 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] text-white/50 uppercase tracking-widest font-medium mb-0.5">
            Your Stack
          </div>
          <div className="text-white font-bold text-sm tabular-nums">
            {formatChips(me.chipsRemaining)}
          </div>
          {myRank !== null && (
            <div className="text-[10px] text-white/50 mt-0.5">
              Rank #{myRank} of {activePlayers.length}
            </div>
          )}
        </div>
      )}

      {/* Players remaining */}
      <div className="rounded-lg bg-black/75 border border-white/10 px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] text-white/50 uppercase tracking-widest font-medium mb-1">
          Players · {activePlayers.length} remaining
        </div>
        <div className="flex flex-col gap-0.5">
          {sortedByChips.slice(0, 4).map((p, i) => (
            <div
              key={p.playerAddress}
              className={`flex justify-between items-center text-[11px] ${
                p.playerAddress.toLowerCase() === myAddress.toLowerCase()
                  ? 'text-yellow-300 font-semibold'
                  : 'text-white/70'
              }`}
            >
              <span>#{i + 1} {shortAddr(p.playerAddress)}</span>
              <span className="tabular-nums ml-2">{formatChips(p.chipsRemaining)}</span>
            </div>
          ))}
          {sortedByChips.length > 4 && (
            <div className="text-[10px] text-white/30 mt-0.5">
              +{sortedByChips.length - 4} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
