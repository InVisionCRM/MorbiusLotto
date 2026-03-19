/**
 * Cosmetics Catalog — single source of truth for free vs. paid avatar items.
 * Used on both frontend and backend (Node-safe, no browser APIs).
 */

export type ItemTier = 'common' | 'uncommon' | 'rare' | 'legendary';

export type AvatarField =
  | 'skinColor'
  | 'hairStyle'
  | 'hairColor'
  | 'accessoryColor'
  | 'eyeShape'
  | 'eyeColor'
  | 'faceShape'
  | 'noseShape'
  | 'lipShape'
  | 'accessory'
  | 'hat'
  | 'necklace'
  | 'mouthAccessory'
  | 'shirtColor'
  | 'shirtStyle'
  | 'backgroundImage'
  | 'overlayImage'
  | 'customPattern'; // non-empty customPattern requires feature_custom_bg

export interface CosmeticItem {
  itemKey: string;
  displayName: string;
  tier: ItemTier;
  /** Max number that can ever be minted from the shop. */
  maxSupply: number;
  /** Each { field, value } pair this item unlocks. Patterns unlock multiple fields. */
  unlocks: Array<{ field: AvatarField; value: string }>;
  /** Price in PLS (human-readable, not wei). 0 = not purchasable with PLS. */
  pricePls: number;
  /** Price in Morbius tokens (human-readable). 0 = not purchasable with Morbius. */
  priceMorbius: number;
}

// ─── Free values per field ────────────────────────────────────────────────────
// Anything NOT in these sets requires ownership.

export const FREE_VALUES: Record<AvatarField, Set<string>> = {
  skinColor: new Set([
    '#FFF5EE', '#FFE4E1', '#FFDAB9', '#FFCDB2', '#FFB4A2', '#FFDBAC',
    '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#7B4B2A', '#5C3A21',
    '#4A3B32', '#3E2723', '#2D221E', '#1A1110',
  ]),
  hairStyle: new Set([
    'Bald', 'Short', 'Buzz', 'Fade', 'Long Straight', 'Long Wavy',
    'Curly', 'Afro', 'Bob', 'Ponytail',
  ]),
  hairColor: new Set([
    '#090806', '#2C222B', '#71635A', '#B7A69E',
    '#DCD0BA', '#FFF5E1', '#A56B46', '#B55239',
  ]),
  accessoryColor: new Set([
    '#111111', '#333333', 'rgba(0,0,0,0.85)',
    'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
  ]),
  // All free — no paid variants
  eyeShape:  new Set(['Round', 'Almond', 'Narrow', 'Wide']),
  eyeColor:  new Set(['#634e34', '#2e536f', '#3d671d', '#1c7847', '#497665', '#000000', '#5c4033', '#8a9a5b', '#4682b4', '#8B5CF6', '#F43F5E']),
  faceShape: new Set(['Square', 'Round', 'Oval', 'Heart', 'Diamond']),
  noseShape: new Set(['Small', 'Wide', 'Pointy', 'Button']),
  lipShape:  new Set(['Thin', 'Full', 'Smile', 'Smirk', 'Pout']),
  accessory: new Set(['None', 'Sunglasses']),
  hat: new Set(['None', 'Cap', 'Beanie']),
  necklace: new Set(['None']),
  mouthAccessory: new Set(['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask']),
  shirtColor: new Set([
    '#ef4444', '#3b82f6', '#22c55e', '#ffffff', '#9ca3af', '#3f3f46', '#000000',
  ]),
  shirtStyle: new Set(['Default']), // all pattern styles require ownership
  backgroundImage: new Set(['']), // empty string = free; any URL requires ownership of a background item
  overlayImage:    new Set(['']), // empty string = free; any data URL requires ownership of an overlay item
  customPattern:   new Set(['']), // legacy field — no longer gated
};

// ─── Pricing & supply per tier ────────────────────────────────────────────────

const PLS: Record<ItemTier, number> = {
  common:    50_000,
  uncommon:  250_000,
  rare:      750_000,
  legendary: 3_000_000,
};

