/**
 * Morbius avatar payload: classic v1 procedural SVG (`AvatarPreview`).
 * Stored in `chat_display_names.avatar_config` as JSONB.
 *
 * Legacy `{ version: 2, layers }` rows are coerced to v1 defaults at parse time (no DB migration).
 */

import { PICKER_HAT_COLORS } from './avatar-editor-options';

function normalizeHatColor(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return PICKER_HAT_COLORS.find(c => c.toLowerCase() === t.toLowerCase()) ?? '';
}

/** v1 procedural avatar (SVG renderer). */
export interface AvatarConfig {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  accessoryColor?: string;
  eyeShape: string;
  eyeColor: string;
  noseShape: string;
  lipShape: string;
  accessory: string;
  shirtColor: string;
  shirtStyle: string;
  hat: string;
  hatColor: string;
  necklace: string;
  mouthAccessory: string;
  /** Cosmetic overlay: blush, contour, freckles, etc. */
  makeup: string;
  /** Beard, mustache, stubble — uses hair color fill. */
  facialHair: string;
  backgroundImage: string;
  overlayImage: string;
  faceShape: string;
  customPattern: string;
  customMouthFeatureId?: string;
  customNoseFeatureId?: string;
  customHairFeatureId?: string;
}

/** Alias for stored/parsed avatar — v1 only; kept for call-site clarity. */
export type AvatarPayload = AvatarConfig;

export const AVATAR_V1_DEFAULTS: AvatarConfig = {
  skinColor: '#F1C27D',
  hairStyle: 'Short',
  hairColor: '#3B3024',
  accessoryColor: '#111111',
  eyeShape: 'Almond',
  eyeColor: '#5c4033',
  noseShape: 'Small',
  lipShape: 'Smile',
  accessory: 'None',
  shirtColor: '#3f3f46',
  shirtStyle: 'Default',
  hat: 'None',
  hatColor: '',
  necklace: 'None',
  mouthAccessory: 'None',
  makeup: 'None',
  facialHair: 'None',
  backgroundImage: '',
  overlayImage: '',
  faceShape: 'Square',
  customPattern: '',
  customMouthFeatureId: '',
  customNoseFeatureId: '',
  customHairFeatureId: '',
};

/** Stored layered avatar JSON (removed feature) — detect and fall back to v1 defaults. */
export function isLegacyV2AvatarJson(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    o.version === 2 &&
    o.layers != null &&
    typeof o.layers === 'object' &&
    !Array.isArray(o.layers)
  );
}

/** Eye variants removed from the picker/renderer — map stored JSON to a supported shape. */
const REMOVED_EYE_SHAPES = new Set(['Eye V2', 'Eye V5', 'Eye V6', 'Eye V7', 'Eye V8', 'Eye V9', 'Eye V10']);

/** Hair styles removed from the picker — no SVG path in `AvatarPreview`; map to a supported style. */
const REMOVED_HAIR_STYLES = new Set(['Braids']);

/** Accessories removed from the picker — map stored JSON to a supported option. */
const REMOVED_ACCESSORY_MAP: Record<string, string> = {
  Wayfarers: 'Sunglasses',
  'Round Glasses': 'Glasses',
};

/** Hat variants removed from picker/renderer — map stored JSON to a supported hat. */
const REMOVED_HAT_MAP: Record<string, string> = {
  'Hat V6': 'Hat V5',
  'Hat V9': 'Hat V8',
};

/** Necklaces removed from picker/renderer — map stored JSON to a supported option. */
const REMOVED_NECKLACE_MAP: Record<string, string> = {
  Pearl: 'Gold Chain',
  Pendant: 'Gold Chain',
};

