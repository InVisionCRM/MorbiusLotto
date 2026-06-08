/**
 * Single source of truth for **ordered** avatar picker options (desktop + mobile).
 * Locking / ownership still comes from `getItemKeyForValue` in `cosmetics-catalog`.
 * When adding a new shop-only swatch, add it here and to `ITEM_CATALOG` unlocks.
 */

/** Shared tail for skin / hair / shirt / glasses color grids (SVG defs from `AvatarPatternDefs`). */
export const PICKER_PATTERN_FILLS = [
  'url(#tiger)',
  'url(#zebra)',
  'url(#leopard)',
  'url(#camo)',
  'url(#rainbow)',
  'url(#galaxy)',
  'url(#checkerboard)',
] as const;

export const PICKER_SKIN_COLORS: string[] = [
  '#FFF5EE',
  '#FFE4E1',
  '#FFDAB9',
  '#FFCDB2',
  '#FFB4A2',
  '#FFDBAC',
  '#F1C27D',
  '#E0AC69',
  '#C68642',
  '#8D5524',
  '#7B4B2A',
  '#5C3A21',
  '#4A3B32',
  '#3E2723',
  '#2D221E',
  '#1A1110',
  '#E5989B',
  '#B5838D',
  '#6D6875',
  '#4A4E69',
  '#22223B',
  '#39FF14',
  '#88CCFF',
  '#FF0000',
  '#8A2BE2',
  '#FF69B4',
  '#FFD700',
  '#C0C0C0',
  '#556B2F',
  '#E0FFFF',
  '#FF4500',
  '#FF00FF',
  '#00FFFF',
  '#FFFF00',
  '#000080',
  '#7FFF00',
  '#FFC0CB',
  '#F8F8FF',
  '#050505',
  ...PICKER_PATTERN_FILLS,
];

export const PICKER_HAIR_COLORS: string[] = [
  '#090806',
  '#2C222B',
  '#71635A',
  '#B7A69E',
  '#D6C4C2',
  '#CABFB1',
  '#DCD0BA',
  '#FFF5E1',
  '#E6CEA8',
  '#E5C8A8',
  '#DEBC99',
  '#B89778',
  '#A56B46',
  '#B55239',
  '#8D4A43',
  '#91553D',
  '#533D32',
  '#3B3024',
  '#554838',
  '#4E433F',
  '#504444',
  '#6A4E42',
  '#A7856A',
  '#977961',
  '#E11D48',
  '#2563EB',
  '#16A34A',
  '#9333EA',
  ...PICKER_PATTERN_FILLS,
];

export const PICKER_EYE_COLORS: string[] = [
  '#634e34',
  '#2e536f',
  '#3d671d',
  '#1c7847',
  '#497665',
  '#000000',
  '#5c4033',
  '#8a9a5b',
  '#4682b4',
  '#8B5CF6',
  '#F43F5E',
];

export const PICKER_SHIRT_COLORS: string[] = [
  '#ef4444',
  '#b91c1c',
  '#7f1d1d',
  '#f97316',
  '#c2410c',
  '#eab308',
  '#a16207',
  '#22c55e',
  '#15803d',
  '#14532d',
  '#10b981',
  '#3b82f6',
  '#1d4ed8',
  '#1e3a8a',
  '#06b6d4',
  '#a855f7',
  '#7e22ce',
  '#4c1d95',
  '#d946ef',
  '#ec4899',
  '#be185d',
  '#ffffff',
  '#9ca3af',
  '#3f3f46',
  '#000000',
  ...PICKER_PATTERN_FILLS,
];

export const PICKER_ACCESSORY_COLORS: string[] = [
  '#111111',
  '#333333',
  'rgba(0,0,0,0.85)',
  ...PICKER_PATTERN_FILLS,
];

