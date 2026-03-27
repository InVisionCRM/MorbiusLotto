'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { CreatorTournamentItem, CreatorEarning, CreateTournamentRequest, CreateFreerollRequest } from '@/lib/tournament-types';
import { CreatorStats } from './CreatorStats';
import { CreatorTournamentList } from './CreatorTournamentList';
import { CreatorEarnings } from './CreatorEarnings';
import { CreatorShareCard } from './CreatorShareCard';
import { TournamentCreator } from '@/components/BLACKJACK/Tournament/TournamentCreator';
import { useTournament } from '@/hooks/use-tournament';
import { toast } from 'sonner';
import { Theme } from '@/lib/theme';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';

type DashboardTab = 'tournaments' | 'earnings' | 'share';

interface CreatorDashboardProps {
  wsClient: BlackjackWebSocketClient;
  address: string;
}

export function CreatorDashboard({ wsClient, address }: CreatorDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('tournaments');
  const [tournaments, setTournaments] = useState<CreatorTournamentItem[]>([]);
  const [earnings, setEarnings] = useState<CreatorEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTournamentCreator, setShowTournamentCreator] = useState(false);
  const [playerBalance, setPlayerBalance] = useState<bigint>(0n);

  const tournament = useTournament({ wsClient });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tournamentsRes, earningsRes] = await Promise.all([
        wsClient.sendRequest('creator_tournaments', {}),
        wsClient.sendRequest('creator_earnings', {}),
      ]);
      setTournaments(tournamentsRes.tournaments || []);
      setEarnings(earningsRes.earnings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchBalance = useCallback(async () => {
    try {
      const { balance } = await wsClient.getBalance();
      setPlayerBalance(BigInt(balance));
    } catch {
      setPlayerBalance(0n);
    }
  }, [wsClient]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const tabs: { id: DashboardTab; label: string; icon: string }[] = [
    { id: 'tournaments', label: 'Tournaments', icon: 'fa-trophy' },
    { id: 'earnings', label: 'Earnings', icon: 'fa-coins' },
    { id: 'share', label: 'Share', icon: 'fa-share-alt' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Creator Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage your tournaments and track earnings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTournamentCreator(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white font-medium text-sm transition-colors`}
          >
            <i className="fas fa-plus" />
            Create Tournament
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm disabled:opacity-50"
            style={Theme.panel.base}
          >
            <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg border border-red-500/30 text-red-400 text-sm" style={Theme.panel.base}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && tournaments.length === 0 ? (
        <>
          <MorbiusLoadingChip />
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <svg className={`animate-spin h-8 w-8 ${Theme.cyan.text.primary} mx-auto mb-3`} viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-gray-400">Loading creator data...</p>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Stat cards */}
          <CreatorStats tournaments={tournaments} earnings={earnings} />

          {/* Tabs */}
          <div className="flex border-b border-gray-600">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? `${Theme.cyan.text.primary} border-b-2 border-cyan-400`
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <i className={`fas ${tab.icon} text-xs`} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'tournaments' && (
            <CreatorTournamentList tournaments={tournaments} wsClient={wsClient} onRefresh={fetchData} creatorAddress={address} />
          )}
          {activeTab === 'earnings' && (
            <CreatorEarnings earnings={earnings} />
          )}
          {activeTab === 'share' && (
            <CreatorShareCard tournaments={tournaments} />
          )}
        </>
      )}

      {/* Tournament Creator Modal */}
      <TournamentCreator
        isOpen={showTournamentCreator}
        onClose={() => setShowTournamentCreator(false)}
        onCreate={async (params: CreateTournamentRequest) => {
          const result = await tournament.createTournament(params);
          if (result) {
            toast.success('Tournament created!');
            fetchData();
            fetchBalance();
            return result;
          }
          return null;
        }}
        onCreateFreeroll={async (params: CreateFreerollRequest) => {
          const result = await tournament.createFreeroll(params);
          if (result) {
            toast.success('Freeroll created!');
            fetchData();
            return result;
          }
          return null;
        }}
        isLoading={tournament.isLoading}
        playerBalance={playerBalance}
      />
    </div>
  );
}