const MORBIUS_PRICE: Record<ItemTier, number> = {
  common:    1_000,
  uncommon:  10_000,
  rare:      25_000,
  legendary: 100_000,
};

export const MAX_SUPPLY: Record<ItemTier, number> = {
  common:    50,
  uncommon:  25,
  rare:      5,
  legendary: 1,
};

// ─── Item factory ─────────────────────────────────────────────────────────────

function item(
  itemKey: string,
  displayName: string,
  tier: ItemTier,
  unlocks: Array<{ field: AvatarField; value: string }>,
): CosmeticItem {
  return {
    itemKey,
    displayName,
    tier,
    maxSupply: MAX_SUPPLY[tier],
    unlocks,
    pricePls: PLS[tier],
    priceMorbius: MORBIUS_PRICE[tier],
  };
}

// ── Skin colors ───────────────────────────────────────────────────────────────
const SKIN_ITEMS: CosmeticItem[] = [
  // Common (250) — subtle fantasy tones
  item('skin_rosy',        'Rosy Skin',      'common',    [{ field: 'skinColor', value: '#E5989B' }]),
  item('skin_mauve',       'Mauve Skin',     'common',    [{ field: 'skinColor', value: '#B5838D' }]),
  item('skin_purple_gray', 'Dusk Skin',      'common',    [{ field: 'skinColor', value: '#6D6875' }]),
  item('skin_slate',       'Slate Skin',     'common',    [{ field: 'skinColor', value: '#4A4E69' }]),
  item('skin_night',       'Night Skin',     'common',    [{ field: 'skinColor', value: '#22223B' }]),
  // Uncommon (50) — vivid but not ultra-rare
  item('skin_neon_green',  'Neon Green',     'uncommon',  [{ field: 'skinColor', value: '#39FF14' }]),
  item('skin_sky_blue',    'Sky Blue',       'uncommon',  [{ field: 'skinColor', value: '#88CCFF' }]),
  item('skin_crimson',     'Crimson',        'uncommon',  [{ field: 'skinColor', value: '#FF0000' }]),
  item('skin_hot_pink',    'Hot Pink',       'uncommon',  [{ field: 'skinColor', value: '#FF69B4' }]),
  item('skin_ice',         'Ice Skin',       'uncommon',  [{ field: 'skinColor', value: '#E0FFFF' }]),
  item('skin_light_pink',  'Cotton Candy',   'uncommon',  [{ field: 'skinColor', value: '#FFC0CB' }]),
  item('skin_ghost',       'Ghost White',    'uncommon',  [{ field: 'skinColor', value: '#F8F8FF' }]),
  item('skin_olive',       'Dark Olive',     'uncommon',  [{ field: 'skinColor', value: '#556B2F' }]),
  // Rare (15) — premium tone
  item('skin_gold',        'Gold Skin',      'rare',      [{ field: 'skinColor', value: '#FFD700' }]),
  item('skin_silver',      'Silver Skin',    'rare',      [{ field: 'skinColor', value: '#C0C0C0' }]),
  item('skin_void',        'Void Black',     'rare',      [{ field: 'skinColor', value: '#050505' }]),
  item('skin_violet',      'Violet',         'rare',      [{ field: 'skinColor', value: '#8A2BE2' }]),
  item('skin_navy',        'Deep Navy',      'rare',      [{ field: 'skinColor', value: '#000080' }]),
  // Legendary (1) — true one-of-ones
  item('skin_orange_red',  'Phoenix',        'legendary', [{ field: 'skinColor', value: '#FF4500' }]),
  item('skin_magenta',     'Magenta',        'legendary', [{ field: 'skinColor', value: '#FF00FF' }]),
  item('skin_cyan',        'Cyan',           'legendary', [{ field: 'skinColor', value: '#00FFFF' }]),
  item('skin_yellow',      'Canary',         'legendary', [{ field: 'skinColor', value: '#FFFF00' }]),
  item('skin_chartreuse',  'Toxic Green',    'legendary', [{ field: 'skinColor', value: '#7FFF00' }]),
];

