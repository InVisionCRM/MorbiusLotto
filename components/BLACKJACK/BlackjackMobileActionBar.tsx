'use client';

import React from 'react';
import { Plus, Hand, Copy, Split } from 'lucide-react';
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
  /** Perfect Pairs side bet (whole MORBIUS, 0-10000). */
  perfectPairsBet?: number;
  /** Callback when PP bet changes (cycles 0→1k→...→10k→0). */
  onPerfectPairsBetChange?: (amount: number) => void;
  /** Hide the REBET/DEAL row (used in multiplayer where rounds start automatically). */
  hideDealRow?: boolean;
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
  perfectPairsBet = 0,
  onPerfectPairsBetChange,
  hideDealRow = false,
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
    <>
      <style>{`
        .action-bar-btn:active:not(:disabled) {
          transform: translateY(3px);
          box-shadow: 0 1px 0 0 rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15) !important;
        }
      `}</style>
    <section
      className={`w-full h-full mt-0.5 sm:mt-1 px-2 sm:px-4 py-0.5 sm:pt-1 sm:pb-1 ${alwaysVisible ? '' : 'md:hidden'}`}
    >
      {/* Mobile layout: row 1 = HIT, STAND, DOUBLE, SPLIT (grid-4); row 2 = REBET | DEAL — matches BettingPanelMobile height */}
      <div className="flex flex-col h-full gap-2 sm:gap-4 w-full max-w-full">
        {/* Row 1: HIT, STAND, DOUBLE, SPLIT — always 4 columns */}
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5 w-full flex-1 min-h-0">
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
          aria-label="Hit"
          className={`action-bar-btn min-h-[62px] h-full sm:min-h-[72px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-red-400/50 transition-all duration-150 text-xs sm:text-sm ${canHit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 50%, #991b1b 100%)',
            boxShadow: canHit ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5">
            <Plus className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-sm shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="text-white/95 text-[11px] sm:text-[13px] font-semibold drop-shadow-sm leading-tight">Hit</span>
          </span>
        </button>

        {/* STAND */}
        <button
          type="button"
          onClick={() => canStand && onAction(Action.STAND)}
          disabled={!canStand}
          aria-label="Stand"
          className={`action-bar-btn min-h-[62px] h-full sm:min-h-[72px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-blue-400/50 transition-all duration-150 text-xs sm:text-sm ${canStand ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.8) 50%, rgba(29, 78, 216, 0.9) 100%)',
            boxShadow: canStand ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5">
            <Hand className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-sm shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="text-white/95 text-[11px] sm:text-[13px] font-semibold drop-shadow-sm leading-tight">Stand</span>
          </span>
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
          aria-label="Double down"
          className={`action-bar-btn min-h-[62px] h-full sm:min-h-[72px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-amber-400/50 transition-all duration-150 text-xs sm:text-sm ${canDoubleDown ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
            boxShadow: canDoubleDown ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5">
            <Copy className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-sm shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="text-white/95 text-[11px] sm:text-[13px] font-semibold drop-shadow-sm leading-tight">Double</span>
          </span>
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
          aria-label="Split"
          className={`action-bar-btn min-h-[62px] h-full sm:min-h-[72px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-emerald-400/50 transition-all duration-150 text-xs sm:text-sm ${canSplit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #10b981 0%, #059669 50%, #047857 100%)',
            boxShadow: canSplit ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5">
            <Split className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-sm shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="text-white/95 text-[11px] sm:text-[13px] font-semibold drop-shadow-sm leading-tight">Split</span>
          </span>
        </button>
        </div>

        {/* REBET | DEAL row */}
        {!hideDealRow && <div className="flex items-center gap-2 w-full flex-1 min-h-0">
        <div className="flex-1 flex h-full rounded-lg sm:rounded-xl overflow-hidden">
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
              className={`action-bar-btn flex-1 min-h-0 h-full sm:min-h-[52px] flex items-center justify-center border-r border-violet-400/50 transition-all duration-150 text-xs sm:text-sm ${canRebet ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
              style={{
                background: 'linear-gradient(180deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
                boxShadow: canRebet ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              <span className="text-white font-black text-xs tracking-wider drop-shadow-sm">REBET</span>
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
            className={`action-bar-btn flex-1 min-h-0 h-full sm:min-h-[52px] flex items-center justify-center transition-all duration-150 text-xs sm:text-sm ${canDealNow ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
            style={{
              background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
              boxShadow: canDealNow ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            <span className="text-white font-black text-sm tracking-wider drop-shadow-sm">DEAL</span>
          </button>
        </div>
        </div>}
      </div>
    </section>
    </>
  );
}

export default BlackjackMobileActionBar;
