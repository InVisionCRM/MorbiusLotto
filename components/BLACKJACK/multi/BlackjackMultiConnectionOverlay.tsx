'use client';

import React from 'react';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';

export type BlackjackMultiWsStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export function BlackjackMultiConnectionOverlay({
  wsConnected,
  address,
  wsStatus,
  reconnectInfo,
  error,
  onReload,
}: {
  wsConnected: boolean;
  address?: string;
  wsStatus: BlackjackMultiWsStatus;
  reconnectInfo: { attempt: number; maxAttempts: number } | null;
  error: string | null;
  onReload: () => void;
}) {
  return (
    <>
      {!wsConnected && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <MorbiusLoadingChip />
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-6 py-4 text-center max-w-xs">
            {!address ? (
              <p className="text-amber-400 text-sm">Connect your wallet to play</p>
            ) : wsStatus === 'failed' ? (
              <>
                <p className="text-red-400 text-sm font-medium mb-2">Connection lost</p>
                <p className="text-slate-400 text-xs mb-3">Could not reconnect to the server.</p>
                <button
                  onClick={onReload}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded transition-colors"
                >
                  Reload Page
                </button>
              </>
            ) : wsStatus === 'reconnecting' ? (
              <>
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-amber-400 text-sm font-medium">Reconnecting...</p>
                {reconnectInfo && (
                  <p className="text-slate-400 text-xs mt-1">
                    Attempt {reconnectInfo.attempt} of {reconnectInfo.maxAttempts}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-cyan-400 text-sm">Connecting...</p>
              </>
            )}
          </div>
        </div>
      )}
      {error && wsConnected && <div className="bg-red-900/80 text-red-200 text-xs text-center py-1 px-4">{error}</div>}
    </>
  );
}
