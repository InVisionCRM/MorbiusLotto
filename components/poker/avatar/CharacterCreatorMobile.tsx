'use client';

import React, { useState } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview from './AvatarPreview';
import { randomizeConfig } from './CharacterCreator';
import { Lock, Shuffle, Pin } from 'lucide-react';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
import { getItemKeyForValue, type AvatarField } from '@/lib/cosmetics-catalog';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';
import { useCatalog } from '@/hooks/use-cosmetics';

// ── data ──────────────────────────────────────────────────────────────────

const SkinColors = [
  '#FFF5EE', '#FFE4E1', '#FFDAB9', '#FFCDB2', '#FFB4A2', '#FFDBAC', '#F1C27D', '#E0AC69', '#C68642',
  '#8D5524', '#7B4B2A', '#5C3A21', '#4A3B32', '#3E2723', '#2D221E', '#1A1110', '#E5989B', '#B5838D',
  '#6D6875', '#4A4E69', '#22223B', '#39FF14', '#88CCFF', '#FF0000', '#8A2BE2', '#FF69B4', '#FFD700',
  '#C0C0C0', '#556B2F', '#E0FFFF', '#FF4500', '#FF00FF', '#00FFFF', '#FFFF00', '#000080', '#7FFF00',
  '#FFC0CB', '#F8F8FF', '#050505',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const HairColors = [
  '#090806', '#2C222B', '#71635A', '#B7A69E', '#D6C4C2', '#CABFB1', '#DCD0BA', '#FFF5E1', '#E6CEA8',
  '#E5C8A8', '#DEBC99', '#B89778', '#A56B46', '#B55239', '#8D4A43', '#91553D', '#533D32', '#3B3024',
  '#554838', '#4E433F', '#504444', '#6A4E42', '#A7856A', '#977961', '#E11D48', '#2563EB', '#16A34A', '#9333EA',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const EyeColors = [
  '#634e34', '#2e536f', '#3d671d', '#1c7847', '#497665',
  '#000000', '#5c4033', '#8a9a5b', '#4682b4', '#8B5CF6', '#F43F5E',
];
const ShirtColors = [
  '#ef4444', '#b91c1c', '#7f1d1d', '#f97316', '#c2410c',
  '#eab308', '#a16207', '#22c55e', '#15803d', '#14532d',
  '#10b981', '#3b82f6', '#1d4ed8', '#1e3a8a', '#06b6d4',
  '#a855f7', '#7e22ce', '#4c1d95', '#d946ef', '#ec4899',
  '#be185d', '#ffffff', '#9ca3af', '#3f3f46', '#000000',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const AccessoryColors = [
  '#111111', '#333333', 'rgba(0,0,0,0.85)',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const HairStyles = ['Bald', 'Short', 'Buzz', 'Fade', 'Long Straight', 'Long Wavy', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Mohawk', 'Dreadlocks', 'Afro', 'Mullet', 'Pigtails', 'Messy'];
const FaceShapes = ['Square', 'Round', 'Oval', 'Heart', 'Diamond'];
const EyeShapes = ['Round', 'Almond', 'Narrow', 'Wide', 'Eye V1', 'Eye V2', 'Eye V3', 'Eye V4', 'Eye V5', 'Eye V6', 'Eye V7', 'Eye V8', 'Eye V9', 'Eye V10'];
const NoseShapes = ['Small', 'Wide', 'Pointy', 'Button'];
const LipShapes = ['Thin', 'Full', 'Smile', 'Smirk', 'Pout'];
const Accessories = ['None', 'Glasses', 'Sunglasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Shades V1', 'Shades V2', 'Shades V3', 'Shades V4', 'Shades V5', 'Shades V6', 'Shades V7', 'Shades V8', 'Shades V9', 'Shades V10', 'Earrings', 'Headband'];
const Hats = ['None', 'Cap', 'Beanie', 'Top Hat', 'Cowboy', 'Crown', 'Bandana', 'Hat V1', 'Hat V2', 'Hat V3', 'Hat V4', 'Hat V5', 'Hat V6', 'Hat V7', 'Hat V8', 'Hat V9', 'Hat V10'];
const Necklaces = ['None', 'Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'];
const MouthAccessories = ['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'];
const ShirtStyles = [
  'Default', 'Tuxedo', 'Cheetah Print', 'Hawaiian', 'Pinstripe', 'Flannel',
  'Denim Jacket', 'Leather Jacket', 'Varsity', 'Hoodie', 'Camo', 'Suit',
  'Blazer', 'Kimono', 'Polo', 'Zebra Print', 'Leopard Print', 'Snake Skin',
  'Tie-Dye', 'Neon Crop', 'Biker', 'Sailor', 'Space Suit', 'Grim Reaper', 'Golden Armor',
  'Streetwear V1', 'Streetwear V2', 'Streetwear V3', 'Streetwear V4', 'Streetwear V5',
  'Streetwear V6', 'Streetwear V7', 'Streetwear V8', 'Streetwear V9', 'Streetwear V10',
];

// ── category config ────────────────────────────────────────────────────────

type CatType = 'color' | 'shape' | 'bg';

interface Category {
  id: string;
  label: string;
  short: string;
  field?: keyof AvatarConfig;
  type: CatType;
}

const CATS: Category[] = [
  { id: 'skin',  label: 'Skin Tone',       short: 'SKIN',  field: 'skinColor',      type: 'color' },
  { id: 'face',  label: 'Face Shape',       short: 'FACE',  field: 'faceShape',      type: 'shape' },
  { id: 'hair',  label: 'Hair Style',       short: 'HAIR',  field: 'hairStyle',      type: 'shape' },
  { id: 'hairc', label: 'Hair Color',       short: 'H.CLR', field: 'hairColor',      type: 'color' },
  { id: 'eyes',  label: 'Eye Shape',        short: 'EYES',  field: 'eyeShape',       type: 'shape' },
  { id: 'eyec',  label: 'Eye Color',        short: 'E.CLR', field: 'eyeColor',       type: 'color' },
  { id: 'nose',  label: 'Nose',             short: 'NOSE',  field: 'noseShape',      type: 'shape' },
  { id: 'lips',  label: 'Lips',             short: 'LIPS',  field: 'lipShape',       type: 'shape' },
  { id: 'mouth', label: 'Mouth',            short: 'MOUTH', field: 'mouthAccessory', type: 'shape' },
  { id: 'shirt', label: 'Shirt Color',      short: 'SHIRT', field: 'shirtColor',     type: 'color' },
  { id: 'sstyle',label: 'Shirt Style',      short: 'STYLE', field: 'shirtStyle',     type: 'shape' },
  { id: 'glass', label: 'Glasses & Extras', short: 'GLASS', field: 'accessory',      type: 'shape' },
  { id: 'glassc',label: 'Glasses Color',    short: 'G.CLR', field: 'accessoryColor', type: 'color' },
  { id: 'hat',   label: 'Hat',              short: 'HAT',   field: 'hat',            type: 'shape' },
  { id: 'neck',  label: 'Necklace',         short: 'NECK',  field: 'necklace',       type: 'shape' },
  { id: 'bg',    label: 'Background',       short: 'BG',    field: 'backgroundImage', type: 'bg'   },
];

// ── component ──────────────────────────────────────────────────────────────

type Props = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  displayName?: string;
  onDisplayNameChange?: (v: string) => void;
  ownedItems?: Set<string>;
  isAdmin?: boolean;
  onLockedItemClick?: (itemKey: string) => void;
  pinnedItemKeys?: Set<string>;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

export default function CharacterCreatorMobile({ config, onChange, displayName, onDisplayNameChange, ownedItems, isAdmin = false, onLockedItemClick, pinnedItemKeys, pinnedRandomFields, onToggleRandomPin }: Props) {
  const [activeId, setActiveId] = useState('skin');
  const { items: catalogItems } = useCatalog();

  const activeCat = CATS.find(c => c.id === activeId)!;

  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const getOptions = (cat: Category): string[] => {
    switch (cat.id) {
      case 'skin':  return SkinColors;
      case 'hairc': return HairColors;
      case 'shirt': return ShirtColors;
      case 'sstyle':return ShirtStyles;
      case 'glass': return Accessories;
      case 'glassc': return AccessoryColors;
      case 'neck':  return Necklaces;
      case 'face':  return FaceShapes;
      case 'hair':  return HairStyles;
      case 'eyes':  return EyeShapes;
      case 'eyec':  return EyeColors;
      case 'nose':  return NoseShapes;
      case 'lips':  return LipShapes;
      case 'mouth': return MouthAccessories;
      case 'hat':   return Hats;
      default:      return [];
    }
  };

  const handleRandom = () => {
    if (!activeCat.field || activeCat.type === 'bg') return;
    const opts = getOptions(activeCat);
    if (!opts.length) return;
    update(activeCat.field, opts[Math.floor(Math.random() * opts.length)]);
  };

  const handleRandomizeAll = () => {
    const opts: { pinnedItemKeys?: Set<string>; preserveFrom?: AvatarConfig; pinnedFields?: Set<string> } = {};
    if (pinnedItemKeys?.size) opts.pinnedItemKeys = pinnedItemKeys;
    if (pinnedRandomFields?.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = pinnedRandomFields;
    }
    onChange(randomizeConfig(ownedItems, Object.keys(opts).length ? opts : undefined));
  };

  const currentVal = activeCat.field ? (config[activeCat.field] as string ?? '') : '';

  const isLocked = (field: AvatarField, value: string): boolean => {
    if (isAdmin || !ownedItems) return false;
    const itemKey = getItemKeyForValue(field, value);
    if (!itemKey) return false;
    return !ownedItems.has(itemKey);
  };

  return (
    <div className="flex h-full bg-zinc-900 overflow-hidden">
      {/* Hidden SVG providing pattern defs for color swatches */}
      <svg width="0" height="0" className="absolute">
        <defs><AvatarPatternDefs /></defs>
      </svg>

      {/* ── Left vertical tab sidebar ──────────────────────────────── */}
      <div className="w-[72px] min-w-[72px] flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide border-r border-zinc-800 bg-zinc-950">
        {CATS.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveId(cat.id)}
            className={`flex-shrink-0 min-h-10 py-2 w-full flex items-center justify-center text-[9px] font-bold tracking-wider transition-colors touch-manipulation ${
              activeId === cat.id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {cat.short}
          </button>
        ))}
      </div>

      {/* ── Right panel: name + avatar at top, all variations inline below ── */}
      <div className="flex-1 flex flex-col items-center min-w-0 overflow-y-auto pt-3 pb-4 px-3 gap-3">
        {/* Name input — top */}
        {displayName !== undefined && onDisplayNameChange && (
          <input
            type="text"
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder="Display name"
            maxLength={32}
            className="w-full max-w-[220px] text-sm font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600 py-1 text-center touch-manipulation flex-shrink-0"
          />
        )}

        {/* Avatar — right under name */}
        <AvatarPreview config={config} roamEyes className="w-36 aspect-[6/7] flex-shrink-0" />

        {/* Randomize All */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 w-full max-w-[280px]">
          <button
            type="button"
            onClick={handleRandomizeAll}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-emerald-400 text-xs font-medium touch-manipulation transition-colors border border-zinc-700"
          >
            <Shuffle size={13} />
            Randomize All
          </button>
          {onToggleRandomPin && (
            <p className="text-[9px] text-zinc-500 text-center leading-snug px-1">
              Amber pushpin by the category name keeps that part (colors, styles, background).
            </p>
          )}
        </div>

        {/* Category label + all variations inline */}
        <div className="w-full max-w-[280px] flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest min-w-0">
              {activeCat.label}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {activeCat.field && onToggleRandomPin && (
                <button
                  type="button"
                  aria-pressed={pinnedRandomFields?.has(activeCat.field) ?? false}
                  title={
                    pinnedRandomFields?.has(activeCat.field)
                      ? 'Unpin — will change on Randomize All'
                      : 'Pin — keep on Randomize All'
                  }
                  onClick={() => onToggleRandomPin(activeCat.field as AvatarRandomizeFieldKey)}
                  className={`p-1 rounded-md touch-manipulation transition-colors ${
                    pinnedRandomFields?.has(activeCat.field)
                      ? 'text-amber-400 bg-amber-500/15'
                      : 'text-zinc-600 hover:text-cyan-300 hover:bg-zinc-800'
                  }`}
                >
                  <Pin size={12} className={pinnedRandomFields?.has(activeCat.field) ? 'fill-amber-400/35' : ''} strokeWidth={2} />
                </button>
              )}
              {activeCat.type !== 'bg' && activeCat.field && (
                <button
                  type="button"
                  onClick={handleRandom}
                  className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 touch-manipulation"
                >
                  🎲 Random
                </button>
              )}
            </div>
          </div>

          {/* Backgrounds */}
          {activeCat.type === 'bg' && (() => {
            const bgItems = catalogItems.filter(i => i.unlocks.some(u => u.field === 'backgroundImage'));
            if (bgItems.length === 0) {
              return <p className="text-[11px] text-zinc-500 text-center py-4">No backgrounds yet.</p>;
            }
            return (
              <div className="grid grid-cols-3 gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => update('backgroundImage', '')}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-medium transition-colors ${
                    !config.backgroundImage ? 'border-white/60 text-white' : 'border-zinc-700 text-zinc-500'
                  }`}
                >
                  None
                </button>
                {bgItems.map(bgItem => {
                  const val = bgItem.unlocks.find(u => u.field === 'backgroundImage')?.value ?? '';
                  const owned = isAdmin || (ownedItems?.has(bgItem.itemKey) ?? false);
                  const selected = config.backgroundImage === val;
                  return (
                    <button
                      key={bgItem.itemKey}
                      type="button"
                      onClick={() => owned ? update('backgroundImage', val) : onLockedItemClick?.(bgItem.itemKey)}
                      className={`aspect-square rounded-lg border-2 overflow-hidden relative ${selected ? 'border-white/80' : owned ? 'border-zinc-700' : 'border-zinc-800'}`}
                      title={bgItem.displayName}
                    >
                      <img src={val} alt={bgItem.displayName} className="w-full h-full object-cover" />
                      {!owned && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Lock size={12} className="text-yellow-400" /></div>}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Color grid — inline */}
          {activeCat.type === 'color' && activeCat.field && (
            <div className="grid grid-cols-6 gap-2 w-full">
              {getOptions(activeCat).map(c => {
                const locked = isLocked(activeCat.field as AvatarField, c);
                const lockedKey = locked ? (getItemKeyForValue(activeCat.field as AvatarField, c) ?? undefined) : undefined;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      if (locked && lockedKey) onLockedItemClick?.(lockedKey);
                      else update(activeCat.field!, c);
                    }}
                    aria-label={`Select ${c}${locked ? ' (locked)' : ''}`}
                    className={`relative w-10 h-10 rounded-full overflow-hidden touch-manipulation transition-transform ${
                      currentVal === c
                        ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900 scale-105'
                        : locked ? 'ring-1 ring-yellow-500/40 active:scale-95' : 'ring-1 ring-white/10 active:scale-95'
                    }`}
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
                      <rect width="100" height="100" fill={c} />
                    </svg>
                    {locked && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
                        <Lock size={10} className="text-yellow-400" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Shape grid — inline */}
          {activeCat.type === 'shape' && activeCat.field && (
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {getOptions(activeCat).map(s => {
                const locked = isLocked(activeCat.field as AvatarField, s);
                const lockedKey = locked ? (getItemKeyForValue(activeCat.field as AvatarField, s) ?? undefined) : undefined;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (locked && lockedKey) onLockedItemClick?.(lockedKey);
                      else update(activeCat.field!, s);
                    }}
                    className={`min-h-10 py-2 rounded-xl text-xs font-medium touch-manipulation transition-colors whitespace-nowrap ${
                      currentVal === s
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : locked ? 'bg-zinc-800 text-yellow-400/80 border border-yellow-500/20 active:bg-zinc-700' : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {locked && <Lock size={8} className="shrink-0" />}
                      {s}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
