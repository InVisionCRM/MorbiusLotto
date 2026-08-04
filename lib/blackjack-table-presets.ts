/**
 * Whole-table presets — the "Preset: Deep Abyss" dropdown of the table
 * designer, mirroring the slot builder's top-bar presets.
 *
 * One click sets a complete personality: how cards fly in, how they're
 * collected, and how the whole table sounds. Like every other preset family
 * here, a table preset is ABSOLUTE — it lands on the same table every time,
 * it is not a delta on whatever was configured before. Uploaded clips and
 * seat positions are deliberately left alone: a preset re-voices and
 * re-animates the table, it doesn't throw away placement work or custom
 * sounds.
 */

import type { BlackjackTableLayout, DeepPartial } from '@/lib/blackjack-table-layout';
import { CLEAR_OUT_PRESETS, DEAL_IN_PRESETS } from '@/lib/blackjack-motion-presets';
import { SOUND_FX_PRESETS, type SoundFxPreset } from '@/lib/blackjack-sound-fx-presets';

const dealIn = (id: string) => {
  const p = DEAL_IN_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown deal-in preset: ${id}`);
  return { ...p.motion };
};
const clearOut = (id: string) => {
  const p = CLEAR_OUT_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown clear-out preset: ${id}`);
  return { ...p.motion };
};

export interface BlackjackTablePreset {
  id: string;
  label: string;
  hint: string;
  /** Laid over the shipped defaults (absolute, not over the current state). */
  layout: DeepPartial<BlackjackTableLayout>;
  /** Sound style applied to every event; id from SOUND_FX_PRESETS. */
  soundStyleId: string;
}

export const BLACKJACK_TABLE_PRESETS: BlackjackTablePreset[] = [
  {
    id: 'classic-felt',
    label: 'Classic Felt',
    hint: 'The stock table — quick deal from the shoe, dry sound',
    layout: {},
    soundStyleId: 'dry',
  },
  {
    id: 'high-roller',
    label: 'High Roller',
    hint: 'Unhurried luxe dealing in a big quiet room',
    layout: { motion: { dealIn: dealIn('slow-luxe'), clearOut: clearOut('to-shoe') } },
    soundStyleId: 'big-room',
  },
  {
    id: 'neon-arcade',
    label: 'Neon Arcade',
    hint: 'Snappy dealing, tight punchy sound',
    layout: { motion: { dealIn: dealIn('snap'), clearOut: clearOut('fling-right') } },
    soundStyleId: 'tight',
  },
  {
    id: 'midnight-cavern',
    label: 'Midnight Cavern',
    hint: 'Cards arc in; every sound trails a long dark echo',
    layout: { motion: { dealIn: dealIn('dealer-arc'), clearOut: clearOut('vanish') } },
    soundStyleId: 'cavern',
  },
  {
    id: 'vintage-pitch',
    label: 'Vintage Pitch',
    hint: 'Cards pitched flat across the felt, slapback echo',
    layout: { motion: { dealIn: dealIn('pitch-slide'), clearOut: clearOut('sweep-left') } },
    soundStyleId: 'slapback',
  },
];

export function tablePresetById(id: string): BlackjackTablePreset | null {
  return BLACKJACK_TABLE_PRESETS.find((p) => p.id === id) ?? null;
}

export function soundStyleForTablePreset(preset: BlackjackTablePreset): SoundFxPreset {
  return SOUND_FX_PRESETS.find((s) => s.id === preset.soundStyleId) ?? SOUND_FX_PRESETS[0];
}
