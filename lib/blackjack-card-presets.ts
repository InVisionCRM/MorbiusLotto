/**
 * Named styles for the designer's Cards step: how card hands sit on the table
 * art, and how the cards themselves are dressed.
 *
 * Angle presets exist because table art is rarely a perfect top-down view —
 * most branded tables are painted in perspective. Leaning the dealer's and
 * players' hands to match the drawing keeps the cards looking like they lie on
 * the felt instead of floating over it. Dealer and player lean differ within a
 * preset: the dealer's hand is deeper into the scene, so it leans less.
 *
 * Effect presets are absolute shadow/glow treatments for every card. Both
 * families follow the house preset rule: a preset is a complete named setting,
 * and sliders exist only to fine-tune one.
 */

import { DEFAULT_BLACKJACK_TABLE_LAYOUT } from '@/lib/blackjack-table-layout';

export interface CardAnglePreset {
  id: string;
  label: string;
  hint: string;
  pitch: { dealer: number; player: number };
}

export const CARD_ANGLE_PRESETS: CardAnglePreset[] = [
  {
    id: 'flat',
    label: 'Straight down',
    hint: 'Stock — cards face the screen, for top-down table art',
    pitch: { ...DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.pitch },
  },
  {
    id: 'gentle',
    label: 'Gentle lean',
    hint: 'A hint of perspective, for slightly angled art',
    pitch: { dealer: 10, player: 16 },
  },
  {
    id: 'table-view',
    label: 'Table view',
    hint: 'Sitting-at-the-table perspective',
    pitch: { dealer: 20, player: 30 },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    hint: 'Steep, dramatic lean for low-angle art',
    pitch: { dealer: 30, player: 44 },
  },
  {
    id: 'flat-on-table',
    label: 'Flat on the table',
    hint: 'Cards lie down — for art viewed nearly edge-on',
    pitch: { dealer: 48, player: 64 },
  },
];

export function activeCardAnglePresetId(pitch: { dealer: number; player: number }): string | null {
  for (const p of CARD_ANGLE_PRESETS) {
    if (Math.abs(p.pitch.dealer - pitch.dealer) < 0.01 && Math.abs(p.pitch.player - pitch.player) < 0.01)
      return p.id;
  }
  return null;
}

export interface CardFxPreset {
  id: string;
  label: string;
  hint: string;
  restShadow: string;
  hoverShadow: string;
}

export const CARD_FX_PRESETS: CardFxPreset[] = [
  {
    id: 'classic',
    label: 'Classic shadow',
    hint: 'Stock — a soft drop shadow',
    restShadow: DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.restShadow,
    hoverShadow: DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.hoverShadow,
  },
  {
    id: 'floating',
    label: 'Floating',
    hint: 'Deep shadow, cards hover over the felt',
    restShadow: '0 12px 22px rgba(0, 0, 0, 0.55)',
    hoverShadow: '0 18px 30px rgba(0, 0, 0, 0.65)',
  },
  {
    id: 'neon',
    label: 'Neon glow',
    hint: 'Cyan aura around every card',
    restShadow: '0 0 14px 2px rgba(34, 211, 238, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4)',
    hoverShadow: '0 0 22px 4px rgba(34, 211, 238, 0.9), 0 4px 10px rgba(0, 0, 0, 0.5)',
  },
  {
    id: 'gold',
    label: 'Gold edge',
    hint: 'Gilded ring with a warm glow',
    restShadow: '0 0 0 2px rgba(245, 158, 11, 0.85), 0 0 14px rgba(245, 158, 11, 0.4), 0 2px 5px rgba(0, 0, 0, 0.35)',
    hoverShadow:
      '0 0 0 2px rgba(245, 158, 11, 1), 0 0 22px rgba(245, 158, 11, 0.6), 0 4px 9px rgba(0, 0, 0, 0.45)',
  },
  {
    id: 'crimson',
    label: 'Crimson glow',
    hint: 'Hot red aura, villain table energy',
    restShadow: '0 0 14px 3px rgba(244, 63, 94, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)',
    hoverShadow: '0 0 22px 5px rgba(244, 63, 94, 0.85), 0 4px 10px rgba(0, 0, 0, 0.5)',
  },
  {
    id: 'emerald',
    label: 'Emerald glow',
    hint: 'Green felt-light seeping around the cards',
    restShadow: '0 0 14px 2px rgba(52, 211, 153, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
    hoverShadow: '0 0 22px 4px rgba(52, 211, 153, 0.8), 0 4px 10px rgba(0, 0, 0, 0.5)',
  },
  {
    id: 'none',
    label: 'No shadow',
    hint: 'Flat print — cards blend into the art',
    restShadow: 'none',
    hoverShadow: 'none',
  },
];

export function activeCardFxPresetId(restShadow: string): string | null {
  return CARD_FX_PRESETS.find((p) => p.restShadow === restShadow)?.id ?? null;
}
