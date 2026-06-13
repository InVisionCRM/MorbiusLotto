// Craps chip colours — one distinct tier per denomination so the rail and the
// felt read at a glance. The shared BetChip amount-tiering lumps everything ≤25
// into a single white chip, which collapses 1 / 5 / 25 into the same colour.
// Felt totals colour by the highest denomination they contain, so a stack stays
// consistent with the rail chip the player picked (a 50 reads as the green 25).

import type { ChipTier } from '@/components/ui/BetChip';
import { CRAPS_CHIP_LADDER } from '@/lib/craps-types';

const WHITE: ChipTier = { c: '#eef2f7', e: '#9aa7b4', t: '#1f2937' };
const RED: ChipTier = { c: '#ef4444', e: '#7f1d1d', t: '#ffffff' };
const GREEN: ChipTier = { c: '#22c55e', e: '#14532d', t: '#ffffff' };
const BLUE: ChipTier = { c: '#3b82f6', e: '#1e3a8a', t: '#ffffff' };
const PURPLE: ChipTier = { c: '#a855f7', e: '#4c1d95', t: '#ffffff' };

// Ladder is [1, 5, 25, 100, 1000]; map each rung to a casino colour, brightest
// money last. Ordered high → low for the "highest denomination ≤ amount" lookup.
const DENOM_TIERS: { min: number; tier: ChipTier }[] = [
  { min: CRAPS_CHIP_LADDER[4], tier: PURPLE }, // 1000
  { min: CRAPS_CHIP_LADDER[3], tier: BLUE },   // 100
  { min: CRAPS_CHIP_LADDER[2], tier: GREEN },  // 25
  { min: CRAPS_CHIP_LADDER[1], tier: RED },    // 5
  { min: CRAPS_CHIP_LADDER[0], tier: WHITE },  // 1
];

/**
 * Colour for a craps chip of `amount` — exact for a rail denomination, or the
 * highest denomination it contains for a felt total.
 */
export function crapsChipTier(amount: number): ChipTier {
  const a = Math.abs(amount);
  for (const { min, tier } of DENOM_TIERS) if (a >= min) return tier;
  return WHITE;
}
