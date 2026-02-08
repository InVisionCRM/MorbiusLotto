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
  /** Perfect Pairs side bet (whole MORBIUS, 0-10000). */
  perfectPairsBet?: number;
  /** Callback when PP bet changes (cycles 0→1k→...→10k→0). */
  onPerfectPairsBetChange?: (amount: number) => void;
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
      className={`w-full mt-0.5 sm:mt-1 px-2 sm:px-4 py-0.5 sm:pt-1 sm:pb-1 ${alwaysVisible ? '' : 'md:hidden'}`}
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
      }}
    >
      {/* Mobile layout: row 1 = HIT, STAND, DOUBLE, SPLIT; row 2 = REBET | DEAL — compact on mobile */}
      <div className="flex flex-col items-center gap-1.5 sm:gap-4 w-full max-w-full">
        {/* Row 1: HIT, STAND, DOUBLE, SPLIT */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 w-full">
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
          className={`action-bar-btn flex-1 min-w-[48px] min-h-[36px] sm:min-w-[64px] sm:min-h-[52px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-red-400/50 transition-all duration-150 text-xs sm:text-sm ${canHit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 50%, #991b1b 100%)',
            boxShadow: canHit ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="text-white font-black text-sm tracking-wider drop-shadow-sm">HIT</span>
        </button>

        {/* STAND */}
        <button
          type="button"
          onClick={() => canStand && onAction(Action.STAND)}
          disabled={!canStand}
          className={`action-bar-btn flex-1 min-w-[48px] min-h-[36px] sm:min-w-[64px] sm:min-h-[52px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-blue-400/50 transition-all duration-150 text-xs sm:text-sm ${canStand ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.8) 50%, rgba(29, 78, 216, 0.9) 100%)',
            boxShadow: canStand ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="text-white font-black text-sm tracking-wider drop-shadow-sm">STAND</span>
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
          className={`action-bar-btn flex-1 min-w-[48px] min-h-[36px] sm:min-w-[64px] sm:min-h-[52px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-amber-400/50 transition-all duration-150 text-xs sm:text-sm ${canDoubleDown ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
            boxShadow: canDoubleDown ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="text-white font-black text-xs tracking-wider drop-shadow-sm">DOUBLE</span>
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
          className={`action-bar-btn flex-1 min-w-[48px] min-h-[36px] sm:min-w-[64px] sm:min-h-[52px] flex items-center justify-center rounded-lg sm:rounded-xl border-2 border-emerald-400/50 transition-all duration-150 text-xs sm:text-sm ${canSplit ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
          style={{
            background: 'linear-gradient(180deg, #10b981 0%, #059669 50%, #047857 100%)',
            boxShadow: canSplit ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span className="text-white font-black text-sm tracking-wider drop-shadow-sm">SPLIT</span>
        </button>
        </div>

        {/* Perfect Pairs circle + REBET | DEAL row */}
        <div className="flex items-center gap-2 w-full">
        {onPerfectPairsBetChange && (
          <button
            type="button"
            onClick={() => {
              const next = perfectPairsBet >= 10000 ? 0 : perfectPairsBet + 1000;
              onPerfectPairsBetChange(next);
            }}
            disabled={isPlaying}
            className="flex-shrink-0 flex flex-col items-center justify-center transition-all active:scale-95"
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: perfectPairsBet > 0
                ? 'linear-gradient(145deg, #f59e0b, #d97706)'
                : 'linear-gradient(145deg, rgba(50,60,70,0.9), rgba(30,40,50,0.9))',
              border: perfectPairsBet > 0 ? '2px solid rgba(251,191,36,0.7)' : '2px dashed rgba(100,116,139,0.5)',
              boxShadow: perfectPairsBet > 0 ? '0 0 8px rgba(245,158,11,0.3)' : 'inset 0 2px 4px rgba(0,0,0,0.5)',
              opacity: isPlaying ? 0.3 : 1,
              cursor: isPlaying ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ fontSize: '7px', fontWeight: 700, color: perfectPairsBet > 0 ? '#fff' : 'rgba(148,163,184,0.7)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>PAIRS</span>
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)', lineHeight: 1 }}>{perfectPairsBet > 0 ? `${(perfectPairsBet / 1000).toFixed(0)}K` : '—'}</span>
            <span style={{ fontSize: '6px', color: perfectPairsBet > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(148,163,184,0.5)' }}>5-12:1</span>
          </button>
        )}
        <div className="flex-1 flex rounded-lg sm:rounded-xl overflow-hidden border-2 border-white/10" style={{ boxShadow: '0 4px 0 0 rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.15)' }}>
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
              className={`action-bar-btn flex-1 min-h-[36px] sm:min-h-[52px] flex items-center justify-center border-r border-violet-400/50 transition-all duration-150 text-xs sm:text-sm ${canRebet ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
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
            className={`action-bar-btn flex-1 min-h-[36px] sm:min-h-[52px] flex items-center justify-center transition-all duration-150 text-xs sm:text-sm ${canDealNow ? 'cursor-pointer' : 'pointer-events-none cursor-not-allowed opacity-50'}`}
            style={{
              background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
              boxShadow: canDealNow ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            <span className="text-white font-black text-sm tracking-wider drop-shadow-sm">DEAL</span>
          </button>
        </div>
        </div>
      </div>
    </section>
    </>
  );
}

export default BlackjackMobileActionBar;
