'use client';

import React, { useState } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview from './AvatarPreview';
import PixelBackgroundUploader from './PixelBackgroundUploader';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';

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
const HairStyles = ['Bald', 'Short', 'Buzz', 'Fade', 'Long Straight', 'Long Wavy', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Mohawk', 'Dreadlocks', 'Afro', 'Mullet', 'Pigtails', 'Messy'];
const FaceShapes = ['Square', 'Round', 'Oval', 'Heart', 'Diamond'];
const EyeShapes = ['Round', 'Almond', 'Narrow', 'Wide'];
const NoseShapes = ['Small', 'Wide', 'Pointy', 'Button'];
const LipShapes = ['Thin', 'Full', 'Smile', 'Smirk', 'Pout'];
const Accessories = ['None', 'Glasses', 'Sunglasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Earrings', 'Headband'];
const Hats = ['None', 'Cap', 'Beanie', 'Top Hat', 'Cowboy', 'Crown', 'Bandana'];
const Necklaces = ['None', 'Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'];
const MouthAccessories = ['None', 'Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'];

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
  { id: 'glass', label: 'Glasses & Extras', short: 'GLASS', field: 'accessory',      type: 'shape' },
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
};

export default function CharacterCreatorMobile({ config, onChange, displayName, onDisplayNameChange }: Props) {
  const [activeId, setActiveId] = useState('skin');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeCat = CATS.find(c => c.id === activeId)!;

  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const getOptions = (cat: Category): string[] => {
    const hasCust = !!config.customPattern;
    switch (cat.id) {
      case 'skin':  return hasCust ? ['url(#custom)', ...SkinColors]    : SkinColors;
      case 'hairc': return hasCust ? ['url(#custom)', ...HairColors]    : HairColors;
      case 'shirt': return hasCust ? ['url(#custom)', ...ShirtColors]   : ShirtColors;
      case 'glass': return hasCust ? ['Voxel Glasses', ...Accessories]  : Accessories;
      case 'neck':  return hasCust ? ['Voxel Chain', ...Necklaces]      : Necklaces;
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

  const currentVal = activeCat.field ? (config[activeCat.field] as string ?? '') : '';

  return (
    <div className="flex h-full bg-zinc-900 overflow-hidden">

      {/* ── Left vertical tab sidebar ──────────────────────────────── */}
      <div className="w-[52px] flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide border-r border-zinc-800 bg-zinc-950">
        {CATS.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveId(cat.id); setDrawerOpen(false); }}
            className={`flex-shrink-0 h-12 w-full flex items-center justify-center text-[8px] font-bold tracking-wider transition-colors touch-manipulation ${
              activeId === cat.id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {cat.short}
          </button>
        ))}
      </div>

      {/* ── Right panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-4 min-w-0">

        {/* Name input */}
        {displayName !== undefined && onDisplayNameChange && (
          <input
            type="text"
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder="Display name"
            maxLength={32}
            className="w-full max-w-[220px] text-sm font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600 py-1 text-center touch-manipulation"
          />
        )}

        {/* Avatar — large and prominent */}
        <AvatarPreview config={config} className="w-40 h-40" />

        {/* Active category controls */}
        <div className="flex flex-col items-center gap-3 w-full max-w-[260px]">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
            {activeCat.label}
          </p>

          {activeCat.type === 'bg' ? (
            <PixelBackgroundUploader
              currentImage={config.backgroundImage}
              onImageChange={url => onChange({
                ...config,
                backgroundImage: url,
                customPattern: url,
                skinColor:  url ? 'url(#custom)' : config.skinColor,
                hairColor:  url ? 'url(#custom)' : config.hairColor,
                shirtColor: url ? 'url(#custom)' : config.shirtColor,
              })}
            />
          ) : (
            <div className="flex gap-2.5 w-full">
              <button
                type="button"
                onClick={handleRandom}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-100 text-sm font-medium touch-manipulation transition-colors"
              >
                🎲 Random
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 text-white text-sm font-medium touch-manipulation transition-colors"
              >
                View All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer — full selection ─────────────────────────────────── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-zinc-900 border-zinc-800 max-h-[72vh]">
          <DrawerHeader className="pb-3 pt-1">
            <DrawerTitle className="text-zinc-100 text-center text-base">
              {activeCat.label}
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-8 overflow-y-auto">

            {/* Color grid */}
            {activeCat.type === 'color' && activeCat.field && (
              <div className="grid grid-cols-6 gap-3">
                {getOptions(activeCat).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { update(activeCat.field!, c); setDrawerOpen(false); }}
                    aria-label={`Select ${c}`}
                    className={`w-12 h-12 rounded-full overflow-hidden touch-manipulation transition-transform ${
                      currentVal === c
                        ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900 scale-110'
                        : 'ring-1 ring-white/10 active:scale-95'
                    }`}
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
                      <rect width="100" height="100" fill={c} />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Shape / style grid */}
            {activeCat.type === 'shape' && activeCat.field && (
              <div className="grid grid-cols-3 gap-2">
                {getOptions(activeCat).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { update(activeCat.field!, s); setDrawerOpen(false); }}
                    className={`h-11 rounded-xl text-sm font-medium touch-manipulation transition-colors whitespace-nowrap ${
                      currentVal === s
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
