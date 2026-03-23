import type { AvatarConfig } from '@/lib/websocket-client';

/** Session key — which avatar fields stay fixed when using Randomize (browser-only). */
export const AVATAR_RANDOMIZE_FIELD_PINS_KEY = 'morblotto_avatar_randomize_field_pins';

/** Every string field Randomize overwrites — pinning copies the current value from the live config. */
export const AVATAR_RANDOMIZE_FIELD_KEYS = [
  'skinColor',
  'hairStyle',
  'hairColor',
  'accessoryColor',
  'eyeShape',
  'eyeColor',
  'lipShape',
  'accessory',
  'faceShape',
  'shirtColor',
  'shirtStyle',
  'hat',
  'hatColor',
  'necklace',
  'mouthAccessory',
  'makeup',
  'facialHair',
  'backgroundImage',
  'overlayImage',
  'customPattern',
] as const satisfies readonly (keyof AvatarConfig)[];

export type AvatarRandomizeFieldKey = (typeof AVATAR_RANDOMIZE_FIELD_KEYS)[number];

const ALLOWED = new Set<string>(AVATAR_RANDOMIZE_FIELD_KEYS as unknown as string[]);

export function readRandomizeFieldPinsFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(AVATAR_RANDOMIZE_FIELD_PINS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string' && ALLOWED.has(x)));
  } catch {
    return new Set();
  }
}
