'use client';

import React, { useState } from 'react';
import { TOURNAMENT_CONFIG } from '@/hooks/use-tournament';
import { Theme } from '@/lib/theme';

interface TournamentBetPanelProps {
  chips: number;
  onStartGame: (betAmount: number) => void;
  isPlaying: boolean;
  isLoading?: boolean;
  handsRemaining: number;
  gameResult?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  /** In-hand action callbacks */
  onHit?: () => void;
  onStand?: () => void;
  onDoubleDown?: () => void;
  onSplit?: () => void;
  canHit?: boolean;
  canStand?: boolean;
  canDoubleDown?: boolean;
  canSplit?: boolean;
}

const PRESETS = [50, 100, 250, 500, 1000];

export function TournamentBetPanel({
  chips,
  onStartGame,
  isPlaying,
  isLoading = false,
  handsRemaining,
  onHit,
  onStand,
  onDoubleDown,
  onSplit,
  canHit = false,
  canStand = false,
  canDoubleDown = false,
  canSplit = false,
}: TournamentBetPanelProps) {
  const [betAmount, setBetAmount] = useState(TOURNAMENT_CONFIG.MIN_BET);

  const isValidBet = betAmount >= TOURNAMENT_CONFIG.MIN_BET && betAmount <= chips;
  const disabled = isPlaying || isLoading;

  const handlePresetBet = (amount: number) => setBetAmount(Math.min(amount, chips));
  const handleHalf = () => setBetAmount(Math.max(TOURNAMENT_CONFIG.MIN_BET, Math.floor(betAmount / 2)));
  const handleDouble = () => setBetAmount(Math.min(betAmount * 2, chips));
  const handleAllIn = () => setBetAmount(chips);
  const handleDeal = () => {
    if (isValidBet && !disabled) onStartGame(betAmount);
  };

  if (handsRemaining <= 0) return null;

  return (
    <section className="w-full max-w-md mx-auto px-2 py-1.5 rounded-lg" style={Theme.panel.base}>
      <div className="flex flex-col gap-1 w-full">
        {/* Row 1: Chips remaining | bet amount + 1/2 & 2x | hands left */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider whitespace-nowrap">
            {chips.toLocaleString()} chips
          </span>
          <div
            className="flex-1 flex items-center rounded-lg overflow-hidden border border-cyan-500/20"
            style={Theme.panel.base}
          >
            <div className="flex-1 flex items-center gap-2 pl-3 pr-2 min-w-0">
              <span className="text-white font-bold text-sm tabular-nums">{betAmount.toLocaleString()}</span>
              <span className="text-gray-500 text-xs">bet</span>
            </div>
            <div className="flex items-stretch flex-shrink-0">
              <div className="w-px bg-white/20 self-stretch" />
              <button
                type="button"
                onClick={handleHalf}
                disabled={disabled}
                className="min-w-[48px] flex items-center justify-center text-white font-bold text-sm hover:bg-white/10 active:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                1/2
              </button>
              <div className="w-px bg-white/20 self-stretch" />
              <button
                type="button"
                onClick={handleDouble}
                disabled={disabled}
                className="min-w-[48px] flex items-center justify-center text-white font-bold text-sm hover:bg-white/10 active:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                2x
              </button>
            </div>
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider whitespace-nowrap">
            {handsRemaining} left
          </span>
        </div>

        {/* Row 2: switches between bet presets (not playing) and action buttons (playing) */}
        {isPlaying ? (
          /* Action buttons: Hit / Stand / Double / Split */
          <div className="grid grid-cols-4 gap-0 border border-white/20 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={onHit}
              disabled={!canHit}
              className="h-8 text-xs font-bold transition-colors border-r border-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-green-400 hover:bg-green-500/15 active:bg-green-500/25"
            >
              HIT
            </button>
            <button
              type="button"
              onClick={onStand}
              disabled={!canStand}
              className="h-8 text-xs font-bold transition-colors border-r border-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 hover:bg-red-500/15 active:bg-red-500/25"
            >
              STAND
            </button>
            <button
              type="button"
              onClick={onDoubleDown}
              disabled={!canDoubleDown}
              className="h-8 text-xs font-bold transition-colors border-r border-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-yellow-400 hover:bg-yellow-500/15 active:bg-yellow-500/25"
            >
              DOUBLE
            </button>
            <button
              type="button"
              onClick={onSplit}
              disabled={!canSplit}
              className="h-8 text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-cyan-400 hover:bg-cyan-500/15 active:bg-cyan-500/25"
            >
              SPLIT
            </button>
          </div>
        ) : (
          /* Bet presets + All-in + Deal */
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto] gap-0 border border-white/20 rounded-lg bg-slate-900/30 overflow-hidden">
            {PRESETS.map((amount) => {
              const affordable = amount <= chips;
              const isSelected = betAmount === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handlePresetBet(amount)}
                  disabled={disabled || !affordable}
                  className={`h-7 min-h-0 py-0 px-0 text-xs font-medium transition-colors border-r border-white/20
                    ${isSelected
                      ? 'bg-cyan-500/30 text-cyan-300'
                      : affordable
                        ? 'text-white/90 hover:bg-white/10 active:bg-white/15'
                        : 'text-white/30 cursor-not-allowed'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {amount >= 1000 ? `${amount / 1000}k` : amount}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleAllIn}
              disabled={disabled}
              className="h-7 min-h-0 py-0 px-2.5 text-xs font-bold text-red-400 hover:bg-red-500/15 active:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-white/20 whitespace-nowrap"
            >
              ALL IN
            </button>
            <button
              type="button"
              onClick={handleDeal}
              disabled={!isValidBet || disabled}
              className={`h-7 min-h-0 py-0 px-3 text-xs font-bold whitespace-nowrap transition-colors
                ${isValidBet && !disabled
                  ? 'text-green-400 hover:bg-green-500/15 active:bg-green-500/25'
                  : 'text-gray-500 cursor-not-allowed'
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'DEALING...' : 'DEAL'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default TournamentBetPanel;
