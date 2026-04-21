'use client';

import React, { useState } from 'react';
import { formatEther } from 'viem';
import { TOURNAMENT_CONFIG } from '@/hooks/use-tournament';
import { Theme } from '@/lib/theme';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';

interface TournamentEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onEnter: () => void;
  isLoading: boolean;
  playerBalance: bigint;
  prizePool?: string;
  entryCount?: number;
}

export function TournamentEntry({
  isOpen,
  onClose,
  onEnter,
  isLoading,
  playerBalance,
  prizePool = '0',
  entryCount = 0,
}: TournamentEntryProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isOpen) return null;

  const buyInAmount = TOURNAMENT_CONFIG.BUY_IN_AMOUNT;
  const canAfford = playerBalance >= buyInAmount;
  const formattedBalance = Number(formatEther(playerBalance)).toLocaleString();
  const formattedPrizePool = Number(formatEther(BigInt(prizePool))).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 max-w-md w-full mx-4 overflow-hidden" style={Theme.panel.base}>
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-purple-600 p-4">
          <h2 className="text-2xl font-bold text-white text-center">
            Tournament Mode
          </h2>
          <p className="text-cyan-100 text-center text-sm mt-1">
            {TOURNAMENT_CONFIG.MAX_HANDS}-Hand Sprint Challenge
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Buy-in Details */}
          <div className="rounded-xl p-4 border border-gray-700" style={Theme.panel.base}>
            <h3 className="text-lg font-semibold text-white mb-3">Entry Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Buy-in Cost:</span>
                <span className="text-yellow-400 font-bold">
                  {TOURNAMENT_CONFIG.BUY_IN_DISPLAY} MORBIUS
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Starting Chips:</span>
                <span className="text-green-400 font-bold">
                  {TOURNAMENT_CONFIG.STARTING_CHIPS.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Hands to Play:</span>
                <span className="text-cyan-400 font-bold">
                  {TOURNAMENT_CONFIG.MAX_HANDS}
                </span>
              </div>
            </div>
          </div>

          {/* Prize Pool */}
          <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-xl p-4 border border-yellow-500/30">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">
              Current Prize Pool
            </h3>
            <p className="text-3xl font-bold text-yellow-300">
              {formattedPrizePool} MORBIUS
            </p>
            <p className="text-yellow-200/60 text-sm mt-1">
              {entryCount} player{entryCount !== 1 ? 's' : ''} entered
            </p>
          </div>

          {/* Prize Distribution */}
          <div className="rounded-xl p-4 border border-gray-700" style={Theme.panel.base}>
            <h3 className="text-lg font-semibold text-white mb-3">Prize Distribution</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-yellow-500">1st Place:</span>
                <span className="text-white">{TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[0]}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">2nd Place:</span>
                <span className="text-white">{TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[1]}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-orange-400">3rd Place:</span>
                <span className="text-white">{TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[2]}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">4th-10th:</span>
                <span className="text-white">{TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[3]}% each</span>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              * 95% of prize pool paid to top 10 players (5% protocol fee)
            </p>
          </div>

          {/* Balance Display */}
          <div className="text-center">
            <p className="text-gray-400 text-sm">Your Balance</p>
            <p className={`text-lg font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
              {formattedBalance} MORBIUS
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => canAfford && setShowConfirm(true)}
              disabled={!canAfford || isLoading}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                canAfford && !isLoading
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-lg shadow-cyan-500/30'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entering...
                </span>
              ) : canAfford ? (
                'Enter Tournament'
              ) : (
                'Insufficient Balance'
              )}
            </button>
          </div>

          {showConfirm && (
            <ConfirmActionCard
              title="Enter Tournament"
              subtitle="Confirm your entry details"
              rows={[
                { label: 'Buy-in', value: `${TOURNAMENT_CONFIG.BUY_IN_DISPLAY} MORBIUS`, accent: 'yellow' },
                { label: 'Starting Chips', value: TOURNAMENT_CONFIG.STARTING_CHIPS.toLocaleString(), accent: 'green' },
                { label: 'Hands to Play', value: TOURNAMENT_CONFIG.MAX_HANDS, accent: 'cyan' },
                { label: 'Current Prize Pool', value: `${formattedPrizePool} MORBIUS`, accent: 'yellow' },
                { label: 'Prize Distribution', value: `1st ${TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[0]}% · 2nd ${TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[1]}% · 3rd ${TOURNAMENT_CONFIG.PRIZE_PERCENTAGES[2]}%`, accent: 'cyan' },
                { label: 'Your Balance', value: `${formattedBalance} MORBIUS`, accent: canAfford ? 'green' : 'white' },
              ]}
              onBack={() => setShowConfirm(false)}
              onConfirm={() => { setShowConfirm(false); onEnter(); }}
              confirmLabel="Enter Tournament"
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default TournamentEntry;
