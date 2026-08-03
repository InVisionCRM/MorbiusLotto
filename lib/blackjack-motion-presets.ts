/**
 * Named animation styles for the table designer's Motion tab.
 *
 * Same philosophy as the sound FX presets: a preset is an ABSOLUTE, named
 * setting of the whole motion block, chosen by feel — the knobs underneath
 * exist to fine-tune one, not to be the way in. The deal-in names echo the
 * single-player bet-tier animations (Dealer Arc, Pitch Slide) so the two
 * games' vocabularies match.
 */

import type { ClearOutMotion, DealInMotion } from '@/lib/blackjack-table-layout';
import { DEFAULT_BLACKJACK_TABLE_LAYOUT } from '@/lib/blackjack-table-layout';

export interface DealInPreset {
  id: string;
  label: string;
  hint: string;
  motion: DealInMotion;
}

export interface ClearOutPreset {
  id: string;
  label: string;
  hint: string;
  motion: ClearOutMotion;
}

export const DEAL_IN_PRESETS: DealInPreset[] = [
  {
    id: 'shoe',
    label: 'From the shoe',
    hint: 'Stock — quick slide in from the dealer’s right',
    motion: { ...DEFAULT_BLACKJACK_TABLE_LAYOUT.motion.dealIn },
  },
  {
    id: 'dealer-arc',
    label: 'Dealer arc',
    hint: 'Sweeps in with a settle, like a pitched card',
    motion: {
      fromX: 220,
      fromY: -140,
      fromRot: -18,
      fromScale: 0.85,
      durationMs: 700,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      staggerMs: 220,
    },
  },
  {
    id: 'pitch-slide',
    label: 'Pitch slide',
    hint: 'Flat and low across the felt',
    motion: {
      fromX: 340,
      fromY: 0,
      fromRot: -4,
      fromScale: 1,
      durationMs: 450,
      easing: 'ease-out',
      staggerMs: 150,
    },
  },
  {
    id: 'sky-drop',
    label: 'Sky drop',
    hint: 'Falls onto the table from above',
    motion: {
      fromX: 0,
      fromY: -260,
      fromRot: 8,
      fromScale: 0.8,
      durationMs: 650,
      easing: 'cubic-bezier(0.34, 1.3, 0.45, 1)',
      staggerMs: 200,
    },
  },
  {
    id: 'snap',
    label: 'Snap deal',
    hint: 'Fast and businesslike',
    motion: {
      fromX: 60,
      fromY: -40,
      fromRot: 0,
      fromScale: 1,
      durationMs: 220,
      easing: 'ease-out',
      staggerMs: 90,
    },
  },
  {
    id: 'slow-luxe',
    label: 'Slow luxe',
    hint: 'Unhurried, high-roller pacing',
    motion: {
      fromX: 140,
      fromY: -100,
      fromRot: -8,
      fromScale: 0.92,
      durationMs: 950,
      easing: 'ease-in-out',
      staggerMs: 340,
    },
  },
];

export const CLEAR_OUT_PRESETS: ClearOutPreset[] = [
  {
    id: 'to-shoe',
    label: 'To the discard',
    hint: 'Stock — swept up and away to the left',
    motion: { ...DEFAULT_BLACKJACK_TABLE_LAYOUT.motion.clearOut },
  },
  {
    id: 'fling-right',
    label: 'Fling right',
    hint: 'Tossed off the right edge',
    motion: {
      toX: 320,
      toY: -60,
      scale: 0.7,
      durationMs: 380,
      easing: 'ease-in',
      dealerStaggerMs: 90,
      playerStaggerMs: 90,
    },
  },
  {
    id: 'drop-off',
    label: 'Drop off',
    hint: 'Falls off the front of the table',
    motion: {
      toX: 0,
      toY: 240,
      scale: 0.8,
      durationMs: 420,
      easing: 'ease-in',
      dealerStaggerMs: 110,
      playerStaggerMs: 110,
    },
  },
  {
    id: 'vanish',
    label: 'Vanish',
    hint: 'Shrinks away in place',
    motion: {
      toX: 0,
      toY: 0,
      scale: 0.25,
      durationMs: 260,
      easing: 'ease-in',
      dealerStaggerMs: 70,
      playerStaggerMs: 70,
    },
  },
  {
    id: 'sweep-left',
    label: 'Sweep left',
    hint: 'Dragged off the left edge, flat',
    motion: {
      toX: -320,
      toY: -40,
      scale: 0.75,
      durationMs: 400,
      easing: 'ease-in',
      dealerStaggerMs: 100,
      playerStaggerMs: 100,
    },
  },
];

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function activeDealInPresetId(m: DealInMotion): string | null {
  for (const p of DEAL_IN_PRESETS) {
    const t = p.motion;
    if (
      near(m.fromX, t.fromX) &&
      near(m.fromY, t.fromY) &&
      near(m.fromRot, t.fromRot) &&
      near(m.fromScale, t.fromScale) &&
      near(m.durationMs, t.durationMs) &&
      near(m.staggerMs, t.staggerMs) &&
      m.easing === t.easing
    )
      return p.id;
  }
  return null;
}

export function activeClearOutPresetId(m: ClearOutMotion): string | null {
  for (const p of CLEAR_OUT_PRESETS) {
    const t = p.motion;
    if (
      near(m.toX, t.toX) &&
      near(m.toY, t.toY) &&
      near(m.scale, t.scale) &&
      near(m.durationMs, t.durationMs) &&
      near(m.dealerStaggerMs, t.dealerStaggerMs) &&
      near(m.playerStaggerMs, t.playerStaggerMs) &&
      m.easing === t.easing
    )
      return p.id;
  }
  return null;
}
