'use client';

import React from 'react';
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { EncryptedText } from '@/components/ui/encrypted-text';

export const BLACKJACK_COLOR_PALETTES = [
  { encrypted: 'text-amber-400/60', revealed: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent' },
  { encrypted: 'text-purple-400/60', revealed: 'bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-500 bg-clip-text text-transparent' },
  { encrypted: 'text-cyan-400/60', revealed: 'bg-gradient-to-r from-cyan-300 via-teal-400 to-emerald-400 bg-clip-text text-transparent' },
  { encrypted: 'text-rose-400/60', revealed: 'bg-gradient-to-r from-rose-400 via-red-400 to-orange-400 bg-clip-text text-transparent' },
  { encrypted: 'text-emerald-400/60', revealed: 'bg-gradient-to-r from-emerald-300 via-green-400 to-lime-400 bg-clip-text text-transparent' },
];

export function BlackjackMultiRoundOverlays({
  showWin,
  onWinComplete,
  showBlackjackText,
  blackjackAnimKey,
  blackjackColorIndex,
}: {
  showWin: { amount: bigint; isBlackjack: boolean } | null;
  onWinComplete: () => void;
  showBlackjackText: boolean;
  blackjackAnimKey: number;
  blackjackColorIndex: number;
}) {
  return (
    <>
      {showWin && (
        <WinNotification
          amount={showWin.amount}
          isBlackjack={showWin.isBlackjack}
          onComplete={onWinComplete}
        />
      )}

      {showBlackjackText && (
        <div className="absolute inset-0 z-[35] flex items-center justify-center pointer-events-none blackjack-text-enter">
          <div className="px-8 py-4 sm:px-12 sm:py-5 rounded-2xl glass-distort-panel">
            <div style={{ fontFamily: '"Orbitron", sans-serif' }}>
              <EncryptedText
                key={blackjackAnimKey}
                text="BLACKJACK"
                revealDelayMs={100}
                flipDelayMs={35}
                className="text-4xl sm:text-5xl md:text-6xl font-black tracking-wider"
                encryptedClassName={BLACKJACK_COLOR_PALETTES[blackjackColorIndex]?.encrypted ?? BLACKJACK_COLOR_PALETTES[0].encrypted}
                revealedClassName={BLACKJACK_COLOR_PALETTES[blackjackColorIndex]?.revealed ?? BLACKJACK_COLOR_PALETTES[0].revealed}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
