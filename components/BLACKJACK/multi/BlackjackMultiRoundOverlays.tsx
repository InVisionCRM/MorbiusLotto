'use client';

/**
 * BlackjackMultiRoundOverlays — the settlement moment on the multiplayer felt.
 *
 * This used to be a small corner toast (WinNotification) plus an EncryptedText
 * glass panel for blackjacks — visuals that predate the app-wide win system.
 * It is now the same celebration the other felts use: the 3D extruded
 * TableWinText word landing centre-table, arrival animation and display face
 * randomized per round, with the paid amount under it. The confetti and tiered
 * audio fire from the page at the same moment (celebrateWin), exactly like the
 * arcade felts.
 *
 * Losses and pushes get the word too — "DEALER WINS" in rose, "PUSH" in cyan —
 * because a settlement that just quietly ends reads as a stall on a table where
 * everyone settles together. Only wins get an amount line and confetti.
 */

import { useEffect, useMemo } from 'react';
import { formatEther } from 'viem';

import {
  TableWinText,
  WIN_TEXT_VARIANTS,
  winTextForTier,
  type WinTextFont,
  type WinTextPalette,
  type WinTextVariant,
} from '@/components/shared/TableWinText';
import type { WinTier } from '@/components/shared/TableWinFx';

/** How long the word holds the table before clearing itself. */
export const MULTI_ROUND_CELEBRATION_MS = 2600;

export interface MultiRoundCelebration {
  /** Graded from what the seat committed vs what came back. */
  tier: WinTier;
  /** True when one of the seat's hands was a natural. */
  blackjack: boolean;
  /** True when every hand lost to a dealer natural — names the word. */
  dealerBlackjack: boolean;
  /** Total returned to the seat, wei. Only shown when it beats the stake. */
  payoutWei: bigint;
  /** Per-round value — drives the randomized arrival, font, and replay. */
  seed: number;
}

/** Deterministic per-seed pick, offset so variant and font don't pair up. */
function pick<T>(list: readonly T[], seed: number, salt: number): T {
  const n = Math.abs(Math.imul((seed + salt) ^ 0x9e3779b9, 2654435761)) % list.length;
  return list[n];
}

const WIN_FONTS: readonly WinTextFont[] = ['titan', 'bangers', 'lilita', 'bungee', 'bowlby', 'shrikhand'];

function celebrationLook(c: MultiRoundCelebration): {
  text: string;
  variant: WinTextVariant;
  font: WinTextFont;
  palette: WinTextPalette;
  shockwave: boolean;
} {
  const font = pick(WIN_FONTS, c.seed, 7);
  if (c.tier === 'small' || c.tier === 'big' || c.tier === 'huge') {
    // Blackjack names itself; anything else uses the shared tier wording.
    const base = winTextForTier(c.tier, c.seed);
    return {
      text: c.blackjack ? 'BLACKJACK' : base.text,
      variant: base.variant,
      font,
      palette: 'gold',
      shockwave: c.blackjack || base.shockwave,
    };
  }
  const variant = pick(WIN_TEXT_VARIANTS, c.seed, 3);
  if (c.tier === 'push') {
    return { text: 'PUSH', variant, font, palette: 'cyan', shockwave: false };
  }
  return {
    text: c.dealerBlackjack ? 'DEALER BLACKJACK' : 'DEALER WINS',
    variant,
    font,
    palette: 'rose',
    shockwave: false,
  };
}

export function BlackjackMultiRoundOverlays({
  celebration,
  onDone,
}: {
  celebration: MultiRoundCelebration | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!celebration) return;
    const id = setTimeout(onDone, MULTI_ROUND_CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [celebration, onDone]);

  const look = useMemo(() => (celebration ? celebrationLook(celebration) : null), [celebration]);
  if (!celebration || !look) return null;

  const won = celebration.tier === 'small' || celebration.tier === 'big' || celebration.tier === 'huge';
  const amount = won ? Math.floor(Number(formatEther(celebration.payoutWei))) : 0;

  return (
    <div
      className="absolute inset-0 z-[35] grid place-items-center px-4 pointer-events-none"
      aria-live="polite"
    >
      <div className="text-center">
        <TableWinText
          text={look.text}
          variant={look.variant}
          font={look.font}
          palette={look.palette}
          shockwave={look.shockwave}
          replayKey={celebration.seed}
          size={
            celebration.tier === 'huge' || celebration.blackjack
              ? 'clamp(34px, 8.5vw, 76px)'
              : 'clamp(26px, 6.5vw, 56px)'
          }
        />
        {won && amount > 0 && (
          <div
            className="mt-1 font-bold text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
            style={{ fontSize: 'clamp(14px,3.5vw,22px)' }}
          >
            +{amount.toLocaleString()} MORBIUS
          </div>
        )}
      </div>
    </div>
  );
}
