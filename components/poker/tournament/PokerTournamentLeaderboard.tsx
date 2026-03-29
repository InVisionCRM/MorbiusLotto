'use client';

import React from 'react';
import type { PokerTournamentPlayer } from '@/hooks/use-poker-tournament';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

interface Props {
  players: PokerTournamentPlayer[];
  myAddress: string;
  tournamentStatus: string;
  prizePool?: string;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatChips(n: number): string {
  return n.toLocaleString();
}

function formatPrize(wei: string): string {
  try {
    return `${formatMorbiusFloor(wei, { compact: false })} MORBIUS`;
  } catch {
    return '—';
  }
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  playing:   { label: 'Playing',  className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  busted:    { label: 'Busted',   className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  completed: { label: 'Winner',   className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
};

export function PokerTournamentLeaderboard({ players, myAddress, tournamentStatus, prizePool }: Props) {
  // Sort: active first (by chips desc), then busted/completed by final_rank asc
  const sorted = [...players].sort((a, b) => {
    if (a.status === 'playing' && b.status !== 'playing') return -1;
    if (a.status !== 'playing' && b.status === 'playing') return 1;
    if (a.status === 'playing' && b.status === 'playing') return b.chipsRemaining - a.chipsRemaining;
    return (a.finalRank ?? 99) - (b.finalRank ?? 99);
  });

  const isCompleted = tournamentStatus === 'completed';

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
          Tournament Standings
        </h3>
        {prizePool && (
          <span className="text-xs text-yellow-400/80">
            Prize pool: {formatPrize(prizePool)}
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1">
        {sorted.map((player, index) => {
          const isMe = player.playerAddress.toLowerCase() === myAddress.toLowerCase();
          const badge = STATUS_BADGE[player.status] ?? { label: player.status, className: 'bg-white/10 text-white/50' };
          const rank  = player.status === 'playing' ? index + 1 : (player.finalRank ?? '—');

          return (
            <div
              key={player.playerAddress}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors ${
                isMe
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : player.status === 'playing'
                    ? 'bg-white/5 border-white/10'
                    : 'bg-black/20 border-white/5 opacity-60'
              }`}
            >
              {/* Rank */}
              <span className={`text-sm font-bold w-5 text-center ${
                rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-white/40'
              }`}>
                {rank}
              </span>

              {/* Address */}
              <span className={`flex-1 text-sm font-mono ${isMe ? 'text-yellow-300 font-semibold' : 'text-white/70'}`}>
                {shortAddr(player.playerAddress)}
                {isMe && <span className="ml-1 text-[10px] text-yellow-400/60">(you)</span>}
              </span>

              {/* Chips or prize */}
              {isCompleted && player.prizeWon && player.prizeWon !== '0' ? (
                <span className="text-xs text-yellow-300 font-medium">
                  {formatPrize(player.prizeWon)}
                </span>
              ) : (
                <span className={`text-sm tabular-nums ${player.status === 'playing' ? 'text-white' : 'text-white/40'}`}>
                  {player.status === 'playing' ? formatChips(player.chipsRemaining) : '0'}
                </span>
              )}

              {/* Status badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-center text-white/30 text-sm py-4">No players yet</p>
        )}
      </div>
    </div>
  );
}
