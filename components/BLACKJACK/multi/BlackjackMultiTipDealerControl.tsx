'use client';

import React from 'react';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';

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
    <div className="pointer-events-auto absolute left-1/4 top-12 z-[12] flex -translate-x-1/2 flex-col items-center">
      <IconButton
        variant="tip"
        size="tip"
        onClick={onTipDealer}
        disabled={tipAnimating}
      >
        Tip 2,000
      </IconButton>

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
        <div className="mt-1 px-3 py-1 rounded bg-black/70 border border-amber-600/30 text-amber-300 text-[10px] text-center animate-fade-in whitespace-nowrap">
          Thanks for the tip! Best of luck to you, {tipNotificationName}
        </div>
      )}
    </div>
  );
}