/** Merge partial v1 fields onto defaults (used for chat and legacy payloads). */
export function mergeV1AvatarPartial(raw: unknown): AvatarConfig {
  if (raw == null || typeof raw !== 'object' || isLegacyV2AvatarJson(raw)) {
    return { ...AVATAR_V1_DEFAULTS };
  }
  const o = raw as Record<string, unknown>;
  const str = (k: keyof AvatarConfig, d: string) =>
    typeof o[k] === 'string' ? (o[k] as string) : d;
  let eyeShape = str('eyeShape', AVATAR_V1_DEFAULTS.eyeShape);
  if (REMOVED_EYE_SHAPES.has(eyeShape)) eyeShape = 'Round';
  let hairStyle = str('hairStyle', AVATAR_V1_DEFAULTS.hairStyle);
  if (REMOVED_HAIR_STYLES.has(hairStyle)) hairStyle = AVATAR_V1_DEFAULTS.hairStyle;
  let accessory = str('accessory', AVATAR_V1_DEFAULTS.accessory);
  const mappedAcc = REMOVED_ACCESSORY_MAP[accessory];
  if (mappedAcc) accessory = mappedAcc;
  let hat = str('hat', AVATAR_V1_DEFAULTS.hat);
  const mappedHat = REMOVED_HAT_MAP[hat];
  if (mappedHat) hat = mappedHat;
  let necklace = str('necklace', AVATAR_V1_DEFAULTS.necklace);
  const mappedNeck = REMOVED_NECKLACE_MAP[necklace];
  if (mappedNeck) necklace = mappedNeck;
  let lipShape = str('lipShape', AVATAR_V1_DEFAULTS.lipShape);
  if (lipShape === 'Full') lipShape = 'Thin';
  if (lipShape === 'Smirk') lipShape = 'Smile';
  return {
    skinColor: str('skinColor', AVATAR_V1_DEFAULTS.skinColor),
    hairStyle,
    hairColor: str('hairColor', AVATAR_V1_DEFAULTS.hairColor),
    accessoryColor: str('accessoryColor', AVATAR_V1_DEFAULTS.accessoryColor ?? '#111111'),
    eyeShape,
    eyeColor: str('eyeColor', AVATAR_V1_DEFAULTS.eyeColor),
    noseShape: 'Small',
    lipShape,
    accessory,
    shirtColor: str('shirtColor', AVATAR_V1_DEFAULTS.shirtColor),
    shirtStyle: str('shirtStyle', AVATAR_V1_DEFAULTS.shirtStyle),
    hat,
    hatColor: normalizeHatColor(str('hatColor', AVATAR_V1_DEFAULTS.hatColor)),
    necklace,
    mouthAccessory: str('mouthAccessory', AVATAR_V1_DEFAULTS.mouthAccessory),
    makeup: str('makeup', AVATAR_V1_DEFAULTS.makeup),
    facialHair: str('facialHair', AVATAR_V1_DEFAULTS.facialHair),
    backgroundImage: str('backgroundImage', AVATAR_V1_DEFAULTS.backgroundImage),
    overlayImage: str('overlayImage', AVATAR_V1_DEFAULTS.overlayImage),
    faceShape: str('faceShape', AVATAR_V1_DEFAULTS.faceShape),
    customPattern: str('customPattern', AVATAR_V1_DEFAULTS.customPattern),
    customMouthFeatureId: str('customMouthFeatureId', AVATAR_V1_DEFAULTS.customMouthFeatureId ?? ''),
    customNoseFeatureId: str('customNoseFeatureId', AVATAR_V1_DEFAULTS.customNoseFeatureId ?? ''),
    customHairFeatureId: str('customHairFeatureId', AVATAR_V1_DEFAULTS.customHairFeatureId ?? ''),
  };
}

/**
 * Parse stored JSON into a classic avatar config.
 * - `null` / non-object → null
 * - legacy `{ version: 2, layers }` → v1 defaults
 * - otherwise → v1 merged with defaults
 */
export function parseAvatarPayload(raw: unknown): AvatarPayload | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  return mergeV1AvatarPartial(raw);
}