// ── Hair styles ───────────────────────────────────────────────────────────────
const HAIR_STYLE_ITEMS: CosmeticItem[] = [
  item('hair_style_spiky',      'Spiky',      'common',    [{ field: 'hairStyle', value: 'Spiky' }]),
  item('hair_style_messy',      'Messy',      'common',    [{ field: 'hairStyle', value: 'Messy' }]),
  item('hair_style_pigtails',   'Pigtails',   'uncommon',  [{ field: 'hairStyle', value: 'Pigtails' }]),
  item('hair_style_mullet',     'Mullet',     'rare',      [{ field: 'hairStyle', value: 'Mullet' }]),
  item('hair_style_mohawk',     'Mohawk',     'legendary', [{ field: 'hairStyle', value: 'Mohawk' }]),
  item('hair_style_dreadlocks', 'Dreadlocks', 'legendary', [{ field: 'hairStyle', value: 'Dreadlocks' }]),
];

// ── Hair colors ───────────────────────────────────────────────────────────────
const HAIR_COLOR_ITEMS: CosmeticItem[] = [
  // Common (250) — natural-ish extras
  item('hair_color_ash',         'Ash Brown',     'common',   [{ field: 'hairColor', value: '#D6C4C2' }]),
  item('hair_color_ash2',        'Ash Blonde',    'common',   [{ field: 'hairColor', value: '#CABFB1' }]),
  item('hair_color_dirty_blond', 'Dirty Blonde',  'common',   [{ field: 'hairColor', value: '#E6CEA8' }]),
  item('hair_color_sandy',       'Sandy',         'common',   [{ field: 'hairColor', value: '#E5C8A8' }]),
  item('hair_color_caramel',     'Caramel',       'common',   [{ field: 'hairColor', value: '#DEBC99' }]),
  item('hair_color_honey',       'Honey',         'common',   [{ field: 'hairColor', value: '#B89778' }]),
  item('hair_color_ginger',      'Ginger',        'common',   [{ field: 'hairColor', value: '#8D4A43' }]),
  item('hair_color_chestnut',    'Chestnut',      'common',   [{ field: 'hairColor', value: '#91553D' }]),
  item('hair_color_dk_brown',    'Dark Chocolate','common',   [{ field: 'hairColor', value: '#533D32' }]),
  item('hair_color_espresso',    'Espresso',      'common',   [{ field: 'hairColor', value: '#3B3024' }]),
  item('hair_color_walnut',      'Walnut',        'common',   [{ field: 'hairColor', value: '#554838' }]),
  item('hair_color_mocha',       'Mocha',         'common',   [{ field: 'hairColor', value: '#4E433F' }]),
  item('hair_color_truffle',     'Truffle',       'common',   [{ field: 'hairColor', value: '#504444' }]),
  item('hair_color_oak',         'Oak',           'common',   [{ field: 'hairColor', value: '#6A4E42' }]),
  item('hair_color_toffee',      'Toffee',        'common',   [{ field: 'hairColor', value: '#A7856A' }]),
  item('hair_color_wheat',       'Wheat',         'common',   [{ field: 'hairColor', value: '#977961' }]),
  // Uncommon (50) — vivid fashion colors
  item('hair_color_vivid_red',  'Vivid Red',      'uncommon', [{ field: 'hairColor', value: '#E11D48' }]),
  item('hair_color_vivid_blue', 'Vivid Blue',     'uncommon', [{ field: 'hairColor', value: '#2563EB' }]),
  item('hair_color_vivid_grn',  'Vivid Green',    'uncommon', [{ field: 'hairColor', value: '#16A34A' }]),
  item('hair_color_vivid_purp', 'Vivid Purple',   'uncommon', [{ field: 'hairColor', value: '#9333EA' }]),
];

