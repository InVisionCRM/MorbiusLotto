/**
 * One-click FX styles for the sound designer.
 *
 * This is the interface the slot builder leads with — pick a named style, hear
 * it — and what the knob modules exist to fine-tune afterwards. Each preset is
 * an ABSOLUTE setting of the whole chain (built on FX_DEFAULT), not a delta on
 * top of whatever was there, so clicking a chip always lands on the same sound.
 * The event's sample is deliberately not part of a style: a style re-voices how
 * a clip sits in the room, never which clip plays.
 */

import { FX_DEFAULT, type SoundFx } from '@/lib/blackjack-sound-fx';

export interface SoundFxPreset {
  id: string;
  label: string;
  hint: string;
  /** Fields to lay over FX_DEFAULT. Never includes `sample`. */
  patch: Partial<Omit<SoundFx, 'sample'>>;
}

export const SOUND_FX_PRESETS: SoundFxPreset[] = [
  { id: 'dry', label: 'Dry', hint: 'Stock — no effects', patch: {} },
  {
    id: 'big-room',
    label: 'Big room',
    hint: 'A little hall around the sound',
    patch: { reverbMix: 0.35, reverbDecay: 2.2 },
  },
  {
    id: 'cavern',
    label: 'Cavern',
    hint: 'Long, dark tail',
    patch: { reverbMix: 0.6, reverbDecay: 3.5, volume: 0.9 },
  },
  {
    id: 'tight',
    label: 'Tight & punchy',
    hint: 'Clipped short, hits harder',
    patch: { envEnd: 0.55, pitch: 1.05, volume: 1.2 },
  },
  {
    id: 'slapback',
    label: 'Slapback',
    hint: 'One quick echo, vintage table feel',
    patch: { delayMix: 0.35, delayTime: 0.12, delayFeedback: 0.22 },
  },
  {
    id: 'echo-hall',
    label: 'Echo hall',
    hint: 'Repeats that bloom into reverb',
    patch: { delayMix: 0.45, delayTime: 0.3, delayFeedback: 0.55, reverbMix: 0.3, reverbDecay: 2.5 },
  },
  {
    id: 'across-room',
    label: 'Across the room',
    hint: 'Quieter, further away',
    patch: { volume: 0.65, reverbMix: 0.5, reverbDecay: 1.8 },
  },
  {
    id: 'deep',
    label: 'Deep',
    hint: 'Pitched down, heavier',
    patch: { pitch: 0.72, volume: 1.1 },
  },
  {
    id: 'chirpy',
    label: 'Chirpy',
    hint: 'Pitched up, cartoonish',
    patch: { pitch: 1.5 },
  },
];

/** The full FX a preset resolves to, keeping the event's own sample. */
export function fxFromPreset(preset: SoundFxPreset, currentSample: string | null): SoundFx {
  return { ...FX_DEFAULT, ...preset.patch, sample: currentSample };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Which preset (if any) the current FX exactly matches, sample aside. */
export function activeFxPresetId(fx: SoundFx): string | null {
  for (const preset of SOUND_FX_PRESETS) {
    const target = { ...FX_DEFAULT, ...preset.patch };
    const keys = Object.keys(FX_DEFAULT).filter((k) => k !== 'sample') as Array<
      keyof Omit<SoundFx, 'sample'>
    >;
    if (keys.every((k) => near(fx[k] as number, target[k] as number))) return preset.id;
  }
  return null;
}
