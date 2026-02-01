'use client';

import React from 'react';
import { LeaderboardEntry } from '@/hooks/use-tournament';

interface TournamentLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  playerAddress?: string;
  playerEntry?: LeaderboardEntry;
  isLoading?: boolean;
  onRefresh?: () => void;
  maxDisplay?: number;
}

export function TournamentLeaderboard({
  leaderboard,
  playerAddress,
  playerEntry,
  isLoading = false,
  onRefresh,
  maxDisplay = 10,
}: TournamentLeaderboardProps) {
  const displayedEntries = leaderboard.slice(0, maxDisplay);

  // Check if player is in displayed list
  const playerInList = playerAddress && displayedEntries.some(
    e => e.player_address.toLowerCase() === playerAddress.toLowerCase()
  );

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-400 text-black';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-500 text-black';
      default:
        return 'bg-gray-700 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'playing':
        return 'text-green-400';
      case 'busted':
        return 'text-red-400';
      case 'completed':
        return 'text-cyan-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="bg-gradient-to-b from-gray-900/95 to-gray-950/95 rounded-xl border border-purple-500/30 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border-b border-gray-700">
        <h3 className="text-lg font-bold text-white">Leaderboard</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Leaderboard List */}
      <div className="divide-y divide-gray-800">
        {displayedEntries.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No entries yet. Be the first to join!
          </div>
        ) : (
          displayedEntries.map((entry) => {
            const isPlayer = playerAddress &&
              entry.player_address.toLowerCase() === playerAddress.toLowerCase();

            return (
              <div
                key={entry.entry_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  isPlayer ? 'bg-purple-900/30' : ''
                }`}
              >
                {/* Rank Badge */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(entry.current_rank)}`}
                >
                  {entry.current_rank}
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${isPlayer ? 'text-purple-300' : 'text-white'}`}>
                    {formatAddress(entry.player_address)}
                    {isPlayer && <span className="ml-2 text-xs text-purple-400">(You)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {entry.hands_played} hands played
                  </p>
                </div>

                {/* Chips */}
                <div className="text-right">
                  <p className={`font-bold ${
                    entry.status === 'busted' ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {entry.chips_remaining.toLocaleString()}
                  </p>
                  <p className={`text-xs capitalize ${getStatusColor(entry.status)}`}>
                    {entry.status}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Player's Entry (if not in top N) */}
      {!playerInList && playerEntry && (
        <>
          <div className="px-4 py-2 bg-gray-800/50 text-center text-gray-500 text-xs">
            ...
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-purple-900/30 border-t border-purple-500/30">
            {/* Rank Badge */}
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-sm text-white">
              {playerEntry.current_rank}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-purple-300 truncate">
                {formatAddress(playerEntry.player_address)}
                <span className="ml-2 text-xs text-purple-400">(You)</span>
              </p>
              <p className="text-xs text-gray-500">
                {playerEntry.hands_played} hands played
              </p>
            </div>

            {/* Chips */}
            <div className="text-right">
              <p className={`font-bold ${
                playerEntry.status === 'busted' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {playerEntry.chips_remaining.toLocaleString()}
              </p>
              <p className={`text-xs capitalize ${getStatusColor(playerEntry.status)}`}>
                {playerEntry.status}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TournamentLeaderboard;