// ── Accessories ───────────────────────────────────────────────────────────────
const ACCESSORY_ITEMS: CosmeticItem[] = [
  item('acc_glasses',   'Glasses',         'common',    [{ field: 'accessory', value: 'Glasses' }]),
  item('acc_earrings',  'Earrings',        'common',    [{ field: 'accessory', value: 'Earrings' }]),
  item('acc_aviators',  'Aviators',        'uncommon',  [{ field: 'accessory', value: 'Aviators' }]),
  item('acc_wayfarers', 'Wayfarers',       'uncommon',  [{ field: 'accessory', value: 'Wayfarers' }]),
  item('acc_headband',  'Headband',        'uncommon',  [{ field: 'accessory', value: 'Headband' }]),
  item('acc_round',     'Round Glasses',   'rare',      [{ field: 'accessory', value: 'Round Glasses' }]),
  item('acc_cyberpunk', 'Cyberpunk Visor', 'legendary', [{ field: 'accessory', value: 'Cyberpunk' }]),
];

// ── Hats ──────────────────────────────────────────────────────────────────────
const HAT_ITEMS: CosmeticItem[] = [
  item('hat_bandana',  'Bandana',    'common',    [{ field: 'hat', value: 'Bandana' }]),
  item('hat_cowboy',   'Cowboy Hat', 'uncommon',  [{ field: 'hat', value: 'Cowboy' }]),
  item('hat_top_hat',  'Top Hat',    'rare',      [{ field: 'hat', value: 'Top Hat' }]),
  item('hat_crown',    'Crown',      'legendary', [{ field: 'hat', value: 'Crown' }]),
];

// ── Necklaces ─────────────────────────────────────────────────────────────────
const NECKLACE_ITEMS: CosmeticItem[] = [
  item('neck_silver',  'Silver Chain', 'common',    [{ field: 'necklace', value: 'Silver Chain' }]),
  item('neck_pearl',   'Pearl',        'uncommon',  [{ field: 'necklace', value: 'Pearl' }]),
  item('neck_gold',    'Gold Chain',   'rare',      [{ field: 'necklace', value: 'Gold Chain' }]),
  item('neck_pendant', 'Pendant',      'legendary', [{ field: 'necklace', value: 'Pendant' }]),
];

// ── Shirt colors ──────────────────────────────────────────────────────────────
const SHIRT_COLOR_ITEMS: CosmeticItem[] = [
  // Common (250)
  item('shirt_dark_red',    'Dark Red',     'common',   [{ field: 'shirtColor', value: '#b91c1c' }]),
  item('shirt_maroon',      'Maroon',       'common',   [{ field: 'shirtColor', value: '#7f1d1d' }]),
  item('shirt_orange',      'Orange',       'common',   [{ field: 'shirtColor', value: '#f97316' }]),
  item('shirt_burnt',       'Burnt Orange', 'common',   [{ field: 'shirtColor', value: '#c2410c' }]),
  item('shirt_yellow',      'Yellow',       'common',   [{ field: 'shirtColor', value: '#eab308' }]),
  item('shirt_gold',        'Gold',         'common',   [{ field: 'shirtColor', value: '#a16207' }]),
  item('shirt_forest',      'Forest',       'common',   [{ field: 'shirtColor', value: '#15803d' }]),
  item('shirt_dark_green',  'Dark Green',   'common',   [{ field: 'shirtColor', value: '#14532d' }]),
  item('shirt_teal',        'Teal',         'common',   [{ field: 'shirtColor', value: '#10b981' }]),
  item('shirt_navy',        'Navy',         'common',   [{ field: 'shirtColor', value: '#1d4ed8' }]),
  item('shirt_dark_navy',   'Dark Navy',    'common',   [{ field: 'shirtColor', value: '#1e3a8a' }]),
  item('shirt_cyan',        'Cyan',         'common',   [{ field: 'shirtColor', value: '#06b6d4' }]),
  item('shirt_dark_purple', 'Dark Purple',  'common',   [{ field: 'shirtColor', value: '#7e22ce' }]),
  item('shirt_deep_purple', 'Deep Purple',  'common',   [{ field: 'shirtColor', value: '#4c1d95' }]),
  item('shirt_magenta',     'Magenta',      'common',   [{ field: 'shirtColor', value: '#d946ef' }]),
  item('shirt_dark_pink',   'Dark Pink',    'common',   [{ field: 'shirtColor', value: '#be185d' }]),
  // Uncommon (50)
  item('shirt_purple',      'Purple',       'uncommon', [{ field: 'shirtColor', value: '#a855f7' }]),
  item('shirt_hot_pink',    'Hot Pink',     'uncommon', [{ field: 'shirtColor', value: '#ec4899' }]),
];

