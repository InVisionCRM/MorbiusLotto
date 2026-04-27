'use client';

import React from 'react';
import { Coins } from 'lucide-react';

export function BlackjackMultiTipDealerControl({
  visible,
  tipAnimating,
  tipNotificationName,
  onTipDealer,
  onTipAnimationEnd,
}: {
  visible: boolean;
  tipAnimating: boolean;
  tipNotificationName: string | null;
  onTipDealer: () => void;
  onTipAnimationEnd: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="relative flex flex-col items-center pointer-events-auto z-[12]">
      <button
        type="button"
        onClick={onTipDealer}
        disabled={tipAnimating}
        aria-label="Tip dealer 2,000 MORBIUS"
        title="Tip dealer 2,000 MORBIUS"
        className="flex items-center justify-center rounded-md bg-amber-900/50 hover:bg-amber-800/60 border border-amber-600/40 text-amber-300 transition-all disabled:opacity-50 disabled:pointer-events-none"
        style={{ width: 32, height: 32 }}
      >
        <Coins className="w-4 h-4" aria-hidden />
      </button>

      {tipAnimating && (
        <div
          className="absolute pointer-events-none"
          style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}
          onAnimationEnd={onTipAnimationEnd}
        >
          <div className="tip-chip-fly">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
              <span className="text-white text-[8px] font-bold">$</span>
            </div>
          </div>
        </div>
      )}

      {tipNotificationName && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-3 py-1 rounded bg-black/70 border border-amber-600/30 text-amber-300 text-[10px] text-center animate-fade-in whitespace-nowrap z-20 shadow-lg">
          Thanks for the tip! Best of luck to you, {tipNotificationName}
        </div>
      )}
    </div>
  );
}