export const PICKER_SHIRT_STYLES: string[] = [
  'Default',
  'Tuxedo',
  'Cheetah Print',
  'Hawaiian',
  'Pinstripe',
  'Flannel',
  'Denim Jacket',
  'Leather Jacket',
  'Varsity',
  'Hoodie',
  'Camo',
  'Suit',
  'Blazer',
  'Kimono',
  'Polo',
  'Zebra Print',
  'Leopard Print',
  'Snake Skin',
  'Tie-Dye',
  'Neon Crop',
  'Biker',
  'Sailor',
  'Space Suit',
  'Grim Reaper',
  'Golden Armor',
  'Black Tie',
  'Pinstripe Suit',
  'High Roller',
  'Smoking Jacket',
  'Royal',
  'Iced Out',
  'Dealer',
  'Tech Mogul',
  'Bomber',
  'Streetwear V2',
  'Streetwear V3',
  'Streetwear V6',
];

export const PICKER_HAIR_STYLES: string[] = [
  'Bald',
  'Short',
  'Buzz',
  'Soft',
  'Side Part',
  'Slick Back',
  'Crew',
  'Undercut',
  'Pompadour',
  'High Top',
  'Long Straight',
  'Long Wavy',
  'Ponytail',
  'Curly',
  'Bob',
  'Mohawk',
  'Spiky',
  'Fade',
  'Mullet',
  'Afro',
  'Pigtails',
  'Messy',
  'Dreadlocks',
  'Dreads Fade',
  'Dreadlocks V3',
  'Dreadlocks V6',
  'Dreadlocks V10',
  'Locks V1',
  'Locks V5',
];

export const PICKER_FACE_SHAPES: string[] = ['Square', 'Round'];

export const PICKER_EYE_SHAPES: string[] = [
  'Round',
  'Round XL',
  'Almond',
  'Narrow',
  'Wide',
  'Eye V1',
  'Eye V3',
  'Eye V4',
];

export const PICKER_LIP_SHAPES: string[] = [
  'Thin',
  'Smile',
  'Neutral',
  'Soft Smile',
  'Grin',
  'Sly Smirk',
  'Pout',
  'Frown',
];

export const PICKER_ACCESSORIES: string[] = [
  'None',
  'Glasses',
  'Sunglasses',
  'Aviators',
  'Cyberpunk',
  'Earrings',
  'Headband',
];

export const PICKER_HATS: string[] = [
  'None',
  'Cap',
  'Beanie',
  'Top Hat',
  'Cowboy',
  'Crown',
  'Bandana',
];

/**
 * Legendary hat tints — same spectrum as skin legendary row; require shop ownership (`hat_clr_*`).
 * Shown first in the picker.
 */
export const PICKER_HAT_COLORS_LEGENDARY: string[] = [
  '#FF4500',
  '#FF00FF',
  '#00FFFF',
  '#FFFF00',
  '#7FFF00',
];

/** Free hat tints (no item required). */
export const PICKER_HAT_COLORS_FREE: string[] = [
  '#000000',
  '#ffffff',
  '#3f3f46',
  '#3b82f6',
  '#ef4444',
];

/**
 * `hatColor` picker: legendary + free solids, then pattern fills (same as shirt/skin — require `pattern_*` ownership).
 */
export const PICKER_HAT_COLORS: string[] = [
  ...PICKER_HAT_COLORS_LEGENDARY,
  ...PICKER_HAT_COLORS_FREE,
  ...PICKER_PATTERN_FILLS,
];

export const PICKER_NECKLACES: string[] = ['None', 'Gold Chain', 'Silver Chain'];

export const PICKER_MOUTH_ACCESSORIES: string[] = [
  'None',
  'Cigar',
  'Cigarette',
  'Pipe',
  'Bubblegum',
  'Medical Mask',
];

export const PICKER_MAKEUPS: string[] = [
  'None',
  'Blush Soft',
  'Blush Rosy',
  'Contour',
  'Highlighter',
  'Freckles',
  'Eye Shadow',
  'Glam Full',
];

export const PICKER_FACIAL_HAIRS: string[] = [
  'None',
  'Eyelashes',
  'Stubble',
  'Mustache',
  'Goatee',
  'Short Beard',
  'Full Beard',
  'Soul Patch',
];
