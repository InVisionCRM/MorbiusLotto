'use client';

import React from 'react';

function formatChips(n: number): string {
  return n.toLocaleString();
}

export interface TournamentBlindIncreaseOverlayProps {
  /** Bump to replay animation for a new event. */
  playId: number;
  newLevel: number;
  smallBlind: number;
  bigBlind: number;
  /** Fires once when the CSS animation finishes (opacity back to 0). */
  onAnimationEnd: () => void;
}

/**
 * Full-viewport, pointer-events-none: large white type, no panel background.
 * Fades in, holds, then slowly fades out; clicks/actions pass through.
 */
export function TournamentBlindIncreaseOverlay({
  playId,
  newLevel,
  smallBlind,
  bigBlind,
  onAnimationEnd,
}: TournamentBlindIncreaseOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <div
        key={playId}
        className="poker-tournament-blind-banner-anim text-center px-6 max-w-[min(92vw,36rem)]"
        onAnimationEnd={onAnimationEnd}
      >
        <p
          className="text-white font-semibold tracking-tight leading-tight m-0"
          style={{
            fontSize: 'clamp(2.25rem, 7vw, 4rem)',
            textShadow: '0 2px 28px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
          }}
        >
          {formatChips(smallBlind)} / {formatChips(bigBlind)}
        </p>
        <p
          className="text-white/95 font-medium tracking-wide mt-3 m-0"
          style={{
            fontSize: 'clamp(1.1rem, 3.2vw, 1.65rem)',
            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
          }}
        >
          Blinds up · Level {newLevel}
        </p>
      </div>
    </div>
  );
}
