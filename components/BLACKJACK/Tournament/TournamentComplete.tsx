'use client';

import React from 'react';
import { formatEther } from 'viem';
import { TournamentState, TOURNAMENT_CONFIG } from '@/hooks/use-tournament';

interface TournamentCompleteProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain?: () => void;
  state: TournamentState;
  prizeWon?: bigint;
}

export function TournamentComplete({
  isOpen,
  onClose,
  onPlayAgain,
  state,
  prizeWon = 0n,
}: TournamentCompleteProps) {
  if (!isOpen) return null;

  const isBusted = state.status === 'busted';
  const chipChange = state.chips - state.startingChips;
  const prizeWonFormatted = Number(formatEther(prizeWon)).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-purple-500/40 shadow-2xl shadow-purple-500/20 max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`p-6 text-center ${
          isBusted
            ? 'bg-gradient-to-r from-red-600/30 to-orange-600/30'
            : 'bg-gradient-to-r from-green-600/30 to-cyan-600/30'
        }`}>
          {isBusted ? (
            <>
              <div className="text-6xl mb-2">💔</div>
              <h2 className="text-2xl font-bold text-red-400">Busted!</h2>
              <p className="text-gray-400 mt-1">Your chips ran out</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-2">🏆</div>
              <h2 className="text-2xl font-bold text-green-400">Tournament Complete!</h2>
              <p className="text-gray-400 mt-1">You played all {TOURNAMENT_CONFIG.MAX_HANDS} hands</p>
            </>
          )}
        </div>

        {/* Results */}
        <div className="p-6 space-y-4">
          {/* Rank */}
          <div className="text-center">
            <p className="text-gray-400 text-sm uppercase tracking-wide">Final Rank</p>
            <p className={`text-5xl font-bold ${
              state.currentRank === 1 ? 'text-yellow-400' :
              state.currentRank === 2 ? 'text-gray-300' :
              state.currentRank === 3 ? 'text-orange-400' :
              state.currentRank <= 10 ? 'text-purple-400' :
              'text-gray-400'
            }`}>
              #{state.currentRank}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs uppercase">Final Chips</p>
              <p className="text-xl font-bold text-yellow-400">
                {state.chips.toLocaleString()}
              </p>
              <p className={`text-xs ${chipChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {chipChange >= 0 ? '+' : ''}{chipChange.toLocaleString()} from start
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs uppercase">Hands Played</p>
              <p className="text-xl font-bold text-cyan-400">
                {state.handsPlayed}
              </p>
              <p className="text-xs text-gray-500">
                of {TOURNAMENT_CONFIG.MAX_HANDS}
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs uppercase">Highest Chips</p>
              <p className="text-xl font-bold text-green-400">
                {state.highestChips.toLocaleString()}
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs uppercase">Starting Chips</p>
              <p className="text-xl font-bold text-gray-400">
                {TOURNAMENT_CONFIG.STARTING_CHIPS.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Prize Won */}
          {prizeWon > 0n && (
            <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-xl p-4 border border-yellow-500/30 text-center">
              <p className="text-yellow-400 text-sm uppercase tracking-wide">Prize Won!</p>
              <p className="text-3xl font-bold text-yellow-300 mt-1">
                {prizeWonFormatted} MORBIUS
              </p>
              <p className="text-yellow-200/60 text-sm mt-1">
                Added to your balance
              </p>
            </div>
          )}

          {/* Prize Info for non-winners */}
          {prizeWon === 0n && state.currentRank > 10 && (
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-sm">
                Top 10 players receive prizes
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Keep practicing to improve your rank!
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
            >
              Close
            </button>
            {onPlayAgain && (
              <button
                onClick={onPlayAgain}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-semibold transition-all shadow-lg shadow-cyan-500/30"
              >
                Play Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentComplete;
