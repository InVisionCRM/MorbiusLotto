'use client';

import React, { useState, useEffect } from 'react';
import { TOURNAMENT_CONFIG } from '@/hooks/use-tournament';

interface TournamentBetPanelProps {
  chips: number;
  onStartGame: (betAmount: number) => void;
  isPlaying: boolean;
  isLoading?: boolean;
  handsRemaining: number;
  gameResult?: 'win' | 'loss' | 'push' | 'blackjack' | null;
}

export function TournamentBetPanel({
  chips,
  onStartGame,
  isPlaying,
  isLoading = false,
  handsRemaining,
  gameResult = null,
}: TournamentBetPanelProps) {
  const [betAmount, setBetAmount] = useState(TOURNAMENT_CONFIG.MIN_BET);
  const [isVisible, setIsVisible] = useState(false);

  // Delay showing the panel until game result animations are done
  useEffect(() => {
    if (!isPlaying && !gameResult && handsRemaining > 0) {
      // Small delay before showing to ensure animations complete
      const timer = setTimeout(() => setIsVisible(true), 300);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isPlaying, gameResult, handsRemaining]);

  const presetBets = [
    { amount: 50, label: '50' },
    { amount: 100, label: '100' },
    { amount: 250, label: '250' },
    { amount: 500, label: '500' },
    { amount: 1000, label: '1K' },
  ];

  const isValidBet = betAmount >= TOURNAMENT_CONFIG.MIN_BET && betAmount <= chips;

  const handlePresetBet = (amount: number) => {
    setBetAmount(Math.min(amount, chips));
  };

  const handleAllIn = () => {
    setBetAmount(chips);
  };

  const handleStartGame = () => {
    if (isValidBet && !isPlaying && !isLoading) {
      onStartGame(betAmount);
    }
  };

  // Don't render if tournament is complete or if we should be hidden
  if (handsRemaining <= 0 || !isVisible) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Chip Amount Display */}
      <div className="flex items-center gap-2 px-4 py-2 bg-black/40 rounded-full border border-yellow-500/30">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
          <span className="text-[8px] font-bold text-yellow-900">$</span>
        </div>
        <span className="text-yellow-400 font-bold text-lg tabular-nums">
          {betAmount.toLocaleString()}
        </span>
      </div>

      {/* Preset Bet Buttons — grid-4 */}
      <div className="grid grid-cols-4 gap-1">
        {presetBets.map(({ amount, label }) => {
          const affordable = amount <= chips;
          const isSelected = betAmount === amount;

          return (
            <button
              key={amount}
              onClick={() => handlePresetBet(amount)}
              disabled={isPlaying || isLoading || !affordable}
              className={`
                px-2 py-1.5 rounded-full text-xs font-bold transition-all
                ${isSelected
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/40'
                  : affordable
                    ? 'bg-white/10 text-white/80 hover:bg-white/20'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* All-In */}
      <button
        onClick={handleAllIn}
        disabled={isPlaying || isLoading}
        className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 transition-all disabled:opacity-50"
      >
        ALL IN
      </button>

      {/* Deal */}
      <button
        onClick={handleStartGame}
        disabled={!isValidBet || isPlaying || isLoading}
        className={`
          px-4 py-2 rounded-full font-bold text-sm transition-all
          ${isValidBet && !isPlaying && !isLoading
            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500 shadow-lg shadow-green-500/30'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            DEALING
          </span>
        ) : (
          'DEAL'
        )}
      </button>
    </div>
  );
}

export default TournamentBetPanel;
