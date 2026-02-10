'use client';

import React, { useRef, useCallback } from 'react';
import type { CreatorTournamentItem } from '@/lib/tournament-types';
import { getDefaultTourCard } from '@/lib/tournament-types';

interface CreatorShareCardProps {
  tournaments: CreatorTournamentItem[];
}

export function CreatorShareCard({ tournaments }: CreatorShareCardProps) {
  const activeTournaments = tournaments.filter(t => t.status === 'active');

  const formatMorbius = (wei: string): string => {
    try {
      const whole = BigInt(wei || '0') / BigInt(1e18);
      return Number(whole).toLocaleString();
    } catch {
      return '0';
    }
  };

  const copyLink = useCallback((tournamentId: string) => {
    const url = `${window.location.origin}/BLACKJACK?tournament=${tournamentId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  if (activeTournaments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <i className="fas fa-share-alt text-4xl mb-3 block" />
        <p>No active tournaments to share</p>
        <p className="text-xs mt-1">Create a tournament to get shareable links</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {activeTournaments.map((t) => {
        const cardImage = t.customImage || getDefaultTourCard(t.id);

        return (
          <div
            key={t.id}
            className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden"
          >
            {/* Card preview */}
            <div className="relative aspect-[3/2] overflow-hidden">
              <img
                src={cardImage}
                alt={t.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <h3 className="text-white font-bold text-lg truncate">{t.name}</h3>
                <div className="flex items-center gap-3 text-sm mt-1">
                  <span className="text-cyan-300">
                    <i className="fas fa-coins mr-1" />
                    {formatMorbius(t.buyInAmount)} Buy-in
                  </span>
                  <span className="text-green-300">
                    <i className="fas fa-users mr-1" />
                    {t.entryCount} players
                  </span>
                </div>
                {BigInt(t.prizePool || '0') > 0n && (
                  <p className="text-yellow-300 text-sm mt-1">
                    <i className="fas fa-trophy mr-1" />
                    {formatMorbius(t.prizePool)} MORBIUS pool
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-3 flex gap-2">
              <button
                onClick={() => copyLink(t.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
              >
                <i className="fas fa-link" />
                Copy Link
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
