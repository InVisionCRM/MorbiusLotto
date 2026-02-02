'use client';

import React, { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { TournamentListItem, formatTimeRemaining } from '@/lib/tournament-types';

interface TournamentBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  onCreateNew: () => void;
  onRefresh: () => Promise<TournamentListItem[]>;
  tournaments: TournamentListItem[];
  isLoading: boolean;
  playerBalance: bigint;
}

export function TournamentBrowser({
  isOpen,
  onClose,
  onJoin,
  onCreateNew,
  onRefresh,
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
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 max-w-3xl w-full mx-4 overflow-hidden max-h-[85vh] flex flex-col">
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

        {/* Tournament List */}
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
            <div className="space-y-3">
              {tournaments.map((tournament) => {
                const buyInBigInt = BigInt(tournament.buyInAmount);
                const canAfford = playerBalance >= buyInBigInt;
                const timeRemaining = formatTimeRemaining(tournament.endsAt);
                const isFull = tournament.maxPlayers !== null && tournament.entryCount >= tournament.maxPlayers;

                return (
                  <div
                    key={tournament.id}
                    className="bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden"
                  >
                    <div className="p-4">
                      {/* Top Row: Name + Badges */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-white font-semibold text-lg">{tournament.name}</h3>
                          {tournament.creatorAddress && (
                            <p className="text-gray-500 text-xs">
                              by {tournament.creatorAddress.slice(0, 6)}...{tournament.creatorAddress.slice(-4)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {tournament.isPrivate && (
                            <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                              Private
                            </span>
                          )}
                          {tournament.rebuyConfig.enabled && (
                            <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                              Rebuys
                            </span>
                          )}
                          {timeRemaining && (
                            <span className="px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
                              {timeRemaining}
                            </span>
                          )}
                        </div>
                      </div>

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
                            {Number(formatEther(BigInt(tournament.prizePool))).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Players</p>
                          <p className="text-cyan-400 font-semibold">
                            {tournament.entryCount}
                            {tournament.maxPlayers && `/${tournament.maxPlayers}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Hands</p>
                          <p className="text-white font-semibold">
                            {tournament.maxHands} max
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Settings + Join */}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-3 text-xs text-gray-400">
                          <span>{tournament.startingChips.toLocaleString()} chips</span>
                          <span>{tournament.prizeDistributionType.replace(/_/g, ' ')}</span>
                        </div>
                        <button
                          onClick={() => onJoin(tournament.id, tournament.isPrivate)}
                          disabled={!canAfford || isFull}
                          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                            canAfford && !isFull
                              ? 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isFull ? 'Full' : !canAfford ? 'Insufficient Balance' : 'Join'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
