'use client';

import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { GlobalAnalyticsDashboard } from '@/components/BLACKJACK/GlobalAnalyticsDashboard';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

interface BlackjackAuxViewsProps {
  currentView: 'game' | 'stats' | 'analytics' | 'history';
  isDeployer: boolean;
  playerStatsLoading: boolean;
  playerStatsError: unknown;
  refetchPlayerStats: () => void;
  playerStats: any;
  address: string | undefined;
  wsConnected: boolean;
  wsClient: BlackjackWebSocketClient | null;
  offChainBalance: bigint;
  globalAnalyticsLoading: boolean;
  globalAnalyticsError: unknown;
  refetchGlobalAnalytics: () => void;
  globalAnalytics: any;
}

export function BlackjackAuxViews({
  currentView,
  isDeployer,
  playerStatsLoading,
  playerStatsError,
  refetchPlayerStats,
  playerStats,
  address,
  wsConnected,
  wsClient,
  offChainBalance,
  globalAnalyticsLoading,
  globalAnalyticsError,
  refetchGlobalAnalytics,
  globalAnalytics,
}: BlackjackAuxViewsProps) {
  return (
    <>
      {currentView === 'stats' && (
        <div className="max-w-[1800px] mx-auto">
          {playerStatsLoading ? (
            <div className="text-center py-12 text-cyan-300">Loading player statistics...</div>
          ) : playerStatsError ? (
            <div className="text-center py-12">
              <div className="text-red-400 mb-2">Error loading statistics</div>
              <div className="text-gray-400 text-sm">{playerStatsError instanceof Error ? playerStatsError.message : 'Unknown error'}</div>
              <button
                onClick={refetchPlayerStats}
                className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
              >
                Retry
              </button>
            </div>
          ) : playerStats ? (
            <PlayerStatsDashboard
              stats={playerStats}
              isLoading={playerStatsLoading}
              playerAddress={address ?? null}
              wsClient={wsConnected ? wsClient : null}
              reserveBalance={offChainBalance}
            />
          ) : (
            <div className="text-center py-12 text-cyan-300">No statistics available. Play some games to see your stats!</div>
          )}
        </div>
      )}

      {currentView === 'analytics' && isDeployer && (
        <div className="max-w-[1800px] mx-auto">
          {globalAnalyticsLoading ? (
            <div className="text-center py-12 text-cyan-300">Loading global analytics...</div>
          ) : globalAnalyticsError ? (
            <div className="text-center py-12">
              <div className="text-red-400 mb-2">Error loading analytics</div>
              <div className="text-gray-400 text-sm">{globalAnalyticsError instanceof Error ? globalAnalyticsError.message : 'Unknown error'}</div>
              <button
                onClick={refetchGlobalAnalytics}
                className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
              >
                Retry
              </button>
            </div>
          ) : globalAnalytics ? (
            <GlobalAnalyticsDashboard
              analytics={globalAnalytics}
              isLoading={globalAnalyticsLoading}
              onRefresh={() => {
                refetchPlayerStats();
                refetchGlobalAnalytics();
              }}
            />
          ) : (
            <div className="text-center py-12 text-cyan-300">No analytics available yet.</div>
          )}
        </div>
      )}
    </>
  );
}
