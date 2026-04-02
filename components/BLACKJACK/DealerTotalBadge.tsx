'use client';

import React from 'react';

type DealerTotalBadgeProps = {
  shown: number | string;
  isBust: boolean;
  isBlackjack: boolean;
  isActive?: boolean;
  winnerHighlight?: boolean;
  size?: 'small' | 'large';
};

export default function DealerTotalBadge({
  shown,
  isBust,
  isBlackjack,
  isActive = false,
  winnerHighlight = false,
  size = 'small',
}: DealerTotalBadgeProps) {
  const shellSize = size === 'large' ? 'w-24 h-24' : 'w-20 h-20';
  const valueSize = size === 'large' ? 'text-6xl' : 'text-4xl';
  const labelSize = size === 'large' ? 'text-base sm:text-lg' : 'text-sm';
  const wrapperClass = `flex items-center gap-2 transition-transform duration-300 ${winnerHighlight ? 'card-counter-winner' : ''}`;

  return (
    <div className={wrapperClass} style={{ marginTop: -14, zIndex: 10 }}>
      <div className={`glass-counter relative ${shellSize} flex items-center justify-center rounded-full transition-all duration-300 ${isActive ? 'card-counter-active' : ''}`}>
        <span className={`font-black relative z-10 transition-all duration-500 ${valueSize} ${isBust ? 'text-red-400' : isBlackjack ? 'text-yellow-400' : winnerHighlight ? 'text-emerald-400' : 'text-white/90'}`}>
          {shown}
        </span>
      </div>
      {isBlackjack && <span className={`text-yellow-400 font-black ${labelSize}`}>BJ</span>}
      {isBust && <span className={`text-red-400 font-black ${labelSize}`}>BUST</span>}
    </div>
  );
}

