'use client';

/**
 * WinTextOverlay — the app-wide win word, centre screen.
 *
 * Mounted once by BigWinProvider, which already hears every game's settle
 * through reportWin. That means roughly twenty games get the word without
 * touching any of them; the felts that render it anchored in their own table
 * opt out at the callsite instead.
 *
 * THE WHOLE VISUAL CELEBRATION lives here — word and confetti together, tiered
 * by fireWinConfetti. It began as word-only because every game still threw its
 * own confetti, and two of them stacked on one win read as a bug rather than a
 * bigger moment. Those per-game bursts have since been removed, so this is now
 * the single place a win is celebrated, and the only place to change how one
 * looks.
 *
 * Sound stays the game's own. Each felt has its own audio character and there
 * was never a duplication problem there — only the animations doubled up.
 *
 * It sits below the share toast (z-9999): the toast is an action the player
 * can take and has to stay reachable, while this is a two-second flourish that
 * never accepts a click.
 */

import { useEffect } from 'react';

import { TableWinText, winTextForTier } from '@/components/shared/TableWinText';
import { fireWinConfetti } from '@/components/shared/TableWinFx';

/** How long the word stays before it clears itself. */
export const WIN_TEXT_OVERLAY_MS = 2600;

export interface WinTextOverlayProps {
  tier: 'big' | 'huge';
  /** Picks the arrival — a per-win value keeps consecutive wins from matching. */
  seed: string | number;
  /** What the round returned as a multiple of the stake. */
  multiplier: number;
  onDone: () => void;
}

export function WinTextOverlay({ tier, seed, multiplier, onDone }: WinTextOverlayProps) {
  useEffect(() => {
    // Keyed on seed as well, so a second win throws its own burst rather than
    // riding the first one's.
    fireWinConfetti(tier);
    const id = setTimeout(onDone, WIN_TEXT_OVERLAY_MS);
    return () => clearTimeout(id);
  }, [onDone, seed, tier]);

  const { text, variant, shockwave } = winTextForTier(tier, seed);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998] grid place-items-center px-4"
      aria-live="polite"
    >
      <div className="text-center">
        <TableWinText
          text={text}
          variant={variant}
          shockwave={shockwave}
          palette="gold"
          replayKey={seed}
          size={tier === 'huge' ? 'clamp(40px, 13vw, 92px)' : 'clamp(34px, 10vw, 70px)'}
        />
        {/* A multiple travels across every game; an amount would have to know
            each game's stake units to mean anything. */}
        <div
          className="mt-1 font-bold text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
          style={{ fontSize: 'clamp(16px,4.5vw,26px)' }}
        >
          ×{multiplier >= 100 ? Math.round(multiplier) : multiplier.toFixed(2).replace(/\.?0+$/, '')}
        </div>
      </div>
    </div>
  );
}
