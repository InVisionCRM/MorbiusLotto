'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { formatEther } from 'viem';
import {
  TournamentListItem,
  formatTimeRemaining,
  getDefaultTourCard,
} from '@/lib/tournament-types';

interface LeaderboardEntry {
  entry_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  status: string;
  current_rank: number;
}

interface TournamentBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  onCreateNew: () => void;
  onRefresh: () => Promise<TournamentListItem[]>;
  onFetchLeaderboard?: (tournamentId: string) => Promise<LeaderboardEntry[]>;
  tournaments: TournamentListItem[];
  isLoading: boolean;
  playerBalance: bigint;
}

// Individual tournament card component
function TournamentCard({
  tournament,
  playerBalance,
  onJoin,
  onFetchLeaderboard,
}: {
  tournament: TournamentListItem;
  playerBalance: bigint;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  onFetchLeaderboard?: (tournamentId: string) => Promise<LeaderboardEntry[]>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const buyInBigInt = BigInt(tournament.buyInAmount);
  const canAfford = playerBalance >= buyInBigInt;
  const timeRemaining = formatTimeRemaining(tournament.endsAt);
  const isFull = tournament.maxPlayers !== null && tournament.entryCount >= tournament.maxPlayers;

  // Get the tournament image (custom or default)
  const tournamentImage = tournament.customImage || getDefaultTourCard(tournament.id);

  // Fetch leaderboard when expanded
  const handleExpand = useCallback(async () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    if (newExpanded && onFetchLeaderboard && leaderboard.length === 0) {
      setLoadingLeaderboard(true);
      try {
        const data = await onFetchLeaderboard(tournament.id);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoadingLeaderboard(false);
      }
    }
  }, [isExpanded, onFetchLeaderboard, tournament.id, leaderboard.length]);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all overflow-hidden">
      {/* Card Header - Clickable Image */}
      <button
        onClick={handleExpand}
        className="w-full relative cursor-pointer group"
      >
        {/* Tournament Image (3:2 aspect ratio) */}
        <div className="aspect-[3/2] overflow-hidden">
          <img
            src={tournamentImage}
            alt={tournament.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          {/* Overlay with tournament name */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-bold text-xl truncate">{tournament.name}</h3>
              {tournament.creatorAddress && (
                <p className="text-gray-400 text-sm">
                  by {tournament.creatorAddress.slice(0, 6)}...{tournament.creatorAddress.slice(-4)}
                </p>
              )}
            </div>
          </div>
          {/* Badges */}
          <div className="absolute top-3 right-3 flex gap-2">
            {tournament.isPrivate && (
              <span className="px-2 py-1 rounded-full bg-purple-500/90 text-white text-xs font-medium shadow-lg">
                Private
              </span>
            )}
            {tournament.rebuyConfig.enabled && (
              <span className="px-2 py-1 rounded-full bg-green-500/90 text-white text-xs font-medium shadow-lg">
                Rebuys
              </span>
            )}
            {timeRemaining && (
              <span className="px-2 py-1 rounded-full bg-orange-500/90 text-white text-xs font-medium shadow-lg">
                {timeRemaining}
              </span>
            )}
          </div>
          {/* Quick Stats Overlay */}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="px-2 py-1 rounded-full bg-black/60 text-yellow-400 text-xs font-bold">
              {Number(formatEther(buyInBigInt)).toLocaleString()} MORBIUS
            </span>
            <span className="px-2 py-1 rounded-full bg-black/60 text-cyan-400 text-xs font-bold">
              {tournament.entryCount} {tournament.maxPlayers ? `/ ${tournament.maxPlayers}` : ''} players
            </span>
          </div>
          {/* Expand indicator */}
          <div className="absolute bottom-3 right-3">
            <svg
              className={`w-6 h-6 text-white transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expandable Details */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 border-t border-gray-700">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-gray-500 text-xs">Buy-in</p>
              <p className="text-yellow-400 font-semibold">
                {Number(formatEther(buyInBigInt)).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Prize Pool</p>
              <p className="text-green-400 font-semibold">
                {tournament.prizeTokenAddress
                  ? `${Number(BigInt(tournament.prizePool) / BigInt(10 ** (tournament.prizeTokenDecimals ?? 18))).toLocaleString()} (custom token)`
                  : `${Number(formatEther(BigInt(tournament.prizePool))).toLocaleString()} MORBIUS`}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Starting Chips</p>
              <p className="text-white font-semibold">
                {tournament.startingChips.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Max Hands</p>
              <p className="text-white font-semibold">
                {tournament.maxHands}
              </p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="flex gap-3 text-xs text-gray-400 mb-4">
            <span>{tournament.prizeDistributionType.replace(/_/g, ' ')}</span>
            {tournament.rebuyConfig.enabled && (
              <span>
                {tournament.rebuyConfig.maxRebuys === 0
                  ? 'Unlimited rebuys'
                  : `Max ${tournament.rebuyConfig.maxRebuys} rebuys`}
              </span>
            )}
          </div>

          {/* Top Players Leaderboard */}
          <div className="mb-4">
            <h4 className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
              </svg>
              Top Players
            </h4>
            {loadingLeaderboard ? (
              <div className="flex items-center justify-center py-4">
                <svg className="animate-spin h-5 w-5 text-cyan-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="text-gray-500 text-sm py-2 text-center">No players yet</p>
            ) : (
              <div className="space-y-1">
                {leaderboard.slice(0, 5).map((entry, index) => (
                  <div
                    key={entry.entry_id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                      index === 0
                        ? 'bg-yellow-500/10 border border-yellow-500/30'
                        : index === 1
                        ? 'bg-gray-400/10 border border-gray-400/30'
                        : index === 2
                        ? 'bg-orange-500/10 border border-orange-500/30'
                        : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? 'bg-yellow-500 text-black'
                            : index === 1
                            ? 'bg-gray-400 text-black'
                            : index === 2
                            ? 'bg-orange-500 text-black'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="text-gray-300 text-sm font-mono">
                        {entry.player_address.slice(0, 6)}...{entry.player_address.slice(-4)}
                      </span>
                    </div>
                    <span className="text-cyan-400 font-semibold text-sm">
                      {entry.chips_remaining.toLocaleString()} chips
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Join Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJoin(tournament.id, tournament.isPrivate);
            }}
            disabled={!canAfford || isFull}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              canAfford && !isFull
                ? 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-lg shadow-cyan-500/20'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isFull ? 'Tournament Full' : !canAfford ? 'Insufficient Balance' : 'Join Tournament'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TournamentBrowser({
  isOpen,
  onClose,
  onJoin,
  onCreateNew,
  onRefresh,
  onFetchLeaderboard,
  tournaments,
  isLoading,
  playerBalance,
}: TournamentBrowserProps) {
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh on open
  useEffect(() => {
    if (isOpen) {
      handleRefresh();
    }
  }, [isOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-purple-600 p-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Tournament Lobby</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
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
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tournament Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && tournaments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-400">Loading tournaments...</p>
              </div>
            </div>
          ) : tournaments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-6xl mb-4">🏆</div>
                <p className="text-gray-400 mb-2">No active tournaments</p>
                <p className="text-gray-500 text-sm">Be the first to create one!</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  playerBalance={playerBalance}
                  onJoin={onJoin}
                  onFetchLeaderboard={onFetchLeaderboard}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-400">Your Balance: </span>
              <span className="text-green-400 font-semibold">
                {Number(formatEther(playerBalance)).toLocaleString()} MORBIUS
              </span>
            </div>
            <button
              onClick={onCreateNew}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold transition-all shadow-lg shadow-purple-500/30"
            >
              + Create Tournament
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentBrowser;