// ── Patterns (unlock url(#pattern) for skin, hair, AND shirt) ─────────────────
function patternItem(name: string, displayName: string, tier: ItemTier): CosmeticItem {
  const val = `url(#${name})`;
  return item(`pattern_${name}`, displayName, tier, [
    { field: 'skinColor',  value: val },
    { field: 'hairColor',  value: val },
    { field: 'shirtColor', value: val },
  ]);
}

const PATTERN_ITEMS: CosmeticItem[] = [
  patternItem('tiger',        'Tiger Pattern',        'legendary'),
  patternItem('zebra',        'Zebra Pattern',        'legendary'),
  patternItem('leopard',      'Leopard Pattern',      'legendary'),
  patternItem('camo',         'Camo Pattern',         'legendary'),
  patternItem('rainbow',      'Rainbow Pattern',      'legendary'),
  patternItem('galaxy',       'Galaxy Pattern',       'legendary'),
  patternItem('checkerboard', 'Checkerboard Pattern', 'legendary'),
];

// (feature_custom_bg removed — backgrounds are now individual items per background image)

// ─── Full catalog export ──────────────────────────────────────────────────────
export const ITEM_CATALOG: CosmeticItem[] = [
  ...SKIN_ITEMS,
  ...HAIR_STYLE_ITEMS,
  ...HAIR_COLOR_ITEMS,
  ...ACCESSORY_ITEMS,
  ...HAT_ITEMS,
  ...NECKLACE_ITEMS,
  ...SHIRT_COLOR_ITEMS,
  ...PATTERN_ITEMS,
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Map from "field:value" → itemKey for O(1) lookup */
const _valueToItemKey = new Map<string, string>();
for (const ci of ITEM_CATALOG) {
  for (const u of ci.unlocks) {
    if (u.value !== '__any_non_empty__') {
      _valueToItemKey.set(`${u.field}:${u.value}`, ci.itemKey);
    }
  }
}

/** Returns the itemKey required to use this field+value, or null if it's free. */
export function getItemKeyForValue(field: AvatarField, value: string): string | null {
  const freeSet = FREE_VALUES[field];
  if (freeSet?.has(value)) return null;
  return _valueToItemKey.get(`${field}:${value}`) ?? null;
}

export interface LockedField {
  field: AvatarField;
  value: string;
  itemKey: string | null; // null = locked but item not in catalog (shouldn't happen)
  displayName: string | null;
}

/**
 * Given an avatar config and a set of owned item keys, returns the list of
 * fields that are locked (require items the player doesn't own).
 */
export function getLockedFields(
  config: Partial<Record<string, string>>,
  ownedItemKeys: Set<string>,
): LockedField[] {
  const locked: LockedField[] = [];
  const fields: AvatarField[] = [
    'skinColor', 'hairStyle', 'hairColor', 'accessoryColor', 'accessory',
    'hat', 'necklace', 'mouthAccessory', 'shirtColor', 'backgroundImage', 'overlayImage',
  ];
  for (const field of fields) {
    const value = config[field];
    if (!value) continue;
    const val = value ?? '';
    const itemKey = getItemKeyForValue(field, val);
    if (itemKey && !ownedItemKeys.has(itemKey)) {
      const catalogItem = ITEM_CATALOG.find(i => i.itemKey === itemKey) ?? null;
      locked.push({ field, value: val, itemKey, displayName: catalogItem?.displayName ?? null });
    }
  }
  return locked;
}

/** Returns true if the address is in the ADMIN_WALLETS env var (case-insensitive). */
export function isAdminWallet(address: string): boolean {
  const raw = process.env.ADMIN_WALLETS ?? process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? '';
  return raw.split(',').some(a => a.trim().toLowerCase() === address.toLowerCase());
}
