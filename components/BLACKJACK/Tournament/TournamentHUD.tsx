'use client';

import React from 'react';
import { TournamentState } from '@/hooks/use-tournament';
import { Theme } from '@/lib/theme';

interface TournamentHUDProps {
  state: TournamentState;
  onLeave?: () => void;
  onRebuy?: () => void;
  isRebuyLoading?: boolean;
  isCompact?: boolean;
}

export function TournamentHUD({ state, onLeave, onRebuy, isRebuyLoading = false, isCompact = false }: TournamentHUDProps) {
  const progress = ((state.handsPlayed / state.maxHands) * 100).toFixed(0);
  const chipChangeFromStart = state.chips - state.startingChips;
  const chipChangePercent = ((chipChangeFromStart / state.startingChips) * 100).toFixed(1);

  // Determine if rebuy button should be shown
  const showRebuyButton = state.rebuyEnabled && state.canRebuy && (state.status === 'busted' || state.chips === 0);

  if (isCompact) {
    return (
      <div className="flex items-center gap-4 bg-gradient-to-r from-purple-900/80 to-cyan-900/80 rounded-lg px-4 py-2 border border-purple-500/30">
        {/* Chips */}
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-lg">
            {state.chips.toLocaleString()}
          </span>
          <span className="text-gray-400 text-xs">chips</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Hands */}
        <div className="flex items-center gap-2">
          <span className="text-cyan-400">{state.handsRemaining}</span>
          <span className="text-gray-400 text-xs">left</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Rank */}
        <div className="flex items-center gap-2">
          <span className="text-purple-400">#{state.currentRank}</span>
        </div>

        {/* Rebuy Button (compact) */}
        {showRebuyButton && onRebuy && (
          <>
            <div className="w-px h-6 bg-gray-600" />
            <button
              onClick={onRebuy}
              disabled={isRebuyLoading}
              className="px-3 py-1 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {isRebuyLoading ? '...' : 'Rebuy'}
            </button>
          </>
        )}

        {/* Rebuy Count */}
        {state.rebuyEnabled && state.rebuyCount > 0 && (
          <>
            <div className="w-px h-6 bg-gray-600" />
            <span className="text-gray-400 text-xs">
              Rebuys: {state.rebuyCount}{state.maxRebuys > 0 ? `/${state.maxRebuys}` : ''}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-purple-500/40 shadow-xl shadow-purple-500/10 p-4 space-y-4" style={Theme.panel.base}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-purple-300 font-semibold text-sm uppercase tracking-wide">
            Tournament Mode
          </span>
        </div>
        {onLeave && (
          <button
            onClick={onLeave}
            className="text-gray-500 hover:text-red-400 text-xs transition-colors"
          >
            Leave
          </button>
        )}
      </div>

      {/* Chips - Large Display */}
      <div className="text-center py-2">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Tournament Chips</p>
        <p className="text-4xl font-bold text-yellow-400">
          {state.chips.toLocaleString()}
        </p>
        <p className={`text-sm ${chipChangeFromStart >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {chipChangeFromStart >= 0 ? '+' : ''}{chipChangeFromStart.toLocaleString()} ({chipChangePercent}%)
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Hands Progress</span>
          <span className="text-cyan-400">
            {state.handsPlayed} / {state.maxHands}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-center">
          {state.handsRemaining} hands remaining
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-700">
        {/* Rank */}
        <div className="text-center">
          <p className="text-gray-500 text-xs">Rank</p>
          <p className="text-lg font-bold text-purple-400">#{state.currentRank}</p>
        </div>

        {/* Highest */}
        <div className="text-center">
          <p className="text-gray-500 text-xs">Best</p>
          <p className="text-lg font-bold text-green-400">{state.highestChips.toLocaleString()}</p>
        </div>

        {/* Status */}
        <div className="text-center">
          <p className="text-gray-500 text-xs">Status</p>
          <p className={`text-lg font-bold capitalize ${
            state.status === 'playing' ? 'text-cyan-400' :
            state.status === 'busted' ? 'text-red-400' :
            state.status === 'completed' ? 'text-green-400' :
            'text-gray-400'
          }`}>
            {state.status || 'Active'}
          </p>
        </div>
      </div>

      {/* Rebuy Section */}
      {state.rebuyEnabled && (
        <div className="pt-2 border-t border-gray-700">
          {/* Rebuy Count */}
          {state.rebuyCount > 0 && (
            <p className="text-gray-400 text-xs text-center mb-2">
              Rebuys used: {state.rebuyCount}{state.maxRebuys > 0 ? ` / ${state.maxRebuys}` : ' (unlimited)'}
            </p>
          )}

          {/* Rebuy Button */}
          {showRebuyButton && onRebuy && (
            <button
              onClick={onRebuy}
              disabled={isRebuyLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-semibold transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRebuyLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing Rebuy...
                </span>
              ) : (
                'Rebuy & Continue'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TournamentHUD;
