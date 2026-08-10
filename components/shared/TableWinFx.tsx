'use client';

/**
 * TableWinFx — one settlement moment, scaled to what the hand was actually worth.
 *
 * Every house-banked felt used to carry its own copy of the same eleven lines:
 * a flat 110-particle confetti burst fired on `net > 0`. A hand that scraped a
 * win back off a push and a straight flush got the identical celebration, which
 * is the fastest way to make a big hand feel like nothing. This is the shared
 * replacement, and it grades the response by how much the hand actually paid.
 *
 * Tiers are on PROFIT, not on the returned total — a blackjack win returns 2x
 * the stake but only profits 1x, and treating that as a big win would fire the
 * cannons on roughly half of all hands. The `huge` threshold is set where the
 * felts already drew the line for playBigWin (a hand returning five times the
 * stake, i.e. four times profit), so nothing that used to feel big got smaller.
 *
 * Confetti is suppressed under prefers-reduced-motion; the sound and the glow
 * still play, so the result is never silent or invisible, it just doesn't throw
 * anything across the screen.
 */

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';

import { tableAudio } from '@/lib/table-audio';

export type WinTier = 'loss' | 'push' | 'small' | 'big' | 'huge';

/** Profit multiples at which the response steps up. */
const BIG_AT = 1.5;
const HUGE_AT = 4;

const GOLD = '#FCD34D';
const CYAN = '#22D3EE';

/**
 * Grade a settled hand.
 *
 * `committed` is everything the player put at risk, `payout` everything that
 * came back — so a push is payout === committed, and profit is the difference.
 */
export function winTierFor(committed: number, payout: number): WinTier {
  const net = payout - committed;
  if (net < 0) return 'loss';
  if (net === 0) return 'push';
  // A free hand that somehow paid (nothing at risk) still deserves the top cue
  // rather than a divide by zero.
  if (committed <= 0) return 'huge';
  const profitMultiple = net / committed;
  if (profitMultiple >= HUGE_AT) return 'huge';
  if (profitMultiple >= BIG_AT) return 'big';
  return 'small';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The settlement sound for a tier, plus the side-bet cue layered behind it.
 *
 * All three win tiers now sound different. They used not to: `big` fell through
 * to the same triad as `small`, so the visuals graded a win three ways while the
 * audio graded it two, and a big win announced itself as an ordinary one.
 */
export function playWinTier(tier: WinTier, opts: { bonus?: boolean } = {}): void {
  switch (tier) {
    case 'loss':
      tableAudio.playLose();
      break;
    case 'push':
      tableAudio.playPush();
      break;
    case 'huge':
      tableAudio.playHugeWin();
      break;
    case 'big':
      tableAudio.playBigWin();
      break;
    default:
      tableAudio.playWin();
  }
  if (opts.bonus) setTimeout(() => tableAudio.playBonus(), 260);
}

/**
 * The particles. `small` gets none on purpose — an ordinary win is carried by
 * the glow and the banner, and saving the confetti is what lets it mean
 * something when it does fire.
 */
export function fireWinConfetti(tier: WinTier): void {
  if (tier !== 'big' && tier !== 'huge') return;
  if (prefersReducedMotion()) return;

  if (tier === 'big') {
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.5 },
      colors: [CYAN, GOLD, '#ffffff'],
      disableForReducedMotion: true,
    });
    return;
  }

  // Huge: a burst up the middle, then the two side cannons a beat later so it
  // reads as an event unfolding rather than one large puff.
  confetti({
    particleCount: 150,
    spread: 90,
    startVelocity: 48,
    origin: { y: 0.52 },
    colors: [GOLD, CYAN, '#ffffff', '#fb7185'],
    disableForReducedMotion: true,
  });
  setTimeout(() => {
    confetti({
      particleCount: 70,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors: [GOLD, '#ffffff'],
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 70,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors: [GOLD, '#ffffff'],
      disableForReducedMotion: true,
    });
  }, 220);
}

/** Sound and particles together — what a felt calls once, on settle. */
export function celebrateWin(tier: WinTier, opts: { bonus?: boolean } = {}): void {
  playWinTier(tier, opts);
  fireWinConfetti(tier);
}

/**
 * The felt's own reaction, sitting behind the result banner: a pulse of light
 * up out of the table. Small wins get a brief cyan lift, big and huge get gold
 * that lingers, and huge adds a sweep across the felt.
 *
 * Keyed by `round` so a second win in a row replays rather than sitting there
 * already faded — without it the animation only ever runs once per mount.
 */
export function TableWinGlow({ tier, round }: { tier: WinTier | null; round?: string | number }) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (tier === 'small' || tier === 'big' || tier === 'huge') setPulse((n) => n + 1);
  }, [tier, round]);

  if (tier !== 'small' && tier !== 'big' && tier !== 'huge') return null;

  const colour = tier === 'small' ? 'rgba(34,211,238,.30)' : 'rgba(251,191,36,.38)';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        key={`glow-${pulse}`}
        className={tier === 'small' ? 'tbl-win-glow tbl-win-glow-soft' : 'tbl-win-glow'}
        style={{ background: `radial-gradient(ellipse at 50% 62%, ${colour}, transparent 62%)` }}
      />
      {tier === 'huge' && <div key={`sweep-${pulse}`} className="tbl-win-sweep" />}
    </div>
  );
}

/** Mounted once per felt, next to <TableCardStyles />. */
export function TableWinFxStyles() {
  return (
    <style jsx global>{`
      .tbl-win-glow {
        position: absolute;
        inset: 0;
        opacity: 0;
        animation: tbl-win-glow 1.5s cubic-bezier(0.2, 0.8, 0.3, 1) both;
      }
      .tbl-win-glow-soft {
        animation-duration: 0.95s;
      }
      @keyframes tbl-win-glow {
        0% {
          opacity: 0;
          transform: scale(0.9);
        }
        22% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(1.04);
        }
      }

      .tbl-win-sweep {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          105deg,
          transparent 38%,
          rgba(255, 245, 205, 0.22) 50%,
          transparent 62%
        );
        transform: translateX(-100%);
        animation: tbl-win-sweep 1.05s cubic-bezier(0.3, 0.7, 0.3, 1) 0.12s both;
      }
      @keyframes tbl-win-sweep {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      /* Less motion still gets the light, it just doesn't travel or breathe. */
      @media (prefers-reduced-motion: reduce) {
        .tbl-win-glow {
          animation: tbl-win-fade 1.1s linear both;
          transform: none;
        }
        .tbl-win-sweep {
          display: none;
        }
        @keyframes tbl-win-fade {
          0%,
          30% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      }
    `}</style>
  );
}
