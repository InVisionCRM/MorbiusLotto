'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Pin } from 'lucide-react';
import { getItemKeyForValue, type AvatarField } from '@/lib/cosmetics-catalog';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';
import { useCatalog } from '@/hooks/use-cosmetics';

const SkinColors = [
  '#FFF5EE', '#FFE4E1', '#FFDAB9', '#FFCDB2', '#FFB4A2', '#FFDBAC', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#7B4B2A', '#5C3A21', '#4A3B32', '#3E2723', '#2D221E', '#1A1110', '#E5989B', '#B5838D', '#6D6875', '#4A4E69', '#22223B',
  '#39FF14', '#88CCFF', '#FF0000', '#8A2BE2', '#FF69B4', '#FFD700', '#C0C0C0', '#556B2F', '#E0FFFF', '#FF4500', '#FF00FF', '#00FFFF', '#FFFF00', '#000080', '#7FFF00', '#FFC0CB', '#F8F8FF', '#050505',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const HairColors = [
  '#090806', '#2C222B', '#71635A', '#B7A69E', '#D6C4C2', '#CABFB1', '#DCD0BA', '#FFF5E1', '#E6CEA8', '#E5C8A8', '#DEBC99', '#B89778', '#A56B46', '#B55239', '#8D4A43', '#91553D', '#533D32', '#3B3024', '#554838', '#4E433F', '#504444', '#6A4E42', '#A7856A', '#977961', '#E11D48', '#2563EB', '#16A34A', '#9333EA',
  'url(#tiger)', 'url(#zebra)', 'url(#leopard)', 'url(#camo)', 'url(#rainbow)', 'url(#galaxy)', 'url(#checkerboard)',
];
const EyeColors = ['#634e34', '#2e536f', '#3d671d', '#1c7847', '#497665', '#000000', '#5c4033', '#8a9a5b', '#4682b4', '#8B5CF6', '#F43F5E'];
const ShirtStyles = [
  'Default', 'Tuxedo', 'Cheetah Print', 'Hawaiian', 'Pinstripe', 'Flannel',
  'Denim Jacket', 'Leather Jacket', 'Varsity', 'Hoodie', 'Camo', 'Suit',
  'Blazer', 'Kimono', 'Polo', 'Zebra Print', 'Leopard Print', 'Snake Skin',
  'Tie-Dye', 'Neon Crop', 'Biker', 'Sailor', 'Space Suit', 'Grim Reaper', 'Golden Armor',
  'Streetwear V1', 'Streetwear V2', 'Streetwear V3', 'Streetwear V4', 'Streetwear V5',
  'Streetwear V6', 'Streetwear V7', 'Streetwear V8', 'Streetwear V9', 'Streetwear V10',
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

type AvatarControlsProps = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  activeTab: string;
  compact?: boolean;
  ownedItems?: Set<string>;
  isAdmin?: boolean;
  onLockedItemClick?: (itemKey: string) => void;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

/** Render a color swatch — handles hex and url(#pattern) values. */
function ColorSwatch({ value }: { value: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
      <rect width="100" height="100" fill={value} />
    </svg>
  );
}

function SectionHead({
  label,
  pinField,
  compact,
  pinnedRandomFields,
  onToggleRandomPin,
}: {
  label: string;
  pinField?: AvatarRandomizeFieldKey;
  compact: boolean;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
}) {
  const pinned = pinField ? pinnedRandomFields?.has(pinField) : false;
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-1.5' : 'mb-4'}`}>
      <h3 className={`font-semibold text-zinc-400 uppercase tracking-widest min-w-0 ${compact ? 'text-[10px]' : 'text-sm'}`}>
        {label}
      </h3>
      {pinField && onToggleRandomPin && (
        <button
          type="button"
          aria-pressed={!!pinned}
          title={
            pinned
              ? 'Unpin — this part will change on Randomize'
              : 'Pin — keep this part when you Randomize (any color, owned item, gift, etc.)'
          }
          onClick={() => onToggleRandomPin(pinField)}
          className={`shrink-0 rounded-md p-1 transition-colors touch-manipulation ${
            pinned ? 'text-amber-400 bg-amber-500/15' : 'text-zinc-600 hover:text-cyan-300 hover:bg-zinc-800'
          }`}
        >
          <Pin size={compact ? 11 : 13} className={pinned ? 'fill-amber-400/35' : ''} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export default function AvatarControls({
  config,
  onChange,
  activeTab,
  compact = false,
  ownedItems,
  isAdmin = false,
  onLockedItemClick,
  pinnedRandomFields,
  onToggleRandomPin,
}: AvatarControlsProps) {
  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });
  const { items: catalogItems } = useCatalog();

  const bgItems = catalogItems.filter(i => i.unlocks.some(u => u.field === 'backgroundImage'));

  const isLocked = (field: AvatarField, value: string): boolean => {
    if (isAdmin) return false;
    if (!ownedItems) return false;
    const itemKey = getItemKeyForValue(field, value);
    if (!itemKey) return false;
    return !ownedItems.has(itemKey);
  };

  const renderColorGrid = (colors: string[], activeColor: string, field: AvatarField) => (
    <div className={`grid ${compact ? 'grid-cols-8 sm:grid-cols-10 gap-1.5' : 'grid-cols-6 sm:grid-cols-7 gap-3'}`}>
      {colors.map(c => {
        const locked = isLocked(field, c);
        const isActive = activeColor === c;
        const itemKey = locked ? (getItemKeyForValue(field, c) ?? undefined) : undefined;
        return (
          <button
            key={c}
            className={`relative rounded-full shadow-sm transition-transform hover:scale-110 focus:outline-none overflow-hidden flex items-center justify-center touch-manipulation ${compact ? 'w-7 h-7 ring-offset-1 ring-offset-zinc-900' : 'w-10 h-10 ring-offset-2 ring-offset-zinc-900'} ${isActive ? 'ring-2 ring-indigo-500 scale-110' : locked ? 'ring-1 ring-yellow-500/40' : 'ring-1 ring-white/10'}`}
            onClick={() => {
              update(field, c);
              if (locked && itemKey) onLockedItemClick?.(itemKey);
            }}
            aria-label={`Select color ${c}${locked ? ' (locked)' : ''}`}
          >
            <ColorSwatch value={c} />
            {locked && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
                <Lock size={8} className="text-yellow-400" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderShapeGrid = (shapes: string[], activeShape: string, field: AvatarField) => (
    <div className={`grid ${compact ? 'grid-cols-3 sm:grid-cols-4 gap-1.5' : 'grid-cols-2 sm:grid-cols-3 gap-3'}`}>
      {shapes.map(s => {
        const locked = isLocked(field, s);
        const isActive = activeShape === s;
        const itemKey = locked ? (getItemKeyForValue(field, s) ?? undefined) : undefined;
        return (
          <button
            key={s}
            className={`relative rounded-md font-medium transition-all touch-manipulation ${compact ? 'py-1 px-2 text-[11px]' : 'py-3 px-4 rounded-xl text-sm min-h-[44px]'} ${isActive ? 'bg-indigo-600 text-white shadow-md' : locked ? 'bg-zinc-800 text-yellow-400/80 hover:bg-zinc-700 hover:text-yellow-300 border border-yellow-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}
            onClick={() => {
              update(field, s);
              if (locked && itemKey) onLockedItemClick?.(itemKey);
            }}
            aria-label={`${s}${locked ? ' (locked)' : ''}`}
          >
            <span className="flex items-center justify-center gap-1">
              {locked && <Lock size={9} className="shrink-0" />}
              {s}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Hidden SVG providing pattern defs for color swatches */}
      <svg width="0" height="0" className="absolute">
        <defs><AvatarPatternDefs /></defs>
      </svg>
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={compact ? 'space-y-3' : 'space-y-8'}
          >
            {activeTab === 'skin' && (
              <section>
                <SectionHead label="Skin Tone" pinField="skinColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                {renderColorGrid(SkinColors, config.skinColor, 'skinColor')}
              </section>
            )}

            {activeTab === 'hair' && (
              <>
                <section>
                  <SectionHead label="Hair Style" pinField="hairStyle" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(HairStyles, config.hairStyle, 'hairStyle')}
                </section>
                <section>
                  <SectionHead label="Hair Color" pinField="hairColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(HairColors, config.hairColor, 'hairColor')}
                </section>
              </>
            )}

            {activeTab === 'eyes' && (
              <>
                <section>
                  <SectionHead label="Eye Shape" pinField="eyeShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(EyeShapes, config.eyeShape, 'eyeShape')}
                </section>
                <section>
                  <SectionHead label="Eye Color" pinField="eyeColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(EyeColors, config.eyeColor, 'eyeColor')}
                </section>
              </>
            )}

            {activeTab === 'face' && (
              <>
                <section>
                  <SectionHead label="Face Shape" pinField="faceShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(FaceShapes, config.faceShape, 'faceShape')}
                </section>
                <section>
                  <SectionHead label="Nose" pinField="noseShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(NoseShapes, config.noseShape, 'noseShape')}
                </section>
                <section>
                  <SectionHead label="Lips" pinField="lipShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(LipShapes, config.lipShape, 'lipShape')}
                </section>
                <section>
                  <SectionHead label="Mouth Accessory" pinField="mouthAccessory" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(MouthAccessories, config.mouthAccessory, 'mouthAccessory')}
                </section>
              </>
            )}

            {activeTab === 'clothes' && (
              <>
                <section>
                  <SectionHead label="Shirt Color" pinField="shirtColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(ShirtColors, config.shirtColor, 'shirtColor')}
                </section>
                <section>
                  <SectionHead label="Shirt Style" pinField="shirtStyle" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(ShirtStyles, config.shirtStyle || 'Default', 'shirtStyle')}
                </section>
              </>
            )}

            {activeTab === 'acc' && (
              <>
                <section>
                  <SectionHead label="Glasses & Earrings" pinField="accessory" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(Accessories, config.accessory, 'accessory')}
                </section>
                <section>
                  <SectionHead label="Glasses Color" pinField="accessoryColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(AccessoryColors, config.accessoryColor || '#111111', 'accessoryColor')}
                </section>
                <section>
                  <SectionHead label="Hats" pinField="hat" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(Hats, config.hat, 'hat')}
                </section>
                <section>
                  <SectionHead label="Necklaces" pinField="necklace" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(Necklaces, config.necklace, 'necklace')}
                </section>
              </>
            )}

            {activeTab === 'bg' && (
              <section>
                {bgItems.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">No background items in the catalog yet — add them via the admin item builder.</p>
                ) : (
                  <>
                    <SectionHead label="Backgrounds" pinField="backgroundImage" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => update('backgroundImage', '')}
                        className={`aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-medium transition-colors ${
                          !config.backgroundImage ? 'border-white/60 text-white' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
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
                            className={`aspect-square rounded-lg border-2 overflow-hidden relative transition-colors ${
                              selected ? 'border-white/80' : owned ? 'border-zinc-700 hover:border-zinc-400' : 'border-zinc-800'
                            }`}
                            title={bgItem.displayName}
                          >
                            <img src={val} alt={bgItem.displayName} className="w-full h-full object-cover" />
                            {!owned && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <Lock size={14} className="text-yellow-400" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {ownedItems && !isAdmin && (
        <div className="mt-2 flex items-center gap-1 text-[9px] text-zinc-600 shrink-0">
          <Lock size={8} className="text-yellow-400/60" />
          <span className="text-yellow-400/60">Locked</span>
          <span>— preview freely, purchase or receive as a gift to save</span>
        </div>
      )}
    </div>
  );
}
