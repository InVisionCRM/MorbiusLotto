import { FREE_VALUES, type AvatarField, type ItemTier } from '@/lib/cosmetics-catalog';

export const MORBIUS_PRICE: Record<ItemTier, number> = {
  common: 1_000,
  uncommon: 10_000,
  rare: 25_000,
  legendary: 100_000,
};

export const TIERS: ItemTier[] = ['common', 'uncommon', 'rare', 'legendary'];

export const TIER_BADGE: Record<ItemTier, string> = {
  common: 'bg-zinc-700 text-zinc-300',
  uncommon: 'bg-emerald-900/80 text-emerald-300',
  rare: 'bg-blue-900/80 text-blue-300',
  legendary: 'bg-amber-900/80 text-amber-300',
};

export const TIER_SORT: Record<ItemTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

/** Dashboard card shell (Plinko sidebar / cyan accent) */
export const DASH_CARD =
  'rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[rgb(16,26,35)] to-[rgb(35,36,41)] overflow-hidden shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)]';
export const DASH_CARD_TOGGLE =
  'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors';
export const DASH_CARD_DIVIDER = 'border-t border-cyan-500/15';

/** Admin catalog filter — matches `ItemRow.unlocks[].field` (patterns unlock multiple). */
export const APPLIES_TO_LABELS: Record<AvatarField, string> = {
  skinColor: 'Skin color',
  hairColor: 'Hair color',
  hairStyle: 'Hair style',
  accessoryColor: 'Glasses / accessory color',
  eyeShape: 'Eye shape',
  eyeColor: 'Eye color',
  faceShape: 'Face shape',
  noseShape: 'Nose',
  lipShape: 'Lips',
  accessory: 'Face accessory',
  hat: 'Hat',
  hatColor: 'Hat color',
  necklace: 'Necklace',
  mouthAccessory: 'Mouth',
  makeup: 'Makeup',
  facialHair: 'Facial hair',
  shirtColor: 'Shirt color',
  shirtStyle: 'Shirt style',
  backgroundImage: 'Background',
  overlayImage: 'Overlay',
  customPattern: 'Custom pattern',
};

export const APPLIES_TO_FIELDS_SORTED: AvatarField[] = (Object.keys(FREE_VALUES) as AvatarField[]).sort(
  (a, b) => APPLIES_TO_LABELS[a].localeCompare(APPLIES_TO_LABELS[b]),
);

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
