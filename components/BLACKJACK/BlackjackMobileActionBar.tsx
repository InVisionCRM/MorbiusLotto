'use client';

import React from 'react';
import { Action } from '@/app/BLACKJACK/types';

export interface BlackjackMobileActionBarProps {
  onRebetAndDeal?: () => void;
  onStartGame?: () => void;
  onAction: (action: Action) => void;
  onDoubleDownChips?: () => void;
  onSplitChips?: () => void;
  isPlaying: boolean;
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
  canDeal: boolean;
  chipStackLength: number;
  lastBetAmount: string;
  soundEnabled?: boolean;
  /** Play a sound effect via Web Audio API (avoids interrupting background music). When provided, SFX use this instead of new Audio().play() */
  onPlaySfx?: (path: string) => void;
  /** When true, show on all screen sizes (e.g. when embedded in sidebar Bet tab). Default false = hidden on md+ */
  alwaysVisible?: boolean;
}

export function BlackjackMobileActionBar({
  onRebetAndDeal,
  onStartGame,
  onAction,
  onDoubleDownChips,
  onSplitChips,
  isPlaying,
  canHit,
  canStand,
  canDoubleDown,
  canSplit,
  canDeal,
  chipStackLength,
  lastBetAmount,
  soundEnabled = true,
  onPlaySfx,
  alwaysVisible = false,
}: BlackjackMobileActionBarProps) {
  const playKnock = () => {
    if (soundEnabled) {
      if (onPlaySfx) onPlaySfx('/BlackJack/sounds/knock.wav');
      else new Audio('/BlackJack/sounds/knock.wav').play().catch(() => {});
    }
  };

  const lastBet = parseFloat(lastBetAmount || '0');
  const canRebet = !isPlaying && lastBet > 0;
  const canDealNow = !isPlaying && canDeal && (chipStackLength > 0 || !onRebetAndDeal);

  return (
    <section
      className={`w-full mt-1 px-4 pt-1 pb-1 ${alwaysVisible ? '' : 'md:hidden'}`}
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
      }}
    >
      {/* Mobile layout: row 1 = HIT, STAND, DOUBLE, SPLIT; row 2 = REBET | DEAL */}
      <div className="flex flex-col items-center gap-4 w-full max-w-full">
        {/* Row 1: HIT, STAND, DOUBLE, SPLIT */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          {/* HIT */}
          <button
          type="button"
          onClick={() => {
            if (canHit) {
              playKnock();
              onAction(Action.HIT);
            }
          }}
          disabled={!canHit}
          className={`flex-1 min-w-[64px] min-h-[52px] flex items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-400/50 shadow-lg transition-all active:scale-95 ${canHit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
        >
          <span className="text-white font-black text-sm tracking-wider">HIT</span>
        </button>

        {/* STAND */}
        <button
          type="button"
          onClick={() => canStand && onAction(Action.STAND)}
          disabled={!canStand}
          className={`flex-1 min-w-[64px] min-h-[52px] flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/50 to-blue-700/50 border-2 border-blue-400/50 shadow-lg transition-all active:scale-95 ${canStand ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
        >
          <span className="text-white font-black text-sm tracking-wider">STAND</span>
        </button>

        {/* DOUBLE */}
        <button
          type="button"
          onClick={() => {
            if (canDoubleDown) {
              onDoubleDownChips?.();
              onAction(Action.DOUBLE_DOWN);
            }
          }}
          disabled={!canDoubleDown}
          className={`flex-1 min-w-[64px] min-h-[52px] flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-amber-400/50 shadow-lg transition-all active:scale-95 ${canDoubleDown ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
        >
          <span className="text-white font-black text-xs tracking-wider">DOUBLE</span>
        </button>

        {/* SPLIT */}
        <button
          type="button"
          onClick={() => {
            if (canSplit) {
              onSplitChips?.();
              onAction(Action.SPLIT);
            }
          }}
          disabled={!canSplit}
          className={`flex-1 min-w-[64px] min-h-[52px] flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-400/50 shadow-lg transition-all active:scale-95 ${canSplit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
        >
          <span className="text-white font-black text-sm tracking-wider">SPLIT</span>
        </button>
        </div>

        {/* Row 2: REBET | DEAL */}
        <div className="flex rounded-xl overflow-hidden border-2 border-white/10 shadow-lg w-full">
          {onRebetAndDeal && (
            <button
              type="button"
              onClick={() => {
                if (canRebet) {
                  playKnock();
                  onRebetAndDeal();
                }
              }}
              disabled={!canRebet}
              className={`flex-1 min-h-[52px] flex items-center justify-center bg-gradient-to-br from-violet-500 to-violet-700 border-r border-violet-400/50 transition-all active:scale-[0.98] ${canRebet ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
            >
              <span className="text-white font-black text-xs tracking-wider">REBET</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (canDealNow && onStartGame) {
                playKnock();
                onStartGame();
              }
            }}
            disabled={!canDealNow}
            className={`flex-1 min-h-[52px] flex items-center justify-center bg-gradient-to-br from-green-500 to-green-700 transition-all active:scale-[0.98] ${canDealNow ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          >
            <span className="text-white font-black text-sm tracking-wider">DEAL</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default BlackjackMobileActionBar;
