'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getItemKeyForValue, type AvatarField } from '@/lib/cosmetics-catalog';
import {
  PICKER_ACCESSORIES,
  PICKER_ACCESSORY_COLORS,
  PICKER_EYE_COLORS,
  PICKER_EYE_SHAPES,
  PICKER_FACE_SHAPES,
  PICKER_HAIR_COLORS,
  PICKER_HAIR_STYLES,
  PICKER_HATS,
  PICKER_HAT_COLORS,
  PICKER_LIP_SHAPES,
  PICKER_MOUTH_ACCESSORIES,
  PICKER_MAKEUPS,
  PICKER_FACIAL_HAIRS,
  PICKER_NECKLACES,
  PICKER_SHIRT_COLORS,
  PICKER_SHIRT_STYLES,
  PICKER_SKIN_COLORS,
} from '@/lib/avatar-editor-options';
import { useCatalog } from '@/hooks/use-cosmetics';
import { ColorSwatch } from './ColorSwatch';

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
  const lockId = React.useId();
  const pinned = pinField ? pinnedRandomFields?.has(pinField) : false;
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-1.5' : 'mb-4'}`}>
      <h3 className={`font-semibold text-zinc-400 uppercase tracking-widest min-w-0 ${compact ? 'text-[10px]' : 'text-sm'}`}>
        {label}
      </h3>
      {pinField && onToggleRandomPin && (
        <div className="flex items-center gap-2 shrink-0">
          <Label
            htmlFor={lockId}
            className={`cursor-pointer text-zinc-400 font-medium whitespace-nowrap ${compact ? 'text-[9px]' : 'text-xs'}`}
          >
            Lock Item
          </Label>
          <Switch
            id={lockId}
            checked={pinned}
            onCheckedChange={(next) => {
              if (next !== pinned) onToggleRandomPin(pinField);
            }}
            title={
              pinned
                ? 'Unlock — this part will change on Randomize'
                : 'Lock — keep this part when you Randomize'
            }
            className="touch-manipulation scale-90 sm:scale-100 origin-right"
          />
        </div>
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

  const renderColorGrid = (
    colors: string[],
    activeColor: string,
    field: AvatarField,
    opts?: { emptyMeansNoSwatchSelected?: boolean },
  ) => (
    <div className={`grid ${compact ? 'grid-cols-8 sm:grid-cols-10 gap-1.5' : 'grid-cols-6 sm:grid-cols-7 gap-3'}`}>
      {colors.map(c => {
        const locked = isLocked(field, c);
        const isActive =
          opts?.emptyMeansNoSwatchSelected && !activeColor ? false : activeColor === c;
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
                {renderColorGrid(PICKER_SKIN_COLORS, config.skinColor, 'skinColor')}
              </section>
            )}

            {activeTab === 'hair' && (
              <>
                <section>
                  <SectionHead label="Hair Style" pinField="hairStyle" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_HAIR_STYLES, config.hairStyle, 'hairStyle')}
                </section>
                <section>
                  <SectionHead label="Hair Color" pinField="hairColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(PICKER_HAIR_COLORS, config.hairColor, 'hairColor')}
                </section>
              </>
            )}

            {activeTab === 'eyes' && (
              <>
                <section>
                  <SectionHead label="Eye Shape" pinField="eyeShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_EYE_SHAPES, config.eyeShape, 'eyeShape')}
                </section>
                <section>
                  <SectionHead label="Eye Color" pinField="eyeColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(PICKER_EYE_COLORS, config.eyeColor, 'eyeColor')}
                </section>
              </>
            )}

            {activeTab === 'face' && (
              <>
                <section>
                  <SectionHead label="Face Shape" pinField="faceShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_FACE_SHAPES, config.faceShape, 'faceShape')}
                </section>
                <section>
                  <SectionHead label="Lips" pinField="lipShape" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_LIP_SHAPES, config.lipShape, 'lipShape')}
                </section>
                <section>
                  <SectionHead label="Makeup" pinField="makeup" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_MAKEUPS, config.makeup ?? 'None', 'makeup')}
                </section>
                <section>
                  <SectionHead label="Facial Hair" pinField="facialHair" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_FACIAL_HAIRS, config.facialHair ?? 'None', 'facialHair')}
                </section>
                <section>
                  <SectionHead label="Mouth Accessory" pinField="mouthAccessory" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_MOUTH_ACCESSORIES, config.mouthAccessory, 'mouthAccessory')}
                </section>
              </>
            )}

            {activeTab === 'clothes' && (
              <>
                <section>
                  <SectionHead label="Shirt Color" pinField="shirtColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(PICKER_SHIRT_COLORS, config.shirtColor, 'shirtColor')}
                </section>
                <section>
                  <SectionHead label="Shirt Style" pinField="shirtStyle" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_SHIRT_STYLES, config.shirtStyle || 'Default', 'shirtStyle')}
                </section>
              </>
            )}

            {activeTab === 'acc' && (
              <>
                <section>
                  <SectionHead label="Glasses & Earrings" pinField="accessory" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_ACCESSORIES, config.accessory, 'accessory')}
                </section>
                <section>
                  <SectionHead label="Glasses Color" pinField="accessoryColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderColorGrid(PICKER_ACCESSORY_COLORS, config.accessoryColor || '#111111', 'accessoryColor')}
                </section>
                <section>
                  <SectionHead label="Hats" pinField="hat" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_HATS, config.hat, 'hat')}
                </section>
                <section>
                  <SectionHead label="Hat Color" pinField="hatColor" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  <div className={`flex flex-wrap gap-2 ${compact ? 'mb-1.5' : 'mb-2'}`}>
                    <button
                      type="button"
                      onClick={() => update('hatColor', '')}
                      className={`rounded-lg border text-xs font-medium transition-colors touch-manipulation ${
                        compact ? 'px-2 py-1' : 'px-3 py-1.5'
                      } ${
                        !config.hatColor
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                          : 'border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      Default
                    </button>
                  </div>
                  {renderColorGrid(PICKER_HAT_COLORS, config.hatColor, 'hatColor', {
                    emptyMeansNoSwatchSelected: true,
                  })}
                </section>
                <section>
                  <SectionHead label="Necklaces" pinField="necklace" compact={compact} pinnedRandomFields={pinnedRandomFields} onToggleRandomPin={onToggleRandomPin} />
                  {renderShapeGrid(PICKER_NECKLACES, config.necklace, 'necklace')}
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
